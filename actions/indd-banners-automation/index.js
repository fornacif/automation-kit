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
        this.outputFormatType = rendition.instructions.outputFormatType || 'image/jpeg';
        this.resolution = rendition.instructions.resolution || 300;
        this.files = await filesLib.init();
        this.directBinaryAccess = rendition.instructions.directBinaryAccess === 'true';
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

    async uploadFileToAEM(source, targetFolderPath, fileName) {
        let filePath = source;
        let tempId = null;
    
        try {
            // If source is a URL, download it first
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

            const presignedUrl = await this.generatePresignURL()
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

    async parseCsvAndBuildPresignedUrl(csvContent) {
        const rows = csvContent.trim().split('\n');
        const dataRows = rows.slice(1);
        
        const rowElements = dataRows.map(row => {
          const columns = row.split(',');
          
          return {
            variation: columns[0].replace(/^"|"$/g, ''),
            lang: columns[1].replace(/^"|"$/g, '')
          };
        });

        const datasourcePresignedUrl = await this.generatePresignURL();

        const tempPath = uuid4();
        fs.writeFileSync(tempPath, csvContent, 'utf16le');

        await uploadFileConcurrently(tempPath, datasourcePresignedUrl);

        this.files.delete(tempPath);

        return { datasourcePresignedUrl, rowElements };
    }

    async retrieveInputs() { 
        const inputsRelativePath = `${this.automationRelativePath}/inputs`;
        const response = await this.executeAEMRequest('GET', 'application/json', 'json', `/api/assets/${inputsRelativePath}.json`);
    
        const inputs = {
            fontPaths: [],
            imagePaths: []
        };

        // Return early if no entities
        if (!response.entities?.length) {
            return inputs;
        }

        const assets = response.entities.filter(entity => entity.class == 'assets/asset');
            
        for (const asset of assets) {
            const filename = asset.properties.name;
            const fileFormat = asset.properties.metadata['dc:format'];
            const filePath = `${DAM_ROOT_PATH}${inputsRelativePath}/${filename}`;

            if (/^font\/(otf|ttf)$/.test(fileFormat)) {
                inputs.fontPaths.push(filePath);  
            }

            if (/^image\/.*$/.test(fileFormat)) {
                inputs.imagePaths.push(filePath);
            }

            if ('text/csv' == fileFormat) {
                const csvContent = await this.executeAEMRequest('GET', 'application/json', 'text', filePath);

                const { datasourcePresignedUrl, rowElements } = await this.parseCsvAndBuildPresignedUrl(csvContent);
                inputs.datasourcePresignedUrl = datasourcePresignedUrl;
                inputs.rowElements = rowElements;
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

                const { datasourcePresignedUrl, rowElements } = await this.parseCsvAndBuildPresignedUrl(csvContent);
                inputs.datasourcePresignedUrl = datasourcePresignedUrl;
                inputs.rowElements = rowElements;
            }

        };
    
        this.renditionContent = `---- Retrieved Inputs ----\n ${JSON.stringify(inputs, null, 2)}`;
        
        return inputs; 
    }

    buildRequestOptions(data) {
        const options = {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.inDesignApiAccessToken}`,
                'x-api-key': this.inDesignApiKey,
                /*'x-enable-beta': 'true'*/
            }
        };
    
        if (data) {
            options.method = 'POST',
            options.body = JSON.stringify(data);
        }
    
        return options;
    }

    async buildSourceAssets(inputs, data) {
        for (const imagePath of inputs.imagePaths) {
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
     
        for (const fontPath of inputs.fontPaths) {
            const fontBasename = path.parse(fontPath).base;
            const fontPresignedUrl = await this.getAssetPresignedUrl(fontPath);
            data.assets.push(
                {
                    source: {
                        url: fontPresignedUrl
                    },
                    destination: `fontFolder/${fontBasename}`
                }
            );
        }
    }

    async getPresignedUrlWithRetry(path, maxRetries = 10, delayMs = 500) {
        let presignedUrl = '';
        let attempts = 0;
      
        while (!presignedUrl && attempts < maxRetries) {
            attempts++;
            presignedUrl = await this.getAssetPresignedUrl(path);       
            if (presignedUrl == '') {
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
      
        if (presignedUrl == '') {
          throw new Error(`Failed to get presigned URL after ${maxRetries} attempts`);
        }
      
        return presignedUrl;
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

    async mergeData(outputPresignedUrl, outputFolderPath, inputs) {
        const templatePresignedUrl = await this.getAssetPresignedUrl(this.assetPath);

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
                        url: inputs.datasourcePresignedUrl
                    },
                    destination: 'datasource.csv'
                }
            ],
            params: {
                outputMediaType: 'application/x-indesign',
                targetDocument: 'destination.indd',
                outputFolderPath: 'outputfolder',
                outputFileBaseString: 'merged-template',
                dataSource: 'datasource.csv',
                imagePlacementOptions: {
                    fittingOption: 'content_aware_fit'
                },
                generalSettings: {
                    fonts: {
                        fontsDirectories: ['fontFolder']
                    }
                }
            },
            outputs: [
                {
                    destination: {
                        url: outputPresignedUrl
                    },
                    source: 'outputfolder/range1/merged-template.indd'
                }
            ]
        };

        await this.buildSourceAssets(inputs, data);
      
        const options = this.buildRequestOptions(data);

        this.renditionContent += '---- Retrieved Inputs for Merge Data ----\n' + JSON.stringify(data, null, 2);

        const response = await fetch(`https://indesign.adobe.io/v3/merge-data`, options);

        if (response.ok) {
            const result = await response.json();

            // Block until file has been uploaded
            const assetFilename = path.parse(this.assetPath).name;
            await this.uploadFileToAEM(outputPresignedUrl, outputFolderPath, `${assetFilename}-merged.indd`);
            
            const resultStatus = await this.fetchResultStatus(result.statusUrl);
            this.createAEMTask('INDD Automation', `Merge Data produced the following warnings.\n${JSON.stringify(resultStatus.data.warnings, null, 2).replace(/"/g, '').replace(/'/g, "")}`);
            
            const recordIndex = resultStatus.data.records[0].recordIndex;
            const recordIndexBounds = recordIndex.split("-");
      
            return recordIndexBounds;
        } else {
            throw new Error(`Error merging data: ${response.statusText}`);
        }
    }

    async createRendition(inputPresignedUrl, recordIndexBounds, outputFolderPath, inputs) {
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
                createSeparateFiles: true,
                generalSettings: {
                    fonts: {
                        fontsDirectories: ['fontFolder']
                    }
                }
            },
            outputs: []
        };

        const formatMap = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'application/pdf': 'pdf'
        };
        
        let fileExtension = formatMap[this.outputFormatType];
      
        const outputs = [];
      
        for (let i = recordIndexBounds[0]; i <= recordIndexBounds[1]; i++) {
            if (!fileExtension) {
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

        await this.buildSourceAssets(inputs, data);
      
        const options = this.buildRequestOptions(data);

        this.renditionContent += '---- Retrieved Inputs for Create Rendition ----\n' + JSON.stringify(data, null, 2);
      
        const response = await fetch(`https://indesign.adobe.io/v3/create-rendition`, options);
      
        if (response.ok) { 
            const promises = [];

            const result = await response.json();
            const resultStatus = await this.fetchResultStatus(result.statusUrl);

            this.createAEMTask('INDD Automation', `Create Rendition produced the following warnings.\n${JSON.stringify(resultStatus.data.outputs[0].warnings, null, 2).replace(/"/g, '').replace(/'/g, "")}`);

            for (let i = 0; i < outputs.length; i++) {
                const assetFilename = path.parse(this.assetPath).name;
                const filename = `${assetFilename}-${inputs.rowElements[i].variation}-${inputs.rowElements[i].lang}.${fileExtension}`;
                const promise = this.uploadFileToAEM(outputs[i].outputPresignedUrl, outputFolderPath, filename);
                promises.push(promise);
            }
            await Promise.all(promises);
        } else {
            throw new Error(`Error creating renditions: ${response.statusText}`);
        }
    }

    async executeAutomation() {
        const outputFolderPath = `${DAM_ROOT_PATH}${this.automationRelativePath}/outputs`;
        const tempPresignedUrl = await this.generatePresignURL();

        const inputs = await this.retrieveInputs();

        const recordIndexBounds = await this.mergeData(tempPresignedUrl, outputFolderPath, inputs);
        await this.createRendition(tempPresignedUrl, recordIndexBounds, outputFolderPath, inputs);
    }

    async createAEMRendition(path) {
        await this.files.write('inputs.json', this.renditionContent);
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