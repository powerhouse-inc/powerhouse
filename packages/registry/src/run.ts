import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import S3DatabasePostgres from "@powerhousedao/verdaccio-s3-storage/postgres";
import express from "express";
import { findUp } from "find-up";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import pg from "pg";
import { runServer } from "verdaccio";
import {
  createFsArtifactStore,
  createS3ArtifactStore,
  withMemoryCache,
  type ArtifactStore,
} from "./artifacts.js";
import type { AuthStore } from "./auth/auth-store.js";
import { createPgStore } from "./auth/pg-store.js";
import { stashAuthStore, wasStoreLoaded } from "./auth/store-handoff.js";
import { Catalog } from "./catalog.js";
import {
  createPGliteDatabase,
  createPostgresDatabase,
  type Database,
} from "./db/database.js";
import { migrate, migrateOnBoot, prepareSchema } from "./db/migrations.js";
import { EventBus } from "./events.js";
import {
  CONTENT_TYPE as METRICS_CONTENT_TYPE,
  databaseMetrics,
  httpMetrics,
  Metrics,
  processMetrics,
  serveMetrics,
  workerMetrics,
} from "./metrics.js";
import {
  createPowerhouseRouter,
  createPublishHook,
  createUnpublishHook,
} from "./middleware.js";
import { SSEChannel } from "./notifications/sse.js";
import { WebhookStore } from "./notifications/webhook.js";
import type { ProcessorContext } from "./processor.js";
import type {
  RegistryCommandArgs,
  RegistryConfig,
  S3Config,
  WebhookConfig,
  WorkerCommandArgs,
} from "./types.js";
import { ignoreLateContentLength } from "./late-header-guard.js";
import { installUplinkMissCache } from "./uplink-miss-cache.js";
import { buildVerdaccioConfig } from "./verdaccio-config.js";
import { enqueueSweep, startWorker, type RunningWorker } from "./worker.js";

// Verdaccio's signing secrets are exactly this long
const VERDACCIO_SECRET_LENGTH = 32;

// The S3 plugin's Postgres store traces every step; only warnings matter here
const pluginLogger = {
  trace: () => undefined,
  debug: () => undefined,
  info: () => undefined,
  warn: console.warn,
  error: console.error,
} as unknown as ConstructorParameters<typeof S3DatabasePostgres>[1];

async function resolveDir(dir: string): Promise<string> {
  if (path.isAbsolute(dir)) {
    await mkdir(dir, { recursive: true });
    return dir;
  }
  const found = await findUp(dir, { type: "directory" });
  if (!found) {
    await mkdir(dir, { recursive: true });
    return dir;
  }
  return found;
}

interface StorageArgs {
  s3Bucket?: string;
  s3Endpoint?: string;
  s3Region?: string;
  s3AccessKeyId?: string;
  s3SecretAccessKey?: string;
  s3KeyPrefix?: string;
  s3ForcePathStyle: boolean;
}

function s3From(args: StorageArgs): S3Config | undefined {
  if (!args.s3Bucket || !args.s3Endpoint || !args.s3Region) return undefined;
  return {
    bucket: args.s3Bucket,
    endpoint: args.s3Endpoint,
    region: args.s3Region,
    accessKeyId: args.s3AccessKeyId,
    secretAccessKey: args.s3SecretAccessKey,
    keyPrefix: args.s3KeyPrefix,
    s3ForcePathStyle: args.s3ForcePathStyle,
  };
}

function webhooksFrom(list?: string): WebhookConfig[] {
  return (list ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((endpoint) => ({ endpoint }));
}

export interface RegistryRuntime {
  db: Database;
  artifacts: ArtifactStore;
  events: EventBus;
  webhooks: WebhookStore;
  close(): Promise<void>;
}

/** The database, artifact store and event bus every role shares. */
export async function createRuntime(options: {
  databaseUrl?: string;
  listenDatabaseUrl?: string;
  dataDir: string;
  s3?: S3Config;
  webhooks?: WebhookConfig[];
  migrateOnBoot?: boolean;
  poolMax?: number;
}): Promise<RegistryRuntime> {
  // Without Postgres the registry keeps its state in an in-process PGlite
  const db = options.databaseUrl
    ? createPostgresDatabase(
        options.databaseUrl,
        options.listenDatabaseUrl,
        options.poolMax,
      )
    : await createPGliteDatabase(path.join(options.dataDir, "db"));
  try {
    await prepareSchema(
      db,
      migrateOnBoot(options.migrateOnBoot, options.databaseUrl),
    );
  } catch (err) {
    await db.close();
    throw err;
  }
  const artifacts = options.s3
    ? createS3ArtifactStore(options.s3)
    : createFsArtifactStore(path.join(options.dataDir, "artifacts"));
  const events = new EventBus(db);
  await events.start();
  return {
    db,
    artifacts,
    events,
    webhooks: new WebhookStore(db, options.webhooks),
    close: () => db.close(),
  };
}

function processorContext(
  runtime: RegistryRuntime,
  registryUrl: () => string,
): ProcessorContext {
  return {
    db: runtime.db,
    artifacts: runtime.artifacts,
    events: runtime.events,
    get registryUrl() {
      return registryUrl();
    },
  };
}

// Keeps a secret Verdaccio already signs tokens with across the move to the
// Postgres store; ignored once one is stored
async function seedVerdaccioSecret(
  databaseUrl: string,
  secret: string | undefined,
): Promise<void> {
  if (!secret) return;
  if (secret.length !== VERDACCIO_SECRET_LENGTH) {
    console.warn(
      `[registry] --verdaccio-secret must be ${VERDACCIO_SECRET_LENGTH} characters to seed Verdaccio's store; ignoring it`,
    );
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const store = new S3DatabasePostgres(pool, pluginLogger);
    await store.init();
    await pool.query(
      `INSERT INTO verdaccio_secret (id, secret) VALUES (1, $1)
       ON CONFLICT (id) DO NOTHING`,
      [secret],
    );
  } finally {
    await pool.end();
  }
}

const MIB = 1024 * 1024;

// Longer than a readiness probe period, so the Service drops the pod first
const DRAIN_DELAY_MS = 5_000;
// Within the pod's default 30 s termination grace period
const DRAIN_TIMEOUT_MS = 20_000;

// A hop count, or a value Express parses itself (`loopback`, CIDRs)
function parseTrustProxy(value: string): number | string {
  return /^\d+$/.test(value) ? Number(value) : value;
}

export async function runRegistry(args: RegistryCommandArgs) {
  const {
    port,
    storageDir,
    cdnCacheDir,
    uplink,
    uplinkMaxage,
    trustProxy,
    webEnabled,
    webhooks,
    publicUrl,
    authRenown,
    renownUrl,
    verdaccioSecret,
    localPackages,
    databaseUrl,
    pluginsDir,
    authStore,
  } = args;
  const storagePath = await resolveDir(storageDir);
  const cdnCachePath = await resolveDir(cdnCacheDir);
  const s3 = s3From(args);

  // Renown auth needs both the opt-in and --public-url for the audience claim;
  // without either the registry keeps the htpasswd path
  const renownEnabled = authRenown === true && Boolean(publicUrl);
  if (authRenown === true && !publicUrl) {
    console.warn(
      "[registry] auth-renown is enabled but --public-url / PH_REGISTRY_PUBLIC_URL is not set; Renown auth will be disabled.",
    );
  }
  // Renown auth is served by the registry-auth plugin, which loads only with a
  // database (it also holds ownership). Without one, renown can't engage.
  if (renownEnabled && !databaseUrl && !authStore) {
    console.warn(
      "[registry] Renown auth requires a database (--database-url) for the auth plugin; renown will be inactive.",
    );
  }

  const localPackagePatterns = localPackages
    ?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  const runtime = await createRuntime({
    databaseUrl,
    listenDatabaseUrl: args.listenDatabaseUrl,
    dataDir: cdnCachePath,
    s3,
    webhooks: webhooksFrom(webhooks),
    migrateOnBoot: args.migrateOnBoot,
    poolMax: args.dbPoolMax,
  });

  // One AuthStore, shared by the verdaccio auth plugin and the /packages owner
  // enrichment, over the runtime's database (an injected store wins).
  const sharedAuthStore: AuthStore | undefined =
    (authStore as AuthStore | undefined) ??
    (databaseUrl
      ? createPgStore(runtime.db, {
          migrate: migrateOnBoot(args.migrateOnBoot, databaseUrl),
        })
      : undefined);
  // Token carries the store through verdaccio's plugin config; we later assert
  // the plugin loaded it, so a configured-but-broken auth setup fails to boot.
  const authStoreToken = sharedAuthStore
    ? stashAuthStore(sharedAuthStore)
    : undefined;

  const config: RegistryConfig = {
    port,
    storagePath,
    cdnCachePath,
    uplink,
    uplinkMaxage,
    webEnabled,
    ...(trustProxy ? { trustProxy: parseTrustProxy(trustProxy) } : {}),
    ...(localPackagePatterns?.length ? { localPackagePatterns } : {}),
    ...(renownEnabled && publicUrl
      ? { renown: { publicUrl, ...(renownUrl ? { renownUrl } : {}) } }
      : {}),
    ...(s3 ? { s3 } : {}),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(args.storagePoolMax ? { storagePoolMax: args.storagePoolMax } : {}),
    ...(args.storageLockPoolMax
      ? { storageLockPoolMax: args.storageLockPoolMax }
      : {}),
    ...(pluginsDir ? { pluginsDir } : {}),
    ...(sharedAuthStore ? { authStore: sharedAuthStore } : {}),
    ...(authStoreToken ? { authStoreToken } : {}),
  };

  if (s3 && databaseUrl) {
    await seedVerdaccioSecret(databaseUrl, verdaccioSecret);
  }

  await installUplinkMissCache();
  // verdaccio's runServer returns Promise<any> (upstream type limitation)
  const verdaccioServer = (await runServer(
    buildVerdaccioConfig(config) as never,
  )) as Server;

  // Fail fast: a configured auth store that the plugin never loaded means
  // verdaccio silently fell back to no auth — refuse to run without ownership.
  if (authStoreToken && !wasStoreLoaded(authStoreToken)) {
    verdaccioServer.close();
    await runtime.close();
    throw new Error(
      "registry-auth plugin failed to load despite a configured database/auth store; refusing to start without auth and package-ownership enforcement.",
    );
  }
  const verdaccioHandler = verdaccioServer.listeners("request")[0] as (
    ...args: unknown[]
  ) => void;

  const localUrl = () => `http://localhost:${config.port}`;
  const catalog = new Catalog(runtime.db, runtime.events, localUrl);
  runtime.db.onReconnect(() => catalog.reset());
  if (sharedAuthStore) {
    catalog.setOwnerLookup(async (names) => {
      await sharedAuthStore.init();
      return sharedAuthStore.getOwnersFor(names);
    });
  }
  // Files up to 1 MiB; bundles and CDN files are mostly far smaller
  const artifacts = withMemoryCache(runtime.artifacts, {
    maxBytes: (args.artifactCacheMb ?? 128) * MIB,
    maxEntryBytes: MIB,
  });
  runtime.events.on((event) => {
    if (event.type !== "versions-removed") return;
    for (const version of event.versions ?? [null]) {
      artifacts.evictPrefix(
        version ? `${event.packageName}/${version}/` : `${event.packageName}/`,
      );
    }
  });
  const sse = new SSEChannel();
  runtime.events.on((event) => {
    if (event.type === "version-ready" && event.notify) {
      sse.notifyPublish({
        packageName: event.packageName,
        version: event.version,
        publishedBy: event.publishedBy,
      });
    }
    if (event.type === "versions-removed" && event.notify) {
      for (const version of event.versions ?? [null]) {
        sse.notifyUnpublish({
          packageName: event.packageName,
          version,
          publishedBy: event.publishedBy,
        });
      }
    }
  });

  const services = {
    db: runtime.db,
    catalog,
    artifacts,
    webhooks: runtime.webhooks,
    sse,
    ...(sharedAuthStore ? { ownerStore: sharedAuthStore } : {}),
  };

  const metrics = new Metrics();
  processMetrics(metrics);
  databaseMetrics(metrics, runtime.db);
  const jobMetrics = workerMetrics(metrics);

  const app = express();
  let draining = false;
  app.use(httpMetrics(metrics));

  // Liveness answers before anything else so a busy replica isn't restarted
  app.get("/-/live", (_req, res) => {
    res.status(200).send("ok");
  });
  // Ready when the database answers and notifications are flowing
  let readyAt = 0;
  let ready = false;
  app.get("/-/ready", (_req, res, next) => {
    void (async () => {
      if (Date.now() - readyAt > 1_000) {
        readyAt = Date.now();
        ready = await runtime.db
          .query("SELECT 1")
          .then(() => runtime.db.listening())
          .catch(() => false);
      }
      res
        .status(!draining && ready ? 200 : 503)
        .send(ready ? "ok" : "not ready");
    })().catch(next);
  });

  app.get("/-/metrics", (_req, res, next) => {
    metrics
      .render()
      .then((body) => {
        res.setHeader("Content-Type", METRICS_CONTENT_TYPE);
        res.end(body);
      })
      .catch(next);
  });

  // Serve static assets (logo, etc.)
  const staticDir = await findUp("static", { type: "directory" });
  if (staticDir) {
    app.use("/-/static", express.static(staticDir));
  }

  // Our routes take priority over Verdaccio
  app.use(createPowerhouseRouter(config, services));
  app.use(createPublishHook(config, services));
  app.use(createUnpublishHook(config, services));

  // Verdaccio handles everything else (npm protocol, web UI, auth)
  app.use(ignoreLateContentLength);
  app.use((req, res) => verdaccioHandler(req, res));

  // A PGlite database lives in this process, so its jobs must run here too
  const workers = databaseUrl
    ? (args.workers ?? 1)
    : Math.max(1, args.workers ?? 1);
  let worker: Promise<RunningWorker> | undefined;

  const server = app.listen(port, () => {
    // Port 0 binds an ephemeral port; the internal fetches need the real one.
    config.port = (server.address() as AddressInfo).port;
    const port = config.port;
    console.log(`Powerhouse Registry running on http://localhost:${port}`);
    console.log(`  CDN:      http://localhost:${port}/-/cdn/`);
    console.log(`  Packages: http://localhost:${port}/packages`);
    console.log(`  npm:      http://localhost:${port}/`);
    console.log(`  Storage:  ${storagePath}`);
    console.log(`  Data:     ${cdnCachePath}`);
    if (config.s3) {
      console.log(`  S3:       ${config.s3.endpoint}/${config.s3.bucket}`);
    }
    if (config.renown) {
      console.log(`  Renown auth: ${config.renown.publicUrl}`);
    }
    if (workers > 0) {
      worker = startWorker(processorContext(runtime, localUrl), {
        concurrency: workers,
        webhooks: runtime.webhooks,
        sweep: true,
        metrics: jobMetrics,
      });
    }
  });

  // Idle connections outlive the proxies' keep-alive, so a proxy never
  // reuses one Node has just closed
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;

  let closing: Promise<void> | undefined;
  const closeAll = () =>
    (closing ??= (async () => {
      verdaccioServer.close();
      await (await worker)?.stop();
      metrics.close();
      await runtime.close();
    })());
  server.on("close", () => void closeAll());

  // Stops taking traffic, lets the proxy notice, then finishes in-flight requests
  const drain = async () => {
    draining = true;
    await new Promise((resolve) => setTimeout(resolve, DRAIN_DELAY_MS));
    const closed = new Promise<void>((resolve) =>
      server.close(() => resolve()),
    );
    server.closeIdleConnections();
    const force = setTimeout(
      () => server.closeAllConnections(),
      DRAIN_TIMEOUT_MS,
    );
    await closed;
    clearTimeout(force);
    await closeAll();
  };

  return Object.assign(server, { drain });
}

export async function runWorker(args: WorkerCommandArgs) {
  const cdnCachePath = await resolveDir(args.cdnCacheDir);
  if (!args.databaseUrl) {
    throw new Error("the worker needs a shared database (--database-url)");
  }
  const runtime = await createRuntime({
    databaseUrl: args.databaseUrl,
    listenDatabaseUrl: args.listenDatabaseUrl,
    dataDir: cdnCachePath,
    s3: s3From(args),
    webhooks: webhooksFrom(args.webhooks),
    migrateOnBoot: args.migrateOnBoot,
    poolMax: args.dbPoolMax,
  });
  const metrics = new Metrics();
  let metricsServer: Server | undefined;
  if (args.metricsPort !== undefined) {
    processMetrics(metrics);
    databaseMetrics(metrics, runtime.db);
    metricsServer = await serveMetrics(metrics, args.metricsPort);
  }
  const worker = await startWorker(
    processorContext(runtime, () => args.registryUrl.replace(/\/$/, "")),
    {
      concurrency: args.concurrency,
      webhooks: runtime.webhooks,
      sweep: true,
      metrics: workerMetrics(metrics),
    },
  );
  console.log(
    `[registry] worker running ${args.concurrency} job(s) at a time against ${args.registryUrl}`,
  );
  const shutdown = () => {
    void (async () => {
      await worker.stop();
      metricsServer?.close();
      metrics.close();
      await runtime.close();
      process.exit(0);
    })();
  };
  process.once("SIGTERM", shutdown);
  process.once("SIGINT", shutdown);
}

/** Applies migrations, then optionally queues a sync of every local package. */
export async function runMigrate(
  databaseUrl: string | undefined,
  options: { backfill: boolean; listenDatabaseUrl?: string },
) {
  if (!databaseUrl) throw new Error("--database-url is required");
  // Online migrations hold a session lock, which needs the direct URL
  const db = createPostgresDatabase(databaseUrl, options.listenDatabaseUrl);
  try {
    await migrate(db);
    console.log("[registry] migrations applied");
    if (options.backfill) {
      const count = await enqueueSweep(db);
      console.log(`[registry] queued a sync of ${count} package(s)`);
    }
  } finally {
    await db.close();
  }
}

interface LegacyVerdaccioState {
  secret?: string;
  list?: string[];
  tokens?: {
    user: string;
    key: string;
    token: string;
    readonly: boolean;
    created: number | string;
  }[];
}

// Package names from the stored manifests: <prefix><name>/package.json
async function storedPackageNames(s3: S3Client, config: S3Config) {
  const prefix = config.keyPrefix ?? "";
  const names = new Set<string>();
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: config.bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const { Key } of page.Contents ?? []) {
      const rel = Key?.slice(prefix.length) ?? "";
      if (!rel.endsWith("/package.json") || rel.startsWith("artifacts/")) {
        continue;
      }
      const name = rel.slice(0, -"/package.json".length);
      const depth = name.split("/").length;
      if (name.startsWith("@") ? depth === 2 : depth === 1) names.add(name);
    }
    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);
  return names;
}

async function readStoredManifest(
  s3: S3Client,
  config: S3Config,
  name: string,
): Promise<object | null> {
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: `${config.keyPrefix ?? ""}${name}/package.json`,
      }),
    );
    return JSON.parse(
      (await res.Body?.transformToString()) ?? "null",
    ) as object;
  } catch {
    return null;
  }
}

/** Moves Verdaccio's S3-file state into the Postgres store the S3 plugin reads. */
export async function runImportVerdaccioState(
  args: StorageArgs & { databaseUrl?: string },
) {
  const s3Config = s3From(args);
  if (!s3Config || !args.databaseUrl) {
    throw new Error(
      "--s3-bucket, --s3-endpoint, --s3-region and --database-url are required",
    );
  }
  const s3 = new S3Client({
    endpoint: s3Config.endpoint,
    region: s3Config.region,
    forcePathStyle: s3Config.s3ForcePathStyle ?? true,
    ...(s3Config.accessKeyId && s3Config.secretAccessKey
      ? {
          credentials: {
            accessKeyId: s3Config.accessKeyId,
            secretAccessKey: s3Config.secretAccessKey,
          },
        }
      : {}),
  });
  let legacy: LegacyVerdaccioState = {};
  try {
    const res = await s3.send(
      new GetObjectCommand({
        Bucket: s3Config.bucket,
        Key: `${s3Config.keyPrefix ?? ""}verdaccio-s3-db.json`,
      }),
    );
    legacy = JSON.parse(
      (await res.Body?.transformToString()) ?? "{}",
    ) as LegacyVerdaccioState;
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name !== "NoSuchKey" && name !== "NotFound") throw err;
  }
  const names = await storedPackageNames(s3, s3Config);
  for (const name of legacy.list ?? []) names.add(name);

  const pool = new pg.Pool({ connectionString: args.databaseUrl });
  try {
    const store = new S3DatabasePostgres(pool, pluginLogger);
    await store.init();
    // The manifest index lets the worker reconcile without fetching metadata
    for (const name of names) {
      const manifest = await readStoredManifest(s3, s3Config, name);
      if (manifest) await store.record(name, manifest);
    }
    for (const name of names) {
      await pool.query(
        "INSERT INTO verdaccio_packages (name) VALUES ($1) ON CONFLICT (name) DO NOTHING",
        [name],
      );
    }
    for (const token of legacy.tokens ?? []) {
      await pool.query(
        `INSERT INTO verdaccio_tokens ("user", key, token) VALUES ($1, $2, $3)
         ON CONFLICT ("user", key) DO NOTHING`,
        [token.user, token.key, JSON.stringify(token)],
      );
    }
    if (legacy.secret) {
      await pool.query(
        `INSERT INTO verdaccio_secret (id, secret) VALUES (1, $1)
         ON CONFLICT (id) DO NOTHING`,
        [legacy.secret],
      );
    }
  } finally {
    await pool.end();
  }
  console.log(
    `[registry] imported ${names.size} package name(s), ${legacy.tokens?.length ?? 0} token(s)${legacy.secret ? " and the secret" : ""}`,
  );
}
