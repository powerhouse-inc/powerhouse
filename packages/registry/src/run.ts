import express from "express";
import { findUp } from "find-up";
import type { EventEmitter } from "node:events";
import { mkdir } from "node:fs/promises";
import { runServer } from "verdaccio";
import { createPowerhouseRouter, createPublishHook } from "./middleware.js";
import type { RegistryCommandArgs, RegistryConfig } from "./types.js";
import { buildVerdaccioConfig } from "./verdaccio-config.js";

export async function runRegistry(args: RegistryCommandArgs) {
  const {
    port,
    storageDir,
    cdnCacheDir,
    uplink,
    webEnabled,
    s3AccessKeyId,
    s3Bucket,
    s3Endpoint,
    s3ForcePathStyle,
    s3KeyPrefix,
    s3Region,
    s3SecretAccessKey,
  } = args;
  const storagePath = await findUp(storageDir, {
    type: "directory",
  });

  if (!storagePath) {
    throw new Error(`Could not find storage path for dir "${storageDir}".`);
  }

  const cdnCachePath = await findUp(cdnCacheDir, {
    type: "directory",
  });

  if (!cdnCachePath) {
    throw new Error(`Could not find cdn cache path for dir "${cdnCacheDir}".`);
  }

  console.log({
    storagePath,
    cdnCachePath,
  });

  const config: RegistryConfig = {
    port,
    storagePath,
    cdnCachePath,
    uplink,
    webEnabled,
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
  // Ensure directories exist
  await mkdir(storagePath, { recursive: true });
  await mkdir(cdnCachePath, { recursive: true });

  const verdaccioConfig = buildVerdaccioConfig(config);

  // verdaccio's runServer returns Promise<any> (upstream type limitation)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const verdaccioServer: EventEmitter = await runServer(verdaccioConfig as any);
  const verdaccioHandler = verdaccioServer.listeners("request")[0] as (
    ...args: unknown[]
  ) => void;

  const app = express();

  // Our routes take priority over Verdaccio
  app.use(createPowerhouseRouter(config));
  app.use(createPublishHook(config));

  // Verdaccio handles everything else (npm protocol, web UI, auth)
  app.use((req, res) => verdaccioHandler(req, res));

  app.listen(port, () => {
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
}
