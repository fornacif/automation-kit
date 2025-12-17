# Photoshop Banners Automation

The Photoshop Banners Automation system automates the creation of banner variations by generating new PSD templates and converting them into web-ready image formats (JPEG or PNG). This process streamlines marketing asset production and ensures consistency across all banner variations.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **Photoshop Banners Automation** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/index.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `photoshop-banners-automation` (passed via `actionName` parameter)

See the [Shared Setup Guide - App Configuration](shared-setup.md#4-app-configuration) for the unified `app.config.yaml` configuration.

## Sample Assets

**Applies to:** Both self-hosted and shared service

Download the sample assets containing:
- Sample PSD template (`samples/psd-banners-automation/template.psd`)
- Sample images and fonts (`samples/psd-banners-automation/inputs`)
- Sample texts (`samples/psd-banners-automation/inputs/texts.csv` or `samples/psd-banners-automation/inputs/texts.xlsx`)

Sample assets can be found in the [samples/psd-banners-automation](https://github.com/fornacif/automation-kit/tree/main/samples/psd-banners-automation) directory of this repository.

### Image and Layer Naming Convention

#### Image Files
Image files in the `inputs` folder must follow this naming pattern:
```
<variation>--<layer_image_name>.<extension>
```
For example:
```
summer_sale--hero_image.jpeg
summer_sale--product_shot.png
```

#### PSD Layer Names
The layer names in your PSD template must follow these rules:

1. **Image Layers**: The layer name must exactly match the `layer_image_name` part of your image filename:
   ```
   Image file: summer_sale--hero_image.jpg => PSD layer name: hero_image
   ```

2. **Smart Crop**: To use Dynamic Media's Smart Crop feature, append the Smart Crop name using a pipe separator:
   ```
   hero_image|1800x600 => Will apply '1800x600' Smart Crop to hero_image
   ```

### Text Content Structure

The text content for different variants and languages can be provided in either CSV (`.csv`) or Excel (`.xlsx`) format. For CSV files, each value must be enclosed in double quotes to ensure proper CSV formatting. The structure is:

```csv
variation,lang,title,text,website
climbing,en,Climbing,"Feel the raw adventure and excitement of our guided rock climbing experience.",www.wknd.com
climbing,fr,Escalade,"Vivez l'aventure pure et l'excitation de notre expérience d'escalade guidée.",www.wknd.fr
cycling,en,Cycling,"Join us as we explore the rugged, stunningly gorgeous landscape of southern Utah.",www.wknd.com
cycling,fr,Cyclisme,"Rejoignez-nous pour explorer les paysages accidentés et spectaculaires du sud de l'Utah.",www.wknd.fr
```

Where:
- `variation`: Identifies the banner variation
- `lang`: Language code
- `[any]`: Must match any text layer name in the PSD

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Smart Crop (Optional)

**Note:** Smart Crop requires Dynamic Media or Dynamic Media with Open API to be enabled.

To enable Smart Crop functionality for your images:

1. Navigate to AEM Tools > Assets > Image Profiles
2. Create or edit an Image Processing Profiles
   - Name your Image Processing Profiles
   - Select "Smart Crop" Type in Cropping Options
   - Configure Responsive Image Crop based on your needs:
     ```
     1800x600: 1800x600 (Web Banners)
     1200x630: 1200x630 (Facebook/Twitter)
     1080x1080: 1080x1080 (Instagram)
     ```
   - Save the configuration

Remember that Smart Crop names in this configuration must match the ones used in your PSD layer names (e.g., `hero_image|1800x600`).

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Photoshop Banners Automation"
3. Add a new Custom Processing Services with the following configuration:
   - **Rendition Name:** `rendition`
   - **Extension:** `txt`
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [Shared Setup Guide - Deployment](shared-setup.md#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - **Service Parameters:** See below for details
   - **Mime Type:** `image/vnd.adobe.photoshop`

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from the [Shared Setup Guide - AEM Certificate Setup](shared-setup.md#aem-certificate-setup) |
| `actionName` | string | **Yes** | Both | - | Must be set to `psd-banners-automation` |
| `outputFormatType` | string | No | Both | - | Output format. Values: `image/jpeg`, `image/png` |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: psd-banners-automation
- outputFormatType: image/jpeg
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: psd-banners-automation
- outputFormatType: image/jpeg
```

### Execute Automation

1. Create a new folder
2. Upload your PSD template
3. Create two subfolders: `INPUTS` and `OUTPUTS`
4. Apply the Image Processing Profile you created previously (if using Smart Crop)
5. **(Optional)** Enable Dynamic Media on the `INPUTS` folder (only if using Smart Crop)
6. **(Optional)** If Dynamic Media with Open API is enabled, simply approve the assets once they are uploaded
7. Upload your assets (images and fonts) to the `INPUTS` folder
8. Trigger manually the "Photoshop Banners Automation" processing profile to the PSD file (Reprocess Assets)
9. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
10. Check that new banners have been created inside the `OUTPUTS` folder

## How It Works

**Applies to:** Both self-hosted and shared service

The Photoshop Banners Automation uses Adobe Firefly Services API (Photoshop) to:

1. **Template Analysis**: Reads the PSD template and identifies layers
2. **Input Processing**: Parses text files (CSV/XLSX) and matches images based on naming conventions
3. **Layer Manipulation**:
   - Replaces text layers with content from the text file
   - Replaces image layers with corresponding images from the INPUTS folder
   - Applies Smart Crop renditions from Dynamic Media (if configured)
4. **Batch Generation**: Creates all variations and languages in one execution
5. **Format Conversion**: Converts each PSD variation to the specified output format (JPEG or PNG)
6. **Asset Organization**: Saves all generated banners to the OUTPUTS folder

This enables rapid creation of localized banner variations while maintaining design consistency and brand standards.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **Multi-Language Campaigns**: Generate banners in multiple languages from a single template
- **Seasonal Promotions**: Quickly create variations for different products or themes
- **Regional Marketing**: Produce location-specific banners with local imagery
- **A/B Testing**: Generate multiple banner versions for testing
- **Brand Consistency**: Ensure all banners follow the same design system
- **Responsive Design**: Create banners in multiple sizes using Smart Crop

## Troubleshooting

**Applies to:** Both self-hosted and shared service

For common troubleshooting steps, see the [Shared Setup Guide - Common Troubleshooting](shared-setup.md#common-troubleshooting).

### Action-Specific Issues

1. **Layer Naming Issues**
   - Verify PSD layer names match the naming conventions
   - For images: layer name must match the part after `--` in filenames
   - For Smart Crop: use pipe separator (e.g., `layer_name|crop_name`)
   - Layer names are case-sensitive

2. **Text File Issues**
   - Ensure CSV/XLSX column names match text layer names in PSD
   - Verify all text values are properly quoted in CSV files
   - Check that variation and lang columns are present
   - Ensure file encoding is UTF-8 for special characters

3. **Image Issues**
   - Verify all referenced images exist in the INPUTS folder
   - Check that image filenames follow the `variation--layer_name.ext` pattern
   - Ensure image formats are supported (JPEG, PNG)
   - Verify images are not corrupted

4. **Smart Crop Issues (Optional Feature)**
   - Verify Dynamic Media is enabled on the INPUTS folder
   - Ensure Smart Crop profile names match those in PSD layer names
   - Check that images have been processed by Dynamic Media
   - Verify Smart Crop renditions exist before running automation

5. **Font Issues**
   - Ensure all fonts used in PSD are available in INPUTS folder
   - Verify font file formats are supported
   - Check that font names in PSD match uploaded font files

6. **Output Issues**
   - Verify outputFormatType is set correctly (image/jpeg or image/png)
   - Check OUTPUTS folder permissions
   - Ensure sufficient storage space in AEM

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the Adobe Developer Documentation.
