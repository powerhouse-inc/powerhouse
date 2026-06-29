## Gap Report: Reference — Powerhouse CLI

Reviewed: docs/academy/04-Reference/07-CLITooling (00-PowerhouseCLI.md, 06-VetraRemoteDrive.md)
Against: clis/ph-cmd, clis/ph-cli (command sources + `@powerhousedao/shared/clis/args` arg definitions)
Focus: Every documented command, flag, and argument against actual CLI help output, including Vetra remote drive commands

### Findings

| # | Urgency | Type | Doc location | Source location | Finding |
|---|---------|------|-------------|-----------------|---------|
| 1 | high | stale | `ph checkout --remote-drive` section (06-VetraRemoteDrive.md:41-63, also referenced at lines 138, 161) | `clis/ph-cli/src/commands/ph-cli-commands.ts:19-39`, `clis/ph-cmd/src/commands/ph.ts:24-31` | `ph checkout` is documented as a live command but is registered nowhere. ph-cli's `phCliCommands` map has no `checkout` entry and ph-cmd's `ph` subcommands has none. A `checkout.ts` exists only under `clis/ph-cmd/legacy/commands/checkout.ts` (not wired). Running `ph checkout` will fail. |
| 2 | medium | wrong | `--connect-port <port>` "(default: 3000)" (06-VetraRemoteDrive.md:106) | `packages/shared/clis/args/vetra.ts:28` + `packages/shared/clis/constants.ts:35` | Doc states the connect-port default is `3000`. Source default is `DEFAULT_VETRA_CONNECT_PORT = 3001`. (The auto-generated section at 00-PowerhouseCLI.md:428 correctly says `3001`.) |
| 3 | medium | missing | ph-cli Commands list (00-PowerhouseCLI.md:212-234) | `clis/ph-cli/src/commands/ph-cli-commands.ts:25-31` | `publish`, `unpublish`, `build`, `registry-login`, and `logout` are registered ph-cli commands but are not documented anywhere in the section (no heading, not in the command list). |
| 4 | medium | missing | "Connect" section / Connect subsections (00-PowerhouseCLI.md:506-738) | `clis/ph-cli/src/commands/connect.ts:71-81` | The Connect prose (line 507) says "Use with `studio`, `build`, `preview`, or `config`", and `connect config` is a real registered subcommand, but no "Connect Config" section is documented (only Studio, Build, Preview). |

### Verified clean

- `ph init` — arguments and all options/flags (`--name/-n`, `--package-manager/-p`, `--tag/-t`, `--version/-v`, `--remote-drive/-r`, `--clone`, `--npm/--pnpm/--yarn/--bun`, `--dev/-d`, `--staging/-s`, `--debug`) match `packages/shared/clis/args/init.ts:12-65`.
- `ph login` — options (`--renown-url` env `PH_CONNECT_RENOWN_URL`, `--timeout` default 300) and flags (`--logout`, `--status`, `--show-did`) match `packages/shared/clis/args/login.ts:5-37`.
- `ph vetra` — `--switchboard-port` (no fixed default in auto-gen; source resolves config port then `DEFAULT_SWITCHBOARD_PORT = 4001`), `--connect-port` default `3001`, `--remote-drive`, `--watch/-w`, `--logs`, `--disable-connect`, `--interactive`, `--drives-public-base`, `--db-path`, `--renown-namespace` all match `packages/shared/clis/args/vetra.ts:14-89`.
- 06-VetraRemoteDrive.md `--switchboard-port` "default: 4001" matches `DEFAULT_SWITCHBOARD_PORT = 4001` (`packages/shared/clis/constants.ts:45`).
- ph-cmd command set — `init`, `use`, `update`, `setup-globals`, `use-local` match `clis/ph-cmd/src/commands/ph.ts:24-31`; the Quick Reference table (00-PowerhouseCLI.md:23-29) lists exactly these.
- `ph vetra` and `ph init --remote-drive` exist as documented (vetra registered in `ph-cli-commands.ts:27`; init `--remote-drive` in `init.ts:52-57`).
- Connect Studio / Build / Preview / Config commands are all registered in `clis/ph-cli/src/commands/connect.ts` (8, 30, 55, 71).

### Could not verify

- 06-VetraRemoteDrive.md "How it works" behavioral claims (e.g. `ph init --remote-drive` writes `vetra.driveId`/`driveUrl` into powerhouse.config.json, validates the URL, checks for an existing GitHub URL; `ph vetra --watch` creates a "Vetra Preview" drive) — these are runtime behaviors not statically verifiable from the command/arg definitions read here.
- Default values that resolve dynamically from project config (e.g. `ph vetra --switchboard-port` falling back to `reactor.port`) — cannot confirm rendered help output without running the CLI.
- The auto-generated block in 00-PowerhouseCLI.md (lines 19-1091) is machine-emitted from the same arg definitions; spot-checks (init, login, vetra) matched, but a flag-by-flag audit of every option default in every command was not exhaustively performed within the token budget.

### Summary

4 findings (1 stale, 1 wrong, 2 missing). The auto-generated `00-PowerhouseCLI.md` block tracks the source well; the drift is concentrated in the hand-written `06-VetraRemoteDrive.md` (a documented `ph checkout` command that does not exist, and a wrong `--connect-port` default) plus several ph-cli commands and the `connect config` subcommand that are registered but undocumented.
