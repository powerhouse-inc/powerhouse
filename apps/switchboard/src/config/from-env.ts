import { parseCatchUpPriority } from "@powerhousedao/reactor";
import { resolvePgliteMaintenance } from "@powerhousedao/reactor-api/pglite-node";
import { resolvePgliteWorkerMemoryMb } from "@powerhousedao/reactor-api/pglite-node";
import { isSignaturePolicy } from "@powerhousedao/shared/document-model";
import { childLogger, type ILogger } from "document-model";
import {
  ATTACHMENT_URL_SIGNING_SECRET_ENV,
  resolveAttachmentUrlSigning,
} from "../attachments/url-signer.js";
import { parseNonNegativeInt } from "../env.mjs";
import { inspectionThrottleFromEnv } from "../inspection-throttle.mjs";
import { parseForcePgVersion } from "../pglite-version.js";
import { isPluginHostEnabled } from "../plugin-host-flag.mjs";
import { isPostgresUrl } from "../postgres-url.mjs";
import { privacyTimingsFromEnv } from "../privacy.mjs";
import { parseOnOff } from "../projection-worker.mjs";
import { resolveUnsupportedStoredDocuments } from "../unsupported-stored-documents.mjs";
import { parseWorkerCount, resolveHostPoolSize } from "../worker-pool.mjs";
import { parseDriveType } from "./drive-type.js";
import { reactorApiSectionsFromEnv } from "./from-env-reactor-api.js";
import {
  SWITCHBOARD_LOG_LEVELS,
  type SwitchboardConfigInput,
} from "./schema.js";

type Env = Readonly<Record<string, string | undefined>>;
type Logger = Pick<ILogger, "warn">;

export interface SwitchboardConfigFromEnvOptions {
  /** The bin's own keys (sb/config.ts) instead of PORT. */
  bin?: boolean;
  logger?: Logger;
}

/** Only the keys the env sets; today's boot errors throw with their messages. */
export function switchboardConfigFromEnv(
  env: Env,
  options: SwitchboardConfigFromEnvOptions = {},
): SwitchboardConfigInput {
  const logger = options.logger ?? childLogger(["switchboard", "config"]);
  const api = reactorApiSectionsFromEnv(env, logger);
  const reactorUrl = urlFromEnv(
    env.PH_REACTOR_DATABASE_URL ?? env.PH_SWITCHBOARD_DATABASE_URL,
  );
  const executorCount = parseWorkerCount(env.REACTOR_WORKERS);
  const executorOn = executorCount === "auto" || (executorCount ?? 0) > 0;
  const projectionOn = parseOnOff(env.REACTOR_PROJECTION_WORKER);
  const privacyOn = flag(env.PH_PRIVACY_ENABLED);
  const pgliteWorkers = openFeatureFlag(env.PH_PGLITE_WORKERS);

  return withoutUnset({
    logLevel: logLevelFromEnv(env.LOG_LEVEL, logger),
    server: {
      ...api.server,
      port: options.bin
        ? binPortFromEnv(env.PH_SWITCHBOARD_PORT)
        : portFromEnv(env.PORT),
    },
    storage: {
      reactor: { url: reactorUrl },
      readModel: {
        url: urlFromEnv(env.DATABASE_URL ?? env.PH_SWITCHBOARD_DATABASE_URL),
      },
      inMemory:
        env.PH_PGLITE_IN_MEMORY === undefined
          ? undefined
          : env.PH_PGLITE_IN_MEMORY === "1",
      userDataDir: env.PH_USER_DATA_DIR || undefined,
      pglite: {
        fsync:
          env.PH_PGLITE_FSYNC === undefined
            ? undefined
            : env.PH_PGLITE_FSYNC !== "0",
        workers: pgliteWorkers,
        workerMemoryMb: gated(pgliteWorkers !== false, () =>
          isBlank(env.PH_PGLITE_WORKER_MEMORY_MB)
            ? undefined
            : resolvePgliteWorkerMemoryMb(env),
        ),
        vacuumFull: vacuumFullFromEnv(env),
      },
      migratePglite: options.bin ? flag(env.PH_MIGRATE_PGLITE) : undefined,
      forcePgVersion: options.bin
        ? (parseForcePgVersion(env.PH_FORCE_PG_VERSION) ?? undefined)
        : undefined,
    },
    protocol: {
      featureFlags: {
        documentDecisions: flag(env.REACTOR_DOCUMENT_DECISIONS),
        authEnforcement: flag(env.REACTOR_AUTH_ENFORCEMENT),
        authGroups: flag(env.REACTOR_AUTH_GROUPS),
        authConditions: flag(env.REACTOR_AUTH_CONDITIONS),
      },
      createSignaturePolicy: createSignaturePolicyFromEnv(
        env.CREATE_SIGNATURE_POLICY,
      ),
      unsupportedStoredDocuments:
        env.REACTOR_UNSUPPORTED_STORED_DOCUMENTS?.trim()
          ? resolveUnsupportedStoredDocuments(undefined, env)
          : undefined,
      legacyProcessorIds:
        env.REACTOR_LEGACY_PROCESSOR_IDS === undefined
          ? undefined
          : env.REACTOR_LEGACY_PROCESSOR_IDS !== "false",
      maxSkipThreshold: maxSkipThresholdFromEnv(env.MAX_SKIP_THRESHOLD),
      catchUpPriority: catchUpPriorityFromEnv(env.PH_CATCH_UP_PRIORITY, logger),
    },
    auth: api.auth,
    inspection: {
      ...api.inspection,
      enabled: openFeatureFlag(env.INSPECTION_ENABLED),
      callsPerMinute: inspectionThrottleFromEnv(env).callsPerMinute,
    },
    workers: {
      executor: {
        count: executorCount,
        poolSize: gated(executorOn, () =>
          parseNonNegativeInt(
            env.REACTOR_DB_POOL_SIZE_WORKER,
            "REACTOR_DB_POOL_SIZE_WORKER",
          ),
        ),
        acquireTimeoutMs: gated(executorOn, () =>
          parseNonNegativeInt(
            env.REACTOR_DB_ACQUIRE_TIMEOUT_MS,
            "REACTOR_DB_ACQUIRE_TIMEOUT_MS",
          ),
        ),
      },
      hostPoolSize: gated(
        reactorUrl !== undefined && isPostgresUrl(reactorUrl),
        () =>
          isBlank(env.REACTOR_DB_POOL_SIZE_HOST)
            ? undefined
            : resolveHostPoolSize(env as NodeJS.ProcessEnv),
      ),
      projection: {
        enabled: projectionOn,
        poolSize: gated(projectionOn === true, () =>
          projectionPoolSizeFromEnv(env.REACTOR_DB_POOL_SIZE_PROJECTION),
        ),
      },
    },
    packages: {
      registryUrl: env.PH_REGISTRY_URL,
      registryPackages: env.PH_REGISTRY_PACKAGES?.split(",").map((p) =>
        p.trim(),
      ),
      dynamic: flag(env.DYNAMIC_MODEL_LOADING),
    },
    features: {
      mcp: openFeatureFlag(env.MCP_ENABLED),
      workflows: workflowsFromEnv(env.PH_WORKFLOWS_ENABLED),
      documentModelSubgraphs: openFeatureFlag(
        env.DOCUMENT_MODEL_SUBGRAPHS_ENABLED,
      ),
      pluginHost:
        env.FEATURE_PLUGIN_HOST_ENABLED === undefined
          ? undefined
          : isPluginHostEnabled(env),
      privacy: {
        enabled: privacyOn,
        deploymentSecret: env.PH_PRIVACY_DEPLOYMENT_SECRET,
        ...gated(privacyOn === true, () =>
          privacyTimingsFromEnv(env as NodeJS.ProcessEnv),
        ),
      },
    },
    attachments: {
      ...api.attachments,
      urlSigningSecret: urlSigningSecretFromEnv(env),
      downloadTargetMaxTtlSeconds: downloadTargetTtlFromEnv(
        env.ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS,
        logger,
      ),
      serviceUrl: env.PH_SWITCHBOARD_PUBLIC_URL,
    },
    drive: options.bin
      ? { documentType: parseDriveType(env.PH_DEFAULT_DRIVE_TYPE) }
      : undefined,
  }) as SwitchboardConfigInput;
}

function flag(raw: string | undefined): boolean | undefined {
  return raw === undefined ? undefined : raw === "true";
}

// As OpenFeature's EnvVarProvider reads a boolean.
function openFeatureFlag(raw: string | undefined): boolean | undefined {
  if (raw === "true") return true;
  if (raw === "false") return false;
  return undefined;
}

function isBlank(raw: string | undefined): boolean {
  return raw === undefined || raw.trim() === "";
}

// "" names no store: the server falls back to the default dir for it.
function urlFromEnv(raw: string | undefined): string | undefined {
  return raw ? raw : undefined;
}

// Today these throw only once their feature is on; off, a bad value is dropped.
function gated<T>(on: boolean, parse: () => T): T | undefined {
  if (on) return parse();
  try {
    return parse();
  } catch {
    return undefined;
  }
}

function logLevelFromEnv(
  raw: string | undefined,
  logger: Logger,
): (typeof SWITCHBOARD_LOG_LEVELS)[number] | undefined {
  if (!raw) return undefined;
  if ((SWITCHBOARD_LOG_LEVELS as readonly string[]).includes(raw)) {
    return raw as (typeof SWITCHBOARD_LOG_LEVELS)[number];
  }
  logger.warn(
    `Ignoring invalid LOG_LEVEL="${raw}" (expected one of ${SWITCHBOARD_LOG_LEVELS.join(", ")}); using info`,
  );
  return undefined;
}

function portFromEnv(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be a port number, got "${raw}"`);
  }
  return port;
}

// Not a number falls through to the config file, as the bin's own config does.
function binPortFromEnv(raw: string | undefined): number | undefined {
  return raw && !isNaN(Number(raw)) ? Number(raw) : undefined;
}

function vacuumFullFromEnv(env: Env) {
  // Throws on an unknown mode, with today's message.
  resolvePgliteMaintenance(env);
  const mode = env.PH_PGLITE_VACUUM_FULL?.trim().toLowerCase() || undefined;
  return {
    mode: mode as "off" | "quiet" | "forced" | undefined,
    aboveMb: nonNegativeNumber(env.PH_PGLITE_VACUUM_FULL_ABOVE_MB),
    quietMs: nonNegativeNumber(env.PH_PGLITE_VACUUM_FULL_QUIET_MS),
    maxDeferMs: nonNegativeNumber(env.PH_PGLITE_VACUUM_FULL_MAX_DEFER_MS),
  };
}

// Anything else is ignored, as resolvePgliteMaintenance ignores it.
function nonNegativeNumber(raw: string | undefined): number | undefined {
  if (isBlank(raw)) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function createSignaturePolicyFromEnv(
  value: string | undefined,
): "legacy" | "v2-required" | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (!isSignaturePolicy(raw)) {
    throw new Error(
      `CREATE_SIGNATURE_POLICY must be "legacy" or "v2-required", got "${raw}"`,
    );
  }
  return raw;
}

function maxSkipThresholdFromEnv(raw: string | undefined): number | undefined {
  const parsed = parseInt(raw ?? "", 10);
  return !isNaN(parsed) && parsed > 0 ? parsed : undefined;
}

function catchUpPriorityFromEnv(
  raw: string | undefined,
  logger: Logger,
): "dynamic" | number | undefined {
  if (raw === undefined) return undefined;
  const setting = parseCatchUpPriority(raw);
  if (setting?.mode === "fixed") return setting.level;
  if (setting) return "dynamic";
  logger.warn(
    `PH_CATCH_UP_PRIORITY=${JSON.stringify(raw)} is neither dynamic nor a level 0-7; using dynamic`,
  );
  return undefined;
}

function projectionPoolSizeFromEnv(raw: string | undefined) {
  const poolSize = parseNonNegativeInt(raw, "REACTOR_DB_POOL_SIZE_PROJECTION");
  if (poolSize !== undefined && poolSize < 1) {
    throw new Error(
      "REACTOR_DB_POOL_SIZE_PROJECTION must be at least 1; the projection worker cannot run without a pool",
    );
  }
  return poolSize;
}

// PH_WORKFLOWS_ENABLED also takes the 1/0 reactor-api took.
function workflowsFromEnv(raw: string | undefined): boolean | undefined {
  const trimmed = raw?.trim();
  if (trimmed === "1") return true;
  if (trimmed === "0") return false;
  return openFeatureFlag(raw);
}

function urlSigningSecretFromEnv(env: Env): string | undefined {
  const secret = env[ATTACHMENT_URL_SIGNING_SECRET_ENV];
  if (secret === undefined) return undefined;
  // Throws on a short or padded secret, with today's message.
  resolveAttachmentUrlSigning({ [ATTACHMENT_URL_SIGNING_SECRET_ENV]: secret });
  return secret;
}

function downloadTargetTtlFromEnv(
  raw: string | undefined,
  logger: Logger,
): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  logger.warn(
    `Ignoring invalid ATTACHMENT_DOWNLOAD_TARGET_MAX_TTL_SECONDS="${raw}" (expected a positive integer number of seconds) — using the default`,
  );
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

// A layer names only what it sets: no unset keys, no emptied sections.
function withoutUnset(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry === undefined) continue;
    if (isPlainObject(entry)) {
      const inner = withoutUnset(entry);
      if (Object.keys(inner).length > 0) result[key] = inner;
      continue;
    }
    result[key] = entry;
  }
  return result;
}
