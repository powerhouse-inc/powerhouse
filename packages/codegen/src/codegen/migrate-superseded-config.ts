import {
  POWERHOUSE_CONFIG_FILE,
  projectFiles,
} from "@powerhousedao/shared/clis";
import {
  connectChromeConfigKeys,
  presentConfigKeys,
  supersededConfigKeys,
} from "@powerhousedao/shared/clis/deprecations";
import { join } from "node:path";
import { isPlainObject } from "remeda";
import type { HostsTemplateOptions } from "templates";

/** The settings a run takes out of powerhouse.config.json for the host files. */
export type MovedHostSettings = Pick<
  HostsTemplateOptions,
  "connectRunner" | "switchboardHttps"
>;

type Outcome =
  // The host files take the value, under `home`.
  | { moved: MovedHostSettings; home: string }
  // The value asks for what a host does anyway.
  | { unneeded: string }
  // The value can't be carried as it is; `byHand` is where it would go.
  | { kept: string; byHand?: string };

const CONNECT_HOST = "hosts/connect/host.js";
const SWITCHBOARD_HOST = "hosts/switchboard/host.js";
const GENERIC_PLUGIN = "@powerhousedao/connect/plugins/generic";

function isHttps(
  value: unknown,
): value is true | { keyPath: string; certPath: string } {
  if (value === true) return true;
  return (
    isPlainObject(value) &&
    typeof value.keyPath === "string" &&
    typeof value.certPath === "string" &&
    Object.keys(value).length === 2
  );
}

// No switchboard reads the two storage keys when it starts: its store comes
// from the flags, the environment or the host file. Writing them into the
// host file would move the reactor's data, so they are left to the author.
function storageOutcome(key: string): Outcome {
  return {
    kept: "the switchboard does not read it when it starts, so moving it would change where the reactor keeps its data",
    byHand: supersededConfigKeys[key] ?? undefined,
  };
}

/** What happens to each superseded key, by the value the project set. */
const RULES: Readonly<Record<string, (value: unknown) => Outcome>> = {
  "studio.host": (value) =>
    typeof value === "string" && value !== ""
      ? {
          moved: { connectRunner: { host: value } },
          home: `runner.host in ${CONNECT_HOST}`,
        }
      : { kept: "it is not a host name" },
  "studio.openBrowser": (value) =>
    typeof value === "boolean"
      ? {
          moved: { connectRunner: { openBrowser: value } },
          home: `runner.openBrowser in ${CONNECT_HOST}`,
        }
      : { kept: "it is not true or false" },
  // The connect runner has no https option.
  "studio.https": (value) =>
    value === false
      ? { unneeded: "the Connect host serves http" }
      : { kept: "no host setting serves Connect over https" },
  // The switchboard runner takes https under its server config.
  "reactor.https": (value) => {
    if (value === false) {
      return { unneeded: "the switchboard host serves http unless told to" };
    }
    return isHttps(value)
      ? {
          moved: { switchboardHttps: value },
          home: `config.switchboard.server.https in ${SWITCHBOARD_HOST}`,
        }
      : { kept: "it is not true, false or a keyPath and certPath pair" };
  },
  "reactor.storage": () => storageOutcome("reactor.storage"),
  "switchboard.database.url": () => storageOutcome("switchboard.database.url"),
};

/** Where the generic plugin's entry config takes each chrome key. */
const CHROME_ENTRY_KEYS: Readonly<Record<string, string>> = {
  "connect.drives.allowAddDrive": "allowAddDrive",
  "connect.drives.sections": "sections",
  "connect.drives.icons": "icons",
  "connect.home.background": "homeBackground",
};

function valueAt(config: unknown, dottedKey: string): unknown {
  let cursor = config;
  for (const part of dottedKey.split(".")) {
    if (!isPlainObject(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

/* A block the removal empties goes too. */
function removeKey(config: Record<string, unknown>, dottedKey: string) {
  const parts = dottedKey.split(".");
  const parents = [config];
  let cursor = config;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!isPlainObject(next)) return;
    parents.push(next);
    cursor = next;
  }
  for (let index = parts.length - 1; index >= 0; index--) {
    delete parents[index][parts[index]];
    if (Object.keys(parents[index]).length > 0) break;
  }
}

function chromeLine(
  projectDir: string,
  config: unknown,
  hostsAdded: boolean,
): string | undefined {
  const present = presentConfigKeys(config, connectChromeConfigKeys);
  if (present.length === 0) return undefined;
  const keys = present.join(", ");
  if (hostsAdded) {
    return `${keys}: ${present.length === 1 ? "stays" : "stay"} in powerhouse.config.json; ${CONNECT_HOST} hands ${present.length === 1 ? "it" : "them"} to the generic plugin`;
  }
  const host = projectFiles.read(join(projectDir, CONNECT_HOST));
  if (host === undefined || host.includes(GENERIC_PLUGIN)) return undefined;
  const entryKeys = present.map((key) => CHROME_ENTRY_KEYS[key]).join(", ");
  return `${keys}: ${CONNECT_HOST} does not list "${GENERIC_PLUGIN}", the plugin that reads ${present.length === 1 ? "it" : "them"}. List it under runner.plugins and set ${entryKeys} in its entry config.`;
}

/**
 * Takes the powerhouse.config.json keys the host files supersede out of the
 * file. With `hostsAdded` (this run writes the host files) a value moves into
 * them: it is returned in `moved` and its key is removed. A project with host
 * files of its own keeps every key, since migrate does not edit those files.
 * A value that can't be carried as it is stays where it is. `lines` says
 * what happened to each key, and what is left to do by hand.
 */
export function migrateSupersededConfig(
  projectDir: string,
  hostsAdded: boolean,
): { moved: MovedHostSettings; lines: string[] } {
  const file = join(projectDir, POWERHOUSE_CONFIG_FILE);
  const moved: MovedHostSettings = {};
  const lines: string[] = [];
  let config: unknown;
  try {
    config = JSON.parse(projectFiles.read(file) ?? "");
  } catch {
    // Missing or hand-broken: the author's to fix.
    return { moved, lines };
  }
  if (!isPlainObject(config)) return { moved, lines };

  const removed: string[] = [];
  for (const key of presentConfigKeys(
    config,
    Object.keys(supersededConfigKeys),
  )) {
    const value = valueAt(config, key);
    // A key the table gained without a rule here is left to the author.
    const outcome: Outcome = RULES[key]?.(value) ?? {
      kept: "migrate has no rule for it",
      byHand: supersededConfigKeys[key] ?? undefined,
    };
    if ("kept" in outcome) {
      const byHand = outcome.byHand
        ? ` To use it, set ${outcome.byHand} and remove the key.`
        : "";
      lines.push(`${key}: kept, ${outcome.kept}.${byHand}`);
    } else if (!hostsAdded) {
      lines.push(
        "moved" in outcome
          ? `${key}: kept, migrate does not edit this project's host files. Set ${outcome.home} and remove the key.`
          : `${key}: kept; ${outcome.unneeded}, so the key can be removed.`,
      );
    } else if ("moved" in outcome) {
      moved.connectRunner = {
        ...moved.connectRunner,
        ...outcome.moved.connectRunner,
      };
      if (outcome.moved.switchboardHttps !== undefined) {
        moved.switchboardHttps = outcome.moved.switchboardHttps;
      }
      removed.push(key);
      lines.push(`${key}: moved to ${outcome.home}`);
    } else {
      removed.push(key);
      lines.push(
        `${key}: removed (${JSON.stringify(value)}); ${outcome.unneeded}`,
      );
    }
  }
  if (moved.connectRunner && Object.keys(moved.connectRunner).length === 0) {
    delete moved.connectRunner;
  }
  const chrome = chromeLine(projectDir, config, hostsAdded);
  if (chrome) lines.push(chrome);

  if (removed.length > 0) {
    for (const key of removed) removeKey(config, key);
    projectFiles.writeSync(file, `${JSON.stringify(config, null, 2)}\n`);
  }
  return { moved, lines };
}
