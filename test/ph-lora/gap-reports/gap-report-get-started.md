## Gap Report: Get Started

Reviewed: docs/academy/01-GetStarted (00-VetraStudio.md, 01-VetraCloud.md)
Against: clis/ph-cmd, clis/ph-cli, packages/vetra (CLI args resolved via packages/shared/clis/args)
Focus: CLI commands (ph init, ph install, ph add, ph generate and its subcommands), package install steps, Vetra Studio setup, generated project structure

### Findings

| # | Urgency | Type | Doc location | Source location | Finding |
|---|---------|------|-------------|-----------------|---------|
| — | — | — | — | — | No mechanical drift found within the checkFocus scope. |

This section contains essentially no mechanical surface to drift against. Both docs are conceptual/UI walkthroughs of Vetra Studio and Vetra Cloud. The only mapped-scope CLI command in the entire section is a single `ph-cli connect build` invocation (00-VetraStudio.md:248), and it verified clean. No `ph init`, `ph install`, `ph add`, or `ph generate` commands appear in either file, so those parts of the checkFocus have nothing to check.

### Verified clean

- `ph-cli connect build` (00-VetraStudio.md:248-251) — `connect` subcommand is registered in `clis/ph-cli/src/commands/index.ts:4`, and the `build` subcommand exists in `clis/ph-cli/src/commands/connect.ts:30,94-103`. Command name and existence match source.
- `--outDir` flag on `connect build` (00-VetraStudio.md:249) — defined in `connectBuildArgs` at `packages/shared/clis/args/connect.ts:192-199` (`long: "outDir"`). Matches.
- `--default-drives-url` flag on `connect build` (00-VetraStudio.md:250) — `connectBuildArgs` spreads `...commonArgs` (`packages/shared/clis/args/connect.ts:208`), and `commonArgs` includes `defaultDrivesUrl` with `long: "default-drives-url"` (`packages/shared/clis/args/common.ts:157-162, 208`). Flag is valid on this command. Matches.
- No documented CLI command in scope references a non-existent `ph`/`ph-cli` command (grep over both files returned only the single `ph-cli connect build` line).

### Could not verify

Within the checkFocus scope but not statically verifiable from the mapped packages (these reference vetra-cli/vetra-app internal dev tooling and runtime services, which live outside `clis/ph-cmd`, `clis/ph-cli`, and `packages/vetra`):

- `pnpm dev -i` / `pnpm start -i` and the `--workdir ../../vetra-test` default (00-VetraStudio.md:223-229) — vetra-cli package scripts, not in mapped source.
- `pnpm --filter vetra-app build` and `pnpm --filter vetra-app exec ph-cli connect build` rebuild workflow (00-VetraStudio.md:244-251) — depends on a `vetra-app` workspace package not in the mapped sourceFiles.
- Service port table (27370 / 59220 / 5180 / 8090) and `connect-server.js`, `connect-drive-url` hook (00-VetraStudio.md:222-268) — runtime/deployment config of vetra-cli, not in mapped source.
- Diagnostic `curl` endpoints (`/healthz`, `/resolve`, `/start`, `/events`, GraphQL) (00-VetraStudio.md:272-289) — runtime preview-server API, requires a running service.
- Agent tool names (`spec-create`, `reactor-project-init`, `spec-preview-show`, `mastra_workspace_*`, etc.) (00-VetraStudio.md:88-92, 148-155) — Vetra agent runtime tool surface, not exported names in the mapped packages.
- Vetra Studio / Vetra Cloud UI flow, subdomains (`vetra-agent.<slug>.vetra.io`, `connect.<slug>.vetra.io`, `switchboard.<slug>.vetra.io/graphql`), service tiers, version pinning, and registry package install via the web UI (01-VetraCloud.md entirely) — hosted-product behaviour, requires runtime/UI verification.
- Registry package names `@powerhousedao/builder-profile`, `@powerhousedao/contributor-billing`, `@powerhousedao/knowledge-note`, `@arbitrum/arbgrants` (01-VetraCloud.md:80-83) — external registry contents, not verifiable from this monorepo.

### Summary

0 findings (0 stale, 0 missing, 0 wrong). The Get Started section is mechanically clean within scope: its single in-scope CLI command (`ph-cli connect build` with `--outDir` and `--default-drives-url`) matches source exactly, and the rest of the section is conceptual Vetra Studio/Cloud UI documentation with no static CLI/export surface to drift against.
