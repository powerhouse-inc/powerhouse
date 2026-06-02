import { invalidateReactorPgMajorCache } from "./pglite-runtime.js";
import { REACTOR_PGLITE_NAME } from "./storage-namespace.js";

export const PENDING_PG_SEED_KEY = "ph:pending-pg-seed";

/**
 * If the Debug Inspector requested a forced PG version reset, this runs
 * before the reactor is created on the subsequent page load: opens a fresh
 * PGlite of the requested major against the reactor data dir, lets `initdb`
 * populate `PG_VERSION`, then closes. The next step of app boot then
 * detects this fresh data dir and picks the matching runtime.
 */
export async function seedPendingPgVersion(): Promise<void> {
  const raw = localStorage.getItem(PENDING_PG_SEED_KEY);
  if (!raw) return;

  const major = parseInt(raw, 10);
  console.info(`[pglite-seed] Seeding fresh PG${major} data dir...`);

  try {
    if (major === 16) {
      const { PGlite } = await import("pglite-legacy-02");
      const pg = new PGlite(`idb://${REACTOR_PGLITE_NAME}`);
      try {
        await pg.waitReady;
      } finally {
        await pg.close();
      }
    } else if (major === 17) {
      const { PGlite } = await import("@electric-sql/pglite");
      const pg = new PGlite(`idb://${REACTOR_PGLITE_NAME}`);
      try {
        await pg.waitReady;
      } finally {
        await pg.close();
      }
    } else {
      console.warn(`[pglite-seed] Unsupported version ${raw}, skipping`);
      return;
    }
    console.info(`[pglite-seed] Seeded PG${major} data dir.`);
  } finally {
    localStorage.removeItem(PENDING_PG_SEED_KEY);
    invalidateReactorPgMajorCache();
  }
}
