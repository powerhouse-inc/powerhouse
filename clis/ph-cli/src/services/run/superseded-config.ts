import fs from "node:fs";
import path from "node:path";

/**
 * P2.7 — the fixed legacy→hosts mapping table. With hosts/ active, these
 * powerhouse.config.json keys are superseded by host.js structure and the run
 * path ignores them; each present key warns ONCE per run, naming its new home.
 *
 * Keys the scaffolded host files REFERENCE (studio.port, reactor.port,
 * vetra.connectPort, and the WHOLE connect.* block — handed to the runtime
 * unchanged, connect.instance.* included) are expected to remain and are
 * deliberately absent from this table.
 */
const SUPERSEDED: Record<string, string> = {
  "studio.host": "hosts/connect/host.js → runner.host",
  "studio.https": "hosts/connect/host.js → runner.https",
  "studio.openBrowser": "hosts/connect/host.js → runner.openBrowser",
  "reactor.https": "hosts/switchboard/host.js → runner.https",
  "reactor.storage":
    "hosts/switchboard/host.js → reactor.backends.<name>.storage",
  "switchboard.database.url":
    "hosts/switchboard/host.js → reactor.backends.<name>.storage.url",
};

function lookup(config: unknown, dottedKey: string): unknown {
  let cursor: unknown = config;
  for (const part of dottedKey.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
}

/** Warn once per run for each superseded key present in the project config.
 * Returns the warned keys (for tests). Never throws — a malformed config is
 * the loader's problem, not the warner's. */
export function warnSupersededConfigKeys(
  projectRoot: string,
  warn: (message: string) => void = console.warn,
): string[] {
  let config: unknown;
  try {
    config = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "powerhouse.config.json"), "utf8"),
    );
  } catch {
    return [];
  }
  const warned: string[] = [];
  for (const [key, newHome] of Object.entries(SUPERSEDED)) {
    if (lookup(config, key) !== undefined) {
      warned.push(key);
      warn(
        `[ph run] powerhouse.config.json "${key}" is ignored in hosts projects — ` +
          `its home is now ${newHome}.`,
      );
    }
  }
  return warned;
}
