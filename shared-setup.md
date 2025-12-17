# Shared Setup Guide

This document contains common setup instructions that apply to all automation actions in this kit. Individual action documentation files reference this guide to avoid duplication.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Self-hosted Setup](#self-hosted-setup)
- [AEM Certificate Setup](#aem-certificate-setup)
- [Shared Service Information](#shared-service-information)
- [Common Troubleshooting](#common-troubleshooting)

## Prerequisites

### Self-hosted
- Adobe Developer Console access
- App Builder
- AEM as a Cloud Service instance
- Firefly Services API access (credentials) or InDesign Firefly Services API access (credentials) depending on the action
- Node.js 18+ installed
- Adobe I/O CLI installed (`npm install -g @adobe/aio-cli`)
- Dynamic Media or Dynamic Media with Open API (optional, required only for actions that use Smart Crop features)

### Shared service
- AEM as a Cloud Service instance
- Dynamic Media or Dynamic Media with Open API (optional, required only for actions that use Smart Crop features)

## Self-hosted Setup

This section applies only to self-hosted deployments.

### 1. Initialize Adobe App Builder Project

#### Console Setup
1. Navigate to [Adobe Developer Console](https://developer.adobe.com/console)
2. Click "Create new project from template"
3. Select "App Builder" template
4. Name your project (e.g., "Automation Kit")

#### Local Project Setup
1. Create a new directory for your project and navigate to it:
```bash
mkdir automation-kit
cd automation-kit
```

2. Initialize the App Builder project locally:
```bash
aio app init
```

3. During initialization:
   - Select your organization when prompted
   - Choose the App Builder project you created in the Console
   - Select "No" for adding any optional features
   - Choose your preferred template when prompted (typically "Basic")

4. After initialization, your project structure will be created with the necessary configuration files

### 2. Setup Actions

1. Create directories for your actions:
```bash
cd actions
mkdir firefly-services
cd firefly-services
```

2. Create an `index.js` file with the content from the specific action you want to implement:
   - [actions/firefly-services/firefly-generate-similar.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/firefly-generate-similar.js)
   - [actions/firefly-services/psd-banners-automation.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/psd-banners-automation.js)
   - [actions/firefly-services/indd-banners-automation.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/indd-banners-automation.js)
   - [actions/firefly-services/product-crop-automation.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/product-crop-automation.js)
   - [actions/firefly-services/firefly-available-voices.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/firefly-available-voices.js)
   - [actions/firefly-services/firefly-text-to-speech.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/firefly-text-to-speech.js)

3. All action implementations should be placed in the `actions/firefly-services/` directory

### 3. Environment Configuration

Add the following properties to your `.env` file:

```plaintext
# This file must not be committed to source control

# For Firefly Services (Photoshop, Firefly AI, Product Crop, TTS)
FIREFLY_SERVICES_API_CLIENT_ID=[REDACTED]
FIREFLY_SERVICES_API_CLIENT_SECRET=[REDACTED]
FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,read_organizations,firefly_api,ff_apis

# For InDesign Services (only if using INDD actions)
INDESIGN_FIREFLY_SERVICES_API_CLIENT_ID=[REDACTED]
INDESIGN_FIREFLY_SERVICES_API_CLIENT_SECRET=[REDACTED]
INDESIGN_FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,creative_sdk,indesign_services,creative_cloud

# AEM Certificate (required for both Firefly and InDesign services)
AEM_CERTIFICATE='{
  "ok": true,
  "integration": {
    COPY YOUR CERTIFICATE HERE FROM THE AEM DEVELOPER CONSOLE
  },
  "statusCode": 200
}'
```

### 4. App Configuration

Update your `app.config.yaml` with a **single unified action** configuration:

```yaml
actions:
  firefly-services:
    function: actions/firefly-services/index.js
    web: 'yes'
    runtime: nodejs:18
    limits:
      memorySize: 1024
      concurrency: 10
      timeout: 600000
    inputs:
      LOG_LEVEL: info
      fireflyServicesApiClientId: $FIREFLY_SERVICES_API_CLIENT_ID
      fireflyServicesApiClientSecret: $FIREFLY_SERVICES_API_CLIENT_SECRET
      fireflyServicesApiScopes: $FIREFLY_SERVICES_API_SCOPES
      inDesignFireflyServicesApiClientId: $INDESIGN_FIREFLY_SERVICES_API_CLIENT_ID
      inDesignFireflyServicesApiClientSecret: $INDESIGN_FIREFLY_SERVICES_API_CLIENT_SECRET
      inDesignFireflyServicesApiScopes: $INDESIGN_FIREFLY_SERVICES_API_SCOPES
      aemCertificate: $AEM_CERTIFICATE
    annotations:
      require-adobe-auth: true
```

**Key Points:**
- There is now a **single action** named `firefly-services` that handles all automation types
- The specific action to execute is determined by the `actionName` parameter in the AEM Processing Profile
- This unified approach simplifies deployment and maintenance

See the complete [app.config.yaml](https://github.com/fornacif/automation-kit/blob/main/app.config.yaml) in the repository.

### 5. Deployment

Deploy your application using the Adobe I/O CLI:

```bash
aio app deploy
```

The deployment will provide you with a **single web action URL** that will be used for all AEM Processing Profiles. Different actions are invoked by passing different `actionName` parameter values.

## AEM Certificate Setup

**Applies to:** Both self-hosted and shared service

Before configuring your environment, you need to obtain an AEM certificate:

1. Navigate to your AEM Cloud Service Developer Console
2. Go to "Integrations"
3. Click "Create new technical account"
4. After creation, click "View" to see the certificate
5. Copy the entire certificate JSON structure

Once created, the technical account needs appropriate permissions in AEM:
1. Navigate to AEM > Tools > Security > Users
2. Find the technical account (it will appear after its first use)
3. Add it to appropriate groups or grant necessary permissions
   Required permissions include:
   - Assets management
   - Task creation

## Shared Service Information

**Applies to:** Shared service deployments only

### Shared Service URL

All actions use the same shared service endpoint:
```
https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services
```

### Authorization Requirement

**You must share your AEM Organization ID with me to authorize access to the shared service.**

Without authorization, the shared service will not be able to process requests from your AEM instance.

### Action Selection

The specific action to execute is determined by the `actionName` parameter in your AEM Processing Profile service parameters. Each action has its own specific `actionName` value (e.g., `firefly-generate-similar`, `psd-banners-automation`, etc.).

## Common Troubleshooting

**Applies to:** Both self-hosted and shared service

### Processing Profile Errors

1. **Verify endpoint URL**
   - **Self-hosted:** Ensure the deployed web action URL is correct and accessible
   - **Shared service:** Verify you're using the correct shared service URL
   - Check that the URL is properly formatted with no extra spaces

2. **Check AEM Tasks**
   - Navigate to AEM Inbox and check Tasks for error messages
   - Error details in tasks often provide specific information about what went wrong

3. **Review action logs (Self-hosted only)**
   ```bash
   aio app logs
   ```
   Or for real-time monitoring:
   ```bash
   aio app logs -f
   ```

4. **Validate service parameters**
   - Ensure all required parameters are properly configured
   - Verify parameter names are spelled correctly
   - Check that parameter values are in the correct format

### Authentication Issues (Shared service)

1. **Certificate validation**
   - Ensure the AEM certificate is valid and not expired
   - Verify the certificate parameter is correctly formatted as JSON
   - Check that the certificate JSON structure is complete (no missing braces or quotes)

2. **Technical account permissions**
   - Verify the technical account has necessary permissions in AEM
   - Ensure the account appears in AEM Users after first use
   - Confirm the account has assets management and task creation permissions

3. **Organization ID**
   - Verify you have shared your AEM Organization ID for shared service authorization
   - Check that the Organization ID provided is correct

### API Issues

1. **API credentials (Self-hosted only)**
   - Verify Firefly Services API credentials are valid
   - For InDesign actions, check InDesign API credentials separately
   - Ensure credentials have not expired

2. **API quota**
   - Monitor your Firefly Services API usage
   - Ensure you have sufficient API credits
   - Contact Adobe if you need increased quota

3. **Network connectivity**
   - Verify network connectivity to Adobe services
   - Check for firewall or proxy issues
   - Ensure AEM instance can reach external APIs

### Debug Mode (Self-hosted only)

Enable debug logging to get more detailed information:

1. Set `LOG_LEVEL=debug` in your `.env` file
2. Redeploy the application:
   ```bash
   aio app deploy
   ```
3. Monitor logs during execution:
   ```bash
   aio app logs -f
   ```

### Common Parameter Issues

1. **Missing actionName**
   - The `actionName` parameter is **required for all actions**
   - Verify it's included in your Processing Profile service parameters
   - Check that the value matches the action you want to execute

2. **Certificate parameter (Shared service)**
   - Required only for shared service deployments
   - Must be valid JSON structure
   - Should be copied exactly from AEM Developer Console

3. **Parameter data types**
   - Number parameters (e.g., `imageWidth`, `numVariations`) should not be quoted
   - String parameters should use proper escaping if they contain special characters
   - Boolean parameters should be `true` or `false` without quotes

### Getting Additional Support

For additional support:
- Consult the [Adobe Developer Documentation](https://developer.adobe.com/firefly-services/)
- Review action-specific troubleshooting in individual action documentation files
- Check the [GitHub repository](https://github.com/fornacif/automation-kit) for updates and issues
