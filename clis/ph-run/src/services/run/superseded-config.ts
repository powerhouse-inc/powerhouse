import { RunnerError } from "@powerhousedao/host-core";
import {
  presentConfigKeys,
  supersededConfigKeys,
  supersededConfigKeysError,
} from "@powerhousedao/shared/clis/deprecations";
import fs from "node:fs";
import path from "node:path";

/**
 * The powerhouse.config.json keys of the shared `supersededConfigKeys` table
 * are superseded by host.js structure and nothing reads them. A project that
 * still sets one is refused, so a setting can't be dropped unnoticed: the
 * error names each key, where its value lives now, and `ph migrate`.
 */

/** The superseded keys the project config sets. A missing or malformed config
 * sets none: it is the loader's problem, not this check's. */
export function findSupersededConfigKeys(projectRoot: string): string[] {
  let config: unknown;
  try {
    config = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "powerhouse.config.json"), "utf8"),
    );
  } catch {
    return [];
  }
  return presentConfigKeys(config, Object.keys(supersededConfigKeys));
}

/** Throw when the project config still sets a superseded key. */
export function refuseSupersededConfigKeys(projectRoot: string): void {
  const present = findSupersededConfigKeys(projectRoot);
  if (present.length > 0) {
    throw new RunnerError(supersededConfigKeysError(present));
  }
}
