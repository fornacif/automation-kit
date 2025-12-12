# Firefly Generate Similar (Self hosted)

## Prerequisites

- Adobe Developer Console access
- App Builder
- AEM as a Cloud Service instance
- Firefly Services API access (credentials)
- Node.js 18+ installed
- Adobe I/O CLI installed (`npm install -g @adobe/aio-cli`)

## Project Setup

### 1. Initialize Adobe App Builder Project

#### Console Setup
1. Navigate to [Adobe Developer Console](https://developer.adobe.com/console)
2. Click "Create new project from template"
3. Select "App Builder" template
4. Name your project (e.g., "Firefly Generate Similar Automation")

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
mkdir firefly-generate-similar
cd firefly-generate-similar
```

2. Create an `index.js` file with the content from:
[actions/firefly-generate-similar/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-generate-similar/index.js)

### 3. AEM Certificate Setup

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

### 4. Environment Configuration

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

### 5. App Configuration

Update your `app.config.yaml` with the following:

```yaml
actions:
  firefly-generate-similar:
    function: actions/firefly-generate-similar/index.js
    web: 'yes'
    runtime: nodejs:18
    limits:
      memorySize: 512
      concurrency: 10
      timeout: 300000
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

## Deployment

Deploy your application using the Adobe I/O CLI:

```bash
aio app deploy
```

The deployment will provide you with a web action URL that will be used in the AEM Processing Profile.

## AEM Configuration

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Firefly Generate Similar"
3. Add a new Custom Processing Services with the following configuration:
   - `firefly-similar` as Rendition Name and `jpg` or `png` as extension
   - [Endpoint URL previously deployed](#deployment): {Your deployed web action URL}
   - Service Parameters (see below for details)
   - Set appropriate Mime Types for included images (e.g., `image/jpeg`, `image/png`)

### Service Parameters

The following parameters can be configured in your AEM Processing Profile for Firefly Generate Similar:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `directBinaryAccess` | boolean | No | `true` | Enables direct binary access for improved performance |
| `numVariations` | number | No | `1` | Number of similar image variations to generate. Range: 1-4 |
| `imageWidth` | number | No | `2688` | Width of the generated images in pixels |
| `imageHeight` | number | No | `1536` | Height of the generated images in pixels |

**Example Configuration:**
```yaml
Service Parameters:
- directBinaryAccess: true
- numVariations: 1
- imageWidth: 2688
- imageHeight: 1536
```

### Execute Automation

1. Create a new folder in AEM Assets
2. Apply the "Firefly Generate Similar" processing profile to the folder
3. Upload your source images to the folder
4. The automation will automatically:
   - Upload the source image to Firefly Services
   - Generate the specified number of similar variations using AI
   - Download the generated variations
   - Create new assets in AEM for each variation
5. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
6. Check that the similar image variations have been created

## How It Works

The Firefly Generate Similar Automation uses Adobe Firefly Services API to:

1. **Image Upload**: Uploads the source image to Firefly Services storage
2. **AI Analysis**: Firefly's generative AI analyzes the content, style, composition, and visual characteristics of the source image
3. **Variation Generation**: Creates similar images that maintain the essence of the original while introducing subtle variations
4. **Batch Processing**: Generates multiple variations in a single operation (up to 4 variations)
5. **Asset Creation**: Downloads each generated variation and creates new assets in AEM

This ensures you can quickly expand your asset library with AI-generated variations that maintain brand consistency while offering creative diversity.

## Use Cases

- **A/B Testing**: Generate multiple variations of marketing assets to test performance
- **Creative Exploration**: Quickly explore different visual directions based on a source image
- **Asset Library Expansion**: Automatically create variations of successful assets
- **Localization Support**: Generate region-specific variations of global assets
- **Campaign Optimization**: Create multiple versions for different channels or audiences

## Troubleshooting

### Common Issues and Solutions

1. **Processing Profile Errors**
   - Verify the web action URL is correct and accessible
   - Check Tasks in the AEM Inbox to see if some errors happened
   - Check the action logs using:
     ```bash
     aio app logs
     ```
   - Ensure all required parameters are properly configured

2. **Generation Quality Issues**
   - Ensure source images are high quality and not too small
   - Larger source images generally produce better results
   - Try different dimensions with `imageWidth` and `imageHeight`
   - Simple, clear compositions work best for similarity generation

3. **Timeout Issues**
   - Generation can take time, especially for multiple variations
   - Consider reducing `numVariations` if timeouts occur
   - Check the timeout setting in app.config.yaml (default: 300000ms = 5 minutes)

4. **API Quota Issues**
   - Monitor your Firefly Services API usage
   - Ensure you have sufficient API credits
   - Contact Adobe if you need increased quota

### Debug Mode

Enable debug logging by:
1. Setting `LOG_LEVEL=debug` in your `.env` file
2. Redeploying the application
3. Monitoring logs during execution:
   ```bash
   aio app logs -f
   ```

For additional support, consult the Adobe Developer Documentation.
