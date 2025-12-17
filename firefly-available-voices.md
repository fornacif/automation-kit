# Firefly Available Voices

The Firefly Available Voices feature retrieves a list of all available voices from Adobe Firefly's text-to-speech service. This automation provides information about voice options including voice IDs, names, locales, and characteristics, enabling you to select the appropriate voice for your text-to-speech automation needs. This document covers both self-hosted and shared service deployment options.

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
4. Name your project (e.g., "Firefly Voice Automation")

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
mkdir firefly-available-voices
cd firefly-available-voices
```

2. Create an `index.js` file with the content from:
[actions/firefly-available-voices/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-available-voices/index.js)

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
  firefly-available-voices:
    function: actions/firefly-available-voices/index.js
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
2. Create a new profile named "Firefly Available Voices"
3. Add a new Custom Processing Services with the following configuration:
   - `voices` as Rendition Name and `json` as extension
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [deployment step](#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - Service Parameters (see below for details)
   - Set appropriate Mime Types for included assets (e.g., `text/plain`, `application/json`)

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from [AEM Certificate Setup](#aem-certificate-setup) |
| `actionName` | string | **Yes** | Both | - | Must be set to `firefly-available-voices` |
| `locale` | string | No | Both | - | Optional locale filter to retrieve voices for specific language/region (e.g., `en-US`, `fr-FR`) |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: firefly-available-voices
- locale: en-US
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: firefly-available-voices
- locale: en-US
```

### Execute Automation

1. Create a new folder in AEM Assets
2. Apply the "Firefly Available Voices" processing profile to the folder
3. Upload a trigger asset (e.g., a text file or placeholder) to the folder
4. The automation will automatically:
   - Query the Firefly Services API for available voices
   - Retrieve voice metadata including IDs, names, and locales
   - Create a JSON asset in AEM with the voice listing
5. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
6. Check that the voices JSON file has been created

## How It Works

**Applies to:** Both self-hosted and shared service

The Firefly Available Voices Automation uses Adobe Firefly Services API to:

1. **API Query**: Connects to Firefly Services text-to-speech API
2. **Voice Retrieval**: Fetches the complete list of available voices
3. **Metadata Collection**: Gathers information about each voice including:
   - Voice ID (required for text-to-speech conversion)
   - Voice name and description
   - Supported locales and languages
   - Voice characteristics (gender, age, style)
4. **JSON Generation**: Creates a structured JSON file with all voice data
5. **Asset Creation**: Saves the voice listing as a JSON asset in AEM

This provides a reference catalog of available voices that can be used to select appropriate voice IDs for text-to-speech automation.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **Voice Discovery**: Explore available voice options before implementing text-to-speech workflows
- **Voice Selection**: Identify appropriate voice IDs for different content types or brands
- **Locale Planning**: Understand voice availability across different languages and regions
- **Documentation**: Maintain a reference catalog of voice options for content creators
- **Integration Planning**: Plan multi-language voice strategies for global content

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

3. **API Connection Issues**
   - Verify Firefly Services API credentials are valid
   - Check network connectivity to Firefly Services
   - Ensure API quota is not exceeded

4. **Locale Filter Issues**
   - Verify the locale parameter uses the correct format (e.g., `en-US`, not `en`)
   - Check that the requested locale is supported by Firefly Services

### Debug Mode (Self-hosted only)

Enable debug logging by:
1. Setting `LOG_LEVEL=debug` in your `.env` file
2. Redeploying the application
3. Monitoring logs during execution:
   ```bash
   aio app logs -f
   ```

For additional support, consult the Adobe Developer Documentation.
