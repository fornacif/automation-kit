# Firefly Available Voices

The Firefly Available Voices feature retrieves a list of all available voices from Adobe Firefly's text-to-speech service. This automation provides information about voice options including voice IDs, names, locales, and characteristics, enabling you to select the appropriate voice for your text-to-speech automation needs.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **Firefly Available Voices** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/firefly-available-voices.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/firefly-available-voices.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `firefly-available-voices` (passed via `actionName` parameter)

See the [Shared Setup Guide - App Configuration](shared-setup.md#4-app-configuration) for the unified `app.config.yaml` configuration.

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Firefly Available Voices"
3. Add a new Custom Processing Services with the following configuration:
   - **Rendition Name:** `voices`
   - **Extension:** `json`
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [Shared Setup Guide - Deployment](shared-setup.md#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - **Service Parameters:** See below for details
   - **Mime Types:** Include `text/plain`, `application/json`

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from the [Shared Setup Guide - AEM Certificate Setup](shared-setup.md#aem-certificate-setup) |
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

For common troubleshooting steps, see the [Shared Setup Guide - Common Troubleshooting](shared-setup.md#common-troubleshooting).

### Action-Specific Issues

1. **Locale Filter Issues**
   - Verify the locale parameter uses the correct format (e.g., `en-US`, not `en`)
   - Check that the requested locale is supported by Firefly Services
   - Omit locale parameter to retrieve all available voices
   - Locale is case-sensitive (use proper casing)

2. **Empty Voice List**
   - Verify API credentials are valid (self-hosted)
   - Check that Firefly Services API is accessible
   - Ensure API quota is not exceeded
   - Try without locale filter to see if any voices are returned

3. **JSON Format Issues**
   - The output JSON structure is determined by the Firefly API
   - Verify the JSON is valid before parsing
   - Check for API version changes that might affect structure

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the Adobe Developer Documentation.
