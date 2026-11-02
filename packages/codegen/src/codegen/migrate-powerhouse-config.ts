import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { isDeepStrictEqual } from "util";

/** `connect.instance` as `ph init` wrote it before leaving it out: every field
 * at its default. A block someone wrote has fewer keys or other values. */
export const SCAFFOLDED_CONNECT_INSTANCE = Object.freeze({
  namespace: null,
  reactorWorker: false,
  multiReactor: false,
});

/** Drops the old scaffold's `connect.instance`, whose `multiReactor: false`
 * hid the Switchboard's drives from Vetra Studio; true when it did. */
export function migratePowerhouseConfig(projectDir: string): boolean {
  const file = join(projectDir, "powerhouse.config.json");
  let config: { connect?: { instance?: unknown } };
  try {
    config = JSON.parse(readFileSync(file, "utf8")) as typeof config;
  } catch {
    // Missing or hand-broken: the author's to fix.
    return false;
  }
  const connect = config.connect;
  if (
    !connect ||
    !isDeepStrictEqual(connect.instance, SCAFFOLDED_CONNECT_INSTANCE)
  ) {
    return false;
  }
  delete connect.instance;
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}
