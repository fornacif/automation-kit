# Substance 3D Compose

The Substance 3D Compose action automates the composition and staging of 3D scenes using Adobe Substance 3D services. This automation allows you to programmatically arrange, compose, and configure 3D assets to create professional product visualizations and scenes.

## Prerequisites & Setup

**For common setup instructions**, including:
- Prerequisites (self-hosted and shared service)
- Adobe App Builder project initialization
- Environment configuration
- AEM certificate setup
- Deployment steps
- Common troubleshooting

Please refer to the **[Shared Setup Guide](shared-setup.md)**.

This document covers only the **Substance 3D Compose** specific configuration and usage.

## Implementation

### Action Code

For self-hosted deployments, implement the action using:
- **File:** [actions/firefly-services/index.js](https://github.com/fornacif/automation-kit/blob/main/actions/firefly-services/index.js)
- **Action Name:** `firefly-services` (unified action in app.config.yaml)
- **Action Identifier:** `substance-3d-compose` (passed via `actionName` parameter)

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
2. Create a new profile named "Substance 3D Compose"
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
| `actionName` | string | **Yes** | Both | - | Must be set to `substance-3d-compose` |
| `substance3dAccessToken` | string | **Yes** | Both | - | Access token obtained from [Substance 3D API Documentation](https://s3d.adobe.io/docs#/) |
| `cameraName` | string | No | Both | - | Name of the camera to use for the composition |
| `heroAsset` | string | No | Both | - | Path or identifier of the main/hero asset in the composition |
| `prompt` | string | No | Both | - | Text prompt or description for AI-assisted scene composition |

**Example Configuration (Self-hosted):**
```yaml
Service Parameters:
- actionName: substance-3d-compose
- substance3dAccessToken: eyJhbGciOiJSUzI1NilsIngIdSI6ImltlcJ9uYT...
- cameraName: ProductView01
- heroAsset: /content/dam/products/shoe-model.glb
- prompt: Professional product photography setup with soft lighting
```

**Example Configuration (Shared service):**
```yaml
Service Parameters:
- certificate: {YOUR_AEM_CERTIFICATE_JSON}
- actionName: substance-3d-compose
- substance3dAccessToken: eyJhbGciOiJSUzI1NilsIngIdSI6ImltlcJ9uYT...
- cameraName: ProductView01
- heroAsset: /content/dam/products/shoe-model.glb
- prompt: Professional product photography setup with soft lighting
```

### Execute Automation

**⚠️ IMPORTANT:** Do NOT apply the processing profile to a folder. The profile generates new composed scene files, which could trigger unwanted behavior. Always execute the processing profile manually on specific 3D model files.

1. Create a new folder in AEM Assets
2. Upload your 3D model files or scene configuration to the folder
3. Select the file(s) you want to process
4. Manually trigger the "Substance 3D Compose" processing profile (Reprocess Assets)
5. The automation will:
   - Upload the 3D assets to Substance 3D services
   - Compose and stage the 3D scene based on configuration
   - Generate the composed scene
   - Download the generated output
   - Create new assets in AEM
6. Monitor the processing in the AEM Assets processing queue and check Tasks in the AEM Inbox
7. Check that the composed scene assets have been created

## How It Works

**Applies to:** Both self-hosted and shared service

The Substance 3D Compose automation uses Adobe Substance 3D Services API to:

1. **Asset Upload**: Uploads 3D models and scene configuration to Substance 3D services
2. **Scene Composition**: Arranges and composes 3D elements according to specifications
3. **Staging Configuration**: Sets up lighting, materials, and environment settings
4. **Scene Processing**: Generates the composed 3D scene
5. **Asset Creation**: Downloads the composed scene and creates new assets in AEM

This enables automated creation of professional 3D product scenes and compositions without manual intervention.

## Use Cases

**Applies to:** Both self-hosted and shared service

- **Product Staging**: Automatically stage products in predefined scenes
- **Scene Composition**: Compose multiple 3D elements into complete scenes
- **Environment Setup**: Apply consistent lighting and environment settings
- **Batch Processing**: Process multiple products with the same scene configuration
- **Consistent Branding**: Ensure uniform scene composition across product lines
- **Automated Workflows**: Integrate 3D composition into automated content pipelines

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

3. **Scene Configuration Issues**
   - Verify scene configuration is properly formatted
   - Check that all referenced assets are available
   - Ensure composition parameters are valid
   - Verify compatibility between assets

4. **Output Issues**
   - Check that composed scenes are being created in AEM
   - Verify the output quality and format meet requirements
   - Ensure sufficient storage space in AEM

### Debug Mode (Self-hosted only)

See [Shared Setup Guide - Debug Mode](shared-setup.md#debug-mode-self-hosted-only) for instructions on enabling debug logging.

For additional support, consult the [Substance 3D API Documentation](https://s3d.adobe.io/docs#/).
