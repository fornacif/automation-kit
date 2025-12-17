'use strict'

const BaseService = require('../common/base-service');
const path = require('path');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');
const fs = require("fs");
const xlsx = require('xlsx');

class InDesignBannersAutomationService extends BaseService {
    constructor() {
        super();
        this.outputFormatType = null;
        this.resolution = null;
        this.renditionContent = 'error';
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);
        this.outputFormatType = rendition.instructions.outputFormatType || 'application/pdf';
        this.resolution = rendition.instructions.resolution || 300;
    }

    async parseCsvAndBuildPresignedUrl(csvContent) {
        const rows = csvContent.trim().split('\n');
        const dataRows = rows.slice(1);

        const rowElements = dataRows.map(row => {
            const columns = row.split(',');

            return {
                variation: columns[0].replace(/^"|"$/g, ''),
                lang: columns[1].replace(/^"|"$/g, '')
            };
        });

        const datasourcePresignedUrl = await this.generatePresignURL();

        const tempPath = uuid4();
        fs.writeFileSync(tempPath, csvContent, 'utf16le');

        await uploadFileConcurrently(tempPath, datasourcePresignedUrl);

        this.files.delete(tempPath);

        return { datasourcePresignedUrl, rowElements };
    }

    async retrieveInputs() {
        const inputsRelativePath = `${this.automationRelativePath}/inputs`;
        const response = await this.executeAEMRequest('GET', 'application/json', 'json', `/api/assets/${inputsRelativePath}.json`);

        const inputs = {
            fontPaths: [],
            imagePaths: []
        };

        if (!response.entities?.length) {
            return inputs;
        }

        const assets = response.entities.filter(entity => entity.class == 'assets/asset');

        for (const asset of assets) {
            const filename = asset.properties.name;
            const fileFormat = asset.properties.metadata['dc:format'];
            const filePath = `${this.getDamRootPath()}${inputsRelativePath}/${filename}`;

            if (/^font\/(otf|ttf)$/.test(fileFormat)) {
                inputs.fontPaths.push(filePath);
            }

            if (/^image\/.*$/.test(fileFormat)) {
                inputs.imagePaths.push(filePath);
            }

            if ('text/csv' == fileFormat) {
                const csvContent = await this.executeAEMRequest('GET', 'application/json', 'text', filePath);

                const { datasourcePresignedUrl, rowElements } = await this.parseCsvAndBuildPresignedUrl(csvContent);
                inputs.datasourcePresignedUrl = datasourcePresignedUrl;
                inputs.rowElements = rowElements;
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
                const csvContent = xlsx.utils.sheet_to_csv(worksheet, { forceQuotes: true });

                const { datasourcePresignedUrl, rowElements } = await this.parseCsvAndBuildPresignedUrl(csvContent);
                inputs.datasourcePresignedUrl = datasourcePresignedUrl;
                inputs.rowElements = rowElements;
            }
        }

        this.renditionContent = `---- Retrieved Inputs ----\n ${JSON.stringify(inputs, null, 2)}`;

        return inputs;
    }

    buildRequestOptions(data) {
        const options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.inDesignApiAccessToken}`,
                'x-api-key': this.inDesignApiKey
            }
        };

        if (data) {
            options.method = 'POST',
            options.body = JSON.stringify(data);
        }

        return options;
    }

    async buildSourceAssets(inputs, data) {
        for (const imagePath of inputs.imagePaths) {
            const imageBasename = path.parse(imagePath).base;
            const imageSourcePresignedUrl = await this.getAssetPresignedUrl(imagePath);
            data.assets.push({
                source: {
                    url: imageSourcePresignedUrl
                },
                destination: imageBasename
            });
        }

        for (const fontPath of inputs.fontPaths) {
            const fontBasename = path.parse(fontPath).base;
            const fontPresignedUrl = await this.getAssetPresignedUrl(fontPath);
            data.assets.push({
                source: {
                    url: fontPresignedUrl
                },
                destination: `fontFolder/${fontBasename}`
            });
        }
    }

    async mergeData(outputPresignedUrl, outputFolderPath, inputs) {
        const templatePresignedUrl = await this.getAssetPresignedUrl(this.assetPath);

        const data = {
            assets: [
                {
                    source: {
                        url: templatePresignedUrl
                    },
                    destination: 'destination.indd'
                },
                {
                    source: {
                        url: inputs.datasourcePresignedUrl
                    },
                    destination: 'datasource.csv'
                }
            ],
            params: {
                outputMediaType: 'application/x-indesign',
                targetDocument: 'destination.indd',
                outputFolderPath: 'outputfolder',
                outputFileBaseString: 'merged-template',
                dataSource: 'datasource.csv',
                imagePlacementOptions: {
                    fittingOption: 'content_aware_fit'
                },
                generalSettings: {
                    fonts: {
                        fontsDirectories: ['fontFolder']
                    }
                }
            },
            outputs: [
                {
                    destination: {
                        url: outputPresignedUrl
                    },
                    source: 'outputfolder/range1/merged-template.indd'
                }
            ]
        };

        await this.buildSourceAssets(inputs, data);

        const options = this.buildRequestOptions(data);

        this.renditionContent += '---- Retrieved Inputs for Merge Data ----\n' + JSON.stringify(data, null, 2);

        const response = await fetch(`https://indesign.adobe.io/v3/merge-data`, options);

        if (response.ok) {
            const result = await response.json();

            const assetFilename = path.parse(this.assetPath).name;
            await this.uploadFileToAEM(outputPresignedUrl, outputFolderPath, `${assetFilename}-merged.indd`);

            const resultStatus = await this.pollForResults(result.statusUrl, { apiType: 'indesign' });
            this.createAEMTask('InDesign Banners Automation', `Merge Data produced the following warnings.\n${JSON.stringify(resultStatus.data.warnings, null, 2).replace(/"/g, '').replace(/'/g, "")}`);

            const recordIndex = resultStatus.data.records[0].recordIndex;
            const recordIndexBounds = recordIndex.split("-");

            return recordIndexBounds;
        } else {
            throw new Error(`Error merging data: ${response.statusText}`);
        }
    }

    async createRendition(inputPresignedUrl, recordIndexBounds, outputFolderPath, inputs) {
        const data = {
            assets: [{
                source: {
                    url: inputPresignedUrl
                },
                destination: 'destination.indd'
            }],
            params: {
                outputMediaType: this.outputFormatType,
                targetDocuments: ['destination.indd'],
                outputFileBaseString: 'merged',
                outputFolderPath: 'outputfolder',
                quality: 'maximum',
                resolution: this.resolution,
                createSeparateFiles: true,
                generalSettings: {
                    fonts: {
                        fontsDirectories: ['fontFolder']
                    }
                }
            },
            outputs: []
        };

        const formatMap = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'application/pdf': 'pdf'
        };

        let fileExtension = formatMap[this.outputFormatType];

        const outputs = [];

        for (let i = recordIndexBounds[0]; i <= recordIndexBounds[1]; i++) {
            if (!fileExtension) {
                throw new Error(`Unsupported output format: ${this.outputFormatType}`);
            }

            const outputPresignedUrl = await this.generatePresignURL();
            outputs.push({outputPresignedUrl: outputPresignedUrl, filename: `merged-${i}.${fileExtension}`});

            let fileName = fileExtension === 'pdf'
                ? `merged/merged_${i.toString().padStart(2, '0')}.${fileExtension}`
                : `merged${i > 1 ? i : ''}.${fileExtension}`;

            data.outputs.push({
                destination: {
                    url: outputPresignedUrl
                },
                source: `outputfolder/${fileName}`
            });
        }

        await this.buildSourceAssets(inputs, data);

        const options = this.buildRequestOptions(data);

        this.renditionContent += '---- Retrieved Inputs for Create Rendition ----\n' + JSON.stringify(data, null, 2);

        const response = await fetch(`https://indesign.adobe.io/v3/create-rendition`, options);

        if (response.ok) {
            const promises = [];

            const result = await response.json();
            const resultStatus = await this.pollForResults(result.statusUrl, { apiType: 'indesign' });

            this.createAEMTask('INDD Automation', `Create Rendition produced the following warnings.\n${JSON.stringify(resultStatus.data.outputs[0].warnings, null, 2).replace(/"/g, '').replace(/'/g, "")}`);

            for (let i = 0; i < outputs.length; i++) {
                const assetFilename = path.parse(this.assetPath).name;
                const filename = `${assetFilename}-${inputs.rowElements[i].variation}-${inputs.rowElements[i].lang}.${fileExtension}`;
                const promise = this.uploadFileToAEM(outputs[i].outputPresignedUrl, outputFolderPath, filename);
                promises.push(promise);
            }
            await Promise.all(promises);
        } else {
            throw new Error(`Error creating renditions: ${response.statusText}`);
        }
    }

    async executeAutomation() {
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}/outputs`;
        const tempPresignedUrl = await this.generatePresignURL();

        const inputs = await this.retrieveInputs();

        const recordIndexBounds = await this.mergeData(tempPresignedUrl, outputFolderPath, inputs);
        await this.createRendition(tempPresignedUrl, recordIndexBounds, outputFolderPath, inputs);

        return { renditionContent: this.renditionContent };
    }

    getActionDisplayName() {
        return 'InDesign Banners Automation';
    }
}

async function execute(rendition, params) {
    const service = new InDesignBannersAutomationService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
