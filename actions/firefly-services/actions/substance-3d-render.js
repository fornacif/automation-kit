'use strict'

const { error } = require('console');
const BaseService = require('../common/base-service');
const path = require('path');

const SUBSTANCE_3D_SPACES_URL = 'https://s3d.adobe.io/v1/spaces';
const SUBSTANCE_3D_RENDER_URL = 'https://s3d.adobe.io/v1/scenes/render-basic';

class Substance3DRenderService extends BaseService {
    constructor() {
        super();
        this.accessToken = null;
        this.zoomFactor = 1;
        this.focal = 50;
        this.azimuths = [0];
        this.altitude = 0;
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);
        
        this.accessToken = rendition.instructions.substance3dAccessToken;
        
        if (!this.accessToken) {
            throw new Error('Substance 3D access token not found in rendition.instructions.substance3dAccessToken');
        }

        this.zoomFactor = rendition.instructions.zoomFactor ? parseFloat(rendition.instructions.zoomFactor) : 1;
        this.focal = rendition.instructions.focal ? parseFloat(rendition.instructions.focal) : 50;
        this.azimuths = rendition.instructions.azimuths 
            ? rendition.instructions.azimuths.split(',').map(a => parseFloat(a.trim())) 
            : [0];
        this.altitude = rendition.instructions.altitude ? parseFloat(rendition.instructions.altitude) : 0;
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

    async render3dModel(substance3dSpaceId, azimuth) {
        const response = await fetch(SUBSTANCE_3D_RENDER_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                scene: {
                    camera: {
                        focal: this.focal,
                        transform: {
                            azimuthAltitude: {
                                azimuth: azimuth,
                                altitude: this.altitude,
                                lookAt: [0, 0, 0],
                                radius: 1
                            }
                        }
                    }
                },
                autoFraming: {
                    algorithm: 'frustum_fit',
                    zoomFactor: this.zoomFactor
                },
                sources: [
                    {
                        space: {
                            id: substance3dSpaceId
                        }
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Render 3D Model failed: ${response.statusText}`);
        }

        const result = await response.json();
        return result.url;
    }

    async renderAndUpload(substanceSpaceId, azimuth, outputFolderPath, assetFilename) {
        // Trigger render job
        const jobUrl = await this.render3dModel(substanceSpaceId, azimuth);

        // Wait for render to complete
        const pollResult = await this.pollForResults(jobUrl, { 
            apiType: 'substance3d', 
            authToken: this.accessToken 
        });
        const renderUrl = pollResult.result.renderUrl;

        // Upload rendered image to AEM
        const newAssetName = `${assetFilename}-s3d-render-${azimuth}.png`;
        await this.uploadFileToAEM(renderUrl, outputFolderPath, newAssetName);

        return {
            azimuth,
            jobUrl,
            renderUrl,
            assetPath: `${outputFolderPath}/${newAssetName}`
        };
    }

    async executeAutomation() {
        let renditionContent = `---- Substance 3D Render ----\n`;
        renditionContent += `Asset Path: ${this.assetPath}\n`;
        renditionContent += `Zoom Factor: ${this.zoomFactor}\n`;
        renditionContent += `Focal: ${this.focal}\n`;
        renditionContent += `Azimuths: ${this.azimuths.join(', ')}\n`;
        renditionContent += `Altitude: ${this.altitude}\n`;

        // Step 1: Get the source model URL
        const sourceModelUrl = await this.getAssetPresignedUrl(this.assetPath);
        renditionContent += `\nSource Model: ${this.assetPath}`;

        // Step 2: Download model and save to Substance Spaces
        const blob = await this.getBlobFromAssetUrl(sourceModelUrl);
        const substanceSpaceId = await this.saveModelToSpaces(blob);
        renditionContent += `\nSubstance Space ID: ${substanceSpaceId}`;

        // Step 3: Render all azimuths in parallel
        const assetFilename = path.parse(this.assetPath).name;
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}`;

        const renderPromises = this.azimuths.map(azimuth => 
            this.renderAndUpload(substanceSpaceId, azimuth, outputFolderPath, assetFilename)
        );

        const results = await Promise.all(renderPromises);

        // Log results
        for (const result of results) {
            renditionContent += `\n\nAzimuth: ${result.azimuth}`;
            renditionContent += `\nRender Job URL: ${result.jobUrl}`;
            renditionContent += `\nRender URL: ${result.renderUrl}`;
            renditionContent += `\nNew Asset Created: ${result.assetPath}`;
        }

        return { renditionContent };
    }

    getActionDisplayName() {
        return 'Substance 3D Render';
    }
}

async function execute(rendition, params) {
    const service = new Substance3DRenderService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };