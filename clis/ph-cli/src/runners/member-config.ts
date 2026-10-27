import fs from "node:fs";
import {
  assertProtocolConsistency,
  primaryBackend,
  reactorBlockToSwitchboardConfig,
  type ReactorConfig,
} from "@powerhousedao/host-core";
import {
  mergeSwitchboardConfig,
  switchboardConfigLayerSchema,
  type SwitchboardConfigInput,
} from "@powerhousedao/switchboard/config";
import { switchboardConfigFromEnv } from "@powerhousedao/switchboard/config/env";
import type { ILogger } from "document-model";

type Env = Readonly<Record<string, string | undefined>>;

/** `config.switchboard`: a member's own switchboard config. The runner owns
 * the omitted keys (runner.port, the dev verb, reactor.drives, runner.plugins);
 * the log level and processor config are process-wide or not JSON. */
export const memberSwitchboardConfigSchema = switchboardConfigLayerSchema([
  "logLevel",
  "server.port",
  "server.dev",
  "drive",
  "remoteDrives",
  "features.pluginHost",
  "processorConfig",
]);

export interface SwitchboardMember {
  reactor?: ReactorConfig;
  config?: { switchboard?: SwitchboardConfigInput };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/** The dotted keys both layers set. */
export function overlappingKeys(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  path = "",
): string[] {
  return Object.entries(b).flatMap(([key, value]) => {
    const other = a[key];
    if (value === undefined || other === undefined) return [];
    const at = path ? `${path}.${key}` : key;
    return isPlainObject(value) && isPlainObject(other)
      ? overlappingKeys(other, value, at)
      : [at];
  });
}

/** Each `config.switchboard` key the reactor block already sets. */
export function reactorBlockConflicts(member: SwitchboardMember): string[] {
  const own = member.config?.switchboard;
  if (!own) return [];
  return overlappingKeys(
    reactorBlockToSwitchboardConfig(member.reactor) as Record<string, unknown>,
    own as Record<string, unknown>,
  ).map(
    (key) =>
      `config.switchboard.${key} is also set by the reactor block; set it in one place.`,
  );
}

/**
 * The member's switchboard config under the runner's own arguments: its
 * reactor block, then `config.switchboard`, then the operator's env over both
 * (an env var the operator set wins, as it did when the block was written to
 * the env set-if-absent). Reads `env`; writes nothing.
 */
export function memberSwitchboardConfig(
  member: SwitchboardMember,
  env: Env,
  options: { pluginHost: boolean; logger?: ILogger },
): SwitchboardConfigInput {
  return mergeSwitchboardConfig(
    reactorBlockToSwitchboardConfig(member.reactor),
    member.config?.switchboard ?? {},
    switchboardConfigFromEnv(env, { logger: options.logger }),
    // A declared composition turns the plugin host on, whatever the env says.
    options.pluginHost ? { features: { pluginHost: true } } : {},
  );
}

/**
 * Fails when the operator's env contradicts the member's protocol block, then
 * creates the block's path-storage dir (the server's own mkdir is not
 * recursive).
 */
export function prepareMemberStorage(
  reactor: ReactorConfig | undefined,
  env: Env,
  hostFileLabel: string,
): void {
  assertProtocolConsistency(reactor?.protocol, { ...env }, hostFileLabel);
  const storage = primaryBackend(reactor)?.storage;
  if (storage?.kind !== "path" || !storage.dataDir) return;
  // `ph run` resolves `$env` and the `${userData}` sugar before the verb;
  // an unresolved one here would mkdir a literal "${userData}" folder.
  if (/\$\{(userData|projectRoot)\}/.test(storage.dataDir)) {
    throw new Error(
      `${hostFileLabel}: storage.dataDir "${storage.dataDir}" was not resolved; resolve the host (resolveHostOutputs) before starting it.`,
    );
  }
  fs.mkdirSync(storage.dataDir, { recursive: true });
}

/** The verb owns dev mode; `runner.dev` is the host-file spelling of it. */
export function switchboardDevMode(
  devVerb: boolean,
  runner: { dev?: boolean },
): boolean {
  return devVerb || runner.dev === true;
}
