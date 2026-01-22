# Powerhouse CLI

### Installing the Powerhouse CLI

:::tip
The **Powerhouse CLI tool** is the only essential tool to install on this page. Install it with the command below.

You can find all of the commands on this page, similar to what would displayed when using ph --help or ph _command_ --help.
Use the table of content or the search function to find what you are looking for.

The Powerhouse CLI (`ph-cmd`) is a command-line interface tool that provides essential commands for managing Powerhouse Vetra projects. You can get access to the Powerhouse ecosystem tools by installing them globally.

```bash
pnpm install -g ph-cmd
```

:::

<!-- AUTO-GENERATED-CLI-COMMANDS-START -->\n<!-- This content is automatically generated. Do not edit directly. -->\n### ph-cmd Commands\n\n- [Init](#init)
- [Use](#use)
- [Update](#update)
- [Setup Globals](#setup-globals)
- [Use Local](#use-local)
<br>
## Init
Initialize a new project
### arguments
#### Name <br>
The name of your project. A new directory will be created in your current directory with this name.<br><br>
**usage:** `[name]`<br>


### options
#### Name <br>
The name of your project. A new directory will be created in your current directory with this name.<br><br>
**usage:** `--name, -n <str>`<br>

#### Package Manager <br>
Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.<br><br>
**usage:** `--package-manager, -p <value>`<br>

#### Tag <br>
Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".<br><br>
**usage:** `--tag, -t <value>`<br>

#### Version <br>
Specify the exact semver release version to use for your project.<br><br>
**usage:** `--version, -v <str>`<br>

#### Remote Drive <br>
Remote drive identifier.<br><br>
**usage:** `--remote-drive, -r <str>`<br>


### flags
#### Npm <br>
Use 'npm' as package manager<br><br>
**usage:** `--npm`<br>

#### Pnpm <br>
Use 'pnpm' as package manager<br><br>
**usage:** `--pnpm`<br>

#### Yarn <br>
Use 'yarn' as package manager<br><br>
**usage:** `--yarn`<br>

#### Bun <br>
Use 'bun' as package manager<br><br>
**usage:** `--bun`<br>

#### Dev <br>
Use the `dev` release tag.<br><br>
**usage:** `--dev, -d`<br>

#### Staging <br>
Use the `staging` release tag.<br><br>
**usage:** `--staging, -s`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Use
Specify the release version of Powerhouse dependencies to use.
### arguments
#### Tag <br>
Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".<br><br>
**usage:** `[tag]`<br>


### options
#### Tag <br>
Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".<br><br>
**usage:** `--tag, -t <value>`<br>

#### Version <br>
Specify the exact semver release version to use for your project.<br><br>
**usage:** `--version, -v <str>`<br>


### flags
#### Skip Install <br>
Skip running `install` with your package manager<br><br>
**usage:** `--skip-install, -s`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Update
Update your powerhouse dependencies to their latest tagged version
### flags
#### Skip Install <br>
Skip running `install` with your package manager<br><br>
**usage:** `--skip-install, -s`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Setup Globals
Initialize a new global project
### arguments
#### Name <br>
The name of your project. A new directory will be created in your current directory with this name.<br><br>
**usage:** `[name]`<br>


### options
#### Name <br>
The name of your project. A new directory will be created in your current directory with this name.<br><br>
**usage:** `--name, -n <str>`<br>

#### Package Manager <br>
Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.<br><br>
**usage:** `--package-manager, -p <value>`<br>

#### Tag <br>
Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev".<br><br>
**usage:** `--tag, -t <value>`<br>

#### Version <br>
Specify the exact semver release version to use for your project.<br><br>
**usage:** `--version, -v <str>`<br>

#### Remote Drive <br>
Remote drive identifier.<br><br>
**usage:** `--remote-drive, -r <str>`<br>


### flags
#### Npm <br>
Use 'npm' as package manager<br><br>
**usage:** `--npm`<br>

#### Pnpm <br>
Use 'pnpm' as package manager<br><br>
**usage:** `--pnpm`<br>

#### Yarn <br>
Use 'yarn' as package manager<br><br>
**usage:** `--yarn`<br>

#### Bun <br>
Use 'bun' as package manager<br><br>
**usage:** `--bun`<br>

#### Dev <br>
Use the `dev` release tag.<br><br>
**usage:** `--dev, -d`<br>

#### Staging <br>
Use the `staging` release tag.<br><br>
**usage:** `--staging, -s`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Use Local
Use your local `powerhouse` monorepo dependencies the current project.
### arguments
#### Monorepo Path <br>
Path to your local powerhouse monorepo relative to this project<br><br>
**usage:** `[monorepo path]`<br>


### options
#### Path <br>
Path to your local powerhouse monorepo relative to this project<br><br>
**usage:** `--path, -p <str>`<br>


### flags
#### Skip Install <br>
Skip running `install` with `pnpm`<br><br>
**usage:** `--skip-install, -s`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>\n\n### ph-cli Commands\n\n- [Generate](#generate)
- [Vetra](#vetra)
- [Connect](#connect)
- [Connect Studio](#connect-studio)
- [Connect Build](#connect-build)
- [Connect Preview](#connect-preview)
- [Access Token](#access-token)
- [Inspect](#inspect)
- [List](#list)
- [Migrate](#migrate)
- [Switchboard](#switchboard)
- [Login](#login)
- [Install](#install)
- [Uninstall](#uninstall)
<br>
## Generate

The generate command creates code from document models. It helps you build editors, 
processors, and other components based on your document model files.

This command:
1. Reads document model definitions
2. Generates code for specified components (editors, processors, etc.)
3. Supports customization of output and generation options
4. Can watch files for changes and regenerate code automatically

### arguments
#### Document Model File Path <br>
Path to the document model file.<br><br>
**usage:** `[document model file path]`<br>


### options
#### File <br>
Path to the document model file.<br><br>
**usage:** `--file <str>`<br>

#### Editor <br>
Editor name.<br><br>
**usage:** `--editor <str>`<br>

#### Editor Id <br>
Editor ID<br><br>
**usage:** `--editor-id <str>`<br>

#### Editor Dir Name <br>
Use a different directory name for the generated editor. Default is the editor name in kebab case.<br><br>
**usage:** `--editor-dir-name <str>`<br>

#### Document Type <br>
Document type for the generated code.<br><br>
**usage:** `--document-type <str>`<br>

#### Drive Editor <br>
Drive editor name.<br><br>
**usage:** `--drive-editor <str>`<br>

#### App Id <br>
Drive editor ID.<br><br>
**usage:** `--app-id <str>`<br>

#### Drive Editor Dir Name <br>
Use a different directory name for the generated drive editor. Default is the drive editor name in kebab case.<br><br>
**usage:** `--drive-editor-dir-name <str>`<br>

#### Processor <br>
Processor name.<br><br>
**usage:** `--processor <str>`<br>

#### Processor Type <br>
Whether to generate an analytics processor or a relational DB processor. Default is analytics.<br><br>
**usage:** `--processor-type <value>`<br>
**default**: `analytics`
#### Subgraph <br>
Subgraph name.<br><br>
**usage:** `--subgraph <str>`<br>

#### Import Script <br>
Import script name.<br><br>
**usage:** `--import-script <str>`<br>

#### Allowed Document Types <br>
Supported document types for a drive editor.<br><br>
**usage:** `--allowed-document-types <str>`<br>

#### Migration File <br>
Path to the migration file.<br><br>
**usage:** `--migration-file <str>`<br>

#### Schema File <br>
Path to the output file. Defaults to './schema.ts'<br><br>
**usage:** `--schema-file <str>`<br>


### flags
#### Disable Drag And Drop <br>
Disable drag and drop in the generated drive editor.<br><br>
**usage:** `--disable-drag-and-drop`<br>

#### Force <br>
Overwrite operation reducers.<br><br>
**usage:** `--force, -f`<br>

#### Logs <br>
Show additional logging information.<br><br>
**usage:** `--logs`<br>

#### Watch <br>
Watch the generated code.<br><br>
**usage:** `--watch, -w`<br>

#### Skip Format <br>
Skip formatting the generated code.<br><br>
**usage:** `--skip-format, -sf`<br>

#### Use Hygen <br>
Use legacy hygen codegen<br><br>
**usage:** `--use-hygen`<br>
**default**: `false`
#### Use Versioning <br>
Allow upgrading document models with versioning.<br><br>
**usage:** `--use-versioning`<br>
**default**: `false`
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Vetra

The vetra command sets up a Vetra development environment for working with Vetra projects.
It starts a Vetra Switchboard and optionally Connect Studio, enabling document collaboration 
and real-time processing with a "Vetra" drive or connection to remote drives.

This command:
1. Starts a Vetra Switchboard with a "Vetra" drive for document storage
2. Optionally connects to remote drives instead of creating a local drive
3. Starts Connect Studio pointing to the Switchboard for user interaction (unless disabled)
4. Enables real-time updates, collaboration, and code generation
### options
#### Switchboard Port <br>
port to use for the Vetra Switchboard<br><br>
**usage:** `--switchboard-port <number>`<br>

#### Connect Port <br>
port to use for the Vetra Connect<br><br>
**usage:** `--connect-port <number>`<br>
**default**: `3000`
#### Remote Drive <br>
URL of remote drive to connect to (skips switchboard initialization)<br><br>
**usage:** `--remote-drive <str>`<br>
**default**: `undefined`
#### Base <br>
Base path for the app<br><br>
**usage:** `--base <str>`<br>
**env**: `PH_CONNECT_BASE_PATH`
#### Log Level <br>
Log level for the application<br><br>
**usage:** `--log-level <value>`<br>
**env**: `PH_CONNECT_LOG_LEVEL`<br>**default**: `info`
#### Packages <br>
Comma-separated list of package names to load<br><br>
**usage:** `--packages <str>`<br>
**env**: `PH_PACKAGES`
#### Local Package <br>
Path to local package to load during development<br><br>
**usage:** `--local-package <str>`<br>
**env**: `PH_LOCAL_PACKAGE`
#### Default Drives Url <br>
The default drives url to use in connect<br><br>
**usage:** `--default-drives-url <str>`<br>
**env**: `PH_CONNECT_DEFAULT_DRIVES_URL`
#### Drive Preserve Strategy <br>
The preservation strategy to use on default drives<br><br>
**usage:** `--drive-preserve-strategy <value>`<br>
**env**: `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`<br>**default**: `preserve-by-url-and-detach`
#### Watch Timeout <br>
Amount of time to wait before a file is considered changed<br><br>
**usage:** `--watch-timeout <number>`<br>
**env**: `PH_WATCH_TIMEOUT`<br>**default**: `300`
#### Https Key File <br>
path to the ssl key file<br><br>
**usage:** `--https-key-file <str>`<br>

#### Https Cert File <br>
path to the ssl cert file<br><br>
**usage:** `--https-cert-file <str>`<br>

#### Remote Drives <br>
Specify remote drive URLs to use<br><br>
**usage:** `--remote-drives <str>`<br>


### flags
#### Watch <br>
Enable dynamic loading for document-models and editors in connect-studio and switchboard<br><br>
**usage:** `--watch, -w`<br>
**default**: `false`
#### Logs <br>
Show additional logs<br><br>
**usage:** `--logs`<br>
**default**: `false`
#### Disable Connect <br>
Skip Connect initialization (only start switchboard and reactor)<br><br>
**usage:** `--disable-connect`<br>
**default**: `false`
#### Interactive <br>
Enable interactive mode for code generation (requires user confirmation before generating code)<br><br>
**usage:** `--interactive`<br>
**default**: `false`
#### Ignore Local <br>
Do not load local packages from this project<br><br>
**usage:** `--ignore-local`<br>
**env**: `PH_DISABLE_LOCAL_PACKAGE`
#### Force <br>
Force dep pre-optimization regardless of whether deps have changed.<br><br>
**usage:** `--force`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Host <br>
Expose the server to the network<br><br>
**usage:** `--host`<br>

#### Open <br>
Open browser on startup<br><br>
**usage:** `--open`<br>

#### Cors <br>
Enable CORS<br><br>
**usage:** `--cors`<br>

#### Strict Port <br>
Exit if specified port is already in use<br><br>
**usage:** `--strictPort`<br>

#### Print Urls <br>
Print server urls<br><br>
**usage:** `--print-urls`<br>
**default**: `true`
#### Bind Cli Shortcuts <br>
Bind CLI shortcuts<br><br>
**usage:** `--bind-cli-shortcuts`<br>
**default**: `true`
#### Https <br>
Use https<br><br>
**usage:** `--https`<br>

#### Dev <br>
enable development mode to load local packages<br><br>
**usage:** `--dev`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Connect
Powerhouse Connect commands. Use with `studio`, `build` or `preview`. Defaults to `studio` if not specified.
## Connect Studio
The studio command starts the Connect Studio, a development environment for building
and testing Powerhouse applications. It provides a visual interface for working with
your project.

This command:
1. Starts a local Connect Studio server
2. Provides a web interface for development
3. Allows you to interact with your project components
4. Supports various configuration options for customization

### options
#### Port <br>
Port to run the dev server on.<br><br>
**usage:** `--port <number>`<br>
**default**: `3000`
#### Base <br>
Base path for the app<br><br>
**usage:** `--base <str>`<br>
**env**: `PH_CONNECT_BASE_PATH`
#### Log Level <br>
Log level for the application<br><br>
**usage:** `--log-level <value>`<br>
**env**: `PH_CONNECT_LOG_LEVEL`<br>**default**: `info`
#### Packages <br>
Comma-separated list of package names to load<br><br>
**usage:** `--packages <str>`<br>
**env**: `PH_PACKAGES`
#### Local Package <br>
Path to local package to load during development<br><br>
**usage:** `--local-package <str>`<br>
**env**: `PH_LOCAL_PACKAGE`
#### Default Drives Url <br>
The default drives url to use in connect<br><br>
**usage:** `--default-drives-url <str>`<br>
**env**: `PH_CONNECT_DEFAULT_DRIVES_URL`
#### Drive Preserve Strategy <br>
The preservation strategy to use on default drives<br><br>
**usage:** `--drive-preserve-strategy <value>`<br>
**env**: `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`<br>**default**: `preserve-by-url-and-detach`
#### Watch Timeout <br>
Amount of time to wait before a file is considered changed<br><br>
**usage:** `--watch-timeout <number>`<br>
**env**: `PH_WATCH_TIMEOUT`<br>**default**: `300`

### flags
#### Ignore Local <br>
Do not load local packages from this project<br><br>
**usage:** `--ignore-local`<br>
**env**: `PH_DISABLE_LOCAL_PACKAGE`
#### Force <br>
Force dep pre-optimization regardless of whether deps have changed.<br><br>
**usage:** `--force`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Host <br>
Expose the server to the network<br><br>
**usage:** `--host`<br>

#### Open <br>
Open browser on startup<br><br>
**usage:** `--open`<br>

#### Cors <br>
Enable CORS<br><br>
**usage:** `--cors`<br>

#### Strict Port <br>
Exit if specified port is already in use<br><br>
**usage:** `--strictPort`<br>

#### Print Urls <br>
Print server urls<br><br>
**usage:** `--print-urls`<br>
**default**: `true`
#### Bind Cli Shortcuts <br>
Bind CLI shortcuts<br><br>
**usage:** `--bind-cli-shortcuts`<br>
**default**: `true`
#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Connect Build
The Connect build command creates a production build with the project's local and
external packages included

### options
#### Out Dir <br>
Output directory<br><br>
**usage:** `--outDir <str>`<br>
**default**: `.ph/connect-build/dist/`
#### Base <br>
Base path for the app<br><br>
**usage:** `--base <str>`<br>
**env**: `PH_CONNECT_BASE_PATH`
#### Log Level <br>
Log level for the application<br><br>
**usage:** `--log-level <value>`<br>
**env**: `PH_CONNECT_LOG_LEVEL`<br>**default**: `info`
#### Packages <br>
Comma-separated list of package names to load<br><br>
**usage:** `--packages <str>`<br>
**env**: `PH_PACKAGES`
#### Local Package <br>
Path to local package to load during development<br><br>
**usage:** `--local-package <str>`<br>
**env**: `PH_LOCAL_PACKAGE`
#### Default Drives Url <br>
The default drives url to use in connect<br><br>
**usage:** `--default-drives-url <str>`<br>
**env**: `PH_CONNECT_DEFAULT_DRIVES_URL`
#### Drive Preserve Strategy <br>
The preservation strategy to use on default drives<br><br>
**usage:** `--drive-preserve-strategy <value>`<br>
**env**: `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`<br>**default**: `preserve-by-url-and-detach`

### flags
#### Ignore Local <br>
Do not load local packages from this project<br><br>
**usage:** `--ignore-local`<br>
**env**: `PH_DISABLE_LOCAL_PACKAGE`
#### Force <br>
Force dep pre-optimization regardless of whether deps have changed.<br><br>
**usage:** `--force`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Connect Preview
The Connect preview command previews a built Connect project.
NOTE: You must run `ph connect build` first

### options
#### Port <br>
Port to run the preview server on.<br><br>
**usage:** `--port <number>`<br>
**default**: `4173`
#### Out Dir <br>
Output directory<br><br>
**usage:** `--outDir <str>`<br>
**default**: `.ph/connect-build/dist/`
#### Base <br>
Base path for the app<br><br>
**usage:** `--base <str>`<br>
**env**: `PH_CONNECT_BASE_PATH`
#### Log Level <br>
Log level for the application<br><br>
**usage:** `--log-level <value>`<br>
**env**: `PH_CONNECT_LOG_LEVEL`<br>**default**: `info`
#### Packages <br>
Comma-separated list of package names to load<br><br>
**usage:** `--packages <str>`<br>
**env**: `PH_PACKAGES`
#### Local Package <br>
Path to local package to load during development<br><br>
**usage:** `--local-package <str>`<br>
**env**: `PH_LOCAL_PACKAGE`
#### Default Drives Url <br>
The default drives url to use in connect<br><br>
**usage:** `--default-drives-url <str>`<br>
**env**: `PH_CONNECT_DEFAULT_DRIVES_URL`
#### Drive Preserve Strategy <br>
The preservation strategy to use on default drives<br><br>
**usage:** `--drive-preserve-strategy <value>`<br>
**env**: `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`<br>**default**: `preserve-by-url-and-detach`
#### Watch Timeout <br>
Amount of time to wait before a file is considered changed<br><br>
**usage:** `--watch-timeout <number>`<br>
**env**: `PH_WATCH_TIMEOUT`<br>**default**: `300`

### flags
#### Ignore Local <br>
Do not load local packages from this project<br><br>
**usage:** `--ignore-local`<br>
**env**: `PH_DISABLE_LOCAL_PACKAGE`
#### Force <br>
Force dep pre-optimization regardless of whether deps have changed.<br><br>
**usage:** `--force`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Host <br>
Expose the server to the network<br><br>
**usage:** `--host`<br>

#### Open <br>
Open browser on startup<br><br>
**usage:** `--open`<br>

#### Cors <br>
Enable CORS<br><br>
**usage:** `--cors`<br>

#### Strict Port <br>
Exit if specified port is already in use<br><br>
**usage:** `--strictPort`<br>

#### Print Urls <br>
Print server urls<br><br>
**usage:** `--print-urls`<br>
**default**: `true`
#### Bind Cli Shortcuts <br>
Bind CLI shortcuts<br><br>
**usage:** `--bind-cli-shortcuts`<br>
**default**: `true`
#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Access Token

The access-token command generates a bearer token for API authentication. This token
can be used to authenticate requests to Powerhouse APIs like reactor-api (Switchboard).

This command:
1. Uses your CLI's cryptographic identity (DID) to sign a verifiable credential
2. Creates a JWT bearer token with configurable expiration
3. Outputs the token to stdout (info to stderr) for easy piping

Prerequisites:
  You must have a cryptographic identity. Run 'ph login' first to:
  - Generate a keypair (stored in .keypair.json)
  - Optionally link your Ethereum address (stored in .auth.json)

Token Details:
  The generated token is a JWT (JSON Web Token) containing:
  - Issuer (iss): Your CLI's DID (did:key:...)
  - Subject (sub): Your CLI's DID
  - Credential Subject: Chain ID, network ID, and address (if authenticated)
  - Expiration (exp): Based on --expiry option
  - Audience (aud): If --audience is specified

Output:
- Token information (DID, address, expiry) is printed to stderr
- The token itself is printed to stdout for easy piping/copying

This allows you to use the command in scripts:
  TOKEN=$(ph access-token)
  curl -H "Authorization: Bearer $TOKEN" http://localhost:4001/graphql

Usage with APIs:
  Generate token and use with curl
  TOKEN=$(ph access-token --expiry 1d)
  curl -X POST http://localhost:4001/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d '{"query": "{ drives { id name } }"}'

  Export as environment variable
  export PH_ACCESS_TOKEN=$(ph access-token)

Notes:
  - Tokens are self-signed using your CLI's private key
  - No network request is made; tokens are generated locally
  - The recipient API must trust your CLI's DID to accept the token
  - For reactor-api, ensure AUTH_ENABLED=true to require authentication

### options
#### Expiry <br>
Token expiry duration. Supports: "7d" (days), "24h" (hours), "3600" or "3600s" (seconds)<br><br>
**usage:** `--expiry <str>`<br>
**default**: `7d`
#### Audience <br>
Target audience URL for the token<br><br>
**usage:** `--audience <str>`<br>


### flags
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Inspect

The inspect command examines and provides detailed information about a Powerhouse package.
It helps you understand the structure, dependencies, and configuration of packages in
your project.

This command:
1. Analyzes the specified package
2. Retrieves detailed information about its structure and configuration
3. Displays package metadata, dependencies, and other relevant information
4. Helps troubleshoot package-related issues
### arguments
#### Package Name *[required]*<br>
The name of the package to inspect<br><br>
**usage:** `<package-name>`<br>


### flags
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## List

The list command displays information about installed Powerhouse packages in your project.
It reads the powerhouse.config.json file and shows the packages that are currently installed.

This command:
1. Examines your project configuration
2. Lists all installed Powerhouse packages
3. Provides a clear overview of your project's dependencies
4. Helps you manage and track your Powerhouse components

### flags
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Migrate
Run migrations
### flags
#### Use Hygen <br>
Use legacy hygen codegen<br><br>
**usage:** `--use-hygen`<br>
**default**: `false`
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Switchboard

The switchboard command starts a local Switchboard instance, which acts as the document
processing engine for Powerhouse projects. It provides the infrastructure for document
models, processors, and real-time updates.

This command:
1. Starts a local switchboard server
2. Loads document models and processors
3. Provides an API for document operations
4. Enables real-time document processing
5. Can authenticate with remote services using your identity from 'ph login'
### flags
#### Https <br>
Use https<br><br>
**usage:** `--https`<br>

#### Dev <br>
enable development mode to load local packages<br><br>
**usage:** `--dev`<br>

#### Ignore Local <br>
Do not load local packages from this project<br><br>
**usage:** `--ignore-local`<br>
**env**: `PH_DISABLE_LOCAL_PACKAGE`
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Use Identity <br>
enable identity using keypair from ph login (uses ~/.ph/keypair.json)<br><br>
**usage:** `--use-identity`<br>

#### Require Identity <br>
require existing keypair, fail if not found (implies --use-identity)<br><br>
**usage:** `--require-identity`<br>

#### Migrate <br>
Run database migrations and exit<br><br>
**usage:** `--migrate`<br>

#### Migrate Status <br>
Show migration status and exit<br><br>
**usage:** `--migrate-status`<br>

#### Mcp <br>
enable Mcp route at /mcp<br><br>
**usage:** `--mcp`<br>
**default**: `true`
#### Use Vetra Drive <br>
Use a Vetra drive<br><br>
**usage:** `--use-vetra-drive`<br>
**default**: `false`
#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


### options
#### Https Key File <br>
path to the ssl key file<br><br>
**usage:** `--https-key-file <str>`<br>

#### Https Cert File <br>
path to the ssl cert file<br><br>
**usage:** `--https-cert-file <str>`<br>

#### Remote Drives <br>
Specify remote drive URLs to use<br><br>
**usage:** `--remote-drives <str>`<br>

#### Packages <br>
Comma-separated list of package names to load<br><br>
**usage:** `--packages <str>`<br>
**env**: `PH_PACKAGES`
#### Port <br>
Port to host the api<br><br>
**usage:** `--port <number>`<br>
**default**: `4001`
#### Base Path <br>
base path for the API endpoints (sets the BASE_PATH environment variable)<br><br>
**usage:** `--base-path <str>`<br>

#### Keypair Path <br>
path to custom keypair file for identity<br><br>
**usage:** `--keypair-path <str>`<br>

#### Vetra Drive Id <br>
Specify a Vetra drive ID<br><br>
**usage:** `--vetra-drive-id <str>`<br>
**default**: `vetra`
#### Db Path <br>
path to the database<br><br>
**usage:** `--db-path <str>`<br>


## Login

The login command authenticates you with Renown using your Ethereum wallet. This enables
the CLI to act on behalf of your Ethereum identity for authenticated operations.

This command:
1. Generates or loads a cryptographic identity (DID) for the CLI
2. Opens your browser to the Renown authentication page
3. You authorize the CLI's DID to act on behalf of your Ethereum address
4. Stores the credentials locally in ~/.ph/auth.json
  
### options
#### Renown Url <br>
Renown server URL.<br><br>
**usage:** `--renown-url <str>`<br>
**env**: `PH_CONNECT_RENOWN_URL`<br>**default**: `https//www.renown.id`
#### Timeout <br>
Authentication timeout in seconds.<br><br>
**usage:** `--timeout <number>`<br>
**default**: `300`

### flags
#### Logout <br>
Sign out and clear stored credentials<br><br>
**usage:** `--logout`<br>

#### Status <br>
Show current authentication status<br><br>
**usage:** `--status`<br>

#### Show Did <br>
Show the CLI's DID and exit<br><br>
**usage:** `--show-did`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Install

The install command adds Powerhouse dependencies to your project. It handles installation
of packages, updates configuration files, and ensures proper setup of dependencies.

This command:
1. Installs specified Powerhouse dependencies using your package manager
2. Updates powerhouse.config.json to include the new dependencies
3. Supports various installation options and configurations
4. Works with npm, yarn, pnpm, and bun package managers
  
### arguments
#### Dependencies *[required]*<br>
Names of the dependencies to install<br><br>
**usage:** `[...dependencies]`<br>


### options
#### Package Manager <br>
Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.<br><br>
**usage:** `--package-manager, -p <value>`<br>


### flags
#### Npm <br>
Use 'npm' as package manager<br><br>
**usage:** `--npm`<br>

#### Pnpm <br>
Use 'pnpm' as package manager<br><br>
**usage:** `--pnpm`<br>

#### Yarn <br>
Use 'yarn' as package manager<br><br>
**usage:** `--yarn`<br>

#### Bun <br>
Use 'bun' as package manager<br><br>
**usage:** `--bun`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Uninstall

The uninstall command removes Powerhouse dependencies from your project. It handles the
removal of packages, updates configuration files, and ensures proper cleanup.

This command:
1. Uninstalls specified Powerhouse dependencies using your package manager
2. Updates powerhouse.config.json to remove the dependencies
3. Supports various uninstallation options and configurations
4. Works with npm, yarn, yarn@berry, pnpm, pnpm@6, bun, deno package managers

### arguments
#### Dependencies *[required]*<br>
Names of the dependencies to uninstall<br><br>
**usage:** `[...dependencies]`<br>


### options
#### Package Manager <br>
Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.<br><br>
**usage:** `--package-manager, -p <value>`<br>


### flags
#### Npm <br>
Use 'npm' as package manager<br><br>
**usage:** `--npm`<br>

#### Pnpm <br>
Use 'pnpm' as package manager<br><br>
**usage:** `--pnpm`<br>

#### Yarn <br>
Use 'yarn' as package manager<br><br>
**usage:** `--yarn`<br>

#### Bun <br>
Use 'bun' as package manager<br><br>
**usage:** `--bun`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>\n<!-- AUTO-GENERATED-CLI-COMMANDS-END -->
