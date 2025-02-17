'use strict'

const { worker } = require('@adobe/asset-compute-sdk');
const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const path = require('path');
const { ServerToServerTokenProvider } = require("@adobe/firefly-services-common-apis");
const { PhotoshopClient, StorageType, ImageFormatType } = require("@adobe/photoshop-apis");
const filesLib = require('@adobe/aio-lib-files');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');
var fs = require("fs");
const DirectBinary = require('@adobe/aem-upload');

// Constants
const DAM_ROOT_PATH = '/content/dam/';
const DEFAULT_EXPIRY_SECONDS = 180;
const DEFAULT_FILE_PERMISSIONS = 'rwd';

class AutomationService {
    constructor() {
        this.aemAuthorHost = null;
        this.aemDeliveryHost = null;
        this.aemAccessToken = null;
        this.assetPath = null;
        this.assetOwnerId = null;
        this.outputFormatType = null;
        this.automationRelativePath = null;
        this.directBinaryAccess = null;
        this.photoshopClient = null;
        this.files = null;
        this.renditionContent = null;
    }

    static async create(rendition, params) { 
        const service = new AutomationService();
        await service.initialize(rendition, params);
        return service;
    }

    async initialize(rendition, params) {
        const certificate = JSON.parse(rendition.instructions.certificate ?? params.aemCertificate);
        const fireflyServicesConfig = this.getFireflyServicesConfig(params);
        
        this.photoshopClient = new PhotoshopClient(fireflyServicesConfig);
        this.aemAuthorHost = this.getAemHost(certificate, 'author');
        this.aemDeliveryHost = this.getAemHost(certificate, 'delivery');
        this.aemAccessToken = (await aemApiClientLib(certificate)).access_token;
        this.assetPath = rendition.instructions.userData.assetPath;
        const { 'jcr:uuid': assetId, 'jcr:createdBy': ownerId }  = await this.executeAEMRequest('GET', 'application/json', 'json', `${this.assetPath}.json`);
        this.templateAssetId = assetId;
        this.assetOwnerId = ownerId;
        this.automationRelativePath = path.dirname(this.assetPath).replace(DAM_ROOT_PATH, '');
        this.outputFormatType = rendition.instructions.outputFormatType;
        this.directBinaryAccess = rendition.instructions.directBinaryAccess;
        this.files = await filesLib.init();
    }

    getAemHost(certificate, type) {
        const clientIdParts = certificate.integration.technicalAccount.clientId.split('-');
        return `https://${type}-${clientIdParts[1]}-${clientIdParts[2]}.adobeaemcloud.com`;
    }

    getFireflyServicesConfig(params) {
        const authProvider = new ServerToServerTokenProvider({
            clientId: params.fireflyServicesApiClientId,
            clientSecret: params.fireflyServicesApiClientSecret,
            scopes: params.fireflyServicesApiScopes
        }, {
            autoRefresh: true
        });

        return {
            tokenProvider: authProvider,
            clientId: params.fireflyServicesApiClientId,
        };
    }

    async executeAEMRequest(method, contentType, resultType, path, params = {}) {
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${this.aemAccessToken}`,
                'Content-Type': contentType
            }
        };

        if (contentType === 'application/json') {
            if (method === 'GET') {
                path += '?' + new URLSearchParams(params).toString();
            } else {
                options.body = JSON.stringify(params);
            }
        } else if (contentType === 'application/x-www-form-urlencoded' && method === 'POST') {
            options.body = new URLSearchParams(params);
        }

        const response = await fetch(`${this.aemAuthorHost}${path}`, options);
        if (!response.ok) {
            throw new Error(`AEM request failed: ${response.statusText}`);
        }

        switch (resultType) {
            case 'text': return await response.text();
            case 'json': return await response.json();
            default: new Error(`AEM request failed: invalid result type ${resultType}`);
        }
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
        return await this.photoshopClient.getDocumentManifest({
            inputs: [this.createPhotoshopInput(inputUrl)]
        });
    }

    async retrieveTextsByLanguage(filePath) {
        const csvContent = await this.executeAEMRequest('GET', 'application/json', 'text', filePath);
        
        const lines = csvContent.trim().split('\n').filter(line => line);
        const headers = lines[0].split(',').map(header => header.trim());
        
        const data = lines.slice(1).map(line => {
            const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g)
                .map(val => val.replace(/^"|"$/g, '').trim());
                
            return headers.reduce((obj, header, index) => {
                obj[header] = values[index];
                return obj;
            }, {});
        });

        // Create grouped result
        const result = {};

        data.forEach(row => {
            // Split variations and languages
            const variations = row.variation.split('|');
            const languages = row.lang.split('|');
            
            variations.forEach(variation => {
                result[variation] = result[variation] || {};
                
                languages.forEach(lang => {
                    result[variation][lang] = result[variation][lang] || {};
                    result[variation][lang][row.key] = row.value;
                });
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
    
        // Return early if no entities
        if (!response.entities?.length) {
            return result;
        }

        const assets = response.entities.filter(entity => entity.class == 'assets/asset');
            
        for (const asset of assets) {
            const filename = asset.properties.name;
            const fileFormat = asset.properties.metadata['dc:format'];
            const filePath = `${DAM_ROOT_PATH}${inputsRelativePath}/${filename}`;

            if (/^font\/(otf|ttf)$/.test(fileFormat)) {
                result.fontPaths.push(filePath);  
            }

            if ('text/csv' == fileFormat) {
                const texts = await this.retrieveTextsByLanguage(filePath);
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
        };
    
        console.info(`retrieveInputs [${inputsRelativePath}] ${JSON.stringify(result)}`);
        this.renditionContent = `---- Retrieved Inputs ----\n ${JSON.stringify(result, null, 2)}`;
        
        return result;   
    }

    async uploadFileToAEM(presignedUrl, outputFolderPath, fileName) {
        const generatedId = uuid4();
        const filePath = `${generatedId}/temp`;

        try {
            await downloadFileConcurrently(
                presignedUrl,
                filePath,
                {
                    mkdirs: true
                }
            );

            var stats = fs.statSync(filePath)
            var fileSizeInBytes = stats.size;

            const uploadFiles = [
                {
                    fileName: fileName,
                    fileSize: fileSizeInBytes,
                    filePath: filePath
                }
            ];

            const targetUrl = `${this.aemAuthorHost}${outputFolderPath}`;

            const upload = new DirectBinary.DirectBinaryUpload();
            const options = new DirectBinary.DirectBinaryUploadOptions()
                .withUrl(targetUrl)
                .withHttpOptions({
                    headers: {
                        Authorization: `Bearer ${this.aemAccessToken}`
                    }
                })
                .withUploadFiles(uploadFiles);

            await upload.uploadFiles(options);
        } finally {
            await this.files.delete(`${generatedId}/`);
        }
    }

    async getAssetPresignedUrl(assetPath) {
        if (this.directBinaryAccess === 'true') {
            return await this.executeAEMRequest('GET', 'application/json', 'text', '/bin/dbauri', { assetPath });
        }

        const generatedId = uuid4();
        const filePath = `${generatedId}/temp`;

        try {
            await downloadFileConcurrently(
                `${this.aemAuthorHost}/${assetPath}`,
                filePath,
                {
                    mkdirs: true,
                    headers: { Authorization: `Bearer ${this.aemAccessToken}` }
                }
            );

            const presignedUrl = await this.files.generatePresignURL(generatedId, {
                expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
                permissions: DEFAULT_FILE_PERMISSIONS
            });

            await uploadFileConcurrently(filePath, presignedUrl);
            return presignedUrl;
        } finally {
            await this.files.delete(`${generatedId}/`);
        }
    }

    extractDataFromTemplate(smartObjects, textLayers, layer) {
        for (const subLayer of layer.children) {
            if ('smartObject' == subLayer.type) {
                const layerNameParts = subLayer.name.split("--");
                let smartObject;
                if (layerNameParts.length == 1) {
                    smartObject = {
                        layerId: subLayer.id,
                        imageName: subLayer.name
                    };
                } else {
                    smartObject = {
                        layerName: subLayer.name,
                        layerId: subLayer.id,
                        imageName: layerNameParts[0],
                        smartCropName: layerNameParts[1]
                    };
                }
                smartObjects.push(smartObject)
            } else if ('textLayer' == subLayer.type) {
                const layerName = {
                    layerName: subLayer.name,
                    layerId: subLayer.id
                };
                textLayers.push(layerName);
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

                const layer = {
                    id: smartObject.layerId,
                    edit: {}
                };

                if (smartObject.smartCropName) {
                    const imageUrl = await this.resolveDynamicMediaUrl(imagePath, smartObject.smartCropName);
                    layer.input = this.createPhotoshopInput(imageUrl);
                } else {
                    const imageUrl = await this.getAssetPresignedUrl(imagePath);
                    layer.input = this.createPhotoshopInput(imageUrl);
                }

                options.layers.push(layer);
            }
        }
    }

    async populateTextsOptions(options, languageContent, textLayers) {
        options.layers = options.layers || [];
        for (const [textKey, textValue] of Object.entries(languageContent)) {
            let textContent = textValue;
            let textOptions = [0];

            const regex = /(.*)(\[.*\])/g;
            const matches = regex.exec(textValue);
            if (matches) {
                textContent = matches[1];
                textOptions = JSON.parse(matches[2]);
            }

            for (const textLayer of textLayers) {
                if (textLayer.layerName === textKey) {
                    options.layers.push({
                        id: textLayer.layerId,
                        text: {
                            content: textContent,
                            characterStyles: [{
                                tracking: textOptions[0]
                            }]
                        }
                    });
                }
            }
        }
    }

    async generatePresignURL() {
        const tempId = uuid4();
        return await this.files.generatePresignURL(tempId, {
            expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
            permissions: DEFAULT_FILE_PERMISSIONS
        });
    }

    async generateAssets(inputUrl, documentManifest, outputFolderPath, variationName, fontPaths, imagePaths, languageName, languageContent) {
        const layers = documentManifest.result.outputs[0].layers;
        const variationOutputFilename = `${variationName}-${languageName}.psd`;

        // Create temporary file for intermediate processing
        const tempPsdUrl = await this.generatePresignURL();
        const aemUploads = [{ presignedUrl: tempPsdUrl, filename: variationOutputFilename }];
        const photoshopOutputs = [this.createPhotoshopOutput(tempPsdUrl, ImageFormatType.IMAGE_VND_ADOBE_PHOTOSHOP)];

        const smartObjects = [];
        const textLayers = [];

        // Prepare uploads for each artboard and extract PSD data from template
        for (const layer of layers) {
            const fileExtension = this.outputFormatType === ImageFormatType.IMAGE_PNG ? 'png' : 'jpeg';
            const renditionFilename = `${variationName}-${layer.name}-${languageName}.${fileExtension}`;
            
            const tempImageUrl = await this.generatePresignURL();
            aemUploads.push({presignedUrl: tempImageUrl, filename: renditionFilename});

            photoshopOutputs.push(this.createPhotoshopOutput(tempImageUrl, this.outputFormatType, layer.name));

            this.extractDataFromTemplate(smartObjects, textLayers, layer);
        }
        
        // Prepare initial options
        const photoshopOptions = {};
        await this.populateFontsOptions(photoshopOptions, fontPaths);
        await this.populateSmartObjectsOptions(photoshopOptions, imagePaths, smartObjects);

        this.renditionContent += `\n ---- photoshopOptions for variation ${variationName} ----\n ${JSON.stringify(photoshopOptions, null, 2)}`;
 
        // First phase: Modify document with smart objects
        await this.photoshopClient.modifyDocument({
            inputs: [this.createPhotoshopInput(inputUrl)],
            options: photoshopOptions,
            outputs: [this.createPhotoshopOutput(tempPsdUrl, ImageFormatType.IMAGE_VND_ADOBE_PHOTOSHOP)]
        });

        // Second phase: Edit text layers
        const textOptions = {};
        await this.populateTextsOptions(textOptions, languageContent, textLayers);
        await this.populateFontsOptions(textOptions, fontPaths);

        this.renditionContent += `\n ---- textOptions for variation ${variationName} ----\n ${JSON.stringify(textOptions, null, 2)}`;

        await this.photoshopClient.editTextLayer({
            inputs: [this.createPhotoshopInput(tempPsdUrl)],
            options: textOptions,
            outputs: photoshopOutputs
        });

        // Perform all AEM uploads
        await Promise.all(aemUploads.map(({presignedUrl, filename}) => this.uploadFileToAEM(presignedUrl, outputFolderPath, filename)));
    }

    validateInputs(inputs) {
        const variations = inputs.variations;
     
        Object.entries(variations).forEach(([variationName, variation]) => {
            // Check if imagePaths exists and has at least one element
            if (!variation.imagePaths || !Array.isArray(variation.imagePaths) || variation.imagePaths.length === 0) {
                throw new Error(`Variation "${variationName}" must have at least one image`);
            }
     
            // Check if languages exists and has at least one language object
            if (!variation.languages || typeof variation.languages !== 'object' || Object.keys(variation.languages).length === 0) {
                throw new Error(`Variation "${variationName}" must have at least one language`);
            }
        });     
    }

    async executeAutomation() {
        const outputFolderPath = `${DAM_ROOT_PATH}${this.automationRelativePath}/outputs`;
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
    }

    async createAEMRendition(path) {
        await this.files.write('inputs.json', this.renditionContent)
        await this.files.copy('inputs.json', path, { localDest: true });
    }

    async createAEMTask(name, description) {
        const params = {
            name,
            description,
            ':operation': 'addTask',
            contentPath: this.assetPath,
            ownerId: this.assetOwnerId
        };
        await this.executeAEMRequest('POST', 'application/json', 'json', '/libs/granite/taskmanager/createtask', params);
    }
}

// Main worker function
exports.main = worker(async (source, rendition, params) => {
    let service;
    let executionDescription;
    const startTime = performance.now();

    try {
        service = await AutomationService.create(rendition, params);
        process.on('unhandledRejection', (error) => {
            console.error(error);
        });

        await service.executeAutomation();

        await service.createAEMRendition(rendition.path);
        
        const durationSeconds = Math.round((performance.now() - startTime) / 1000);
        executionDescription = `Execution succeeded in ${durationSeconds} seconds`;
    } catch (error) {
        console.error(error);
        executionDescription = `Execution failed: ${error.stack.replace(/"|'/g, '')}`;
        throw error;
    } finally {
        if (service) {
            await service.createAEMTask('PSD Automation', executionDescription);
        }
    }
});