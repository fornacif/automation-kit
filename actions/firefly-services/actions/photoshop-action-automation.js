'use strict'

const BaseService = require('../common/base-service');
const { ServerToServerTokenProvider } = require("@adobe/firefly-services-common-apis");
const { PhotoshopClient, StorageType, ImageFormatType } = require("@adobe/photoshop-apis");
const { downloadFileConcurrently } = require('@adobe/httptransfer');

class PhotoshopActionAutomationService extends BaseService {
    constructor() {
        super();
        this.photoshopClient = null;
        this.outputFormatType = null;
        this.rendition = null;
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);

        const authProvider = new ServerToServerTokenProvider({
            clientId: params.fireflyServicesApiClientId,
            clientSecret: params.fireflyServicesApiClientSecret,
            scopes: params.fireflyServicesApiScopes
        }, {
            autoRefresh: true
        });

        this.photoshopClient = new PhotoshopClient({
            tokenProvider: authProvider,
            clientId: params.fireflyServicesApiClientId
        });

        this.outputFormatType = rendition.instructions.outputFormatType;
        this.rendition = rendition;
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

    async executeAutomation() {
        const inputUrl = await this.getAssetPresignedUrl(this.assetPath);

        const photoshopOptions = {
            actionJSON: [
                {"_obj":"imageSize","constrainProportions":true,"interfaceIconFrameDimmed":{"_enum":"interpolationType","_value":"deepUpscale"},"noise":0,"scaleStyles":true,"width":{"_unit":"pixelsUnit","_value":3000.0}}
            ]
        };

        const outputUrl = await this.generatePresignURL();

        await this.photoshopClient.playPhotoshopActionsJson({
            inputs: [this.createPhotoshopInput(inputUrl)],
            options: photoshopOptions,
            outputs: [this.createPhotoshopOutput(outputUrl, this.outputFormatType)]
        });

        await downloadFileConcurrently(outputUrl, this.rendition.path);

        let renditionContent = `---- Photoshop Action Automation ----\n`;
        renditionContent += `Asset Path: ${this.assetPath}\n`;
        renditionContent += `Output Format: ${this.outputFormatType}\n`;
        renditionContent += `Rendition Created: ${this.rendition.path}\n`;

        return { renditionContent, shouldCreateRendition: false };
    }

    getActionDisplayName() {
        return 'Photoshop Action Automation';
    }
}

async function execute(rendition, params) {
    const service = new PhotoshopActionAutomationService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
