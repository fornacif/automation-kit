# Automation Kit

## Introduction

This automation kit provides a comprehensive solution for automating banners creation using various Adobe services:

- Adobe Firefly Services API for Photoshop-powered creative operations
- AEM Assets for digital asset management
- Dynamic Media for rich media delivery and Smart Croping features
- Adobe App Builder for extensible cloud-native applications and API orchestration

The solution leverages these technologies to create an automated workflow for banners generation, significantly reducing manual effort and ensuring consistency across marketing materials.

## Prerequisites

- Adobe Developer Console access
- AEM Cloud Service install
- Node.js 18+ installed
- Adobe I/O CLI installed (`npm install -g @adobe/aio-cli`)

## Project Setup

### 1. Initialize Adobe App Builder Project

#### Console Setup
1. Navigate to [Adobe Developer Console](https://developer.adobe.com/console)
2. Click "Create new project"
3. Select "Project from template"
4. Name your project (e.g., "Banners Automation")
5. Click "Add to Project"

#### Local Project Setup
1. Create a new directory for your project and navigate to it:
```bash
mkdir automation
cd automation
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

### 2. Setup Action

1. Create a new directory for your action:
```bash
mkdir actions/psd-banners-automation
cd actions/psd-banners-automation
```

2. Create an `index.js` file with the following content:
Action file (`samples/index.js`)

### 3. Environment Configuration

Add the following properties to your `.env` file:

```plaintext
# This file must **not** be committed to source control

FIREFLY_SERVICES_API_CLIENT_ID=[REDACTED]
FIREFLY_SERVICES_API_CLIENT_SECRET=[REDACTED]
FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,read_organizations,firefly_api,ff_apis
INDESIGN_FIREFLY_SERVICES_API_CLIENT_ID=[REDACTED]
INDESIGN_FIREFLY_SERVICES_API_CLIENT_SECRET=[REDACTED]
INDESIGN_FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,creative_sdk,indesign_services,creative_cloud
AZURE_STORAGE_ACCOUNT_NAME=[REDACTED]
AZURE_STORAGE_ACCOUNT_KEY=[REDACTED]
AZURE_STORAGE_CONTAINER_NAME=[REDACTED]
AEM_CERTIFICATE='{
  "ok": true,
  "integration": {
    COPY YOUR CERTIFICATE HERE FROM THE AEM DEVELOPER CONSOLE
  },
  "statusCode": 200
}'
```

### 4. App Configuration

Update your `app.config.yaml` with the following:

```yaml
actions:
  psd-banners-automation:
    function: actions/psd-banners-automation/index.js
    web: 'yes'
    runtime: nodejs:18
    limits:
      memorySize: 512
      concurrency: 10
      timeout: 600000
    inputs:
      LOG_LEVEL: info
      fireflyServicesApiClientId: $FIREFLY_SERVICES_API_CLIENT_ID
      fireflyServicesApiClientSecret: $FIREFLY_SERVICES_API_CLIENT_SECRET
      fireflyServicesApiScopes: $FIREFLY_SERVICES_API_SCOPES
      aemCertificate: $AEM_CERTIFICATE
    annotations:
      require-adobe-auth: true
```

## Sample Assets

Download the sample assets package containing:
- Base PSD template (`samples/template.psd`)
- Sample images and fonts (`samples/inputs`)

Sample assets can be found in the `samples` directory of this repository.

## Deployment

Deploy your application using the Adobe I/O CLI:

```bash
aio app deploy
```

The deployment will provide you with a web action URL that will be used in the AEM Processing Profile.

## AEM Configuration

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "PSD Banners Automation"
3. Add a new processing step with the following configuration:
   - Type: External Process
   - Endpoint: {Your deployed web action URL}
   - Parameters:
     1. outputFormatType with value image/jpeg or image/png
     2. Others...

### Execute Automation

1. Create a new folder
2. Upload the Base PSD Template
3. Create 2 sub folders: `INPUTS` and `OUTPUTS`
4. Upload your assets (images and font) to the `INPUTS` folder
5. Apply the "PSD Banners Automation" processing profile to the PSD file
6. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
7. Check that new banners have been created inside the `OUTPUTS` folder

## Troubleshooting

### Common Issues and Solutions

1. **Action Deployment Fails**
   - Verify your Adobe I/O CLI credentials
   - Check the project configuration in the Developer Console

2. **Processing Profile Errors**
   - Verify the web action URL is correct and accessible
   - Check the action logs using:
     ```bash
     aio app logs
     ```
   - Ensure all required parameters are properly configured

### Debug Mode

Enable debug logging by:
1. Setting `LOG_LEVEL=debug` in your `.env` file
2. Redeploying the application
3. Monitoring logs during execution:
   ```bash
   aio app logs -f
   ```

For additional support, consult the Adobe Developer Documentation.
