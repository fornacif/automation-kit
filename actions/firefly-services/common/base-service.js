'use strict'

const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const filesLib = require('@adobe/aio-lib-files');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const DirectBinary = require('@adobe/aem-upload');

const DAM_ROOT_PATH = '/content/dam/';
const DEFAULT_EXPIRY_SECONDS = 180;
const DEFAULT_FILE_PERMISSIONS = 'rwd';

class BaseService {
    constructor() {
        this.aemAuthorHost = null;
        this.aemDeliveryHost = null;
        this.aemAccessToken = null;
        this.assetOwnerId = null;
        this.assetPath = null;
        this.automationRelativePath = null;
        this.directBinaryAccess = null;
        this.fireflyServicesClientId = null;
        this.fireflyServicesToken = null;
        this.inDesignApiKey = null;
        this.inDesignApiAccessToken = null;
        this.files = null;
    }

    async initialize(rendition, params) {
        const certificate = JSON.parse(rendition.instructions.certificate ?? params.aemCertificate);

        // Authorization check: verify org ID against authorized list
        if (params.authorizedOrgIds) {
            const authorizedOrgIds = params.authorizedOrgIds.split(',').map(id => id.trim());
            const currentOrgId = params.auth?.orgId;

            if (!currentOrgId) {
                throw new Error('Authorization check failed: params.auth.orgId is not available');
            }

            if (!authorizedOrgIds.includes(currentOrgId)) {
                throw new Error(`Unauthorized: Organization ID '${currentOrgId}' is not authorized to use this action. Authorized organizations: ${authorizedOrgIds.join(', ')}`);
            }
        }

        this.fireflyServicesClientId = params.fireflyServicesApiClientId;
        this.fireflyServicesToken = await this.getFireflyServicesToken(params);
        this.aemAuthorHost = this.getAemHost(certificate, 'author');
        this.aemDeliveryHost = this.getAemHost(certificate, 'delivery');
        this.aemAccessToken = (await aemApiClientLib(certificate)).access_token;
        this.assetPath = rendition.instructions.userData.assetPath;
        const { 'jcr:createdBy': ownerId }  = await this.executeAEMRequest('GET', 'application/json', 'json', `${this.assetPath}.json`);
        this.assetOwnerId = ownerId;
        this.automationRelativePath = path.dirname(this.assetPath).replace(DAM_ROOT_PATH, '');
        this.directBinaryAccess = rendition.instructions.directBinaryAccess === 'true';
        this.files = await filesLib.init();

        if (params.inDesignFireflyServicesApiClientId) {
            this.inDesignApiKey = params.inDesignFireflyServicesApiClientId;
            this.inDesignApiAccessToken = await this.generateInDesignApiAccessToken(params);
        }
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

    async generateInDesignApiAccessToken(params) {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'grant_type': 'client_credentials',
                'client_id': params.inDesignFireflyServicesApiClientId,
                'client_secret': params.inDesignFireflyServicesApiClientSecret,
                'scope': params.inDesignFireflyServicesApiScopes
            })
        };

        const response = await fetch('https://ims-na1.adobelogin.com/ims/token/v3', options);
        if (!response.ok) {
            throw new Error(`Access Token creation failed: ${response.statusText}`);
        }

        const result = await response.json();
        return result.access_token;
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

    async waitBeforeContinue(time) {
        const delay = ms => new Promise(res => setTimeout(res, ms));
        await delay(time);
    }

    async generatePresignURL() {
        const tempId = uuid4();
        return await this.files.generatePresignURL(tempId, {
            expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
            permissions: DEFAULT_FILE_PERMISSIONS
        });
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

    async uploadFileToAEM(source, targetFolderPath, fileName) {
        let filePath = source;
        let tempId = null;

        try {
            // If source is a URL (presigned URL), download it first
            if (source.startsWith('http')) {
                tempId = uuid4();
                filePath = `${tempId}/temp`;

                await downloadFileConcurrently(source, filePath, {
                    mkdirs: true,
                    retryEnabled: true,
                    retryAllErrors: true
                });
            }

            const fileSize = fs.statSync(filePath).size;

            const upload = new DirectBinary.DirectBinaryUpload();
            const options = new DirectBinary.DirectBinaryUploadOptions()
                .withUrl(`${this.aemAuthorHost}${targetFolderPath}`)
                .withHttpOptions({
                    headers: {
                        Authorization: `Bearer ${this.aemAccessToken}`
                    }
                })
                .withUploadFiles([{
                    fileName,
                    fileSize,
                    filePath
                }]);

            await upload.uploadFiles(options);
        } finally {
            if (tempId) {
                await this.files.delete(`${tempId}/`);
            }
        }
    }

    async pollForResults(statusUrl, options = {}) {
        const { apiType = 'firefly' } = options; // 'firefly', 'indesign', or 'photoshop'
        let retryCount = 0;

        while (true) {
            const headers = {
                'Content-Type': 'application/json'
            };

            // Set authentication based on API type
            if (apiType === 'indesign') {
                headers['Authorization'] = `Bearer ${this.inDesignApiAccessToken}`;
                headers['x-api-key'] = this.inDesignApiKey;
                headers['x-enable-beta'] = 'true';
            } else {
                // Default to Firefly/Photoshop credentials
                headers['Authorization'] = `Bearer ${this.fireflyServicesToken}`;
                headers['x-api-key'] = this.fireflyServicesClientId;
            }

            const response = await fetch(statusUrl, {
                method: 'GET',
                headers
            });

            if (response.status === 429) {
                const maxRetries = 4;
                if (retryCount >= maxRetries) {
                    throw new Error(`Failed to get job status: Too Many Requests after ${maxRetries} retries`);
                }
                const waitTime = Math.pow(2, retryCount) * 30000;
                await this.waitBeforeContinue(waitTime);
                retryCount++;
                continue; // Retry the request
            }

            if (!response.ok) {
                throw new Error(`Failed to get job status: ${response.statusText}`);
            }

            const result = await response.json();

            // Check status based on API type
            let isRunning = false;
            let isComplete = false;
            let isFailed = false;

            if (apiType === 'indesign') {
                // InDesign API: check result.status
                isRunning = result.status === 'not_started' || result.status === 'running';
                isComplete = !isRunning && result.status !== 'failed';
                isFailed = result.status === 'failed';
            } else if (apiType === 'photoshop') {
                // Photoshop API: check result.outputs[0].status
                const outputStatus = result.outputs?.[0]?.status;
                isRunning = ['pending', 'starting', 'running'].includes(outputStatus);
                isComplete = !isRunning && outputStatus !== 'failed';
                isFailed = outputStatus === 'failed';
            } else {
                // Firefly API: check result.status
                isComplete = result.status === 'succeeded';
                isFailed = result.status === 'failed';
                isRunning = !isComplete && !isFailed;
            }

            if (isComplete) {
                return result;
            } else if (isFailed) {
                throw new Error(`Job failed: ${result.error?.message || 'Unknown error'}`);
            }

            // Reset rate limit counter on successful status check
            retryCount = 0;

            await this.waitBeforeContinue(1000);
        }
    }

    async uploadImageToFireflyStorage(imageUrl, contentType) {
        const generatedId = uuid4();
        const filePath = `${generatedId}/temp`;

        try {
            await downloadFileConcurrently(imageUrl, filePath, { mkdirs: true });

            const imageBuffer = fs.readFileSync(filePath);

            const response = await fetch('https://firefly-api.adobe.io/v2/storage/image', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.fireflyServicesToken}`,
                    'x-api-key': this.fireflyServicesClientId,
                    'Content-Type': contentType
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

    getDamRootPath() {
        return DAM_ROOT_PATH;
    }

    getDefaultExpirySeconds() {
        return DEFAULT_EXPIRY_SECONDS;
    }

    getDefaultFilePermissions() {
        return DEFAULT_FILE_PERMISSIONS;
    }
}

module.exports = BaseService;
