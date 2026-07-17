import express from "express";
import { findUp } from "find-up";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { runServer } from "verdaccio";
import type { AuthStore } from "./auth/auth-store.js";
import { createPgPool, createPgStore } from "./auth/pg-store.js";
import { stashAuthStore, wasStoreLoaded } from "./auth/store-handoff.js";
import {
  createPowerhouseRouter,
  createPublishHook,
  createUnpublishHook,
} from "./middleware.js";
import { NotificationManager } from "./notifications/manager.js";
import { SSEChannel } from "./notifications/sse.js";
import { WebhookChannel } from "./notifications/webhook.js";
import type { RegistryCommandArgs, RegistryConfig } from "./types.js";
import { buildVerdaccioConfig } from "./verdaccio-config.js";

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

export async function runRegistry(args: RegistryCommandArgs) {
  const {
    port,
    storageDir,
    cdnCacheDir,
    uplink,
    uplinkMaxage,
    webEnabled,
    webhooks,
    s3AccessKeyId,
    s3Bucket,
    s3Endpoint,
    s3ForcePathStyle,
    s3KeyPrefix,
    s3Region,
    s3SecretAccessKey,
    publicUrl,
    authRenown,
    renownUrl,
    verdaccioSecret: verdaccioSecretArg,
    localPackages,
    databaseUrl,
    pluginsDir,
    authStore,
  } = args;
  const storagePath = await resolveDir(storageDir);
  const cdnCachePath = await resolveDir(cdnCacheDir);

  // Per-pod random verdaccio JWT secret. The verdaccio-format token we mint
  // in the renown middleware never leaves the pod (it's swapped into the
  // request before verdaccio sees it), so a per-pod secret is sufficient.
  // An override is exposed for tests / multi-pod behaviors that depend on
  // shared verdaccio JWTs.
  const verdaccioSecret = verdaccioSecretArg ?? randomBytes(32).toString("hex");

  // Renown auth turns on when the operator both opts in (`--auth-renown`,
  // default true via the CLI flag) and has set --public-url for the audience
  // claim. Tests / programmatic users that don't pass either keep the legacy
  // unsigned/htpasswd path with no warning.
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

  console.log({
    storagePath,
    cdnCachePath,
  });

  const webhookConfigs = webhooks
    ?.split(",")
    .map((url) => url.trim())
    .filter(Boolean)
    .map((endpoint) => ({ endpoint }));

  const localPackagePatterns = localPackages
    ?.split(",")
    .map((p) => p.trim())
    .filter(Boolean);

  // One AuthStore, shared by the verdaccio auth plugin and the /packages owner
  // enrichment — a single Postgres pool per process (injected store wins).
  const sharedAuthStore: AuthStore | undefined =
    (authStore as AuthStore | undefined) ??
    (databaseUrl ? createPgStore(createPgPool(databaseUrl)) : undefined);
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
    verdaccioSecret,
    ...(localPackagePatterns?.length ? { localPackagePatterns } : {}),
    ...(renownEnabled && publicUrl
      ? { renown: { publicUrl, ...(renownUrl ? { renownUrl } : {}) } }
      : {}),
    ...(webhookConfigs?.length && {
      notify: { webhooks: webhookConfigs },
    }),
    ...(s3Bucket &&
      s3Endpoint &&
      s3Region && {
        s3: {
          bucket: s3Bucket,
          endpoint: s3Endpoint,
          region: s3Region,
          accessKeyId: s3AccessKeyId,
          secretAccessKey: s3SecretAccessKey,
          keyPrefix: s3KeyPrefix,
          s3ForcePathStyle,
        },
      }),
    ...(databaseUrl ? { databaseUrl } : {}),
    ...(pluginsDir ? { pluginsDir } : {}),
    ...(sharedAuthStore ? { authStore: sharedAuthStore } : {}),
    ...(authStoreToken ? { authStoreToken } : {}),
  };

  if (config.databaseUrl || config.authStore) {
    console.log(
      "[registry] Postgres-backed auth plugin active (persistent accounts + package ownership)",
    );
  }
  // Ensure directories exist (for relative paths resolved via findUp)
  await mkdir(storagePath, { recursive: true });
  await mkdir(cdnCachePath, { recursive: true });

  const verdaccioConfig = buildVerdaccioConfig(config);

  // verdaccio's runServer returns Promise<any> (upstream type limitation)
  const verdaccioServer = (await runServer(verdaccioConfig)) as Server;

  // Fail fast: a configured auth store that the plugin never loaded means
  // verdaccio silently fell back to no auth — refuse to run without ownership.
  if (authStoreToken && !wasStoreLoaded(authStoreToken)) {
    verdaccioServer.close();
    throw new Error(
      "registry-auth plugin failed to load despite a configured database/auth store; refusing to start without auth and package-ownership enforcement.",
    );
  }
  const verdaccioHandler = verdaccioServer.listeners("request")[0] as (
    ...args: unknown[]
  ) => void;

  const app = express();

  const sseChannel = new SSEChannel();
  const webhookChannel = new WebhookChannel(config.storagePath, config.notify);
  const notifications = new NotificationManager([sseChannel, webhookChannel]);

  // Serve static assets (logo, etc.)
  const staticDir = await findUp("static", { type: "directory" });
  if (staticDir) {
    app.use("/-/static", express.static(staticDir));
  }

  // Our routes take priority over Verdaccio
  app.use(
    createPowerhouseRouter(config, sseChannel, webhookChannel, sharedAuthStore),
  );

  app.use(createPublishHook(config, notifications));
  app.use(createUnpublishHook(config, notifications));

  // Verdaccio handles everything else (npm protocol, web UI, auth)
  app.use((req, res) => verdaccioHandler(req, res));

  const server = app.listen(port, () => {
    console.log(`Powerhouse Registry running on http://localhost:${port}`);
    console.log(`  CDN:      http://localhost:${port}/-/cdn/`);
    console.log(`  Packages: http://localhost:${port}/packages`);
    console.log(`  npm:      http://localhost:${port}/`);
    console.log(`  Storage:  ${storagePath}`);
    console.log(`  CDN cache: ${cdnCachePath}`);
    if (config.s3) {
      console.log(`  S3:       ${config.s3.endpoint}/${config.s3.bucket}`);
    }
    if (config.renown) {
      console.log(`  Renown auth: ${config.renown.publicUrl}`);
    }
  });

  return server;
}
