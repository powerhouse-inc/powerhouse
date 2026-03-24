import type { PGlite } from "@electric-sql/pglite";
import type { LiveNamespace, PGliteWithLive } from "@electric-sql/pglite/live";
import { createRelationalDb } from "@powerhousedao/reactor";
import type { IRelationalDb as IRelationalDbCore } from "@powerhousedao/shared/processors";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { useMemo } from "react";
import { usePGliteDB } from "../../pglite/usePGlite.js";

// Type for Relational DB instance enhanced with live capabilities
export type RelationalDbWithLive<Schema> = IRelationalDbCore<Schema> & {
  live: LiveNamespace;
};

interface IRelationalDbState<Schema> {
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
  const relationalDBWithLive =
    relationalDb as unknown as RelationalDbWithLive<Schema>;
  relationalDBWithLive.live = pgliteInstance.live;

  return relationalDBWithLive;
}

export const useRelationalDb = <Schema>(): IRelationalDbState<Schema> => {
  const pglite = usePGliteDB();

  const relationalDb = useMemo<IRelationalDbState<Schema>>(() => {
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
