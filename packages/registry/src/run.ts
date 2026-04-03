import express from "express";
import { findUp } from "find-up";
import { mkdir } from "node:fs/promises";
import type { Server } from "node:http";
import path from "node:path";
import { runServer } from "verdaccio";
import {
  DEFAULT_PORT,
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "./constants.js";
import { createPowerhouseRouter, createPublishHook } from "./middleware.js";
import { NotificationManager } from "./notifications/manager.js";
import { SSEChannel } from "./notifications/sse.js";
import { WebhookChannel } from "./notifications/webhook.js";
import type { RegistryCommandArgs, RegistryConfig } from "./types.js";
import { buildVerdaccioConfig } from "./verdaccio-config.js";

export interface RegistryInstance {
  server: Server;
  port: number;
  url: string;
  shutdown: () => Promise<void>;
}

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

export async function runRegistry(
  args?: Partial<RegistryCommandArgs>,
): Promise<RegistryInstance> {
  const {
    port = DEFAULT_PORT,
    storageDir = DEFAULT_STORAGE_DIR_NAME,
    cdnCacheDir = DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
    uplink,
    webEnabled = true,
    webhooks,
    s3AccessKeyId,
    s3Bucket,
    s3Endpoint,
    s3ForcePathStyle = true,
    s3KeyPrefix,
    s3Region,
    s3SecretAccessKey,
  } = args ?? {};

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

  // Verdaccio handles everything else (npm protocol, web UI, auth)
  app.use((req, res) => verdaccioHandler(req, res));

  const url = `http://localhost:${port}`;

  const server = app.listen(port, () => {
    console.log(`Powerhouse Registry running on ${url}`);
    console.log(`  CDN:      ${url}/-/cdn/`);
    console.log(`  Packages: ${url}/packages`);
    console.log(`  npm:      ${url}/`);
    console.log(`  Storage:  ${storagePath}`);
    console.log(`  CDN cache: ${cdnCachePath}`);
    if (config.s3) {
      console.log(`  S3:       ${config.s3.endpoint}/${config.s3.bucket}`);
    }
  });

  return {
    server,
    port,
    url,
    shutdown: () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
