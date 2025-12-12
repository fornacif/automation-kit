'use strict'

const { worker } = require('@adobe/asset-compute-sdk');
const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const path = require('path');
const { StorageType, ImageFormatType } = require("@adobe/photoshop-apis");
const filesLib = require('@adobe/aio-lib-files');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');
const { error } = require('console');
const fs = require('fs');
const DirectBinary = require('@adobe/aem-upload');

// Constants
const DAM_ROOT_PATH = '/content/dam/';
const DEFAULT_EXPIRY_SECONDS = 180;
const DEFAULT_FILE_PERMISSIONS = 'rwd';

class AutomationService {
    constructor() {
        this.aemAuthorHost = null;
        this.aemAccessToken = null;
        this.assetOwnerId = null;
        this.outputFormatType = null;
        this.paddingWidth = null;
        this.paddingHeight = null;
        this.automationRelativePath = null;
        this.directBinaryAccess = null;
        this.fireflyServicesClientId = null;
        this.fireflyServicesToken = null;
        this.files = null;
        this.createAsset = null;
        this.renditionContent = '';
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
        this.aemAccessToken = (await aemApiClientLib(certificate)).access_token;
        this.assetPath = rendition.instructions.userData.assetPath;
        const { 'jcr:createdBy': ownerId }  = await this.executeAEMRequest('GET', 'application/json', 'json', `${this.assetPath}.json`);
        this.assetOwnerId = ownerId;
        this.automationRelativePath = path.dirname(this.assetPath).replace(DAM_ROOT_PATH, '');
        this.outputFormatType = rendition.instructions.outputFormatType;
        this.paddingWidth = rendition.instructions.paddingWidth ? parseInt(rendition.instructions.paddingWidth, 50) : 0;
        this.paddingHeight = rendition.instructions.paddingHeight ? parseInt(rendition.instructions.paddingHeight, 50) : 0;
        this.imageWidth = rendition.instructions.imageWidth ? parseInt(rendition.instructions.imageWidth, 10) : null;
        this.directBinaryAccess = rendition.instructions.directBinaryAccess === 'true';
        this.createAsset = rendition.instructions.createAsset ? rendition.instructions.createAsset === 'true' : true;
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
            default: throw new Error(`AEM request failed: invalid result type ${resultType}`);
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

        return output;
    }

    async getAssetPresignedUrl(assetPath) {
        if (this.directBinaryAccess) {
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

            const stats = fs.statSync(filePath);
            const fileSizeInBytes = stats.size;

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

    async productCrop(inputUrl, outputUrl, width, height) {
        const photoshopOptions = {
            unit: 'Pixels',
            width: width,
            height: height
        };

        const productCropResponse = await fetch('https://image.adobe.io/pie/psdService/productCrop', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: [this.createPhotoshopInput(inputUrl)],
                options: photoshopOptions,
                outputs: [this.createPhotoshopOutput(outputUrl, this.outputFormatType)]
            })
        });

        if (!productCropResponse.ok) {
            throw new Error(`Product Crop failed: ${productCropResponse.statusText}`);
        }

        const productCropResult = await productCropResponse.json();
        await this.fetchResultStatus(productCropResult['_links'].self.href);
    }

    async resize(inputUrl, outputUrl, imageWidth) {
        const output = this.createPhotoshopOutput(outputUrl, this.outputFormatType);
        output.width = imageWidth;

        const renditionCreateResponse = await fetch('https://image.adobe.io/pie/psdService/renditionCreate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: [this.createPhotoshopInput(inputUrl)],
                outputs: [output]
            })
        });

        if (!renditionCreateResponse.ok) {
            throw new Error(`Resize to ${imageWidth}x${imageWidth} failed: ${renditionCreateResponse.statusText}`);
        }

        const renditionCreateResult = await renditionCreateResponse.json();
        await this.fetchResultStatus(renditionCreateResult['_links'].self.href);
    }

    async executeAutomation(rendition) {
        const inputUrl = await this.getAssetPresignedUrl(this.assetPath);

        const tempId = uuid4();
        const outputUrl = await this.files.generatePresignURL(tempId, {
            expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
            permissions: DEFAULT_FILE_PERMISSIONS
        });

        this.renditionContent = `---- Product Crop Automation ----\n`;
        this.renditionContent += `Asset Path: ${this.assetPath}\n`;
        this.renditionContent += `Output Format: ${this.outputFormatType}\n`;
        if (this.paddingWidth > 0 && this.paddingHeight > 0) {
            this.renditionContent += `Padding: ${this.paddingWidth}x${this.paddingHeight}\n`;
        }
        if (this.imageWidth) {
            this.renditionContent += `Final Size: ${this.imageWidth}\n`;
        }
        this.renditionContent += `Create Asset: ${this.createAsset}\n`;

        // Step 1: Product crop to paddingWidth x paddingHeight
        await this.productCrop(inputUrl, outputUrl, this.paddingWidth, this.paddingHeight);
        
        let finalOutputUrl = outputUrl;

        // Step 2: Resize to imageWidth (if specified)
        if (this.imageWidth) {
            const resizeTempId = uuid4();
            const resizedOutputUrl = await this.files.generatePresignURL(resizeTempId, {
                expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
                permissions: DEFAULT_FILE_PERMISSIONS
            });

            await this.resize(outputUrl, resizedOutputUrl, this.imageWidth);
            finalOutputUrl = resizedOutputUrl;
        }

        // Step 3: Create asset or rendition based on config
        if (this.createAsset) {
            const assetBasename = path.basename(this.assetPath, path.extname(this.assetPath));
            const fileExtension = this.outputFormatType === ImageFormatType.IMAGE_PNG ? 'png' : 'jpeg';
            const newAssetName = `${assetBasename}-product-crop.${fileExtension}`;
            const outputFolderPath = `${DAM_ROOT_PATH}${this.automationRelativePath}`;

            await this.uploadFileToAEM(finalOutputUrl, outputFolderPath, newAssetName);
            this.renditionContent += `\nNew Asset Created: ${outputFolderPath}/${newAssetName}`;
        } else {
            await downloadFileConcurrently(finalOutputUrl, rendition.path);
            this.renditionContent += `\nRendition Created: ${rendition.path}`;
        }
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
        await service.executeAutomation(rendition);

        const durationSeconds = Math.round((performance.now() - startTime) / 1000);
        executionDescription = `Execution succeeded in ${durationSeconds} seconds`;
    } catch (errorCausedBy) {
        error(errorCausedBy);
        executionDescription = `Execution failed: ${errorCausedBy.stack}`;
        throw errorCausedBy;
    } finally {
        if (service) {
            // If createAsset mode, write text rendition with info
            if (service.createAsset) {
                await service.createAEMRendition(rendition.path);
            }
            await service.createAEMTask('Product Crop Automation', executionDescription);
        }
    }
});