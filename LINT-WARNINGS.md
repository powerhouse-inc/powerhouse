# ESLint warning inventory & batch-fix plan

> Generated from `pnpm lint` (`pnpm -r --workspace-concurrency=1 lint`) on 2026-05-29.
> Fixes are being applied batch-by-batch on branch `chore/lint-warning-cleanup`. See **Progress** below.

## Progress

| Batch | Rule | Count | Status |
|------:|------|------:|--------|
| 1 | stale `eslint-disable` directives | 34 | ✅ Done |
| 2 | `no-useless-assignment` | 7 | ✅ Done |
| 3 | `no-duplicate-type-constituents` + `preserve-caught-error` | 2 | ✅ Done |
| 4 | `restrict-template-expressions` | 6 | ✅ Done |
| 5 | `no-base-to-string` | 8 | ✅ Done |
| 6 | `no-empty-object-type` | 15 | ✅ Done |
| 7 | `no-unused-vars` | 120 | ✅ Done |
| 8 | `require-await` | 43 / 123 | ◑ Partial — 43 desynced (typecheck-verified); 80 contract-bound left |
| 9 | `no-misused-promises` | 35 | ✅ Done |
| 10 | `no-floating-promises` | 18 | ✅ Done |
| 11 | `no-unnecessary-condition` | 200 | 🚫 Left for owners — per-file type triage |
| 12 | `react-hooks/*` | 13 / 38 | ◑ Partial — 13 loop-safe `useCallback`/`useMemo` fixed; 25 `useEffect` left |

**Current: 303 / 609 fixed (50%), 306 warnings, 0 errors.** All fixes verified: `pnpm lint` → 306 warnings / **0 errors**, `pnpm typecheck` → **0 errors** (the cycle blocker was also fixed). Batches 1–7, 9, 10 complete; batch 8 partial (43/123 — safely-removable `async`, typecheck-verified); batch 12 partial (13/38 — loop-safe hook-dep fixes). Remaining (~306): 80 contract-bound `require-await`, `no-unnecessary-condition` (200), 25 `useEffect`-dep `react-hooks` — all need per-file judgment (rationale below).

## Typecheck unblocked ✅

`pnpm typecheck` (`tsc --build`) was failing on a pre-existing circular project-reference error (`TS6202`): `@powerhousedao/shared` ⇄ `document-model`. Root cause: the commit before this work added a `document-model` *devDependency* to `shared` (so a new `document-drive` test could resolve it at runtime), and `update-ts-references` mirrored that into a `shared → document-model` project reference — but `document-model` is a thin re-export of `@powerhousedao/shared/document-model`, so the reference closed a cycle.

**Fix (durable):**
- Removed the `document-model` devDependency from `packages/shared/package.json` (a package shouldn't depend on a package that re-exports itself) and synced `pnpm-lock.yaml`.
- Removed the now-unneeded `references` entry from `packages/shared/tsconfig.json`; imports of `"document-model"` inside `shared` already resolve to its own `./document-model` via the existing `paths` mapping.
- Added a `resolve.alias` in `packages/shared/vitest.config.ts` so the document-drive tests resolve `document-model` to the local source at runtime (40/40 tests pass).

**Result:** `pnpm typecheck` → **0 errors**, `pnpm check-ts-references` → clean, `pnpm lint` → 417 warnings / 0 errors. This also **validates every type-level change in batches 1–7** (the `Record<string,never>`, `T extends object`, dead-code removals, etc.) against a full clean build.

With `tsc` restored, the Promise-handling batches **9 (`no-misused-promises`) and 10 (`no-floating-promises`) were completed** (validated with `pnpm typecheck` + `pnpm lint`, both clean). The remaining three batches are **left for code owners** — after investigation they are intentional, contract-bound, or behavior-changing, and not safe as mechanical sweeps:

- **`require-await` (80 left after fixing 43) — remaining are contract-bound.** A typecheck-gated pass removed `async` from the 43 safely-removable sites (test lifecycle callbacks, standalone helpers); `pnpm typecheck` confirmed zero contract breaks. The 80 left are intentional: of the 29 *source* sites, nearly all are `async` methods implementing interfaces that declare `Promise<T>` returns — `package-storage` `get`/`getAll`/`set`/`delete`/`has`, GraphQL resolvers `metrics`/`currencies`/`getCurrencies`, node-accessor `getNode`/`listChildren`/`getDescendants`, `getMigrations`, `routeAndGenerate`, `init`. Removing `async` breaks the `implements` contract (a `tsc` error). The remaining 94 are in tests — mostly typed mock implementations (`mockResolvedValue(async () => new Response(...))`) and async helpers that must keep their Promise signatures, or `it(...)` callbacks where desyncing is pure churn. The repo's own config comment ("we have a lot of functions which lie about whether they are async") sets this rule to `warn` precisely to tolerate them. **Recommendation: leave.**
- **`no-unnecessary-condition` (200) — per-file type triage.** These often mean a *type is too narrow/wide*, not that the guard is dead. `tsc` will not catch the dangerous case: deleting a guard that protects a runtime null the (incorrect) types claim can't happen hides a real bug. Each needs a human to decide "fix the type" vs "delete the guard," ideally with the relevant tests green.
- **`react-hooks/*` (25 left after fixing 13) — remaining are `useEffect`/loop-risk.** The 13 fixed were all `useCallback`/`useMemo` dep fixes (stable `dispatch`/setter additions + two "unnecessary dependency" removals) — these can't cause re-render loops (worst case is less memoization), and typecheck stayed clean. The 25 left are `useEffect` missing-deps (adding a dep the effect itself mutates can loop), "the X array/function makes deps change every render" cases (need the *intermediate* wrapped in `useMemo` — a real refactor), CodeMirror editor effects (re-init risk), and a ref-cleanup pattern. These need runtime validation, not just lint/typecheck.

**Recommended path for the remainder:** work per-file with `pnpm typecheck` + the relevant test suite green after each package. They are *not* safe as bulk find-and-replace. The per-rule sections below list every affected file as a starting point.

## Config improvements made along the way

While fixing the safe batches, three ESLint-config gaps were corrected (all in `eslint.config.js` unless noted):
- **`no-unused-vars`** now honours the documented `^_` "intentionally unused" convention (`args/vars/caughtErrors/destructuredArray` ignore patterns) — the comment claimed this but the options were missing.
- **`no-empty-object-type`** now allows `interface A extends B {}` (`allowInterfaces: "with-single-extends"`) — a legitimate pattern with no type-alias equivalent for global declaration merging.
- **Generated files** (`**/gen/**`): added a `generatedFilesConfig` block turning off `reportUnusedDisableDirectives` and `no-empty-object-type` (graphql-codegen output legitimately uses both), mirrored into `test/versioned-documents/eslint.config.js` along with `no-unsafe-*` off for its generated reducers.
- **Vendored scratch folder** `packages/analytics-engine/browser/backup/` added to the ignore list.

## Headline numbers

- **Started at 609 warnings, 0 errors. Now: 306 warnings, 0 errors** — **303 fixed (50%)** across batches 1–10 + the safe subsets of 8 (`require-await`) and 12 (`react-hooks`).
- Also unblocked `pnpm typecheck` (`tsc --build`), which was failing on a pre-existing `TS6202` cycle (see "Typecheck unblocked" above). Both `pnpm lint` and `pnpm typecheck` are now green.
- The remaining ~306 (80 contract-bound `require-await`, `no-unnecessary-condition` 200, 25 `useEffect`-dep `react-hooks`) are left for code owners — intentional / contract-bound / runtime-behavior-changing, per the rationale above.
- `eslint --fix` reports **0** auto-fixable warnings in a dry run (checked on the two heaviest packages, `reactor-api` and `connect`). Every warning needs a manual or semi-automated edit. The lone exception is stale `eslint-disable` directives, which `--fix` removes (verify on a sample).
- **3 rules account for 446 / 609 (73%)**: `no-unnecessary-condition`, `require-await`, `no-unused-vars`.

## Warnings by rule

| # | Rule | Count | Files | Auto-fix | Batchable? |
|--:|------|------:|------:|----------|------------|
| 1 | `@typescript-eslint/no-unnecessary-condition` | 200 | 84 | No (manual) | Per-file (triage) |
| 2 | `@typescript-eslint/require-await` | 126 | 49 | No (manual) | High |
| 3 | `@typescript-eslint/no-unused-vars` | 120 | 66 | No (manual) | High |
| 4 | `react-hooks/exhaustive-deps` | 36 | 24 | No (manual) | Low (case-by-case) |
| 5 | `@typescript-eslint/no-misused-promises` | 35 | 29 | No (manual) | High (one idiom) |
| 6 | `(unused-eslint-disable-directive)` | 34 | 12 | Yes (`eslint --fix`)* | High (do first) |
| 7 | `@typescript-eslint/no-floating-promises` | 18 | 15 | No (manual) | Medium |
| 8 | `@typescript-eslint/no-empty-object-type` | 15 | 12 | No (manual) | Medium |
| 9 | `@typescript-eslint/no-base-to-string` | 8 | 5 | No (manual) | Medium |
| 10 | `no-useless-assignment` | 7 | 7 | No (manual) | High |
| 11 | `@typescript-eslint/restrict-template-expressions` | 6 | 2 | No (manual) | High |
| 12 | `react-hooks/incompatible-library` | 2 | 2 | No (manual) | No |
| 13 | `@typescript-eslint/no-duplicate-type-constituents` | 1 | 1 | No (manual) | One-off |
| 14 | `preserve-caught-error` | 1 | 1 | No (manual) | One-off |

\* `eslint --fix` removes unused-disable directives, but the dry-run JSON does not flag them as `fixableWarningCount`; confirm on a sample before a bulk pass.

## Warnings by package

| Package | Warnings |
|---------|---------:|
| `packages/reactor-api` | 132 |
| `packages/vetra` | 96 |
| `apps/connect` | 71 |
| `packages/analytics-engine` | 69 |
| `packages/design-system` | 63 |
| `packages/reactor-browser` | 43 |
| `packages/powerhouse-vetra-packages` | 31 |
| `packages/document-model` | 23 |
| `packages/reactor-mcp` | 19 |
| `apps/switchboard` | 15 |
| `packages/codegen` | 13 |
| `packages/switchboard-gui` | 7 |
| `packages/renown` | 7 |
| `clis/ph-cli` | 5 |
| `test/versioned-documents` | 4 |
| `test/e2e-utils` | 3 |
| `packages/common` | 3 |
| `clis/ph-cmd` | 2 |
| `packages/builder-tools` | 2 |
| `packages/pglite-fs` | 1 |

## Cross-cutting notes (read before fixing)

These cut across every rule and change *how* you should batch:

- **163 / 609 warnings (27%) are in test files** (`*.test.*`, `*.spec.*`, `/test/`). Most of the `require-await` (async test arrows with no `await`) and many `no-unused-vars` live here. Test fixes are low-risk and can be done in one sweep per package, separately from production code — consider doing tests and `src` as distinct PRs.
- **~19 warnings are in generated code** (`**/gen/**`, generated `graphql.ts`). Hand-editing these is pointless — they regenerate. Two real options: (a) fix the **codegen templates** so future output is clean, or (b) add the generated paths to the relevant package's ESLint `ignores`. Most of the stale `eslint-disable` directives in `vetra` are generated reducer files (`document-models/**/gen/reducer.ts`).
- **No warning is `eslint --fix`-safe** except stale disable directives. Budget for manual review on everything else.
- **Type-driven rules need type judgment.** `no-unnecessary-condition` and `no-empty-object-type` frequently signal that a *type is wrong* (too narrow / too wide), not that the code is wrong. Deleting the guard can hide a real bug. Triage each cluster.

## Suggested batches

Ordered by recommended execution sequence (safest / highest-confidence first).

### Batch 1: `(unused-eslint-disable-directive)` — 34 warning(s), 12 file(s) — ✅ DONE

**What it means.** An `// eslint-disable[-next-line]` comment that no longer suppresses anything — the underlying problem is gone.

**How it was fixed.**
- **Non-generated files** (connect: `InspectorModal.tsx`, `useDbExplorer.ts`, `openpanel.test.tsx`; reactor-api: `adapter-http-express.ts`) — removed the stale directives via `eslint --fix`, then tidied the blank lines it left behind where standalone directive comments were deleted.
- **Generated reducers** (`**/gen/reducer.ts` in vetra + versioned-documents) — these carried `no-unsafe-member-access` / `no-unsafe-argument` directives, but those rules are globally **off** for `**/gen/*.ts`, so the directives were dead everywhere. Removed them at the source: the codegen template `packages/codegen/src/templates/document-model/gen/reducer.ts`, plus the 7 already-checked-in generated files.
- **Generated zod schemas** (`**/gen/schema/zod.ts`) — these carry `no-empty-object-type` / `no-unused-vars` directives emitted unconditionally by `packages/codegen/src/codegen/graphql.ts`. Those rules *are* active for gen files, so the directives are load-bearing for complex schemas and only coincidentally unused in simple ones. Rather than touch the template (which would surface warnings elsewhere), disabled `reportUnusedDisableDirectives` for `**/gen/**` files in both the root `eslint.config.js` and `test/versioned-documents/eslint.config.js`.

Packages: `apps/connect` (20), `packages/vetra` (11), `test/versioned-documents` (2), `packages/reactor-api` (1)

Examples:

```
packages/reactor-api/src/graphql/gateway/adapter-http-express.ts:43:5
packages/vetra/document-models/app-module/v1/gen/reducer.ts:1:1
packages/vetra/document-models/app-module/v1/gen/reducer.ts:2:1
packages/vetra/document-models/document-editor/v1/gen/reducer.ts:1:1
```

<details><summary>All affected files</summary>

- `apps/connect/src/components/modal/modals/InspectorModal/InspectorModal.tsx` (1)
- `apps/connect/src/components/modal/modals/InspectorModal/useDbExplorer.ts` (18)
- `apps/connect/src/components/openpanel.test.tsx` (1)
- `packages/reactor-api/src/graphql/gateway/adapter-http-express.ts` (1)
- `packages/vetra/document-models/app-module/v1/gen/reducer.ts` (2)
- `packages/vetra/document-models/document-editor/v1/gen/reducer.ts` (2)
- `packages/vetra/document-models/processor-module/v1/gen/reducer.ts` (2)
- `packages/vetra/document-models/subgraph-module/v1/gen/reducer.ts` (2)
- `packages/vetra/document-models/vetra-package/v1/gen/reducer.ts` (2)
- `packages/vetra/document-models/vetra-package/v1/gen/schema/zod.ts` (1)
- `test/versioned-documents/document-models/todo/v1/gen/schema/zod.ts` (1)
- `test/versioned-documents/document-models/todo/v2/gen/schema/zod.ts` (1)

</details>

### Batch 2: `no-useless-assignment` — 7 warning(s), 7 file(s) — ✅ DONE

**What it means.** A value is assigned to a variable that is overwritten or never read before going out of scope.

**How it was fixed.** Every case was a `let x = <init>` whose initializer is provably dead because all subsequent paths reassign before the first read:
- 3× sort comparators in design-system (`processors-inspector`, `queue-inspector`, `mailbox-table`): `let comparison = 0;` → `let comparison: number;` (the `switch` has `default: return 0`, so every fall-through case assigns).
- 2× CLI prompts (`ph-cli` `publish.ts`, `resolve-switchboard-port.ts`): `let confirmed = false;` → `let confirmed: boolean;` (try + catch both assign).
- `analytics-engine` `processor.ts`: `let json = null;` → `let json;` (catch `continue`s).
- `document-model` `split.test.ts`: `let commonOperationsShuffled = [];` → `let commonOperationsShuffled;` (if/else both assign).

Packages: `packages/design-system` (3), `clis/ph-cli` (2), `packages/document-model` (1), `packages/analytics-engine` (1)

Examples:

```
packages/document-model/test/document-helpers/split.test.ts:102:9
packages/analytics-engine/benchmarks/src/processor.ts:20:7
packages/design-system/src/connect/components/processors-inspector/processors-inspector.tsx:62:9
packages/design-system/src/connect/components/queue-inspector/queue-inspector.tsx:67:9
```

<details><summary>All affected files</summary>

- `clis/ph-cli/src/commands/publish.ts` (1)
- `clis/ph-cli/src/utils/resolve-switchboard-port.ts` (1)
- `packages/analytics-engine/benchmarks/src/processor.ts` (1)
- `packages/design-system/src/connect/components/processors-inspector/processors-inspector.tsx` (1)
- `packages/design-system/src/connect/components/queue-inspector/queue-inspector.tsx` (1)
- `packages/design-system/src/connect/components/remotes-inspector/components/mailbox-table.tsx` (1)
- `packages/document-model/test/document-helpers/split.test.ts` (1)

</details>

### Batch 3: `no-duplicate-type-constituents` + `preserve-caught-error` — 2 warning(s) — ✅ DONE

**How it was fixed.**
- `preserve-caught-error` (`reactor-api` `postgres-test-db.ts`): a re-thrown `new Error(...)` dropped the caught error → added `{ cause: err }` as the second arg.
- `no-duplicate-type-constituents` (`analytics-engine/browser/backup/index.d.ts`): the duplicate (`(SQLiteCompatibleType | number[]) | null`) is in a **vendored scratch folder** (`backup/`, sitting next to multi-MB `.sql` dumps), not maintained source. Rather than edit vendored typings, added `packages/analytics-engine/browser/backup/` to the root ESLint ignore list.

Packages: `packages/analytics-engine` (1)

Examples:

```
packages/analytics-engine/browser/backup/index.d.ts:829:13
```

<details><summary>All affected files</summary>

- `packages/analytics-engine/browser/backup/index.d.ts` (1)

</details>

### Batch 4: `@typescript-eslint/restrict-template-expressions` — 6 warning(s), 2 file(s) — ✅ DONE

**What it means.** A non-string (number, object, `any`) is interpolated into a template literal without explicit conversion.

**How it was fixed.** Both occurrences were identical copies of `deepEquals` (in `analytics-engine/benchmarks/src/query-list.ts` and `compat/src/query-list.ts`) interpolating `any` array values `a`/`b` into "Mismatch" error messages. Wrapped each with `JSON.stringify(...)` (more informative than `String()` for arrays); the `.length` interpolations are numbers and allowed by config (`allowNumber: true`).

Packages: `packages/analytics-engine` (6)

Examples:

```
packages/analytics-engine/benchmarks/src/query-list.ts:75:36
packages/analytics-engine/benchmarks/src/query-list.ts:80:22
packages/analytics-engine/benchmarks/src/query-list.ts:80:50
packages/analytics-engine/compat/src/query-list.ts:71:36
```

<details><summary>All affected files</summary>

- `packages/analytics-engine/benchmarks/src/query-list.ts` (3)
- `packages/analytics-engine/compat/src/query-list.ts` (3)

</details>

### Batch 5: `@typescript-eslint/no-base-to-string` — 8 warning(s), 5 file(s) — ✅ DONE

**What it means.** A value whose type has no meaningful `toString()` is being stringified, yielding `[object Object]`.

**How it was fixed.**
- `document-model/src/logger.ts` — the object fallback (after `JSON.stringify` throws on a circular ref) now uses `Object.prototype.toString.call(value)` (explicit base tag, no warning); the final primitive fallback is cast to `number | boolean | bigint | symbol` so the rule knows it's a primitive.
- `renown/test/renown.test.ts` (3×) + `reactor-browser/test/renown/components.test.tsx` (1×) — all stringified a `fetch` input (`string | URL | Request`). Added a shared local `requestUrl()` helper that handles each case (`Request` → `.url`) instead of `String(input)`, which also fixes the latent `[object Request]` bug.
- `connect/src/components/app.tsx` — preload-error handler only ever needs an `Error.message` or a string payload to regex for a URL, so it now returns `""` for non-string/non-Error payloads instead of `String(payload)`.
- `ph-cli/src/utils/db-error-hint.ts` — non-`Error` causes are now `typeof current === "string" ? current : JSON.stringify(current)` instead of `String(current)`.

Packages: `packages/renown` (3), `packages/document-model` (2), `packages/reactor-browser` (1), `apps/connect` (1), `clis/ph-cli` (1)

Examples:

```
packages/document-model/src/logger.ts:23:21
packages/document-model/src/logger.ts:31:17
packages/renown/test/renown.test.ts:107:68
packages/renown/test/renown.test.ts:245:43
```

<details><summary>All affected files</summary>

- `apps/connect/src/components/app.tsx` (1)
- `clis/ph-cli/src/utils/db-error-hint.ts` (1)
- `packages/document-model/src/logger.ts` (2)
- `packages/reactor-browser/test/renown/components.test.tsx` (1)
- `packages/renown/test/renown.test.ts` (3)

</details>

### Batch 6: `@typescript-eslint/no-empty-object-type` — 15 warning(s), 12 file(s) — ✅ DONE

**What it means.** Use of the `{}` type (or an empty interface), which accepts any non-nullish value — almost never intended.

**How it was fixed.** Split three ways by intent:
- **6 single-extends interfaces** (`IConnectCrypto`, `ConnectSidebarHeaderProps`, `WindowEventMap` augmentation, `InputProps`, `TextareaProps`, `VetraPackageGlobalState`) — `interface A extends B {}` is a legitimate pattern (named aliases, prop types, and **global declaration merging**, which has no type-alias equivalent). Enabled `allowInterfaces: "with-single-extends"` on the rule in `eslint.config.js` rather than rewriting them.
- **2 in generated `gen/graphql.ts`** (`type definedNonNullAny = {}`, `Requester<C = {}>`) — graphql-codegen output; turned `no-empty-object-type` **off** for `**/gen/**` in `generatedFilesConfig`.
- **7 literal `{}` in hand-written code** — fixed per intent: `document-model/test/helpers.ts` ×3 `input: {}` → `Record<string, never>`; `KnexAnalyticsStore` `T extends {}` → `T extends object`; `select.tsx` + `fixedForwardRef.ts` `P = {}` → `P = Record<string, never>`; `renown/types.ts` empty issuer param → `Record<string, never>`.

Packages: `packages/document-model` (3), `packages/design-system` (3), `packages/renown` (2), `packages/reactor-api` (2), `packages/powerhouse-vetra-packages` (2), `packages/analytics-engine` (1), `packages/reactor-browser` (1), `packages/vetra` (1)

Examples:

```
packages/document-model/test/helpers.ts:91:68
packages/document-model/test/helpers.ts:92:68
packages/document-model/test/helpers.ts:93:60
packages/analytics-engine/knex/src/KnexAnalyticsStore.ts:40:21
```

<details><summary>All affected files</summary>

- `packages/analytics-engine/knex/src/KnexAnalyticsStore.ts` (1)
- `packages/design-system/src/connect/components/select/select.tsx` (1)
- `packages/design-system/src/connect/components/sidebar/sidebar-header.tsx` (1)
- `packages/design-system/src/utils/fixedForwardRef.ts` (1)
- `packages/document-model/test/helpers.ts` (3)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/input.tsx` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/text-area.tsx` (1)
- `packages/reactor-api/src/graphql/reactor/gen/graphql.ts` (2)
- `packages/reactor-browser/src/types/global.ts` (1)
- `packages/renown/src/crypto/types.ts` (1)
- `packages/renown/src/types.ts` (1)
- `packages/vetra/processors/vetra-read-model/processor.ts` (1)

</details>

### Batch 7: `@typescript-eslint/no-unused-vars` — 120 warning(s), 66 file(s) — ✅ DONE

**What it means.** A variable, import, parameter, or caught error is declared but never read.

**How it was fixed.**
- **Config gap fixed first.** The config comment said "we use `_` as a placeholder for unused variables," but the rule had no ignore pattern, so `_`-prefixed names were still flagged (17 of the 120). Added `argsIgnorePattern`/`varsIgnorePattern`/`caughtErrorsIgnorePattern`/`destructuredArrayIgnorePattern: "^_"` to honour the documented convention — this cleared those 17 and made `_`-prefixing a valid fix for the rest.
- **Remaining 103 fixed across the codebase** (parallelized over 5 agents by package): unused imports removed; dead side-effect-free locals removed; unused params / caught errors / destructured bindings prefixed with `_`. No runtime behavior changed.
- **Follow-on cleanup.** The `^_` ignore made a few existing `// eslint-disable …no-unused-vars` directives redundant (reactor `*-signature.unit.test.ts`, reactor-attachments transport, connect `openpanel-traits.ts`) — removed those too.
- **Side effect caught & fixed:** removing the `no-unsafe-*` directives from versioned-documents' generated reducers in Batch 1 had surfaced 21 *errors* there (that package's standalone config keeps `no-unsafe-*` as errors with no gen-file exemption). Mirrored the root config by turning those rules off for `**/gen/**` in `test/versioned-documents/eslint.config.js`.

Packages: `packages/vetra` (29), `packages/analytics-engine` (23), `packages/design-system` (14), `packages/reactor-api` (13), `packages/reactor-browser` (12), `packages/document-model` (7), `apps/connect` (7), `packages/codegen` (3), `packages/reactor-mcp` (3), `packages/powerhouse-vetra-packages` (3), `apps/switchboard` (2), `clis/ph-cli` (2), `packages/builder-tools` (1), `test/versioned-documents` (1)

Examples:

```
packages/document-model/node.mts:120:3
packages/document-model/test/document/crypto.test.ts:70:7
packages/document-model/test/document/crypto.test.ts:71:7
packages/document-model/test/document/crypto.test.ts:195:7
```

<details><summary>All affected files</summary>

- `apps/connect/cypress.config.ts` (2)
- `apps/connect/src/components/document-editor-container.tsx` (2)
- `apps/connect/src/hooks/useInitSentry.ts` (1)
- `apps/connect/src/services/openpanel/factory.ts` (1)
- `apps/connect/src/store/user.ts` (1)
- `apps/switchboard/src/utils.mts` (2)
- `clis/ph-cli/src/commands/list.ts` (1)
- `clis/ph-cli/src/services/connect-preview.ts` (1)
- `packages/analytics-engine/browser/src/PgLiteExecutor.ts` (1)
- `packages/analytics-engine/browser/test/utils.ts` (1)
- `packages/analytics-engine/compat/src/query-list.ts` (2)
- `packages/analytics-engine/core/src/AnalyticsDiscretizer.ts` (2)
- `packages/analytics-engine/core/src/AnalyticsProfiler.ts` (1)
- `packages/analytics-engine/core/src/AnalyticsQueryEngine.ts` (1)
- `packages/analytics-engine/core/test/Subscriptions.test.ts` (5)
- `packages/analytics-engine/graphql/src/AnalyticsResolvers.ts` (10)
- `packages/builder-tools/connect-utils/helpers.ts` (1)
- `packages/codegen/src/name-builders/get-variable-names.ts` (2)
- `packages/codegen/src/templates/document-model/gen/modules/operations.ts` (1)
- `packages/design-system/scripts/create-icon-components.ts` (1)
- `packages/design-system/src/connect/components/db-explorer/db-explorer.tsx` (1)
- `packages/design-system/src/connect/components/document-toolbar/document-toolbar.stories.tsx` (1)
- `packages/design-system/src/connect/components/drop-zone/drop-zone.tsx` (2)
- `packages/design-system/src/connect/components/editor-action-buttons/editor-action-buttons.tsx` (1)
- `packages/design-system/src/connect/components/form/inputs/drive-app.tsx` (1)
- `packages/design-system/src/connect/components/modal/replace-duplicate-modal.tsx` (1)
- `packages/design-system/src/connect/components/sidebar/sidebar-item.tsx` (1)
- `packages/design-system/src/connect/components/tabs/tab-content.tsx` (1)
- `packages/design-system/src/connect/components/tabs/tabs.tsx` (1)
- `packages/design-system/src/powerhouse/components/sidebar/sidebar.tsx` (1)
- `packages/design-system/src/ui/components/with-field-validation/with-field-validation.tsx` (2)
- `packages/document-model/node.mts` (1)
- `packages/document-model/test/document/crypto.test.ts` (4)
- `packages/document-model/test/document/operation-id.test.ts` (1)
- `packages/document-model/test/helpers.ts` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/text-field.tsx` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/context/schema-context.tsx` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/utils/helpers.ts` (1)
- `packages/reactor-api/src/graphql/gateway/adapter-gateway-apollo.ts` (1)
- `packages/reactor-api/src/graphql/gateway/adapter-gateway-mercurius.ts` (3)
- `packages/reactor-api/src/graphql/reactor/adapters.ts` (1)
- `packages/reactor-api/src/packages/util.ts` (1)
- `packages/reactor-api/src/services/authorization.service.ts` (1)
- `packages/reactor-api/test/gateway/adapter-gateway-apollo.test.ts` (2)
- `packages/reactor-api/test/push-backfill.test.ts` (2)
- `packages/reactor-api/test/reactor-adapters.test.ts` (1)
- `packages/reactor-api/test/router.test.ts` (1)
- `packages/reactor-browser/src/actions/document.ts` (2)
- `packages/reactor-browser/src/analytics/context.tsx` (2)
- `packages/reactor-browser/src/analytics/hooks/analytics-query.ts` (1)
- `packages/reactor-browser/src/graphql/fetchers.ts` (1)
- `packages/reactor-browser/src/graphql/gen/schema.ts` (3)
- `packages/reactor-browser/src/hooks/connection-state.ts` (1)
- `packages/reactor-browser/src/relational/hooks/useRelationalQuery.ts` (1)
- `packages/reactor-browser/test/getSwitchboardUrl.test.tsx` (1)
- `packages/reactor-mcp/src/server.ts` (2)
- `packages/reactor-mcp/src/tools/reactor.ts` (1)
- `packages/vetra/document-models/app-module/v1/src/reducers/base-operations.ts` (5)
- `packages/vetra/document-models/app-module/v1/src/reducers/dnd-operations.ts` (1)
- `packages/vetra/document-models/document-editor/v1/src/reducers/base-operations.ts` (4)
- `packages/vetra/document-models/processor-module/v1/src/reducers/base-operations.ts` (5)
- `packages/vetra/document-models/subgraph-module/v1/src/reducers/base-operations.ts` (2)
- `packages/vetra/document-models/vetra-package/v1/src/reducers/base-operations.ts` (10)
- `packages/vetra/processors/codegen/document-handlers/generators/constants.ts` (1)
- `packages/vetra/processors/vetra-read-model/factory.ts` (1)
- `test/versioned-documents/document-models/todo/upgrades/v2.ts` (1)

</details>

### Batch 8: `@typescript-eslint/require-await` — 126 warning(s), 49 file(s)

**What it means.** A function is declared `async` but contains no `await`. The `async` keyword does nothing beyond wrapping the return in a Promise.

**How to fix.** Manual but very mechanical. Either remove `async` (if callers do not rely on a Promise return) or add the missing `await`. For interface-conforming methods (handlers that must return a Promise), keep `async` and disable per-line or refactor.

**Batching.** Batch by package, then by whether the async signature is contractually required. Big clusters in reactor-api (60) and test files — test mocks/handlers can usually just drop `async`.

Packages: `packages/reactor-api` (60), `packages/powerhouse-vetra-packages` (12), `apps/switchboard` (12), `packages/document-model` (9), `packages/analytics-engine` (8), `apps/connect` (7), `packages/vetra` (6), `packages/reactor-browser` (4), `packages/reactor-mcp` (4), `packages/codegen` (1), `packages/renown` (1), `clis/ph-cmd` (1), `packages/design-system` (1)

Examples:

```
packages/document-model/node.mts:112:49
packages/document-model/test/document/crypto.test.ts:69:5
packages/document-model/test/document/local.test.ts:25:47
packages/document-model/test/document/local.test.ts:63:59
```

<details><summary>All affected files</summary>

- `apps/connect/pglite.worker.legacy.ts` (1)
- `apps/connect/pglite.worker.ts` (1)
- `apps/connect/src/components/modal/modals-container.tsx` (1)
- `apps/connect/src/components/modal/modals/InspectorModal/useProcessorsInspector.ts` (1)
- `apps/connect/src/components/modal/modals/InspectorModal/useQueueInspector.ts` (2)
- `apps/connect/src/services/openpanel/processor.ts` (1)
- `apps/switchboard/test/attachments/auth.test.ts` (8)
- `apps/switchboard/test/attachments/index.test.ts` (2)
- `apps/switchboard/test/attachments/service-config.test.ts` (2)
- `clis/ph-cmd/scripts/generate-docs-legacy.ts` (1)
- `packages/analytics-engine/browser/src/BrowserAnalyticsStore.ts` (1)
- `packages/analytics-engine/browser/test/BrowserAnalyticsStore.test.ts` (1)
- `packages/analytics-engine/browser/test/Integration.test.ts` (1)
- `packages/analytics-engine/core/src/AnalyticsQueryEngine.ts` (2)
- `packages/analytics-engine/graphql/src/AnalyticsModel.ts` (1)
- `packages/analytics-engine/graphql/src/AnalyticsResolvers.ts` (2)
- `packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts` (1)
- `packages/design-system/src/connect/components/search-bar/search-bar.test.tsx` (1)
- `packages/document-model/node.mts` (1)
- `packages/document-model/test/document/crypto.test.ts` (1)
- `packages/document-model/test/document/local.test.ts` (7)
- `packages/powerhouse-vetra-packages/document-models/document-model/test/prune.test.ts` (5)
- `packages/powerhouse-vetra-packages/document-models/document-model/test/reducer.test.ts` (7)
- `packages/reactor-api/scripts/convert-hub-dump.ts` (4)
- `packages/reactor-api/src/migrations/index.ts` (1)
- `packages/reactor-api/src/packages/util.ts` (1)
- `packages/reactor-api/src/services/package-storage.ts` (5)
- `packages/reactor-api/test/auth-chain.test.ts` (2)
- `packages/reactor-api/test/document-model-subgraph-permissions.test.ts` (1)
- `packages/reactor-api/test/document-permission.service.test.ts` (2)
- `packages/reactor-api/test/drive-middleware.test.ts` (1)
- `packages/reactor-api/test/drive-ownership-cache.test.ts` (4)
- `packages/reactor-api/test/gateway/adapter-gateway-apollo.test.ts` (4)
- `packages/reactor-api/test/gateway/adapter-gateway-mercurius.test.ts` (1)
- `packages/reactor-api/test/gateway/gateway-adapter-contract.ts` (4)
- `packages/reactor-api/test/gateway/http-adapter-contract.ts` (6)
- `packages/reactor-api/test/graphql-manager.test.ts` (7)
- `packages/reactor-api/test/permissions-integration.test.ts` (9)
- `packages/reactor-api/test/reactor-subgraph-permissions.test.ts` (7)
- `packages/reactor-api/test/subscriptions.test.ts` (1)
- `packages/reactor-browser/test/drop.test.ts` (1)
- `packages/reactor-browser/test/file-drag-and-drop.test.ts` (2)
- `packages/reactor-browser/test/renown/components.test.tsx` (1)
- `packages/reactor-mcp/src/mcp-routes.ts` (1)
- `packages/reactor-mcp/src/tools/reactor.ts` (1)
- `packages/reactor-mcp/test/setup-mcp-server.test.ts` (2)
- `packages/renown/test/renown.test.ts` (1)
- `packages/vetra/processors/codegen/__tests__/factory.test.ts` (5)
- `packages/vetra/processors/codegen/document-handlers/document-codegen-manager.ts` (1)

</details>

### Batch 9: `@typescript-eslint/no-misused-promises` — 35 warning(s), 29 file(s)

**What it means.** A Promise-returning function is passed where a void return is expected (e.g. a JSX event handler `onClick={async ...}`) or a Promise is used in a boolean position.

**How to fix.** Manual. For event handlers: wrap in a non-async arrow that voids the promise, or use a `void` wrapper. Consistent idiom across the codebase recommended.

**Batching.** Batch by the JSX-handler pattern (most of the 35). Concentrated in connect (12) and design-system (9). Pick one wrapper idiom and apply uniformly.

Packages: `apps/connect` (12), `packages/design-system` (9), `packages/reactor-api` (4), `packages/analytics-engine` (3), `packages/powerhouse-vetra-packages` (3), `packages/switchboard-gui` (2), `packages/vetra` (1), `apps/switchboard` (1)

Examples:

```
packages/switchboard-gui/src/components/tokens/token-form.tsx:49:18
packages/switchboard-gui/src/components/tokens/tokens-table.tsx:82:29
packages/analytics-engine/knex/src/KnexAnalyticsStore.ts:84:23
packages/analytics-engine/knex/src/KnexAnalyticsStore.ts:122:28
```

<details><summary>All affected files</summary>

- `apps/connect/src/components/modal/modals/AddDriveModal.tsx` (2)
- `apps/connect/src/components/modal/modals/CreateDocumentModal.tsx` (1)
- `apps/connect/src/components/modal/modals/DeleteDriveModal.tsx` (1)
- `apps/connect/src/components/modal/modals/DeleteItemModal.tsx` (1)
- `apps/connect/src/components/modal/modals/DownloadDocumentWithErrorsModal.tsx` (1)
- `apps/connect/src/components/modal/modals/DriveSettingsModal.tsx` (3)
- `apps/connect/src/components/modal/modals/settings/danger-zone.tsx` (1)
- `apps/connect/src/components/sidebar.tsx` (1)
- `apps/connect/src/utils/registerServiceWorker.ts` (1)
- `apps/switchboard/src/attachments/mount-auth.ts` (1)
- `packages/analytics-engine/knex/src/KnexAnalyticsStore.ts` (3)
- `packages/design-system/src/connect/components/account-popover/account-popover-user.tsx` (1)
- `packages/design-system/src/connect/components/db-explorer/components/table-view.tsx` (1)
- `packages/design-system/src/connect/components/debug-inspector/debug-inspector.tsx` (1)
- `packages/design-system/src/connect/components/form/add-local-drive-form.tsx` (1)
- `packages/design-system/src/connect/components/form/add-remote-drive-form.tsx` (1)
- `packages/design-system/src/connect/components/form/drive-settings-form.tsx` (1)
- `packages/design-system/src/connect/components/image-input/image-input.tsx` (1)
- `packages/design-system/src/connect/components/modal/settings-modal-v2/danger-zone.tsx` (1)
- `packages/design-system/src/ui/components/form/form.tsx` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/module-form.tsx` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/operation-form.tsx` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/text-field.tsx` (1)
- `packages/reactor-api/src/packages/package-manager.ts` (1)
- `packages/reactor-api/src/server.ts` (2)
- `packages/reactor-api/test/gateway/gateway-adapter-contract.ts` (1)
- `packages/switchboard-gui/src/components/tokens/token-form.tsx` (1)
- `packages/switchboard-gui/src/components/tokens/tokens-table.tsx` (1)
- `packages/vetra/processors/codegen/utils.ts` (1)

</details>

### Batch 10: `@typescript-eslint/no-floating-promises` — 18 warning(s), 15 file(s)

**What it means.** A Promise is created but not awaited, `.catch`-ed, or explicitly `void`-ed — unhandled-rejection risk.

**How to fix.** Manual. Add `await`, `void`, or `.catch(...)` depending on whether the caller should wait. In fire-and-forget spots, prefix with `void`.

**Batching.** Batch by intent. Spread thin (analytics-engine 7; switchboard-gui/reactor-mcp/design-system 3 each). Decide await-vs-void per call site.

Packages: `packages/analytics-engine` (7), `packages/switchboard-gui` (3), `packages/reactor-mcp` (3), `packages/design-system` (3), `clis/ph-cmd` (1), `packages/powerhouse-vetra-packages` (1)

Examples:

```
packages/switchboard-gui/src/app/user.tsx:19:13
packages/switchboard-gui/src/app/user.tsx:41:15
packages/switchboard-gui/src/components/header/header.tsx:17:5
packages/analytics-engine/benchmarks/src/series.ts:68:1
```

<details><summary>All affected files</summary>

- `clis/ph-cmd/scripts/generate-docs-legacy.ts` (1)
- `packages/analytics-engine/benchmarks/src/series.ts` (1)
- `packages/analytics-engine/browser/src/BrowserAnalyticsStore.ts` (1)
- `packages/analytics-engine/browser/test/BrowserAnalyticsStore.test.ts` (1)
- `packages/analytics-engine/browser/test/Integration.test.ts` (1)
- `packages/analytics-engine/compat/src/query-list.ts` (1)
- `packages/analytics-engine/compat/test/index.test.ts` (1)
- `packages/analytics-engine/knex/src/KnexAnalyticsStore.ts` (1)
- `packages/design-system/src/connect/components/file-item/file-item.tsx` (1)
- `packages/design-system/src/connect/components/folder-item/folder-item.tsx` (1)
- `packages/design-system/src/ui/components/search-autocomplete/use-search-autocomplete.ts` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/operation-error-form.tsx` (1)
- `packages/reactor-mcp/test/setup-mcp-server.test.ts` (3)
- `packages/switchboard-gui/src/app/user.tsx` (2)
- `packages/switchboard-gui/src/components/header/header.tsx` (1)

</details>

### Batch 11: `@typescript-eslint/no-unnecessary-condition` — 200 warning(s), 84 file(s)

**What it means.** A condition (if / `?.` / `&&` / `||` / ternary) is always truthy or always nullish per the type system, so the check is redundant.

**How to fix.** Manual. ESLint reports no safe autofix. Often the type is wider than reality (e.g. a value typed non-nullable that is actually optional at runtime), so the right fix is sometimes to correct the *type*, not delete the guard.

**Batching.** Batch by file. Within a file the fixes are near-identical: drop the redundant `?.`/`!`/guard, OR widen/correct the upstream type. Triage into (a) genuinely-redundant guards -> delete, and (b) type-too-narrow -> fix the type. Do NOT blanket-delete guards on external/`unknown` data.

Packages: `packages/reactor-api` (51), `packages/vetra` (37), `packages/reactor-browser` (24), `apps/connect` (20), `packages/analytics-engine` (19), `packages/design-system` (14), `packages/codegen` (9), `packages/reactor-mcp` (9), `packages/powerhouse-vetra-packages` (5), `test/e2e-utils` (3), `packages/common` (3), `packages/pglite-fs` (1), `packages/switchboard-gui` (1), `packages/document-model` (1), `packages/renown` (1), `packages/builder-tools` (1), `test/versioned-documents` (1)

Examples:

```
packages/pglite-fs/src/atomic-node-fs.ts:143:26
packages/switchboard-gui/src/components/tokens/tokens-table.tsx:57:20
test/e2e-utils/src/helpers/registry.ts:62:15
test/e2e-utils/src/helpers/registry.ts:65:15
```

<details><summary>All affected files</summary>

- `apps/connect/src/components/app-container.tsx` (1)
- `apps/connect/src/components/modal/modals-container.tsx` (1)
- `apps/connect/src/components/modal/modals/AddDriveModal.tsx` (2)
- `apps/connect/src/components/modal/modals/DeleteDriveModal.tsx` (1)
- `apps/connect/src/components/modal/modals/DriveSettingsModal.tsx` (2)
- `apps/connect/src/components/modal/modals/InspectorModal/useDbExplorer.ts` (3)
- `apps/connect/src/components/openpanel.tsx` (2)
- `apps/connect/src/hooks/usePendingInstallations.ts` (1)
- `apps/connect/src/packages.config.ts` (1)
- `apps/connect/src/store/reactor.ts` (2)
- `apps/connect/src/utils/document-editor-debug-tools.ts` (1)
- `apps/connect/src/utils/path.ts` (1)
- `apps/connect/src/utils/pglite-runtime.ts` (2)
- `packages/analytics-engine/benchmarks/src/processor.ts` (1)
- `packages/analytics-engine/browser/src/BrowserAnalyticsStore.ts` (5)
- `packages/analytics-engine/browser/src/PgLiteExecutor.ts` (1)
- `packages/analytics-engine/core/src/AnalyticsDiscretizer.ts` (4)
- `packages/analytics-engine/graphql/src/AnalyticsModel.ts` (4)
- `packages/analytics-engine/knex/src/KnexAnalyticsStore.ts` (3)
- `packages/analytics-engine/pg/src/PostgresAnalyticsStore.ts` (1)
- `packages/builder-tools/connect-utils/vite-config.ts` (1)
- `packages/codegen/src/codegen/features.ts` (4)
- `packages/codegen/src/utils/validation.ts` (5)
- `packages/common/drive-analytics/useDocumentAnalytics.ts` (3)
- `packages/design-system/src/connect/components/drop-zone/use-upload-tracker.ts` (1)
- `packages/design-system/src/connect/components/file-item/file-item.tsx` (1)
- `packages/design-system/src/connect/components/folder-item/folder-item.tsx` (1)
- `packages/design-system/src/connect/components/modal/settings-modal-v2/danger-zone.tsx` (1)
- `packages/design-system/src/connect/components/revision-history/utils.ts` (4)
- `packages/design-system/src/powerhouse/hooks/animation.ts` (4)
- `packages/design-system/src/ui/components/value-transformer/value-transformer.tsx` (2)
- `packages/document-model/test/document/crypto.test.ts` (1)
- `packages/pglite-fs/src/atomic-node-fs.ts` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/hooks/useFormField.ts` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/utils/helpers.test.ts` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/utils/helpers.ts` (3)
- `packages/reactor-api/scripts/capture-hub-dump.ts` (1)
- `packages/reactor-api/src/graphql/document-model-subgraph.ts` (6)
- `packages/reactor-api/src/graphql/gateway/adapter-gateway-apollo.ts` (1)
- `packages/reactor-api/src/graphql/gateway/adapter-http-express.ts` (2)
- `packages/reactor-api/src/graphql/gateway/adapter-http-fastify.ts` (3)
- `packages/reactor-api/src/graphql/gateway/drive-ownership-cache.ts` (1)
- `packages/reactor-api/src/graphql/reactor/adapters.ts` (3)
- `packages/reactor-api/src/graphql/reactor/pubsub.ts` (2)
- `packages/reactor-api/src/graphql/reactor/resolvers.ts` (4)
- `packages/reactor-api/src/graphql/reactor/subgraph.ts` (4)
- `packages/reactor-api/src/graphql/utils.ts` (1)
- `packages/reactor-api/src/packages/import-resolver.ts` (1)
- `packages/reactor-api/src/server.ts` (7)
- `packages/reactor-api/src/services/auth.service.ts` (1)
- `packages/reactor-api/test/connect-switchboard-reshuffle-convergence.test.ts` (3)
- `packages/reactor-api/test/connect-switchboard-sync.test.ts` (8)
- `packages/reactor-api/test/fault-injection-sync.test.ts` (1)
- `packages/reactor-api/test/subscriptions-sse.test.ts` (1)
- `packages/reactor-api/test/utils.ts` (1)
- `packages/reactor-browser/src/actions/dispatch.ts` (3)
- `packages/reactor-browser/src/actions/document.ts` (3)
- `packages/reactor-browser/src/actions/queue.ts` (1)
- `packages/reactor-browser/src/analytics/hooks/timeline-items.ts` (1)
- `packages/reactor-browser/src/utils/validate-document.ts` (1)
- `packages/reactor-browser/test/document-cache.test.tsx` (12)
- `packages/reactor-browser/test/drop.test.ts` (2)
- `packages/reactor-browser/test/remote-controller/remote-controller.test.ts` (1)
- `packages/reactor-mcp/src/stdio/loader.ts` (1)
- `packages/reactor-mcp/src/tools/reactor.ts` (5)
- `packages/reactor-mcp/src/tools/utils.ts` (3)
- `packages/renown/src/utils.ts` (1)
- `packages/switchboard-gui/src/components/tokens/tokens-table.tsx` (1)
- `packages/vetra/codegen/spec-api.ts` (16)
- `packages/vetra/codegen/specs.ts` (1)
- `packages/vetra/editors/app-editor/components/EditName.tsx` (1)
- `packages/vetra/editors/document-editor/editor.tsx` (1)
- `packages/vetra/editors/processor-editor/editor.tsx` (3)
- `packages/vetra/editors/subgraph-editor/editor.tsx` (1)
- `packages/vetra/editors/vetra-drive-app/components/DriveInfoItem.tsx` (1)
- `packages/vetra/editors/vetra-drive-app/components/ShareMenuItem.tsx` (1)
- `packages/vetra/editors/vetra-drive-app/editor.tsx` (2)
- `packages/vetra/processors/codegen/document-handlers/generators/document-editor-generator.ts` (1)
- `packages/vetra/processors/codegen/document-handlers/generators/document-model-generator.ts` (1)
- `packages/vetra/processors/codegen/document-handlers/generators/package-generator.ts` (2)
- `packages/vetra/processors/codegen/document-handlers/generators/processor-generator.ts` (2)
- `packages/vetra/processors/vetra-read-model/processor.ts` (4)
- `test/e2e-utils/src/helpers/registry.ts` (3)
- `test/versioned-documents/editors/todo-editor/editor.tsx` (1)

</details>

### Batch 12a: `react-hooks/exhaustive-deps` — 36 warning(s), 24 file(s)

**What it means.** A `useEffect`/`useMemo`/`useCallback` dependency array is missing a referenced value, or lists one that is unnecessary.

**How to fix.** Manual, case-by-case — NOT batchable blindly. Adding a dep can change behavior (re-run loops); some omissions are intentional. Each needs human judgment.

**Batching.** Group by component file, but treat individually. Concentrated in design-system (15) and vetra (11). Low priority for bulk fixing; review per-hook.

Packages: `packages/design-system` (15), `packages/vetra` (11), `packages/powerhouse-vetra-packages` (4), `apps/connect` (4), `packages/switchboard-gui` (1), `packages/reactor-browser` (1)

Examples:

```
packages/switchboard-gui/src/components/header/header.tsx:24:6
packages/reactor-browser/src/analytics/context.tsx:99:6
packages/design-system/src/connect/components/db-explorer/components/filter-bar.tsx:111:9
packages/design-system/src/connect/components/db-explorer/db-explorer.tsx:98:9
```

<details><summary>All affected files</summary>

- `apps/connect/src/components/app-skeleton.tsx` (1)
- `apps/connect/src/components/document-editor-container.tsx` (1)
- `apps/connect/src/components/modal/modals/SettingsModal.tsx` (1)
- `apps/connect/src/components/modal/modals/settings/about.tsx` (1)
- `packages/design-system/src/connect/components/db-explorer/components/filter-bar.tsx` (1)
- `packages/design-system/src/connect/components/db-explorer/db-explorer.tsx` (1)
- `packages/design-system/src/connect/components/document-timeline/components/h-divider.tsx` (1)
- `packages/design-system/src/connect/components/document-timeline/document-timeline.tsx` (2)
- `packages/design-system/src/connect/components/drop-zone/drop-zone.tsx` (1)
- `packages/design-system/src/connect/components/form/add-remote-drive-form.tsx` (2)
- `packages/design-system/src/connect/components/modal/read-required-modal.tsx` (1)
- `packages/design-system/src/powerhouse/components/legacy/textInput.tsx` (1)
- `packages/design-system/src/powerhouse/components/legacy/textInputVariant.tsx` (1)
- `packages/design-system/src/powerhouse/components/package-animation/package-animation.tsx` (1)
- `packages/design-system/src/ui/components/value-transformer/value-transformer.tsx` (1)
- `packages/design-system/src/ui/components/with-field-validation/with-field-validation.tsx` (2)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/code-editors/graphql-editor.tsx` (2)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/code-editors/json-editor.tsx` (1)
- `packages/powerhouse-vetra-packages/editors/document-model-editor/components/model-metadata-form.tsx` (1)
- `packages/reactor-browser/src/analytics/context.tsx` (1)
- `packages/switchboard-gui/src/components/header/header.tsx` (1)
- `packages/vetra/editors/app-editor/components/AppEditorForm.tsx` (1)
- `packages/vetra/editors/vetra-drive-app/editor.tsx` (1)
- `packages/vetra/editors/vetra-package/editor.tsx` (9)

</details>

### Batch 12b: `react-hooks/incompatible-library` — 2 warning(s), 2 file(s)

**What it means.** The React Hooks compiler/linter skipped a file because it uses an incompatible library construct.

**How to fix.** Investigate individually — usually informational. May require a directive or library-usage change.

**Batching.** Not batchable (2 isolated cases: design-system, powerhouse-vetra-packages). Review each.

Packages: `packages/design-system` (1), `packages/powerhouse-vetra-packages` (1)

Examples:

```
packages/design-system/src/connect/components/revision-history/timeline/timeline.tsx:28:26
packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/file-content-view.tsx:26:26
```

<details><summary>All affected files</summary>

- `packages/design-system/src/connect/components/revision-history/timeline/timeline.tsx` (1)
- `packages/powerhouse-vetra-packages/editors/generic-drive-explorer/components/file-content-view.tsx` (1)

</details>
