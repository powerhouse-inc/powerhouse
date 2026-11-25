import type { RenownConfig } from "@powerhousedao/reactor-api";
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
import { resolveWorkerPoolOptions } from "./worker-pool.mjs";

// The boot preconditions without the server: importing this reads no .env.

export {
  projectionWorkerIssues,
  reactorDbUrlOf,
  switchboardBootIssues,
  workerPoolIssues,
  type SwitchboardBootFacts,
} from "./boot-preconditions.mjs";

export interface BootFactsOptions {
  dev: boolean;
  /** The server's `dbPath` option (a host's readModel.url). */
  dbPath?: string;
  /** No longer read: no boot fact depends on `auth.renown`. */
  configuredRenown?: RenownConfig;
}

/** The server's boot facts from `env`; a parser error becomes an issue and its fact stays off. */
export function switchboardBootFactsFromEnv(
  env: NodeJS.ProcessEnv,
  options: BootFactsOptions,
): Promise<{ facts: SwitchboardBootFacts; issues: string[] }> {
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
  };
  return Promise.resolve({ facts, issues });
}

export interface BootFactsOfOptions {
  dev: boolean;
  /** No longer read: no boot fact depends on `auth.renown`. */
  configuredRenown?: RenownConfig;
}

/** The server's boot facts from the config it would start with. */
export function switchboardBootFactsOf(
  input: SwitchboardConfigInput,
  options: BootFactsOfOptions,
): Promise<SwitchboardBootFacts> {
  const config = switchboardConfigSchema.parse(input);
  const pool = resolveWorkerPoolOptions(
    { numWorkers: config.workers.executor.count },
    {},
  );
  return Promise.resolve({
    dev: options.dev || config.server.dev,
    workers: pool?.numWorkers ?? 0,
    projectionWorker: config.workers.projection.enabled,
    reactorDbUrl: config.storage.reactor.url,
    authEnforcement: config.protocol.featureFlags.authEnforcement,
  });
}
