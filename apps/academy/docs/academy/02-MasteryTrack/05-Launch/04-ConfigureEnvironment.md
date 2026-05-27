# Configure your environment

After successfully setting up your server and installing the Powerhouse services using the `ph service setup` command as described in the [Setup Environment](./03-SetupEnvironment.md) guide, the next crucial step is to configure your environment.

Powerhouse Connect reads its runtime configuration from **`powerhouse.config.json`**. Editing that file (or using the `ph connect config` CLI) is the recommended way to tune Connect's behavior — drives, renown integration, packages, log level, base path, and so on. Environment variables remain available as a legacy / CI mechanism for seeding the same fields at build time, but the JSON file is the source of truth at runtime.

This guide walks you through the configuration model and shows you how to set values via JSON, the CLI, or env vars.

## Where the configuration lives

A scaffolded Powerhouse project ships with `powerhouse.config.json` at the project root. Connect-specific settings live under the `connect` key:

```json
{
  "$schema": "https://raw.githubusercontent.com/powerhouse-inc/powerhouse/main/packages/shared/clis/source-config.schema.json",
  "documentModelsDir": "./document-models",
  "editorsDir": "./editors",
  "studio": { "port": 3000 },
  "reactor": { "port": 4001 },
  "packages": [],
  "connect": {
    "app": {
      "basePath": "/",
      "logLevel": "info"
    },
    "packages": {
      "externalEnabled": true
    },
    "drives": {
      "allowAddDrive": true,
      "defaultDrives": [],
      "sections": {
        "remote": { "enabled": true, "allowAdd": true, "allowDelete": true },
        "local": { "enabled": true, "allowAdd": true, "allowDelete": true }
      }
    },
    "renown": {
      "url": "https://www.renown.id",
      "networkId": "eip155",
      "chainId": 1
    }
  }
}
```

The dist served by `ph connect build` deep-merges the project file with the schema defaults, so missing fields fall back automatically.

## Precedence

When the dist `powerhouse.config.json` is built, values resolve in this order (lowest to highest):

1. **Schema defaults** (`DEFAULT_CONNECT_CONFIG`) — always present.
2. **Env-var seeds** — set-if-absent; only fill fields the source file does not specify (see [Build-time env-var seeds](#build-time-env-var-seeds) below for the list).
3. **`powerhouse.config.json` (project root)** — the operator's source of truth.
4. **`ph connect build --json`** — bulk override; applied last and beats source + seeds.
5. **`ph connect build --<flag>`** — individual flag overrides; applied above `--json` for the fields they cover.

At runtime Connect always reads the resulting dist file as-is — it does not consult `process.env` for any field in the runtime schema.

## Editing the JSON

### Manually

Open `powerhouse.config.json` in any editor and edit the `connect.*` block. Save, then rebuild and restart:

```bash
ph connect build
ph service restart
```

### Via `ph connect config`

The CLI provides flag-based read/write access to every `connect.*` field. The same flag set works on `ph connect build` and `ph connect config` — pick whichever fits your workflow (build-time vs. live edit on a deployed dist).

```bash
# Show the effective connect.* block (list mode)
ph connect config

# Read a single value
ph connect config --get connect.renown.url

# Set a single value
ph connect config --renown-url "https://renown.staging.example"
ph connect config --renown-chain-id 137
ph connect config --allow-add-drive false

# Bulk update via JSON patch (for fields outside the flag set or multi-field changes)
ph connect config --json '{"renown":{"url":"https://x"},"drives":{"sections":{"remote":{"enabled":false}}}}'
```

Writes are dual-target: the source `powerhouse.config.json` is updated (next build picks it up) and, if the dist file exists, it is patched as well (the currently-served SPA picks up the change on its next refresh). Invalid types fail loudly before any write; `--json` payloads are additionally Ajv-validated against the runtime schema.

Mutually exclusive: `--get`, `--json`, and any field flag can't be combined in one call — pick exactly one mode per invocation.

### At build time via flags

`ph connect build` accepts the same field flags (and `--json`) to bake values into the dist:

```bash
ph connect build \
  --renown-url https://renown.staging.example \
  --renown-chain-id 137 \
  --allow-add-drive false \
  --remote-drives-enabled true \
  --app-name "My Connect"
```

```bash
ph connect build --json '{"renown":{"url":"https://x"},"drives":{"allowAddDrive":false}}'
```

Overrides apply at dist-emit time and are baked into the dist file — operators see the resulting values when the container boots.

### Full flag matrix

Every `connect.*` field has a dedicated flag. Both `ph connect config` and `ph connect build` accept the same set.

| `connect.*` JSON path                        | Flag                           | Type                                         |
| -------------------------------------------- | ------------------------------ | -------------------------------------------- |
| `connect.app.basePath`                       | `--base`                       | string                                       |
| `connect.app.logLevel`                       | `--log-level`                  | `debug \| info \| warn \| error`             |
| `connect.packages.externalEnabled`           | `--external-packages`          | boolean                                      |
| `connect.packages.registryUrl`               | `--packages-registry`          | string                                       |
| `connect.branding.appName`                   | `--app-name`                   | string                                       |
| `connect.branding.homeBackground`            | `--home-background`            | string (pass `""` to set `null`)             |
| `connect.drives.allowAddDrive`               | `--allow-add-drive`            | boolean                                      |
| `connect.drives.defaultDrives`               | `--default-drives-url`         | comma-list → array of `{url, name, icon}`    |
| `connect.drives.preserveStrategy`            | `--drive-preserve-strategy`    | `preserve-all \| preserve-by-url-and-detach` |
| `connect.drives.sections.remote.enabled`     | `--remote-drives-enabled`      | boolean                                      |
| `connect.drives.sections.remote.allowAdd`    | `--remote-drives-allow-add`    | boolean                                      |
| `connect.drives.sections.remote.allowDelete` | `--remote-drives-allow-delete` | boolean                                      |
| `connect.drives.sections.local.enabled`      | `--local-drives-enabled`       | boolean                                      |
| `connect.drives.sections.local.allowAdd`     | `--local-drives-allow-add`     | boolean                                      |
| `connect.drives.sections.local.allowDelete`  | `--local-drives-allow-delete`  | boolean                                      |
| `connect.renown.url`                         | `--renown-url`                 | string                                       |
| `connect.renown.networkId`                   | `--renown-network-id`          | string                                       |
| `connect.renown.chainId`                     | `--renown-chain-id`            | number                                       |
| _(bulk, any subset of fields)_               | `--json '{...}'`               | partial `connect.*` JSON blob                |

Plus `ph connect config --get <connect.path>` to read a single value, `ph connect config --dist-dir <path>` to point at a non-default dist location (overrides `PH_CONNECT_OUTDIR`).

## Configuring Connect's runtime values

Connect's runtime configuration (everything under `connect.*` in
`powerhouse.config.json` — branding, drives, renown, app, packages) is set
from one of three sources, in increasing precedence:

1. **The source file `powerhouse.config.json`** (project root) — hand-edited
   or generated by `ph init`.
2. **`ph connect config --<field>`** — dual-writes the value into the source
   file _and_ the running dist file, so the SPA picks it up on the next
   refresh without a rebuild.
3. **`ph connect build --<field>` / `--json`** — applies as a CLI override
   for the build, written into the emitted dist file.

Environment variables are **not** a source for Connect's runtime config. The
table above lists each `connect.*` field together with its CLI flag.

### Docker deployments

When deploying Connect's Docker image, the entrypoint can still translate a
few operator-supplied env vars into edits to the dist `powerhouse.config.json`
at container start (set-if-absent). This is purely an operator-time
convenience — the SPA itself never reads env vars at runtime — and is
documented in the [Docker Deployment guide](./05-DockerDeployment).

## Variables that stay as env vars

The following are **not** runtime-config fields. They remain ordinary env vars because they are secrets, build-stamped metadata, or container-shape concerns:

```bash
# Sentry (secrets / per-deploy)
PH_SENTRY_AUTH_TOKEN=""
PH_SENTRY_ORG=""
PH_SENTRY_PROJECT=""
PH_CONNECT_SENTRY_DSN=""
PH_CONNECT_SENTRY_ENV="prod"
PH_CONNECT_SENTRY_TRACING_ENABLED="false"
PH_CONNECT_SENTRY_RELEASE=""

# Build-stamped metadata
PH_CONNECT_VERSION="..."        # baked into the bundle at build time
PH_CONNECT_CLI_VERSION="..."    # baked into the bundle at build time

# Container shape
PORT=3001
```

## Configuring authorization (Switchboard)

A critical aspect of your environment configuration is setting up authorization to control who can access your services and what they can do. As detailed in our dedicated [Switchboard Authorization](/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization) guide, you can manage access using authentication, supreme admin access, and document protection.

Authorization is a **Switchboard** concern, not Connect. The same `powerhouse.config.json` carries both:

```json
{
  "switchboard": {
    "auth": {
      "enabled": true,
      "admins": ["0x123...", "0x456..."]
    }
  }
}
```

Or via env vars:

```bash
AUTH_ENABLED=true
ADMINS="0x123...,0x456..."
DEFAULT_PROTECTION=true
DOCUMENT_PERMISSIONS_ENABLED=true
```

For a complete understanding of how authorization (authentication, admin access, and document protection) works, please refer to the full [Authorization guide](/academy/MasteryTrack/BuildingUserExperiences/Authorization/Authorization).

## Applying your changes

Regardless of which method you use to update your configuration, the changes will not be applied until the service that consumes them restarts (or, in the case of the running SPA, the page is refreshed and re-fetches `/powerhouse.config.json`).

```bash
ph service restart
```

This stops and restarts Connect and Switchboard so they pick up the new configuration. You can check the status with `ph service status`.

## Summary

Configure Connect via `powerhouse.config.json` — edit the file directly, use `ph connect config <key> <value>`, or pass `--flag` / `--json` overrides to `ph connect build`. Env vars stay supported as build-time seeds for CI / docker workflows but are no longer the recommended interface. Secrets, build metadata, and container shape (sentry tokens, version stamps, `PORT`) remain as ordinary env vars.
