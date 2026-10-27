# Implementing a processor

Contents:

- How a processor runs
- The filter
- Deleted documents
- Relational DB processor
- Analytics processor
- Replay and state

## How a processor runs

- `processors/<id>/factory.ts` exports `<camelName>FactoryBuilder`. The host calls it once with its module (`module.relationalDb`, `module.analyticsStore`, `module.processorApp`, `module.config`). It returns a factory that the host calls once per drive with the drive's header.
- The factory returns `ProcessorRecord[]`: `{ processor, filter }`, plus optional `startFrom` (`"beginning"` or `"current"`) and `replayState`. The record also takes an `id`, but the reactor ignores it while it numbers processors by position, which is the default.
- The host calls `processor.onOperations(operations)` with each batch the filter matches. Each item is `{ operation, context }`. `context` holds `documentId`, `documentType`, `scope`, `branch`, `ordinal` and `resultingState`.
- Delivery is at least once. Within a document's scope and branch, operations arrive in order; across documents there is no order. Calls do not overlap. Write so that a repeated operation changes nothing: upsert, or insert with `onConflict(...).doNothing()`.
- `onDisconnect` runs when the processor stops, including when its factory is unregistered. It is not a deletion signal.
- `processors/factory.ts` loads `processors/connect.ts` in Connect and `processors/switchboard.ts` elsewhere, and calls every builder their `processorFactoryBuilders` array lists.

## The filter

`ProcessorFilter` has four optional fields, each a string array: `documentType`, `scope`, `branch`, `documentId`.

- An omitted field matches every value.
- Only `documentId` honours `"*"`. A `"*"` in another field matches nothing.
- The scaffold sets `branch: ["main"]`, `documentId: ["*"]` and `documentType` from the document.
- The relational scaffold also sets `scope: ["global", "document"]`; the `document` scope carries `DELETE_DOCUMENT` and `PURGE_DOCUMENT`. The analytics scaffold sets no `scope`, so it receives every scope; check `context.scope` before reading state.
- Keep `documentType` an array of string literals: codegen reads it back when it regenerates the folder.

## Deleted documents

A drive's processors receive the drive's own `DELETE_DOCUMENT` or `PURGE_DOCUMENT`, whatever the filter, as the last delivery before `onDisconnect`. For a purged document only the marker arrives, possibly more than once and without `resultingState`.

Handle both actions first in `onOperations`, before anything that parses `resultingState`, and erase what the document left. The scaffolds do this; keep that branch:

- Relational: when the deleted document is the drive whose namespace this is, `dropNamespace()`; otherwise `deleteDocumentRows(documentId)`, which deletes from every table with a `document_id` or `documentId` column. Give every table one of those columns.
- Analytics: `analyticsStore.clearSeriesBySource(AnalyticsPath.fromString("ph/doc/<documentId>"), true)`. Record a document's series under that source so the deletion clears them.

## Relational DB processor

Files: `processor.ts` (extends `RelationalDbProcessor<DB>`), `migrations.ts` (`up` and `down`), `schema.ts` (the `DB` type), `factory.ts`.

1. Define the tables in `migrations.ts`. `up(db)` uses the Kysely schema builder; end each `createTable` with `.ifNotExists()`. Replace the scaffold's `todo` table.
2. Generate `schema.ts` from it: `ph generate migration-file --path processors/<id>/migrations.ts`. It writes a `<Name>Table` interface per table and the `DB` type the processor imports.
3. In `processor.ts`, write rows with `this.relationalDb`, a Kysely instance typed by `DB`.
4. The factory creates the drive's namespace with `module.relationalDb.createNamespace`, builds the processor, and calls `initAndUpgrade()`, which runs `up`. Nothing else runs the migrations; keep that call.

```ts
// processors/invoice-index/processor.ts; migrations.ts makes document_id the primary key
import { RelationalDbProcessor } from "@powerhousedao/reactor-browser";
import type { OperationWithContext } from "document-model";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";

export class InvoiceIndex extends RelationalDbProcessor<DB> {
  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      if (
        operation.action.type === "DELETE_DOCUMENT" ||
        operation.action.type === "PURGE_DOCUMENT"
      ) {
        const input = operation.action.input as { documentId?: string };
        const documentId = input.documentId ?? context.documentId;
        if (this.isNamespaceDrive(documentId)) {
          await this.dropNamespace();
          return;
        }
        await this.deleteDocumentRows(documentId);
        continue;
      }
      if (context.scope !== "global" || !context.resultingState) continue;
      const state = JSON.parse(context.resultingState) as {
        global: { total: number };
      };
      await this.relationalDb
        .insertInto("invoice")
        .values({ document_id: context.documentId, total: state.global.total })
        .onConflict((oc) =>
          oc.column("document_id").doUpdateSet({ total: state.global.total }),
        )
        .execute();
    }
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }

  override async initAndUpgrade(): Promise<void> {
    await up(this.relationalDb);
  }
}
```

The namespace is `<ClassName>_<driveId>` with dashes turned into underscores. Override the static `getNamespace(driveId)` to share one namespace across drives. Then change the scaffold's deletion branch too: it calls `dropNamespace()` when the deleted document is the drive, which would drop the shared namespace for every drive.

Read the tables:

- From a subgraph: `InvoiceIndex.query(driveId, subgraph.relationalDb)`. See [subgraphs.md](subgraphs.md).
- From an editor in Connect, for a processor that runs in `connect`: `createProcessorQuery(InvoiceIndex)` from `@powerhousedao/reactor-browser` returns a hook, called as `useQuery(driveId, (db) => db.selectFrom("invoice").selectAll().compile())`.

The query builder has `selectFrom`, `selectNoFrom`, `with` and `withRecursive` only; writes go through the processor.

## Analytics processor

Files: `processor.ts` (implements `IProcessor`, takes the `IAnalyticsStore`), `factory.ts`.

- Write series with `analyticsStore.addSeriesValues(inputs)`. Each input has `start` (a luxon `DateTime`), `source` (an `AnalyticsPath`), `metric`, `value` and `dimensions` (a record of `AnalyticsPath`), plus optional `end`, `unit`, `fn` and `params`.
- Use `ph/doc/<documentId>/...` as the source, so the deletion branch clears the document's series.
- Import `AnalyticsPath` and the types from `@powerhousedao/analytics-engine-core`.

## Replay and state

A processor replays on first install, after a restart, and on a rerun or retry. A processor that throws stays errored, even across restarts; retry and rerun are admin operations of the inspection API, with no `ph` command, so locally a new drive (whose instance starts fresh) is the way to see a fixed processor run. `context.resultingState` (a JSON string) is the state after the operation on a live delivery. On a replay it depends on the record's `replayState`:

- `latest` (default): every operation, with the document's latest state, which can be newer than the operation.
- `collapse`: one delivery per document stream, with the latest state. Use it only when the output depends on the latest state alone.
- `exact`: every operation with its state at its own revision. Slower.
- `operations`: every operation, without state.

Set `replayState` on the record the factory returns. A processor that needs the state as it was at each operation, such as one recording a history of values, needs `exact`.

`clear()` on a relational processor drops its namespace and runs the migrations again, so a replay from the first operation rebuilds it.
