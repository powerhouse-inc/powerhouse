import type { PGlite } from "@electric-sql/pglite";
import type { LiveNamespace, PGliteWithLive } from "@electric-sql/pglite/live";
import type { IRelationalDb as _IRelationalDb } from "document-drive";
import { createRelationalDb } from "document-drive";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { useMemo } from "react";
import { usePGliteDB } from "../../pglite/hooks/usePGlite.js";

// Type for Relational DB instance enhanced with live capabilities
export type RelationalDbWithLive<Schema> = _IRelationalDb<Schema> & {
  live: LiveNamespace;
};

export interface IRelationalDb<Schema> {
  db: RelationalDbWithLive<Schema> | null;
  isLoading: boolean;
  error: Error | null;
}

// Custom initializer that creates enhanced Kysely instance with live capabilities
function createRelationalDbWithLive<Schema>(
  pgliteInstance: PGliteWithLive,
): RelationalDbWithLive<Schema> {
  const baseDb = new Kysely<Schema>({
    dialect: new PGliteDialect(pgliteInstance as unknown as PGlite),
  });
  const relationalDb = createRelationalDb(baseDb);

  // Inject the live namespace with proper typing
  const relationalDBWithLive = relationalDb as RelationalDbWithLive<Schema>;
  relationalDBWithLive.live = pgliteInstance.live;

  return relationalDBWithLive;
}

export const useRelationalDb = <Schema>() => {
  const pglite = usePGliteDB();

  const relationalDb = useMemo<IRelationalDb<Schema>>(() => {
    if (!pglite.db || pglite.isLoading || pglite.error) {
      return {
        db: null,
        isLoading: pglite.isLoading,
        error: pglite.error,
      };
    }

    const db = createRelationalDbWithLive<Schema>(pglite.db);

    return {
      db,
      isLoading: false,
      error: null,
    };
  }, [pglite]);

  return relationalDb;
};
