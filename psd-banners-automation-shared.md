# PSD Banners Automation (Shared service)

## Prerequisites

- AEM as a Cloud Service instance
- Dynamic Media or Dynamic Media with Open API

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

## Sample Assets

Download the sample assets containing:
- Sample PSD template (`samples/psd-banners-automation/template.psd`)
- Sample images and fonts (`samples/psd-banners-automation/inputs`)
- Sample texts (`samples/psd-banners-automation/inputs/texts.csv`)

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

The `texts.csv` file contains the text content for different variants and languages. Each value must be enclosed in double quotes to ensure proper CSV formatting. The structure is:

```csv
variation,lang,title,text,website
climbing,en,Climbing,"Feel the raw adventure and excitement of our guided rock climbing experience.",www.wknd.com
climbing,fr,Escalade,"Vivez l'aventure pure et l'excitation de notre expérience d'escalade guidée.",www.wknd.fr
cycling,en,Cycling,"Join us as we explore the rugged, stunningly gorgeous landscape of southern Utah.",www.wknd.com
cycling,fr,Cyclisme,"Rejoignez-nous pour explorer les paysages accidentés et spectaculaires du sud de l'Utah.",www.wknd.fr
skiing,en,Skiing,"If you’re a slopes enthusiast, you know that one run in the backcountry is worth ten in the front country.",www.wknd.com
skiing,fr,Ski,"En tant que passionné de glisse, vous savez qu'une descente en hors-piste vaut dix descentes sur piste.",www.wknd.fr
surfing,en,Surfing,"Experience local surf guides will take care of all the logistics and find the best spots for you.",www.wknd.com
surfing,fr,Surf,"Nos guides de surf locaux s'occupent de toute la logistique et trouvent les meilleurs spots pour vous.",www.wknd.fr
```

Where:
- `variation`: Identifies the banner variation
- `lang`: Language code
- `[any]`: Must match any text layer name in the PSD

## AEM Configuration

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
   - `inputs`as Rendition Name and `json` as extension
   - Endpoint URL: {Contact me for accessing the URL}
   - Services Parameters:
     1. `outputFormatType` as key and `image/jpeg` or `image/png` as value
     2. `certificate` as key and the previously created [AEM JSON Certificate](#aem-certificate-setup) as value
   - Set `image/vnd.adobe.photoshop` for included Mime Type

### Execute Automation

1. Create a new folder
2. Upload your PSD template
3. Create two subfolders: `INPUTS` and `OUTPUTS`
4. (Optional) Enable Dynamic Media on the `INPUTS` folder.
5. (Optional) If Dynamic Media with Open API is enabled, simply approve the assets once they are uploaded
6. Upload your assets (images and fonts) to the `INPUTS` folder
7. Trigger mannually the "PSD Banners Automation" processing profile to the PSD file (Reprocess Assets)
8. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
9. Check that new banners have been created inside the `OUTPUTS` folder

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

### Debug Mode

Enable debug logging by:
1. Setting `LOG_LEVEL=debug` in your `.env` file
2. Redeploying the application
3. Monitoring logs during execution:
   ```bash
   aio app logs -f
   ```

For additional support, consult the Adobe Developer Documentation.
