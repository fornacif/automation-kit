'use strict'

const BaseService = require('../common/base-service');

const AUDIO_VIDEO_VOICES_URL = 'https://audio-video-api.adobe.io/v1/voices';

class FireflyAvailableVoicesService extends BaseService {
    async getAvailableVoices() {
        const response = await fetch(AUDIO_VIDEO_VOICES_URL, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-api-key': this.fireflyServicesClientId
            }
        });

        if (!response.ok) {
            throw new Error(`Failed to fetch available voices: ${response.statusText}`);
        }

        return await response.json();
    }

    async executeAutomation() {
        let renditionContent = `---- Firefly Available Voices ----\n`;
        renditionContent += `Asset Path: ${this.assetPath}\n\n`;

        const voicesData = await this.getAvailableVoices();

        let voiceSummary = `Total Voices: ${voicesData.voices?.length || 0}\n\n`;

        if (voicesData.voices && voicesData.voices.length > 0) {
            voiceSummary += `Available Voices:\n\n`;
            voicesData.voices.forEach((voice, index) => {
                voiceSummary += `${index + 1}. Voice ID: ${voice.voiceId || 'N/A'}\n`;
                voiceSummary += `   Display Name: ${voice.displayName || 'N/A'}\n`;
                voiceSummary += `   Gender: ${voice.gender || 'N/A'}\n`;
                voiceSummary += `   Style: ${voice.style || 'N/A'}\n`;
                voiceSummary += `   Voice Type: ${voice.voiceType || 'N/A'}\n`;
                voiceSummary += `\n`;
            });
        }

        renditionContent += voiceSummary;
        renditionContent += `\n---- Full JSON Data ----\n\n`;
        renditionContent += JSON.stringify(voicesData, null, 2);
        renditionContent += `\n\n---- End of Voices Data ----\n`;

        return { renditionContent, executionSummary: voiceSummary };
    }

    getActionDisplayName() {
        return 'Firefly Available Voices';
    }
}

async function execute(rendition, params) {
    const service = new FireflyAvailableVoicesService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
