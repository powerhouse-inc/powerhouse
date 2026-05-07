import express from "express";
import { findUp } from "find-up";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runServer } from "verdaccio";
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

/**
 * Resolve the directory verdaccio should look in to load our auth-renown
 * plugin. The build emits `dist/verdaccio-auth-renown/{index.cjs, package.json}`
 * alongside the registry's own bundle, so the plugins-path is the same dir as
 * this module at runtime.
 */
function resolvePluginsPath(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export async function runRegistry(args: RegistryCommandArgs) {
  const {
    port,
    storageDir,
    cdnCacheDir,
    uplink,
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
  } = args;
  const storagePath = await resolveDir(storageDir);
  const cdnCachePath = await resolveDir(cdnCacheDir);

  // Renown auth turns on when the operator opts in (`--auth-renown`, default
  // gated on PH_REGISTRY_AUTH_RENOWN=true) AND has set --public-url for the
  // audience claim. Tests / programmatic users that don't pass either keep
  // the legacy htpasswd-only path with no warning.
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

  const config: RegistryConfig = {
    port,
    storagePath,
    cdnCachePath,
    uplink,
    webEnabled,
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

  const pluginsPath = renownEnabled ? resolvePluginsPath() : undefined;
  const verdaccioConfig = buildVerdaccioConfig(config, { pluginsPath });

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
  app.use(createPublishHook(config, notifications));
  app.use(createUnpublishHook(config, notifications));

  // Verdaccio handles everything else (npm protocol, web UI, auth via the
  // verdaccio-auth-renown plugin loaded from `pluginsPath`).
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
