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

{/_ AUTO-GENERATED-CLI-COMMANDS-START _/}
{/_ This content is automatically generated. Do not edit directly. _/}

## Quick Reference

| Command            | Description                     | Example                       |
| ------------------ | ------------------------------- | ----------------------------- |
| `ph init`          | Initialize a new project        | `ph init my-project --pnpm`   |
| `ph use`           | Switch to a release version     | `ph use staging`              |
| `ph update`        | Update dependencies to latest   | `ph update`                   |
| `ph setup-globals` | Initialize global project       | `ph setup-globals my-globals` |
| `ph use-local`     | Use local monorepo dependencies | `ph use-local ../powerhouse`  |

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

**Clone** - Path to an existing scaffolded project to clone instead of resolving deps from scratch. Install runs offline from the cloned project's pnpm-lock.yaml (requires --pnpm; --version/--tag are ignored). - Usage: `--clone <str>`

### Flags

**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Dev** - Use the `dev` release tag. - Usage: `--dev, -d`

**Staging** - Use the `staging` release tag. - Usage: `--staging, -s`

**Debug** - Log arguments passed to this command - Usage: `--debug`

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

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`

## Update

Update your powerhouse dependencies to their latest tagged version

### Flags

**Skip Install** - Skip running `install` with your package manager - Usage: `--skip-install, -s`

**Debug** - Log arguments passed to this command - Usage: `--debug`

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

**Clone** - Path to an existing scaffolded project to clone instead of resolving deps from scratch. Install runs offline from the cloned project's pnpm-lock.yaml (requires --pnpm; --version/--tag are ignored). - Usage: `--clone <str>`

### Flags

**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Dev** - Use the `dev` release tag. - Usage: `--dev, -d`

**Staging** - Use the `staging` release tag. - Usage: `--staging, -s`

**Debug** - Log arguments passed to this command - Usage: `--debug`

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

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`

### ph-cli Commands

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

## Generate

The generate command creates code for Powerhouse modules. It helps you create new code from scratch, or to re-generate existing code in your project.

## All

Re-generate all modules in the current project

### Flags

**Extract** - Instead of generating code, write a spec for every module into specs/ (one-shot migration to documents-as-source-of-truth) - Usage: `--extract, -x`

**Help** - show help - Usage: `--help, -h`

## Document Model

Generate a document model

### Options

**Document** - Path to a document model spec (.phd or .json) to generate from - Usage: `--document, -d <file>`

**Dir** - Name of the directory of an existing document model to re-generate - Usage: `--dir <dir>`

### Flags

**All** - Re-generate all existing document models in the current project - Usage: `--all, -a`

**Extract** - Write a powerhouse/document-model spec for each existing document model into specs/document-models/ - Usage: `--extract, -x`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`

## Editor

Generate a document editor

### Options

**Name** - The name of the document editor to generate - Usage: `--name, -n <str>`

**Document Type** - The document type for the new editor - Usage: `--document-type, -t <str>`

**Document** - Path to a powerhouse/document-editor spec file (.phd or .json) to drive codegen - Usage: `--document, -d <file>`

**Dir** - Name of the directory of an existing editor to re-generate - Usage: `--dir <dir>`

### Flags

**All** - Re-generate all existing editors in the current project - Usage: `--all, -a`

**Extract** - Write a powerhouse/document-editor spec for each existing editor into specs/editors/ - Usage: `--extract, -x`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`

## App

Generate a drive app

### Options

**Name** - The name of the drive app to generate - Usage: `--name, -n <str>`

**Document Types** - The document types allowed by the new app - Usage: `--document-types <str>, -t=<str>`

**Document** - Path to a powerhouse/app spec file (.phd or .json) to drive codegen - Usage: `--document, -d <file>`

**Dir** - Name of the directory of an existing app to re-generate - Usage: `--dir <dir>`

### Flags

**Disable Drag And Drop** - Do not allow drag and drop in this drive app. - Usage: `--disable-drag-and-drop`

**Default:** `false`
**All** - Re-generate all existing apps in the current project - Usage: `--all, -a`

**Extract** - Write a powerhouse/app spec for each existing drive app into specs/apps/ - Usage: `--extract, -x`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`

## Processor

Generate a processor

### Options

**Name** - The name of the processor to generate - Usage: `--name, -n <str>`

**Type** - The type of processor to generate - Usage: `--type <value>`

**Default:** `analytics`
**Document Types** - The document types the processor will run on - Usage: `--document-types <str>, -t=<str>`

**Default:** ``**Apps** - Whether the processor will run in switchboard (nodejs), connect (browser), or both - Usage:`--apps <value>`

**Default:** `switchboard,connect`
**Document** - Path to a powerhouse/processor spec file (.phd or .json) to drive codegen - Usage: `--document, -d <file>`

**Dir** - Name of the directory of an existing processor to re-generate - Usage: `--dir <dir>`

### Flags

**All** - Re-generate all existing processors in the current project - Usage: `--all, -a`

**Extract** - Write a powerhouse/processor spec for each existing processor into specs/processors/ - Usage: `--extract, -x`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`

## Subgraph

Generate a subgraph

### Options

**Name** - The name of the subgraph to generate - Usage: `--name, -n <str>`

**Document** - Path to a powerhouse/subgraph spec file (.phd or .json) to drive codegen - Usage: `--document, -d <file>`

**Dir** - Name of the directory of an existing subgraph to re-generate - Usage: `--dir <dir>`

### Flags

**All** - Re-generate all existing subgraphs in the current project - Usage: `--all, -a`

**Extract** - Write a powerhouse/subgraph spec for each existing subgraph into specs/subgraphs/ - Usage: `--extract, -x`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`

## Migration File

Generate a migration file

### Options

**Path _[required]_** - Path to the migration file - Usage: `--path, -p <str>`

**Schema File** - Path to the output file. Defaults to './schema.ts' - Usage: `--schema-file <str>`

### Flags

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

**Drives Public Base** - public base URL for the drive URLs advertised to Connect; each drive is exposed as &lt;base&gt;/d/&lt;slug&gt; instead of `http://localhost:<switchboard-port>/d/<slug>`. Use when the switchboard is reachable through a reverse proxy. - Usage: `--drives-public-base <str>`

**Db Path** - Database path or connection string. Use a `postgres://` URL for Postgres; otherwise treated as a PGlite filesystem path. Leave unset for in-memory PGlite. - Usage: `--db-path <str>`

**Base** - Base path for the app - Usage: `--base <str>`

**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Local Package** - Path to local package to load during development - Usage: `--local-package <str>`

**Environment:** `PH_LOCAL_PACKAGE`
**Default Drives Url** - The default drives url to use in connect - Usage: `--default-drives-url <str>`

**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Default:** `preserve-by-url-and-detach`
**Host** - Expose the server to the network. Pass an IP (e.g. 0.0.0.0) to bind to a specific address. - Usage: `--host <str>`

**Watch Timeout** - Amount of time to wait before a file is considered changed - Usage: `--watch-timeout <number>`

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

**Force** - Force dep pre-optimization regardless of whether deps have changed. - Usage: `--force`

**Debug** - Log arguments passed to this command - Usage: `--debug`

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

Powerhouse Connect commands. Use with `studio`, `build`, `preview`, or `config`. Defaults to `studio` if not specified.

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

**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Local Package** - Path to local package to load during development - Usage: `--local-package <str>`

**Environment:** `PH_LOCAL_PACKAGE`
**Default Drives Url** - The default drives url to use in connect - Usage: `--default-drives-url <str>`

**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Default:** `preserve-by-url-and-detach`
**Host** - Expose the server to the network. Pass an IP (e.g. 0.0.0.0) to bind to a specific address. - Usage: `--host <str>`

**Watch Timeout** - Amount of time to wait before a file is considered changed - Usage: `--watch-timeout <number>`

**Default:** `300`

### Flags

**Ignore Local** - Do not load local packages from this project - Usage: `--ignore-local`

**Force** - Force dep pre-optimization regardless of whether deps have changed. - Usage: `--force`

**Debug** - Log arguments passed to this command - Usage: `--debug`

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
external packages included.

Runtime-config overrides (all combinable — last wins on collision):
ph connect build Build with the current source config.
ph connect build &lt;key&gt; &lt;value&gt; Build with a positional override applied (e.g. ph connect build connect.renown.url `https://renown.staging`).
ph connect build --&lt;field&gt; &lt;value&gt; Build with a per-field flag override (e.g. --renown-url `https://renown.staging`).
ph connect build --json '\{"…":"…"\}' Build with a bulk override.

Build has no read mode; passing only &lt;key&gt; without &lt;value&gt; errors out (use `ph connect config <key>` to read).

### Options

**Out Dir** - Output directory - Usage: `--outDir <str>`

**Default:** `.ph/connect-build/dist/`
**Json** - Inline JSON override for the runtime connect.\* block, e.g. '\{"renown":\{"url":"..."\}\}'. Validated against the runtime schema; deep-merged on top of env seeds and source powerhouse.config.json. Individual --flag values beat --json on collision. - Usage: `--json <str>`

**Renown Url** - Override connect.renown.url. - Usage: `--renown-url <str>`

**Renown Network Id** - Override connect.renown.networkId. - Usage: `--renown-network-id <str>`

**Renown Chain Id** - Override connect.renown.chainId. - Usage: `--renown-chain-id <number>`

**Allow Add Drive** - Override connect.drives.allowAddDrive (top-level add-drive toggle). - Usage: `--allow-add-drive <value>`

**External Packages** - Override connect.packages.externalEnabled. - Usage: `--external-packages <value>`

**Remote Drives Enabled** - Override connect.drives.sections.remote.enabled (the unified cloud+public section). - Usage: `--remote-drives-enabled <value>`

**Remote Drives Allow Add** - Override connect.drives.sections.remote.allowAdd. - Usage: `--remote-drives-allow-add <value>`

**Remote Drives Allow Delete** - Override connect.drives.sections.remote.allowDelete. - Usage: `--remote-drives-allow-delete <value>`

**Local Drives Enabled** - Override connect.drives.sections.local.enabled. - Usage: `--local-drives-enabled <value>`

**Local Drives Allow Add** - Override connect.drives.sections.local.allowAdd. - Usage: `--local-drives-allow-add <value>`

**Local Drives Allow Delete** - Override connect.drives.sections.local.allowDelete. - Usage: `--local-drives-allow-delete <value>`

**Packages Registry** - Override the top-level packageRegistryUrl. - Usage: `--packages-registry <str>`

**App Name** - Override connect.branding.appName. - Usage: `--app-name <str>`

**Home Background** - Override connect.branding.homeBackground. URL or path to an image; pass an empty string ("") to reset to the bundled default. - Usage: `--home-background <str>`

**Sentry Dsn** - Override connect.sentry.dsn (Sentry DSN URL). Pass an empty string ("") to set null and disable Sentry. - Usage: `--sentry-dsn <str>`

**Sentry Env** - Override connect.sentry.env (Sentry environment label). - Usage: `--sentry-env <str>`

**Sentry Tracing Enabled** - Override connect.sentry.tracing (Sentry performance tracing). - Usage: `--sentry-tracing-enabled <value>`

**Base** - Base path for the app - Usage: `--base <str>`

**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Local Package** - Path to local package to load during development - Usage: `--local-package <str>`

**Environment:** `PH_LOCAL_PACKAGE`
**Default Drives Url** - The default drives url to use in connect - Usage: `--default-drives-url <str>`

**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Default:** `preserve-by-url-and-detach`

---

## Parameters

### Arguments

**Key** - Dotted path inside the runtime config (e.g. connect.renown.url). Pair with &lt;value&gt; to set; pass alone to `ph connect config` to read. - Usage: `[key]`

**Value** - Value to set at &lt;key&gt;. Coerced against the runtime schema (string, bool, number, enum). Arrays and objects require --json instead. - Usage: `[value]`

### Flags

**Dynamic Base** - Build one bundle that serves under any subpath; base resolved at serve time from a runtime global. Overrides --base. - Usage: `--dynamic-base`

**Ignore Local** - Do not load local packages from this project - Usage: `--ignore-local`

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

**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Packages** - Comma-separated list of package names to load - Usage: `--packages <str>`

**Environment:** `PH_PACKAGES`
**Local Package** - Path to local package to load during development - Usage: `--local-package <str>`

**Environment:** `PH_LOCAL_PACKAGE`
**Default Drives Url** - The default drives url to use in connect - Usage: `--default-drives-url <str>`

**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Default:** `preserve-by-url-and-detach`
**Host** - Expose the server to the network. Pass an IP (e.g. 0.0.0.0) to bind to a specific address. - Usage: `--host <str>`

**Watch Timeout** - Amount of time to wait before a file is considered changed - Usage: `--watch-timeout <number>`

**Default:** `300`

### Flags

**Ignore Local** - Do not load local packages from this project - Usage: `--ignore-local`

**Force** - Force dep pre-optimization regardless of whether deps have changed. - Usage: `--force`

**Debug** - Log arguments passed to this command - Usage: `--debug`

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
curl -H "Authorization: Bearer $TOKEN" `http://localhost:4001/graphql`

Usage with APIs:
Generate token and use with curl
TOKEN=$(ph access-token --expiry 1d)
curl -X POST `http://localhost:4001/graphql` \
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

**Package Name _[required]_** - The name of the package to inspect - Usage: `<package-name>`

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

---

## Parameters

### Arguments

**Version** - The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `latest`. - Usage: `[version]`

### Options

**Version** - The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `latest`. - Usage: `--version, -v <str>`

**Default:** `latest`

### Flags

**Force** - Run migrate from the bundled codegen even if the target version cannot be resolved from the npm registry or differs from the installed ph-cli version. - Usage: `--force, -f`

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

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Use Identity** - enable identity using keypair from ph login (uses ~/.ph/keypair.json) - Usage: `--use-identity`

**Require Identity** - require existing keypair, fail if not found (implies --use-identity) - Usage: `--require-identity`

**Migrate** - Run database migrations and exit - Usage: `--migrate`

**Migrate Status** - Show migration status and exit - Usage: `--migrate-status`

**Reset** - Wipe the local PGlite switchboard storage after confirmation, then exit - Usage: `--reset`

**Yes** - Skip the interactive confirmation prompt for --reset (required for non-interactive use) - Usage: `--yes, -y`

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
- 4. Stores the credentials locally in .ph/.renown.json

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

The install command adds Powerhouse dependencies to your project.

By default it only registers the package in powerhouse.config.json with
provider "registry" — Connect will load it from the registry CDN at runtime.

With --local, the package is also installed into node_modules and marked
as provider "local" — it will be bundled into ph connect build so the
preview works without the registry being reachable.

Resolution order for the registry URL:
--registry flag &gt; PH_REGISTRY_URL env &gt; powerhouse.config.json &gt; default

---

## Parameters

### Arguments

**Dependencies _[required]_** - Names of the dependencies to install - Usage: `[...dependencies]`

### Options

**Registry** - Registry URL to install from (overrides config and environment) - Usage: `--registry <str>`

**Allow Build** - A list of package names that are allowed to run postinstall scripts during installation. - Usage: `--allow-build <str>`

**Package Manager** - Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager. - Usage: `--package-manager, -p <value>`

### Flags

**Local** - Also install packages into node_modules (marks them as provider: "local" so they get bundled into ph connect build) - Usage: `--local`

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

**Dependencies _[required]_** - Names of the dependencies to uninstall - Usage: `[...dependencies]`

### Options

**Package Manager** - Specify the package manager to use for your project. Can be one of: `npm`, `pnpm`, `yarn`, or `bun`. Defaults to your environment package manager. - Usage: `--package-manager, -p <value>`

### Flags

**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`
{/_ AUTO-GENERATED-CLI-COMMANDS-END _/}
