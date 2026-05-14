'use strict'

const BaseService = require('../common/base-service');
const path = require('path');

const RUN_WORKFLOW_URL = 'https://run-workflow.adobe.io/batch/execute';
const RUN_WORKFLOW_ORG_ID = 'EE9332B3547CC74E0A4C98A1@AdobeOrg';

class RunWorkflowService extends BaseService {
    async initialize(rendition, params) {
        await super.initialize(rendition, params);
        this.workflowId = rendition.instructions.workflowId;
        if (!this.workflowId) {
            throw new Error('workflowId parameter is required in rendition instructions');
        }
        this.cropFocus = rendition.instructions.cropFocus || null;
        this.cropFocusNodeId = rendition.instructions.cropFocusNodeId;
        this.inputImagesNodeId = rendition.instructions.inputImagesNodeId;
        if (!this.inputImagesNodeId) {
            throw new Error('inputImagesNodeId parameter is required in rendition instructions');
        }
    }

    async executeWorkflow(presignedUrl, retryCount = 0) {
        const body = {
            workflow: {
                workflowId: this.workflowId,
                inputs: [
                    [
                        { node_id: this.cropFocusNodeId, content: this.cropFocus },
                        { node_id: this.inputImagesNodeId, content: [{ presignedUrl }] }
                    ]
                ]
            }
        };

        const response = await fetch(RUN_WORKFLOW_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${this.fireflyServicesToken}`,
                'x-gw-ims-org-id': RUN_WORKFLOW_ORG_ID
            },
            body: JSON.stringify(body)
        });

        if (response.status === 429) {
            const maxRetries = 4;
            if (retryCount >= maxRetries) {
                throw new Error(`Failed to execute workflow: Too Many Requests after ${maxRetries} retries`);
            }
            const waitTime = Math.pow(2, retryCount) * 30000;
            await this.waitBeforeContinue(waitTime);
            return await this.executeWorkflow(presignedUrl, retryCount + 1);
        }

        if (!response.ok) {
            throw new Error(`Failed to execute workflow: ${response.statusText}`);
        }

        return await response.json();
    }

    async pollWorkflowExecutions(executionsUrl) {
        while (true) {
            const response = await fetch(executionsUrl, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${this.fireflyServicesToken}`,
                    'x-gw-ims-org-id': RUN_WORKFLOW_ORG_ID,
                    'Accept': 'application/json'
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get workflow executions: ${response.statusText}`);
            }

            const result = await response.json();
            const executions = result.executions || [];

            if (executions.length === 0) {
                await this.waitBeforeContinue(2000);
                continue;
            }

            const execution = executions[0];
            const status = execution.status;

            if (status === 'success') {
                return execution;
            } else if (status === 'failed') {
                throw new Error(`Workflow execution failed: ${execution.error?.message || 'Unknown error'}`);
            }

            await this.waitBeforeContinue(2000);
        }
    }

    async executeAutomation() {
        let renditionContent = `---- Run Workflow ----\n`;
        renditionContent += `Asset Path: ${this.assetPath}\n`;
        renditionContent += `Workflow ID: ${this.workflowId}\n`;

        const assetPresignedUrl = await this.getAssetPresignedUrl(this.assetPath);
        const batchResult = await this.executeWorkflow(assetPresignedUrl);
        const executionsUrl = batchResult.links?.executions?.href;

        if (!executionsUrl) {
            throw new Error('No executions URL returned from workflow execution');
        }

        renditionContent += `\nBatch ID: ${batchResult.batchId}`;
        renditionContent += `\nExecutions URL: ${executionsUrl}`;

        const execution = await this.pollWorkflowExecutions(executionsUrl);
        const outputs = execution.outputs || [];

        if (outputs.length === 0) {
            throw new Error('No outputs returned from workflow execution');
        }

        const lastOutput = outputs[outputs.length - 1];
        const outputItems = lastOutput.outputs || [];

        if (outputItems.length === 0) {
            throw new Error('No output items in last output action');
        }

        const { url: outputUrl, mimeType: outputMimeType } = outputItems[0];
        if (!outputUrl) {
            throw new Error('No URL in last output item');
        }

        renditionContent += `\nOutput URL: ${outputUrl}`;

        const assetBasename = path.basename(this.assetPath, path.extname(this.assetPath));
        const assetExtension = outputMimeType ? outputMimeType.split('/')[1] : path.extname(this.assetPath).replace('.', '') || 'jpeg';
        const newAssetName = `${assetBasename}-cropped.${assetExtension}`;
        const outputFolderPath = `${this.getDamRootPath()}${this.automationRelativePath}`;

        await this.uploadFileToAEM(outputUrl, outputFolderPath, newAssetName);
        renditionContent += `\nNew Asset Created: ${outputFolderPath}/${newAssetName}`;

        return { renditionContent };
    }

    getActionDisplayName() {
        return 'Run Workflow';
    }
}

async function execute(rendition, params) {
    const service = new RunWorkflowService();
    await service.initialize(rendition, params);
    return service;
}

module.exports = { execute };
