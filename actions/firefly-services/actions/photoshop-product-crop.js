'use strict'

const BaseService = require('../common/base-service');
const path = require('path');
const { StorageType, ImageFormatType } = require("@adobe/photoshop-apis");
const { downloadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');

class ProductCropAutomationService extends BaseService {
    constructor() {
        super();
        this.outputFormatType = null;
        this.paddingWidth = null;
        this.paddingHeight = null;
        this.imageWidth = null;
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);
        this.outputFormatType = rendition.instructions.outputFormatType || 'image/jpeg';
        this.paddingWidth = rendition.instructions.paddingWidth ? parseInt(rendition.instructions.paddingWidth, 10) : 50;
        this.paddingHeight = rendition.instructions.paddingHeight ? parseInt(rendition.instructions.paddingHeight, 10) : 50;
        this.imageWidth = rendition.instructions.imageWidth ? parseInt(rendition.instructions.imageWidth, 10) : null;
    }

    createPhotoshopInput(externalUrl) {
        return {
            href: externalUrl,
            storage: StorageType.EXTERNAL
        };
    }

    createPhotoshopOutput(externalUrl, formatType) {
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

    async productCrop(inputUrl, outputUrl, width, height) {
        const photoshopOptions = {
            unit: 'Pixels',
            width: width,
            height: height
        };

        const productCropResponse = await fetch('https://image.adobe.io/pie/psdService/productCrop', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: [this.createPhotoshopInput(inputUrl)],
                options: photoshopOptions,
                outputs: [this.createPhotoshopOutput(outputUrl, this.outputFormatType)]
            })
        });

        if (!productCropResponse.ok) {
            throw new Error(`Product Crop failed: ${productCropResponse.statusText}`);
        }

        const productCropResult = await productCropResponse.json();
        await this.pollForResults(productCropResult['_links'].self.href, { apiType: 'photoshop' });
    }

    async resize(inputUrl, outputUrl, imageWidth) {
        const output = this.createPhotoshopOutput(outputUrl, this.outputFormatType);
        output.width = imageWidth;

        const renditionCreateResponse = await fetch('https://image.adobe.io/pie/psdService/renditionCreate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                inputs: [this.createPhotoshopInput(inputUrl)],
                outputs: [output]
            })
        });

        if (!renditionCreateResponse.ok) {
            throw new Error(`Resize to ${imageWidth}x${imageWidth} failed: ${renditionCreateResponse.statusText}`);
        }

        const renditionCreateResult = await renditionCreateResponse.json();
        await this.pollForResults(renditionCreateResult['_links'].self.href, { apiType: 'photoshop' });
    }

    async executeAutomation() {
        const inputUrl = await this.getAssetPresignedUrl(this.assetPath);

        const tempId = uuid4();
        const outputUrl = await this.files.generatePresignURL(tempId, {
            expiryInSeconds: this.getDefaultExpirySeconds(),
            permissions: this.getDefaultFilePermissions()
        });

        let renditionContent = `---- Product Crop Automation ----\n`;
        renditionContent += `Asset Path: ${this.assetPath}\n`;
        renditionContent += `Output Format: ${this.outputFormatType}\n`;
        if (this.paddingWidth > 0 && this.paddingHeight > 0) {
            renditionContent += `Padding: ${this.paddingWidth}x${this.paddingHeight}\n`;
        }
        if (this.imageWidth) {
            renditionContent += `Final Size: ${this.imageWidth}\n`;
        }

        await this.productCrop(inputUrl, outputUrl, this.paddingWidth, this.paddingHeight);

        let finalOutputUrl = outputUrl;

        if (this.imageWidth) {
            const resizeTempId = uuid4();
            const resizedOutputUrl = await this.files.generatePresignURL(resizeTempId, {
                expiryInSeconds: this.getDefaultExpirySeconds(),
                permissions: this.getDefaultFilePermissions()
            });

            await this.resize(outputUrl, resizedOutputUrl, this.imageWidth);
            finalOutputUrl = resizedOutputUrl;
        }

        const assetBasename = path.basename(this.assetPath, path.extname(this.assetPath));
        const fileExtension = this.outputFormatType === ImageFormatType.IMAGE_PNG ? 'png' : 'jpeg';
        const newAssetName = `${assetBasename}-product-crop.${fileExtension}`;
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}`;

        await this.uploadFileToAEM(finalOutputUrl, outputFolderPath, newAssetName);
        renditionContent += `\nNew Asset Created: ${outputFolderPath}/${newAssetName}`;

        return { renditionContent };
    }

    getActionDisplayName() {
        return 'Product Crop Automation';
    }
}

async function execute(rendition, params) {
    const service = new ProductCropAutomationService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
