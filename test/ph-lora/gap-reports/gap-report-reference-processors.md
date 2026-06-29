## Gap Report: Reference — Processors

Reviewed: docs/academy/04-Reference/04-Processors
Against: packages/reactor, packages/reactor-api (canonical type definitions live in packages/shared, re-exported by both)
Focus: Processor interface, processor migration guide, drive analytics hooks. Ignore _-prefixed draft files.

Note: The only non-draft doc file in scope is `08-ProcessorMigrationGuide.md`. The drive analytics hooks doc (`_07-DriveAnalyticsHooks.md`) is `_`-prefixed (draft) and was ignored per the scope instructions, so the "drive analytics hooks" focus item has no shipped doc surface to review.

### Findings

| # | Urgency | Type | Doc location | Source location | Finding |
|---|---------|------|-------------|-----------------|---------|
| 1 | low | stale | Factory differences table — "`IProcessorHostModule` (bundles `analyticsStore`, `relationalDb`, `processorApp`, `config`)" (line 153) | `packages/shared/processors/types.ts:23-30` | `IProcessorHostModule` also has required members `dispatch: IProcessorDispatch` and `getReadModel<T>(name)`. The table describes the bundle as only `analyticsStore`, `relationalDb`, `processorApp`, `config` and omits these two; `config` is the only optional member. Incomplete description of a documented type. |

### Verified clean

- `IProcessor` — name confirmed; exported from `@powerhousedao/reactor` and re-exported by `@powerhousedao/reactor-browser` (`packages/reactor/index.ts:144`, `packages/reactor-browser/src/re-exports.ts:23`). Import paths in the doc are valid.
- `IProcessor.onOperations(operations: OperationWithContext[]): Promise<void>` — signature matches source (`packages/shared/processors/types.ts:52`). The v6 interface example (lines 60-78) matches.
- `IProcessor.onDisconnect(): Promise<void>` — matches source (`packages/shared/processors/types.ts:58`).
- `OperationWithContext` import from `document-model` (examples at lines 63, 333, 446) — valid: `document-model/index.ts:1` does `export * from "@powerhousedao/shared/document-model"`, which exports `OperationWithContext` (`packages/shared/document-model/operations.ts:307`). Also re-exported by `@powerhousedao/reactor` and `@powerhousedao/reactor-browser`.
- `OperationWithContext` shape `{ operation, context }` (line 465) — matches `packages/shared/document-model/operations.ts:307-310`.
- `context` reference table fields (lines 469-476): `documentId`, `documentType`, `scope`, `branch`, `ordinal`, `resultingState?` — all match `OperationContext` (`packages/shared/document-model/operations.ts:296-305`), including the optional/string typing of `resultingState` and `ordinal: number`.
- `operation` reference table (lines 480-485): `action: Action`, `index: number`, `timestampUtcMs: string`, `hash: string` — all match `Operation` (`packages/shared/document-model/operations.ts:249-284`).
- `Action` field claim "`type`, `input`, `timestampUtcMs`, `id`, `scope`" (line 482) — all confirmed on `Action` (`packages/shared/document-model/actions.ts:969-987`).
- `operation.action.type` / `operation.action.input` / `operation.action.timestampUtcMs` access patterns (lines 87, 258, 287, 360, 454) — match `Operation.action: Action` plus the `Action` fields above. The repo's own ProcessorManager uses the same access (`op.operation.action.type`, `packages/reactor/src/processors/processor-manager.ts:175`).
- `ProcessorRecord` — name and shape `{ processor, filter, ... }` match source (`packages/shared/processors/types.ts:64-68`; source additionally has optional `startFrom`). Doc factory examples returning `[{ processor, filter }]` are valid.
- `ProcessorFilter` — exported and shape `{ documentType?, scope?, branch?, documentId? }` matches source (`packages/shared/processors/types.ts:37-42`); doc filter literals (e.g. lines 105-114, 389-394) are valid against it.
- `ProcessorFactory` signature `(driveHeader: PHDocumentHeader, processorApp?: ProcessorApp) => Promise<ProcessorRecord[]> | ProcessorRecord[]` — matches doc v6 factory (lines 129-134) and Factory differences table (lines 151-155). Confirmed at `packages/shared/processors/types.ts:74-77`.
- `IProcessorHostModule` — name confirmed (`packages/shared/processors/types.ts:23`), exported via `@powerhousedao/reactor` (`packages/reactor/index.ts:145`) and `@powerhousedao/reactor-browser` (`re-exports.ts:24`).
- `PHDocumentHeader` import from `document-model` (lines 125, 377) — valid via the shared re-export; `driveHeader.id` access (line 384) is valid (`PHDocumentHeader` has `id`, see `createMinimalDriveHeader`, `packages/reactor/src/processors/utils.ts:31-45`).
- `ProcessorApp` import from `@powerhousedao/common` (line 126) — the type exists and is exported from `@powerhousedao/reactor`/`reactor-browser` as well; named correctly (`packages/shared/processors/types.ts:125`).
- `RelationalDbProcessor<DB>` — exported as a value from `@powerhousedao/reactor` and re-exported by `@powerhousedao/reactor-browser` (`packages/reactor/index.ts:141`, `re-exports.ts:14`); defined at `packages/shared/processors/relational/types.ts:60`.
- `static getNamespace(driveId: string): string` (doc lines 339, 384, 412) — matches `packages/shared/processors/relational/types.ts:75-77`.
- `initAndUpgrade(): Promise<void>` (doc lines 344, 413) — abstract method on `RelationalDbProcessor` / `IRelationalDbProcessor` (`packages/shared/processors/relational/types.ts:50, 116`).
- `static query(driveId, relationalDb)` (doc line 414) — matches static `query(this, driveId, db)` (`packages/shared/processors/relational/types.ts:79-85`).
- `this.relationalDb` available in subclass (doc lines 345, 354) — `protected relationalDb` constructor field (`packages/shared/processors/relational/types.ts:66`).
- `new MyRelationalProcessor(namespace, filter, store)` (doc line 396) — matches 3-arg constructor `(_namespace, _filter, relationalDb)` (`packages/shared/processors/relational/types.ts:63-67`).
- `module.relationalDb.createNamespace<...>(namespace)` (doc lines 385-387) — matches `IRelationalDb.createNamespace` (`packages/shared/processors/relational/types.ts:28-30`).

### Could not verify

Within scope but depending on non-static or out-of-scope information:
- Analytics example calls `AnalyticsPath.fromString`, `analyticsStore.addSeriesValues`, `clearSeriesBySource`, and `AnalyticsSeriesInput` (doc lines 187-274) — these come from `@powerhousedao/analytics-engine-core`, which is outside the `packages/reactor` / `packages/reactor-api` scope and was not loaded.
- Behavioral claim "the v6 processor manager guarantees each operation is delivered exactly once — there is no replay" (line 283) — runtime/ordering guarantee; not verifiable by static signature check (the manager does track per-processor `lastOrdinal` cursors and filters `op.context.ordinal > tracked.lastOrdinal` in `routeOperationsToProcessors`, `processor-manager.ts:399-401`, which is consistent, but exactly-once delivery is a runtime property).
- Legacy `document-drive` imports (`InternalTransmitterUpdate`, `onStrands`, `ReactorContext`) referenced throughout as the "before" state — the `document-drive` package was not in scope and not loaded, so the legacy-side claims are unverified (only the v6 side was checked).
- `ph generate --processor ... --processor-type relationalDb` and `ph generate --migration-file migrations.ts` (doc lines 404, 415) — CLI behavior; out of scope (CLI is reference-cli) and requires running the CLI.
- Drive analytics hooks focus item — no shipped (non-draft) doc file exists; nothing to anchor against.

### Summary

1 finding (1 stale, 0 missing, 0 wrong). The v6 processor migration guide is in strong shape: the `IProcessor` interface, `OperationWithContext`/`Operation`/`Action` reference tables, factory signatures, and the `RelationalDbProcessor` API (constructor, `getNamespace`, `initAndUpgrade`, static `query`) all match the canonical definitions in `packages/shared`. The only drift is an incomplete description of `IProcessorHostModule` in the Factory differences table.
