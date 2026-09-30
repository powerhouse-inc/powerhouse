import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import {
  createRelationalDb,
  namespaceSchemaOf,
  RelationalDbProcessor,
} from "@powerhousedao/shared/processors";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDatabase, type TestDatabase } from "../executor/harness.js";

// The codegen relational template's onOperations.
class Todo extends RelationalDbProcessor<any> {
  async initAndUpgrade(): Promise<void> {
    await this.relationalDb.schema
      .createTable("todo")
      .ifNotExists()
      .addColumn("document_id", "varchar(255)", (c) => c.notNull())
      .execute();
  }

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
      }
    }
  }

  onDisconnect(): Promise<void> {
    return Promise.resolve();
  }
}

class SharedTodo extends Todo {
  static override getNamespace(): string {
    return "shared_todo";
  }
}

function deletion(documentId: string): OperationWithContext {
  return {
    operation: {
      action: { type: "DELETE_DOCUMENT", input: { documentId } },
    },
    context: {
      documentId,
      documentType: "powerhouse/document-drive",
      scope: "document",
      branch: "main",
      ordinal: 1,
    },
  } as unknown as OperationWithContext;
}

describe("relational template deletion [Postgres]", () => {
  let database: TestDatabase;
  let base: Kysely<any>;
  let pool: Pool;

  beforeAll(async () => {
    database = await createTestDatabase("reactor_relational_deletion");
    pool = new Pool({ connectionString: database.url });
    base = new Kysely<any>({ dialect: new PostgresDialect({ pool }) });
  });

  afterAll(async () => {
    await base.destroy();
    await database.drop();
  });

  async function make(
    processorClass: typeof Todo,
    driveId: string | undefined,
    ...documentIds: string[]
  ) {
    const relationalDb = createRelationalDb(base as never);
    const namespace = processorClass.getNamespace(driveId ?? "drive-z");
    const store = await relationalDb.createNamespace(namespace);
    const Concrete = processorClass as unknown as new (
      ...args: ConstructorParameters<typeof Todo>
    ) => Todo;
    const processor = new Concrete(namespace, {}, store as never, driveId);
    await processor.initAndUpgrade();
    const db = store as unknown as Kysely<any>;
    for (const id of documentIds) {
      await db.insertInto("todo").values({ document_id: id }).execute();
    }
    return { processor, db, schema: namespaceSchemaOf(store)! };
  }

  async function rows(db: Kysely<any>): Promise<string[]> {
    const found = await db
      .selectFrom("todo")
      .select("document_id")
      .orderBy("document_id")
      .execute();
    return found.map((row) => row.document_id as string);
  }

  async function schemaExists(schema: string): Promise<boolean> {
    const result = await sql<{ n: number }>`
      select count(*)::int as n from information_schema.schemata
      where schema_name = ${schema}
    `.execute(base);
    return result.rows[0]!.n > 0;
  }

  beforeEach(async () => {
    const { schema } = await make(SharedTodo, "drive-a");
    await base.schema.dropSchema(schema).ifExists().cascade().execute();
  });

  it("keeps other drives' rows in a shared namespace on a document's deletion", async () => {
    const a = await make(SharedTodo, "drive-a", "doc-x");
    const b = await make(SharedTodo, "drive-b", "doc-y");

    await a.processor.onOperations([deletion("doc-x")]);

    expect(await rows(b.db)).toEqual(["doc-y"]);
  });

  it("deletes only the drive's rows when its namespace is shared", async () => {
    const a = await make(SharedTodo, "drive-a", "drive-a", "doc-x");
    const b = await make(SharedTodo, "drive-b", "drive-b", "doc-y");

    await a.processor.onOperations([deletion("drive-a")]);

    expect(await rows(b.db)).toEqual(["doc-x", "doc-y", "drive-b"]);
  });

  it("drops a per-drive namespace on its own drive's deletion only", async () => {
    const c = await make(Todo, "drive-c", "doc-x");
    const d = await make(Todo, "drive-d", "doc-y");

    await d.processor.onOperations([deletion("drive-c")]);
    expect(await rows(c.db)).toEqual(["doc-x"]);

    await c.processor.onOperations([deletion("drive-c")]);
    expect(await schemaExists(c.schema)).toBe(false);
    expect(await rows(d.db)).toEqual(["doc-y"]);
  });

  it("keeps the namespace of a processor made without its drive id", async () => {
    const e = await make(Todo, undefined, "drive-z", "doc-x");

    await e.processor.onOperations([deletion("drive-z")]);

    expect(await rows(e.db)).toEqual(["doc-x"]);
  });
});
