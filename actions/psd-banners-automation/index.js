'use strict'

const { worker } = require('@adobe/asset-compute-sdk');
const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const path = require('path');
const filesLib = require('@adobe/aio-lib-files');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');
var fs = require("fs");
const DirectBinary = require('@adobe/aem-upload');
const xlsx = require('xlsx');

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
        this.fireflyServicesClientId = null;
        this.fireflyServicesToken = null;
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
        this.fireflyServicesClientId = params.fireflyServicesApiClientId;
        this.fireflyServicesToken = await this.getFireflyServicesToken(params);
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

    async getFireflyServicesToken(params) {
        const response = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                'grant_type': 'client_credentials',
                'client_id': params.fireflyServicesApiClientId,
                'client_secret': params.fireflyServicesApiClientSecret,
                'scope': 'openid,AdobeID,read_organizations'
                })
            });

        if (!response.ok) {
            throw new Error(`Failed to get Firefly services token: ${response.statusText}`);
        }

        const data = await response.json();
        return data.access_token;
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

    async waitBeforeContinue(time) {
        const delay = ms => new Promise(res => setTimeout(res, ms));
        await delay(time);
    }

    async fetchResultStatus(url) {
        const options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId
            }
        };
      
        const response = await fetch(url, options)
        
        if (response.ok) {     
            const resultStatus = await response.json();
            if (['pending', 'starting', 'running'].includes(resultStatus.outputs[0].status)) {
                await this.waitBeforeContinue(1000);
                return await this.fetchResultStatus(url);
            } else {
                return resultStatus.outputs[0];
            }
        } else {
            throw new Error(`Error fetching result status: ${response.statusText}`);
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
        return await this.fetchResultStatus(result['_links'].self.href);
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
    
        // Create grouped result
        const result = {};
    
        // Identify which columns are data columns (not variation or lang)
        const dataColumns = headers.filter(header => 
            header !== 'variation' && header !== 'lang'
        );
    
        data.forEach(row => {
            const variation = row.variation;
            const lang = row.lang;
            
            // Initialize structure if needed
            result[variation] = result[variation] || {};
            result[variation][lang] = result[variation][lang] || {};
            
            // Dynamically assign all data columns
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
                const [imageName, smartCropName] = subLayer.name.split("|");
                const smartObject = {
                    layerId: subLayer.id,
                    layerName: subLayer.name,
                    imageName: imageName || subLayer.name,
                    ...(smartCropName && { smartCropName })
                };
                smartObjects.push(smartObject)
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
                
                // Get the base asset URL just once
                const baseAssetUrl = await this.getAssetPresignedUrl(imagePath);
                
                // Determine which URL to use for the edit layer
                const editLayerUrl = smartObject.smartCropName
                    ? await this.resolveDynamicMediaUrl(imagePath, smartObject.smartCropName)
                    : baseAssetUrl;
                
                // Create edit layer with appropriate URL
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

    async generatePresignURL() {
        const tempId = uuid4();
        return await this.files.generatePresignURL(tempId, {
            expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
            permissions: DEFAULT_FILE_PERMISSIONS
        });
    }

    async generateAssets(inputUrl, documentManifest, outputFolderPath, variationName, fontPaths, imagePaths, languageName, languageContent) {
        const layers = documentManifest.layers;
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

        this.renditionContent += `\n ---- photoshopOptions for variation ${variationName} and language ${languageName} ----\n ${JSON.stringify(photoshopOptions, null, 2)}`;

 
        // First phase: Modify document with smart objects
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
        await this.fetchResultStatus(documentOperationsResult['_links'].self.href);

        // Second phase: Edit text layers
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
        await this.fetchResultStatus(textResult['_links'].self.href);

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
        await this.files.write('rendition', this.renditionContent)
        await this.files.copy('rendition', path, { localDest: true });
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

        await service.executeAutomation();
        
        const durationSeconds = Math.round((performance.now() - startTime) / 1000);
        executionDescription = `Execution succeeded in ${durationSeconds} seconds`;
    } catch (error) {
        console.error(error);
        executionDescription = `Execution failed: ${error.stack.replace(/"|'/g, '')}`;
        throw error;
    } finally {
        if (service) {
            await service.createAEMRendition(rendition.path);
            await service.createAEMTask('PSD Automation', executionDescription);
        }
    }
});