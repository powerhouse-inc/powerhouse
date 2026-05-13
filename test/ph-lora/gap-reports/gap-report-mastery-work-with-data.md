# Gap Report: Mastery Track — Work With Data

**Date:** 2026-05-11
**Reviewed:** `docs/academy/02-MasteryTrack/04-WorkWithData` (5 published files)
**Against:** `packages/reactor`, `packages/reactor-api`, `packages/analytics-engine`, `packages/shared`
**Focus:** Processor interface, subgraph API, analytics engine query syntax, GraphQL schema shape

---

## Findings

| #   | Urgency | Type  | Doc location                                                                                                                                  | Source location                                                                                                                                                                              | Finding                                                                                                                                                                                                                                                                                |
| --- | ------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | high    | wrong | `03-UsingSubgraphs.md:45` — `ph generate --subgraph search-todos`; `06-RelationalDbProcessor.md:268` — `ph generate --subgraph todo`          | `clis/ph-cli/src/commands/generate-subgraph.ts:4-7` — `name: "subgraph"` subcommand with `--name`/`-n` option; no `--subgraph` flag exists                                                   | `subgraph` is a subcommand of `generate`, not a flag. The name is passed via `--name`. Correct: `ph generate subgraph --name search-todos` and `ph generate subgraph --name todo`. A bare `--subgraph` flag would be rejected as unknown and fail.                                     |
| 2   | high    | wrong | `06-RelationalDbProcessor.md:25` — `ph generate --processor todo-indexer --processor-type relationalDb --document-types powerhouse/todo-list` | `clis/ph-cli/src/commands/generate-processor.ts:30-50` — `name: "processor"` subcommand with `--name`/`-n`, `--type` (not `--processor-type`), and `--document-types`; no `--processor` flag | Three errors: (a) `processor` is a subcommand not a `--processor` flag, (b) the type flag is `--type` not `--processor-type`, (c) the processor name flag is `--name`. Correct: `ph generate processor --name todo-indexer --type relationalDb --document-types powerhouse/todo-list`. |
| 3   | high    | wrong | `06-RelationalDbProcessor.md:91` — `ph generate --migration-file processors/todo-indexer/migrations.ts`                                       | `clis/ph-cli/src/commands/generate-migration-file.ts:9-14` — `name: "migration-file"` subcommand with `--path`/`-p` option; no top-level `--migration-file` flag                             | `migration-file` is a subcommand of `generate`, not a flag, and the path is passed via `--path`, not `--migration-file`. Correct: `ph generate migration-file --path processors/todo-indexer/migrations.ts`.                                                                           |

---

## Verified clean

- **`IProcessor` interface** — `onOperations(operations: OperationWithContext[]): Promise<void>` and `onDisconnect(): Promise<void>` match source exactly (`packages/shared/processors/types.ts:47-59`). ✓
- **`ProcessorFilter` type** — `{ documentType?, scope?, branch?, documentId? }` (all optional `string[]`) matches source (`types.ts:37-42`). ✓
- **`ProcessorRecord` type** — `{ processor, filter, startFrom? }` with `startFrom?: "beginning" | "current"` matches source (`types.ts:64-68`). ✓
- **`ProcessorFactory` type** — inner function `(driveHeader: PHDocumentHeader, processorApp?: ProcessorApp) => Promise<ProcessorRecord[]>` matches source (`types.ts:74-77`). ✓
- **`IProcessorHostModule` interface** — all six fields (`analyticsStore`, `relationalDb`, `processorApp`, `dispatch`, `getReadModel<T>`, `config?`) match source (`types.ts:23-30`). ✓
- **`IProcessorDispatch.execute` signature** — `(docId, branch, actions, signal?, meta?) => Promise<ProcessorDispatchResult>` with `ProcessorDispatchResult = { id: string; status: string }` matches source (`types.ts:8-21`). ✓
- **`startFrom: "current"` on `ProcessorRecord`** — value confirmed in `ProcessorManager` at `packages/reactor/src/processors/processor-manager.ts:246`. ✓
- **`getReadModel<T>(name: string): T` signature** — matches source (`types.ts:28`). ✓
- **Built-in read model names** — `"document-view"`, `"document-indexer"`, `"processor-manager"`, `"subscription-notification"` all consistent with reactor internals; `readModelId: "processor-manager"` confirmed at `processor-manager.ts:64`. ✓
- **`BaseSubgraph` from `@powerhousedao/reactor-api`** — class exists at `packages/reactor-api/src/graphql/base-subgraph.ts:21` with `reactorClient`, `relationalDb`, `graphqlManager`, `syncManager` properties. ✓
- **`reactorClient.getOutgoingRelationships(driveId, "child")`** — method confirmed in `packages/reactor/src/client/types.ts:246` and `reactor-client.ts`. ✓
- **Factory builder pattern** — outer `(module: IProcessorHostModule) =>` returning inner `(driveHeader: PHDocumentHeader) =>` matches `ProcessorFactoryBuilder` → `ProcessorFactory` type chain (`types.ts:74-83`). ✓

---

## Could not verify

- **`import type { ProcessorApp } from "@powerhousedao/common"`** (`06-RelationalDbProcessor.md:138`) — `ProcessorApp` is defined in `@powerhousedao/shared/processors`; whether `@powerhousedao/common` re-exports it was not read in this review.
- **Analytics engine query syntax** — the published docs in this section contain no analytics engine query examples. The analytics content lives in `_04-analytics-processor.md` and `_06-Analytics Engine/`, both prefixed with `_` indicating unpublished drafts. No published analytics coverage to check.
- **GraphQL schema shape for drive subgraph** (`/d/:driveId` route) — document-model-specific schema is generated at runtime; shape cannot be verified statically.

---

## Summary

3 findings (0 stale, 0 missing, 3 wrong). The processor interface and `IProcessorHostModule` reference are accurate throughout. All three errors are `ph generate` CLI syntax: the docs use the old flat-flag style (`--subgraph`, `--processor`, `--processor-type`, `--migration-file`) instead of the current subcommand style (`ph generate subgraph --name`, `ph generate processor --name --type`, `ph generate migration-file --path`). Any of these copy-pasted verbatim will fail immediately.
