'use strict'

const BaseService = require('../common/base-service');
const path = require('path');
const { downloadFileConcurrently, uploadFileConcurrently } = require('@adobe/httptransfer');
const { v4: uuid4 } = require('uuid');

const AUDIO_VIDEO_GENERATE_SPEECH_URL = 'https://audio-video-api.adobe.io/v1/generate-speech';

class FireflyTextToSpeechService extends BaseService {
    constructor() {
        super();
        this.localeCode = null;
        this.voiceId = null;
    }

    async initialize(rendition, params) {
        await super.initialize(rendition, params);

        const basename = path.basename(this.assetPath, path.extname(this.assetPath));
        const localeMatch = basename.match(/-([a-z]{2}-[A-Z]{2})$/);
        this.localeCode = localeMatch ? localeMatch[1] : 'en-US';
        this.voiceId = rendition.instructions.voiceId || params.voiceId;
    }

    async getAssetTextContent() {
        const response = await fetch(`${this.aemAuthorHost}${this.assetPath}`, {
            headers: {
                'Authorization': `Bearer ${this.aemAccessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to download text asset: ${response.statusText}`);
        }

        return await response.text();
    }

    async generateSpeech(text, localeCode, retryCount = 0) {
        const response = await fetch(AUDIO_VIDEO_GENERATE_SPEECH_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                script: {
                    text: text,
                    mediaType: 'text/plain',
                    localeCode: localeCode
                },
                voiceId: this.voiceId,
                output: {
                    mediaType: 'audio/wav'
                }
            })
        });

        if (response.status === 429) {
            const maxRetries = 4;
            if (retryCount >= maxRetries) {
                throw new Error(`Failed to generate speech: Too Many Requests after ${maxRetries} retries`);
            }
            const waitTime = Math.pow(2, retryCount) * 30000;
            await this.waitBeforeContinue(waitTime);
            return await this.generateSpeech(text, localeCode, retryCount + 1);
        }

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to generate speech: ${response.statusText} - ${errorText}`);
        }

        return await response.json();
    }

    async executeAutomation() {
        let renditionContent = `---- Firefly Text to Speech ----\n`;
        renditionContent += `Asset Path: ${this.assetPath}\n`;
        renditionContent += `Voice ID: ${this.voiceId}\n`;
        renditionContent += `Locale Code: ${this.localeCode}\n`;

        const textContent = await this.getAssetTextContent();
        renditionContent += `\nText Content Length: ${textContent.length} characters`;

        const generateResult = await this.generateSpeech(textContent, this.localeCode);
        const statusUrl = generateResult.statusUrl;
        renditionContent += `\nStatus URL: ${statusUrl}`;

        const result = await this.pollForResults(statusUrl);
        renditionContent += `\nSpeech generated successfully`;

        const audioUrl = result.output?.destination?.url;
        if (!audioUrl) {
            throw new Error('No audio URL returned from generate-speech API');
        }
        renditionContent += `\nAudio URL: ${audioUrl}`;

        const assetBasename = path.basename(this.assetPath, path.extname(this.assetPath));
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}`;
        const newAssetName = `${assetBasename}-speech.wav`;

        const generatedId = uuid4();
        const tempFilePath = `${generatedId}/temp.wav`;

        try {
            await downloadFileConcurrently(audioUrl, tempFilePath, { mkdirs: true });

            const presignedUrl = await this.files.generatePresignURL(generatedId, {
                expiryInSeconds: this.getDefaultExpirySeconds(),
                permissions: this.getDefaultFilePermissions()
            });

            await uploadFileConcurrently(tempFilePath, presignedUrl);
            await this.uploadFileToAEM(presignedUrl, outputFolderPath, newAssetName);

            renditionContent += `\nNew Asset Created: ${outputFolderPath}/${newAssetName}`;
        } finally {
            await this.files.delete(`${generatedId}/`);
        }

        return { renditionContent };
    }

    getActionDisplayName() {
        return 'Firefly Text to Speech';
    }
}

async function execute(rendition, params) {
    const service = new FireflyTextToSpeechService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
