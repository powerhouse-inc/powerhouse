import type { LiveNamespace, PGliteWithLive } from "@electric-sql/pglite/live";
import { createRelationalDb } from "@powerhousedao/reactor";
import type { IRelationalDb as IRelationalDbCore } from "@powerhousedao/shared/processors";
import { useEffect, useMemo } from "react";
import { usePGliteDB } from "../../pglite/usePGlite.js";
import {
  relationalKysely,
  subscribeRelationalPoisoned,
} from "../utils/relational-dialect.js";

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
  const baseDb = relationalKysely<Schema>(pgliteInstance);
  const relationalDb = createRelationalDb(baseDb);

  // Inject the live namespace with proper typing
  const relationalDBWithLive =
    relationalDb as unknown as RelationalDbWithLive<Schema>;
  relationalDBWithLive.live = pgliteInstance.live;

  return relationalDBWithLive;
}

export type RelationalDbOptions = {
  /**
   * Called once if the shared PGlite session becomes unusable; every hook that
   * passes one is told, and it unsubscribes on unmount. Recovery is the caller's.
   */
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

    const db = createRelationalDbWithLive<Schema>(pglite.db);

    return {
      db,
      isLoading: false,
      error: null,
    };
  }, [pglite]);

  useEffect(() => {
    if (!pglite.db || !onPoisoned) return;
    return subscribeRelationalPoisoned(pglite.db, onPoisoned);
  }, [pglite.db, onPoisoned]);

  return relationalDb;
};
