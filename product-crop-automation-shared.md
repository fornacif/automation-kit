# Product Crop Automation (Shared service)

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
2. Create a new profile named "Product Crop Automation"
3. Add a new Custom Processing Services with the following configuration:
   - `product-crop` as Rendition Name and `jpg` or `png` as extension (based on your output format)
   - Endpoint URL: {Contact me for accessing the URL}
   - Service Parameters (see below for details)
   - Set appropriate Mime Types for included images (e.g., `image/jpeg`, `image/png`)

### Service Parameters

The following parameters can be configured in your AEM Processing Profile for Product Crop:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `certificate` | string | **Yes** | - | The AEM certificate JSON structure obtained from [AEM Certificate Setup](#aem-certificate-setup) |
| `createAsset` | boolean | No | `true` | Creates a new asset in AEM with the cropped image |
| `createRendition` | boolean | No | `false` | Creates a rendition of the original asset instead of a new asset |
| `outputFormatType` | string | No | `image/jpeg` | Output format for the generated image. Supported values: `image/jpeg`, `image/png` |
| `paddingWidth` | number | No | `50` | Horizontal padding in pixels to add around the detected subject |
| `paddingHeight` | number | No | `50` | Vertical padding in pixels to add around the detected subject |
| `imageWidth` | number | No | - | Optional target width for the output image in pixels. If not specified, original dimensions are preserved |

**Example Configuration:**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- createAsset: true
- createRendition: false
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

The Product Crop Automation uses Adobe Firefly Services API to:

1. **Subject Detection**: AI automatically identifies the main subject/product in the image
2. **Intelligent Cropping**: Calculates optimal crop boundaries around the detected subject
3. **Padding Application**: Adds configurable padding (horizontal and vertical) around the subject
4. **Image Generation**: Creates a new cropped image with the product perfectly centered
5. **Asset Creation**: Either creates a new asset or adds a rendition to the existing asset in AEM

This ensures consistent product presentation across all your assets, with the subject always prominent and properly framed.

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

3. **Subject Detection Issues**
   - Ensure images have clear subjects that can be detected
   - Images with complex backgrounds may require adjustment of padding parameters
   - Try adjusting `paddingWidth` and `paddingHeight` for better results

4. **Output Format Issues**
   - Verify `outputFormatType` matches the rendition extension in the Processing Profile
   - Ensure the output format is supported (`image/jpeg` or `image/png`)

For additional support, consult the Adobe Developer Documentation or contact the service provider.
