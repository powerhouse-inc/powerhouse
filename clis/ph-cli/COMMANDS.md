# Powerhouse CLI Commands (6.2.2-dev.13)<br>
This document provides detailed information about the available commands in the Powerhouse CLI.<br><br>
The Powerhouse CLI (ph-cli) is a command-line interface tool that provides essential commands for managing Powerhouse projects. The tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.<br>
## Table of Contents
- [Generate](#generate)
- [All](#all)
- [Document Model](#document-model)
- [Editor](#editor)
- [App](#app)
- [Processor](#processor)
- [Subgraph](#subgraph)
- [Migration File](#migration-file)
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
The generate command creates code for Powerhouse modules. It helps you create new code from scratch, or to re-generate existing code in your project.
## All
Re-generate all modules in the current project
### flags
#### Extract <br>
Instead of generating code, write a spec for every module into specs/ (one-shot migration to documents-as-source-of-truth)<br><br>
**usage:** `--extract, -x`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Document Model
Generate a document model
### options
#### Document <br>
Path to a document model spec (.phd or .json) to generate from<br><br>
**usage:** `--document, -d <file>`<br>

#### Dir <br>
Name of the directory of an existing document model to re-generate<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### All <br>
Re-generate all existing document models in the current project<br><br>
**usage:** `--all, -a`<br>

#### Extract <br>
Write a powerhouse/document-model spec for each existing document model into specs/document-models/<br><br>
**usage:** `--extract, -x`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Editor
Generate a document editor
### options
#### Name <br>
The name of the document editor to generate<br><br>
**usage:** `--name, -n <str>`<br>

#### Document Type <br>
The document type for the new editor<br><br>
**usage:** `--document-type, -t <str>`<br>

#### Document <br>
Path to a powerhouse/document-editor spec file (.phd or .json) to drive codegen<br><br>
**usage:** `--document, -d <file>`<br>

#### Dir <br>
Name of the directory of an existing editor to re-generate<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### All <br>
Re-generate all existing editors in the current project<br><br>
**usage:** `--all, -a`<br>

#### Extract <br>
Write a powerhouse/document-editor spec for each existing editor into specs/editors/<br><br>
**usage:** `--extract, -x`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## App
Generate a drive app
### options
#### Name <br>
The name of the drive app to generate<br><br>
**usage:** `--name, -n <str>`<br>

#### Document Types <br>
The document types allowed by the new app<br><br>
**usage:** `--document-types <str>, -t=<str>`<br>

#### Document <br>
Path to a powerhouse/app spec file (.phd or .json) to drive codegen<br><br>
**usage:** `--document, -d <file>`<br>

#### Dir <br>
Name of the directory of an existing app to re-generate<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### Disable Drag And Drop <br>
Do not allow drag and drop in this drive app.<br><br>
**usage:** `--disable-drag-and-drop`<br>
**default**: `false`
#### All <br>
Re-generate all existing apps in the current project<br><br>
**usage:** `--all, -a`<br>

#### Extract <br>
Write a powerhouse/app spec for each existing drive app into specs/apps/<br><br>
**usage:** `--extract, -x`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Processor
Generate a processor
### options
#### Name <br>
The name of the processor to generate<br><br>
**usage:** `--name, -n <str>`<br>

#### Type <br>
The type of processor to generate<br><br>
**usage:** `--type <value>`<br>
**default**: `analytics`
#### Document Types <br>
The document types the processor will run on<br><br>
**usage:** `--document-types <str>, -t=<str>`<br>
**default**: ``
#### Apps <br>
Whether the processor will run in switchboard (nodejs), connect (browser), or both<br><br>
**usage:** `--apps <value>`<br>
**default**: `switchboard,connect`
#### Document <br>
Path to a powerhouse/processor spec file (.phd or .json) to drive codegen<br><br>
**usage:** `--document, -d <file>`<br>

#### Dir <br>
Name of the directory of an existing processor to re-generate<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### All <br>
Re-generate all existing processors in the current project<br><br>
**usage:** `--all, -a`<br>

#### Extract <br>
Write a powerhouse/processor spec for each existing processor into specs/processors/<br><br>
**usage:** `--extract, -x`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Subgraph
Generate a subgraph
### options
#### Name <br>
The name of the subgraph to generate<br><br>
**usage:** `--name, -n <str>`<br>

#### Document <br>
Path to a powerhouse/subgraph spec file (.phd or .json) to drive codegen<br><br>
**usage:** `--document, -d <file>`<br>

#### Dir <br>
Name of the directory of an existing subgraph to re-generate<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### All <br>
Re-generate all existing subgraphs in the current project<br><br>
**usage:** `--all, -a`<br>

#### Extract <br>
Write a powerhouse/subgraph spec for each existing subgraph into specs/subgraphs/<br><br>
**usage:** `--extract, -x`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Migration File
Generate a migration file
### options
#### Path *[required]*<br>
Path to the migration file<br><br>
**usage:** `--path, -p <str>`<br>

#### Schema File <br>
Path to the output file. Defaults to './schema.ts'<br><br>
**usage:** `--schema-file <str>`<br>


### flags
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
**default**: `3001`
#### Remote Drive <br>
URL of remote drive to connect to (skips switchboard initialization)<br><br>
**usage:** `--remote-drive <str>`<br>

#### Drives Public Base <br>
public base URL for the drive URLs advertised to Connect; each drive is exposed as <base>/d/<slug> instead of http://localhost:<switchboard-port>/d/<slug>. Use when the switchboard is reachable through a reverse proxy.<br><br>
**usage:** `--drives-public-base <str>`<br>

#### Db Path <br>
Database path or connection string. Use a `postgres://` URL for Postgres; otherwise treated as a PGlite filesystem path. Leave unset for in-memory PGlite.<br><br>
**usage:** `--db-path <str>`<br>

#### Renown Namespace <br>
Renown localStorage namespace; share it across Connects to share login.<br><br>
**usage:** `--renown-namespace <str>`<br>

#### Base <br>
Base path for the app<br><br>
**usage:** `--base <str>`<br>

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

#### Drive Preserve Strategy <br>
The preservation strategy to use on default drives<br><br>
**usage:** `--drive-preserve-strategy <value>`<br>
**default**: `preserve-by-url-and-detach`
#### Host <br>
Expose the server to the network. Pass an IP (e.g. 0.0.0.0) to bind to a specific address.<br><br>
**usage:** `--host <str>`<br>

#### Watch Timeout <br>
Amount of time to wait before a file is considered changed<br><br>
**usage:** `--watch-timeout <number>`<br>
**default**: `300`
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

#### Force <br>
Force dep pre-optimization regardless of whether deps have changed.<br><br>
**usage:** `--force`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

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
Powerhouse Connect commands. Use with `studio`, `build`, `preview`, or `config`. Defaults to `studio` if not specified.
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
#### Renown Namespace <br>
Renown localStorage namespace; share it across Connects to share login.<br><br>
**usage:** `--renown-namespace <str>`<br>

#### Base <br>
Base path for the app<br><br>
**usage:** `--base <str>`<br>

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

#### Drive Preserve Strategy <br>
The preservation strategy to use on default drives<br><br>
**usage:** `--drive-preserve-strategy <value>`<br>
**default**: `preserve-by-url-and-detach`
#### Host <br>
Expose the server to the network. Pass an IP (e.g. 0.0.0.0) to bind to a specific address.<br><br>
**usage:** `--host <str>`<br>

#### Watch Timeout <br>
Amount of time to wait before a file is considered changed<br><br>
**usage:** `--watch-timeout <number>`<br>
**default**: `300`

### flags
#### Ignore Local <br>
Do not load local packages from this project<br><br>
**usage:** `--ignore-local`<br>

#### Force <br>
Force dep pre-optimization regardless of whether deps have changed.<br><br>
**usage:** `--force`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

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
external packages included.

Runtime-config overrides (all combinable — last wins on collision):
  ph connect build                                    Build with the current source config.
  ph connect build <key> <value>                      Build with a positional override applied (e.g. ph connect build connect.renown.url https://renown.staging).
  ph connect build --<field> <value>                  Build with a per-field flag override (e.g. --renown-url https://renown.staging).
  ph connect build --json '{"…":"…"}'                Build with a bulk override.

Build has no read mode; passing only <key> without <value> errors out (use `ph connect config <key>` to read).

### options
#### Out Dir <br>
Output directory<br><br>
**usage:** `--outDir <str>`<br>
**default**: `.ph/connect-build/dist/`
#### Json <br>
Inline JSON override for the runtime connect.* block, e.g. '{"renown":{"url":"..."}}'. Validated against the runtime schema; deep-merged on top of env seeds and source powerhouse.config.json. Individual --flag values beat --json on collision.<br><br>
**usage:** `--json <str>`<br>

#### Renown Url <br>
Override connect.renown.url.<br><br>
**usage:** `--renown-url <str>`<br>

#### Renown Network Id <br>
Override connect.renown.networkId.<br><br>
**usage:** `--renown-network-id <str>`<br>

#### Renown Chain Id <br>
Override connect.renown.chainId.<br><br>
**usage:** `--renown-chain-id <number>`<br>

#### Renown Namespace <br>
Renown localStorage namespace; share it across Connects to share login.<br><br>
**usage:** `--renown-namespace <str>`<br>

#### Renown Switchboard Url <br>
Override connect.renown.switchboardUrl. When set, enables in-page Renown sign-in.<br><br>
**usage:** `--renown-switchboard-url <str>`<br>

#### Allow Add Drive <br>
Override connect.drives.allowAddDrive (top-level add-drive toggle).<br><br>
**usage:** `--allow-add-drive <value>`<br>

#### External Packages <br>
Override connect.packages.externalEnabled.<br><br>
**usage:** `--external-packages <value>`<br>

#### Remote Drives Enabled <br>
Override connect.drives.sections.remote.enabled (the unified cloud+public section).<br><br>
**usage:** `--remote-drives-enabled <value>`<br>

#### Remote Drives Allow Add <br>
Override connect.drives.sections.remote.allowAdd.<br><br>
**usage:** `--remote-drives-allow-add <value>`<br>

#### Remote Drives Allow Delete <br>
Override connect.drives.sections.remote.allowDelete.<br><br>
**usage:** `--remote-drives-allow-delete <value>`<br>

#### Local Drives Enabled <br>
Override connect.drives.sections.local.enabled.<br><br>
**usage:** `--local-drives-enabled <value>`<br>

#### Local Drives Allow Add <br>
Override connect.drives.sections.local.allowAdd.<br><br>
**usage:** `--local-drives-allow-add <value>`<br>

#### Local Drives Allow Delete <br>
Override connect.drives.sections.local.allowDelete.<br><br>
**usage:** `--local-drives-allow-delete <value>`<br>

#### Packages Registry <br>
Override the top-level packageRegistryUrl.<br><br>
**usage:** `--packages-registry <str>`<br>

#### App Name <br>
Override connect.branding.appName.<br><br>
**usage:** `--app-name <str>`<br>

#### Home Background <br>
Override connect.branding.homeBackground. URL or path to an image; pass an empty string ("") to reset to the bundled default.<br><br>
**usage:** `--home-background <str>`<br>

#### Sentry Dsn <br>
Override connect.sentry.dsn (Sentry DSN URL). Pass an empty string ("") to set null and disable Sentry.<br><br>
**usage:** `--sentry-dsn <str>`<br>

#### Sentry Env <br>
Override connect.sentry.env (Sentry environment label).<br><br>
**usage:** `--sentry-env <str>`<br>

#### Sentry Tracing Enabled <br>
Override connect.sentry.tracing (Sentry performance tracing).<br><br>
**usage:** `--sentry-tracing-enabled <value>`<br>

#### Favicon <br>
Path to a favicon file (e.g. .ico) to bundle in place of the default Connect icon. Emitted as icon.ico; resolved relative to the build cwd.<br><br>
**usage:** `--favicon <str>`<br>

#### Base <br>
Base path for the app<br><br>
**usage:** `--base <str>`<br>

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

#### Drive Preserve Strategy <br>
The preservation strategy to use on default drives<br><br>
**usage:** `--drive-preserve-strategy <value>`<br>
**default**: `preserve-by-url-and-detach`

### arguments
#### Key <br>
Dotted path inside the runtime config (e.g. connect.renown.url). Pair with <value> to set; pass alone to `ph connect config` to read.<br><br>
**usage:** `[key]`<br>

#### Value <br>
Value to set at <key>. Coerced against the runtime schema (string, bool, number, enum). Arrays and objects require --json instead.<br><br>
**usage:** `[value]`<br>


### flags
#### Dynamic Base <br>
Build one bundle that serves under any subpath; base resolved at serve time from a runtime global. Overrides --base.<br><br>
**usage:** `--dynamic-base`<br>

#### Ignore Local <br>
Do not load local packages from this project<br><br>
**usage:** `--ignore-local`<br>

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

#### Drive Preserve Strategy <br>
The preservation strategy to use on default drives<br><br>
**usage:** `--drive-preserve-strategy <value>`<br>
**default**: `preserve-by-url-and-detach`
#### Host <br>
Expose the server to the network. Pass an IP (e.g. 0.0.0.0) to bind to a specific address.<br><br>
**usage:** `--host <str>`<br>

#### Watch Timeout <br>
Amount of time to wait before a file is considered changed<br><br>
**usage:** `--watch-timeout <number>`<br>
**default**: `300`

### flags
#### Ignore Local <br>
Do not load local packages from this project<br><br>
**usage:** `--ignore-local`<br>

#### Force <br>
Force dep pre-optimization regardless of whether deps have changed.<br><br>
**usage:** `--force`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

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
  - Generate a keypair (stored in .ph/.keypair.json)
  - Optionally link your Ethereum address (stored in .ph/.renown.json)

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
### arguments
#### Version <br>
The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `latest`.<br><br>
**usage:** `[version]`<br>


### options
#### Version <br>
The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `latest`.<br><br>
**usage:** `--version, -v <str>`<br>
**default**: `latest`

### flags
#### Force <br>
Run migrate from the bundled codegen even if the target version cannot be resolved from the npm registry or differs from the installed ph-cli version.<br><br>
**usage:** `--force, -f`<br>

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

#### Reset <br>
Wipe the local PGlite switchboard storage after confirmation, then exit<br><br>
**usage:** `--reset`<br>

#### Yes <br>
Skip the interactive confirmation prompt for --reset (required for non-interactive use)<br><br>
**usage:** `--yes, -y`<br>

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
4. Stores the credentials locally in .ph/.renown.json
  
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

The install command adds Powerhouse dependencies to your project.

By default it only registers the package in powerhouse.config.json with
provider "registry" — Connect will load it from the registry CDN at runtime.

With --local, the package is also installed into node_modules and marked
as provider "local" — it will be bundled into ph connect build so the
preview works without the registry being reachable.

Resolution order for the registry URL:
  --registry flag > PH_REGISTRY_URL env > powerhouse.config.json > default
  
### arguments
#### Dependencies *[required]*<br>
Names of the dependencies to install<br><br>
**usage:** `[...dependencies]`<br>


### options
#### Registry <br>
Registry URL to install from (overrides config and environment)<br><br>
**usage:** `--registry <str>`<br>

#### Allow Build <br>
A list of package names that are allowed to run postinstall scripts during installation.<br><br>
**usage:** `--allow-build <str>`<br>

#### Package Manager <br>
Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager.<br><br>
**usage:** `--package-manager, -p <value>`<br>


### flags
#### Local <br>
Also install packages into node_modules (marks them as provider: "local" so they get bundled into ph connect build)<br><br>
**usage:** `--local`<br>

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
**usage:** `--help, -h`<br>



