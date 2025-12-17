'use strict'

const BaseService = require('../common/base-service');
const path = require('path');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');

const FIREFLY_GENERATE_SIMILAR_URL = 'https://firefly-api.adobe.io/v3/images/generate-similar-async';

class FireflyGenerateSimilarService extends BaseService {
    constructor() {
        super();
        this.numVariations = 1;
        this.imageWidth = null;
        this.imageHeight = null;
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);
        this.numVariations = rendition.instructions.numVariations ? parseInt(rendition.instructions.numVariations, 10) : 1;
        this.imageWidth = rendition.instructions.imageWidth ? parseInt(rendition.instructions.imageWidth, 10) : 2688;
        this.imageHeight = rendition.instructions.imageHeight ? parseInt(rendition.instructions.imageHeight, 10) : 1536;
    }

    getFileFormat() {
        const ext = path.extname(this.assetPath).toLowerCase();

        if (ext === '.png') {
            return { extension: 'png', contentType: 'image/png' };
        } else if (ext === '.webp') {
            return { extension: 'webp', contentType: 'image/webp' };
        }

        return { extension: 'jpeg', contentType: 'image/jpeg' };
    }

    async generateSimilarImages(uploadId, retryCount = 0) {
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

        if (response.status === 429) {
            const maxRetries = 4;
            if (retryCount >= maxRetries) {
                throw new Error(`Failed to generate similar images: Too Many Requests after ${maxRetries} retries`);
            }
            const waitTime = Math.pow(2, retryCount) * 30000;
            await this.waitBeforeContinue(waitTime);
            return await this.generateSimilarImages(uploadId, retryCount + 1);
        }

        if (!response.ok) {
            throw new Error(`Failed to generate similar images: ${response.statusText}`);
        }

        return await response.json();
    }

    async executeAutomation() {
        const fileFormat = this.getFileFormat();

        let renditionContent = `---- Firefly Generate Similar ----\n`;
        renditionContent += `Asset Path: ${this.assetPath}\n`;
        renditionContent += `Output Format: ${fileFormat.extension}\n`;
        renditionContent += `Num Variations: ${this.numVariations}\n`;
        renditionContent += `Image Size: ${this.imageWidth}x${this.imageHeight}\n`;

        const sourceImageUrl = await this.getAssetPresignedUrl(this.assetPath);
        renditionContent += `\nSource Image: ${this.assetPath}`;

        const uploadId = await this.uploadImageToFireflyStorage(sourceImageUrl, fileFormat.contentType);
        renditionContent += `\nFirefly Upload ID: ${uploadId}`;

        const generateResult = await this.generateSimilarImages(uploadId);
        const statusUrl = generateResult.statusUrl;
        renditionContent += `\nStatus URL: ${statusUrl}`;

        const pollResult = await this.pollForResults(statusUrl);
        const outputs = pollResult.result.outputs;
        renditionContent += `\nGenerated ${outputs.length} variation(s)`;

        const assetBasename = path.basename(this.assetPath, path.extname(this.assetPath));
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}`;

        const uploadPromises = outputs.map(async (output, i) => {
            const imageUrl = output.image.url;
            const newAssetName = `${assetBasename}-similar-${i + 1}.${fileFormat.extension}`;

            const generatedId = uuid4();
            const tempFilePath = `${generatedId}/temp.${fileFormat.extension}`;

            try {
                await downloadFileConcurrently(imageUrl, tempFilePath, { mkdirs: true });

                const presignedUrl = await this.files.generatePresignURL(generatedId, {
                    expiryInSeconds: this.getDefaultExpirySeconds(),
                    permissions: this.getDefaultFilePermissions()
                });

                await uploadFileConcurrently(tempFilePath, presignedUrl);
                await this.uploadFileToAEM(presignedUrl, outputFolderPath, newAssetName);

                return `\nNew Asset Created: ${outputFolderPath}/${newAssetName}`;
            } finally {
                await this.files.delete(`${generatedId}/`);
            }
        });

        const results = await Promise.all(uploadPromises);
        renditionContent += results.join('');

        return { renditionContent };
    }

    getActionDisplayName() {
        return 'Firefly Generate Similar';
    }
}

async function execute(rendition, params) {
    const service = new FireflyGenerateSimilarService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
