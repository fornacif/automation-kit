# Product Crop Automation

The Product Crop feature provides intelligent image cropping capabilities through AI-powered subject detection, ensuring the product remains perfectly centered and prominent in all generated renditions. This document covers both self-hosted and shared service deployment options.

## Prerequisites

### Self-hosted
- Adobe Developer Console access
- App Builder
- AEM as a Cloud Service instance
- Firefly Services API access (credentials)
- Node.js 18+ installed
- Adobe I/O CLI installed (`npm install -g @adobe/aio-cli`)

### Shared service
- AEM as a Cloud Service instance

## Self-hosted Setup

This section applies only to self-hosted deployments.

### 1. Initialize Adobe App Builder Project

#### Console Setup
1. Navigate to [Adobe Developer Console](https://developer.adobe.com/console)
2. Click "Create new project from template"
3. Select "App Builder" template
4. Name your project (e.g., "Product Crop Automation")

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
cd actions
mkdir product-crop-automation
cd product-crop-automation
```

2. Create an `index.js` file with the content from:
[actions/product-crop-automation/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/product-crop-automation/index.js)

### 3. Environment Configuration

Add the following properties to your `.env` file:

```plaintext
# This file must not be committed to source control

FIREFLY_SERVICES_API_CLIENT_ID=[REDACTED]
FIREFLY_SERVICES_API_CLIENT_SECRET=[REDACTED]
FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,read_organizations,firefly_api,ff_apis
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
  product-crop-automation:
    function: actions/product-crop-automation/index.js
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

More actions can be configured like shown in the [app.config.yaml](https://github.com/fornacif/automation-kit/blob/main/app.config.yaml) present in the repository.

### 5. Deployment

Deploy your application using the Adobe I/O CLI:

```bash
aio app deploy
```

The deployment will provide you with a web action URL that will be used in the AEM Processing Profile.

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

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Product Crop Automation"
3. Add a new Custom Processing Services with the following configuration:
   - `product-crop` as Rendition Name and `jpg` or `png` as extension (based on your output format)
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [deployment step](#5-deployment)
     - **Shared service:** Contact me for accessing the URL
   - Service Parameters (see below for details)
   - Set appropriate Mime Types for included images (e.g., `image/jpeg`, `image/png`)

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from [AEM Certificate Setup](#aem-certificate-setup) |
| `createAsset` | boolean | No | Both | `true` | Creates a new asset in AEM with the cropped image or creates a rendition of the original asset if set to false |
| `outputFormatType` | string | No | Both | `image/jpeg` | Output format. Values: `image/jpeg`, `image/png` |
| `paddingWidth` | number | No | Both | `50` | Horizontal padding in pixels to add around the detected subject |
| `paddingHeight` | number | No | Both | `50` | Vertical padding in pixels to add around the detected subject |
| `imageWidth` | number | No | Both | - | Optional target width for the output image in pixels. If not specified, original dimensions are preserved |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- createAsset: true
- outputFormatType: image/jpeg
- paddingWidth: 50
- paddingHeight: 50
- imageWidth: 2000
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- createAsset: true
- outputFormatType: image/jpeg
- paddingWidth: 50
- paddingHeight: 50
- imageWidth: 2000
```

### Execute Automation

1. Create a new folder in AEM Assets
2. Apply the "Product Crop Automation" processing profile to the folder
3. Upload your product images to the folder
4. The automation will automatically:
   - Detect the subject in the image using AI
   - Apply the specified padding around the subject
   - Generate a cropped image with the product centered
   - Create a new asset or rendition based on your configuration
5. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
6. Check that the cropped product images have been created

## How It Works

**Applies to:** Both self-hosted and shared service

The Product Crop Automation uses Adobe Firefly Services API to:

1. **Subject Detection**: AI automatically identifies the main subject/product in the image
2. **Intelligent Cropping**: Calculates optimal crop boundaries around the detected subject
3. **Padding Application**: Adds configurable padding (horizontal and vertical) around the subject
4. **Image Generation**: Creates a new cropped image with the product perfectly centered
5. **Asset Creation**: Either creates a new asset or adds a rendition to the existing asset in AEM

This ensures consistent product presentation across all your assets, with the subject always prominent and properly framed.

## Troubleshooting

**Applies to:** Both self-hosted and shared service

### Common Issues and Solutions

1. **Processing Profile Errors**
   - Verify the web action URL is correct and accessible
   - Check Tasks in the AEM Inbox to see if some errors happened
   - **Self-hosted only:** Check the action logs using:
     ```bash
     aio app logs
     ```
   - Ensure all required parameters are properly configured
   - **Shared service only:** Verify the certificate parameter is correctly formatted as JSON

2. **Authentication Issues (Shared service)**
   - Ensure the AEM certificate is valid and not expired
   - Verify the technical account has the necessary permissions in AEM
   - Check that the certificate JSON structure is complete and properly formatted

3. **Subject Detection Issues**
   - Ensure images have clear subjects that can be detected
   - Images with complex backgrounds may require adjustment of padding parameters
   - Try adjusting `paddingWidth` and `paddingHeight` for better results

4. **Output Format Issues**
   - Verify `outputFormatType` matches the rendition extension in the Processing Profile
   - Ensure the output format is supported (`image/jpeg` or `image/png`)

### Debug Mode (Self-hosted only)

Enable debug logging by:
1. Setting `LOG_LEVEL=debug` in your `.env` file
2. Redeploying the application
3. Monitoring logs during execution:
   ```bash
   aio app logs -f
   ```

For additional support, consult the Adobe Developer Documentation.
