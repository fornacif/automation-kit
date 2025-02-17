# Automation Kit

Welcome to the Automation Kit accelerator

## Setup

- Populate your `.env` file in your App Builder Project with properties included in `example.env`

## Deploy & Cleanup

- `aio app deploy` to build and deploy all actions on Runtime
- `aio app undeploy` to undeploy the app

## Config

### `.env`

Edi your `.env`file with the following properties

```bash
# This file must **not** be committed to source control

FIREFLY_SERVICES_API_CLIENT_ID=<<TBD>>
FIREFLY_SERVICES_API_CLIENT_SECRET=<<TBD>>
FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,read_organizations,firefly_api,ff_apis
INDESIGN_FIREFLY_SERVICES_API_CLIENT_ID=<<TBD>>
INDESIGN_FIREFLY_SERVICES_API_CLIENT_SECRET=<<TBD>>
INDESIGN_FIREFLY_SERVICES_API_SCOPES=openid,AdobeID,creative_sdk,indesign_services,creative_cloud
AZURE_STORAGE_ACCOUNT_NAME=<<TBD>>
AZURE_STORAGE_ACCOUNT_KEY=<<TBD>>
AZURE_STORAGE_CONTAINER_NAME=<<TBD>>
AEM_CERTIFICATE='{
  "ok": true,
  "integration": {
    COPY YOUR CERTIFICATE HERE FROM THE AEM DEVELOPER CONSOLE
  },
  "statusCode": 200
}'
```

### `app.config.yaml`

- Main configuration file that defines an application's implementation. 
- More information on this file, application configuration, and extension configuration 
  can be found [here](https://developer.adobe.com/app-builder/docs/guides/appbuilder-configuration/#appconfigyaml)

#### Action Dependencies

**Packaged action file**: Add your action's dependencies to the root
  `package.json` and install them using `npm install`. Then set the `function`
  field in `app.config.yaml` to point to the **entry file** of your action
  folder. We will use `webpack` to package your code and dependencies into a
  single minified js file. The action will then be deployed as a single file.
  Use this method if you want to reduce the size of your actions.

