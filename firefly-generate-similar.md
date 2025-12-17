# Firefly Generate Similar

The Firefly Generate Similar feature uses Adobe Firefly's generative AI to automatically create visually similar variations of your images. This powerful automation leverages advanced machine learning to understand the content, style, and composition of your source image and generate multiple high-quality variations.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **Firefly Generate Similar** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/index.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `firefly-generate-similar` (passed via `actionName` parameter)

See the [Shared Setup Guide - App Configuration](shared-setup.md#4-app-configuration) for the unified `app.config.yaml` configuration.

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Firefly Generate Similar"
3. Add a new Custom Processing Services with the following configuration:
   - **Rendition Name:** `rendition`
   - **Extension:** `txt`
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [Shared Setup Guide - Deployment](shared-setup.md#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - **Service Parameters:** See below for details
   - **Mime Types:** Include `image/jpeg`, `image/png`

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from the [Shared Setup Guide - AEM Certificate Setup](shared-setup.md#aem-certificate-setup) |
| `actionName` | string | **Yes** | Both | - | Must be set to `firefly-generate-similar` |
| `numVariations` | number | No | Both | `1` | Number of similar image variations to generate. Range: 1-4 |
| `imageWidth` | number | No | Both | `2688` | Width of the generated images in pixels |
| `imageHeight` | number | No | Both | `1536` | Height of the generated images in pixels |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: firefly-generate-similar
- numVariations: 1
- imageWidth: 2688
- imageHeight: 1536
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: firefly-generate-similar
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

**Applies to:** Both self-hosted and shared service

The Firefly Generate Similar Automation uses Adobe Firefly Services API to:

1. **Image Upload**: Uploads the source image to Firefly Services storage
2. **AI Analysis**: Firefly's generative AI analyzes the content, style, composition, and visual characteristics of the source image
3. **Variation Generation**: Creates similar images that maintain the essence of the original while introducing subtle variations
4. **Batch Processing**: Generates multiple variations in a single operation (up to 4 variations)
5. **Asset Creation**: Downloads each generated variation and creates new assets in AEM

This ensures you can quickly expand your asset library with AI-generated variations that maintain brand consistency while offering creative diversity.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **A/B Testing**: Generate multiple variations of marketing assets to test performance
- **Creative Exploration**: Quickly explore different visual directions based on a source image
- **Asset Library Expansion**: Automatically create variations of successful assets
- **Localization Support**: Generate region-specific variations of global assets
- **Campaign Optimization**: Create multiple versions for different channels or audiences

## Troubleshooting

**Applies to:** Both self-hosted and shared service

For common troubleshooting steps, see the [Shared Setup Guide - Common Troubleshooting](shared-setup.md#common-troubleshooting).

### Action-Specific Issues

1. **Generation Quality Issues**
   - Ensure source images are high quality and not too small
   - Larger source images generally produce better results
   - Try different dimensions with `imageWidth` and `imageHeight`
   - Simple, clear compositions work best for similarity generation

2. **Timeout Issues**
   - Generation can take time, especially for multiple variations
   - Consider reducing `numVariations` if timeouts occur
   - **Self-hosted only:** Check the timeout setting in app.config.yaml (default: 600000ms = 10 minutes)

3. **API Quota Issues**
   - Monitor your Firefly Services API usage
   - Ensure you have sufficient API credits
   - Contact Adobe if you need increased quota

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the Adobe Developer Documentation.
