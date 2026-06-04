import express from "express";
import { findUp } from "find-up";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { runServer } from "verdaccio";
import { createRenownAuthMiddleware } from "./auth/renown-middleware.js";
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
    verdaccioSecret: verdaccioSecretArg,
    localPackages,
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

  const config: RegistryConfig = {
    port,
    storagePath,
    cdnCachePath,
    uplink,
    uplinkMaxage,
    webEnabled,
    verdaccioSecret,
    ...(localPackagePatterns?.length ? { localPackagePatterns } : {}),
    ...(renownEnabled && publicUrl ? { renown: { publicUrl } } : {}),
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
  };
  // Ensure directories exist (for relative paths resolved via findUp)
  await mkdir(storagePath, { recursive: true });
  await mkdir(cdnCachePath, { recursive: true });

  const verdaccioConfig = buildVerdaccioConfig(config);

  // verdaccio's runServer returns Promise<any> (upstream type limitation)
  const verdaccioServer = (await runServer(verdaccioConfig)) as Server;
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
  app.use(createPowerhouseRouter(config, sseChannel, webhookChannel));

  // Renown bearer-token auth runs before the publish/unpublish hooks so they
  // see `req.renownUser`, and before verdaccio so the swapped Authorization
  // header reaches verdaccio's apiJWTmiddleware.
  if (config.renown) {
    app.use(
      createRenownAuthMiddleware({
        publicUrl: config.renown.publicUrl,
        verdaccioSecret,
      }),
    );
  }

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
