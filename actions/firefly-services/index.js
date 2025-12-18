'use strict'

const { worker, GenericError } = require('@adobe/asset-compute-sdk');
const filesLib = require('@adobe/aio-lib-files');
const { error } = require('console');

const ACTION_HANDLERS = {
    'firefly-available-voices': require('./actions/firefly-available-voices'),
    'firefly-text-to-speech': require('./actions/firefly-text-to-speech'),
    'firefly-generate-similar': require('./actions/firefly-generate-similar'),
    'photoshop-product-crop': require('./actions/photoshop-product-crop'),
    'indesign-banners-automation': require('./actions/indesign-banners-automation'),
    'photoshop-banners-automation': require('./actions/photoshop-banners-automation'),
    'photoshop-action-automation': require('./actions/photoshop-action-automation'),
    'substance-3d-render': require('./actions/substance-3d-render'),
    'substance-3d-compose': require('./actions/substance-3d-compose')
};

async function createAEMRendition(renditionPath, renditionContent) {
    const files = await filesLib.init();
    await files.write('rendition', renditionContent);
    await files.copy('rendition', renditionPath, { localDest: true });
}

exports.main = worker(async (source, rendition, params) => {
    let service;
    let executionDescription;
    let renditionContent = '';
    let actionDisplayName = 'Firefly Services';
    const startTime = performance.now();

    try {
        const actionName = rendition.instructions.actionName;

        if (!actionName) {
            throw new Error('actionName parameter is required in rendition instructions');
        }

        const actionHandler = ACTION_HANDLERS[actionName];

        if (!actionHandler) {
            throw new Error(`Unknown action: ${actionName}. Available actions: ${Object.keys(ACTION_HANDLERS).join(', ')}`);
        }

        service = await actionHandler.execute(rendition, params);
        actionDisplayName = service.getActionDisplayName();

        const result = await service.executeAutomation();

        const durationSeconds = Math.round((performance.now() - startTime) / 1000);
        executionDescription = `Execution succeeded in ${durationSeconds} seconds`;

        if (result.executionSummary) {
            executionDescription += `\n\n${result.executionSummary}`;
        }

        renditionContent = result.renditionContent || `---- ${actionDisplayName} ----\n\nExecution completed successfully`;

        const shouldCreateRendition = result.shouldCreateRendition !== false;
        if (shouldCreateRendition) {
            await createAEMRendition(rendition.path, renditionContent);
        }
    } catch (errorCausedBy) {
        error(errorCausedBy);
        const durationSeconds = Math.round((performance.now() - startTime) / 1000);
        executionDescription = `Execution failed after ${durationSeconds} seconds\n\nError: ${errorCausedBy.message}\n\nStack trace:\n${errorCausedBy.stack}`;

        renditionContent = `---- ${actionDisplayName} ----\n\nERROR: Process failed\n\n${executionDescription}`;

        await createAEMRendition(rendition.path, renditionContent);
    } finally {
        if (service) {
            await service.createAEMTask(actionDisplayName, executionDescription);
        }
    }
});
