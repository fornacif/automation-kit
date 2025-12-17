# Firefly Text to Speech

The Firefly Text to Speech feature converts text content into natural-sounding speech audio files using Adobe Firefly's AI-powered text-to-speech service. This automation leverages advanced voice synthesis technology to generate high-quality audio from text inputs, perfect for creating voiceovers, audio content, accessibility features, and multi-language audio assets.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **Firefly Text to Speech** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/index.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `firefly-text-to-speech` (passed via `actionName` parameter)

See the [Shared Setup Guide - App Configuration](shared-setup.md#4-app-configuration) for the unified `app.config.yaml` configuration.

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Firefly Text to Speech"
3. Add a new Custom Processing Services with the following configuration:
   - **Rendition Name:** `rendition`
   - **Extension:** `txt`
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [Shared Setup Guide - Deployment](shared-setup.md#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - **Service Parameters:** See below for details
   - **Mime Types:** Include `text/plain`, `text/html`

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from the [Shared Setup Guide - AEM Certificate Setup](shared-setup.md#aem-certificate-setup) |
| `actionName` | string | **Yes** | Both | - | Must be set to `firefly-text-to-speech` |
| `voiceId` | string | **Yes** | Both | - | The voice ID to use for speech synthesis. Use the Firefly Available Voices action to retrieve valid voice IDs |
| `outputFormat` | string | No | Both | `audio/mpeg` | Audio output format. Values: `audio/mpeg` (MP3), `audio/wav` (WAV) |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: firefly-text-to-speech
- voiceId: en-US-Neural-Voice-1
- outputFormat: audio/mpeg
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: firefly-text-to-speech
- voiceId: en-US-Neural-Voice-1
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

For common troubleshooting steps, see the [Shared Setup Guide - Common Troubleshooting](shared-setup.md#common-troubleshooting).

### Action-Specific Issues

1. **Voice ID Issues**
   - Verify the voiceId parameter is set correctly and is required
   - Use the **Firefly Available Voices** action to retrieve valid voice IDs
   - Ensure the voice ID is appropriate for the text language/locale
   - Check that the voice ID has not been deprecated
   - Voice IDs are case-sensitive

2. **Audio Quality Issues**
   - Ensure source text is properly formatted (no excessive special characters)
   - Consider using different voices for different content types
   - Verify the output format is appropriate for your use case

3. **Text Processing Issues**
   - Verify text files are in supported formats (plain text, HTML)
   - Check file encoding (UTF-8 recommended)
   - Ensure text is readable and not corrupted
   - Remove or escape special characters that might cause issues

4. **Text Length Issues**
   - Very long text files may hit API limits
   - Consider splitting large documents into smaller sections
   - Check Firefly Services API documentation for character limits
   - Monitor processing time for long texts

5. **Output Format Issues**
   - Verify outputFormat matches the rendition extension
   - Use `audio/mpeg` for MP3 files
   - Use `audio/wav` for WAV files
   - Consider file size when choosing format

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the Adobe Developer Documentation.
