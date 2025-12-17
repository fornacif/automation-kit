# Firefly Text to Speech

The Firefly Text to Speech feature converts text content into natural-sounding speech audio files using Adobe Firefly's AI-powered text-to-speech service. This automation leverages advanced voice synthesis technology to generate high-quality audio from text inputs, perfect for creating voiceovers, audio content, accessibility features, and multi-language audio assets. This document covers both self-hosted and shared service deployment options.

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
4. Name your project (e.g., "Firefly Text to Speech Automation")

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
mkdir firefly-text-to-speech
cd firefly-text-to-speech
```

2. Create an `index.js` file with the content from:
[actions/firefly-text-to-speech/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-text-to-speech/index.js)

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
  firefly-text-to-speech:
    function: actions/firefly-text-to-speech/index.js
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
2. Create a new profile named "Firefly Text to Speech"
3. Add a new Custom Processing Services with the following configuration:
   - `audio` as Rendition Name and `mp3` as extension
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [deployment step](#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - Service Parameters (see below for details)
   - Set appropriate Mime Types for included text files (e.g., `text/plain`, `text/html`)

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from [AEM Certificate Setup](#aem-certificate-setup) |
| `actionName` | string | **Yes** | Both | - | Must be set to `firefly-text-to-speech` |
| `voiceId` | string | **Yes** | Both | - | The voice ID to use for speech synthesis. Use the Firefly Available Voices action to retrieve valid voice IDs |
| `speed` | number | No | Both | `1.0` | Speech rate multiplier. Range: 0.5-2.0. Values < 1.0 slow down speech, > 1.0 speed it up |
| `pitch` | number | No | Both | `1.0` | Voice pitch multiplier. Range: 0.5-2.0. Values < 1.0 lower pitch, > 1.0 raise pitch |
| `outputFormat` | string | No | Both | `audio/mpeg` | Audio output format. Values: `audio/mpeg` (MP3), `audio/wav` (WAV) |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: firefly-text-to-speech
- voiceId: en-US-Neural-Voice-1
- speed: 1.0
- pitch: 1.0
- outputFormat: audio/mpeg
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: firefly-text-to-speech
- voiceId: en-US-Neural-Voice-1
- speed: 1.0
- pitch: 1.0
- outputFormat: audio/mpeg
```

### Execute Automation

1. Create a new folder in AEM Assets
2. Apply the "Firefly Text to Speech" processing profile to the folder
3. Upload your text files (`.txt` or other text-based formats) to the folder
4. The automation will automatically:
   - Read the text content from the source file
   - Send the text to Firefly Services text-to-speech API
   - Generate audio using the specified voice and parameters
   - Download the generated audio file
   - Create a new audio asset in AEM
5. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
6. Check that the audio files have been created

## How It Works

**Applies to:** Both self-hosted and shared service

The Firefly Text to Speech Automation uses Adobe Firefly Services API to:

1. **Text Extraction**: Reads text content from the source asset
2. **Voice Selection**: Uses the specified voice ID for speech synthesis
3. **AI Synthesis**: Firefly's text-to-speech engine converts text to natural-sounding speech using:
   - Neural voice models for realistic intonation
   - Proper pronunciation and prosody
   - Adjustable speed and pitch parameters
4. **Audio Generation**: Creates high-quality audio files in the specified format
5. **Asset Creation**: Downloads the generated audio and creates new audio assets in AEM

This ensures you can quickly convert text content into professional-quality voice recordings with consistent voice characteristics.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **Voiceover Production**: Generate voiceovers for videos, presentations, and multimedia content
- **Accessibility**: Create audio versions of text content for visually impaired users
- **E-Learning**: Produce narration for educational content and training materials
- **Podcast Generation**: Convert written content into podcast episodes
- **Multi-Language Audio**: Generate audio content in multiple languages using appropriate voices
- **IVR Systems**: Create voice prompts for interactive voice response systems
- **Audio Books**: Convert written documents into audiobook format
- **Marketing Content**: Generate voice content for advertisements and promotional materials

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

3. **Voice ID Issues**
   - Verify the voiceId parameter is set correctly
   - Use the Firefly Available Voices action to retrieve valid voice IDs
   - Ensure the voice ID is appropriate for the text language/locale
   - Check that the voice ID has not been deprecated

4. **Audio Quality Issues**
   - Ensure source text is properly formatted (no excessive special characters)
   - Try adjusting `speed` and `pitch` parameters for better results
   - Consider using different voices for different content types
   - Verify the output format is appropriate for your use case

5. **Text Length Issues**
   - Very long text files may hit API limits
   - Consider splitting large documents into smaller sections
   - Check Firefly Services API documentation for character limits

6. **API Quota Issues**
   - Monitor your Firefly Services API usage
   - Ensure you have sufficient API credits
   - Contact Adobe if you need increased quota

### Debug Mode (Self-hosted only)

Enable debug logging by:
1. Setting `LOG_LEVEL=debug` in your `.env` file
2. Redeploying the application
3. Monitoring logs during execution:
   ```bash
   aio app logs -f
   ```

For additional support, consult the Adobe Developer Documentation.
