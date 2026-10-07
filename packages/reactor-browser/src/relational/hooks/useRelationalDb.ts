import type { LiveNamespace, PGliteWithLive } from "@electric-sql/pglite/live";
import { createRelationalDb } from "@powerhousedao/reactor";
import type { IRelationalDb as IRelationalDbCore } from "@powerhousedao/shared/processors";
import { useMemo } from "react";
import { usePGliteDB } from "../../pglite/usePGlite.js";
import { relationalKysely } from "../utils/relational-dialect.js";

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
  options: RelationalDbOptions,
): RelationalDbWithLive<Schema> {
  const baseDb = relationalKysely<Schema>(pgliteInstance, options);
  const relationalDb = createRelationalDb(baseDb);

  // Inject the live namespace with proper typing
  const relationalDBWithLive =
    relationalDb as unknown as RelationalDbWithLive<Schema>;
  relationalDBWithLive.live = pgliteInstance.live;

  return relationalDBWithLive;
}

export type RelationalDbOptions = {
  /** Called once if the PGlite session becomes unusable; the caller decides how to recover. */
  onPoisoned?: (cause: Error) => void;
};

export const useRelationalDb = <Schema>(
  options: RelationalDbOptions = {},
): IRelationalDbState<Schema> => {
  const pglite = usePGliteDB();
  const { onPoisoned } = options;

  const relationalDb = useMemo<IRelationalDbState<Schema>>(() => {
    if (!pglite.db || pglite.isLoading || pglite.error) {
      return {
        db: null,
        isLoading: pglite.isLoading,
        error: pglite.error,
      };
    }

    const db = createRelationalDbWithLive<Schema>(pglite.db, { onPoisoned });

    return {
      db,
      isLoading: false,
      error: null,
    };
  }, [pglite, onPoisoned]);

  return relationalDb;
};
