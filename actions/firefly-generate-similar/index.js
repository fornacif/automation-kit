'use strict'

const { worker } = require('@adobe/asset-compute-sdk');
const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const path = require('path');
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
const FIREFLY_STORAGE_UPLOAD_URL = 'https://firefly-api.adobe.io/v2/storage/image';
const FIREFLY_GENERATE_SIMILAR_URL = 'https://firefly-api.adobe.io/v3/images/generate-similar-async';

class FireflyGenerateSimilarService {
    constructor() {
        this.aemAuthorHost = null;
        this.aemAccessToken = null;
        this.assetOwnerId = null;
        this.assetPath = null;
        this.automationRelativePath = null;
        this.directBinaryAccess = null;
        this.fireflyServicesClientId = null;
        this.fireflyServicesToken = null;
        this.files = null;
        this.outputFormatType = null;
        this.numVariations = 1;
        this.imageWidth = null;
        this.imageHeight = null;
        this.renditionContent = '';
    }

    static async create(rendition, params) {
        const service = new FireflyGenerateSimilarService();
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
        this.outputFormatType = rendition.instructions.outputFormatType || 'image/png';
        this.directBinaryAccess = rendition.instructions.directBinaryAccess === 'true';
        this.numVariations = rendition.instructions.numVariations ? parseInt(rendition.instructions.numVariations, 10) : 1;
        this.imageWidth = rendition.instructions.imageWidth ? parseInt(rendition.instructions.imageWidth, 10) : 2688;
        this.imageHeight = rendition.instructions.imageHeight ? parseInt(rendition.instructions.imageHeight, 10) : 1536;
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
                'scope': 'openid,AdobeID,read_organizations,firefly_api,ff_apis'
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

    async uploadImageToFireflyStorage(imageUrl) {
        // Download the image from AEM
        const generatedId = uuid4();
        const filePath = `${generatedId}/temp`;

        try {
            await downloadFileConcurrently(imageUrl, filePath, { mkdirs: true });

            // Read the image file
            const imageBuffer = fs.readFileSync(filePath);

            // Upload to Firefly storage
            const response = await fetch(FIREFLY_STORAGE_UPLOAD_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.fireflyServicesToken}`,
                    'x-api-key': this.fireflyServicesClientId,
                    'Content-Type': 'image/jpeg'
                },
                body: imageBuffer
            });

            if (!response.ok) {
                throw new Error(`Failed to upload image to Firefly storage: ${response.statusText}`);
            }

            const result = await response.json();
            return result.images[0].id;
        } finally {
            await this.files.delete(`${generatedId}/`);
        }
    }

    async generateSimilarImages(uploadId) {
        const response = await fetch(FIREFLY_GENERATE_SIMILAR_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json',
                'x-model-version': 'image4_ultra'
            },
            body: JSON.stringify({
                image: {
                    source: {
                        uploadId: uploadId
                    }
                },
                numVariations: this.numVariations,
                size: {
                    height: this.imageHeight,
                    width: this.imageWidth
                }
            })
        });

        if (!response.ok) {
            throw new Error(`Failed to generate similar images: ${response.statusText}`);
        }

        return await response.json();
    }

    async pollForResults(statusUrl) {
        while (true) {
            const response = await fetch(statusUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.fireflyServicesToken}`,
                    'x-api-key': this.fireflyServicesClientId
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get job status: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.status === 'succeeded') {
                return result.result.outputs;
            } else if (result.status === 'failed') {
                throw new Error(`Image generation failed: ${result.error?.message || 'Unknown error'}`);
            }

            // Wait 2 seconds before polling again
            await this.waitBeforeContinue(2000);
        }
    }

    async executeAutomation(rendition) {
        this.renditionContent = `---- Firefly Generate Similar ----\n`;
        this.renditionContent += `Asset Path: ${this.assetPath}\n`;
        this.renditionContent += `Output Format: ${this.outputFormatType}\n`;
        this.renditionContent += `Num Variations: ${this.numVariations}\n`;
        this.renditionContent += `Image Size: ${this.imageWidth}x${this.imageHeight}\n`;

        // Step 1: Get the source image URL
        const sourceImageUrl = await this.getAssetPresignedUrl(this.assetPath);
        this.renditionContent += `\nSource Image: ${this.assetPath}`;

        // Step 2: Upload image to Firefly storage
        const uploadId = await this.uploadImageToFireflyStorage(sourceImageUrl);
        this.renditionContent += `\nFirefly Upload ID: ${uploadId}`;

        // Step 3: Generate similar images
        const generateResult = await this.generateSimilarImages(uploadId);
        const statusUrl = generateResult.statusUrl;
        this.renditionContent += `\nStatus URL: ${statusUrl}`;

        // Step 4: Poll for results
        const outputs = await this.pollForResults(statusUrl);
        this.renditionContent += `\nGenerated ${outputs.length} variation(s)`;

        // Step 5: Download and upload to AEM
        const assetBasename = path.basename(this.assetPath, path.extname(this.assetPath));
        const outputFolderPath = `${DAM_ROOT_PATH}${this.automationRelativePath}`;
        const fileExtension = this.outputFormatType === 'image/png' ? 'png' : 'jpeg';

        for (let i = 0; i < outputs.length; i++) {
            const output = outputs[i];
            const imageUrl = output.image.url;

            const newAssetName = `${assetBasename}-similar-${i + 1}.${fileExtension}`;

            // Download from Firefly and upload to AEM
            const generatedId = uuid4();
            const tempFilePath = `${generatedId}/temp.${fileExtension}`;

            try {
                await downloadFileConcurrently(imageUrl, tempFilePath, { mkdirs: true });

                const presignedUrl = await this.files.generatePresignURL(generatedId, {
                    expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
                    permissions: DEFAULT_FILE_PERMISSIONS
                });

                await uploadFileConcurrently(tempFilePath, presignedUrl);
                await this.uploadFileToAEM(presignedUrl, outputFolderPath, newAssetName);

                this.renditionContent += `\nNew Asset Created: ${outputFolderPath}/${newAssetName}`;
            } finally {
                await this.files.delete(`${generatedId}/`);
            }
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
        service = await FireflyGenerateSimilarService.create(rendition, params);
        await service.executeAutomation(rendition);

        const durationSeconds = Math.round((performance.now() - startTime) / 1000);
        executionDescription = `Execution succeeded in ${durationSeconds} seconds`;
    } catch (errorCausedBy) {
        error(errorCausedBy);
        executionDescription = `Execution failed: ${errorCausedBy.stack}`;
        throw errorCausedBy;
    } finally {
        if (service) {
            await service.createAEMRendition(rendition.path);
            await service.createAEMTask('Firefly Generate Similar', executionDescription);
        }
    }
});
