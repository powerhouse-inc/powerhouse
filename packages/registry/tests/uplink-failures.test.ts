import { API_ERROR, errorUtils } from "@verdaccio/core";
import { mkdtemp, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runRegistry } from "../src/run.js";
import {
  wrapUplinkFailures,
  type ProxyStorageLike,
} from "../src/uplink-miss-cache.js";

class FailingUplink implements ProxyStorageLike {
  maxage = 60_000;
  constructor(private readonly error: Error) {}
  getRemoteMetadata(_name: string, _options?: unknown) {
    return Promise.reject(this.error);
  }
}

describe("uplink failures", () => {
  wrapUplinkFailures(FailingUplink.prototype);

  const codeOf = (error: Error) =>
    new FailingUplink(error)
      .getRemoteMetadata("pkg", {})
      .catch((err: { code?: unknown }) => err.code);

  it("answers 503 for an uplink error that is not a 404", async () => {
    expect(await codeOf(errorUtils.getInternalError("offline"))).toBe(503);
    expect(
      await codeOf(Object.assign(new Error("dns"), { code: "EAI_AGAIN" })),
    ).toBe(503);
  });

  it("keeps a 404 from the uplink", async () => {
    const notFound = errorUtils.getNotFound(API_ERROR.NOT_PACKAGE_UPLINK);
    expect(await codeOf(notFound)).toBe(404);
  });
});

describe("registry with a failing uplink", () => {
  let status = 502;
  let uplink: http.Server;
  let registry: Awaited<ReturnType<typeof runRegistry>>;
  let registryUrl: string;
  let dir: string;

  beforeAll(async () => {
    uplink = http.createServer((_req, res) => {
      res.writeHead(status).end();
    });
    await new Promise<void>((resolve) => uplink.listen(0, resolve));
    const uplinkPort = (uplink.address() as AddressInfo).port;

    dir = await mkdtemp(path.join(os.tmpdir(), "registry-uplink-"));
    registry = await runRegistry({
      port: 0,
      storageDir: path.join(dir, "storage"),
      cdnCacheDir: path.join(dir, "cdn"),
      uplink: `http://localhost:${uplinkPort}/`,
      s3Bucket: undefined,
      s3Endpoint: undefined,
      s3Region: undefined,
      s3AccessKeyId: undefined,
      s3SecretAccessKey: undefined,
      s3KeyPrefix: undefined,
      s3ForcePathStyle: true,
      webEnabled: false,
    });
    await new Promise<void>((resolve, reject) => {
      registry.once("listening", resolve);
      registry.once("error", reject);
    });
    registryUrl = `http://localhost:${(registry.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    registry.close();
    uplink.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("answers 503 while the uplink fails, and 404 once it says not found", async () => {
    status = 502;
    expect((await fetch(`${registryUrl}/some-package`)).status).toBe(503);

    status = 404;
    expect((await fetch(`${registryUrl}/other-package`)).status).toBe(404);
  });
});
