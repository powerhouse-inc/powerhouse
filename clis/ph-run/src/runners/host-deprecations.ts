import {
  connectChromeConfigKeys,
  formatDeprecation,
  presentConfigKeys,
} from "@powerhousedao/shared/clis/deprecations";

/**
 * Host file settings that still work and have a newer place. A runner prints
 * the line when it starts, so a run warns once per host file. A scaffolded
 * host file sets none of them.
 */

/** Where the generic plugin's entry config takes each chrome key. */
const CHROME_ENTRY_KEYS: Readonly<Record<string, string>> = {
  "connect.drives.allowAddDrive": "allowAddDrive",
  "connect.drives.sections": "sections",
  "connect.drives.icons": "icons",
  "connect.home.background": "homeBackground",
};

/**
 * The top-level Connect chrome keys of a host without `runner.plugins`: only
 * the default composition reads them there, handing them to the generic
 * plugin. `config` is the host's connect config block.
 */
export function connectChromeDeprecation(
  config: Record<string, unknown> | undefined,
  composed: boolean,
  hostFile: string,
): string | undefined {
  if (composed) return undefined;
  const present = presentConfigKeys(
    { connect: config },
    connectChromeConfigKeys,
  );
  if (present.length === 0) return undefined;
  const keys = present.map((key) => `config.${key.slice("connect.".length)}`);
  const entryKeys = present.map((key) => CHROME_ENTRY_KEYS[key]);
  return formatDeprecation(
    `${hostFile}: ${keys.join(", ")} ${keys.length === 1 ? "is" : "are"} only read while the host has no runner.plugins, by the default composition. ` +
      `List "@powerhousedao/connect/plugins/generic" under runner.plugins and set ${entryKeys.join(", ")} in its entry config.`,
  );
}
