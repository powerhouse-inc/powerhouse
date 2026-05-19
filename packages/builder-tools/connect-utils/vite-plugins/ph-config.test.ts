import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RUNTIME_CONFIG_SCHEMA_URL } from "../runtime-config-schema.js";
import { phConfigPlugin } from "./ph-config.js";

function makeProjectRoot(pkg: { name?: string; version?: string }): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-config-test-"));
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(pkg ?? {}, null, 2),
    "utf-8",
  );
  return dir;
}

describe("phConfigPlugin", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = makeProjectRoot({ name: "test-project", version: "0.1.0" });
  });

  afterEach(() => {
    rmSync(projectRoot, { recursive: true, force: true });
  });

  it("emits powerhouse.config.json with schemaVersion 2 and structured packages", () => {
    const plugin = phConfigPlugin({
      packages: [
        { packageName: "@scope/pkg-a", version: "1.0.0", provider: "registry" },
        { packageName: "@scope/pkg-b", provider: "registry" },
      ],
      projectRoot,
    });

    const emitted: { fileName: string; source: string }[] = [];
    const ctx = {
      emitFile(file: { type: string; fileName: string; source: string }) {
        if (file.type === "asset") {
          emitted.push({ fileName: file.fileName, source: file.source });
        }
      },
    };

    const generateBundle = plugin.generateBundle as (
      this: unknown,
      ...args: unknown[]
    ) => void;
    generateBundle.call(ctx);

    expect(emitted).toHaveLength(1);
    const config = emitted.find((e) => e.fileName === "powerhouse.config.json");
    expect(config).toBeDefined();

    const parsed = JSON.parse(config!.source) as Record<string, unknown>;
    expect(parsed.$schema).toBe(RUNTIME_CONFIG_SCHEMA_URL);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.packages).toEqual([
      { packageName: "@scope/pkg-a", version: "1.0.0", provider: "registry" },
      { packageName: "@scope/pkg-b", provider: "registry" },
    ]);
    expect(parsed.localPackage).toEqual({
      name: "test-project",
      version: "0.1.0",
    });
    // Even with no source `connect` block, the emitter populates every
    // field from DEFAULT_CONNECT_CONFIG so the dist file is self-describing.
    expect(parsed.connect).toEqual(DEFAULT_CONNECT_CONFIG);
  });

  it("emits connect section from source config", () => {
    const plugin = phConfigPlugin({
      packages: [],
      projectRoot,
      connect: {
        branding: { appName: "Test App" },
        drives: { allowAddDrive: false },
      },
    });

    const emitted: { source: string }[] = [];
    const ctx = {
      emitFile(file: { type: string; fileName: string; source: string }) {
        if (file.type === "asset") emitted.push({ source: file.source });
      },
    };
    const generateBundle = plugin.generateBundle as (
      this: unknown,
      ...args: unknown[]
    ) => void;
    generateBundle.call(ctx);

    const parsed = JSON.parse(emitted[0].source) as Record<string, unknown>;
    // User overrides are layered on top of DEFAULT_CONNECT_CONFIG, so the
    // expected output is the defaults with the two overridden leaves replaced.
    expect(parsed.connect).toEqual({
      ...DEFAULT_CONNECT_CONFIG,
      branding: { ...DEFAULT_CONNECT_CONFIG.branding, appName: "Test App" },
      drives: { ...DEFAULT_CONNECT_CONFIG.drives, allowAddDrive: false },
    });
  });

  it("cliConnectOverride beats source.connect in the dist emit (task 9)", () => {
    const plugin = phConfigPlugin({
      packages: [],
      projectRoot,
      connect: {
        renown: { url: "https://source.renown" },
        drives: { allowAddDrive: true },
      },
      cliConnectOverride: {
        renown: { url: "https://cli.renown", chainId: 42 },
        drives: { allowAddDrive: false },
      },
    });
    const emitted: { source: string }[] = [];
    const ctx = {
      emitFile(file: { type: string; fileName: string; source: string }) {
        if (file.type === "asset") emitted.push({ source: file.source });
      },
    };
    const generateBundle = plugin.generateBundle as (
      this: unknown,
      ...args: unknown[]
    ) => void;
    generateBundle.call(ctx);
    const parsed = JSON.parse(emitted[0].source) as Record<string, unknown>;
    const connect = parsed.connect as Record<string, Record<string, unknown>>;

    // CLI wins on collision with source
    expect(connect.renown.url).toBe("https://cli.renown");
    expect(connect.drives.allowAddDrive).toBe(false);

    // CLI-only fields are present (deep-merged into source/default tree)
    expect(connect.renown.chainId).toBe(42);

    // Source fields untouched by CLI remain populated from defaults
    expect(connect.renown.networkId).toBe(
      DEFAULT_CONNECT_CONFIG.renown?.networkId,
    );
  });

  it("dev middleware intercepts /powerhouse.config.json with the filtered content", () => {
    const plugin = phConfigPlugin({
      packages: [
        { packageName: "@scope/x", version: "1.0.0", provider: "registry" },
      ],
      projectRoot,
    });

    let registeredHandler:
      | ((req: IncomingMessage, res: ServerResponse, next: () => void) => void)
      | undefined;
    const fakeServer = {
      middlewares: {
        use(handler: typeof registeredHandler) {
          registeredHandler = handler;
        },
      },
    };

    const configureServer = plugin.configureServer as (
      server: typeof fakeServer,
    ) => void;
    configureServer(fakeServer);

    expect(registeredHandler).toBeDefined();

    const headers: Record<string, string> = {};
    let body = "";
    const next = vi.fn();
    const req = { url: "/powerhouse.config.json" } as IncomingMessage;
    const res = {
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
      end(content: string) {
        body = content;
      },
    } as unknown as ServerResponse;

    registeredHandler!(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["Cache-Control"]).toBe("no-cache");

    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.packages).toEqual([
      { packageName: "@scope/x", version: "1.0.0", provider: "registry" },
    ]);
  });

  it("dev middleware passes through unrelated requests", () => {
    const plugin = phConfigPlugin({ packages: [], projectRoot });

    let registeredHandler:
      | ((req: IncomingMessage, res: ServerResponse, next: () => void) => void)
      | undefined;
    const fakeServer = {
      middlewares: {
        use(handler: typeof registeredHandler) {
          registeredHandler = handler;
        },
      },
    };
    (plugin.configureServer as (s: typeof fakeServer) => void)(fakeServer);

    const next = vi.fn();
    const req = { url: "/some-other-asset.js" } as IncomingMessage;
    const res = {
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;

    registeredHandler!(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("emits localPackage as null when project package.json is missing fields", () => {
    const root = makeProjectRoot({});
    const plugin = phConfigPlugin({ packages: [], projectRoot: root });

    const emitted: { source: string }[] = [];
    const ctx = {
      emitFile(file: { type: string; fileName: string; source: string }) {
        if (file.type === "asset") emitted.push({ source: file.source });
      },
    };
    const generateBundle = plugin.generateBundle as (
      this: unknown,
      ...args: unknown[]
    ) => void;
    generateBundle.call(ctx);

    const parsed = JSON.parse(emitted[0].source) as Record<string, unknown>;
    expect(parsed.localPackage).toBeNull();

    rmSync(root, { recursive: true, force: true });
  });

  it("does not leak source-side fields into the emitted config", () => {
    const plugin = phConfigPlugin({
      packages: [],
      projectRoot,
      connect: {},
    });

    const emitted: { source: string }[] = [];
    const ctx = {
      emitFile(file: { type: string; fileName: string; source: string }) {
        if (file.type === "asset") emitted.push({ source: file.source });
      },
    };
    const generateBundle = plugin.generateBundle as (
      this: unknown,
      ...args: unknown[]
    ) => void;
    generateBundle.call(ctx);

    const parsed = JSON.parse(emitted[0].source) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty("auth");
    expect(parsed).not.toHaveProperty("switchboard");
    expect(parsed).not.toHaveProperty("documentModelsDir");
    expect(parsed).not.toHaveProperty("studio");
    expect(parsed).not.toHaveProperty("reactor");
  });
});
