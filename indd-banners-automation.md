# INDD Banners Automation (Self hosted)

## Prerequisites

- Adobe Developer Console access
- App Builder
- AEM as a Cloud Service instance
- InDesign Firefly Services API access (credentials)
- Node.js 18+ installed
- Adobe I/O CLI installed (`npm install -g @adobe/aio-cli`)

## Project Setup

### 1. Initialize Adobe App Builder Project

#### Console Setup
1. Navigate to [Adobe Developer Console](https://developer.adobe.com/console)
2. Click "Create new project from template"
3. Select "App Builder" template
4. Name your project (e.g., "Banners Automation")

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
mkdir indd-banners-automation
cd indd-banners-automation
```

2. Create an `index.js` file with the content from:
[actions/indd-banners-automation/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/indd-banners-automation/index.js)

### 3. AEM Certificate Setup

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

### 4. Environment Configuration

Add the following properties to your `.env` file:

```plaintext
# This file must not be committed to source control

INDESIGN_FIREFLY_SERVICES_API_CLIENT_ID=[REDACTED]
INDESIGN_FIREFLY_SERVICES_API_CLIENT_SECRET=[REDACTED]
INDESIGN_FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,creative_sdk,indesign_services,creative_cloud
AEM_CERTIFICATE='{
  "ok": true,
  "integration": {
    COPY YOUR CERTIFICATE HERE FROM THE AEM DEVELOPER CONSOLE
  },
  "statusCode": 200
}'
```

### 5. App Configuration

Update your `app.config.yaml` with the following:

```yaml
actions:
  indd-banners-automation:
    function: actions/indd-banners-automation/index.js
    web: 'yes'
    runtime: nodejs:18
    limits:
      memorySize: 512
      concurrency: 10
      timeout: 600000
    inputs:
      LOG_LEVEL: info
      inDesignFireflyServicesApiClientId: $INDESIGN_FIREFLY_SERVICES_API_CLIENT_ID
      inDesignFireflyServicesApiClientSecret: $INDESIGN_FIREFLY_SERVICES_API_CLIENT_SECRET
      inDesignFireflyServicesApiScopes: $INDESIGN_FIREFLY_SERVICES_API_SCOPES
      aemCertificate: $AEM_CERTIFICATE
    annotations:
      require-adobe-auth: true
```

More actions can be configured like shown in the [app.config.yaml](https://github.com/fornacif/automation-kit/blob/main/app.config.yaml) present in the repository.

## Deployment

Deploy your application using the Adobe I/O CLI:

```bash
aio app deploy
```

The deployment will provide you with a web action URL that will be used in the AEM Processing Profile.

## Sample Assets

Download the sample assets containing:
- Sample InDesign templates (`samples/indd-banners-automation/1080x1080.indd`, `samples/indd-banners-automation/800x1080.indd`)
- Sample images (`samples/indd-banners-automation/inputs`)
- Sample data (`samples/indd-banners-automation/inputs/data.csv` or `data.xlsx`)

Sample assets can be found in the [samples/indd-banners-automation](https://github.com/fornacif/automation-kit/tree/main/samples/indd-banners-automation) directory of this repository.

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

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "INDD Banners Automation"
3. Add a new Custom Processing Services with the following configuration:
   - `inputs` as Rendition Name and `json` as extension
   - [Endpoint URL previously deployed](#deployment): {Your deployed web action URL}
   - Service Parameters (see below for details)
   - Set `application/vnd.adobe.indesign` for included Mime Type

### Service Parameters

The following parameters can be configured in your AEM Processing Profile for INDD Banners:

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `outputFormatType` | string | No | `application/pdf` | Output format for the generated files. Supported values: `application/pdf`, `image/jpeg`, `image/png` |
| `resolution` | number | No | `300` | Resolution in DPI (dots per inch) for the output. Recommended: 300 for print, 72-150 for web |

**Example Configuration:**
```yaml
Service Parameters:
- outputFormatType: application/pdf
- resolution: 300
```

### Execute Automation

1. Create a new folder
2. Upload your InDesign template(s)
3. Create two subfolders: `INPUTS` and `OUTPUTS`
4. Apply the Processing Profile you created to the folder
5. (Optional) Enable Dynamic Media on the `INPUTS` folder
6. (Optional) If Dynamic Media with Open API is enabled, simply approve the assets once they are uploaded
7. Upload your assets (images, data file) to the `INPUTS` folder
8. Trigger manually the "INDD Banners Automation" processing profile to the InDesign file (Reprocess Assets)
9. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
10. Check that new banners have been created inside the `OUTPUTS` folder

## How It Works

The INDD Banners Automation uses Adobe InDesign Services API to:

1. **Template Processing**: Reads the InDesign template file
2. **Data Injection**: Parses the data file (CSV) and maps values to InDesign elements
3. **Image Replacement**: Replaces placeholder images with actual assets from the INPUTS folder
4. **Text Replacement**: Updates text frames with content from the data file
5. **Export**: Generates output files in the specified format (PDF, JPEG, or PNG)
6. **Asset Creation**: Uploads generated files to the OUTPUTS folder in AEM

This automation enables rapid creation of localized banner variations, maintaining design consistency while supporting multiple languages and content variations.

## Troubleshooting

### Common Issues and Solutions

1. **Processing Profile Errors**
   - Verify the web action URL is correct and accessible
   - Check Tasks in the AEM Inbox to see if some errors happened
   - Check the action logs using:
     ```bash
     aio app logs
     ```
   - Ensure all required parameters are properly configured

2. **InDesign Template Issues**
   - Ensure frame names in the template match column names in the data file
   - For image columns, use `@` prefix in the data file header
   - Verify all referenced images exist in the INPUTS folder

3. **Data File Issues**
   - Ensure CSV files use proper quoting for text containing commas
   - Check that column names match InDesign element names

4. **Output Quality Issues**
   - Adjust `resolution` parameter for desired output quality
   - Use 300 DPI for print-quality PDFs
   - Use 72-150 DPI for web/screen display

### Debug Mode

Enable debug logging by:
1. Setting `LOG_LEVEL=debug` in your `.env` file
2. Redeploying the application
3. Monitoring logs during execution:
   ```bash
   aio app logs -f
   ```

For additional support, consult the Adobe Developer Documentation.
