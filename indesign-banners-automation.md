# InDesign Banners Automation

The InDesign Banners Automation system automates the creation of banner variations by generating new InDesign templates and converting them into print-ready format (PDF) or web-ready image formats (JPEG or PNG). This process streamlines marketing asset production and ensures consistency across all banner variations.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **InDesign Banners Automation** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/index.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `indesign-banners-automation` (passed via `actionName` parameter)

**Note:** This action requires InDesign Firefly Services API credentials. See the [Shared Setup Guide - Environment Configuration](shared-setup.md#3-environment-configuration) for InDesign-specific environment variables.

See the [Shared Setup Guide - App Configuration](shared-setup.md#4-app-configuration) for the unified `app.config.yaml` configuration.

## Sample Assets

**Applies to:** Both self-hosted and shared service

Download the sample assets containing:
- Sample InDesign templates (`samples/indesign-banners-automation/1080x1080.indd`, `samples/indesign-banners-automation/800x1080.indd`)
- Sample images (`samples/indesign-banners-automation/inputs`)
- Sample data (`samples/indesign-banners-automation/inputs/data.csv`)

Sample assets can be found in the [samples/indesign-banners-automation](https://github.com/fornacif/automation-kit/tree/main/samples/indesign-banners-automation) directory of this repository.

### Image and Element Naming Convention

#### Image Files
Image files in the `inputs` folder must be referenced in the data file (CSV) with the `@` prefix for image columns.

For example in the data file:
```csv
variation,lang,title,text,@image
hiking,en,Hiking,"Hiking in the mountains",hiking.jpeg
biking,en,Biking,"Biking in the city",biking.jpeg
```

The `@image` column indicates that the value should be treated as an image file reference. The InDesign template must have a frame or element named `image` that will be replaced with the corresponding image file.

### Data Content Structure

The data content for different variants and languages can be provided in CSV (`.csv`) format. For CSV files, each value must be enclosed in double quotes to ensure proper CSV formatting. The structure is:

```csv
variation,lang,title,text,@image
hiking,en,Hiking,"Hiking in the mountains",hiking.jpeg
hiking,fr,Randonnée,"Randonnée en montagne",hiking.jpeg
biking,en,Biking,"Biking in the city",biking.jpeg
biking,fr,Vélo,"Vélo en ville",biking.jpeg
surfing,en,Surfing,"Surfing on the beach",surfing.jpeg
surfing,fr,Surf,"Surf sur la plage",surfing.jpeg
```

Where:
- `variation`: Identifies the banner variation
- `lang`: Language code
- `@[column]`: Columns prefixed with `@` contain image file references
- `[any]`: Other columns contain text content that must match text frame names in the InDesign template

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "InDesign Banners Automation"
3. Add a new Custom Processing Services with the following configuration:
   - **Rendition Name:** `rendition`
   - **Extension:** `txt`
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [Shared Setup Guide - Deployment](shared-setup.md#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - **Service Parameters:** See below for details
   - **Mime Type:** `application/vnd.adobe.indesign`

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from the [Shared Setup Guide - AEM Certificate Setup](shared-setup.md#aem-certificate-setup) |
| `actionName` | string | **Yes** | Both | - | Must be set to `indesign-banners-automation` |
| `outputFormatType` | string | No | Both | `application/pdf` | Output format. Values: `application/pdf`, `image/jpeg`, `image/png` |
| `resolution` | number | No | Both | `300` | Resolution in DPI. Recommended: 300 for print, 72-150 for web |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: indd-banners-automation
- outputFormatType: application/pdf
- resolution: 300
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: indd-banners-automation
- outputFormatType: application/pdf
- resolution: 300
```

### Execute Automation

1. Create a new folder
2. Upload your InDesign template(s)
3. Create two subfolders: `INPUTS` and `OUTPUTS`
4. **(Optional)** Enable Dynamic Media on the `INPUTS` folder (for image optimization)
5. **(Optional)** If Dynamic Media with Open API is enabled, simply approve the assets once they are uploaded
6. Upload your assets (images, data file) to the `INPUTS` folder
7. Trigger manually the "InDesign Banners Automation" processing profile to the InDesign file (Reprocess Assets)
8. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
9. Check that new banners have been created inside the `OUTPUTS` folder

## How It Works

**Applies to:** Both self-hosted and shared service

The InDesign Banners Automation uses Adobe InDesign Services API to:

1. **Template Processing**: Reads the InDesign template file
2. **Data Injection**: Parses the data file (CSV) and maps values to InDesign elements
3. **Image Replacement**: Replaces placeholder images with actual assets from the INPUTS folder
4. **Text Replacement**: Updates text frames with content from the data file
5. **Export**: Generates output files in the specified format (PDF, JPEG, or PNG)
6. **Asset Creation**: Uploads generated files to the OUTPUTS folder in AEM

This automation enables rapid creation of localized banner variations, maintaining design consistency while supporting multiple languages and content variations.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **Print Campaigns**: Generate print-ready PDFs for different markets or regions
- **Multi-Language Materials**: Create localized versions of marketing materials
- **Product Catalogs**: Generate catalog pages with different products and descriptions
- **Event Materials**: Create promotional materials for various events
- **Brand Templates**: Maintain design consistency across multiple banner variations
- **High-Resolution Output**: Produce print-quality materials at 300 DPI

## Troubleshooting

**Applies to:** Both self-hosted and shared service

For common troubleshooting steps, see the [Shared Setup Guide - Common Troubleshooting](shared-setup.md#common-troubleshooting).

### Action-Specific Issues

1. **InDesign Template Issues**
   - Ensure frame names in the template match column names in the data file
   - For image columns, use `@` prefix in the data file header
   - Verify all referenced frames exist in the InDesign template
   - Frame names are case-sensitive

2. **Data File Issues**
   - Ensure CSV files use proper quoting for text containing commas
   - Check that column names match InDesign element names
   - Verify variation and lang columns are present
   - Ensure file encoding is UTF-8 for special characters

3. **Image Reference Issues**
   - Verify all referenced images exist in the INPUTS folder
   - Check that image filenames in CSV match actual files
   - Ensure image formats are supported (JPEG, PNG)
   - Verify images are not corrupted

4. **Output Quality Issues**
   - Adjust `resolution` parameter for desired output quality
   - Use 300 DPI for print-quality PDFs
   - Use 72-150 DPI for web/screen display
   - Verify outputFormatType matches your needs

5. **Font Issues**
   - Ensure fonts used in InDesign template are available in the InDesign Services environment
   - Consider using standard Adobe Fonts for better compatibility
   - Check for missing font warnings in error messages

6. **API Issues**
   - Verify InDesign Firefly Services API credentials are configured (self-hosted)
   - Check that API quota is not exceeded
   - Monitor API response times for large files

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the Adobe Developer Documentation.
