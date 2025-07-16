import { type PGlite } from "@electric-sql/pglite";
import {
  type LiveNamespace,
  type PGliteWithLive,
} from "@electric-sql/pglite/live";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { useMemo } from "react";
import { usePGliteDB } from "../../pglite/hooks/usePGlite.js";

// Type for Kysely instance enhanced with live capabilities
export type EnhancedKysely<Schema> = Kysely<Schema> & { live: LiveNamespace };

export interface IRelationalDb<Schema> {
  db: EnhancedKysely<Schema> | null;
  isLoading: boolean;
  error: Error | null;
}

// Custom initializer that creates enhanced Kysely instance with live capabilities
function createEnhancedKysely<Schema>(
  pgliteInstance: PGliteWithLive,
): EnhancedKysely<Schema> {
  const db = new Kysely<Schema>({
    dialect: new PGliteDialect(pgliteInstance as unknown as PGlite),
  });

  // Inject the live namespace with proper typing
  (db as EnhancedKysely<Schema>).live = pgliteInstance.live;

  return db as EnhancedKysely<Schema>;
}

export const useRelationalDb = <Schema>() => {
  const pglite = usePGliteDB();

  const operationalDB = useMemo<IRelationalDb<Schema>>(() => {
    if (!pglite.db || pglite.isLoading || pglite.error) {
      return {
        db: null,
        isLoading: pglite.isLoading,
        error: pglite.error,
      };
    }

    const db = createEnhancedKysely<Schema>(pglite.db);

    return {
      db,
      isLoading: false,
      error: null,
    };
  }, [pglite]);

  return operationalDB;
};
