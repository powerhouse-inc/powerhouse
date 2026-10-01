import {
  binary,
  command,
  flag,
  number,
  option,
  optional,
  run,
  string,
  type Type,
} from "cmd-ts";
import {
  DEFAULT_PORT,
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "./src/constants.js";
import {
  runImportVerdaccioState,
  runMigrate,
  runRegistry,
  runWorker,
} from "./src/run.js";

// Where the registry keeps its files and state, shared by every role
const storageArgs = {
  storageDir: option({
    long: "storage-dir",
    type: string,
    defaultValue: () =>
      process.env.REGISTRY_STORAGE || DEFAULT_STORAGE_DIR_NAME,
    defaultValueIsSerializable: true,
  }),
  cdnCacheDir: option({
    long: "cdn-cache-dir",
    type: string,
    description:
      "Local data directory: processed packages and the database when no S3 bucket or Postgres URL is set",
    defaultValue: () =>
      process.env.REGISTRY_CDN_CACHE || DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
    defaultValueIsSerializable: true,
  }),
  s3Bucket: option({
    long: "s3-bucket",
    type: optional(string),
    defaultValue: () => process.env.S3_BUCKET,
    defaultValueIsSerializable: true,
  }),
  s3Endpoint: option({
    long: "s3-endpoint",
    type: optional(string),
    defaultValue: () => process.env.S3_ENDPOINT,
    defaultValueIsSerializable: true,
  }),
  s3Region: option({
    long: "s3-region",
    type: optional(string),
    defaultValue: () => process.env.S3_REGION,
    defaultValueIsSerializable: true,
  }),
  s3AccessKeyId: option({
    long: "s3-access-key-id",
    type: optional(string),
    defaultValue: () => process.env.S3_ACCESS_KEY_ID,
    defaultValueIsSerializable: true,
  }),
  s3SecretAccessKey: option({
    long: "s3-secret-access-key",
    type: optional(string),
    defaultValue: () => process.env.S3_SECRET_ACCESS_KEY,
    defaultValueIsSerializable: true,
  }),
  s3KeyPrefix: option({
    long: "s3-key-prefix",
    type: optional(string),
    defaultValue: () => process.env.S3_KEY_PREFIX,
    defaultValueIsSerializable: true,
  }),
  s3ForcePathStyle: flag({
    long: "s3-force-path-style",
    defaultValue: () => process.env.S3_FORCE_PATH_STYLE !== "false",
    defaultValueIsSerializable: true,
  }),
  databaseUrl: option({
    long: "database-url",
    type: optional(string),
    description:
      "Postgres connection string, shared by every replica and worker. Without it the registry keeps its state in an embedded PGlite and runs its jobs in-process.",
    defaultValue: () =>
      process.env.PH_REGISTRY_DATABASE_URL ?? process.env.DATABASE_URL,
    defaultValueIsSerializable: true,
  }),
  listenDatabaseUrl: option({
    long: "listen-database-url",
    type: optional(string),
    description:
      "Direct Postgres connection for LISTEN/NOTIFY, when --database-url goes through a transaction pooler",
    defaultValue: () => process.env.PH_REGISTRY_LISTEN_DATABASE_URL,
    defaultValueIsSerializable: true,
  }),
  webhooks: option({
    long: "webhook",
    type: optional(string),
    description: "Comma-separated webhook URLs to notify on publish",
    defaultValue: () => process.env.REGISTRY_WEBHOOKS,
    defaultValueIsSerializable: true,
  }),
};

const trueOrFalse: Type<string, boolean> = {
  displayName: "true|false",
  from: (value) =>
    value === "true" || value === "false"
      ? Promise.resolve(value === "true")
      : Promise.reject(new Error("expected true or false")),
};

// Unset: only without --database-url, so a deployment runs `migrate` itself
const migrateOnBootArg = option({
  long: "migrate-on-boot",
  type: optional(trueOrFalse),
  description:
    "Apply database migrations at startup (true/false). Defaults to true without --database-url, else false; env PH_REGISTRY_MIGRATE_ON_BOOT",
});

const positiveFromEnv = (name: string) => () => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? n : undefined;
};

const dbPoolMaxArg = option({
  long: "db-pool-max",
  type: optional(number),
  description:
    "Connections in this process's Postgres pool (default 10); env PH_REGISTRY_DB_POOL_MAX",
  defaultValue: positiveFromEnv("PH_REGISTRY_DB_POOL_MAX"),
});

const redact = (v?: string) => (v ? "[redacted]" : undefined);

export const registryCommand = command({
  name: "Package registry",
  args: {
    ...storageArgs,
    migrateOnBoot: migrateOnBootArg,
    dbPoolMax: dbPoolMaxArg,
    storagePoolMax: option({
      long: "storage-pool-max",
      type: optional(number),
      description:
        "Connections for the storage plugin's reads (default 2); env PH_REGISTRY_STORAGE_POOL_MAX",
      defaultValue: positiveFromEnv("PH_REGISTRY_STORAGE_POOL_MAX"),
    }),
    storageLockPoolMax: option({
      long: "storage-lock-pool-max",
      type: optional(number),
      description:
        "Connections holding the storage plugin's package locks, one per concurrent manifest write (default 4); env PH_REGISTRY_STORAGE_LOCK_POOL_MAX",
      defaultValue: positiveFromEnv("PH_REGISTRY_STORAGE_LOCK_POOL_MAX"),
    }),
    port: option({
      long: "port",
      type: number,
      defaultValue: () => Number(process.env.PORT) || DEFAULT_PORT,
      defaultValueIsSerializable: true,
    }),
    artifactCacheMb: option({
      long: "artifact-cache-mb",
      type: number,
      description:
        "Memory for serving small published files without S3, in MiB (0 turns it off)",
      defaultValue: () =>
        Number(process.env.PH_REGISTRY_ARTIFACT_CACHE_MB ?? 128),
      defaultValueIsSerializable: true,
    }),
    workers: option({
      long: "workers",
      type: number,
      description:
        "Jobs this process runs at a time; 0 leaves them to `ph-registry worker` (needs --database-url)",
      defaultValue: () => Number(process.env.PH_REGISTRY_WORKERS ?? 1),
      defaultValueIsSerializable: true,
    }),
    uplink: option({
      long: "uplink",
      type: optional(string),
      defaultValue: () => process.env.REGISTRY_UPLINK,
      defaultValueIsSerializable: true,
    }),
    uplinkMaxage: option({
      long: "uplink-maxage",
      type: optional(string),
      description:
        "How long verdaccio caches npmjs uplink metadata before refetching. " +
        "Accepts verdaccio time strings (e.g. '30s', '2m', '1h'). " +
        "Default '2m' matches verdaccio upstream — shortens the publish-to-" +
        "install propagation window in dev. Bump for production deployments " +
        "that want to reduce npmjs load.",
      defaultValue: () => process.env.PH_REGISTRY_UPLINK_MAXAGE,
      defaultValueIsSerializable: true,
    }),
    trustProxy: option({
      long: "trust-proxy",
      type: optional(string),
      description:
        "Express `trust proxy` (e.g. 2 proxy hops), so rate limits key on client IPs; env PH_REGISTRY_TRUST_PROXY",
      defaultValue: () => process.env.PH_REGISTRY_TRUST_PROXY,
      defaultValueIsSerializable: true,
    }),
    webEnabled: flag({
      long: "web-enabled",
      defaultValue: () => process.env.REGISTRY_WEB !== "false",
      defaultValueIsSerializable: true,
    }),
    publicUrl: option({
      long: "public-url",
      type: optional(string),
      description:
        "Public origin of this registry (used as the JWT `aud` claim for Renown bearer tokens). Required when --auth-renown is true.",
      defaultValue: () => process.env.PH_REGISTRY_PUBLIC_URL,
      defaultValueIsSerializable: true,
    }),
    authRenown: flag({
      long: "auth-renown",
      description:
        "Verify Renown-signed bearer tokens in front of verdaccio (stateless). Disabled when --public-url is unset.",
      defaultValue: () => process.env.PH_REGISTRY_AUTH_RENOWN === "true",
      defaultValueIsSerializable: true,
    }),
    renownUrl: option({
      long: "renown-url",
      type: optional(string),
      description:
        "Renown service base URL for credential verification. Defaults to https://www.renown.id.",
      defaultValue: () => process.env.PH_REGISTRY_RENOWN_URL,
      defaultValueIsSerializable: true,
    }),
    verdaccioSecret: option({
      long: "verdaccio-secret",
      type: optional(string),
      description:
        "Seeds Verdaccio's stored JWT signing secret (32 characters) when none is stored yet, keeping tokens it already signed valid.",
      defaultValue: () => process.env.PH_REGISTRY_VERDACCIO_SECRET,
      defaultValueIsSerializable: true,
    }),
    localPackages: option({
      long: "local-packages",
      type: optional(string),
      description:
        "Comma-separated globs (e.g. '@powerhousedao/*,document-model,ph-cmd') served locally only — no npmjs uplink proxy. Lets you re-publish a workspace package whose version already exists on npmjs without bumping.",
      defaultValue: () => process.env.PH_REGISTRY_LOCAL_PACKAGES,
      defaultValueIsSerializable: true,
    }),
  },
  handler: async (args) => {
    // Secrets redacted: this object otherwise leaks them into logs
    console.log({
      ...args,
      databaseUrl: redact(args.databaseUrl),
      listenDatabaseUrl: redact(args.listenDatabaseUrl),
      verdaccioSecret: redact(args.verdaccioSecret),
      s3AccessKeyId: redact(args.s3AccessKeyId),
      s3SecretAccessKey: redact(args.s3SecretAccessKey),
    });

    try {
      const server = await runRegistry(args);
      const shutdown = () => {
        console.log("[registry] draining");
        void server.drain().finally(() => process.exit(0));
      };
      process.once("SIGTERM", shutdown);
      process.once("SIGINT", shutdown);
    } catch (error) {
      console.error("Failed to start registry:");
      console.error(error);
      process.exit(1);
    }
  },
});

export const workerCommand = command({
  name: "Package registry worker",
  args: {
    ...storageArgs,
    migrateOnBoot: migrateOnBootArg,
    dbPoolMax: dbPoolMaxArg,
    registryUrl: option({
      long: "registry-url",
      type: string,
      description: "npm endpoint of a registry replica to fetch packages from",
      defaultValue: () =>
        process.env.PH_REGISTRY_INTERNAL_URL ??
        `http://localhost:${DEFAULT_PORT}`,
      defaultValueIsSerializable: true,
    }),
    concurrency: option({
      long: "concurrency",
      type: number,
      defaultValue: () =>
        Number(process.env.PH_REGISTRY_WORKER_CONCURRENCY ?? 8),
      defaultValueIsSerializable: true,
    }),
    metricsPort: option({
      long: "metrics-port",
      type: optional(number),
      description: "Serve Prometheus metrics at GET /-/metrics on this port",
      defaultValue: () =>
        process.env.PH_REGISTRY_METRICS_PORT
          ? Number(process.env.PH_REGISTRY_METRICS_PORT)
          : undefined,
      defaultValueIsSerializable: true,
    }),
  },
  handler: async (args) => {
    try {
      await runWorker(args);
    } catch (error) {
      console.error("Failed to start the registry worker:", error);
      process.exit(1);
    }
  },
});

export const migrateCommand = command({
  name: "Package registry migrations",
  args: {
    databaseUrl: storageArgs.databaseUrl,
    listenDatabaseUrl: storageArgs.listenDatabaseUrl,
    backfill: flag({
      long: "backfill",
      description: "Also queue processing of every package published here",
    }),
  },
  handler: async ({ databaseUrl, listenDatabaseUrl, backfill }) => {
    try {
      await runMigrate(databaseUrl, { backfill, listenDatabaseUrl });
    } catch (error) {
      console.error("Registry migration failed:", error);
      process.exit(1);
    }
  },
});

export const importVerdaccioStateCommand = command({
  name: "Import Verdaccio state into Postgres",
  description:
    "Copies the package list, tokens and secret from verdaccio-s3-db.json, plus every package stored in S3, into the Postgres store",
  args: storageArgs,
  handler: async (args) => {
    try {
      await runImportVerdaccioState(args);
    } catch (error) {
      console.error("Importing Verdaccio state failed:", error);
      process.exit(1);
    }
  },
});

// `ph-registry` alone runs the server; a leading subcommand picks another role
const subcommands = {
  worker: workerCommand,
  migrate: migrateCommand,
  "import-verdaccio-state": importVerdaccioStateCommand,
};
const [node, script, first, ...rest] = process.argv;
if (first in subcommands) {
  await run(binary(subcommands[first as keyof typeof subcommands]), [
    node,
    script,
    ...rest,
  ]);
} else {
  await run(binary(registryCommand), process.argv);
}
