# Photoshop Product Crop

The Photoshop Product Crop feature provides intelligent image cropping capabilities through AI-powered subject detection, ensuring the product remains perfectly centered and prominent in all generated renditions. The system automatically generates a new asset rendition with the cropped visual.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **Photoshop Product Crop** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/index.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `photoshop-product-crop` (passed via `actionName` parameter)

See the [Shared Setup Guide - App Configuration](shared-setup.md#4-app-configuration) for the unified `app.config.yaml` configuration.

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Photoshop Product Crop"
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
| `actionName` | string | **Yes** | Both | - | Must be set to `product-crop-automation` |
| `createAsset` | boolean | No | Both | `true` | Creates a new asset in AEM with the cropped image or creates a rendition of the original asset if set to false |
| `outputFormatType` | string | No | Both | `image/jpeg` | Output format. Values: `image/jpeg`, `image/png` |
| `paddingWidth` | number | No | Both | `50` | Horizontal padding in pixels to add around the detected subject |
| `paddingHeight` | number | No | Both | `50` | Vertical padding in pixels to add around the detected subject |
| `imageWidth` | number | No | Both | - | Optional target width for the output image in pixels. If not specified, original dimensions are preserved |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: product-crop-automation
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
- actionName: product-crop-automation
- createAsset: true
- outputFormatType: image/jpeg
- paddingWidth: 50
- paddingHeight: 50
- imageWidth: 2000
```

### Execute Automation

**⚠️ IMPORTANT:** Do NOT apply the processing profile to a folder. The profile generates new files (if `createAsset` is true) or renditions, which could trigger unwanted behavior. Always execute the processing profile manually on specific files.

1. Upload your product images to the folder
2. Select the image(s) you want to process
3. Manually trigger the "Photoshop Product Crop" processing profile (Reprocess Assets)
4. The automation will:
   - Detect the subject in the image using AI
   - Apply the specified padding around the subject
   - Generate a cropped image with the product centered
   - Create a new asset or rendition based on your configuration
5. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
6. Check that the cropped product images have been created

## How It Works

**Applies to:** Both self-hosted and shared service

The Photoshop Product Crop uses Adobe Firefly Services API to:

1. **Subject Detection**: AI automatically identifies the main subject/product in the image
2. **Intelligent Cropping**: Calculates optimal crop boundaries around the detected subject
3. **Padding Application**: Adds configurable padding (horizontal and vertical) around the subject
4. **Image Generation**: Creates a new cropped image with the product perfectly centered
5. **Asset Creation**: Either creates a new asset or adds a rendition to the existing asset in AEM

This ensures consistent product presentation across all your assets, with the subject always prominent and properly framed.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **E-commerce**: Ensure products are consistently centered in catalog images
- **Product Photography**: Automatically crop and frame product shots
- **Catalog Management**: Standardize product imagery across large catalogs
- **Responsive Images**: Create properly cropped images for different display sizes
- **Image Normalization**: Ensure consistent product presentation across various sources
- **Bulk Processing**: Process hundreds or thousands of product images automatically

## Troubleshooting

**Applies to:** Both self-hosted and shared service

For common troubleshooting steps, see the [Shared Setup Guide - Common Troubleshooting](shared-setup.md#common-troubleshooting).

### Action-Specific Issues

1. **Subject Detection Issues**
   - Ensure images have clear subjects that can be detected
   - Images with complex backgrounds may require adjustment of padding parameters
   - Try adjusting `paddingWidth` and `paddingHeight` for better results
   - Very busy or cluttered images may not detect subjects accurately

2. **Padding Issues**
   - Increase padding values if subject appears too close to edges
   - Decrease padding values if too much background is included
   - Use different padding for width and height for non-square subjects
   - Consider the aspect ratio of your target output

3. **Output Format Issues**
   - Verify `outputFormatType` matches the rendition extension in the Processing Profile
   - Ensure the output format is supported (`image/jpeg` or `image/png`)
   - Use PNG for images requiring transparency
   - Use JPEG for standard product photos to reduce file size

4. **Image Width Issues**
   - If `imageWidth` is specified, the image will be resized while maintaining aspect ratio
   - Omit `imageWidth` to preserve original dimensions
   - Consider target display size when setting width
   - Ensure width is not larger than source image (will upscale)

5. **createAsset Parameter**
   - Set to `true` to create a new separate asset
   - Set to `false` to create a rendition of the original asset
   - Consider your asset organization strategy when choosing
   - New assets provide better searchability

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the Adobe Developer Documentation.
