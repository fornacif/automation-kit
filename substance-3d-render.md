# Substance 3D Render

The Substance 3D Render action automates the rendering of 3D models using Adobe Substance 3D services. This automation generates high-quality renders from 3D assets with customizable camera angles, lighting, and rendering parameters.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **Substance 3D Render** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/index.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `substance-3d-render` (passed via `actionName` parameter)

See the [Shared Setup Guide - App Configuration](shared-setup.md#4-app-configuration) for the unified `app.config.yaml` configuration.

## Substance 3D Access Token

**Applies to:** Both self-hosted and shared service

Before using this action, you need to obtain a Substance 3D access token:

1. Navigate to [Substance 3D API Documentation](https://s3d.adobe.io/docs#/)
2. Log in with your Adobe credentials
3. Generate or retrieve your access token
4. Copy the access token for use in the AEM Processing Profile

**Note:** The access token is required for authentication with Substance 3D services.

## AEM Configuration

**Applies to:** Both self-hosted and shared service

### Setup Processing Profile

1. Navigate to AEM Tools > Assets > Processing Profiles
2. Create a new profile named "Substance 3D Render"
3. Add a new Custom Processing Services with the following configuration:
   - **Rendition Name:** `rendition`
   - **Extension:** `txt`
   - **Endpoint URL:**
     - **Self-hosted:** Use the deployed web action URL from the [Shared Setup Guide - Deployment](shared-setup.md#5-deployment)
     - **Shared service:** `https://85792-608blackantelope-stage.adobeioruntime.net/api/v1/web/demo-kit.processing-profiles/firefly-services`
       - **Note:** You must share your AEM Organization ID with me to authorize access to this shared service
   - **Service Parameters:** See below for details
   - **Mime Types:** Include 3D model formats (e.g., `model/gltf-binary`, `model/gltf+json`)

### Service Parameters

The following parameters can be configured in your AEM Processing Profile:

| Parameter | Type | Required | Deployment | Default | Description |
|-----------|------|----------|------------|---------|-------------|
| `certificate` | string | **Yes** | Shared service only | - | The AEM certificate JSON structure obtained from the [Shared Setup Guide - AEM Certificate Setup](shared-setup.md#aem-certificate-setup) |
| `actionName` | string | **Yes** | Both | - | Must be set to `substance-3d-render` |
| `substance3dAccessToken` | string | **Yes** | Both | - | Access token obtained from [Substance 3D API Documentation](https://s3d.adobe.io/docs#/) |
| `zoomFactor` | number | No | Both | `0.75` | Camera zoom factor for rendering. Affects how close or far the camera is from the model |
| `focal` | number | No | Both | `50` | Camera focal length in millimeters. Affects field of view and perspective |
| `altitude` | number | No | Both | `25` | Camera altitude angle in degrees. Controls vertical viewing angle |
| `azimuths` | string | No | Both | `45, 315, 135, 225` | Camera azimuth angles in degrees (comma-separated). Defines horizontal rotation positions for multiple renders |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: substance-3d-render
- substance3dAccessToken: eyJhbGciOiJSUzI1NilsIngIdSI6ImltlcJ9uYT...
- zoomFactor: 0.75
- focal: 50
- altitude: 25
- azimuths: 45, 315, 135, 225
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: substance-3d-render
- substance3dAccessToken: eyJhbGciOiJSUzI1NilsIngIdSI6ImltlcJ9uYT...
- zoomFactor: 0.75
- focal: 50
- altitude: 25
- azimuths: 45, 315, 135, 225
```

### Execute Automation

**⚠️ IMPORTANT:** Do NOT apply the processing profile to a folder. The profile generates new rendered image files, which could trigger unwanted behavior. Always execute the processing profile manually on specific 3D model files.

1. Upload your 3D model files (glTF, GLB, or other supported formats) to the folder
2. Select the 3D model file(s) you want to render
3. Manually trigger the "Substance 3D Render" processing profile (Reprocess Assets)
4. The automation will:
   - Upload the 3D model to Substance 3D services
   - Configure camera positions based on the specified parameters
   - Render the model from multiple azimuth angles
   - Download the generated renders
   - Create new image assets in AEM for each render
5. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
6. Check that the rendered images have been created

## How It Works

**Applies to:** Both self-hosted and shared service

The Substance 3D Render automation uses Adobe Substance 3D Services API to:

1. **Model Upload**: Uploads the 3D model to Substance 3D services
2. **Camera Configuration**: Sets up virtual cameras based on the specified parameters:
   - **Zoom Factor**: Controls camera distance from the model
   - **Focal Length**: Defines the camera lens characteristics
   - **Altitude**: Sets the vertical viewing angle
   - **Azimuths**: Defines multiple horizontal rotation angles for comprehensive coverage
3. **Rendering**: Generates high-quality renders from each camera position
4. **Multi-Angle Output**: Creates renders from all specified azimuth angles (e.g., 4 renders at 45°, 135°, 225°, 315°)
5. **Asset Creation**: Downloads each render and creates new image assets in AEM

This ensures consistent, high-quality product visualization with professional lighting and rendering from multiple angles.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **Product Visualization**: Generate professional product renders for e-commerce
- **360° Views**: Create multiple angle renders for interactive product viewers
- **Marketing Materials**: Produce high-quality 3D renders for campaigns
- **Catalog Imagery**: Automate product image creation from 3D models
- **Consistent Branding**: Ensure uniform lighting and rendering across all products
- **Rapid Prototyping**: Quickly visualize 3D designs without manual rendering

## Troubleshooting

**Applies to:** Both self-hosted and shared service

For common troubleshooting steps, see the [Shared Setup Guide - Common Troubleshooting](shared-setup.md#common-troubleshooting).

### Action-Specific Issues

1. **Access Token Issues**
   - Verify the `substance3dAccessToken` is valid and not expired
   - Obtain a fresh token from [Substance 3D API Documentation](https://s3d.adobe.io/docs#/)
   - Ensure you're logged in with the correct Adobe account
   - Check that your account has access to Substance 3D services

2. **3D Model Issues**
   - Verify the 3D model format is supported (glTF, GLB)
   - Check that the model file is not corrupted
   - Ensure the model has proper materials and textures
   - Verify file size is within API limits

3. **Camera Parameter Issues**
   - Verify `zoomFactor` is a positive number (recommended: 0.5-2.0)
   - Check that `focal` is appropriate for your model (typical range: 24-200mm)
   - Ensure `altitude` is within reasonable bounds (e.g., -90 to 90 degrees)
   - Verify `azimuths` are comma-separated numbers (e.g., "45, 135, 225, 315")

4. **Render Quality Issues**
   - Adjust `zoomFactor` to better frame the model
   - Try different `focal` lengths for different perspective effects
   - Modify `altitude` to change the vertical viewing angle
   - Add more azimuth angles for more comprehensive coverage

5. **Multiple Render Issues**
   - Ensure `azimuths` parameter is correctly formatted
   - Check that all azimuth values are valid (0-360 degrees)
   - Verify sufficient processing time for multiple renders
   - Monitor API quota for batch rendering operations

6. **Output Issues**
   - Check that rendered images are being created in AEM
   - Verify the image quality and resolution meet requirements
   - Ensure sufficient storage space in AEM for multiple renders

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the [Substance 3D API Documentation](https://s3d.adobe.io/docs#/).
