# Gap Report: Mastery Track — Builder Environment

**Date:** 2026-05-11
**Reviewed:** `docs/academy/02-MasteryTrack/01-BuilderEnvironment` (4 files)
**Against:** `clis/ph-cmd`, `packages/vetra`
**Focus:** Vetra Studio setup steps, CLI prerequisites, ph-cmd version requirements

---

## Findings

| #   | Urgency | Type  | Doc location                                                                                                                                                                                                | Source location                                                                                                                               | Finding                                                                                                                                                                                                                                                        |
| --- | ------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | high    | stale | `02-VetraStudio.md:127` — `ph checkout --remote-drive <url>`                                                                                                                                                | `clis/ph-cmd/src/commands/ph.ts`, `clis/ph-cli/src/commands/ph-cli-commands.ts`                                                               | `ph checkout` does not exist in either ph-cmd or ph-cli. Command list for both CLIs is exhaustive and contains no `checkout` entry.                                                                                                                            |
| 2   | high    | stale | `01-Prerequisites.md:308`, `03-CreateAPackageWithVetra.md:70`, `BuilderTools.md:53` — `ph use prod`                                                                                                         | `clis/ph-cmd/src/commands/use.ts:22-27` — `oneOf(["latest", "staging", "dev"])`                                                               | `"prod"` is not a valid tag value. Source accepts only `"latest"`, `"staging"`, or `"dev"`. All three tables describe `ph use prod` as the production switch, but the correct command is `ph use latest`.                                                      |
| 3   | high    | wrong | `03-CreateAPackageWithVetra.md:310` — `ph generate --editor YourModelName --document-types powerhouse/YourModelName`; `BuilderTools.md:264` — `ph generate --editor <name> --document-types <documenttype>` | `clis/ph-cli/src/commands/generate-editor.ts:5-15`                                                                                            | Two errors in the same example: (a) `editor` is a subcommand, not a `--editor` flag; (b) the flag is `--document-type` (singular), not `--document-types`. Correct syntax: `ph generate editor --name YourModelName --document-type powerhouse/YourModelName`. |
| 4   | medium  | wrong | `01-Prerequisites.md:306`, `03-CreateAPackageWithVetra.md:68`, `BuilderTools.md:51` — `ph use` described as "Switch all dependencies to latest production versions"                                         | `clis/ph-cmd/src/commands/use.ts:59-63` — `if (!tag && !version) throw new Error("Please specify either a release tag or a version to use.")` | `ph use` with no arguments throws an error. It does not default to any version. Three tables imply it works as a standalone command.                                                                                                                           |
| 5   | medium  | wrong | `BuilderTools.md:139-142` — `ph use local /path/to/local/packages`                                                                                                                                          | `clis/ph-cmd/src/commands/use.ts:22` — `oneOf(["latest", "staging", "dev"])`; `clis/ph-cmd/src/commands/use-local.ts:12`                      | `"local"` is not a valid value for `ph use`. Local monorepo linking is a separate command: `ph use-local /path/to/local/packages` (`use-local.ts`).                                                                                                            |
| 6   | medium  | stale | `BuilderTools.md:265` — `ph generate --drive-editor <name>`                                                                                                                                                 | `clis/ph-cli/src/commands/generate.ts:13-21`                                                                                                  | No `drive-editor` subcommand exists. Generate subcommands are: `all`, `document-model`, `editor`, `app`, `processor`, `subgraph`, `migration-file`.                                                                                                            |
| 7   | medium  | wrong | `BuilderTools.md:290` — `ph generate --processor-type analytics`                                                                                                                                            | `clis/ph-cli/src/commands/generate-processor.ts:49-54` — `--type` flag on the `processor` subcommand                                          | `--processor-type` is not a flag on the top-level `generate` command. Correct syntax: `ph generate processor --type analytics`.                                                                                                                                |
| 8   | medium  | wrong | `03-CreateAPackageWithVetra.md:272` — `ph generate YourModelName.phdm.zip` (bare positional)                                                                                                                | `clis/ph-cli/src/commands/generate-document-model.ts:9-13` — `--file` option, no positional                                                   | The `.phdm.zip` path is not a positional argument; it must be passed as `ph generate document-model --file YourModelName.phdm.zip`. A bare positional would be parsed as a subcommand name and fail.                                                           |

---

## Verified clean

- **`pnpm install -g ph-cmd` / `npm install -g ph-cmd`** — package name `ph-cmd` confirmed in `package.json`.
- **Node.js 24 prerequisite** — matches `"engines": { "node": ">=24.0.0" }` in `clis/ph-cmd/package.json`.
- **`ph init --dev` / `ph init --staging`** — both flags exist in `packages/shared/clis/args/init.ts` (`dev` long flag, `staging` long flag).
- **`ph init --remote-drive <url>`** — `remoteDrive` option confirmed in `initArgs` (long: `"remote-drive"`, short: `"r"`).
- **`ph vetra --watch`** — `watch` flag confirmed in `packages/shared/clis/args/vetra.ts:40`.
- **`ph vetra --interactive`** — `interactive` flag confirmed in `vetraArgs:65`.
- **`ph use latest` / `ph use dev` / `ph use staging`** — all three are valid values per `oneOf(["latest", "staging", "dev"])` in `use.ts:22`.
- **`ph switchboard` / `ph reactor`** — `switchboard` command exists in ph-cli; `reactor` is a confirmed alias in `packages/shared/clis/args/help.ts:105`.
- **`ph use-local <path>`** — `use-local.ts` confirms this as a standalone command taking a monorepo path positional.
- **`pnpm install -g ph-cmd@dev` / `@staging` dist-tags** — standard npm dist-tag format; no static drift possible here.

---

## Could not verify

- **`sudo apt install nodejs` installs Node 24** (`01-Prerequisites.md:149`) — the Ubuntu/Debian apt package version depends on the distro release; this is a runtime concern.
- **`ph generate processor --type analytics` as the corrected full syntax** — `--type` flag confirmed in source (`generate-processor.ts:49`), but whether additional required flags exist is a runtime concern.

---

## Summary

8 findings (2 stale, 4 wrong, 2 wrong-syntax). The section has significant CLI command drift: `ph checkout` is entirely absent from the CLI, `ph use prod` is a renamed command (`latest`), and three code-generator examples use the old flat-flag style (`--editor`, `--drive-editor`, `--processor-type`) rather than the current subcommand style. The prerequisites themselves (Node 24, package names, install commands) are accurate.
