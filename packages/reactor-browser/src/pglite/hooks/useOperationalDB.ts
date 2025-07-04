import { type PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { useMemo } from "react";
import { usePGliteDB } from "./usePGlite.js";

export interface OperationalDB<Schema> {
  db: Kysely<Schema> | null;
  isLoading: boolean;
  error: Error | null;
}

export const useOperationalDB = <Schema>() => {
  const pglite = usePGliteDB();

  const operationalDB = useMemo<OperationalDB<Schema>>(() => {
    if (!pglite.db || pglite.isLoading || pglite.error) {
      return {
        db: null,
        isLoading: pglite.isLoading,
        error: pglite.error,
      };
    }

    const db = new Kysely<Schema>({
      dialect: new PGliteDialect(pglite.db as unknown as PGlite),
    });

    return {
      db,
      isLoading: false,
      error: null,
    };
  }, [pglite]);

  return operationalDB;
};
