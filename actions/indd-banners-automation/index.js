'use strict'

const { worker } = require('@adobe/asset-compute-sdk');
const aemApiClientLib = require("@adobe/aemcs-api-client-lib");
const path = require('path');
const filesLib = require('@adobe/aio-lib-files');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, ContainerSASPermissions } = require("@azure/storage-blob");
const { v4: uuid4 } = require('uuid');

// Constants
const DAM_ROOT_PATH = '/content/dam/';

class AutomationService {
    constructor() {
        this.aemAuthorHost = null;
        this.aemAccessToken = null;
        this.assetPath = null;
        this.assetOwnerId = null;
        this.outputFormatType = null;
        this.resolution = null;
        this.automationRelativePath = null;
        this.files = null;
        this.renditionContent = 'error';
        this.inDesignApiKey = null;
        this.inDesignApiAccessToken = null;
        this.azureStorageAccountUrl = null;
        this.azureStorageContainerUrl = null;
        this.azureSasToken = null;
        this.generatedId = uuid4();
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
        this.inDesignApiKey = params.inDesignFireflyServicesApiClientId;
        this.inDesignApiAccessToken = await this.generateInDesignApiAccessToken(params);
        this.azureStorageAccountUrl = `https://${params.azureStorageAccountName}.blob.core.windows.net`;
        this.azureStorageContainerUrl = `${this.azureStorageAccountUrl}/${params.azureStorageContainerName}`;
        this.azureSasToken = await this.generateAzureSasToken(params);     
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

    async generateAzureSasToken(params) {
        const sharedKeyCredential = new StorageSharedKeyCredential(params.azureStorageAccountName, params.azureStorageAccountKey);
      
        const blobServiceClient = new BlobServiceClient(
            this.azureStorageAccountUrl,
            sharedKeyCredential
        );
      
        const containerClient = blobServiceClient.getContainerClient(params.azureStorageContainerName);
      
        const startsOn = new Date();
        const expiresOn = new Date(new Date().valueOf() + 3600 * 1000);
      
        const sasOptions = {
            containerName: containerClient.containerName,
            permissions: ContainerSASPermissions.parse("racwdl"), 
            startsOn: startsOn,
            expiresOn: expiresOn,
        };
      
        const sasToken = generateBlobSASQueryParameters(
            sasOptions,
            sharedKeyCredential
        ).toString();
        
        return sasToken;
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

    async initAEMUpload(folderPath, fileName) {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${this.aemAccessToken}`
            },
            body: new URLSearchParams({
                'fileName': fileName,
                'fileSize': '1',
            })
        };
        
        const response = await fetch(`${this.aemAuthorHost}${folderPath}.initiateUpload.json`, options);
        if (!response.ok) {
            throw new Error(`AEM upload initiation failed: ${response.statusText}`);
        }

        const jsonResponse = await response.json();
        return {
            uploadToken: jsonResponse.files[0].uploadToken,
            uploadURI: jsonResponse.files[0].uploadURIs[0],
            mimeType: jsonResponse.files[0].mimeType,
            fileName: jsonResponse.files[0].fileName,
            completeURI: jsonResponse.completeURI,
            setCookie: response.headers.get('set-cookie')
        };
    }

    async completeAEMUpload(initResult) {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${this.aemAccessToken}`,
                'Cookie': initResult.setCookie
            },
            body: new URLSearchParams({
                'fileName': initResult.fileName,
                'mimeType': initResult.mimeType,
                'uploadToken': initResult.uploadToken,
            })
        };
        
        const response = await fetch(this.aemAuthorHost + initResult.completeURI, options);
        if (!response.ok) {
            throw new Error(`AEM upload completion failed: ${response.statusText}`);
        }
        return await response.json();
    }

    async moveAsset(downloadUrl, uploadUrl, inputHeaders = {}, outputHeaders = {}) {
        const generatedId = uuid4();
        const filePath = `${generatedId}/temp`;
        
        await downloadFileConcurrently(downloadUrl, filePath, 
            { 
                mkdirs: true, 
                headers: inputHeaders, 
                retryEnabled:true,
                retryAllErrors:true 
            }
        );
        await uploadFileConcurrently(filePath, uploadUrl, { headers: outputHeaders });
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
            const resultStatus = await response.json();
            if ('not_started' == resultStatus.status || 'running' == resultStatus.status) {
                await this.waitBeforeContinue(1000);
                return await this.fetchResultStatus(url);
            } else {
                return resultStatus;
            }
        } else {
            throw new Error(`Error fetching result status: ${response.statusText}`);
        }
      }

    async mergeData(outputPresignedUrl, dataSourcePath) {
        const templatePresignedUrl = `${this.azureStorageContainerUrl}/indesign-api/${this.generatedId}-template.indd?${this.azureSasToken}`;
        const dataSourcePresignedUrl = `${this.azureStorageContainerUrl}/indesign-api/${this.generatedId}-data.csv?${this.azureSasToken}`;
      
        const initAEMUploadResult = await this.initAEMUpload(`${DAM_ROOT_PATH}${this.automationRelativePath}/outputs`, 'merged.indd');
        
        const promises = [];
      
        const templatePromise = this.moveAsset(`${this.aemAuthorHost}${this.assetPath}`, templatePresignedUrl, { Authorization: `Bearer ${this.aemAccessToken}` }, { 'x-ms-blob-type': 'BlockBlob' });
        promises.push(templatePromise);
        
        const dataPromise = this.moveAsset(`${this.aemAuthorHost}${dataSourcePath}`, dataSourcePresignedUrl, { Authorization: `Bearer ${this.aemAccessToken}` }, { 'x-ms-blob-type': 'BlockBlob' });
        promises.push(dataPromise);
      
        const imagePaths = await this.retrieveAssetPathsFromPath(`${this.automationRelativePath}/inputs`);
      
        const imageSources = [];
      
        for (const imagePath of imagePaths) {
            const imageBasename = path.parse(imagePath).base;
            const imageSourcePresignedUrl = `${this.azureStorageContainerUrl}/indesign-api/${this.generatedId}-${imageBasename}?${this.azureSasToken}`;
            imageSources.push({name: imageBasename, presignedUrl: imageSourcePresignedUrl});
            const promise = this.moveAsset(`${this.aemAuthorHost}${imagePath}`, imageSourcePresignedUrl, { Authorization: `Bearer ${this.aemAccessToken}` }, { 'x-ms-blob-type': 'BlockBlob' });
            promises.push(promise);
        }
      
        await Promise.all(promises);
      
        const data = {
            assets: [
                {
                    source: {
                        url: templatePresignedUrl,
                        storageType: 'Azure'
                    },
                    destination: 'destination.indd'
                },
                {
                    source: {
                        url: dataSourcePresignedUrl,
                        storageType: 'Azure'
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
                        url: outputPresignedUrl,
                        storageType: 'Azure'
                    },
                    source: 'outputfolder/range1/merged.indd'
                }
            ]
        };
      
        for (const imageSource of imageSources) {
            data.assets.push(
                {
                    source: {
                        url: imageSource.presignedUrl,
                        storageType: 'Azure'
                    },
                    destination: imageSource.name
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

            await this.moveAsset(outputPresignedUrl, initAEMUploadResult.uploadURI);
            await this.completeAEMUpload(initAEMUploadResult);
            
            const resultStatus = await this.fetchResultStatus(result.statusUrl);
            const recordIndex = resultStatus.data.records[0].recordIndex;
            const recordIndexBounds = recordIndex.split("-");
      
            for (const imageSource of imageSources) {
                await this.deleteFile(imageSource.presignedUrl);
            }
      
            await this.deleteFile(templatePresignedUrl);
            await this.deleteFile(dataSourcePresignedUrl);
      
            return recordIndexBounds;
        } else {
            throw new Error(`Error merging data: ${response.statusText}`);
        }
    }

    async deleteFile(url) {
        const options = {
            method: 'DELETE'
        };
        
        const response = await fetch(url, options);
        if (!response.ok) {     
            throw new Error(`Error deleting file: ${response.statusText}`);
        }
    }

    async createRendition(inputPresignedUrl, recordIndexBounds) {
        const data = {
            assets: [
                {
                    source: {
                        url: inputPresignedUrl,
                        storageType: 'Azure'
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
      
            const outputPresignedUrl = `${this.azureStorageContainerUrl}/indesign-api/${this.generatedId}-merged-${i}.${fileExtension}?${this.azureSasToken}`;
            const initAEMUploadResult = await this.initAEMUpload(`${DAM_ROOT_PATH}${this.automationRelativePath}/outputs`, `merged-${i}.${fileExtension}`);
            outputs.push({outputPresignedUrl: outputPresignedUrl, initAEMUploadResult: initAEMUploadResult});
      
            let fileName = null;
            if ('pdf' == fileExtension) {
                const number = i < 10 ? `0${i}` : i;
                fileName = `merged/merged_${number}.${fileExtension}`;
            }
            else {
                fileName = `merged.${fileExtension}`;
                if (i > 1) {
                    fileName = `merged${i}.${fileExtension}`;
                }
            }
            
      
            data.outputs.push(
                {
                    destination: {
                        url: outputPresignedUrl,
                        storageType: 'Azure'
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
                const promise = this.moveAsset(output.outputPresignedUrl, output.initAEMUploadResult.uploadURI);
                promises.push(promise);
            }
            await Promise.all(promises);
            for (const output of outputs) {
                await this.completeAEMUpload(output.initAEMUploadResult);
                await this.deleteFile(output.outputPresignedUrl);
            }
            return await response.json();
        } else {
            throw new Error(`Error creating renditions: ${response.statusText}`);
        }
    }

    async executeAutomation() {
        const dataSourcePath = `${DAM_ROOT_PATH}${this.automationRelativePath}/data.csv`;
        const tempPresignedUrl = `${this.azureStorageContainerUrl}/indesign-api/${this.generatedId}-temp.indd?${this.azureSasToken}`;

        const recordIndexBounds = await this.mergeData(tempPresignedUrl, dataSourcePath);
        await this.createRendition(tempPresignedUrl, recordIndexBounds);

        await this.deleteFile(tempPresignedUrl);
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