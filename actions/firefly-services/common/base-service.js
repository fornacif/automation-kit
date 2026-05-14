'use strict'

const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const filesLib = require('@adobe/aio-lib-files');
const { v4: uuid4 } = require('uuid');
const path = require('path');
const { Readable } = require('stream');
const { error } = require("console");

const DAM_ROOT_PATH = '/content/dam/';
const DEFAULT_EXPIRY_SECONDS = 3600;
const DEFAULT_FILE_PERMISSIONS = 'rwd';

class BaseService {
    constructor() {
        this.aemAuthorHost = null;
        this.aemDeliveryHost = null;
        this.aemAccessToken = null;
        this.assetOwnerId = null;
        this.assetPath = null;
        this.automationRelativePath = null;
        this.fireflyServicesClientId = null;
        this.fireflyServicesToken = null;
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
        const filePath = `${uuid4()}/temp`;

        const response = await fetch(`${this.aemAuthorHost}/${assetPath}`, {
            headers: { Authorization: `Bearer ${this.aemAccessToken}` }
        });

        if (!response.ok) {
            throw new Error(`Failed to download asset from AEM: ${response.status} ${response.statusText}`);
        }

        await this.files.write(filePath, Readable.fromWeb(response.body));

        return await this.files.generatePresignURL(filePath, {
            expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
            permissions: DEFAULT_FILE_PERMISSIONS
        });
    }

    async uploadFileToAEM(source, targetFolderPath, fileName) {
        try {
            // Some presigned URLs (e.g., Substance 3D) only allow GET, not HEAD
            const downloadResponse = await fetch(source);
            if (!downloadResponse.ok) {
                throw new Error(`Failed to download file: ${downloadResponse.status} ${downloadResponse.statusText}`);
            }

            const fileSize = parseInt(downloadResponse.headers.get('content-length'), 10);
            if (!fileSize) {
                throw new Error('Source URL did not provide Content-Length header');
            }

            // Initiate upload — pass maxPartSize=fileSize to get a single upload URI
            const initiateRes = await fetch(`${this.aemAuthorHost}${targetFolderPath}.initiateUpload.json`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.aemAccessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ fileName, fileSize, maxPartSize: fileSize })
            });
            if (!initiateRes.ok) {
                throw new Error(`Upload initiation failed: ${initiateRes.status} ${initiateRes.statusText}`);
            }

            const { files: [{ uploadToken, uploadURIs, mimeType }], completeURI } = await initiateRes.json();

            // Stream directly from source to AEM upload URI — no disk or memory buffering
            const putRes = await fetch(uploadURIs[0], {
                method: 'PUT',
                headers: { 'Content-Length': fileSize },
                body: downloadResponse.body,
                duplex: 'half'
            });
            if (!putRes.ok) {
                throw new Error(`Chunk upload failed: ${putRes.status} ${putRes.statusText}`);
            }

            const completeRes = await fetch(`${this.aemAuthorHost}${completeURI}`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${this.aemAccessToken}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({ fileName, uploadToken, mimeType: mimeType || 'application/octet-stream', fileSize })
            });
            if (!completeRes.ok) {
                throw new Error(`Upload completion failed: ${completeRes.status} ${completeRes.statusText}`);
            }
        } catch (err) {
            throw new Error(`File upload to AEM failed: ${err.message}`);
        }
    }

    async pollForResults(statusUrl, options = {}) {
        const { apiType = 'firefly', authToken = null } = options; // 'firefly', 'indesign', 'photoshop', or 'substance3d'
        let retryCount = 0;

        while (true) {
            const headers = {
                'Content-Type': 'application/json'
            };

            // Set authentication based on API type
            if (apiType === 'indesign') {
                headers['Authorization'] = `Bearer ${this.fireflyServicesToken}`;
                headers['x-api-key'] = this.fireflyServicesClientId;
            } else if (apiType === 'substance3d') {
                headers['Authorization'] = `Bearer ${authToken}`;
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
            } else if (apiType === 'illustrator') {
                // Illustrator API: partially_succeeded counts as complete (partial outputs available)
                isComplete = result.status === 'succeeded' || result.status === 'partially_succeeded';
                isFailed = result.status === 'failed';
                isRunning = !isComplete && !isFailed;
            } else if (apiType === 'photoshop') {
                // Photoshop API: check result.outputs[0].status
                const outputStatus = result.outputs?.[0]?.status;
                isRunning = ['pending', 'starting', 'running'].includes(outputStatus);
                isComplete = !isRunning && outputStatus !== 'failed';
                isFailed = outputStatus === 'failed';
            } else if (apiType === 'substance3d') {
                // Substance 3D API: check result.status
                isComplete = result.status === 'succeeded';
                isFailed = result.status === 'failed';
                isRunning = !isComplete && !isFailed;
            } else {
                // Firefly API: check result.status
                isComplete = result.status === 'succeeded';
                isFailed = result.status === 'failed';
                isRunning = !isComplete && !isFailed;
            }

            if (isComplete) {
                return result;
            } else if (isFailed) {
                throw new Error(`Job failed: ${result.message || result.error?.message || result.errors?.[0]?.message || JSON.stringify(result)}`);
            }

            // Reset rate limit counter on successful status check
            retryCount = 0;

            await this.waitBeforeContinue(1000);
        }
    }

    async uploadImageToFireflyStorage(imageUrl, contentType) {
        const downloadResponse = await fetch(imageUrl);

        if (!downloadResponse.ok) {
            throw new Error(`Failed to download image: ${downloadResponse.status} ${downloadResponse.statusText}`);
        }

        const filePath = `${uuid4()}/temp`;
        await this.files.write(filePath, Readable.fromWeb(downloadResponse.body));
        const { contentLength } = await this.files.getProperties(filePath);
        const fileStream = await this.files.createReadStream(filePath);

        const response = await fetch('https://firefly-api.adobe.io/v2/storage/image', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': contentType,
                'Content-Length': contentLength
            },
            body: Readable.toWeb(fileStream),
            duplex: 'half'
        });

        if (!response.ok) {
            const errorBody = await response.text();
            throw new Error(`Failed to upload image to Firefly storage: ${response.statusText} - ${errorBody}`);
        }

        const result = await response.json();
        return result.images[0].id;
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
