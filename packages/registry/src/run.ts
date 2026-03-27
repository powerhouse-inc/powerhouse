import express from "express";
import { findUp } from "find-up";
import type { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { runServer } from "verdaccio";
import { createPowerhouseRouter, createPublishHook } from "./middleware.js";
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
    webEnabled,
    webhooks,
    s3AccessKeyId,
    s3Bucket,
    s3Endpoint,
    s3ForcePathStyle,
    s3KeyPrefix,
    s3Region,
    s3SecretAccessKey,
  } = args;
  const storagePath = await resolveDir(storageDir);
  const cdnCachePath = await resolveDir(cdnCacheDir);

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
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const verdaccioServer: EventEmitter = await runServer(verdaccioConfig);
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
  });

  return server;
}
