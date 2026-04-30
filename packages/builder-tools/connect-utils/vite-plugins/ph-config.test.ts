import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it("emits powerhouse.config.json with schemaVersion 1 and the expected shape", () => {
    const plugin = phConfigPlugin({
      packages: ["@scope/pkg-a@1.0.0", "@scope/pkg-b"],
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
    expect(emitted[0].fileName).toBe("powerhouse.config.json");

    const parsed = JSON.parse(emitted[0].source) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.packages).toEqual(["@scope/pkg-a@1.0.0", "@scope/pkg-b"]);
    expect(parsed.localPackage).toEqual({
      name: "test-project",
      version: "0.1.0",
    });
  });

  it("dev middleware intercepts /powerhouse.config.json with the filtered content", () => {
    const plugin = phConfigPlugin({
      packages: ["@scope/x@1.0.0"],
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

    // Build a fake request/response pair
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
    expect(headers["Cache-Control"]).toBe("no-store");

    const parsed = JSON.parse(body) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.packages).toEqual(["@scope/x@1.0.0"]);
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
});
