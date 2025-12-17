# PSD Banners Automation

The PSD Banners Automation system automates the creation of banner variations by generating new PSD templates and converting them into web-ready image formats (JPEG or PNG). This document covers both self-hosted and shared service deployment options.

## Prerequisites

### Self-hosted
- Adobe Developer Console access
- App Builder
- AEM as a Cloud Service instance
- Dynamic Media or Dynamic Media with Open API
- Firefly Services API access (credentials)
- Node.js 18+ installed
- Adobe I/O CLI installed (`npm install -g @adobe/aio-cli`)

### Shared service
- AEM as a Cloud Service instance
- Dynamic Media or Dynamic Media with Open API

## Self-hosted Setup

This section applies only to self-hosted deployments.

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
mkdir psd-banners-automation
cd psd-banners-automation
```

2. Create an `index.js` file with the content from:
[actions/psd-banners-automation/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/psd-banners-automation/index.js)

### 3. Environment Configuration

Add the following properties to your `.env` file:

```plaintext
# This file must not be committed to source control

FIREFLY_SERVICES_API_CLIENT_ID=[REDACTED]
FIREFLY_SERVICES_API_CLIENT_SECRET=[REDACTED]
FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,read_organizations,firefly_api,ff_apis
AEM_CERTIFICATE='{
  "ok": true,
  "integration": {
    COPY YOUR CERTIFICATE HERE FROM THE AEM DEVELOPER CONSOLE
  },
  "statusCode": 200
}'
```

### 4. App Configuration

Update your `app.config.yaml` with the following:

```yaml
actions:
  psd-banners-automation:
    function: actions/psd-banners-automation/index.js
    web: 'yes'
    runtime: nodejs:18
    limits:
      memorySize: 1024
      concurrency: 10
      timeout: 600000
    inputs:
      LOG_LEVEL: info
      fireflyServicesApiClientId: $FIREFLY_SERVICES_API_CLIENT_ID
      fireflyServicesApiClientSecret: $FIREFLY_SERVICES_API_CLIENT_SECRET
      fireflyServicesApiScopes: $FIREFLY_SERVICES_API_SCOPES
      aemCertificate: $AEM_CERTIFICATE
    annotations:
      require-adobe-auth: true
```

More actions can be configured like shown in the [app.config.yaml](https://github.com/fornacif/automation-kit/blob/main/app.config.yaml) present in the repository.

### 5. Deployment

Deploy your application using the Adobe I/O CLI:

```bash
aio app deploy
```

The deployment will provide you with a web action URL that will be used in the AEM Processing Profile.

## AEM Certificate Setup

**Applies to:** Both self-hosted and shared service

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
skiing,en,Skiing,"If you're a slopes enthusiast, you know that one run in the backcountry is worth ten in the front country.",www.wknd.com
skiing,fr,Ski,"En tant que passionné de glisse, vous savez qu'une descente en hors-piste vaut dix descentes sur piste.",www.wknd.fr
surfing,en,Surfing,"Experience local surf guides will take care of all the logistics and find the best spots for you.",www.wknd.com
surfing,fr,Surf,"Nos guides de surf locaux s'occupent de toute la logistique et trouvent les meilleurs spots pour vous.",www.wknd.fr
```

Where:
- `variation`: Identifies the banner variation
- `lang`: Language code
- `[any]`: Must match any text layer name in the PSD

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Smart Crop (Optional)

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
2. Create a new profile named "PSD Banners Automation"
3. Add a new Custom Processing Services with the following configuration:
   - `inputs` as Rendition Name and `json` as extension
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [deployment step](#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - Service Parameters (see below for details)
   - Set `image/vnd.adobe.photoshop` for included Mime Type

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from [AEM Certificate Setup](#aem-certificate-setup) |
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
4. Apply the Image Processing Profile you created previously
5. (Optional) Enable Dynamic Media on the `INPUTS` folder
6. (Optional) If Dynamic Media with Open API is enabled, simply approve the assets once they are uploaded
7. Upload your assets (images and fonts) to the `INPUTS` folder
8. Trigger manually the "PSD Banners Automation" processing profile to the PSD file (Reprocess Assets)
9. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
10. Check that new banners have been created inside the `OUTPUTS` folder

## Troubleshooting

**Applies to:** Both self-hosted and shared service

### Common Issues and Solutions

1. **Processing Profile Errors**
   - Verify the web action URL is correct and accessible
   - Check Tasks in the AEM Inbox to see if some errors happened
   - **Self-hosted only:** Check the action logs using:
     ```bash
     aio app logs
     ```
   - Ensure all required parameters are properly configured
   - **Shared service only:** Verify the certificate parameter is correctly formatted as JSON

2. **Authentication Issues (Shared service)**
   - Ensure the AEM certificate is valid and not expired
   - Verify the technical account has the necessary permissions in AEM
   - Check that the certificate JSON structure is complete and properly formatted

### Debug Mode (Self-hosted only)

Enable debug logging by:
1. Setting `LOG_LEVEL=debug` in your `.env` file
2. Redeploying the application
3. Monitoring logs during execution:
   ```bash
   aio app logs -f
   ```

For additional support, consult the Adobe Developer Documentation.
