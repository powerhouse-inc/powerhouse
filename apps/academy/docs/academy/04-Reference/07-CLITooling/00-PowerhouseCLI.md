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

{/* AUTO-GENERATED-CLI-COMMANDS-START */}
{/* This content is automatically generated. Do not edit directly. */}
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
- [Self Update](#self-update)
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

**Package Manager** - Package manager that installs the project: `npm`, `pnpm`, `yarn` or `bun`. Defaults to the one that launched ph (npx, pnpm dlx, bunx), else the one that installed ph (unless npm), else bun, then pnpm 10.14 or later if installed, else npm. - Usage: `--package-manager, -p <value>`

**Tag** - Specify the release tag to use for your project. Can be one of: "latest", "staging", "dev", "rc", or "next". - Usage: `--tag, -t <value>`

**Version** - Specify the exact semver release version to use for your project. - Usage: `--version, -v <str>`

**Remote Drive** - Remote drive identifier. - Usage: `--remote-drive, -r <str>`

**Clone** - Path to an existing scaffolded project to clone instead of resolving deps from scratch. Install runs offline from the cloned project's lockfile: pnpm-lock.yaml with pnpm, package-lock.json with npm (other package managers are refused; --version/--tag are ignored). - Usage: `--clone <str>`




### Flags
**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Dev** - Use the `dev` release tag. - Usage: `--dev, -d`

**Staging** - Use the `staging` release tag. - Usage: `--staging, -s`

**Rc** - Use the `rc` release tag. - Usage: `--rc`

**Next** - Use the `next` release tag. - Usage: `--next`

**Uniform Runners** - Deprecated: no longer needed, `ph init` always scaffolds the hosts/ folder. Accepted with a warning; will be removed in a future release. - Usage: `--uniform-runners`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Use
Specify the release version of Powerhouse dependencies to use.



---

## Parameters

### Arguments
**Tag** - Specify the release tag to use for your project. Can be one of: "latest", "staging", "dev", "rc", or "next". - Usage: `[tag]`




### Options
**Tag** - Specify the release tag to use for your project. Can be one of: "latest", "staging", "dev", "rc", or "next". - Usage: `--tag, -t <value>`

**Version** - Specify the exact semver release version to use for your project. - Usage: `--version, -v <str>`




### Flags
**Skip Install** - Skip running `install` with your package manager - Usage: `--skip-install, -s`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Update
Update your Powerhouse dependencies and installed packages to their latest versions



### Flags
**Skip Install** - Skip running `install` with your package manager - Usage: `--skip-install, -s`

**Update Packages** - Auto-update installed packages (powerhouse.config.json) to their newest same-major version - Usage: `--update-packages`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Self Update
Update the globally installed ph to the newest version of its release stream



### Options
**Tag** - dist-tag to install (defaults to the running build's stream; e.g. latest, dev, next) - Usage: `--tag, -t <str>`




### Flags
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

**Package Manager** - Package manager that installs the project: `npm`, `pnpm`, `yarn` or `bun`. Defaults to the one that launched ph (npx, pnpm dlx, bunx), else the one that installed ph (unless npm), else bun, then pnpm 10.14 or later if installed, else npm. - Usage: `--package-manager, -p <value>`

**Tag** - Specify the release tag to use for your project. Can be one of: "latest", "staging", "dev", "rc", or "next". - Usage: `--tag, -t <value>`

**Version** - Specify the exact semver release version to use for your project. - Usage: `--version, -v <str>`

**Remote Drive** - Remote drive identifier. - Usage: `--remote-drive, -r <str>`

**Clone** - Path to an existing scaffolded project to clone instead of resolving deps from scratch. Install runs offline from the cloned project's lockfile: pnpm-lock.yaml with pnpm, package-lock.json with npm (other package managers are refused; --version/--tag are ignored). - Usage: `--clone <str>`




### Flags
**Npm** - Use 'npm' as package manager - Usage: `--npm`

**Pnpm** - Use 'pnpm' as package manager - Usage: `--pnpm`

**Yarn** - Use 'yarn' as package manager - Usage: `--yarn`

**Bun** - Use 'bun' as package manager - Usage: `--bun`

**Dev** - Use the `dev` release tag. - Usage: `--dev, -d`

**Staging** - Use the `staging` release tag. - Usage: `--staging, -s`

**Rc** - Use the `rc` release tag. - Usage: `--rc`

**Next** - Use the `next` release tag. - Usage: `--next`

**Uniform Runners** - Deprecated: no longer needed, `ph init` always scaffolds the hosts/ folder. Accepted with a warning; will be removed in a future release. - Usage: `--uniform-runners`

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

- [Run](#run)
- [Host Check](#host-check)
- [Host Export](#host-export)
- [Vetra](#vetra)
- [Generate](#generate)
- [All](#all)
- [Document Model](#document-model)
- [Editor](#editor)
- [App](#app)
- [Processor](#processor)
- [Subgraph](#subgraph)
- [Piece](#piece)
- [Piece Action](#piece-action)
- [Piece Trigger](#piece-trigger)
- [Migration File](#migration-file)
- [Connect Routes](#connect-routes)
- [Hosts](#hosts)
- [Build](#build)
- [Connect](#connect)
- [Connect Config](#connect-config)
- [Access Token](#access-token)
- [Inspect](#inspect)
- [Keyframes](#keyframes)
- [List](#list)
- [Mcp](#mcp)
- [Migrate](#migrate)
- [Model Check](#model-check)
- [Model Inspect](#model-inspect)
- [Mutate](#mutate)
- [Login](#login)
- [Whoami](#whoami)
- [Logout](#logout)
- [Identity Password](#identity-password)
- [Identity New](#identity-new)
- [Credentials List](#credentials-list)
- [Credentials Withdraw](#credentials-withdraw)
- [Token Create](#token-create)
- [Token Approve](#token-approve)
- [Token List](#token-list)
- [Token Withdraw](#token-withdraw)
- [Install](#install)
- [Uninstall](#uninstall)


## Run
Run a host from the project's hosts/ folder: `ph run <host> [verb]`. The host's own host.js names the runner module; the verb defaults to `run`. Arguments after the verb go to the runner, which names the ones it accepts. `ph run <package>/<host>` runs a host that an installed package supplies.



---

## Parameters

### Arguments
**Host *[required]*** - Folder name under hosts/ (e.g. dev, connect), or `<package>/<host>` for one in an installed package's hosts/ (e.g. `@acme/tools/studio`). - Usage: `<host>`

**Verb** - Runner verb (default: run; e.g. dev, build, serve). - Usage: `[verb]`

**Runner Arguments *[required]*** - Arguments for the host's runner (e.g. --port 4001); they win over the host file. - Usage: `[...runner arguments]`




### Flags
**Debug** - Print resolved host/runner/verb before dispatch. - Usage: `--debug`

**Stop** - Stop the project's running instance of this host instead of starting one: it shuts down as on Ctrl-C, and the command returns when it has. - Usage: `--stop`

**Help** - show help - Usage: `--help, -h`




### Options
**Explain** - Explain a resolved aspect instead of running: `--explain drives` prints the merged drive plan with provenance; `--explain outputs` prints what each host produces, the output tokens it reads and the start order they imply. - Usage: `--explain <str>`


## Host Check
Check a host the way `ph run` would, without starting it: every load, validation, resolution and boot issue, grouped by host file. Exits 1 on any issue. `--env <file>` checks against that file alone.



---

## Parameters

### Arguments
**Host *[required]*** - the host to check (a directory under hosts/) - Usage: `<host>`




### Options
**Env** - check against this env file alone instead of the project .env and the process env - Usage: `--env <str>`

**Verb** - the verb to check at (default: run) - Usage: `--verb <str>`




### Flags
**Help** - show help - Usage: `--help, -h`


## Host Export
Print a host as declared, with every member a compound names, as JSON (tokens unresolved). `--out` writes it to a file instead.



---

## Parameters

### Arguments
**Host *[required]*** - the host to export (a directory under hosts/) - Usage: `<host>`




### Options
**Out** - write the JSON to this file instead of stdout - Usage: `--out <str>`




### Flags
**Help** - show help - Usage: `--help, -h`


## Vetra
Open Vetra Studio: `ph vetra [verb]` is `ph run @powerhousedao/vetra-cli/studio [verb]`, the studio host of the @powerhousedao/vetra-cli package. A project without the package gets it first: `ph vetra` installs it as a devDependency, at this ph-cli's version, with the project's package manager. The runner arguments, --stop and --explain work as for `ph run`. The dev mode that `ph vetra` started before 6.4 (the project's hosts/vetra) is `ph dev`.



---

## Parameters

### Arguments
**Verb** - Verb of the studio host (default: the host's own). - Usage: `[verb]`

**Runner Arguments *[required]*** - Arguments for the studio host's runner, as `ph run` takes them. - Usage: `[...runner arguments]`




### Flags
**Help** - show help - Usage: `--help, -h`


## Generate
The generate command creates code for Powerhouse modules. It helps you create new code from scratch, or to re-generate existing code in your project.

## All
Re-generate all modules in the current project



### Flags
**Help** - show help - Usage: `--help, -h`


## Document Model
Generate a document model



### Options
**Dir** - Name of the directory of an existing document model to re-generate (my-document-model or document-models/my-document-model) - Usage: `--dir <dir>`

**Name** - Create a document model with this name, with its editor - Usage: `--name, -n <str>`




### Flags
**All** - Re-generate all existing document models in the current project - Usage: `--all, -a`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Editor
Generate a document editor



### Options
**Name** - The name of the document editor to generate - Usage: `--name, -n <str>`

**Document Type** - The document type for the new editor - Usage: `--document-type, -t <str>`

**Dir** - Name of the directory of an existing editor to re-generate (my-editor or editors/my-editor) - Usage: `--dir <dir>`




### Flags
**All** - Re-generate all existing editors in the current project - Usage: `--all, -a`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## App
Generate a drive app



### Options
**Name** - The name of the drive app to generate - Usage: `--name, -n <str>`

**Document Types** - The document types allowed by the new app (repeatable or comma-separated) - Usage: `--document-types <value>, -t=<value>`

**Dir** - Name of the directory of an existing app to re-generate (my-app or editors/my-app) - Usage: `--dir <dir>`




### Flags
**Disable Drag And Drop** - Do not allow drag and drop in this drive app. - Usage: `--disable-drag-and-drop`

**Default:** `false`
**All** - Re-generate all existing apps in the current project - Usage: `--all, -a`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Processor
Generate a processor



### Options
**Name** - The name of the processor to generate - Usage: `--name, -n <str>`

**Type** - The type of processor to generate - Usage: `--type <value>`

**Default:** `analytics`
**Document Types** - The document types the processor will run on (repeatable or comma-separated) - Usage: `--document-types <value>, -t=<value>`

**Default:** ``
**Apps** - Whether the processor will run in switchboard (nodejs), connect (browser), or both - Usage: `--apps <value>`

**Default:** `switchboard,connect`
**Dir** - Name of the directory of an existing processor to re-generate (my-processor or processors/my-processor) - Usage: `--dir <dir>`




### Flags
**All** - Re-generate all existing processors in the current project - Usage: `--all, -a`

**Skip Install** - Don't install the dependencies the command adds to package.json - Usage: `--skip-install`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Subgraph
Generate a subgraph



### Options
**Name** - Create a subgraph with this name. A subgraph directory that already exists keeps its form - Usage: `--name, -n <str>`

**Dir** - Name of the directory of an existing subgraph to re-generate (my-subgraph or subgraphs/my-subgraph) - Usage: `--dir <dir>`




### Flags
**All** - Re-generate all existing subgraphs in the current project - Usage: `--all, -a`

**Skip Install** - Don't install the dependencies the command adds to package.json - Usage: `--skip-install`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Piece
Generate a piece: a connector whose actions and triggers a workflow can call



---

## Parameters

### Arguments
**Name** - The name of the piece to generate. Its directory is the kebab-case of this. - Usage: `[name]`




### Options
**Name** - The name of the piece to generate - Usage: `--name, -n <str>`

**Id** - The piece id, the pieceName a workflow step holds, e.g. @acme/piece-crm. Defaults to one derived from the package name. - Usage: `--id <str>`

**Auth** - The kind of connection the piece asks for - Usage: `--auth <value>`

**Default:** `custom`
**Description** - One line describing what the piece connects to - Usage: `--description <str>`

**Dir** - Name of the directory of an existing piece to re-register (my-piece or pieces/my-piece) - Usage: `--dir <dir>`




### Flags
**All** - Re-register every piece in pieces/: refresh the pieces list and the manifest, and prune what is gone - Usage: `--all, -a`

**Skip Install** - Don't install the dependencies the command adds to package.json - Usage: `--skip-install`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Piece Action
Generate an action inside an existing piece



---

## Parameters

### Arguments
**Name** - The name of the action, e.g. get-record - Usage: `[name]`




### Options
**Name** - The name of the action to generate - Usage: `--name, -n <str>`

**Piece** - The piece directory under pieces/ to add the action to. Optional when the project ships exactly one piece. - Usage: `--piece, -p <str>`

**Require Reactor** - Declare reactor access for the action: read, or write (which includes read). The action then gets context.reactor - Usage: `--require-reactor <value>`

**Default Timeout Seconds** - Write defaultTimeoutSeconds: the step timeout used when the workflow sets none - Usage: `--default-timeout-seconds <number>`

**Default Max Attempts** - Write defaultRetry: \{ maxAttempts \}: the attempts (1 is no retry) used when the workflow sets no retry - Usage: `--default-max-attempts <number>`




### Flags
**Skip Install** - Don't install the dependencies the command adds to package.json - Usage: `--skip-install`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Piece Trigger
Generate a trigger inside an existing piece



---

## Parameters

### Arguments
**Name** - The name of the trigger, e.g. new-record - Usage: `[name]`




### Options
**Name** - The name of the trigger to generate - Usage: `--name, -n <str>`

**Piece** - The piece directory under pieces/ to add the trigger to. Optional when the project ships exactly one piece. - Usage: `--piece, -p <str>`

**Strategy** - How the trigger fires: polled on a schedule, or delivered to a webhook - Usage: `--strategy <value>`

**Default:** `polling`
**Require Reactor** - Declare reactor access for the trigger: read, or write (which includes read). Its hooks then get context.reactor - Usage: `--require-reactor <value>`




### Flags
**Skip Install** - Don't install the dependencies the command adds to package.json - Usage: `--skip-install`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Migration File
Generate a migration file



### Options
**Path *[required]*** - Path to the migration file - Usage: `--path, -p <str>`

**Schema File** - Path to the output file. Defaults to './schema.ts' - Usage: `--schema-file <str>`




### Flags
**Skip Install** - Don't install the dependencies the command adds to package.json - Usage: `--skip-install`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Connect Routes
Generate .ph/connect-routes.gen.ts, the route tree hosts/connect/routes/ type-checks against, and fail if a route the package offers imports @powerhousedao/connect



### Flags
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Hosts
Generate hosts/&lt;name&gt;/outputs.js + outputs.d.ts (typed $output token trees) for every host whose runner declares outputs, and refresh hosts/types.d.ts. Rerun after changing a producer's runner or declared drives: a stale outputs.js fails the load.



### Flags
**Help** - show help - Usage: `--help, -h`


## Build

Build a Powerhouse package for publishing: a browser bundle and a node bundle of its
document models, scalars, editors, subgraphs and processors, type declarations, and its
stylesheet.

Pieces under pieces/ are built too, each into its own self-contained module under
dist/node/pieces/&lt;name&gt;, with a descriptor.json and package.json written beside it and
the piece listed in dist/powerhouse.manifest.json. A piece takes the package's version: an
entry in pieces/index.ts that declares version fails the build. A package that ships only
pieces is an ordinary package: it carries the same boilerplate, and every step above runs
for it too.

tsc runs first. If it reports type errors the build asks whether to go ahead, and stops
where it can't ask. --ignore-type-errors builds without asking; a package built that way
can load and still fail at runtime, so don't publish it.



### Options
**Out Dir** - Where to output the bundled code - Usage: `--out-dir <str>`

**Default:** `dist`




### Flags
**No Shared Deps** - Bundle the shared dependency set instead of externalizing it (default: externalize) - Usage: `--no-shared-deps`

**Default:** `false`
**Ignore Type Errors** - Unsafe: build even when tsc reports type errors, without asking. The package can load and still fail at runtime - Usage: `--ignore-type-errors`

**Default:** `false`
**Release** - Experimental: check every document model as for a release and stop the build, previous output intact, when the check finds them invalid or cannot run; then write the release approval ph publish verifies; also refuse a package with a Cli that does not declare @powerhousedao/clint - Usage: `--release`

**Default:** `false`
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Connect
Powerhouse Connect. `ph connect` runs the project's connect host: it is `ph run connect dev`, as is `ph connect studio`; `ph connect build` is `ph run connect build` and `ph connect preview` is `ph run connect serve`. `ph connect config` reads and writes Connect's runtime configuration.

## Connect Config
Read or update Connect's runtime configuration (powerhouse.config.json).

Modes (mutually exclusive — positional, --get, --json, and field flags cannot be combined):
  ph connect config                       List the effective connect.* block (defaults &lt; source).
  ph connect config &lt;key&gt;                 Get the value at the dotted path (e.g. ph connect config connect.renown.url).
  ph connect config --get &lt;dotted.path&gt;   Same as positional &lt;key&gt; (kept for backward compat).
  ph connect config &lt;key&gt; &lt;value&gt;         Set a single field and dual-write to source + dist (positional).
  ph connect config --&lt;field&gt; &lt;value&gt;     Set a single field via per-field flag (e.g. --renown-url `https://renown.id`).
  ph connect config --json '\{"renown":\{"url":"…"\}\}'
                                          Bulk-set multiple fields and dual-write. The payload is the connect.*
                                          block without the "connect" wrapper; unknown keys are rejected.

Writes go to:
  - &lt;project&gt;/powerhouse.config.json (source — picked up by the next build)
  - &lt;dist-dir&gt;/powerhouse.config.json (if it exists — the currently-served SPA picks it up on refresh)




### Options
**Get** - Dotted path inside connect.* (e.g. "connect.renown.url") to read the effective value. Mutually exclusive with the set modes. Equivalent to `ph connect config <key>` (positional). - Usage: `--get <str>`

**Dist Dir** - Path to the directory containing the dist powerhouse.config.json. Defaults to the PH_CONNECT_OUTDIR env or `.ph/connect-build/dist/`. - Usage: `--dist-dir <str>`

**Json** - Inline JSON override for the runtime connect.* block, without the "connect" wrapper, e.g. '\{"app":\{"workflowsEnabled":true\},"renown":\{"url":"..."\}\}'. A top-level packageRegistryUrl is also accepted. Validated against the runtime schema (unknown keys fail); deep-merged on top of source powerhouse.config.json. Individual --flag values beat --json on collision. - Usage: `--json <str>`

**Renown Url** - Override connect.renown.url. - Usage: `--renown-url <str>`

**Renown Network Id** - Override connect.renown.networkId. - Usage: `--renown-network-id <str>`

**Renown Chain Id** - Override connect.renown.chainId. - Usage: `--renown-chain-id <number>`

**Renown Namespace** - Renown localStorage namespace; share it across Connects to share login. - Usage: `--renown-namespace <str>`

**Renown Switchboard Url** - Override connect.renown.switchboardUrl. When set, enables in-page Renown sign-in. - Usage: `--renown-switchboard-url <str>`

**Allow Add Drive** - Override connect.drives.allowAddDrive (top-level add-drive toggle). - Usage: `--allow-add-drive <value>`

**External Packages** - Override connect.packages.externalEnabled. - Usage: `--external-packages <value>`

**Workflows** - Override connect.app.workflowsEnabled (load the @powerhousedao/workflow package: workflow + connection documents, their editors and Workflow Studio). - Usage: `--workflows <value>`

**Remote Drives Enabled** - Override connect.drives.sections.remote.enabled (the unified cloud+public section). - Usage: `--remote-drives-enabled <value>`

**Remote Drives Allow Add** - Override connect.drives.sections.remote.allowAdd. - Usage: `--remote-drives-allow-add <value>`

**Remote Drives Allow Delete** - Override connect.drives.sections.remote.allowDelete. - Usage: `--remote-drives-allow-delete <value>`

**Local Drives Enabled** - Override connect.drives.sections.local.enabled. - Usage: `--local-drives-enabled <value>`

**Local Drives Allow Add** - Override connect.drives.sections.local.allowAdd. - Usage: `--local-drives-allow-add <value>`

**Local Drives Allow Delete** - Override connect.drives.sections.local.allowDelete. - Usage: `--local-drives-allow-delete <value>`

**Packages Registry** - Override the top-level packageRegistryUrl. - Usage: `--packages-registry <str>`

**App Name** - Override connect.branding.appName. - Usage: `--app-name <str>`

**Home Background** - Override connect.home.background (the generic plugin's home screen). URL or path to an image, pinned bottom-right; pass an empty string ("") to reset to the bundled gradient. - Usage: `--home-background <str>`

**Sentry Dsn** - Override connect.sentry.dsn (Sentry DSN URL). Pass an empty string ("") to set null and disable Sentry. - Usage: `--sentry-dsn <str>`

**Sentry Env** - Override connect.sentry.env (Sentry environment label). - Usage: `--sentry-env <str>`

**Sentry Tracing Enabled** - Override connect.sentry.tracing (Sentry performance tracing). - Usage: `--sentry-tracing-enabled <value>`

**Base** - Base path for the app - Usage: `--base <str>`

**Log Level** - Log level for the application - Usage: `--log-level <value>`

**Environment:** `PH_CONNECT_LOG_LEVEL`
**Default:** `info`
**Default Drives Url** - Comma-separated drive URLs to use as Connect's default drives. - Usage: `--default-drives-url <str>`

**Drive Preserve Strategy** - The preservation strategy to use on default drives - Usage: `--drive-preserve-strategy <value>`

**Default:** `preserve-by-url-and-detach`




---

## Parameters

### Arguments
**Key** - Dotted path inside the runtime config (e.g. connect.renown.url). Pair with &lt;value&gt; to set; pass alone to `ph connect config` to read. - Usage: `[key]`

**Value** - Value to set at &lt;key&gt;. Coerced against the runtime schema (string, bool, number, enum). Arrays and objects require --json instead. - Usage: `[value]`




### Flags
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
  - Generate a keypair (stored in ~/.ph/identities/renown/.keypair.json)
  - Optionally link your Ethereum address (stored in ~/.ph/identities/renown/.renown.json)

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
**Package Name *[required]*** - The name of the package to inspect - Usage: `<package-name>`




### Flags
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Keyframes

The keyframes command reports on and cleans up the keyframes of a running switchboard,
through its inspection-admin endpoint.

Prerequisites:
  - The host serves inspection-admin (INSPECTION_ADMIN_ENABLED=true).
  - The caller is one of the host's auth admins.
  - The keep rules are in powerhouse.config.json under reactor.keyframes, or in PH_KEYFRAMES.

Run preview first: it only reads. clean then removes the keyframes past each type's keep
count and all keyframes of deleted documents, in small paced statements beside live
traffic. Running it again is safe. A later read that misses a keyframe replays from the
operation log, so a clean-up costs time on cold reads and never changes a document.

The disk only shrinks after reclaim, which rewrites the Keyframe table once the store is
quiet. On PGlite the store answers nothing while it rewrites. On Postgres it says what to
run by hand.




---

## Parameters

### Arguments
**Action *[required]*** - preview: report what a clean-up would remove, without writing. clean: apply the configured keep and remove the keyframes of deleted documents (needs --yes). status: show the latest run and reclaim. cancel: stop a running clean-up. reclaim: rewrite the Keyframe table to give the space back to the disk. - Usage: `<action>`




### Options
**Url** - The switchboard's GraphQL endpoint, e.g. `http://localhost:4001/graphql`. Defaults to reactor.port in powerhouse.config.json. - Usage: `--url <str>`

**Token** - Admin bearer token. Defaults to PH_ACCESS_TOKEN, then a token from your `ph login` identity. Its address must be in the host's auth admins. - Usage: `--token <str>`




### Flags
**Yes** - Confirms a clean or a reclaim; both refuse to run without it. - Usage: `--yes`

**Json** - Print the result as JSON. - Usage: `--json`

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


## Mcp

Serve the project's reactor-mcp tools to a coding agent over stdio.

Use it as the MCP server command in .mcp.json, .cursor/mcp.json and
.gemini/settings.json. Tools are listed at once, without waiting for the
project's dev stack. The first tool call connects to the running one (found
through .ph/vetra-runtime.json), or starts one in the background and waits
for it to be ready: `ph run dev --strictPort`, the project's hosts/dev host
(hosts/vetra in a project that has it and no hosts/dev). How
the start goes is reported as MCP progress notifications when the client sent a progressToken, else on
stderr.
Startup failures come back as tool errors carrying the stack's output, which
is also written to .ph/vetra.log.

Beside reactor-mcp's tools it serves restartVetra, which stops the project's
dev stack, starts it again and returns its URLs. When the stack restarts some
other way (stopped and started again), the next tool call connects to the new
one.




### Options
**Project Dir** - Powerhouse project to serve. Defaults to the nearest directory above the working directory that holds powerhouse.config.json. - Usage: `--project-dir <str>`

**Start Timeout** - Seconds to wait for the dev host to answer /ready after starting it on the first tool call - Usage: `--start-timeout <number>`

**Default:** `120`




### Flags
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Migrate
Run migrations. `ph migrate` runs the identity step first (what a project kept of identities before Powerhouse 6.4; `--identity` runs it alone), then moves the project to a version.



---

## Parameters

### Arguments
**Version** - The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `next`, `latest`. Defaults to the release channel of the project's installed Powerhouse packages. - Usage: `[version]`




### Options
**Version** - The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `next`, `latest`. Defaults to the release channel of the project's installed Powerhouse packages. - Usage: `--version, -v <str>`

**Subgraph** - Convert only this directory of subgraphs/ into a code-first subgraph. Repeat it for more directories. Implies --subgraphs. - Usage: `--subgraph <str>`

**Document Model** - Convert only this directory of the document models directory into a code-first model. Repeat it for more directories. Implies --document-models. - Usage: `--document-model <str>`

**Renown Url** - The Renown the logins from before 6.4 were made at, which withdraws them. Defaults to `https://www.renown.id`, where `ph login` logged in before 6.4; no environment variable sets it, so a 6.4 setting for the current Renown never sends the withdraws elsewhere. - Usage: `--renown-url <str>`




### Flags
**Force** - Run migrate from the bundled codegen even if the target version cannot be resolved from the npm registry or differs from the installed ph-cli version. - Usage: `--force, -f`

**Subgraphs** - Convert every schema-first subgraph under subgraphs/ into a code-first one, keeping its schema and resolvers. Each resolver becomes a member of the subgraph class that getSchema calls directly, and each separate resolver factory module stays loaded in its original order to preserve initialization and shared bindings. Other files that import the schema-first SDL get it from schema-sdl.ts. Code-first subgraphs are skipped, and a subgraph that cannot keep the same schema is left as it is, with the reason. The project's tsc then checks the converted resolvers against the schema they serve: each call it rejects, because the resolver's own types disagree with the schema, is cast with a ph migrate comment so it runs as before and the project compiles, and is listed to fix. Upgrades no dependencies and regenerates nothing else. - Usage: `--subgraphs`

**Strict Resolvers** - With --subgraphs or --subgraph: leave the resolver calls tsc rejects without a cast, so the project does not compile until each resolver's types agree with the schema. They are listed either way. - Usage: `--strict-resolvers`

**Document Models** - Convert every schema-first document model into a code-first one, keeping each version's definition and reducers. The model gets the layout ph generate document-model --name writes: index.ts, upgrades/index.ts, and per version definition.ts, index.ts and modules/; the custom code of src/ moves into the version's directory. The generated code, src/ and &lt;name&gt;.json are removed. The names the generated code exported stay available from compat/v&lt;N&gt;/index.ts, imports of removed files are rewritten to it, and the document-models barrels are regenerated. A model that cannot keep the same definition is left as it is, with the reason. Upgrades no dependencies. - Usage: `--document-models`

**Rename Conflicting Types** - With --document-models or --document-model: rename a model type that has the name of a scalar, such as Address, by prefixing the model's name (InvoiceAddress), instead of refusing the model. The GraphQL type name changes; the TypeScript name the model's compat exports keeps the old name. - Usage: `--rename-conflicting-types`

**Identity** - Run only the identity step, which `ph migrate` runs first: withdraw at Renown the logins a project and Studio's agent kept before Powerhouse 6.4 and remove them (the switchboard's own key stays), remove the owner claim, the preview's trusted keys and the dead identity settings, write .ph/.gitignore, summarise and remove a 6.3 host's record of unsigned writes, and report who administers the host. A second run has nothing to do. With --dry-run it asks nothing and writes nothing. - Usage: `--identity`

**Dry Run** - Print the diff of every file the migration would add, change or delete, and write nothing. It installs nothing and regenerates no code; it lists those steps instead. - Usage: `--dry-run`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Model Check
Check this package's document models through one set of checks:
every model directory in documentModelsDir, whether it stores the &lt;name&gt;.json of
a legacy document model or exports a model from its index.ts. Writes nothing.

`tsc` cannot run these checks: a document model with a definition compiles when
its module is evaluated.

--release (experimental) runs the checks `ph build --release` runs: these,
the release checks, and host validation, which validates every model and the
package's scalars entry as a host that installed the package would.

--prepack (experimental) loads nothing. It reads the release approval
`ph build --release` wrote in .ph/build/release-approval.json and exits 0
when it matches this package, 1 when it does not (missing, unreadable, stale
or refused), naming the reasons, and 2 when it cannot be checked. To stop a
plain `npm publish` too, add it to package.json, then run
`ph build --release` (package.json is published, so the approval covers it):
  "scripts": \{ "prepack": "ph-cli model check --prepack" \}
With --json it prints \{"decision": ..., "reasons": [...]\}.

Exit codes:
  0  ok, or skipped. Skipped means the package has no document model, so
     nothing was checked. Read "status".
  1  invalid. The models were read and at least one is wrong.
  2  failed. The configuration or a module could not be read, the arguments
     are wrong, or the command could not run.

Output:
  ph model check          a readable report on stdout
  ph model check --json   exactly one JSON report on stdout and nothing else
Logs, including what the package's modules print while they load, go to
stderr. When the command cannot run at all, it prints only a message on
stderr and exits 2.

Experimental: the command, its output and the JSON report can change in any release.



### Flags
**Release** - Experimental: check as ph build --release does, with the release checks and host validation over every model. Writes nothing - Usage: `--release`

**Default:** `false`
**Prepack** - Experimental: without loading the package, exit 0 when the release approval ph build --release wrote matches it, 1 when it does not, and 2 when it cannot be checked. For a "prepack" script, so npm publish stops too - Usage: `--prepack`

**Default:** `false`
**Json** - Print exactly one JSON report on stdout and nothing else - Usage: `--json`

**Default:** `false`
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Model Inspect
Describe this package's document models without checking them: for each
model its digest and compatibility, and for each of its versions the source,
scopes, scalars and operations. With &lt;documentType&gt;@&lt;version&gt;, describe that
version only and add its full definition to the JSON report. Writes nothing.

Exit codes:
  0  ok, or skipped. Skipped means the package has no document model, so
     nothing was checked. Read "status".
  1  invalid. The models were read and at least one is wrong.
  2  failed. The configuration or a module could not be read, the arguments
     are wrong, or the command could not run.

Output:
  ph model inspect          a readable report on stdout
  ph model inspect --json   exactly one JSON report on stdout and nothing else
Logs, including what the package's modules print while they load, go to
stderr. When the command cannot run at all, it prints only a message on
stderr and exits 2.

Experimental: the command, its output and the JSON report can change in any release.



---

## Parameters

### Arguments
**Document Type Version** - Inspect one model version, such as acme/invoice@1 (default: every model) - Usage: `[documentType@version]`




### Flags
**Json** - Print exactly one JSON report on stdout and nothing else - Usage: `--json`

**Default:** `false`
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Mutate

Send a change to a document on a switchboard, signed as you (your Renown login or pseudonym, or the
key in PH_IDENTITY_KEY) through ph-cli's own session "ph-cli": a Powerhouse 6.4 host signs nothing
for its callers. The actions are plain objects; no document model is needed but for --create.

  ph mutate &lt;document&gt; &lt;TYPE&gt; [--input &lt;json&gt; | --input-file &lt;file&gt;] [--scope &lt;scope&gt;] [--branch &lt;branch&gt;]
  ph mutate &lt;document&gt; --actions &lt;file.json&gt;
  ph mutate --create &lt;type&gt; [--parent &lt;drive&gt;] [--name &lt;name&gt;]
  ph mutate --delete &lt;document&gt; [--cascade]

The switchboard is --url (its GraphQL endpoint or base URL), else the one this project runs (its run
record). A refusal prints the host's code (UNSIGNED_WRITE and its reason, or another) and its fix.
  



---

## Parameters

### Arguments
**Document** - The document to change: its id or slug - Usage: `[document]`

**Type** - The action's type, as the document model names it (SET_NAME) - Usage: `[TYPE]`




### Options
**Input** - The action's input as JSON (default: \{\}) - Usage: `--input <str>`

**Input File** - A file holding the action's input as JSON - Usage: `--input-file <str>`

**Scope** - The action's scope (default: global) - Usage: `--scope <str>`

**Branch** - The branch to write to (default: main) - Usage: `--branch <str>`

**Actions** - A JSON file with the actions to send, in order: an array of \{ type, input, scope \} - Usage: `--actions <str>`

**Create** - Create a document of this type (powerhouse/document-model); its model must be one ph-cli holds: a base model, the project's or a package's in powerhouse.config.json - Usage: `--create <str>`

**Parent** - With --create: the drive (id or slug) to file the new document in - Usage: `--parent <str>`

**Name** - With --create: the new document's name - Usage: `--name <str>`

**Delete** - Delete this document (id or slug); the host removes the links to it and its drive entry - Usage: `--delete <str>`

**Url** - The switchboard: its GraphQL endpoint or base URL (default: the one this project runs, from its run record) - Usage: `--url <str>`




### Flags
**Cascade** - With --delete: also delete the documents only it holds (its children) - Usage: `--cascade`

**Json** - Print JSON for scripts - Usage: `--json`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Login

The login command authenticates you with Renown using your Ethereum wallet. This enables
the CLI to act on behalf of your Ethereum identity for authenticated operations.

**What it does:**
- 1. Generates or loads a cryptographic identity (DID) for the CLI
- 2. Opens your browser to the Renown authentication page
- 3. You authorize the CLI's DID to act on behalf of your Ethereum address
- 4. Stores the login in your home folder (~/.ph/identities/renown), for every project
  



### Options
**Renown Url** - Renown server URL. - Usage: `--renown-url <str>`

**Environment:** `PH_CONNECT_RENOWN_URL`
**Default:** `https//renown-staging.vetra.io`
**Timeout** - Authentication timeout in seconds. - Usage: `--timeout <number>`

**Default:** `300`




### Flags
**Logout** - Sign out and clear stored credentials - Usage: `--logout`

**Status** - Show current authentication status - Usage: `--status`

**Show Did** - Show the CLI's DID and exit - Usage: `--show-did`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Whoami

Show who acts here: your Renown login when you are logged in (`ph login`), else your
pseudonym, an Ethereum key made without a login and shown as "Anonymous" and a short
address. Reads files only; `--check` also asks Renown whether the login is still valid.
  



### Flags
**Json** - Print the identity as JSON - Usage: `--json`

**Check** - Ask Renown whether the login is still valid (network) - Usage: `--check`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`




### Options
**Renown Url** - Renown server URL. - Usage: `--renown-url <str>`

**Environment:** `PH_CONNECT_RENOWN_URL`
**Default:** `https//renown-staging.vetra.io`


## Logout

The logout command withdraws your Renown login at Renown and deletes it from this computer,
its key included. Your pseudonym acts again.



### Options
**Renown Url** - Renown server URL. - Usage: `--renown-url <str>`

**Environment:** `PH_CONNECT_RENOWN_URL`
**Default:** `https//renown-staging.vetra.io`




### Flags
**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Identity Password
Set, change or remove the password of your pseudonym, in the home folder and in every store it was copied into. Makes the pseudonym when there is none.



### Flags
**Remove** - Remove the password: the key is kept readable by your user only - Usage: `--remove`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Identity New
Make an identity for a service: a new Ethereum key, printed as `PH_IDENTITY_KEY=0x...` with the name it signs under (Anonymous 0x1a2b...9f3c). Writes nothing unless --save names a file, which is readable by you only and never overwritten. A process with PH_IDENTITY_KEY set signs its own writes with that key.



### Options
**Label** - What the identity is for (the service's name): printed with it and kept in the saved file - Usage: `--label <str>`

**Save** - Write the key to this file, readable by you only, instead of printing it; an existing file is never overwritten - Usage: `--save <str>`




### Flags
**Json** - Print the identity as JSON - Usage: `--json`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Credentials List

List the credentials this store's host accepts by its own record (`.ph/credentials` in the
data folder): who, the session's label, who wrote it, its expiry and whether it verifies.
  



### Options
**Data Dir** - The store's data folder (default: PH_USER_DATA_DIR, else the project) - Usage: `--data-dir <str>`




### Flags
**All** - Also list withdrawn credentials - Usage: `--all`

**Json** - Print the records as JSON - Usage: `--json`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Credentials Withdraw

Withdraw credential records by id prefix, address or label. A running host refuses a withdrawn
credential from its next request, and the withdrawal holds after a restart.
  



---

## Parameters

### Arguments
**Id Address Label *[required]*** - Records to withdraw: an id prefix, an address or a label - Usage: `[...id | address | label]`




### Flags
**Expired** - Remove expired records and the tombstones of expired ones - Usage: `--expired`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`




### Options
**Data Dir** - The store's data folder (default: PH_USER_DATA_DIR, else the project) - Usage: `--data-dir <str>`


## Token Create

Create a host session token: a token for a tool that signs nothing itself (curl, a script, an MCP
client), with which the host signs that tool's document changes as you, labelled. It runs the host's
OAuth device grant: with a pseudonym it approves the grant itself after asking you; with a Renown
login it opens the host's page, where you approve it with Renown. The token lives at most 30 days
and administers nothing.

Only the token goes to stdout, so a script can keep it:
  TOKEN=$(ph token create --label billing --days 7)
  curl -H "Authorization: Bearer $TOKEN" `http://localhost:4001/graphql` ...
  



### Options
**Url** - The host, as its consent page names it (default: this project's switchboard on localhost) - Usage: `--url <str>`

**Label** - What the session is called, as the operations it signs name it (default: ph token) - Usage: `--label <str>`

**Days** - How many days the token lives, 1 to 30 (default: 30) - Usage: `--days <number>`

**Replace** - A session to withdraw once the new token is issued: its id (or a prefix) or label - Usage: `--replace <str>`

**Data Dir** - The store's data folder (default: PH_USER_DATA_DIR, else the project) - Usage: `--data-dir <str>`




### Flags
**Yes** - Approve without asking (for scripts) - Usage: `--yes, -y`

**Json** - Print JSON for scripts - Usage: `--json`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Token Approve

Approve a code a device or tool shows (the host's consent page names this command): shows what you
would allow, asks, then signs the session's credential as your pseudonym. Approve only a code you
started yourself in the last 10 minutes.
  



---

## Parameters

### Arguments
**Code *[required]*** - The code the device or tool shows, e.g. WXYZ-BCDF - Usage: `<code>`




### Options
**Url** - The host, as its consent page names it (default: this project's switchboard on localhost) - Usage: `--url <str>`




### Flags
**Yes** - Approve without asking (for scripts) - Usage: `--yes, -y`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Token List

List the host sessions of this store (`.ph/host-sessions` in the data folder): label, who, how it
was granted, the client, its dates and last use. With --url, the host's own list of yours.
  



### Options
**Url** - The host, as its consent page names it (default: this project's switchboard on localhost) - Usage: `--url <str>`

**Data Dir** - The store's data folder (default: PH_USER_DATA_DIR, else the project) - Usage: `--data-dir <str>`




### Flags
**Json** - Print JSON for scripts - Usage: `--json`

**Debug** - Log arguments passed to this command - Usage: `--debug`

**Help** - show help - Usage: `--help, -h`


## Token Withdraw

Withdraw a host session by its id (or a prefix) or label: its tokens are refused from their next
request, and the withdrawal holds after a restart. With --url, at the host, as yourself.
  



---

## Parameters

### Arguments
**Id Label *[required]*** - The session to withdraw: its id (or a prefix) or its label - Usage: `<id | label>`




### Options
**Url** - The host, as its consent page names it (default: this project's switchboard on localhost) - Usage: `--url <str>`

**Data Dir** - The store's data folder (default: PH_USER_DATA_DIR, else the project) - Usage: `--data-dir <str>`




### Flags
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
**Dependencies *[required]*** - Names of the dependencies to install - Usage: `[...dependencies]`




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
{/* AUTO-GENERATED-CLI-COMMANDS-END */}
