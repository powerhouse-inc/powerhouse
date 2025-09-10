# Configure your environment

After successfully setting up your server and installing the Powerhouse services using the `ph service setup` command as described in the [Setup Environment](./03-SetupEnvironment.md) guide, the next crucial step is to configure your environment. Proper configuration ensures that your Powerhouse Connect and Switchboard instances behave exactly as you need them to for your specific application.

Powerhouse offers two primary methods for configuration:

1.  **Environment Variables**: Using a `.env` file in your project root. This is a straightforward way to set configuration values.
2.  **Configuration Files**: For more complex configurations, some services might use a JSON configuration file (e.g., `powerhouse.config.json`).

:::warning
A key principle to remember is that **environment variables will always override values set in configuration files**. This allows for flexible setups, where you can have default configurations in a file and override them for different environments (development, staging, production) using environment variables.
:::

This guide will walk you through both methods and provide details on common configuration options, including setting up authorization.

## Using environment variables

The most common way to configure Powerhouse services is through environment variables. You can place these variables in a `.env` file at the root of your project directory. When you run `ph service start` or `ph service restart`, these variables are loaded into the environment of your running services.

### How to create and edit your .env file

If you're on your cloud server, you can create and edit the `.env` file directly:

1.  Navigate to your project directory: `cd <your-project-name>`
2.  Open the `.env` file with a text editor like `vim` or `nano`:
    ```bash
    vim .env
    ```
3.  Add your configuration variables, one per line, in the `KEY="VALUE"` format.
    ```env
    # Example for Connect
    PH_CONNECT_STUDIO_MODE="true"
    PH_CONNECT_DISABLE_ADD_DRIVE="true"
    ```
4.  Save the file and exit the editor (in `vim`, press `Esc`, then type `:wq` and press `Enter`).
5.  For the changes to take effect, you must restart the Powerhouse services:
    ```bash
    ph service restart
    ```

### Common environment variables for Connect

The Powerhouse Connect application has a wide range of available environment variables to toggle features and change its behavior. Below is a list of some variables you can configure.

```bash
# build arguments
BASE_PATH="/" # vite base path
BASE_HREF="./" # electron-forge base href
PH_CONNECT_APP_REQUIRES_HARD_REFRESH="true"
SENTRY_AUTH_TOKEN=""
SENTRY_ORG=""
SENTRY_PROJECT=""

# environment variables
LOG_LEVEL="info"

## app configuration & feature flags
PH_CONNECT_DISABLE_ADD_DRIVE="false"
PH_CONNECT_WARN_OUTDATED_APP="false"
PH_CONNECT_STUDIO_MODE="false"
PH_CONNECT_ROUTER_BASENAME="/"
PH_CONNECT_DEFAULT_DRIVES_URL=""
PH_CONNECT_ENABLED_EDITORS=""
PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES="false"
PH_CONNECT_SEARCH_BAR_ENABLED="false"
PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES="false"
PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES="false"
PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES="false"
PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES="false"
PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES="false"
PH_CONNECT_PUBLIC_DRIVES_ENABLED="true"
PH_CONNECT_CLOUD_DRIVES_ENABLED="true"
PH_CONNECT_LOCAL_DRIVES_ENABLED="true"
PH_CONNECT_ARBITRUM_ALLOW_LIST=""
PH_CONNECT_RWA_ALLOW_LIST=""
PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS="true"

PH_CONNECT_RENOWN_URL="https://auth.renown.id"
PH_CONNECT_RENOWN_NETWORK_ID="eip155"
PH_CONNECT_RENOWN_CHAIN_ID=1
PH_CONNECT_DISABLED_EDITORS="powerhouse/document-drive"

PH_CONNECT_ANALYTICS_DATABASE_NAME=""
PH_CONNECT_ANALYTICS_DATABASE_WORKER_DISABLED="false"

## error tracking
PH_CONNECT_SENTRY_DSN=""
PH_CONNECT_SENTRY_PROJECT=""
PH_CONNECT_SENTRY_ENV="prod"
PH_CONNECT_SENTRY_TRACING_ENABLED="false"

## analytics
PH_CONNECT_GA_TRACKING_ID=

FILE_UPLOAD_OPERATIONS_CHUNK_SIZE="50"
PH_CONNECT_VERSION_CHECK_INTERVAL="3600000"
PH_CONNECT_CLI_VERSION=""

## set during build
APP_VERSION=""
SENTRY_RELEASE=""
```

You can find the most up-to-date list of variables in the source repository: [https://github.com/powerhouse-inc/powerhouse/blob/main/apps/connect/.env](https://github.com/powerhouse-inc/powerhouse/blob/main/apps/connect/.env)

## Using a configuration file

For services like the Switchboard, you can also use a `powerhouse.config.json` file for more structured configuration, especially for features like authorization.

### Configuring authorization

A critical aspect of your environment configuration is setting up authorization to control who can access your services and what they can do. As detailed in our dedicated [Switchboard Authorization](/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization) guide, you can manage access using a role-based system.

Here's a quick overview of how you can configure authorization:

#### Via environment variables

You can set the roles directly in your `.env` file. This is quick and easy for simple allowlists.

```bash
# Required: Enable/disable authentication
AUTH_ENABLED=true

# Optional: Comma-separated list of guest wallet addresses
GUESTS="0x789...,0xabc..."

# Optional: Comma-separated list of regular user wallet addresses
USERS="0xdef...,0xghi..."

# Optional: Comma-separated list of admin wallet addresses
ADMINS="0x123...,0x456..."
```

#### Via `powerhouse.config.json`

For a cleaner setup, especially with longer lists of addresses, you can define them in `powerhouse.config.json` in your project root.

```json
{
  "switchboard": {
    "auth": {
      "enabled": true,
      "guests": ["0x789...", "0xabc..."],
      "users": ["0xdef...", "0xghi..."],
      "admins": ["0x123...", "0x456..."]
    }
  }
}
```

Remember, if you define `AUTH_ENABLED=false` as an environment variable, it will override the `enabled: true` setting in your JSON file.

For a complete understanding of how roles (Guest, User, Admin) work and the permissions they have, please refer to the full [Authorization guide](/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization).

## Applying your changes

Regardless of which method you use to update your configuration, the changes will not be applied until you restart your services.

Use the following command to do so:

```bash
ph service restart
```

This will stop and then start the Connect and Switchboard services, ensuring they load the new configuration. You can check the status with `ph service status`.

## Summary

Configuring your environment is a key step to tailor the Powerhouse platform to your needs. By using a combination of `.env` files for simple key-value settings and `powerhouse.config.json` for more structured data, you have fine-grained control over all features, from the UI of the Connect app to the security and authorization on your Switchboard.
