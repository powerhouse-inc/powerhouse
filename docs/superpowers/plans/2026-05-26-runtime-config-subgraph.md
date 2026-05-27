# Runtime Config Subgraph — Monorepo Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Certify that the three monorepo-side contracts the new `vetra-cloud-runtime-config` subgraph relies on (`DEFAULT_CONNECT_CONFIG`, `runtimeConfigSchema`, `PH_CONNECT_CONFIG_JSON` entrypoint semantics) are stable on `feat/connect-config-json-2`, and persist the contract description so future contributors don't break it accidentally.

**Architecture:** Documentation-only change in this repo. The subgraph itself lives in `vetra-cloud-package`. This plan is the monorepo-side paper trail (spec + plan + commit) that captures the contracts. No source code edits.

**Tech Stack:** Markdown only. Existing TS exports verified via `pnpm test` on `packages/shared` and `packages/builder-tools`.

---

## File Structure

**Created:**
- `docs/superpowers/specs/2026-05-26-runtime-config-subgraph-design.md` — contract spec (already written; see Task 1 verification)
- `docs/superpowers/plans/2026-05-26-runtime-config-subgraph.md` — this file

**Modified:**
- `RUNTIME-CONFIG-SUBGRAPH-PLAN.md` — updated for post-#2645 reality (already done before this plan; see Task 0)

**Not modified:**
- Any source code under `packages/shared/connect/`
- Any source code under `packages/builder-tools/connect-utils/`
- `docker/connect-entrypoint.sh`

---

## Task 0: Master plan update (already complete)

**Files:**
- Modify: `RUNTIME-CONFIG-SUBGRAPH-PLAN.md`

The original draft was written against pre-#2645 entrypoint mechanics (flat `PH_CONNECT_*` env vars). The master plan has been rewritten to reflect the single `PH_CONNECT_CONFIG_JSON` env var contract.

- [x] **Step 1: Rewrite `RUNTIME-CONFIG-SUBGRAPH-PLAN.md` for the post-#2645 reality** — done as the prerequisite to writing this plan; the file at repo root now describes a JSON-document-in-one-row design.

---

## Task 1: Contract spec written

**Files:**
- Create: `docs/superpowers/specs/2026-05-26-runtime-config-subgraph-design.md`

- [x] **Step 1: Write the contract spec** — names the three monorepo contracts (`DEFAULT_CONNECT_CONFIG`, `runtimeConfigSchema`, `PH_CONNECT_CONFIG_JSON` entrypoint behavior), tells future contributors how to change them safely, and explicitly disclaims source-code changes for this work.

---

## Task 2: Verify `DEFAULT_CONNECT_CONFIG` export contract

**Files:**
- Inspect: `packages/shared/connect/runtime-config.ts`
- Inspect: `packages/shared/connect/index.ts`
- Inspect: `packages/shared/package.json` (`exports`)

- [ ] **Step 1: Confirm the symbol is exported.**

```bash
grep -n "DEFAULT_CONNECT_CONFIG" packages/shared/connect/runtime-config.ts packages/shared/connect/index.ts
```

Expected: `export const DEFAULT_CONNECT_CONFIG` in `runtime-config.ts`; re-exported from `index.ts` via `export * from "./runtime-config.js"`.

- [ ] **Step 2: Confirm the `@powerhousedao/shared/connect` subpath export resolves.**

```bash
node -e 'console.log(Object.keys(require("./packages/shared/package.json").exports))' | grep -E "(^\.$|/connect)"
```

Expected: `"./connect"` subpath present, mapping to `./connect/index.ts` (source) and `./dist/connect/index.js` (import).

- [ ] **Step 3: Confirm the shape includes every key the subgraph's default-merge will reach.**

Top-level keys expected on `DEFAULT_CONNECT_CONFIG`: `branding`, `app`, `packages`, `drives`, `renown`, `sentry`. Verify by reading `runtime-config.ts`.

---

## Task 3: Verify `runtimeConfigSchema` export contract

**Files:**
- Inspect: `packages/builder-tools/connect-utils/runtime-config-schema.ts`
- Inspect: `packages/builder-tools/index.mts`
- Inspect: `packages/builder-tools/package.json` (`exports`)

- [ ] **Step 1: Confirm the symbol is exported.**

```bash
grep -n "export const runtimeConfigSchema\|export const RUNTIME_CONFIG_SCHEMA" packages/builder-tools/connect-utils/runtime-config-schema.ts
```

Expected three exports: `runtimeConfigSchema`, `RUNTIME_CONFIG_SCHEMA_ID`, `RUNTIME_CONFIG_SCHEMA_URL`.

- [ ] **Step 2: Confirm re-export chain.**

```bash
grep -n "connect-utils" packages/builder-tools/index.mts packages/builder-tools/connect-utils/index.ts 2>/dev/null
```

Expected: `index.mts` re-exports `connect-utils/index.js`; `connect-utils/index.ts` re-exports `runtime-config-schema.js`.

- [ ] **Step 3: Confirm the JSON Schema file on disk matches the TS export.**

```bash
ls -la packages/builder-tools/connect-utils/runtime-config.schema.json
```

Expected: file exists, non-empty.

---

## Task 4: Verify entrypoint contract still holds

**Files:**
- Run: `packages/shared/connect/entrypoint-seed.test.ts`

- [ ] **Step 1: Run the entrypoint integration test.**

```bash
pnpm --filter @powerhousedao/shared test -- entrypoint-seed
```

Expected: all seven test cases pass, including:
- "deep-merges a full PH_CONNECT_CONFIG_JSON into a clean file"
- "does NOT overwrite values the file already has (set-if-absent)"
- "ignores legacy per-field env vars (PH_CONNECT_RENOWN_URL, PH_CONNECT_DISABLE_*) — they are no longer wired"

If the legacy-env-vars test fails, someone re-introduced flat env var handling — the subgraph design must change before landing.

---

## Task 5: Commit the docs

- [ ] **Step 1: Stage the new docs.**

```bash
git add RUNTIME-CONFIG-SUBGRAPH-PLAN.md \
        docs/superpowers/specs/2026-05-26-runtime-config-subgraph-design.md \
        docs/superpowers/plans/2026-05-26-runtime-config-subgraph.md
```

- [ ] **Step 2: Commit.**

```bash
git commit -m "docs(runtime-config): document subgraph contract & update master plan for #2645"
```

Single-line message per user convention.

- [ ] **Step 3: Verify clean tree.**

```bash
git status
```

Expected: clean.

---

## Verification gate

Before declaring done:

- [ ] All Task 2 / 3 / 4 checks passed.
- [ ] `pnpm --filter @powerhousedao/shared test` is green.
- [ ] `pnpm --filter @powerhousedao/builder-tools test` is green.
- [ ] Branch is still `feat/connect-config-json-2`; no merge to main.

If a verification step fails, **stop**. The subgraph plan in `vetra-cloud-package` depends on these contracts; if they're broken on this branch, that work cannot proceed.
