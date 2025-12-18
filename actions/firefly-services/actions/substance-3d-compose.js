'use strict'

const BaseService = require('../common/base-service');
const path = require('path');

const SUBSTANCE_3D_SPACES_URL = 'https://s3d.adobe.io/v1/spaces';
const SUBSTANCE_3D_COMPOSE_URL = 'https://s3d.adobe.io/v1/composites/compose';

class Substance3DComposeService extends BaseService {
    constructor() {
        super();
        this.accessToken = null;
        this.cameraName = null;
        this.heroAsset = null;
        this.prompt = null;
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);
        
        this.accessToken = rendition.instructions.substance3dAccessToken;
        
        if (!this.accessToken) {
            throw new Error('Substance 3D access token not found in rendition.instructions.substance3dAccessToken');
        }

        this.cameraName = rendition.instructions.cameraName || null;
        this.heroAsset = rendition.instructions.heroAsset || null;
        this.prompt = rendition.instructions.prompt || null;
    }

    async getBlobFromAssetUrl(assetUrl) {
        const response = await fetch(assetUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch asset: ${response.statusText}`);
        }
        return await response.blob();
    }

    async saveModelToSpaces(blob) {
        const form = new FormData();
        const assetFilename = path.basename(this.assetPath);
        form.append('asset', blob, assetFilename);

        const response = await fetch(SUBSTANCE_3D_SPACES_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`
            },
            body: form
        });

        if (!response.ok) {
            throw new Error(`Saving model to Spaces failed: ${response.statusText}`);
        }

        const result = await response.json();
        return result.id;
    }

    async compose3dScene(substance3dSpaceId) {
        const body = {
            sources: [
                {
                    space: {
                        id: substance3dSpaceId
                    }
                }
            ]
        };

        if (this.cameraName) {
            body.cameraName = this.cameraName;
        }
        if (this.heroAsset) {
            body.heroAsset = this.heroAsset;
        }
        if (this.prompt) {
            body.prompt = this.prompt;
        }

        const response = await fetch(SUBSTANCE_3D_COMPOSE_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            throw new Error(`Compose 3D Scene failed: ${response.statusText}`);
        }

        const result = await response.json();
        return result.url;
    }

    async executeAutomation() {
        let renditionContent = `---- Substance 3D Compose ----\n`;
        renditionContent += `Asset Path: ${this.assetPath}\n`;
        if (this.cameraName) renditionContent += `Camera Name: ${this.cameraName}\n`;
        if (this.heroAsset) renditionContent += `Hero Asset: ${this.heroAsset}\n`;
        if (this.prompt) renditionContent += `Prompt: ${this.prompt}\n`;

        // Step 1: Get the source model URL
        const sourceModelUrl = await this.getAssetPresignedUrl(this.assetPath);
        renditionContent += `\nSource Model: ${this.assetPath}`;

        // Step 2: Download model and save to Substance Spaces
        const blob = await this.getBlobFromAssetUrl(sourceModelUrl);
        const substanceSpaceId = await this.saveModelToSpaces(blob);
        renditionContent += `\nSubstance Space ID: ${substanceSpaceId}`;

        // Step 3: Trigger compose job
        const jobUrl = await this.compose3dScene(substanceSpaceId);
        renditionContent += `\nCompose Job URL: ${jobUrl}`;

        // Step 4: Wait for compose to complete
        const pollResult = await this.pollForResults(jobUrl, { 
            apiType: 'substance3d', 
            authToken: this.accessToken 
        });
        const composeUrl = pollResult.result.outputs[0].image.url;
        renditionContent += `\nCompose URL: ${composeUrl}`;

        // Step 5: Upload composed image to AEM
        const assetFilename = path.parse(this.assetPath).name;
        const newAssetName = `${assetFilename}-s3d-compose.png`;
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}`;

        await this.uploadFileToAEM(composeUrl, outputFolderPath, newAssetName);
        renditionContent += `\nNew Asset Created: ${outputFolderPath}/${newAssetName}`;

        return { renditionContent };
    }

    getActionDisplayName() {
        return 'Substance 3D Compose';
    }
}

async function execute(rendition, params) {
    const service = new Substance3DComposeService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };







