import {
  parseAttachmentStorageConfig,
  type AttachmentStorageConfig,
} from "@powerhousedao/reactor-attachments";
import { childLogger, type ILogger } from "document-model";
import type { GatewayAdapterType } from "./graphql/gateway/factory.js";
import { resolveWsCredentialRecheckIntervalMs } from "./graphql/ws-credential-monitor.js";
import { DEFAULT_PERMISSION_CACHE_TTL_MS } from "./services/permission-cache.js";

type Env = Readonly<Record<string, string | undefined>>;

/** reactor-api settings env can supply; an unset key means "not configured here". */
export type ReactorApiConfig = {
  server?: {
    /** Route prefix for GraphQL, the explorer, package routes and webhooks. */
    basePath?: string;
    gatewayAdapter?: GatewayAdapterType;
    /** Origin advertised in webhook URLs; a bare domain gets `https://`. */
    publicUrl?: string;
  };
  auth?: {
    enabled?: boolean;
    admins?: string[];
    resolveIdentity?: boolean;
    requireAuthenticatedCaller?: boolean;
    requireAuthenticatedCallerExemptPaths?: string[];
    attachmentReadsFollowDocumentPolicy?: boolean;
    defaultProtection?: boolean;
    documentPermissions?: { enabled?: boolean; cacheTtlMs?: number };
    skipCredentialVerification?: boolean;
    credentialCacheTtlMs?: number;
    wsRecheckMs?: number;
  };
  inspection?: { admin?: boolean };
  attachments?: { storage?: AttachmentStorageConfig };
};

const defaultLogger = childLogger(["reactor-api", "config"]);

/** The reactor-api settings `env` names; keys it does not set stay undefined. */
export function reactorApiConfigFromEnv(
  env: Env,
  logger: ILogger = defaultLogger,
): ReactorApiConfig {
  const config: ReactorApiConfig = {
    server: pruned({
      basePath: env.BASE_PATH || undefined,
      gatewayAdapter: parseGatewayAdapter(env.GATEWAY_ADAPTER, logger),
      publicUrl:
        (env.PUBLIC_URL ?? env.RENDER_EXTERNAL_URL) ||
        env.HEROKU_APP_DEFAULT_DOMAIN_NAME ||
        undefined,
    }),
    auth: pruned({
      enabled: exactlyTrue(env.AUTH_ENABLED),
      admins: env.ADMINS?.split(",").map((a) => a.toLowerCase()),
      resolveIdentity: exactlyTrue(env.RESOLVE_CALLER_IDENTITY),
      requireAuthenticatedCaller: exactlyTrue(env.REQUIRE_AUTHENTICATED_CALLER),
      requireAuthenticatedCallerExemptPaths:
        env.REQUIRE_AUTHENTICATED_CALLER_EXEMPT_PATHS?.split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      attachmentReadsFollowDocumentPolicy: exactlyTrue(
        env.ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY,
      ),
      defaultProtection:
        env.DEFAULT_PROTECTION === undefined
          ? undefined
          : env.DEFAULT_PROTECTION.toLowerCase() === "true",
      documentPermissions: pruned({
        enabled: exactlyTrue(env.DOCUMENT_PERMISSIONS_ENABLED),
        cacheTtlMs: env.DOCUMENT_PERMISSION_CACHE_TTL_MS?.trim()
          ? resolvePermissionCacheTtlMs(
              env.DOCUMENT_PERMISSION_CACHE_TTL_MS,
              logger,
            )
          : undefined,
      }),
      skipCredentialVerification: exactlyTrue(env.SKIP_CREDENTIAL_VERIFICATION),
      credentialCacheTtlMs: parseCredentialCacheTtlMs(
        env.CREDENTIAL_VERIFICATION_CACHE_TTL_MS,
        logger,
      ),
      wsRecheckMs:
        env.WS_CREDENTIAL_RECHECK_INTERVAL_MS === undefined
          ? undefined
          : resolveWsCredentialRecheckIntervalMs(
              env.WS_CREDENTIAL_RECHECK_INTERVAL_MS,
              logger,
            ),
    }),
    inspection: pruned({ admin: exactlyTrue(env.INSPECTION_ADMIN_ENABLED) }),
    attachments: pruned({
      storage:
        env.PH_ATTACHMENT_STORAGE === undefined
          ? undefined
          : parseAttachmentStorageConfig(env),
    }),
  };
  return pruned(config) ?? {};
}

function pruned<T extends object>(value: T): T | undefined {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as T) : undefined;
}

function exactlyTrue(value: string | undefined): boolean | undefined {
  return value === undefined ? undefined : value === "true";
}

function parseGatewayAdapter(
  value: string | undefined,
  logger: ILogger,
): GatewayAdapterType | undefined {
  if (value === undefined) return undefined;
  if (value === "apollo" || value === "mercurius" || value === "stitching") {
    return value;
  }
  logger.warn(`Unknown GATEWAY_ADAPTER="${value}"; falling back to "apollo"`);
  return undefined;
}

// Invalid falls back to the renown source's default, which the server applies.
function parseCredentialCacheTtlMs(
  raw: string | undefined,
  logger: ILogger,
): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (raw.trim() !== "" && Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  logger.warn(
    `Ignoring invalid CREDENTIAL_VERIFICATION_CACHE_TTL_MS="${raw}" (expected a non-negative number of milliseconds; 0 disables caching) — using the renown source's default`,
  );
  return undefined;
}

/** `DOCUMENT_PERMISSION_CACHE_TTL_MS` in ms (0 disables); invalid warns and uses the default. */
export function resolvePermissionCacheTtlMs(
  raw: string | undefined,
  logger: ILogger,
): number {
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PERMISSION_CACHE_TTL_MS;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 0) {
    logger.warn(
      `Ignoring DOCUMENT_PERMISSION_CACHE_TTL_MS=${raw}: expected a non-negative integer; using ${DEFAULT_PERMISSION_CACHE_TTL_MS} ms`,
    );
    return DEFAULT_PERMISSION_CACHE_TTL_MS;
  }
  return parsed;
}
