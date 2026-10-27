import { PGlite } from "@electric-sql/pglite";
import type {
  Action,
  OperationWithContext,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import type {
  ExtractProcessorSchemaOrSelf,
  IRelationalDb,
} from "./relational/types.js";
import { createRelationalDb } from "./relational/utils.js";

/** An in-memory PGlite database, as a host's `module.relationalDb`. `destroy()` closes it. */
export function createTestRelationalDb(): IRelationalDb {
  const pglite = new PGlite();
  const kysely = new Kysely<unknown>({ dialect: new PGliteDialect(pglite) });
  const destroy = kysely.destroy.bind(kysely);
  kysely.destroy = async () => {
    await destroy();
    await pglite.close();
  };
  return createRelationalDb(kysely);
}

/** Opens `namespace` as a processor factory does and runs a migration's `up` in it. */
export async function runProcessorMigrations<Schema>(
  db: IRelationalDb,
  namespace: string,
  up: (db: IRelationalDb<any>) => Promise<void>,
): Promise<IRelationalDb<ExtractProcessorSchemaOrSelf<Schema>>> {
  const store = await db.createNamespace<Schema>(namespace);
  await up(store);
  return store;
}

/** A document's operations as a processor's `onOperations` receives them. */
export function operationsWithContext(
  document: PHDocument,
  scopes: string[] = Object.keys(document.operations),
): OperationWithContext[] {
  const operations = scopes.flatMap((scope) =>
    (document.operations[scope] ?? []).map((operation) => ({
      operation,
      context: {
        documentId: document.header.id,
        documentType: document.header.documentType,
        scope,
        branch: "main",
        ordinal: 0,
      },
    })),
  );
  operations.sort((a, b) =>
    a.operation.timestampUtcMs.localeCompare(b.operation.timestampUtcMs),
  );
  return operations.map((entry, index) => ({
    ...entry,
    context: { ...entry.context, ordinal: index + 1 },
  }));
}

/** One operation for a processor test, without a reducer to produce it. */
export function testOperation(options: {
  documentId: string;
  documentType: string;
  type: string;
  input?: unknown;
  scope?: string;
  index?: number;
  timestampUtcMs?: string;
}): OperationWithContext {
  const scope = options.scope ?? "global";
  const timestampUtcMs = options.timestampUtcMs ?? new Date().toISOString();
  const index = options.index ?? 0;
  const action: Action = {
    id: `${options.documentId}-${scope}-${index}`,
    type: options.type,
    input: options.input ?? {},
    scope,
    timestampUtcMs,
  };
  return {
    operation: {
      id: action.id,
      index,
      skip: 0,
      timestampUtcMs,
      hash: "",
      action,
    },
    context: {
      documentId: options.documentId,
      documentType: options.documentType,
      scope,
      branch: "main",
      ordinal: index + 1,
    },
  };
}
