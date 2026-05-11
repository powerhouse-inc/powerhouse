# Gap Report: Get Started

**Date:** 2026-05-11
**Reviewed:** `apps/academy/docs/academy/01-GetStarted`
**Against:** `clis/ph-cmd`, `clis/ph-cli`, `packages/vetra`
**Focus:** CLI commands (ph init, ph install, ph add), package install steps, generated project structure

---

## Findings

| #   | Urgency | Type    | Doc location                           | Source location                                                                        | Finding                                                                                                                                                                                                                                                    |
| --- | ------- | ------- | -------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | medium  | missing | —                                      | `clis/ph-cli/src/commands/install.ts:5-7`, `packages/shared/clis/args/help.ts:122-128` | `ph install` (and alias `ph add`) exist in ph-cli and are re-exported as help commands in ph-cmd via `phCliHelpCommands`, but neither command is mentioned anywhere in the 5 get-started files. The checkFocus explicitly names both as required coverage. |
| 2   | low     | wrong   | `05-BuildToDoListEditor.md:24`         | `clis/ph-cli/src/commands/generate-editor.ts:5`                                        | Collapsed tutorial box says `ph generate --editor`; source defines `editor` as a subcommand of `generate` — correct syntax is `ph generate editor` (no `--` prefix).                                                                                       |
| 3   | low     | wrong   | `02-DefineToDoListDocumentModel.md:22` | `clis/ph-cli/src/commands/generate-document-model.ts:9-13`                             | Collapsed tutorial box says `ph generate TodoList.phdm.zip` (bare positional); source requires `ph generate document-model --file <path>` — no positional file argument exists.                                                                            |

> Note on findings 2 & 3: these involve `ph generate`, which is outside the checkFocus scope. They are included because the examples would fail verbatim if copy-pasted, and both appear in the get-started files. Treat them as low-priority observations rather than primary findings.

---

## Verified clean

- **`ph init`** — command exists in both `clis/ph-cmd/src/commands/init.ts` and `clis/ph-cli/src/commands/init.ts`. Interactive name prompt is consistent with `namePositional` being an optional positional arg in `packages/shared/clis/args/init.ts:13`.
- **`ph vetra --watch`** — `vetra` command exists in `clis/ph-cli/src/commands/vetra.ts`; `--watch` flag confirmed at `packages/shared/clis/args/vetra.ts:40-48`.
- **Package name `ph-cmd`** — confirmed as the npm package name in ph-cmd's `package.json`. Both `pnpm install -g ph-cmd` and `npm install -g ph-cmd` documented in `01-CreateNewPowerhouseProject.md:23` are correct.
- **Node.js 24 prerequisite** — `01-CreateNewPowerhouseProject.md:24` says "Node.js 24"; `ph-cmd/package.json` confirms `"engines": { "node": ">=24.0.0" }`.
- **`ph add` as alias** — source at `clis/ph-cli/src/commands/install.ts:7` and `packages/shared/clis/args/help.ts:124` confirms `aliases: ["add", "i"]` on the install command.

---

## Could not verify

- **Generated project structure** (`02-DefineToDoListDocumentModel.md:156-173`) — the documented `document-models/todo-list/` tree (gen/, src/, schema.graphql, etc.) requires running the actual codegen against a `.phdm.zip` to confirm file names and nesting match current output.
- **`ph init` terminal output** (`Initialized empty Git repository…` / `The installation is done!`) — runtime strings, not statically verifiable.
- **`npm install -g ph-cmd --legacy-peer-deps`** — the `--legacy-peer-deps` flag requirement cannot be confirmed statically; it depends on the npm version and peer dep graph at install time.

---

## Summary

3 findings (0 stale, 1 missing, 2 wrong). The section is in solid shape overall — core commands `ph init` and `ph vetra --watch` are accurate. The primary gap within scope is that `ph install` / `ph add` are entirely absent from the tutorial despite being in the checkFocus. The two `wrong` findings are both in collapsed reference boxes and involve `ph generate` syntax errors that would cause copy-paste failures.
