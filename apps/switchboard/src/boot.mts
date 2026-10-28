import type {
  RenownConfig,
  resolveRenownConfig,
} from "@powerhousedao/reactor-api";
import type { ILogger } from "document-model";
import {
  reactorDbUrlOf,
  type SwitchboardBootFacts,
} from "./boot-preconditions.mjs";
import {
  switchboardConfigSchema,
  type SwitchboardConfigInput,
} from "./config/schema.js";
import { resolveProjectionWorkerOptions } from "./projection-worker.mjs";
import { resolveReactorFeatureFlags } from "./reactor-feature-flags.mjs";
import { renownLayers } from "./renown-layers.mjs";
import { resolveWorkerPoolOptions } from "./worker-pool.mjs";

// The boot preconditions without the server: importing this reads no .env.

export {
  projectionWorkerIssues,
  reactorDbUrlOf,
  switchboardBootIssues,
  workerPoolIssues,
  workerTrustPolicyIssue,
  type SwitchboardBootFacts,
} from "./boot-preconditions.mjs";

const noop = () => {};
const silent: ILogger = {
  level: "error",
  verbose: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  errorHandler: noop,
  child: () => silent,
};

// Loaded lazily: the boot preconditions stay importable without reactor-api.
async function loadResolveRenownConfig(): Promise<typeof resolveRenownConfig> {
  return (await import("@powerhousedao/reactor-api")).resolveRenownConfig;
}

export interface BootFactsOptions {
  dev: boolean;
  /** The server's `dbPath` option (a host's readModel.url). */
  dbPath?: string;
  /** powerhouse.config.json `auth.renown`. */
  configuredRenown?: RenownConfig;
}

/** The server's boot facts from `env`; a parser error becomes an issue and its fact stays off. */
export async function switchboardBootFactsFromEnv(
  env: NodeJS.ProcessEnv,
  options: BootFactsOptions,
): Promise<{ facts: SwitchboardBootFacts; issues: string[] }> {
  const resolveRenown = await loadResolveRenownConfig();
  const issues: string[] = [];
  let workers = 0;
  try {
    workers = resolveWorkerPoolOptions(undefined, env)?.numWorkers ?? 0;
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  let projectionWorker = false;
  try {
    projectionWorker = resolveProjectionWorkerOptions(undefined, env) !== null;
  } catch (error) {
    issues.push(error instanceof Error ? error.message : String(error));
  }
  const facts: SwitchboardBootFacts = {
    dev: options.dev,
    workers,
    projectionWorker,
    reactorDbUrl: reactorDbUrlOf(options.dbPath, env),
    authEnforcement:
      resolveReactorFeatureFlags(env).flags.authEnforcement === true,
    renownSource: resolveRenown(options.configuredRenown, env, silent).source,
  };
  return { facts, issues };
}

export interface BootFactsOfOptions {
  dev: boolean;
  /** powerhouse.config.json `auth.renown`. */
  configuredRenown?: RenownConfig;
}

/** The server's boot facts from the config it would start with. */
export async function switchboardBootFactsOf(
  input: SwitchboardConfigInput,
  options: BootFactsOfOptions,
): Promise<SwitchboardBootFacts> {
  const resolveRenown = await loadResolveRenownConfig();
  const config = switchboardConfigSchema.parse(input);
  const pool = resolveWorkerPoolOptions(
    { numWorkers: config.workers.executor.count },
    {},
  );
  return {
    dev: options.dev || config.server.dev,
    workers: pool?.numWorkers ?? 0,
    projectionWorker: config.workers.projection.enabled,
    reactorDbUrl: config.storage.reactor.url,
    authEnforcement: config.protocol.featureFlags.authEnforcement,
    renownSource: resolveRenown(
      renownLayers(options.configuredRenown, config.auth.renown),
      {},
      silent,
    ).source,
  };
}
