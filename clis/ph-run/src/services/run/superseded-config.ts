import {
  DEPRECATIONS_REMOVED_IN,
  formatDeprecation,
  presentConfigKeys,
  supersededConfigKeys,
} from "@powerhousedao/shared/clis/deprecations";
import fs from "node:fs";
import path from "node:path";

/**
 * P2.7: with hosts/ active, the powerhouse.config.json keys of the shared
 * `supersededConfigKeys` table are superseded by host.js structure and the
 * run path ignores them; each present key warns ONCE per run, naming its new
 * home and the release that refuses it.
 */

/** Warn once per run for each superseded key present in the project config.
 * Returns the warned keys (for tests). Never throws: a malformed config is
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
  const warned = presentConfigKeys(config, Object.keys(supersededConfigKeys));
  for (const key of warned) {
    warn(
      formatDeprecation(
        `powerhouse.config.json "${key}" is ignored by \`ph run\` and is an error in ${DEPRECATIONS_REMOVED_IN}. ` +
          `Set ${supersededConfigKeys[key]} and remove the key.`,
      ),
    );
  }
  return warned;
}
