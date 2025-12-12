# Firefly Generate Similar (Shared service)

## Prerequisites

- AEM as a Cloud Service instance

## AEM Certificate Setup

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

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Firefly Generate Similar"
3. Add a new Custom Processing Services with the following configuration:
   - `firefly-similar` as Rendition Name and `jpg` or `png` as extension
   - Endpoint URL: {Contact me for accessing the URL}
   - Service Parameters (see below for details)
   - Set appropriate Mime Types for included images (e.g., `image/jpeg`, `image/png`)

### Service Parameters

The following parameters can be configured in your AEM Processing Profile for Firefly Generate Similar:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `certificate` | string | **Yes** | - | The AEM certificate JSON structure obtained from [AEM Certificate Setup](#aem-certificate-setup) |
| `numVariations` | number | No | `1` | Number of similar image variations to generate. Range: 1-4 |
| `imageWidth` | number | No | `2688` | Width of the generated images in pixels |
| `imageHeight` | number | No | `1536` | Height of the generated images in pixels |

**Example Configuration:**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
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
   - Ensure all required parameters are properly configured
   - Verify the certificate parameter is correctly formatted as JSON

2. **Authentication Issues**
   - Ensure the AEM certificate is valid and not expired
   - Verify the technical account has the necessary permissions in AEM
   - Check that the certificate JSON structure is complete and properly formatted

3. **Generation Quality Issues**
   - Ensure source images are high quality and not too small
   - Larger source images generally produce better results
   - Try different dimensions with `imageWidth` and `imageHeight`
   - Simple, clear compositions work best for similarity generation

4. **Timeout Issues**
   - Generation can take time, especially for multiple variations
   - Consider reducing `numVariations` if processing takes too long
   - Contact the service provider if persistent timeout issues occur

5. **API Quota Issues**
   - Monitor your Firefly Services API usage
   - Contact the service provider if you need increased quota

For additional support, consult the Adobe Developer Documentation or contact the service provider.
