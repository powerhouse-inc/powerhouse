import {
  purgeDocumentAction,
  purgeMarkerOperation,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import {
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from "kysely";
import { describe, expect, it } from "vitest";
import { vetraReadModelFactoryBuilder } from "../factory.js";
import { VetraReadModelProcessor } from "../processor.js";
import type { DB } from "../schema.js";

const PACKAGE = "powerhouse/package";

function recordingDb() {
  const queries: { sql: string; parameters: readonly unknown[] }[] = [];
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (kysely) => new PostgresIntrospector(kysely),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
    log: (event) => {
      queries.push({
        sql: event.query.sql,
        parameters: event.query.parameters,
      });
    },
  });
  return { db, queries };
}

function deletion(documentId: string): OperationWithContext {
  return {
    operation: {
      id: "delete",
      index: 3,
      skip: 0,
      hash: "",
      timestampUtcMs: new Date(0).toISOString(),
      action: {
        id: "delete-action",
        type: "DELETE_DOCUMENT",
        scope: "document",
        timestampUtcMs: new Date(0).toISOString(),
        input: { documentId },
      },
    },
    context: {
      documentId,
      documentType: PACKAGE,
      scope: "document",
      branch: "main",
      ordinal: 3,
      resultingState: JSON.stringify({ global: { name: "pkg" } }),
    },
  };
}

// Sweeps and boot replay deliver the marker with no resultingState.
function marker(documentId: string): OperationWithContext {
  return {
    operation: purgeMarkerOperation(
      purgeDocumentAction({
        documentId,
        documentType: PACKAGE,
        requestId: "r",
      }),
    ),
    context: {
      documentId,
      documentType: PACKAGE,
      scope: "document",
      branch: "main",
      ordinal: 4,
    },
  };
}

describe("VetraReadModelProcessor on deletion", () => {
  it.each([
    ["DELETE_DOCUMENT", deletion],
    ["PURGE_DOCUMENT", marker],
  ])("deletes the package's rows on %s and writes none", async (_, op) => {
    const { db, queries } = recordingDb();
    const processor = new VetraReadModelProcessor(db);

    await processor.onOperations([op("package-1")]);

    expect(queries).toEqual([
      {
        sql: 'delete from "vetra_package" where "document_id" = $1',
        parameters: ["package-1"],
      },
    ]);
  });

  it("skips other document-scope operations", async () => {
    const { db, queries } = recordingDb();
    const processor = new VetraReadModelProcessor(db);
    const creation = deletion("package-1");
    creation.operation.action.type = "CREATE_DOCUMENT";

    await processor.onOperations([creation]);

    expect(queries).toEqual([]);
  });

  it("receives the document scope", async () => {
    const { db } = recordingDb();
    const factory = await vetraReadModelFactoryBuilder({
      relationalDb: {
        createNamespace: () => Promise.resolve(db),
      },
    } as never);

    const [record] = await factory({ id: "drive" } as never);

    expect(record!.filter.scope).toEqual(["global", "document"]);
  });
});
