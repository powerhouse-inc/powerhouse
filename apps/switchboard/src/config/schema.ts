import type { ReactorApiConfig } from "@powerhousedao/reactor-api";
import type { AttachmentStorageConfig } from "@powerhousedao/reactor-attachments";
import { z } from "zod";

// Zod at runtime only: the monitor, workers and host validation load this without the server.

export const SWITCHBOARD_LOG_LEVELS = [
  "verbose",
  "debug",
  "info",
  "warn",
  "error",
] as const;

export const SWITCHBOARD_DRIVE_DOCUMENT_TYPES = [
  "powerhouse/document-drive",
  "powerhouse/reactor-drive",
] as const;

const port = z.number().int().min(0).max(65535);
const nonNegativeInt = z.number().int().min(0);
const positiveInt = z.number().int().min(1);
const nonNegative = z.number().min(0);
const positive = z.number().positive();

const serverSchema = z.object({
  port: port.default(4001),
  strictPort: z.boolean().default(false),
  basePath: z.string().default("/"),
  /** Origin advertised in webhook URLs; a bare domain gets a scheme at use. */
  publicUrl: z.string().optional(),
  gatewayAdapter: z
    .enum(["apollo", "mercurius", "stitching"])
    .default("apollo"),
  https: z
    .union([
      z.boolean(),
      z.object({ keyPath: z.string(), certPath: z.string() }),
    ])
    .optional(),
  dev: z.boolean().default(false),
});

const vacuumFullSchema = z.object({
  mode: z.enum(["off", "quiet", "forced"]).default("off"),
  aboveMb: nonNegative.optional(),
  quietMs: nonNegative.optional(),
  maxDeferMs: nonNegative.optional(),
});

const keyframeRuleSchema = z.strictObject({
  interval: positiveInt.optional(),
  /** Null keeps every keyframe. */
  keep: positiveInt.nullable().optional(),
});

/** See `KeyframeSettings` in the reactor. */
const keyframesSchema = z.strictObject({
  default: keyframeRuleSchema.optional(),
  types: z.record(z.string(), keyframeRuleSchema).optional(),
});

const storageSchema = z.object({
  /** Postgres URL or PGlite data dir; unset uses the default dir. */
  reactor: z.object({ url: z.string().min(1).optional() }).prefault({}),
  /** Postgres URL or PGlite data dir; unset uses the default dir. */
  readModel: z.object({ url: z.string().min(1).optional() }).prefault({}),
  inMemory: z.boolean().default(false),
  /** Relocates the `.ph` tree (stores, identity) under this root. */
  userDataDir: z.string().min(1).optional(),
  pglite: z
    .object({
      fsync: z.boolean().default(true),
      workers: z.boolean().default(true),
      workerMemoryMb: positiveInt.optional(),
      vacuumFull: vacuumFullSchema.prefault({}),
    })
    .prefault({}),
  migratePglite: z.boolean().default(false),
  forcePgVersion: z.union([z.literal(16), z.literal(17)]).optional(),
  /** Unset: `reactor.keyframes` of the project config, then the built-in rule. */
  keyframes: keyframesSchema.optional(),
});

const protocolSchema = z.object({
  featureFlags: z
    .object({
      documentDecisions: z.boolean().default(false),
      authEnforcement: z.boolean().default(false),
      authGroups: z.boolean().default(false),
      authConditions: z.boolean().default(false),
    })
    .prefault({}),
  /** Requested policy; without a signer the boot still falls back to legacy. */
  createSignaturePolicy: z
    .enum(["legacy", "v2-required"])
    .default("v2-required"),
  unsupportedStoredDocuments: z.enum(["refuse", "read-only"]).default("refuse"),
  legacyProcessorIds: z.boolean().default(true),
  maxSkipThreshold: positiveInt.optional(),
  catchUpPriority: z
    .union([z.literal("dynamic"), z.number().int().min(0).max(7)])
    .default("dynamic"),
  /** What processors record about their time. */
  processorTiming: z.enum(["off", "basic", "detailed"]).default("basic"),
  processorTimingWindowMs: positiveInt.default(60_000),
  /** At `detailed`: an `onOperations` call over this logs a warning. */
  processorSlowBatchMs: positiveInt.default(1_000),
  /** Above 0: logs the slowest processors this often while catching up. */
  processorTimingLogMs: nonNegativeInt.default(0),
});

const memoryTelemetrySchema = z.object({
  enabled: z.boolean().default(false),
  intervalMs: z.number().int().min(1000).default(30_000),
  /** `memory`, the ring, is always on while telemetry runs. */
  outputs: z
    .array(z.enum(["memory", "file", "console"]))
    .default(["memory", "file"]),
  file: z
    .object({
      path: z.string().min(1).optional(),
      maxMb: positiveInt.default(10),
      keep: positiveInt.default(5),
    })
    .prefault({}),
  ringSize: positiveInt.default(720),
  consoleIntervalMs: positiveInt.default(300_000),
  workers: z.boolean().default(true),
  windowMin: positiveInt.default(30),
});

const telemetrySchema = z.object({
  memory: memoryTelemetrySchema.prefault({}),
  /** Under it go the JSONL files and heap snapshots; unset: `<phDir>/telemetry`. */
  dir: z.string().min(1).optional(),
  heapSnapshotDir: z.string().min(1).optional(),
});

const authSchema = z.object({
  enabled: z.boolean().default(false),
  /** Unset follows `enabled`. */
  resolveIdentity: z.boolean().optional(),
  requireAuthenticatedCaller: z.boolean().default(false),
  requireAuthenticatedCallerExemptPaths: z.array(z.string()).default([]),
  admins: z.array(z.string()).default([]),
  defaultProtection: z.boolean().default(false),
  attachmentReadsFollowDocumentPolicy: z.boolean().default(false),
  documentPermissions: z
    .object({
      enabled: z.boolean().default(false),
      cacheTtlMs: nonNegativeInt.optional(),
    })
    .prefault({}),
  skipCredentialVerification: z.boolean().default(false),
  /** Unset: 0 with a "self" renown source, else the AuthService default. */
  credentialCacheTtlMs: nonNegative.optional(),
  wsRecheckMs: nonNegative.optional(),
  renown: z
    .object({
      source: z.enum(["self", "remote"]).optional(),
      url: z.string().min(1).optional(),
      switchboardUrl: z.string().min(1).optional(),
    })
    .prefault({}),
});

const inspectionSchema = z.object({
  enabled: z.boolean().default(true),
  admin: z.boolean().default(false),
  callsPerMinute: positiveInt.optional(),
});

const workersSchema = z.object({
  executor: z
    .object({
      count: z.union([nonNegativeInt, z.literal("auto")]).default(0),
      poolSize: nonNegativeInt.default(2),
      acquireTimeoutMs: nonNegativeInt.default(5000),
    })
    .prefault({}),
  hostPoolSize: positiveInt.default(16),
  projection: z
    .object({
      enabled: z.boolean().default(false),
      poolSize: positiveInt.default(8),
    })
    .prefault({}),
});

const packagesSchema = z.object({
  registryUrl: z.string().optional(),
  registryPackages: z.array(z.string()).default([]),
  dynamic: z.boolean().default(false),
  list: z.array(z.string()).default([]),
  disableLocal: z.boolean().default(false),
});

const privacySchema = z.object({
  enabled: z.boolean().default(false),
  deploymentSecret: z.string().optional(),
  intervalMs: positive.optional(),
  deadlineMs: positive.optional(),
  markerGraceMs: positive.optional(),
  purgeTimeoutMs: positive.optional(),
});

const featuresSchema = z.object({
  /** Unset: on unless a plugin composition leaves it out. */
  mcp: z.boolean().optional(),
  /** Unset: the config file's `workflows.enabled`, then off. */
  workflows: z.boolean().optional(),
  documentModelSubgraphs: z.boolean().default(true),
  pluginHost: z.boolean().default(false),
  privacy: privacySchema.prefault({}),
});

const s3Schema = z.object({
  endpoint: z.string(),
  region: z.string(),
  bucket: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  prefix: z.string(),
  forcePathStyle: z.boolean(),
  uploadTtlSeconds: positiveInt,
  downloadTtlSeconds: positiveInt,
});

const attachmentsSchema = z.object({
  storage: z
    .discriminatedUnion("kind", [
      z.object({ kind: z.literal("filesystem") }),
      z.object({ kind: z.literal("s3"), s3: s3Schema }),
    ])
    .default({ kind: "filesystem" }),
  /** Unset: production refuses signed downloads, elsewhere a per-process secret. */
  urlSigningSecret: z.string().optional(),
  downloadTargetMaxTtlSeconds: positiveInt.optional(),
  /** Unset: `http(s)://localhost:<port>`. */
  serviceUrl: z.string().optional(),
});

const identitySchema = z.object({
  keypairPath: z.string().optional(),
  requireExisting: z.boolean().optional(),
  baseUrl: z.string().optional(),
});

const driveSchema = z.looseObject({
  id: z.string().optional(),
  slug: z.string().optional(),
  documentType: z.enum(SWITCHBOARD_DRIVE_DOCUMENT_TYPES).optional(),
});

/** Every field is optional on input, so `z.input` is one configuration layer. */
export const switchboardConfigSchema = z.object({
  logLevel: z.enum(SWITCHBOARD_LOG_LEVELS).default("info"),
  server: serverSchema.prefault({}),
  storage: storageSchema.prefault({}),
  protocol: protocolSchema.prefault({}),
  telemetry: telemetrySchema.prefault({}),
  auth: authSchema.prefault({}),
  inspection: inspectionSchema.prefault({}),
  workers: workersSchema.prefault({}),
  packages: packagesSchema.prefault({}),
  features: featuresSchema.prefault({}),
  attachments: attachmentsSchema.prefault({}),
  identity: identitySchema.optional(),
  drive: driveSchema.optional(),
  remoteDrives: z.array(z.string()).default([]),
  configFile: z.string().optional(),
  processorConfig: z.map(z.string(), z.unknown()).optional(),
});

/**
 * One layer's own schema: every key optional, no defaults (they would
 * override the layers below), unknown keys refused. `omit` drops dotted
 * paths the caller sets elsewhere.
 */
export function switchboardConfigLayerSchema(
  omit: readonly string[] = [],
): z.ZodType<SwitchboardConfigInput, SwitchboardConfigInput> {
  return layerOf(switchboardConfigSchema, "", new Set(omit)) as z.ZodType<
    SwitchboardConfigInput,
    SwitchboardConfigInput
  >;
}

function layerOf(
  schema: z.ZodType,
  path: string,
  omit: Set<string>,
): z.ZodType {
  const def = schema.def as { type: string; innerType?: z.ZodType };
  if (
    (def.type === "default" ||
      def.type === "prefault" ||
      def.type === "optional") &&
    def.innerType
  ) {
    return layerOf(def.innerType, path, omit);
  }
  if (!(schema instanceof z.ZodObject)) return schema;
  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(
    schema.shape as Record<string, z.ZodType>,
  )) {
    const at = path ? `${path}.${key}` : key;
    if (omit.has(at)) continue;
    shape[key] = layerOf(field, at, omit).optional();
  }
  const catchall = schema.def.catchall as z.ZodType | undefined;
  return catchall && catchall.def.type !== "never"
    ? z.looseObject(shape)
    : z.strictObject(shape);
}

export type SwitchboardConfig = z.output<typeof switchboardConfigSchema>;

/** One configuration layer: any subset of {@link SwitchboardConfig}. */
export type SwitchboardConfigInput = z.input<typeof switchboardConfigSchema>;

// The sections reactor-api reads are ReactorApiConfig's, under its names.
type Section<T> = NonNullable<T>;
type MissingKeys<Api, Ours> = Exclude<keyof Section<Api>, keyof Ours>;
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
export type ReactorApiSectionsMatch = [
  Assert<
    Same<
      MissingKeys<ReactorApiConfig["server"], SwitchboardConfig["server"]>,
      never
    >
  >,
  Assert<
    Same<
      MissingKeys<ReactorApiConfig["auth"], SwitchboardConfig["auth"]>,
      never
    >
  >,
  Assert<
    Same<
      MissingKeys<
        Section<ReactorApiConfig["auth"]>["documentPermissions"],
        SwitchboardConfig["auth"]["documentPermissions"]
      >,
      never
    >
  >,
  Assert<
    Same<
      MissingKeys<
        ReactorApiConfig["inspection"],
        SwitchboardConfig["inspection"]
      >,
      never
    >
  >,
  Assert<
    Same<
      MissingKeys<
        ReactorApiConfig["attachments"],
        SwitchboardConfig["attachments"]
      >,
      never
    >
  >,
  Assert<ReactorApiConfig extends SwitchboardConfigInput ? true : false>,
  Assert<
    Pick<
      SwitchboardConfig,
      "server" | "auth" | "inspection" | "attachments"
    > extends ReactorApiConfig
      ? true
      : false
  >,
  Assert<
    Same<
      SwitchboardConfig["server"]["gatewayAdapter"],
      NonNullable<Section<ReactorApiConfig["server"]>["gatewayAdapter"]>
    >
  >,
  Assert<
    Same<SwitchboardConfig["attachments"]["storage"], AttachmentStorageConfig>
  >,
];

export { callerOverEnv, mergeSwitchboardConfig } from "./merge.js";
