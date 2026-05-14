# Illustrator Brochure Automation

The Illustrator Brochure Automation system automates the creation of brochure and banner variations by merging data into Adobe Illustrator templates and exporting them into multiple formats (PDF, PNG, JPEG, SVG, AI, EPS). This process streamlines marketing asset production and ensures consistency across all output variations.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **Illustrator Brochure Automation** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/index.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `illustrator-brochure-automation` (passed via `actionName` parameter)

See the [Shared Setup Guide - App Configuration](shared-setup.md#4-app-configuration) for the unified `app.config.yaml` configuration.

## Sample Assets

**Applies to:** Both self-hosted and shared service

Download the sample assets containing:
- Sample Illustrator templates (`samples/illustrator-brochure-automation/*.ai`)
- Sample images (`samples/illustrator-brochure-automation/inputs`)
- Sample data (`samples/illustrator-brochure-automation/inputs/data.csv`)

Sample assets can be found in the [samples/illustrator-brochure-automation](https://github.com/fornacif/automation-kit/tree/main/samples/illustrator-brochure-automation) directory of this repository.

### Image and Element Naming Convention

#### Image Files
Image files in the `inputs` folder must be referenced in the data file (CSV or XLSX) with the `@` prefix for image columns.

For example in the data file:
```csv
variation,lang,title,text,@image
summer,en,Summer Sale,"Hot deals this summer",summer.jpeg
winter,en,Winter Sale,"Great deals this winter",winter.jpeg
```

The `@image` column indicates that the value should be treated as an image file reference. The Illustrator template must have a linked or embedded element named `image` that will be replaced with the corresponding image file.

### Data Content Structure

The data content for different variants and languages can be provided in CSV (`.csv`) or Excel (`.xlsx`) format.

**CSV format** — each value must be enclosed in double quotes:
```csv
variation,lang,title,text,@image
summer,en,Summer Sale,"Hot deals this summer",summer.jpeg
summer,fr,Soldes d'été,"Bonnes affaires cet été",summer.jpeg
winter,en,Winter Sale,"Great deals this winter",winter.jpeg
winter,fr,Soldes d'hiver,"Bonnes affaires cet hiver",winter.jpeg
```

**Excel format** — upload an `.xlsx` file instead of a `.csv` file. The first sheet is used; column headers follow the same conventions.

Where:
- `variation`: Identifies the output variation
- `lang`: Language code
- `@[column]`: Columns prefixed with `@` contain image file references
- `[any]`: Other columns contain text content that must match element names in the Illustrator template

### Font Files

Custom fonts (OTF or TTF) can be uploaded to the `inputs` folder. The automation automatically detects and passes them to the Illustrator API. A fallback font (`Poppins-Regular`) is applied for any missing glyphs.

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Illustrator Brochure Automation"
3. Add a new Custom Processing Services with the following configuration:
   - **Rendition Name:** `rendition`
   - **Extension:** `txt`
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [Shared Setup Guide - Deployment](shared-setup.md#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - **Service Parameters:** See below for details
   - **Mime Type:** `application/illustrator`

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from the [Shared Setup Guide - AEM Certificate Setup](shared-setup.md#aem-certificate-setup) |
| `actionName` | string | **Yes** | Both | - | Must be set to `illustrator-brochure-automation` |
| `outputFormatType` | string | No | Both | `application/pdf` | Output format. Values: `application/pdf`, `image/jpeg`, `image/png`, `image/svg+xml`, `application/illustrator`, `application/eps` |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: illustrator-brochure-automation
- outputFormatType: application/pdf
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: illustrator-brochure-automation
- outputFormatType: application/pdf
```

### Execute Automation

**⚠️ IMPORTANT:** Do NOT apply the processing profile to a folder. The profile generates new files in the OUTPUTS folder, which could trigger unwanted behavior. Always execute the processing profile manually on the Illustrator file.

1. Upload your Illustrator template(s) (`.ai` files)
2. Create two subfolders: `INPUTS` and `OUTPUTS`
3. **(Optional)** Enable Dynamic Media on the `INPUTS` folder (for image optimization)
4. **(Optional)** If Dynamic Media with Open API is enabled, simply approve the assets once they are uploaded
5. Upload your assets (images, data file, optional fonts) to the `INPUTS` folder
6. Select the Illustrator file
7. Manually trigger the "Illustrator Brochure Automation" processing profile to the Illustrator file (Reprocess Assets)
8. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
9. Check that new outputs have been created inside the `OUTPUTS` folder

## How It Works

**Applies to:** Both self-hosted and shared service

The Illustrator Brochure Automation uses Adobe Illustrator Services API to:

1. **Template Processing**: Reads the Illustrator template file (`.ai`)
2. **Data Injection**: Parses the data file (CSV or XLSX) and maps values to Illustrator elements
3. **Image Replacement**: Replaces placeholder images with actual assets from the INPUTS folder
4. **Text Replacement**: Updates text elements with content from the data file
5. **Font Loading**: Injects custom fonts from the INPUTS folder, falling back to `Poppins-Regular` for missing glyphs
6. **Export**: Generates output files in the specified format (PDF, PNG, JPEG, SVG, AI, or EPS)
7. **Asset Creation**: Uploads generated files to the OUTPUTS folder in AEM

Output files are named `{template}-{variation}-{lang}.{ext}` when variation and language are present in the data, or `{template}-row{N}.{ext}` otherwise.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **Print Campaigns**: Generate print-ready PDFs for different markets or regions
- **Multi-Language Materials**: Create localized versions of brochures and marketing materials
- **Digital Banners**: Export web-ready PNG or JPEG variations at scale
- **Scalable Vector Output**: Produce SVG or AI files for further downstream editing
- **Brand Templates**: Maintain design consistency across multiple output variations

## Troubleshooting

**Applies to:** Both self-hosted and shared service

For common troubleshooting steps, see the [Shared Setup Guide - Common Troubleshooting](shared-setup.md#common-troubleshooting).

### Action-Specific Issues

1. **Illustrator Template Issues**
   - Ensure element names in the template match column names in the data file
   - For image columns, use `@` prefix in the data file header
   - Verify all referenced elements exist in the Illustrator template
   - Element names are case-sensitive

2. **Data File Issues**
   - For CSV files, ensure values are properly quoted when they contain commas
   - For XLSX files, ensure data is in the first sheet
   - Check that column names match Illustrator element names
   - Verify variation and lang columns are present
   - Ensure file encoding is UTF-8 for special characters

3. **Image Reference Issues**
   - Verify all referenced images exist in the INPUTS folder
   - Check that image filenames in the data file match actual files exactly
   - Ensure image formats are supported (JPEG, PNG)

4. **Font Issues**
   - Upload custom OTF or TTF font files to the INPUTS folder
   - Ensure font filenames do not conflict with system fonts
   - If a glyph is missing, the fallback font `Poppins-Regular` is used automatically
   - Check error messages for unsupported font format warnings

5. **Partial Success**
   - When some rows fail, the automation reports a `partially_succeeded` status
   - Check the AEM Inbox task for a detailed error breakdown per row
   - Fix data or template issues for the failing rows and re-run

6. **Output Format Issues**
   - Verify `outputFormatType` is one of the supported MIME types
   - Use `application/pdf` for print-ready output
   - Use `image/png` or `image/jpeg` for web-ready output
   - Use `image/svg+xml`, `application/illustrator`, or `application/eps` for editable vector output

7. **API Issues**
   - Verify Firefly Services API credentials are configured (self-hosted)
   - Check that API quota is not exceeded
   - Monitor API response times for large templates or many data rows

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the Adobe Developer Documentation.
