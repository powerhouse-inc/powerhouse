import {
  parseAttachmentStorageConfig,
  type AttachmentStorageConfig,
} from "@powerhousedao/reactor-attachments";
import {
  resolveCredentialCacheTtlMs,
  resolvePermissionCacheTtlMs,
  resolveRenownConfig,
} from "@powerhousedao/reactor-api";
import type { ILogger } from "document-model";
import { GATEWAY_ADAPTERS, type SwitchboardConfigInput } from "./schema.js";

type Env = Readonly<Record<string, string | undefined>>;
type Logger = Pick<ILogger, "warn">;

// Interim copy of reactor-api's env reads, until its reactorApiConfigFromEnv.
export function reactorApiSectionsFromEnv(
  env: Env,
  logger: Logger,
): Pick<
  SwitchboardConfigInput,
  "server" | "auth" | "inspection" | "attachments"
> {
  return {
    server: {
      basePath: env.BASE_PATH || undefined,
      publicUrl:
        (env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL) ||
        env.HEROKU_APP_DEFAULT_DOMAIN_NAME ||
        undefined,
      gatewayAdapter: gatewayAdapterFromEnv(env.GATEWAY_ADAPTER, logger),
    },
    auth: authFromEnv(env, logger),
    inspection: { admin: flag(env.INSPECTION_ADMIN_ENABLED) },
    attachments: {
      storage: attachmentStorageFromEnv(env),
    },
  };
}

function authFromEnv(env: Env, logger: Logger): SwitchboardConfigInput["auth"] {
  const renownSource = renownSourceFromEnv(env, logger);
  return {
    enabled: flag(env.AUTH_ENABLED),
    resolveCallerIdentity: flag(env.RESOLVE_CALLER_IDENTITY),
    requireAuthenticatedCaller: flag(env.REQUIRE_AUTHENTICATED_CALLER),
    exemptPaths: env.REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS?.split(",")
      .map((path) => path.trim())
      .filter((path) => path.length > 0),
    attachmentReadsFollowDocumentPolicy: flag(
      env.ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY,
    ),
    admins: env.ADMINS?.split(",").map((a) => a.toLowerCase()),
    defaultProtection:
      env.DEFAULT_PROTECTION === undefined
        ? undefined
        : env.DEFAULT_PROTECTION.toLowerCase() === "true",
    documentPermissions: {
      enabled: flag(env.DOCUMENT_PERMISSIONS_ENABLED),
      cacheTtlMs: permissionCacheTtlFromEnv(
        env.DOCUMENT_PERMISSION_CACHE_TTL_MS,
        logger,
      ),
    },
    skipCredentialVerification: flag(env.SKIP_CREDENTIAL_VERIFICATION),
    allowInsecureSkipCredentialVerification: flag(
      env.ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION,
    ),
    credentialCacheTtlMs: credentialCacheTtlFromEnv(
      env.CREDENTIAL_VERIFICATION_CACHE_TTL_MS,
      renownSource ?? "remote",
      logger,
    ),
    wsRecheckMs: wsRecheckFromEnv(
      env.WS_CREDENTIAL_RECHECK_INTERVAL_MS,
      logger,
    ),
    renown: {
      source: renownSource,
      url: blankAsUnset(env.RENOWN_URL),
      switchboardUrl: blankAsUnset(env.SWITCHBOARD_URL),
    },
  };
}

function flag(raw: string | undefined): boolean | undefined {
  return raw === undefined ? undefined : raw === "true";
}

function blankAsUnset(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

// A set but invalid RENOWN_SOURCE still overrides the config file, as "remote".
function renownSourceFromEnv(
  env: Env,
  logger: Logger,
): "self" | "remote" | undefined {
  if (blankAsUnset(env.RENOWN_SOURCE) === undefined) return undefined;
  return resolveRenownConfig(undefined, env, logger as ILogger).source;
}

function gatewayAdapterFromEnv(
  raw: string | undefined,
  logger: Logger,
): (typeof GATEWAY_ADAPTERS)[number] | undefined {
  if (raw === undefined) return undefined;
  if ((GATEWAY_ADAPTERS as readonly string[]).includes(raw)) {
    return raw as (typeof GATEWAY_ADAPTERS)[number];
  }
  logger.warn(`Unknown GATEWAY_ADAPTER="${raw}"; falling back to "apollo"`);
  return undefined;
}

function permissionCacheTtlFromEnv(
  raw: string | undefined,
  logger: Logger,
): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const parsed = Number(raw);
  if (Number.isInteger(parsed) && parsed >= 0) return parsed;
  resolvePermissionCacheTtlMs(raw, logger as ILogger);
  return undefined;
}

function credentialCacheTtlFromEnv(
  raw: string | undefined,
  source: "self" | "remote",
  logger: Logger,
): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  resolveCredentialCacheTtlMs(raw, source, logger as ILogger);
  return undefined;
}

const DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS = 60_000;

function wsRecheckFromEnv(
  raw: string | undefined,
  logger: Logger,
): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  logger.warn(
    `Ignoring invalid WS_CREDENTIAL_RECHECK_INTERVAL_MS="${raw}" (expected a non-negative number of milliseconds; 0 disables the periodic re-check) — using ${DEFAULT_WS_CREDENTIAL_RECHECK_INTERVAL_MS}`,
  );
  return undefined;
}

function attachmentStorageFromEnv(
  env: Env,
): AttachmentStorageConfig | undefined {
  if (env.PH_ATTACHMENT_STORAGE === undefined) return undefined;
  return parseAttachmentStorageConfig(env);
}
