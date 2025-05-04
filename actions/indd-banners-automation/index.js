'use strict'

const { worker } = require('@adobe/asset-compute-sdk');
const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const path = require('path');
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
        this.aemAccessToken = null;
        this.assetPath = null;
        this.assetOwnerId = null;
        this.outputFormatType = null;
        this.resolution = null;
        this.automationRelativePath = null;
        this.directBinaryAccess = null;
        this.files = null;
        this.renditionContent = 'error';
        this.inDesignApiKey = null;
        this.inDesignApiAccessToken = null;
    }

    static async create(rendition, params) { 
        const service = new AutomationService();
        await service.initialize(rendition, params);
        return service;
    }

    async initialize(rendition, params) {
        const certificate = JSON.parse(rendition.instructions.certificate ?? params.aemCertificate);        
        this.aemAuthorHost = this.getAemHost(certificate, 'author');
        this.aemAccessToken = (await aemApiClientLib(certificate)).access_token;
        this.assetPath = rendition.instructions.userData.assetPath;
        const { 'jcr:createdBy': ownerId }  = await this.executeAEMRequest('GET', 'application/json', 'json', `${this.assetPath}.json`);
        this.assetOwnerId = ownerId;
        this.automationRelativePath = path.dirname(this.assetPath).replace(DAM_ROOT_PATH, '');
        this.outputFormatType = rendition.instructions.outputFormatType;
        this.resolution = rendition.instructions.resolution;
        this.files = await filesLib.init();
        this.directBinaryAccess = rendition.instructions.directBinaryAccess;
        this.inDesignApiKey = params.inDesignFireflyServicesApiClientId;
        this.inDesignApiAccessToken = await this.generateInDesignApiAccessToken(params);  
    }

    getAemHost(certificate, type) {
        const clientIdParts = certificate.integration.technicalAccount.clientId.split('-');
        return `https://${type}-${clientIdParts[1]}-${clientIdParts[2]}.adobeaemcloud.com`;
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

    async generatePresignURL() {
        const tempId = uuid4();
        return await this.files.generatePresignURL(tempId, {
            expiryInSeconds: DEFAULT_EXPIRY_SECONDS,
            permissions: DEFAULT_FILE_PERMISSIONS
        });
    }

    async uploadFileToAEM(presignedUrl, outputFolderPath, fileName) {
        const generatedId = uuid4();
        const filePath = `${generatedId}/temp`;

        try {
            await downloadFileConcurrently(
                presignedUrl,
                filePath,
                {
                    mkdirs: true,
                    retryEnabled:true,
                    retryAllErrors:true
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

    async getAssetPresignedUrl(assetPath, directBinaryAccess = true) {
        if (directBinaryAccess && this.directBinaryAccess === 'true') {
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
            default: new Error(`AEM request failed: invalid result type: ${resultType}`);
        }
    }

    async retrieveAssetPathsFromPath(relativePath) {
        const folderListing = await this.executeAEMRequest('GET', 'application/json', 'json', `/api/assets/${relativePath}.json`);
    
        const entities = [];
    
        if (folderListing.entities) {
            for (const entity of folderListing.entities) {
                if ('assets/asset' == entity.class) {
                    entities.push(`${DAM_ROOT_PATH}${relativePath}/${entity.properties.name}`);  
                } 
            };
        }

        return entities;
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
                'Authorization': `Bearer ${this.inDesignApiAccessToken}`,
                'x-api-key': this.inDesignApiKey,
                'x-enable-beta': 'true'
            }
        };
      
        const response = await fetch(url, options)
        
        if (response.ok) {     
            return await response.json();
        } else {
            throw new Error(`Error fetching result status: ${response.statusText}`);
        }
      }

    async mergeData(outputPresignedUrl, dataSourcePath, outputFolderPath) {
        const templatePresignedUrl = await this.getAssetPresignedUrl(this.assetPath);
        const dataSourcePresignedUrl = await this.getAssetPresignedUrl(dataSourcePath, false);

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
                        url: dataSourcePresignedUrl
                    },
                    destination: 'datasource.csv'
                }
            ],
            params: {
                outputMediaType: 'application/x-indesign',
                targetDocument: 'destination.indd',
                outputFolderPath: 'outputfolder',
                outputFileBaseString: 'merged',
                dataSource: 'datasource.csv',
                imagePlacementOptions: {
                    fittingOption: 'content_aware_fit'
                }
            },
            outputs: [
                {
                    destination: {
                        url: outputPresignedUrl
                    },
                    source: 'outputfolder/range1/merged.indd'
                }
            ]
        };

        const imagePaths = await this.retrieveAssetPathsFromPath(`${this.automationRelativePath}/inputs`);
     
        for (const imagePath of imagePaths) {
            const imageBasename = path.parse(imagePath).base;
            const imageSourcePresignedUrl = await this.getAssetPresignedUrl(imagePath);
            data.assets.push(
                {
                    source: {
                        url: imageSourcePresignedUrl
                    },
                    destination: imageBasename
                }
            );
        }
      
      
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.inDesignApiAccessToken}`,
                'x-api-key': this.inDesignApiKey,
                'x-enable-beta': 'true'
            },
            body: JSON.stringify(data)
        };

        this.renditionContent = '---- Retrieved Inputs for Merge Data ----\n' + JSON.stringify(data, null, 2);

        const response = await fetch(`https://indesign.adobe.io/v3/merge-data`, options);

        if (response.ok) {
            const result = await response.json();

            await this.uploadFileToAEM(outputPresignedUrl, outputFolderPath, 'merged.indd');
            
            const resultStatus = await this.fetchResultStatus(result.statusUrl);
            const recordIndex = resultStatus.data.records[0].recordIndex;
            const recordIndexBounds = recordIndex.split("-");
      
            return recordIndexBounds;
        } else {
            throw new Error(`Error merging data: ${response.statusText}`);
        }
    }

    async createRendition(inputPresignedUrl, recordIndexBounds, outputFolderPath) {
        const data = {
            assets: [
                {
                    source: {
                        url: inputPresignedUrl
                    },
                    destination: 'destination.indd'
                },            
            ],
            params: {
                outputMediaType: this.outputFormatType,
                targetDocuments: [ 'destination.indd'],
                outputFileBaseString: 'merged',
                outputFolderPath: 'outputfolder',
                quality: 'maximum',
                resolution: this.resolution,
                createSeparateFiles: true
            },
            outputs: []
        };
      
        const outputs = [];
      
        for (let i = recordIndexBounds[0]; i <= recordIndexBounds[1]; i++) {
            let fileExtension;
      
            if ('image/png' == this.outputFormatType) {
                fileExtension = 'png';
            } else if ('image/jpeg' == this.outputFormatType) {
                fileExtension = 'jpg';
            } else if ('application/pdf' == this.outputFormatType) {
                fileExtension = 'pdf';
            } else { 
                throw new Error(`Unsupported output format: ${this.outputFormatType}`);
            }
      
            const outputPresignedUrl = await this.generatePresignURL();
            outputs.push({outputPresignedUrl: outputPresignedUrl, filename: `merged-${i}.${fileExtension}`});
      
            let fileName = fileExtension === 'pdf' 
                ? `merged/merged_${i.toString().padStart(2, '0')}.${fileExtension}`
                : `merged${i > 1 ? i : ''}.${fileExtension}`;
      
            data.outputs.push(
                {
                    destination: {
                        url: outputPresignedUrl
                    },
                    source: `outputfolder/${fileName}`
                }
            );
        }
      
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.inDesignApiAccessToken}`,
                'x-api-key': this.inDesignApiKey,
                'x-enable-beta': 'true'
            },
            body: JSON.stringify(data)
        };

        this.renditionContent += '---- Retrieved Inputs for Create Rendition ----\n' + JSON.stringify(data, null, 2);
      
        const response = await fetch(`https://indesign.adobe.io/v3/create-rendition`, options);
      
        if (response.ok) { 
            const promises = [];    
            for (const output of outputs) {
                const promise = this.uploadFileToAEM(output.outputPresignedUrl, outputFolderPath, output.filename);
                promises.push(promise);
            }
            await Promise.all(promises);
        } else {
            throw new Error(`Error creating renditions: ${response.statusText}`);
        }
    }

    async executeAutomation() {
        const outputFolderPath = `${DAM_ROOT_PATH}${this.automationRelativePath}/outputs`;
        const dataSourcePath = `${DAM_ROOT_PATH}${this.automationRelativePath}/data.csv`;
        const tempPresignedUrl = await this.generatePresignURL();

        const recordIndexBounds = await this.mergeData(tempPresignedUrl, dataSourcePath, outputFolderPath);
        await this.createRendition(tempPresignedUrl, recordIndexBounds, outputFolderPath);
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

        const durationSeconds = Math.round((performance.now() - startTime) / 1000);
        executionDescription = `Execution succeeded in ${durationSeconds} seconds`;
    } catch (error) {
        console.error(error);
        executionDescription = `Execution failed: ${error.stack}`;
        throw error;
    } finally {
        if (service) {
            await service.createAEMRendition(rendition.path);
            await service.createAEMTask('INDD Automation', executionDescription);
        }
    }
});