'use strict'

const { worker } = require('@adobe/asset-compute-sdk');
const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const path = require('path');
const { ServerToServerTokenProvider } = require("@adobe/firefly-services-common-apis");
const { PhotoshopClient, StorageType, ImageFormatType } = require("@adobe/photoshop-apis");
const filesLib = require('@adobe/aio-lib-files');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');

// Constants
const DAM_ROOT_PATH = '/content/dam/';
const DEFAULT_EXPIRY_SECONDS = 180;
const DEFAULT_FILE_PERMISSIONS = 'rwd';

class AutomationService {
    constructor() {
        this.aemAuthorHost = null;
        this.aemAccessToken = null;
        this.assetId = null;
        this.assetOwnerId = null;
        this.outputFormatType = null;
        this.automationRelativePath = null;
        this.directBinaryAccess = null;
        this.photoshopClient = null;
        this.files = null;
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
        this.aemAccessToken = (await aemApiClientLib(certificate)).access_token;
        this.assetPath = rendition.instructions.userData.assetPath;
        const { 'jcr:createdBy': ownerId }  = await this.executeAEMRequest('GET', 'application/json', 'json', `${this.assetPath}.json`);
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

        return output;
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

    async executeAutomation(rendition) {
        const inputUrl = await this.getAssetPresignedUrl(this.assetPath);

        const photoshopOptions = {
            unit: 'Pixels',
            width: 0,
            height: 0
        };

        const tempId = uuid4();
        const outputUrl = await this.files.generatePresignURL(tempId, {
            expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
            permissions: DEFAULT_FILE_PERMISSIONS
        });
        
        await this.photoshopClient.applyAutoCrop({
            inputs: [this.createPhotoshopInput(inputUrl)],
            options: photoshopOptions,
            outputs: [this.createPhotoshopOutput(outputUrl, this.outputFormatType)]
        });

        await downloadFileConcurrently(outputUrl, rendition.path);   
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

        await service.executeAutomation(rendition);
        
        const durationSeconds = Math.round((performance.now() - startTime) / 1000);
        executionDescription = `Execution succeeded in ${durationSeconds} seconds`;
    } catch (error) {
        console.error(error);
        executionDescription = `Execution failed: ${error.stack}`;
        throw error;
    } finally {
        if (service) {
            await service.createAEMTask('Product Crop Automation', executionDescription);
        }
    }
});