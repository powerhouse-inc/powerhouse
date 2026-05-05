# Gap Report: API References — Powerhouse CLI

**Date:** 2026-05-05
**Reviewed:** `apps/academy/docs/academy/04-APIReferences/00-PowerhouseCLI.md`
**Against:** `clis/ph-cmd`, `clis/ph-cli`
**Focus:** Every documented command, flag, and argument against actual CLI help output

---

## Findings

| #   | Urgency  | Type      | Doc location                                             | Source location                                                                                                                                                                                                                                   | Finding                                                                                                                                                       |
| --- | -------- | --------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `low`    | `missing` | No entry for `ph logout`                                 | `clis/ph-cli/src/commands/logout.ts` + `ph-cli-commands.ts:34`                                                                                                                                                                                    | `logout` is a registered top-level ph-cli command forwarded by ph-cmd. Takes no args. Completely absent from the doc.                                         |
| 2   | `medium` | `missing` | No entry for `ph code`                                   | `clis/ph-cli/src/commands/code.ts` + `ph-cli-commands.ts:21`                                                                                                                                                                                      | `code` opens a Powerhouse coding agent REPL (backed by Mastra), forwarded from ph-cmd. Wholly absent from docs.                                               |
| 3   | `medium` | `missing` | No entry for top-level `ph build`                        | `clis/ph-cli/src/commands/build.ts` + `ph-cli-commands.ts:22`                                                                                                                                                                                     | Standalone `ph build` command (builds project for registry publishing) exists and is forwarded from ph-cmd. Distinct from `ph connect build`. Not documented. |
| 4   | `high`   | `missing` | No entry for `ph publish`                                | `clis/ph-cli/src/commands/publish.ts` + `ph-cli-commands.ts:26`                                                                                                                                                                                   | `publish` publishes a package to the Powerhouse registry (wraps `npm publish`). Absent from docs.                                                             |
| 5   | `medium` | `missing` | No entry for `ph unpublish`                              | `clis/ph-cli/src/commands/unpublish.ts` + `ph-cli-commands.ts:27`                                                                                                                                                                                 | `unpublish` removes a package from the Powerhouse registry. Absent from docs.                                                                                 |
| 6   | `medium` | `wrong`   | `Login > Options > Renown Url`, default value (line 888) | `packages/shared/clis/constants.ts:40`                                                                                                                                                                                                            | Default is documented as `https//www.renown.id` — missing the colon. Actual default is `https://www.renown.id`.                                               |
| 7   | `low`    | `missing` | No aliases documented anywhere                           | `install.ts:13` (`aliases: ["add", "i"]`), `switchboard.ts:7` (`aliases: ["reactor"]`), `uninstall.ts` (`aliases: ["remove"]`), `inspect.ts` (`aliases: ["is"]`), `list.ts` (`aliases: ["l"]`), `generate-document-model.ts` (`aliases: ["doc"]`) | None of the six runtime aliases (`ph add`, `ph reactor`, `ph remove`, `ph is`, `ph l`, `ph doc`) are mentioned anywhere in the doc.                           |

---

## Verified clean

- `ph init` — all flags (`--name/-n`, `--package-manager/-p`, `--tag/-t`, `--version/-v`, `--remote-drive/-r`, `--npm`, `--pnpm`, `--yarn`, `--bun`, `--dev/-d`, `--staging/-s`, `--debug`, `--help/-h`) match `packages/shared/clis/args/init.ts`
- `ph use` — `[tag]`, `--tag/-t`, `--version/-v`, `--skip-install/-s`, `--debug`, `--help/-h` match `clis/ph-cmd/src/commands/use.ts`
- `ph update` — `--skip-install/-s`, `--debug`, `--help/-h` match `clis/ph-cmd/src/commands/update.ts`
- `ph setup-globals` — all flags match `clis/ph-cmd/src/commands/setup-globals.ts`
- `ph use-local` — monorepo path positional and all flags match `clis/ph-cmd/src/commands/use-local.ts`
- `ph generate` — all seven subcommands (`all`, `document-model`, `editor`, `app`, `processor`, `subgraph`, `migration-file`) present and verified
- `ph generate document-model` — `--file/-f`, `--dir/-d`, `--all/-a`, `--debug`, `--help/-h` match `generate-document-model.ts`
- `ph generate editor` — all flags match `generate-editor.ts`
- `ph generate app` — all flags including `--disable-drag-and-drop` match `generate-app.ts`
- `ph generate processor` — all flags, defaults for `--type` (analytics) and `--apps` (switchboard,connect) match `generate-processor.ts`
- `ph generate subgraph` — flags match `generate-subgraph.ts`
- `ph generate migration-file` — `--path/-p` (required), `--schema-file`, `--debug` match `generate-migration-file.ts`
- `ph vetra` — all options verified against `packages/shared/clis/args/vetra.ts`: switchboard-port, connect-port (default 3001), remote-drive, log-level, packages, local-package, default-drives-url, drive-preserve-strategy, watch-timeout, https-key-file, https-cert-file, remote-drives, and all boolean flags (watch, logs, disable-connect, interactive, ignore-local, force, host, open, cors, strictPort, print-urls, bind-cli-shortcuts, https, dev) — all correct
- `ph connect` — subcommands `studio`, `build`, `preview`; defaults to `studio` — matches `clis/ph-cli/src/commands/connect.ts`
- `ph connect studio` — port (default 3000) and all flags match `packages/shared/clis/args/connect.ts`
- `ph connect build` — `--outDir` (default `.ph/connect-build/dist/`) and flags match `connectBuildArgs`
- `ph connect preview` — port (default 4173), outDir, all flags match `connectPreviewArgs`
- `ph access-token` — `--expiry` (default `7d`), `--audience`, `--debug`, `--help/-h` match `packages/shared/clis/args/access-token.ts`
- `ph inspect` — `<package-name>` required positional, flags match `packages/shared/clis/args/inspect.ts`
- `ph list` — flags match `listArgs`
- `ph migrate` — `--version/-v` (default `latest`), flags match `packages/shared/clis/args/migrate.ts`
- `ph switchboard` — all flags verified against `packages/shared/clis/args/switchboard.ts`: https, dev, ignore-local, use-identity, require-identity, migrate, migrate-status, mcp (default true), use-vetra-drive (default false), https-key/cert-file, remote-drives, packages, port (default 4001), base-path, keypair-path, vetra-drive-id (default vetra), db-path — all correct
- `ph login` — `--renown-url`, `--timeout` (default 300), `--logout`, `--status`, `--show-did`, `--debug` match `packages/shared/clis/args/login.ts` (except finding #6)
- `ph install` — rest positionals, `--registry`, `--package-manager/-p`, `--local`, all package manager flags match `packages/shared/clis/args/install.ts`
- `ph uninstall` — rest positionals, `--package-manager/-p`, all package manager flags match `packages/shared/clis/args/uninstall.ts`
- Quick Reference table — all five entries exist with correct command names and example flags

---

## Could not verify

- `ph generate all --help` — source has `args: {}` (empty); `--help/-h` shown in doc is likely injected by `cmd-ts` at runtime, cannot confirm statically
- `ph install` and `PH_REGISTRY_URL` env var — mentioned in prose; no `env:` field in `installArgs`; cannot confirm statically

---

## Summary

**7 findings (1 wrong, 6 missing).** All documented commands that are covered are mechanically accurate — flags, types, defaults, and argument shapes are correct — except for a typo in the `ph login --renown-url` default. The main drift is structural: five ph-cli commands (`logout`, `code`, `build`, `publish`, `unpublish`) registered in source and forwarded through ph-cmd have zero documentation coverage, and none of the six runtime aliases (`ph add`, `ph reactor`, `ph remove`, `ph is`, `ph l`, `ph doc`) are mentioned anywhere.
