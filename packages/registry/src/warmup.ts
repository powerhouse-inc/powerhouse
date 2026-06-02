import type { CdnCache } from "./cdn.js";
import { isLocallyPublished } from "./packages.js";
import type { RegistryConfig } from "./types.js";

// The verdaccio listing already yields local-only, latest-per-name entries;
// we re-filter by `_attachments` and dedupe as a guard against backend changes.
const WARM_INTERVAL_MS = 30_000;
const WARM_CONCURRENCY = 8;

interface VerdaccioPackage {
  name: string;
  version?: string;
}

/**
 * Build a throttled warmer that extracts locally-published package tarballs
 * into the CDN cache. 30s minimum interval plus an in-flight guard prevent
 * redundant fan-out from readiness-probe traffic across pods.
 */
export function createWarmer(
  config: RegistryConfig,
  cdn: CdnCache,
): () => Promise<void> {
  let warmInFlight = false;
  let lastWarmAt = 0;

  return async function warm(): Promise<void> {
    if (warmInFlight) return;
    if (Date.now() - lastWarmAt < WARM_INTERVAL_MS) return;
    warmInFlight = true;
    try {
      const r = await fetch(
        `http://localhost:${config.port}/-/verdaccio/data/packages`,
      );
      if (!r.ok) {
        console.error(
          `[registry] verdaccio package listing returned ${r.status}`,
        );
        return;
      }
      const listed = (await r.json()) as VerdaccioPackage[];

      // Latest version per name (the listing yields one entry per package;
      // dedupe defensively), scoped to locally-published packages only.
      const latestByName = new Map<string, string>();
      for (const pkg of listed) {
        if (!pkg.version) continue;
        if (isLocallyPublished(config.storagePath, pkg.name) === false)
          continue;
        latestByName.set(pkg.name, pkg.version);
      }

      const targets = [...latestByName.entries()];
      let cursor = 0;
      const workers = Array.from({ length: WARM_CONCURRENCY }).map(async () => {
        while (cursor < targets.length) {
          const [name, version] = targets[cursor++];
          try {
            await cdn.extractTarball(name, version);
          } catch (err) {
            console.error(
              `[registry] failed to warm cache for ${name}@${version}:`,
              err,
            );
          }
        }
      });
      await Promise.all(workers);
      console.log(`[registry] /packages warm-up done (${targets.length} pkgs)`);
      // Throttle only after a successful cycle so failures (e.g. registry
      // not listening yet during startup) retry on the next call.
      lastWarmAt = Date.now();
    } catch (err) {
      console.error("[registry] /packages warm-up failed:", err);
    } finally {
      warmInFlight = false;
    }
  };
}
