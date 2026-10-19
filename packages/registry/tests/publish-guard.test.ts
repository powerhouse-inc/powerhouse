import { LocalDatabase } from "@verdaccio/local-storage";
import { createHash } from "node:crypto";
import { rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { Writable } from "node:stream";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ABANDONED_AFTER_MS,
  dropVersion,
  publishTarget,
  PublishGuard,
  type PackageFiles,
  type Packument,
} from "../src/publish-guard.js";
import { runRegistry } from "../src/run.js";
import { packTarball } from "./pack.js";

const NOW = Date.parse("2026-10-17T12:00:00.000Z");
const target = { name: "pkg", version: "1.1.0", file: "pkg-1.1.0.tgz" };

// A package's storage held in memory, failing reads the way a plugin does
function memoryStorage(manifest: Packument | null, tarballs: string[] = []) {
  const state = { manifest, tarballs: new Set(tarballs) };
  const files: PackageFiles = {
    readPackage: () =>
      state.manifest
        ? Promise.resolve(structuredClone(state.manifest))
        : Promise.reject(Object.assign(new Error("missing"), { code: 404 })),
    updatePackage: async (_name, update) => {
      state.manifest = await update(structuredClone(state.manifest!));
      return state.manifest;
    },
    savePackage: (_name, saved) => {
      state.manifest = saved;
      return Promise.resolve();
    },
    hasTarball: (file) => Promise.resolve(state.tarballs.has(file)),
    deletePackage: (file) => {
      state.tarballs.delete(file);
      return Promise.resolve();
    },
  };
  return {
    state,
    guard: new PublishGuard({ getPackageStorage: () => files }, () => NOW),
  };
}

function packument(
  versions: string[],
  tags: Record<string, string>,
  extra: Partial<Packument> = {},
): Packument {
  return {
    name: "pkg",
    versions: Object.fromEntries(versions.map((v) => [v, { version: v }])),
    "dist-tags": tags,
    time: Object.fromEntries(
      versions.map((v) => [v, new Date(NOW - 1000).toISOString()]),
    ),
    _attachments: {},
    ...extra,
  };
}

describe("publishTarget", () => {
  it("reads the version and tarball name of a publish body", () => {
    expect(
      publishTarget("@scope/pkg", {
        versions: { "1.0.0": {} },
        _attachments: { "pkg-1.0.0.tgz": { data: "" } },
      }),
    ).toEqual({ name: "@scope/pkg", version: "1.0.0", file: "pkg-1.0.0.tgz" });
    expect(publishTarget("pkg", { versions: { "1.0.0": {} } })).toBeNull();
  });
});

describe("dropVersion", () => {
  it("returns moved tags to their previous values", () => {
    const manifest = packument(["1.0.0", "1.1.0"], {
      latest: "1.1.0",
      dev: "1.1.0",
    });
    dropVersion(manifest, "1.1.0", { latest: "1.0.0" });
    expect(manifest.versions).toEqual({ "1.0.0": { version: "1.0.0" } });
    expect(manifest.time).not.toHaveProperty("1.1.0");
    // dev didn't exist before
    expect(manifest["dist-tags"]).toEqual({ latest: "1.0.0" });
  });

  it("points tags at the highest version left without previous values", () => {
    const manifest = packument(["1.0.0", "1.0.1-dev.1", "1.1.0"], {
      latest: "1.1.0",
    });
    dropVersion(manifest, "1.1.0");
    expect(manifest["dist-tags"]).toEqual({ latest: "1.0.1-dev.1" });
  });

  it("removes tags left with no version", () => {
    const manifest = packument(["1.0.0"], { latest: "1.0.0" });
    dropVersion(manifest, "1.0.0");
    expect(manifest["dist-tags"]).toEqual({});
  });
});

describe("PublishGuard", () => {
  it("rolls back the version, tags and attachment a failed upload left", async () => {
    const before = packument(["1.0.0"], { latest: "1.0.0" });
    const { state, guard } = memoryStorage(before, ["pkg-1.0.0.tgz"]);
    const snapshot = await guard.prepare(target);
    expect(snapshot).toEqual(before);

    // What Verdaccio stores when the upload fails after the version is written
    state.manifest = packument(
      ["1.0.0", "1.1.0"],
      { latest: "1.1.0" },
      {
        _attachments: { "pkg-1.1.0.tgz": { shasum: "partial" } },
      },
    );
    expect(await guard.rollback(target, snapshot)).toBe(true);
    expect(state.manifest).toEqual(before);
    expect([...state.tarballs]).toEqual(["pkg-1.0.0.tgz"]);
  });

  it("deletes a tarball the failed publish stored", async () => {
    const before = packument(["1.0.0"], { latest: "1.0.0" });
    const { state, guard } = memoryStorage(before);
    const snapshot = await guard.prepare(target);
    state.manifest = packument(["1.0.0", "1.1.0"], { latest: "1.1.0" });
    state.tarballs.add("pkg-1.1.0.tgz");
    expect(await guard.rollback(target, snapshot)).toBe(true);
    expect(state.tarballs.size).toBe(0);
  });

  it("leaves a version another publish stored before this one", async () => {
    // A retry racing the first attempt is refused; the first one owns 1.1.0
    const stored = packument(["1.0.0", "1.1.0"], { latest: "1.1.0" });
    const { state, guard } = memoryStorage(stored);
    const snapshot = await guard.prepare(target);
    expect(await guard.rollback(target, snapshot)).toBe(false);
    expect(state.manifest).toEqual(stored);
  });

  it("does nothing when the stored state couldn't be read", async () => {
    const { state, guard } = memoryStorage(
      packument(["1.0.0", "1.1.0"], { latest: "1.1.0" }),
    );
    expect(await guard.rollback(target, undefined)).toBe(false);
    expect(Object.keys(state.manifest!.versions!)).toContain("1.1.0");
  });

  it("clears a version an unfinished publish left without a tarball", async () => {
    const orphan = packument(["1.0.0", "1.1.0"], { latest: "1.1.0" });
    orphan.time!["1.1.0"] = new Date(
      NOW - ABANDONED_AFTER_MS - 1000,
    ).toISOString();
    const { state, guard } = memoryStorage(orphan, ["pkg-1.0.0.tgz"]);
    const snapshot = await guard.prepare(target);
    expect(snapshot?.versions).not.toHaveProperty("1.1.0");
    expect(state.manifest!["dist-tags"]).toEqual({ latest: "1.0.0" });
  });

  it("leaves a version whose publish may still be uploading", async () => {
    const inFlight = packument(["1.0.0", "1.1.0"], { latest: "1.1.0" });
    const { state, guard } = memoryStorage(inFlight);
    await guard.prepare(target);
    expect(state.manifest).toEqual(inFlight);
  });

  it("clears a tarball and attachment no listed version owns", async () => {
    const stray = packument(
      ["1.0.0"],
      { latest: "1.0.0" },
      {
        _attachments: { "pkg-1.1.0.tgz": { shasum: "x" } },
      },
    );
    const { state, guard } = memoryStorage(stray, ["pkg-1.1.0.tgz"]);
    await guard.prepare(target);
    expect(state.manifest!._attachments).toEqual({});
    expect(state.tarballs.size).toBe(0);
  });

  it("starts a first publish from nothing", async () => {
    const { guard } = memoryStorage(null);
    expect(await guard.prepare(target)).toBeNull();
  });
});

// The package storage class Verdaccio writes tarballs through, reached via an
// instance since local-storage doesn't export it
function localStoragePrototype(dir: string): { writeTarball: unknown } {
  const silent = () => undefined;
  const logger = { error: silent, warn: silent, info: silent, debug: silent };
  const db = new LocalDatabase(
    {
      storage: dir,
      packages: {},
      configPath: path.join(dir, "config.yaml"),
      self_path: path.join(dir, "config.yaml"),
    } as never,
    { ...logger, trace: silent, http: silent, child: () => logger } as never,
  );
  return Object.getPrototypeOf(db.getPackageStorage("probe")) as {
    writeTarball: unknown;
  };
}

describe("a publish whose tarball upload fails", () => {
  const PKG = "publish-guard-pkg";
  const workDir = path.join(import.meta.dirname, ".test-output-publish-guard");
  let server: Awaited<ReturnType<typeof runRegistry>>;
  let url: string;
  let token: string;

  beforeAll(async () => {
    rmSync(workDir, { recursive: true, force: true });
    server = await runRegistry({
      port: 0,
      storageDir: path.join(workDir, "storage"),
      cdnCacheDir: path.join(workDir, "cdn-cache"),
      uplink: undefined,
      s3Bucket: undefined,
      s3Endpoint: undefined,
      s3Region: undefined,
      s3AccessKeyId: undefined,
      s3SecretAccessKey: undefined,
      s3KeyPrefix: undefined,
      s3ForcePathStyle: true,
      webEnabled: false,
      localPackages: PKG,
    });
    if (!server.listening) {
      await new Promise((resolve) => server.once("listening", resolve));
    }
    url = `http://localhost:${(server.address() as AddressInfo).port}`;
    const res = await fetch(`${url}/-/user/org.couchdb.user:guarduser`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "guarduser", password: "guardpassword" }),
    });
    token = ((await res.json()) as { token: string }).token;
  }, 30000);

  afterAll(() => {
    server.close();
  });

  const publish = (version: string, tag = "latest") => {
    const tarball = packTarball({ name: PKG, version });
    return fetch(`${url}/${PKG}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        _id: PKG,
        name: PKG,
        "dist-tags": { [tag]: version },
        versions: {
          [version]: {
            name: PKG,
            version,
            dist: {
              tarball: `${url}/${PKG}/-/${PKG}-${version}.tgz`,
              shasum: createHash("sha1").update(tarball).digest("hex"),
            },
          },
        },
        _attachments: {
          [`${PKG}-${version}.tgz`]: {
            content_type: "application/octet-stream",
            data: tarball.toString("base64"),
            length: tarball.length,
          },
        },
      }),
    });
  };

  const packument = async () => {
    const res = await fetch(`${url}/${PKG}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return (await res.json()) as {
      versions: Record<string, unknown>;
      "dist-tags": Record<string, string>;
    };
  };

  it("leaves no version behind and lets the retry succeed", async () => {
    expect((await publish("1.0.0")).status).toBe(201);

    const proto = localStoragePrototype(path.join(workDir, "probe"));
    const writeTarball = vi
      .spyOn(proto as { writeTarball: () => Promise<Writable> }, "writeTarball")
      .mockImplementationOnce(() => {
        // The storage accepts the stream, then the upload fails
        const stream = new Writable({ write: (_c, _e, done) => done() });
        setImmediate(() =>
          stream.destroy(new Error("simulated storage outage")),
        );
        return Promise.resolve(stream);
      });
    try {
      const failed = await publish("1.1.0-dev.1", "dev");
      expect(failed.ok).toBe(false);
      expect(writeTarball).toHaveBeenCalledTimes(1);
    } finally {
      writeTarball.mockRestore();
    }

    const afterFailure = await packument();
    expect(Object.keys(afterFailure.versions)).toEqual(["1.0.0"]);
    expect(afterFailure["dist-tags"]).toEqual({ latest: "1.0.0" });

    expect((await publish("1.1.0-dev.1", "dev")).status).toBe(201);
    const afterRetry = await packument();
    expect(afterRetry["dist-tags"]).toEqual({
      latest: "1.0.0",
      dev: "1.1.0-dev.1",
    });
    const tarball = await fetch(`${url}/${PKG}/-/${PKG}-1.1.0-dev.1.tgz`);
    expect(tarball.status).toBe(200);
    await tarball.arrayBuffer();
  });
});
