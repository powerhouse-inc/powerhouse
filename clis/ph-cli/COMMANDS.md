# Powerhouse CLI Commands (6.4.0-next.3)<br>
This document provides detailed information about the available commands in the Powerhouse CLI.<br><br>
The Powerhouse CLI (ph-cli) is a command-line interface tool that provides essential commands for managing Powerhouse projects. The tool and it's commands are fundamental for creating, building, and running Document Models as a builder in studio mode.<br>
## Table of Contents
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
- [Login](#login)
- [Whoami](#whoami)
- [Logout](#logout)
- [Identity Password](#identity-password)
- [Credentials List](#credentials-list)
- [Credentials Withdraw](#credentials-withdraw)
- [Install](#install)
- [Uninstall](#uninstall)
<br>
## Run
Run a host from the project's hosts/ folder: `ph run <host> [verb]`. The host's own host.js names the runner module; the verb defaults to `run`. Arguments after the verb go to the runner, which names the ones it accepts. `ph run <package>/<host>` runs a host that an installed package supplies.
### arguments
#### Host *[required]*<br>
Folder name under hosts/ (e.g. dev, connect), or `<package>/<host>` for one in an installed package's hosts/ (e.g. `@acme/tools/studio`).<br><br>
**usage:** `<host>`<br>

#### Verb <br>
Runner verb (default: run; e.g. dev, build, serve).<br><br>
**usage:** `[verb]`<br>

#### Runner Arguments *[required]*<br>
Arguments for the host's runner (e.g. --port 4001); they win over the host file.<br><br>
**usage:** `[...runner arguments]`<br>


### flags
#### Debug <br>
Print resolved host/runner/verb before dispatch.<br><br>
**usage:** `--debug`<br>

#### Stop <br>
Stop the project's running instance of this host instead of starting one: it shuts down as on Ctrl-C, and the command returns when it has.<br><br>
**usage:** `--stop`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


### options
#### Explain <br>
Explain a resolved aspect instead of running: `--explain drives` prints the merged drive plan with provenance; `--explain outputs` prints what each host produces, the output tokens it reads and the start order they imply.<br><br>
**usage:** `--explain <str>`<br>


## Host Check
Check a host the way `ph run` would, without starting it: every load, validation, resolution and boot issue, grouped by host file. Exits 1 on any issue. `--env <file>` checks against that file alone.
### arguments
#### Host *[required]*<br>
the host to check (a directory under hosts/)<br><br>
**usage:** `<host>`<br>


### options
#### Env <br>
check against this env file alone instead of the project .env and the process env<br><br>
**usage:** `--env <str>`<br>

#### Verb <br>
the verb to check at (default: run)<br><br>
**usage:** `--verb <str>`<br>


### flags
#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Host Export
Print a host as declared, with every member a compound names, as JSON (tokens unresolved). `--out` writes it to a file instead.
### arguments
#### Host *[required]*<br>
the host to export (a directory under hosts/)<br><br>
**usage:** `<host>`<br>


### options
#### Out <br>
write the JSON to this file instead of stdout<br><br>
**usage:** `--out <str>`<br>


### flags
#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Vetra
Open Vetra Studio: `ph vetra [verb]` is `ph run @powerhousedao/vetra-cli/studio [verb]`, the studio host of the @powerhousedao/vetra-cli package. A project without the package gets it first: `ph vetra` installs it as a devDependency, at this ph-cli's version, with the project's package manager. The runner arguments, --stop and --explain work as for `ph run`. The dev mode that `ph vetra` started before 6.4 (the project's hosts/vetra) is `ph dev`.
### arguments
#### Verb <br>
Verb of the studio host (default: the host's own).<br><br>
**usage:** `[verb]`<br>

#### Runner Arguments *[required]*<br>
Arguments for the studio host's runner, as `ph run` takes them.<br><br>
**usage:** `[...runner arguments]`<br>


### flags
#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Generate
The generate command creates code for Powerhouse modules. It helps you create new code from scratch, or to re-generate existing code in your project.
## All
Re-generate all modules in the current project
### flags
#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Document Model
Generate a document model
### options
#### Dir <br>
Name of the directory of an existing document model to re-generate (my-document-model or document-models/my-document-model)<br><br>
**usage:** `--dir <dir>`<br>

#### Name <br>
Create a document model with this name, with its editor<br><br>
**usage:** `--name, -n <str>`<br>


### flags
#### All <br>
Re-generate all existing document models in the current project<br><br>
**usage:** `--all, -a`<br>

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

#### Dir <br>
Name of the directory of an existing editor to re-generate (my-editor or editors/my-editor)<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### All <br>
Re-generate all existing editors in the current project<br><br>
**usage:** `--all, -a`<br>

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
The document types allowed by the new app (repeatable or comma-separated)<br><br>
**usage:** `--document-types <value>, -t=<value>`<br>

#### Dir <br>
Name of the directory of an existing app to re-generate (my-app or editors/my-app)<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### Disable Drag And Drop <br>
Do not allow drag and drop in this drive app.<br><br>
**usage:** `--disable-drag-and-drop`<br>
**default**: `false`
#### All <br>
Re-generate all existing apps in the current project<br><br>
**usage:** `--all, -a`<br>

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
The document types the processor will run on (repeatable or comma-separated)<br><br>
**usage:** `--document-types <value>, -t=<value>`<br>
**default**: ``
#### Apps <br>
Whether the processor will run in switchboard (nodejs), connect (browser), or both<br><br>
**usage:** `--apps <value>`<br>
**default**: `switchboard,connect`
#### Dir <br>
Name of the directory of an existing processor to re-generate (my-processor or processors/my-processor)<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### All <br>
Re-generate all existing processors in the current project<br><br>
**usage:** `--all, -a`<br>

#### Skip Install <br>
Don't install the dependencies the command adds to package.json<br><br>
**usage:** `--skip-install`<br>

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
Create a subgraph with this name. A subgraph directory that already exists keeps its form<br><br>
**usage:** `--name, -n <str>`<br>

#### Dir <br>
Name of the directory of an existing subgraph to re-generate (my-subgraph or subgraphs/my-subgraph)<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### All <br>
Re-generate all existing subgraphs in the current project<br><br>
**usage:** `--all, -a`<br>

#### Skip Install <br>
Don't install the dependencies the command adds to package.json<br><br>
**usage:** `--skip-install`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Piece
Generate a piece: a connector whose actions and triggers a workflow can call
### arguments
#### Name <br>
The name of the piece to generate. Its directory is the kebab-case of this.<br><br>
**usage:** `[name]`<br>


### options
#### Name <br>
The name of the piece to generate<br><br>
**usage:** `--name, -n <str>`<br>

#### Id <br>
The piece id, the pieceName a workflow step holds, e.g. @acme/piece-crm. Defaults to one derived from the package name.<br><br>
**usage:** `--id <str>`<br>

#### Auth <br>
The kind of connection the piece asks for<br><br>
**usage:** `--auth <value>`<br>
**default**: `custom`
#### Description <br>
One line describing what the piece connects to<br><br>
**usage:** `--description <str>`<br>

#### Dir <br>
Name of the directory of an existing piece to re-register (my-piece or pieces/my-piece)<br><br>
**usage:** `--dir <dir>`<br>


### flags
#### All <br>
Re-register every piece in pieces/: refresh the pieces list and the manifest, and prune what is gone<br><br>
**usage:** `--all, -a`<br>

#### Skip Install <br>
Don't install the dependencies the command adds to package.json<br><br>
**usage:** `--skip-install`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Piece Action
Generate an action inside an existing piece
### arguments
#### Name <br>
The name of the action, e.g. get-record<br><br>
**usage:** `[name]`<br>


### options
#### Name <br>
The name of the action to generate<br><br>
**usage:** `--name, -n <str>`<br>

#### Piece <br>
The piece directory under pieces/ to add the action to. Optional when the project ships exactly one piece.<br><br>
**usage:** `--piece, -p <str>`<br>

#### Require Reactor <br>
Declare reactor access for the action: read, or write (which includes read). The action then gets context.reactor<br><br>
**usage:** `--require-reactor <value>`<br>

#### Default Timeout Seconds <br>
Write defaultTimeoutSeconds: the step timeout used when the workflow sets none<br><br>
**usage:** `--default-timeout-seconds <number>`<br>

#### Default Max Attempts <br>
Write defaultRetry: { maxAttempts }: the attempts (1 is no retry) used when the workflow sets no retry<br><br>
**usage:** `--default-max-attempts <number>`<br>


### flags
#### Skip Install <br>
Don't install the dependencies the command adds to package.json<br><br>
**usage:** `--skip-install`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Piece Trigger
Generate a trigger inside an existing piece
### arguments
#### Name <br>
The name of the trigger, e.g. new-record<br><br>
**usage:** `[name]`<br>


### options
#### Name <br>
The name of the trigger to generate<br><br>
**usage:** `--name, -n <str>`<br>

#### Piece <br>
The piece directory under pieces/ to add the trigger to. Optional when the project ships exactly one piece.<br><br>
**usage:** `--piece, -p <str>`<br>

#### Strategy <br>
How the trigger fires: polled on a schedule, or delivered to a webhook<br><br>
**usage:** `--strategy <value>`<br>
**default**: `polling`
#### Require Reactor <br>
Declare reactor access for the trigger: read, or write (which includes read). Its hooks then get context.reactor<br><br>
**usage:** `--require-reactor <value>`<br>


### flags
#### Skip Install <br>
Don't install the dependencies the command adds to package.json<br><br>
**usage:** `--skip-install`<br>

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
#### Skip Install <br>
Don't install the dependencies the command adds to package.json<br><br>
**usage:** `--skip-install`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Connect Routes
Generate .ph/connect-routes.gen.ts, the route tree hosts/connect/routes/ type-checks against, and fail if a route the package offers imports @powerhousedao/connect
### flags
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Hosts
Generate hosts/<name>/outputs.js + outputs.d.ts (typed $output token trees) for every host whose runner declares outputs, and refresh hosts/types.d.ts. Rerun after changing a producer's runner or declared drives: a stale outputs.js fails the load.
### flags
#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Build

Build a Powerhouse package for publishing: a browser bundle and a node bundle of its
document models, scalars, editors, subgraphs and processors, type declarations, and its
stylesheet.

Pieces under pieces/ are built too, each into its own self-contained module under
dist/node/pieces/<name>, with a descriptor.json and package.json written beside it and
the piece listed in dist/powerhouse.manifest.json. A piece takes the package's version: an
entry in pieces/index.ts that declares version fails the build. A package that ships only
pieces is an ordinary package: it carries the same boilerplate, and every step above runs
for it too.

tsc runs first. If it reports type errors the build asks whether to go ahead, and stops
where it can't ask. --ignore-type-errors builds without asking; a package built that way
can load and still fail at runtime, so don't publish it.
### options
#### Out Dir <br>
Where to output the bundled code<br><br>
**usage:** `--out-dir <str>`<br>
**default**: `dist`

### flags
#### No Shared Deps <br>
Bundle the shared dependency set instead of externalizing it (default: externalize)<br><br>
**usage:** `--no-shared-deps`<br>
**default**: `false`
#### Ignore Type Errors <br>
Unsafe: build even when tsc reports type errors, without asking. The package can load and still fail at runtime<br><br>
**usage:** `--ignore-type-errors`<br>
**default**: `false`
#### Release <br>
Experimental: check every document model as for a release and stop the build, previous output intact, when the check finds them invalid or cannot run; then write the release approval ph publish verifies; also refuse a package with a Cli that does not declare @powerhousedao/clint<br><br>
**usage:** `--release`<br>
**default**: `false`
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Connect
Powerhouse Connect. `ph connect` runs the project's connect host: it is `ph run connect dev`, as is `ph connect studio`; `ph connect build` is `ph run connect build` and `ph connect preview` is `ph run connect serve`. `ph connect config` reads and writes Connect's runtime configuration.
## Connect Config
Read or update Connect's runtime configuration (powerhouse.config.json).

Modes (mutually exclusive — positional, --get, --json, and field flags cannot be combined):
  ph connect config                       List the effective connect.* block (defaults < source).
  ph connect config <key>                 Get the value at the dotted path (e.g. ph connect config connect.renown.url).
  ph connect config --get <dotted.path>   Same as positional <key> (kept for backward compat).
  ph connect config <key> <value>         Set a single field and dual-write to source + dist (positional).
  ph connect config --<field> <value>     Set a single field via per-field flag (e.g. --renown-url https://renown.id).
  ph connect config --json '{"renown":{"url":"…"}}'
                                          Bulk-set multiple fields and dual-write. The payload is the connect.*
                                          block without the "connect" wrapper; unknown keys are rejected.

Writes go to:
  - <project>/powerhouse.config.json (source — picked up by the next build)
  - <dist-dir>/powerhouse.config.json (if it exists — the currently-served SPA picks it up on refresh)

### options
#### Get <br>
Dotted path inside connect.* (e.g. "connect.renown.url") to read the effective value. Mutually exclusive with the set modes. Equivalent to `ph connect config <key>` (positional).<br><br>
**usage:** `--get <str>`<br>

#### Dist Dir <br>
Path to the directory containing the dist powerhouse.config.json. Defaults to the PH_CONNECT_OUTDIR env or `.ph/connect-build/dist/`.<br><br>
**usage:** `--dist-dir <str>`<br>

#### Json <br>
Inline JSON override for the runtime connect.* block, without the "connect" wrapper, e.g. '{"app":{"workflowsEnabled":true},"renown":{"url":"..."}}'. A top-level packageRegistryUrl is also accepted. Validated against the runtime schema (unknown keys fail); deep-merged on top of source powerhouse.config.json. Individual --flag values beat --json on collision.<br><br>
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

#### Workflows <br>
Override connect.app.workflowsEnabled (load the @powerhousedao/workflow package: workflow + connection documents, their editors and Workflow Studio).<br><br>
**usage:** `--workflows <value>`<br>

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
Override connect.home.background (the generic plugin's home screen). URL or path to an image, pinned bottom-right; pass an empty string ("") to reset to the bundled gradient.<br><br>
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

#### Base <br>
Base path for the app<br><br>
**usage:** `--base <str>`<br>

#### Log Level <br>
Log level for the application<br><br>
**usage:** `--log-level <value>`<br>
**env**: `PH_CONNECT_LOG_LEVEL`<br>**default**: `info`
#### Default Drives Url <br>
Comma-separated drive URLs to use as Connect's default drives.<br><br>
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

### arguments
#### Action *[required]*<br>
preview: report what a clean-up would remove, without writing. clean: apply the configured keep and remove the keyframes of deleted documents (needs --yes). status: show the latest run and reclaim. cancel: stop a running clean-up. reclaim: rewrite the Keyframe table to give the space back to the disk.<br><br>
**usage:** `<action>`<br>


### options
#### Url <br>
The switchboard's GraphQL endpoint, e.g. http://localhost:4001/graphql. Defaults to reactor.port in powerhouse.config.json.<br><br>
**usage:** `--url <str>`<br>

#### Token <br>
Admin bearer token. Defaults to PH_ACCESS_TOKEN, then a token from your `ph login` identity. Its address must be in the host's auth admins.<br><br>
**usage:** `--token <str>`<br>


### flags
#### Yes <br>
Confirms a clean or a reclaim; both refuse to run without it.<br><br>
**usage:** `--yes`<br>

#### Json <br>
Print the result as JSON.<br><br>
**usage:** `--json`<br>

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

### options
#### Project Dir <br>
Powerhouse project to serve. Defaults to the nearest directory above the working directory that holds powerhouse.config.json.<br><br>
**usage:** `--project-dir <str>`<br>

#### Start Timeout <br>
Seconds to wait for the dev host to answer /ready after starting it on the first tool call<br><br>
**usage:** `--start-timeout <number>`<br>
**default**: `120`

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
The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `next`, `latest`. Defaults to the release channel of the project's installed Powerhouse packages.<br><br>
**usage:** `[version]`<br>


### options
#### Version <br>
The version to migrate to. Accepts a valid semver version or `staging`, `dev`, `next`, `latest`. Defaults to the release channel of the project's installed Powerhouse packages.<br><br>
**usage:** `--version, -v <str>`<br>

#### Subgraph <br>
Convert only this directory of subgraphs/ into a code-first subgraph. Repeat it for more directories. Implies --subgraphs.<br><br>
**usage:** `--subgraph <str>`<br>

#### Document Model <br>
Convert only this directory of the document models directory into a code-first model. Repeat it for more directories. Implies --document-models.<br><br>
**usage:** `--document-model <str>`<br>


### flags
#### Force <br>
Run migrate from the bundled codegen even if the target version cannot be resolved from the npm registry or differs from the installed ph-cli version.<br><br>
**usage:** `--force, -f`<br>

#### Subgraphs <br>
Convert every schema-first subgraph under subgraphs/ into a code-first one, keeping its schema and resolvers. Each resolver becomes a member of the subgraph class that getSchema calls directly, and each separate resolver factory module stays loaded in its original order to preserve initialization and shared bindings. Other files that import the schema-first SDL get it from schema-sdl.ts. Code-first subgraphs are skipped, and a subgraph that cannot keep the same schema is left as it is, with the reason. The project's tsc then checks the converted resolvers against the schema they serve: each call it rejects, because the resolver's own types disagree with the schema, is cast with a ph migrate comment so it runs as before and the project compiles, and is listed to fix. Upgrades no dependencies and regenerates nothing else.<br><br>
**usage:** `--subgraphs`<br>

#### Strict Resolvers <br>
With --subgraphs or --subgraph: leave the resolver calls tsc rejects without a cast, so the project does not compile until each resolver's types agree with the schema. They are listed either way.<br><br>
**usage:** `--strict-resolvers`<br>

#### Document Models <br>
Convert every schema-first document model into a code-first one, keeping each version's definition and reducers. The model gets the layout ph generate document-model --name writes: index.ts, upgrades/index.ts, and per version definition.ts, index.ts and modules/; the custom code of src/ moves into the version's directory. The generated code, src/ and <name>.json are removed. The names the generated code exported stay available from compat/v<N>/index.ts, imports of removed files are rewritten to it, and the document-models barrels are regenerated. A model that cannot keep the same definition is left as it is, with the reason. Upgrades no dependencies.<br><br>
**usage:** `--document-models`<br>

#### Rename Conflicting Types <br>
With --document-models or --document-model: rename a model type that has the name of a scalar, such as Address, by prefixing the model's name (InvoiceAddress), instead of refusing the model. The GraphQL type name changes; the TypeScript name the model's compat exports keeps the old name.<br><br>
**usage:** `--rename-conflicting-types`<br>

#### Dry Run <br>
Print the diff of every file the migration would add, change or delete, and write nothing. It installs nothing and regenerates no code; it lists those steps instead.<br><br>
**usage:** `--dry-run`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Model Check
Check this package's document models through one set of checks:
every model directory in documentModelsDir, whether it stores the <name>.json of
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
  "scripts": { "prepack": "ph-cli model check --prepack" }
With --json it prints {"decision": ..., "reasons": [...]}.

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
### flags
#### Release <br>
Experimental: check as ph build --release does, with the release checks and host validation over every model. Writes nothing<br><br>
**usage:** `--release`<br>
**default**: `false`
#### Prepack <br>
Experimental: without loading the package, exit 0 when the release approval ph build --release wrote matches it, 1 when it does not, and 2 when it cannot be checked. For a "prepack" script, so npm publish stops too<br><br>
**usage:** `--prepack`<br>
**default**: `false`
#### Json <br>
Print exactly one JSON report on stdout and nothing else<br><br>
**usage:** `--json`<br>
**default**: `false`
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Model Inspect
Describe this package's document models without checking them: for each
model its digest and compatibility, and for each of its versions the source,
scopes, scalars and operations. With <documentType>@<version>, describe that
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
### arguments
#### Document Type Version <br>
Inspect one model version, such as acme/invoice@1 (default: every model)<br><br>
**usage:** `[documentType@version]`<br>


### flags
#### Json <br>
Print exactly one JSON report on stdout and nothing else<br><br>
**usage:** `--json`<br>
**default**: `false`
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Login

The login command authenticates you with Renown using your Ethereum wallet. This enables
the CLI to act on behalf of your Ethereum identity for authenticated operations.

This command:
1. Generates or loads a cryptographic identity (DID) for the CLI
2. Opens your browser to the Renown authentication page
3. You authorize the CLI's DID to act on behalf of your Ethereum address
4. Stores the login in your home folder (~/.ph/identities/renown), for every project
  
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


## Whoami

Show who acts here: your Renown login when you are logged in (`ph login`), else your
pseudonym, an Ethereum key made without a login and shown as "Anonymous" and a short
address. Reads files only; `--check` also asks Renown whether the login is still valid.
  
### flags
#### Json <br>
Print the identity as JSON<br><br>
**usage:** `--json`<br>

#### Check <br>
Ask Renown whether the login is still valid (network)<br><br>
**usage:** `--check`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


### options
#### Renown Url <br>
Renown server URL.<br><br>
**usage:** `--renown-url <str>`<br>
**env**: `PH_CONNECT_RENOWN_URL`<br>**default**: `https//www.renown.id`

## Logout

The logout command withdraws your Renown login at Renown and deletes it from this computer,
its key included. Your pseudonym acts again.
### options
#### Renown Url <br>
Renown server URL.<br><br>
**usage:** `--renown-url <str>`<br>
**env**: `PH_CONNECT_RENOWN_URL`<br>**default**: `https//www.renown.id`

### flags
#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Identity Password
Set, change or remove the password of your pseudonym, in the home folder and in every store it was copied into. Makes the pseudonym when there is none.
### flags
#### Remove <br>
Remove the password: the key is kept readable by your user only<br><br>
**usage:** `--remove`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Credentials List

List the credentials this store's host accepts by its own record (`.ph/credentials` in the
data folder): who, the session's label, who wrote it, its expiry and whether it verifies.
  
### options
#### Data Dir <br>
The store's data folder (default: PH_USER_DATA_DIR, else the project)<br><br>
**usage:** `--data-dir <str>`<br>


### flags
#### All <br>
Also list withdrawn credentials<br><br>
**usage:** `--all`<br>

#### Json <br>
Print the records as JSON<br><br>
**usage:** `--json`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


## Credentials Withdraw

Withdraw credential records by id prefix, address or label. A running host refuses a withdrawn
credential from its next request, and the withdrawal holds after a restart.
  
### arguments
#### Id Address Label *[required]*<br>
Records to withdraw: an id prefix, an address or a label<br><br>
**usage:** `[...id | address | label]`<br>


### flags
#### Expired <br>
Remove expired records and the tombstones of expired ones<br><br>
**usage:** `--expired`<br>

#### Debug <br>
Log arguments passed to this command<br><br>
**usage:** `--debug`<br>

#### Help <br>
show help<br><br>
**usage:** `--help, -h`<br>


### options
#### Data Dir <br>
The store's data folder (default: PH_USER_DATA_DIR, else the project)<br><br>
**usage:** `--data-dir <str>`<br>


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



