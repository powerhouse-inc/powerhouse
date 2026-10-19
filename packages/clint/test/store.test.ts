import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, readFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createWorkdirStore,
  createMemoryWorkdirStore,
} from "../src/core/store.js";

describe("createWorkdirStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "ph-clint-ws-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("getWorkdir returns resolved absolute path", () => {
    const ws = createWorkdirStore(dir, "mycli");
    expect(ws.getWorkdir()).toBe(resolve(dir));
  });

  it("getLocalConfigPath returns {workdir}/.ph/{cliName}.config.local.json", () => {
    const ws = createWorkdirStore(dir, "mycli");
    expect(ws.getLocalConfigPath()).toBe(
      join(resolve(dir), ".ph", "mycli.config.local.json"),
    );
  });

  it("getStoreFolder returns store root when no path", () => {
    const ws = createWorkdirStore(dir, "mycli");
    expect(ws.getStoreFolder()).toBe(join(resolve(dir), ".ph", "mycli"));
  });

  it("getStoreFolder returns sub-path when path provided", () => {
    const ws = createWorkdirStore(dir, "mycli");
    expect(ws.getStoreFolder("sub/dir")).toBe(
      join(resolve(dir), ".ph", "mycli", "sub", "dir"),
    );
  });

  describe("loadJsonObject", () => {
    it("returns fallback when file does not exist", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      const result = await ws.loadJsonObject("missing.json", []);
      expect(result).toEqual([]);
    });

    it("returns fallback with object default", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      const result = await ws.loadJsonObject("missing.json", { count: 0 });
      expect(result).toEqual({ count: 0 });
    });

    it("reads previously stored data", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      await ws.storeJsonObject("data.json", { hello: "world" });
      const result = await ws.loadJsonObject("data.json", {});
      expect(result).toEqual({ hello: "world" });
    });

    it("reads arrays", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      await ws.storeJsonObject("list.json", [1, 2, 3]);
      const result = await ws.loadJsonObject<number[]>("list.json", []);
      expect(result).toEqual([1, 2, 3]);
    });

    it("throws if filename does not end with .json", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      await expect(ws.loadJsonObject("data.txt", {})).rejects.toThrow(".json");
    });

    it("propagates errors other than ENOENT", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      // Write a non-JSON file in the store folder to trigger parse error
      const { writeFile: wf, mkdir: mkd } = await import("node:fs/promises");
      const storeDir = ws.getStoreFolder();
      await mkd(storeDir, { recursive: true });
      await wf(join(storeDir, "bad.json"), "not json", "utf8");
      await expect(ws.loadJsonObject("bad.json", {})).rejects.toThrow();
    });
  });

  describe("storeJsonObject", () => {
    it("creates parent directories", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      await ws.storeJsonObject("nested/deep/data.json", { ok: true });
      const result = await ws.loadJsonObject("nested/deep/data.json", {});
      expect(result).toEqual({ ok: true });
    });

    it("overwrites existing data", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      await ws.storeJsonObject("data.json", { v: 1 });
      await ws.storeJsonObject("data.json", { v: 2 });
      const result = await ws.loadJsonObject("data.json", {});
      expect(result).toEqual({ v: 2 });
    });

    it("writes valid JSON with trailing newline", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      await ws.storeJsonObject("data.json", { a: 1 });
      const raw = await readFile(
        join(ws.getStoreFolder(), "data.json"),
        "utf8",
      );
      expect(raw).toBe('{\n  "a": 1\n}\n');
    });

    it("throws if filename does not end with .json", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      await expect(ws.storeJsonObject("data.txt", {})).rejects.toThrow(".json");
    });

    // NOTE(port): chmod 0o444 on a DIRECTORY does not block renames on
    // Windows (POSIX permission semantics) — the failure cannot be induced.
    it.skipIf(process.platform === "win32")(
      "cleans up temp file on rename failure",
      async () => {
        const ws = createWorkdirStore(dir, "mycli");
        await ws.storeJsonObject("data.json", { v: 1 });
        const storeDir = ws.getStoreFolder();
        await chmod(storeDir, 0o444);
        try {
          await expect(
            ws.storeJsonObject("data.json", { v: 2 }),
          ).rejects.toThrow();
          const files = (await import("node:fs")).readdirSync(storeDir);
          const tmpFiles = files.filter((f: string) => f.startsWith(".tmp-"));
          expect(tmpFiles).toHaveLength(0);
        } finally {
          await chmod(storeDir, 0o755);
        }
      },
    );
  });

  describe("local config", () => {
    it("loadLocalConfig returns fallback when no file", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      const result = await ws.loadLocalConfig({ key: "default" });
      expect(result).toEqual({ key: "default" });
    });

    it("storeLocalConfig + loadLocalConfig round-trips", async () => {
      const ws = createWorkdirStore(dir, "mycli");
      await ws.storeLocalConfig({ port: 3000 });
      const result = await ws.loadLocalConfig({});
      expect(result).toEqual({ port: 3000 });
    });
  });
});

describe("createMemoryWorkdirStore", () => {
  it("getWorkdir returns resolved path", () => {
    const ws = createMemoryWorkdirStore("/tmp/test", "mycli");
    expect(ws.getWorkdir()).toBe(resolve("/tmp/test"));
  });

  it("getStoreFolder returns store root when no path", () => {
    const ws = createMemoryWorkdirStore("/tmp/test", "mycli");
    expect(ws.getStoreFolder()).toBe(
      join(resolve("/tmp/test"), ".ph", "mycli"),
    );
  });

  it("getLocalConfigPath returns expected path", () => {
    const ws = createMemoryWorkdirStore("/tmp/test", "mycli");
    expect(ws.getLocalConfigPath()).toBe(
      join(resolve("/tmp/test"), ".ph", "mycli.config.local.json"),
    );
  });

  it('defaults to cwd-based workdir and "test" cliName', () => {
    const ws = createMemoryWorkdirStore();
    expect(ws.getWorkdir()).toBe(resolve("."));
    expect(ws.getStoreFolder()).toBe(join(resolve("."), ".ph", "test"));
  });

  it("returns fallback when key does not exist", async () => {
    const ws = createMemoryWorkdirStore();
    const result = await ws.loadJsonObject("data.json", "default");
    expect(result).toBe("default");
  });

  it("reads previously stored data", async () => {
    const ws = createMemoryWorkdirStore();
    await ws.storeJsonObject("data.json", { data: true });
    const result = await ws.loadJsonObject("data.json", {});
    expect(result).toEqual({ data: true });
  });

  it("overwrites existing data", async () => {
    const ws = createMemoryWorkdirStore();
    await ws.storeJsonObject("data.json", 1);
    await ws.storeJsonObject("data.json", 2);
    const result = await ws.loadJsonObject<number>("data.json", 0);
    expect(result).toBe(2);
  });

  it("isolates keys", async () => {
    const ws = createMemoryWorkdirStore();
    await ws.storeJsonObject("a.json", "alpha");
    await ws.storeJsonObject("b.json", "beta");
    expect(await ws.loadJsonObject("a.json", "")).toBe("alpha");
    expect(await ws.loadJsonObject("b.json", "")).toBe("beta");
    expect(await ws.loadJsonObject("c.json", "fallback")).toBe("fallback");
  });

  it("throws if filename does not end with .json", async () => {
    const ws = createMemoryWorkdirStore();
    await expect(ws.loadJsonObject("data.txt", {})).rejects.toThrow(".json");
    await expect(ws.storeJsonObject("data.txt", {})).rejects.toThrow(".json");
  });

  it("local config round-trips", async () => {
    const ws = createMemoryWorkdirStore();
    await ws.storeLocalConfig({ port: 8080 });
    const result = await ws.loadLocalConfig({});
    expect(result).toEqual({ port: 8080 });
  });

  it("loadLocalConfig returns fallback when not set", async () => {
    const ws = createMemoryWorkdirStore();
    const result = await ws.loadLocalConfig({ default: true });
    expect(result).toEqual({ default: true });
  });
});
