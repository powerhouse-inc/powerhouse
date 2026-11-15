import type { ReactorConfig } from "@powerhousedao/host-core";
import {
  connectChromeConfigKeys,
  DEPRECATIONS_REMOVED_IN,
  formatDeprecation,
  presentConfigKeys,
} from "@powerhousedao/shared/clis/deprecations";

/**
 * Host file settings that still work and that DEPRECATIONS_REMOVED_IN
 * removes. A runner prints the line when it starts, so a run warns once per
 * host file. A scaffolded host file sets none of them.
 */

/** The `reactor.workflows` boolean: workflows are a listed plugin instead. */
export function reactorWorkflowsDeprecation(
  reactor: ReactorConfig | undefined,
  hostFile: string,
  plugin: string,
): string | undefined {
  if (reactor?.workflows === undefined) return undefined;
  return formatDeprecation(
    `${hostFile}: reactor.workflows is deprecated and stops working in ${DEPRECATIONS_REMOVED_IN}. ` +
      `Workflows are a plugin: "${plugin}" under runner.plugins switches them on, leaving it out switches them off. ` +
      "Remove the key.",
  );
}

/** Where the generic plugin's entry config takes each chrome key. */
const CHROME_ENTRY_KEYS: Readonly<Record<string, string>> = {
  "connect.drives.allowAddDrive": "allowAddDrive",
  "connect.drives.sections": "sections",
  "connect.drives.icons": "icons",
  "connect.home.background": "homeBackground",
};

/**
 * The top-level Connect chrome keys of a host without `runner.plugins`: only
 * the classic Connect boot reads them there. `config` is the host's connect
 * config block.
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
    `${hostFile}: ${keys.join(", ")} ${keys.length === 1 ? "is" : "are"} only read by the classic Connect boot, which ${DEPRECATIONS_REMOVED_IN} removes. ` +
      `List "@powerhousedao/connect/plugins/generic" under runner.plugins and set ${entryKeys.join(", ")} in its entry config.`,
  );
}
