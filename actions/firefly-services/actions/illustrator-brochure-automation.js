'use strict'

const BaseService = require('../common/base-service');
const path = require('path');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');
const fs = require("fs");
const xlsx = require('xlsx');

class IllustratorBannersAutomationService extends BaseService {
    constructor() {
        super();
        this.outputFormatType = null;
        this.renditionContent = 'error';
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);
        this.outputFormatType = rendition.instructions.outputFormatType || 'application/pdf';
    }

    async parseCsvAndBuildPresignedUrl(csvContent, imageUrlMap) {
        const rows = csvContent.trim().split('\n');
        const headers = rows[0].split(',').map(h => h.replace(/^"|"$/g, ''));
        const dataRows = rows.slice(1);

        const imageColIndexes = headers
            .map((h, i) => h.startsWith('@') ? i : -1)
            .filter(i => i !== -1);

        const processedRows = [rows[0]];
        const rowElements = dataRows.map(row => {
            const columns = row.split(',');

            for (const colIdx of imageColIndexes) {
                const filename = columns[colIdx]?.replace(/^"|"$/g, '').trim();
                if (filename && imageUrlMap[filename]) {
                    columns[colIdx] = `"${imageUrlMap[filename]}"`;
                }
            }

            processedRows.push(columns.join(','));

            return {
                variation: columns[0].replace(/^"|"$/g, ''),
                lang: columns[1].replace(/^"|"$/g, '')
            };
        });

        const processedCsv = processedRows.join('\n');
        const datasourcePresignedUrl = await this.generatePresignURL();
        const tempPath = uuid4();
        fs.writeFileSync(tempPath, processedCsv, 'utf8');
        await uploadFileConcurrently(tempPath, datasourcePresignedUrl);
        this.files.delete(tempPath);

        return { datasourcePresignedUrl, rowElements };
    }

    async retrieveInputs() {
        const inputsRelativePath = `${this.automationRelativePath}/inputs`;
        const response = await this.executeAEMRequest('GET', 'application/json', 'json', `/api/assets/${inputsRelativePath}.json`);

        const inputs = { fontPaths: [] };

        if (!response.entities?.length) {
            return inputs;
        }

        const assets = response.entities.filter(entity => entity.class == 'assets/asset');

        const imageUrlMap = {};
        let csvContent = null;
        let csvSource = null;

        for (const asset of assets) {
            const filename = asset.properties.name;
            const fileFormat = asset.properties.metadata['dc:format'];
            const filePath = `${this.getDamRootPath()}${inputsRelativePath}/${filename}`;

            if (/^font\/(otf|ttf)$/.test(fileFormat)) {
                inputs.fontPaths.push(filePath);
            }

            if (/^image\/.*$/.test(fileFormat)) {
                const presignedUrl = await this.getAssetPresignedUrl(filePath);
                imageUrlMap[filename] = presignedUrl;
            }

            if ('text/csv' == fileFormat) {
                csvContent = await this.executeAEMRequest('GET', 'application/json', 'text', filePath);
            }

            if ('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' == fileFormat) {
                const generatedId = uuid4();
                const xlsxFilePath = `${generatedId}/temp.xlsx`;
                await downloadFileConcurrently(
                    `${this.aemAuthorHost}/${filePath}`,
                    xlsxFilePath,
                    {
                        mkdirs: true,
                        headers: { Authorization: `Bearer ${this.aemAccessToken}` }
                    }
                );
                const workbook = xlsx.readFile(xlsxFilePath);
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                csvContent = xlsx.utils.sheet_to_csv(worksheet, { forceQuotes: true });
            }
        }

        if (csvContent) {
            const { datasourcePresignedUrl, rowElements } = await this.parseCsvAndBuildPresignedUrl(csvContent, imageUrlMap);
            inputs.datasourcePresignedUrl = datasourcePresignedUrl;
            inputs.rowElements = rowElements;
        }

        this.renditionContent = `---- Retrieved Inputs ----\n ${JSON.stringify(inputs, null, 2)}`;

        return inputs;
    }

    async mergeData(outputFolderPath, inputs) {
        const formatMap = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'application/pdf': 'pdf',
            'image/svg+xml': 'svg',
            'application/illustrator': 'ai',
            'application/eps': 'eps'
        };

        const fileExtension = formatMap[this.outputFormatType];
        if (!fileExtension) {
            throw new Error(`Unsupported output format: ${this.outputFormatType}`);
        }

        const templatePresignedUrl = await this.getAssetPresignedUrl(this.assetPath);
        const assetFilename = path.parse(this.assetPath).name;

        const data = {
            data: {
                source: { url: inputs.datasourcePresignedUrl }
            },
            template: {
                source: { url: templatePresignedUrl }
            },
            output: {
                fileName: `${assetFilename}-output.${fileExtension}`,
                mediaType: this.outputFormatType
            },
            settings: {
                fontSettings: {
                    fallBackFont: 'Poppins-Regular'
                }
            }
        };

        if (inputs.fontPaths.length > 0) {
            data.fontFiles = [];
            for (const fontPath of inputs.fontPaths) {
                const fontPresignedUrl = await this.getAssetPresignedUrl(fontPath);
                const fontExt = path.extname(fontPath).slice(1).toLowerCase();
                data.fontFiles.push({
                    source: { url: fontPresignedUrl },
                    mediaType: `font/${fontExt}`
                });
            }
        }


        this.renditionContent += '---- Merge Data Request ----\n' + JSON.stringify(data, null, 2);

        const response = await fetch('https://illustrator-api.adobe.io/v1/merge-data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId
            },
            body: JSON.stringify(data)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Error merging data: ${response.statusText} - ${errorBody}`);
        }

        const result = await response.json();
        const resultStatus = await this.pollForResults(result.statusUrl, { apiType: 'illustrator' });

        if (resultStatus.status === 'partially_succeeded') {
            this.createAEMTask('Illustrator Brochure Automation',
                `Data merge partially succeeded.\nErrors:\n${JSON.stringify(resultStatus.errors, null, 2).replace(/"/g, '').replace(/'/g, "")}`);
        }

        const promises = [];
        for (const output of resultStatus.outputs) {
            const rowElement = inputs.rowElements?.[output.row - 1];
            const filename = rowElement
                ? `${assetFilename}-${rowElement.variation}-${rowElement.lang}.${fileExtension}`
                : `${assetFilename}-row${output.row}.${fileExtension}`;
            promises.push(this.uploadFileToAEM(output.destination.url, outputFolderPath, filename));
        }
        await Promise.all(promises);
    }

    async executeAutomation() {
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}/outputs`;

        const inputs = await this.retrieveInputs();
        await this.mergeData(outputFolderPath, inputs);

        return { renditionContent: this.renditionContent };
    }

    getActionDisplayName() {
        return 'Illustrator Brochure Automation';
    }
}

async function execute(rendition, params) {
    const service = new IllustratorBannersAutomationService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
