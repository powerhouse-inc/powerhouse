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

<!-- AUTO-GENERATED-CLI-COMMANDS-START -->
<!-- This content is automatically generated. Do not edit directly. -->
## Quick Reference

| Command | Description | Example |
|---------|-------------|---------|
| `ph init` | Initialize a new project | `ph init my-project --pnpm` |
| `ph use` | Switch to a release version | `ph use staging` |
| `ph update` | Update dependencies to latest | `ph update` |
| `ph setup-globals` | Initialize global project | `ph setup-globals my-globals` |
| `ph use-local` | Use local monorepo dependencies | `ph use-local ../powerhouse` |

---

### ph-cmd Commands

- [Init](#init)
- [Use](#use)
- [Update](#update)
- [Setup Globals](#setup-globals)
- [Use Local](#use-local)


## Init
Initialize a new project



---

## Parameters

### Arguments
**Name** - The name of your project. A new directory will be created in your current directory with this name. - Usage: `[name]`




### Options
**Name** - The name of your project. A new directory will be created in your current directory with this name. - Usage: `--name, -n <str>`

**Package Manager** - Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager. - Usage: `--package-manager, -p <value>`

**Tag** - Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev". - Usage: `--tag, -t <value>`

**Version** - Specify the exact semver release version to use for your project. - Usage: `--version, -v <str>`

**Remote Drive** - Remote drive identifier. - Usage: `--remote-drive, -r <str>`




### Flags
**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Dev** - Use the `dev` release tag. - Usage: `--dev, -d`

**Staging** - Use the `staging` release tag. - Usage: `--staging, -s`

**Help** - show help - Usage: `--help, -h`


## Use
Specify the release version of Powerhouse dependencies to use.



---

## Parameters

### Arguments
**Tag** - Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev". - Usage: `[tag]`




### Options
**Tag** - Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev". - Usage: `--tag, -t <value>`

**Version** - Specify the exact semver release version to use for your project. - Usage: `--version, -v <str>`




### Flags
**Skip Install** - Skip running `install` with your package manager - Usage: `--skip-install, -s`

**Help** - show help - Usage: `--help, -h`


## Update
Update your powerhouse dependencies to their latest tagged version



### Flags
**Skip Install** - Skip running `install` with your package manager - Usage: `--skip-install, -s`

**Help** - show help - Usage: `--help, -h`


## Setup Globals
Initialize a new global project



---

## Parameters

### Arguments
**Name** - The name of your project. A new directory will be created in your current directory with this name. - Usage: `[name]`




### Options
**Name** - The name of your project. A new directory will be created in your current directory with this name. - Usage: `--name, -n <str>`

**Package Manager** - Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager. - Usage: `--package-manager, -p <value>`

**Tag** - Specify the release tag to use for your project. Can be one of: "latest", "staging", or "dev". - Usage: `--tag, -t <value>`

**Version** - Specify the exact semver release version to use for your project. - Usage: `--version, -v <str>`

**Remote Drive** - Remote drive identifier. - Usage: `--remote-drive, -r <str>`




### Flags
**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Dev** - Use the `dev` release tag. - Usage: `--dev, -d`

**Staging** - Use the `staging` release tag. - Usage: `--staging, -s`

**Help** - show help - Usage: `--help, -h`


## Use Local
Use your local `powerhouse` monorepo dependencies the current project.



---

## Parameters

### Arguments
**Monorepo Path** - Path to your local powerhouse monorepo relative to this project - Usage: `[monorepo path]`




### Options
**Path** - Path to your local powerhouse monorepo relative to this project - Usage: `--path, -p <str>`




### Flags
**Skip Install** - Skip running `install` with `pnpm` - Usage: `--skip-install, -s`

**Help** - show help - Usage: `--help, -h`

### ph-cli Commands

- [Generate](#generate)
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


## Generate

The generate command creates code from document models. It helps you build editors, 
processors, and other components based on your document model files.

**What it does:**
- 1. Reads document model definitions
- 2. Generates code for specified components (editors, processors, etc.)
- 3. Supports customization of output and generation options
- 4. Can watch files for changes and regenerate code automatically




---

## Parameters

### Arguments
**Document Model File Path** - Path to the document model file. - Usage: `[document model file path]`




### Options
**File** - Path to the document model file. - Usage: `--file <str>`

**Editor** - Editor name. - Usage: `--editor <str>`

**Editor Id** - Editor ID - Usage: `--editor-id <str>`

**Editor Dir Name** - Use a different directory name for the generated editor. Default is the editor name in kebab case. - Usage: `--editor-dir-name <str>`

**Document Type** - Document type for the generated document editor. - Usage: `--document-type <str>`

**Document Types** - [DEPRECATED] Comma separated list of document types for the generated document editor. [WARNING] Generated editor code is not set up to handle multiple document types. - Usage: `--document-types <str>`

**Drive Editor** - Drive editor name. - Usage: `--drive-editor <str>`

**App Id** - Drive editor ID. - Usage: `--app-id <str>`

**Drive Editor Dir Name** - Use a different directory name for the generated drive editor. Default is the drive editor name in kebab case. - Usage: `--drive-editor-dir-name <str>`

**Processor** - Processor name. - Usage: `--processor <str>`

**Processor Type** - Whether to generate an analytics processor or a relational DB processor. Default is analytics. - Usage: `--processor-type <value>`

**Default:** `analytics`
**Subgraph** - Subgraph name. - Usage: `--subgraph <str>`

**Import Script** - Import script name. - Usage: `--import-script <str>`

**Allowed Document Types** - Supported document types for a drive editor. - Usage: `--allowed-document-types <str>`

**Migration File** - Path to the migration file. - Usage: `--migration-file <str>`

**Schema File** - Path to the output file. Defaults to './schema.ts' - Usage: `--schema-file <str>`




### Flags
**Disable Drag And Drop** - Disable drag and drop in the generated drive editor. - Usage: `--disable-drag-and-drop`

**Force** - Overwrite operation reducers. - Usage: `--force, -f`

**Logs** - Show additional logging information. - Usage: `--logs`

**Watch** - Watch the generated code. - Usage: `--watch, -w`

**Skip Format** - Skip formatting the generated code. - Usage: `--skip-format, -sf`

**Use Hygen** - Use legacy hygen codegen - Usage: `--use-hygen`

**Default:** `false`
**Use Versioning** - Allow upgrading document models with versioning. - Usage: `--use-versioning`

**Default:** `false`
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Vetra

The vetra command sets up a Vetra development environment for working with Vetra projects.
It starts a Vetra Switchboard and optionally Connect Studio, enabling document collaboration 
and real-time processing with a "Vetra" drive or connection to remote drives.

**What it does:**
- 1. Starts a Vetra Switchboard with a "Vetra" drive for document storage
- 2. Optionally connects to remote drives instead of creating a local drive
- 3. Starts Connect Studio pointing to the Switchboard for user interaction (unless disabled)
- 4. Enables real-time updates, collaboration, and code generation



### Options
**Switchboard Port** - port to use for the Vetra Switchboard - Usage: `--switchboard-port <number>`

**Connect Port** - port to use for the Vetra Connect - Usage: `--connect-port <number>`

**Default:** `3001`
**Remote Drive** - URL of remote drive to connect to (skips switchboard initialization) - Usage: `--remote-drive <str>`

**Base** - Base path for the app - Usage: `--base <str>`

**Environment:** `PH_CONNECT_BASE_PATH`
**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Local Package** - Path to local package to load during development - Usage: `--local-package <str>`

**Environment:** `PH_LOCAL_PACKAGE`
**Default Drives Url** - The default drives url to use in connect - Usage: `--default-drives-url <str>`

**Environment:** `PH_CONNECT_DEFAULT_DRIVES_URL`
**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Environment:** `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`
**Default:** `preserve-by-url-and-detach`
**Watch Timeout** - Amount of time to wait before a file is considered changed - Usage: `--watch-timeout <number>`

**Environment:** `PH_WATCH_TIMEOUT`
**Default:** `300`
**Https Key File** - path to the ssl key file - Usage: `--https-key-file <str>`

**Https Cert File** - path to the ssl cert file - Usage: `--https-cert-file <str>`

**Remote Drives** - Specify remote drive URLs to use - Usage: `--remote-drives <str>`




### Flags
**Watch** - Enable dynamic loading for document-models and editors in connect-studio and switchboard - Usage: `--watch, -w`

**Default:** `false`
**Logs** - Show additional logs - Usage: `--logs`

**Default:** `false`
**Disable Connect** - Skip Connect initialization (only start switchboard and reactor) - Usage: `--disable-connect`

**Default:** `false`
**Interactive** - Enable interactive mode for code generation (requires user confirmation before generating code) - Usage: `--interactive`

**Default:** `false`
**Ignore Local** - Do not load local packages from this project - Usage: `--ignore-local`

**Environment:** `PH_DISABLE_LOCAL_PACKAGE`
**Force** - Force dep pre-optimization regardless of whether deps have changed. - Usage: `--force`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Host** - Expose the server to the network - Usage: `--host`

**Open** - Open browser on startup - Usage: `--open`

**Cors** - Enable CORS - Usage: `--cors`

**Strict Port** - Exit if specified port is already in use - Usage: `--strictPort`

**Print Urls** - Print server urls - Usage: `--print-urls`

**Default:** `true`
**Bind Cli Shortcuts** - Bind CLI shortcuts - Usage: `--bind-cli-shortcuts`

**Default:** `true`
**Https** - Use https - Usage: `--https`

**Dev** - enable development mode to load local packages - Usage: `--dev`

**Help** - show help - Usage: `--help, -h`


## Connect
Powerhouse Connect commands. Use with `studio`, `build` or `preview`. Defaults to `studio` if not specified.

## Connect Studio
The studio command starts the Connect Studio, a development environment for building
and testing Powerhouse applications. It provides a visual interface for working with
your project.

**What it does:**
- 1. Starts a local Connect Studio server
- 2. Provides a web interface for development
- 3. Allows you to interact with your project components
- 4. Supports various configuration options for customization




### Options
**Port** - Port to run the dev server on. - Usage: `--port <number>`

**Default:** `3000`
**Base** - Base path for the app - Usage: `--base <str>`

**Environment:** `PH_CONNECT_BASE_PATH`
**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Local Package** - Path to local package to load during development - Usage: `--local-package <str>`

**Environment:** `PH_LOCAL_PACKAGE`
**Default Drives Url** - The default drives url to use in connect - Usage: `--default-drives-url <str>`

**Environment:** `PH_CONNECT_DEFAULT_DRIVES_URL`
**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Environment:** `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`
**Default:** `preserve-by-url-and-detach`
**Watch Timeout** - Amount of time to wait before a file is considered changed - Usage: `--watch-timeout <number>`

**Environment:** `PH_WATCH_TIMEOUT`
**Default:** `300`




### Flags
**Ignore Local** - Do not load local packages from this project - Usage: `--ignore-local`

**Environment:** `PH_DISABLE_LOCAL_PACKAGE`
**Force** - Force dep pre-optimization regardless of whether deps have changed. - Usage: `--force`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Host** - Expose the server to the network - Usage: `--host`

**Open** - Open browser on startup - Usage: `--open`

**Cors** - Enable CORS - Usage: `--cors`

**Strict Port** - Exit if specified port is already in use - Usage: `--strictPort`

**Print Urls** - Print server urls - Usage: `--print-urls`

**Default:** `true`
**Bind Cli Shortcuts** - Bind CLI shortcuts - Usage: `--bind-cli-shortcuts`

**Default:** `true`
**Help** - show help - Usage: `--help, -h`


## Connect Build
The Connect build command creates a production build with the project's local and
external packages included




### Options
**Out Dir** - Output directory - Usage: `--outDir <str>`

**Default:** `.ph/connect-build/dist/`
**Base** - Base path for the app - Usage: `--base <str>`

**Environment:** `PH_CONNECT_BASE_PATH`
**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Local Package** - Path to local package to load during development - Usage: `--local-package <str>`

**Environment:** `PH_LOCAL_PACKAGE`
**Default Drives Url** - The default drives url to use in connect - Usage: `--default-drives-url <str>`

**Environment:** `PH_CONNECT_DEFAULT_DRIVES_URL`
**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Environment:** `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`
**Default:** `preserve-by-url-and-detach`




### Flags
**Ignore Local** - Do not load local packages from this project - Usage: `--ignore-local`

**Environment:** `PH_DISABLE_LOCAL_PACKAGE`
**Force** - Force dep pre-optimization regardless of whether deps have changed. - Usage: `--force`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Connect Preview
The Connect preview command previews a built Connect project.
NOTE: You must run `ph connect build` first




### Options
**Port** - Port to run the preview server on. - Usage: `--port <number>`

**Default:** `4173`
**Out Dir** - Output directory - Usage: `--outDir <str>`

**Default:** `.ph/connect-build/dist/`
**Base** - Base path for the app - Usage: `--base <str>`

**Environment:** `PH_CONNECT_BASE_PATH`
**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Local Package** - Path to local package to load during development - Usage: `--local-package <str>`

**Environment:** `PH_LOCAL_PACKAGE`
**Default Drives Url** - The default drives url to use in connect - Usage: `--default-drives-url <str>`

**Environment:** `PH_CONNECT_DEFAULT_DRIVES_URL`
**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Environment:** `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`
**Default:** `preserve-by-url-and-detach`
**Watch Timeout** - Amount of time to wait before a file is considered changed - Usage: `--watch-timeout <number>`

**Environment:** `PH_WATCH_TIMEOUT`
**Default:** `300`




### Flags
**Ignore Local** - Do not load local packages from this project - Usage: `--ignore-local`

**Environment:** `PH_DISABLE_LOCAL_PACKAGE`
**Force** - Force dep pre-optimization regardless of whether deps have changed. - Usage: `--force`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Host** - Expose the server to the network - Usage: `--host`

**Open** - Open browser on startup - Usage: `--open`

**Cors** - Enable CORS - Usage: `--cors`

**Strict Port** - Exit if specified port is already in use - Usage: `--strictPort`

**Print Urls** - Print server urls - Usage: `--print-urls`

**Default:** `true`
**Bind Cli Shortcuts** - Bind CLI shortcuts - Usage: `--bind-cli-shortcuts`

**Default:** `true`
**Help** - show help - Usage: `--help, -h`


## Access Token

The access-token command generates a bearer token for API authentication. This token
can be used to authenticate requests to Powerhouse APIs like reactor-api (Switchboard).

**What it does:**
- 1. Uses your CLI's cryptographic identity (DID) to sign a verifiable credential
- 2. Creates a JWT bearer token with configurable expiration
- 3. Outputs the token to stdout (info to stderr) for easy piping

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
    -d '\{"query": "\{ drives \{ id name \} \}"\}'

  Export as environment variable
  export PH_ACCESS_TOKEN=$(ph access-token)

Notes:
  - Tokens are self-signed using your CLI's private key
  - No network request is made; tokens are generated locally
  - The recipient API must trust your CLI's DID to accept the token
  - For reactor-api, ensure AUTH_ENABLED=true to require authentication




### Options
**Expiry** - Token expiry duration. Supports: "7d" (days), "24h" (hours), "3600" or "3600s" (seconds) - Usage: `--expiry <str>`

**Default:** `7d`
**Audience** - Target audience URL for the token - Usage: `--audience <str>`




### Flags
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Inspect

The inspect command examines and provides detailed information about a Powerhouse package.
It helps you understand the structure, dependencies, and configuration of packages in
your project.

**What it does:**
- 1. Analyzes the specified package
- 2. Retrieves detailed information about its structure and configuration
- 3. Displays package metadata, dependencies, and other relevant information
- 4. Helps troubleshoot package-related issues



---

## Parameters

### Arguments
**Package Name *[required]*** - The name of the package to inspect - Usage: `<package-name>`




### Flags
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## List

The list command displays information about installed Powerhouse packages in your project.
It reads the powerhouse.config.json file and shows the packages that are currently installed.

**What it does:**
- 1. Examines your project configuration
- 2. Lists all installed Powerhouse packages
- 3. Provides a clear overview of your project's dependencies
- 4. Helps you manage and track your Powerhouse components




### Flags
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Migrate
Run migrations



### Flags
**Use Hygen** - Use legacy hygen codegen - Usage: `--use-hygen`

**Default:** `false`
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Switchboard

The switchboard command starts a local Switchboard instance, which acts as the document
processing engine for Powerhouse projects. It provides the infrastructure for document
models, processors, and real-time updates.

**What it does:**
- 1. Starts a local switchboard server
- 2. Loads document models and processors
- 3. Provides an API for document operations
- 4. Enables real-time document processing
- 5. Can authenticate with remote services using your identity from 'ph login'



### Flags
**Https** - Use https - Usage: `--https`

**Dev** - enable development mode to load local packages - Usage: `--dev`

**Ignore Local** - Do not load local packages from this project - Usage: `--ignore-local`

**Environment:** `PH_DISABLE_LOCAL_PACKAGE`
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Use Identity** - enable identity using keypair from ph login (uses ~/.ph/keypair.json) - Usage: `--use-identity`

**Require Identity** - require existing keypair, fail if not found (implies --use-identity) - Usage: `--require-identity`

**Migrate** - Run database migrations and exit - Usage: `--migrate`

**Migrate Status** - Show migration status and exit - Usage: `--migrate-status`

**Mcp** - enable Mcp route at /mcp - Usage: `--mcp`

**Default:** `true`
**Use Vetra Drive** - Use a Vetra drive - Usage: `--use-vetra-drive`

**Default:** `false`
**Help** - show help - Usage: `--help, -h`




### Options
**Https Key File** - path to the ssl key file - Usage: `--https-key-file <str>`

**Https Cert File** - path to the ssl cert file - Usage: `--https-cert-file <str>`

**Remote Drives** - Specify remote drive URLs to use - Usage: `--remote-drives <str>`

**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Port** - Port to host the api - Usage: `--port <number>`

**Default:** `4001`
**Base Path** - base path for the API endpoints (sets the BASE_PATH environment variable) - Usage: `--base-path <str>`

**Keypair Path** - path to custom keypair file for identity - Usage: `--keypair-path <str>`

**Vetra Drive Id** - Specify a Vetra drive ID - Usage: `--vetra-drive-id <str>`

**Default:** `vetra`
**Db Path** - path to the database - Usage: `--db-path <str>`


## Login

The login command authenticates you with Renown using your Ethereum wallet. This enables
the CLI to act on behalf of your Ethereum identity for authenticated operations.

**What it does:**
- 1. Generates or loads a cryptographic identity (DID) for the CLI
- 2. Opens your browser to the Renown authentication page
- 3. You authorize the CLI's DID to act on behalf of your Ethereum address
- 4. Stores the credentials locally in ~/.ph/auth.json
  



### Options
**Renown Url** - Renown server URL. - Usage: `--renown-url <str>`

**Environment:** `PH_CONNECT_RENOWN_URL`
**Default:** `https//www.renown.id`
**Timeout** - Authentication timeout in seconds. - Usage: `--timeout <number>`

**Default:** `300`




### Flags
**Logout** - Sign out and clear stored credentials - Usage: `--logout`

**Status** - Show current authentication status - Usage: `--status`

**Show Did** - Show the CLI's DID and exit - Usage: `--show-did`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Install

The install command adds Powerhouse dependencies to your project. It handles installation
of packages, updates configuration files, and ensures proper setup of dependencies.

**What it does:**
- 1. Installs specified Powerhouse dependencies using your package manager
- 2. Updates powerhouse.config.json to include the new dependencies
- 3. Supports various installation options and configurations
- 4. Works with npm, yarn, pnpm, and bun package managers
  



---

## Parameters

### Arguments
**Dependencies *[required]*** - Names of the dependencies to install - Usage: `[...dependencies]`




### Options
**Package Manager** - Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager. - Usage: `--package-manager, -p <value>`




### Flags
**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Uninstall

The uninstall command removes Powerhouse dependencies from your project. It handles the
removal of packages, updates configuration files, and ensures proper cleanup.

**What it does:**
- 1. Uninstalls specified Powerhouse dependencies using your package manager
- 2. Updates powerhouse.config.json to remove the dependencies
- 3. Supports various uninstallation options and configurations
- 4. Works with npm, yarn, yarn@berry, pnpm, pnpm@6, bun, deno package managers




---

## Parameters

### Arguments
**Dependencies *[required]*** - Names of the dependencies to uninstall - Usage: `[...dependencies]`




### Options
**Package Manager** - Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager. - Usage: `--package-manager, -p <value>`




### Flags
**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`
<!-- AUTO-GENERATED-CLI-COMMANDS-END -->
