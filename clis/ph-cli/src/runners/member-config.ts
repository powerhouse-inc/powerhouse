import fs from "node:fs";
import path from "node:path";
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
import { isDotenvDisabled } from "@powerhousedao/shared/clis/project-env";
import type { ILogger } from "document-model";
import dotenv from "dotenv";

type Env = Readonly<Record<string, string | undefined>>;

/** The operator's env, split by where each value came from. */
export interface MemberEnv {
  /** Set by the shell: wins over the host file. */
  shell: Env;
  /** Only in the project `.env`: under the host file. */
  dotenv: Env;
}

function readDotenv(cwd: string): Record<string, string> {
  try {
    return dotenv.parse(fs.readFileSync(path.join(cwd, ".env")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}

/**
 * Splits `env` into the shell's values and the `.env` the switchboard server
 * loads from `cwd` (the same file). A value equal to the file's counts as the
 * file's: once the server is imported, `env` holds the file's values too.
 */
export function memberEnvOf(env: Env, cwd: string = process.cwd()): MemberEnv {
  const file = isDotenvDisabled({ ...env }) ? {} : readDotenv(cwd);
  const shell: Record<string, string | undefined> = {};
  for (const [name, value] of Object.entries(env)) {
    if (file[name] === undefined || file[name] !== value) shell[name] = value;
  }
  const fromFile: Record<string, string> = {};
  for (const [name, value] of Object.entries(file)) {
    if (shell[name] === undefined) fromFile[name] = value;
  }
  return { shell, dotenv: fromFile };
}

/** `config.switchboard`: a member's own switchboard config. The omitted keys
 * live in the reactor block (storage, protocol, dynamic packages) or the
 * runner (port, dev verb, drives, plugins), or are process-wide or not JSON. */
export const memberSwitchboardConfigSchema = switchboardConfigLayerSchema([
  "logLevel",
  "server.port",
  "server.dev",
  "storage.reactor",
  "storage.readModel",
  "protocol",
  "packages.dynamic",
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
 * The deprecation notice for a block whose `readModel.url` still names the
 * reactor store too: nothing else names the store, as it did when
 * readModel.url rode `dbPath`.
 */
export function readModelAsReactorStore(
  reactor: ReactorConfig | undefined,
  env: Env,
  hostFileLabel: string,
): { url: string; warning: string } | undefined {
  const storage = reactorBlockToSwitchboardConfig(reactor).storage;
  const url = storage?.readModel?.url;
  if (
    !url ||
    storage.reactor ||
    env.PH_REACTOR_DATABASE_URL !== undefined ||
    env.PH_SWITCHBOARD_DATABASE_URL !== undefined
  ) {
    return undefined;
  }
  return {
    url,
    warning:
      `${hostFileLabel}: reactor readModel.url (${url}) also holds the reactor store, because no storage names one. ` +
      "This is deprecated: set the backend's storage explicitly (the same Postgres url, or a path dataDir).",
  };
}

/**
 * The member's switchboard config under the runner's own arguments: the
 * project `.env`, then its reactor block, then `config.switchboard`, then the
 * shell's env over all three. The block keeps the precedence it had as
 * set-if-absent env and `dbPath`: only a shell PH_REACTOR_DATABASE_URL
 * overrides its store, and no env var overrides its read model. Writes nothing.
 */
export async function memberSwitchboardConfig(
  member: SwitchboardMember,
  env: MemberEnv,
  options: { pluginHost: boolean; logger?: ILogger },
): Promise<SwitchboardConfigInput> {
  // Lazy: the env mapping loads reactor-api, which the runner module must not.
  const { switchboardConfigFromEnv } =
    await import("@powerhousedao/switchboard/config/env");
  const block = reactorBlockToSwitchboardConfig(member.reactor);
  const legacy = readModelAsReactorStore(member.reactor, env.shell, "");
  if (legacy) {
    block.storage = { ...block.storage, reactor: { url: legacy.url } };
  }
  const fromEnv = switchboardConfigFromEnv(env.shell, {
    logger: options.logger,
  });
  const storage = { ...fromEnv.storage };
  if (
    block.storage?.reactor &&
    env.shell.PH_REACTOR_DATABASE_URL === undefined
  ) {
    delete storage.reactor;
  }
  if (block.storage?.readModel) delete storage.readModel;
  return mergeSwitchboardConfig(
    switchboardConfigFromEnv(env.dotenv, { logger: options.logger }),
    block,
    member.config?.switchboard ?? {},
    { ...fromEnv, storage },
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
