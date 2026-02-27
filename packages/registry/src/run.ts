import express from "express";
import type { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { runServer } from "verdaccio";
import { createPowerhouseRouter, createPublishHook } from "./middleware.js";
import type { RegistryConfig } from "./types.js";
import { buildVerdaccioConfig } from "./verdaccio-config.js";

const port = Number(process.env.PORT || "8080");
const storagePath = path.resolve(process.env.REGISTRY_STORAGE || "./storage");
const cdnCachePath = path.resolve(
  process.env.REGISTRY_CDN_CACHE || "./cdn-cache",
);
const uplink = process.env.REGISTRY_UPLINK;
const webEnabled = process.env.REGISTRY_WEB !== "false";

const s3Bucket = process.env.S3_BUCKET;
const s3Endpoint = process.env.S3_ENDPOINT;
const s3Region = process.env.S3_REGION;

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
        accessKeyId: process.env.S3_ACCESS_KEY_ID,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
        s3ForcePathStyle: process.env.S3_FORCE_PATH_STYLE !== "false",
        keyPrefix: process.env.S3_KEY_PREFIX,
      },
    }),
};

// Ensure directories exist
fs.mkdirSync(storagePath, { recursive: true });
fs.mkdirSync(cdnCachePath, { recursive: true });

const verdaccioConfig = buildVerdaccioConfig(config);

async function main() {
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

main().catch((err) => {
  console.error("Failed to start registry:", err);
  process.exit(1);
});
