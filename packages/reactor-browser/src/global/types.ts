import type { PGliteWithLive } from "@electric-sql/pglite/live";
import type { IPowerhouseAnalytics } from "@powerhousedao/reactor-browser";

export interface PGliteState {
  db: PGliteWithLive | null;
  isLoading: boolean;
  error: Error | null;
}

export interface PowerhouseGlobal {
  analytics?: Promise<IPowerhouseAnalytics>;
  pglite?: PGliteState;
}

declare global {
  interface Window {
    powerhouse?: PowerhouseGlobal;
  }
}
