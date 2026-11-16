import { projectFiles } from "@powerhousedao/shared/clis";
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
    config = JSON.parse(projectFiles.read(file) ?? "") as typeof config;
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
  projectFiles.writeSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return true;
}

/** Moves `connect.branding.homeBackground`, where projects up to 6.2.3 set
 * it, to `connect.home.background`: the host files refuse the old key. A null
 * asked for the default and goes. A value moves, unless
 * `connect.home.background` is set, which wins. Returns the line to print,
 * or undefined when the key is absent. */
export function migrateHomeBackground(projectDir: string): string | undefined {
  const file = join(projectDir, "powerhouse.config.json");
  let config: {
    connect?: {
      branding?: Record<string, unknown>;
      home?: Record<string, unknown>;
    };
  };
  try {
    config = JSON.parse(projectFiles.read(file) ?? "") as typeof config;
  } catch {
    return undefined;
  }
  const branding = config.connect?.branding;
  if (
    !config.connect ||
    typeof branding !== "object" ||
    branding === null ||
    !("homeBackground" in branding)
  ) {
    return undefined;
  }
  const value = branding.homeBackground;
  delete branding.homeBackground;
  let line =
    "Removed connect.branding.homeBackground from powerhouse.config.json: it asked for the default";
  if (value !== null && value !== undefined) {
    if (config.connect.home?.background === undefined) {
      config.connect.home = { ...config.connect.home, background: value };
      line =
        "Moved connect.branding.homeBackground to connect.home.background in powerhouse.config.json";
    } else {
      line =
        "Removed connect.branding.homeBackground from powerhouse.config.json: connect.home.background is set and wins";
    }
  }
  projectFiles.writeSync(file, `${JSON.stringify(config, null, 2)}\n`);
  return line;
}
