'use strict'

const BaseService = require('../common/base-service');
const path = require('path');
const { StorageType, ImageFormatType } = require("@adobe/photoshop-apis");
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');
const xlsx = require('xlsx');
const { info, error } = require('console');

class PhotoshopBannersAutomationService extends BaseService {
    constructor() {
        super();
        this.outputFormatType = null;
        this.renditionContent = "error";
        this.templateAssetId = null;
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);
        const { 'jcr:uuid': assetId } = await this.executeAEMRequest('GET', 'application/json', 'json', `${this.assetPath}.json`);
        this.templateAssetId = assetId;
        this.outputFormatType = rendition.instructions.outputFormatType || 'image/jpeg';
    }

    createPhotoshopInput(externalUrl) {
        return {
            href: externalUrl,
            storage: StorageType.EXTERNAL
        };
    }

    createPhotoshopOutput(externalUrl, formatType, artboardName = null) {
        const output = {
            href: externalUrl,
            storage: StorageType.EXTERNAL,
            type: formatType
        };

        if (formatType === ImageFormatType.IMAGE_PNG) {
            output.compression = 'large';
        } else if (formatType === ImageFormatType.IMAGE_JPEG) {
            output.quality = 7;
        }

        if (artboardName) {
            output.layers = [{ name: artboardName }];
            output.trimToCanvas = true;
        }

        return output;
    }

    async extractDocumentManifest(inputUrl) {
        const response = await fetch('https://image.adobe.io/pie/psdService/documentManifest', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: [this.createPhotoshopInput(inputUrl)]
            })
        });

        if (!response.ok) {
            throw new Error(`Document manifest extraction failed: ${response.statusText}`);
        }
        const result = await response.json();
        return await this.pollForResults(result['_links'].self.href, { apiType: 'photoshop' });
    }

    async retrieveTextsByLanguage(csvContent) {
        const lines = csvContent.trim().split('\n').filter(line => line);
        const headers = lines[0].split(',').map(header => header.replace(/^"|"$/g, '').trim());

        const data = lines.slice(1).map(line => {
            const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)
                .map(val => val.replace(/^"|"$/g, '').trim());

            return headers.reduce((obj, header, index) => {
                obj[header] = values[index];
                return obj;
            }, {});
        });

        const result = {};

        const dataColumns = headers.filter(header =>
            header !== 'variation' && header !== 'lang'
        );

        data.forEach(row => {
            const variation = row.variation;
            const lang = row.lang;

            result[variation] = result[variation] || {};
            result[variation][lang] = result[variation][lang] || {};

            dataColumns.forEach(column => {
                result[variation][lang][column] = row[column];
            });
        });

        return result;
    }

    async retrieveInputs() {
        const inputsRelativePath = `${this.automationRelativePath}/inputs`;
        const response = await this.executeAEMRequest('GET', 'application/json', 'json', `/api/assets/${inputsRelativePath}.json`);

        const result = {
            fontPaths: [],
            variations: {}
        };

        if (!response.entities?.length) {
            return result;
        }

        const assets = response.entities.filter(entity => entity.class == 'assets/asset');

        for (const asset of assets) {
            const filename = asset.properties.name;
            const fileFormat = asset.properties.metadata['dc:format'];
            const filePath = `${this.getDamRootPath()}${inputsRelativePath}/${filename}`;

            if (/^font\/(otf|ttf)$/.test(fileFormat)) {
                result.fontPaths.push(filePath);
            }

            if ('text/csv' == fileFormat) {
                const csvContent = await this.executeAEMRequest('GET', 'application/json', 'text', filePath);
                const texts = await this.retrieveTextsByLanguage(csvContent);
                for (const [segment, languages] of Object.entries(texts)) {
                    result.variations[segment] ??= {};
                    result.variations[segment].languages = languages;
                }
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

                const texts = await this.retrieveTextsByLanguage(csvContent);
                for (const [segment, languages] of Object.entries(texts)) {
                    result.variations[segment] ??= {};
                    result.variations[segment].languages = languages;
                }
            }

            const filenameParts = filename.split('--');
            if (filenameParts.length == 2) {
                const segment = filenameParts[0];

                result.variations[segment] ??= {};
                result.variations[segment].imagePaths ??= [];

                if (/^image\/(png|jpeg|jpg)$/.test(fileFormat)) {
                    result.variations[segment].imagePaths.push(filePath);
                }
            }
        }

        info(`retrieveInputs [${inputsRelativePath}] ${JSON.stringify(result)}`);
        this.renditionContent = `---- Retrieved Inputs ----\n ${JSON.stringify(result, null, 2)}`;

        return result;
    }

    extractDataFromTemplate(smartObjects, textLayers, layer) {
        for (const subLayer of layer.children) {
            if ('smartObject' == subLayer.type) {
                const [imageName, smartCropName] = subLayer.name.split("|");
                const smartObject = {
                    layerId: subLayer.id,
                    layerName: subLayer.name,
                    imageName: imageName || subLayer.name,
                    ...(smartCropName && { smartCropName })
                };
                smartObjects.push(smartObject);
            } else if ('textLayer' == subLayer.type) {
                const [key = subLayer.name, tracking = 0] = subLayer.name.split("|");
                const textLayer = {
                    layerId: subLayer.id,
                    layerName: subLayer.name,
                    textKey: key,
                    tracking: +tracking
                };
                textLayers.push(textLayer);
            } else {
                if (subLayer.children) {
                    this.extractDataFromTemplate(smartObjects, textLayers, subLayer);
                }
            }
        }
    }

    async resolveDynamicMediaUrl(imagePath, smartCropName) {
        const asset = await this.executeAEMRequest('GET', 'application/json', 'json', `${imagePath}.3.json`);
        const status = asset['jcr:content']['metadata']['dam:status'];

        if (status === 'approved') {
            const timestamp = Date.now();
            const assetId = asset['jcr:uuid'];
            const imageUrl = `${this.aemDeliveryHost}/adobe/assets/urn:aaid:aem:${assetId}/as/image.png?quality=100&smartcrop=${smartCropName}&timestamp=${timestamp}`;
            await this.validateImageUrl(imageUrl);
            return imageUrl;
        }

        const scene7Domain = asset['jcr:content']['metadata']['dam:scene7Domain'];
        const scene7File = asset['jcr:content']['metadata']['dam:scene7File'];
        if (!scene7Domain || !scene7File) {
            throw new Error(`Missing scene7Domain or scene7File properties. Check Dynamic Media is enabled for the folder.`);
        }
        const imageUrl = `${scene7Domain}is/image/${scene7File}:${smartCropName}?qlt=100&fmt=png-alpha&cache=off`;
        await this.validateImageUrl(imageUrl);
        return `${scene7Domain}is/image/${scene7File}:${smartCropName}?qlt=100&fmt=png-alpha&cache=off`;
    }

    async populateFontsOptions(options, fontPaths) {
        options.fonts = [];
        for (const fontPath of fontPaths) {
            const fontUrl = await this.getAssetPresignedUrl(fontPath);
            options.fonts.push(this.createPhotoshopInput(fontUrl));
        }
    }

    async validateImageUrl(imageUrl) {
        const response = await fetch(imageUrl, {
            method: 'HEAD',
            cache: 'no-cache'
        });

        if (!response.ok) {
            throw new Error(`Image URL validation failed - ${imageUrl} not found.`);
        }
    }

    async populateSmartObjectsOptions(options, imagePaths, smartObjects) {
        options.layers = options.layers || [];
        for (const imagePath of imagePaths) {
            const imageBasename = path.parse(imagePath).name.split('--')[1];

            for (const smartObject of smartObjects) {
                if (smartObject.imageName !== imageBasename) continue;

                const baseAssetUrl = await this.getAssetPresignedUrl(imagePath);

                const editLayerUrl = smartObject.smartCropName
                    ? await this.resolveDynamicMediaUrl(imagePath, smartObject.smartCropName)
                    : baseAssetUrl;

                options.layers.push({
                    id: smartObject.layerId,
                    edit: {},
                    input: this.createPhotoshopInput(editLayerUrl)
                });
            }
        }
    }

    async populateTextsOptions(options, languageContent, textLayers) {
        options.layers = options.layers || [];
        for (const [textKey, textValue] of Object.entries(languageContent)) {
            for (const textLayer of textLayers) {
                if (textLayer.textKey === textKey) {
                    options.layers.push({
                        id: textLayer.layerId,
                        text: {
                            content: textValue,
                            characterStyles: [{
                                tracking: textLayer.tracking
                            }]
                        }
                    });
                }
            }
        }
    }

    async generateAssets(inputUrl, documentManifest, outputFolderPath, variationName, fontPaths, imagePaths, languageName, languageContent) {
        const layers = documentManifest.outputs?.[0]?.layers;
        if (!layers) {
            throw new Error(`No layers found in document manifest. Ensure the PSD template contains artboard layers.`);
        }
        const variationOutputFilename = `${variationName}-${languageName}.psd`;

        const tempPsdUrl = await this.generatePresignURL();
        const aemUploads = [{ presignedUrl: tempPsdUrl, filename: variationOutputFilename }];
        const photoshopOutputs = [this.createPhotoshopOutput(tempPsdUrl, ImageFormatType.IMAGE_VND_ADOBE_PHOTOSHOP)];

        const smartObjects = [];
        const textLayers = [];

        for (const layer of layers) {
            const fileExtension = this.outputFormatType === ImageFormatType.IMAGE_PNG ? 'png' : 'jpeg';
            const renditionFilename = `${variationName}-${layer.name}-${languageName}.${fileExtension}`;

            const tempImageUrl = await this.generatePresignURL();
            aemUploads.push({presignedUrl: tempImageUrl, filename: renditionFilename});

            photoshopOutputs.push(this.createPhotoshopOutput(tempImageUrl, this.outputFormatType, layer.name));

            this.extractDataFromTemplate(smartObjects, textLayers, layer);
        }

        const photoshopOptions = {};
        await this.populateFontsOptions(photoshopOptions, fontPaths);
        await this.populateSmartObjectsOptions(photoshopOptions, imagePaths, smartObjects);

        this.renditionContent += `\n ---- photoshopOptions for variation ${variationName} and language ${languageName} ----\n ${JSON.stringify(photoshopOptions, null, 2)}`;

        const documentOperationsResponse = await fetch('https://image.adobe.io/pie/psdService/documentOperations', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: [this.createPhotoshopInput(inputUrl)],
                options: photoshopOptions,
                outputs: [this.createPhotoshopOutput(tempPsdUrl, ImageFormatType.IMAGE_VND_ADOBE_PHOTOSHOP)]
            })
        });
        if (!documentOperationsResponse.ok) {
            throw new Error(`Document operations failed: ${documentOperationsResponse.statusText}`);
        }
        const documentOperationsResult = await documentOperationsResponse.json();
        await this.pollForResults(documentOperationsResult['_links'].self.href, { apiType: 'photoshop' });

        const textOptions = {};
        await this.populateTextsOptions(textOptions, languageContent, textLayers);
        await this.populateFontsOptions(textOptions, fontPaths);

        this.renditionContent += `\n ---- textOptions for variation ${variationName} and language ${languageName} ----\n ${JSON.stringify(textOptions, null, 2)}`;

        const textResponse = await fetch('https://image.adobe.io/pie/psdService/text', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: [this.createPhotoshopInput(tempPsdUrl)],
                options: textOptions,
                outputs: photoshopOutputs
            })
        });

        if (!textResponse.ok) {
            throw new Error(`Text editing failed: ${textResponse.statusText}`);
        }
        const textResult = await textResponse.json();
        await this.pollForResults(textResult['_links'].self.href, { apiType: 'photoshop' });

        await Promise.all(aemUploads.map(({presignedUrl, filename}) => this.uploadFileToAEM(presignedUrl, outputFolderPath, filename)));
    }

    validateInputs(inputs) {
        const variations = inputs.variations;

        Object.entries(variations).forEach(([variationName, variation]) => {
            if (!variation.imagePaths || !Array.isArray(variation.imagePaths) || variation.imagePaths.length === 0) {
                throw new Error(`Variation "${variationName}" must have at least one image`);
            }

            if (!variation.languages || typeof variation.languages !== 'object' || Object.keys(variation.languages).length === 0) {
                throw new Error(`Variation "${variationName}" must have at least one language`);
            }
        });
    }

    async executeAutomation() {
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}/outputs`;
        const inputUrl = await this.getAssetPresignedUrl(this.assetPath);
        const documentManifest = await this.extractDocumentManifest(inputUrl);
        const inputs = await this.retrieveInputs();
        this.validateInputs(inputs);

        const generationPromises = [];

        for (const [variationName, variationContent] of Object.entries(inputs.variations)) {
            for (const [languageName, languageContent] of Object.entries(variationContent.languages)) {
                generationPromises.push(
                    this.generateAssets(
                        inputUrl,
                        documentManifest,
                        outputFolderPath,
                        variationName,
                        inputs.fontPaths,
                        variationContent.imagePaths,
                        languageName,
                        languageContent
                    )
                );
            }
        }

        await Promise.all(generationPromises);

        return { renditionContent: this.renditionContent };
    }

    getActionDisplayName() {
        return 'Photoshop Banners Automation';
    }
}

async function execute(rendition, params) {
    const service = new PhotoshopBannersAutomationService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
