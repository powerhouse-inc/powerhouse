# Design: boolean config entries in powerhouse.manifest.json (#3012)

Status: proposed 2026-11-10.

## Problem

`powerhouse.manifest.json` declares the environment variables a package needs under `config`, so a
host (e.g. the Vetra hosting UI) can show them to the operator. `type` accepts only `"var"` and
`"secret"`. A toggle such as `AUTH_ENABLED` has to be a `var` with `"true" or "false"` in its
description, and the operator gets a free-text field.

Writing `type: "boolean"` breaks `ph generate`: codegen parses the manifest with `ManifestSchema`
and fails with `config.0.type: Invalid input`, which does not name the accepted values. No page
documents the `config` block.

Since the issue was filed, `16d5656ad9` changed `default` from boolean to string, "spelled as the
env var would be", meaningful for `var` only. Nothing in the monorepo reads `default`.

## Decisions

### 1. Schema (`packages/shared/document-model/schemas.ts`)

- `ConfigEntryTypeSchema` accepts `"var"`, `"secret"` and `"boolean"`. A wrong value fails with
  `type must be one of "var", "secret", "boolean"`.
- `ConfigEntryType` and `ConfigEntry` in `types.ts` follow through `z.infer`; no hand-written
  type changes.
- `default` stays `string`, spelled as the env var would be:
  - `boolean`: only `"true"` or `"false"`. Anything else fails on the `default` path with
    `default must be "true" or "false" for a boolean entry`.
  - `var`: any string, unchanged.
  - `secret`: still accepted, so no existing manifest breaks; documented as ignored by hosts.

### 2. Codegen

`createOrUpdateManifest` (`packages/codegen/src/file-builders/manifest.ts`) already validates with
`ManifestSchema.parse`, so `ph generate` reports the new messages without code changes there.

### 3. Documentation

A new Academy page, `apps/academy/docs/academy/04-Reference/07-CLITooling/01-PackageManifest.md`,
documents the `config` block: the entry fields (`name`, `type`, `description`, `required`,
`default`), the three types and how a host is expected to render each (`var` free text, `secret`
masked, `boolean` a toggle that writes `"true"`/`"false"`), and that `ph generate` validates the
block. The rest of the manifest is out of scope for this page.

## Testing

Test first.

- `packages/shared/document-model/config-entry-schema.test.ts` (vitest, next to the schema as the
  package does elsewhere): `boolean` with `default: "false"` parses; `type: "toggle"`
  fails with the list of accepted values; a boolean entry with `default: "yes"` fails on the
  `default` path; existing `var` and `secret` entries (with and without `default`) still parse.
- `test/codegen/tests/generate-manifest.test.ts`: a boolean entry survives create and update of
  the manifest; an invalid `type` makes `createOrUpdateManifest` throw with the accepted values.
- `packages/shared` is rebuilt (`pnpm build`) before running codegen's tests, which read its
  `dist/`.

## Out of scope

- The hosting UI that renders the entries (separate repository).
- How the Switchboard parses its own env vars (`=== "true"` stays).

## Repositories

| Repo | Path | Changes | Merge order |
|---|---|---|---|
| powerhouse | /home/froid/projects/powerhouse | schema, tests, Academy page | 1 |
