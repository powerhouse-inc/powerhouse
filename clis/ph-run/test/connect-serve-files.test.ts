import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hostSchema } from "../src/runners/connect.js";
import { runConnectServer } from "../src/services/connect-server.js";
import type { ConnectPreviewArgs } from "../src/services/service-args.js";

/**
 * `runner.serveFiles` (C1 M4): a file served by name next to a built
 * Connect, read at each request, `no-store`, a 404 (never the app) while it
 * is missing; and the paths a host may name.
 */

const PROJECT = resolve(__dirname, "../../../test/test-consumer-project");

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => done(port));
    });
  });
}

interface Answer {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

/** A raw request: the path goes out as written, `..` and all. */
function get(
  port: number,
  path: string,
  { method = "GET", accept = "*/*" } = {},
): Promise<Answer> {
  return new Promise((done, fail) => {
    const req = request(
      { host: "127.0.0.1", port, path, method, headers: { accept } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => (body += chunk.toString()));
        res.on("end", () =>
          done({ status: res.statusCode ?? 0, headers: res.headers, body }),
        );
      },
    );
    req.on("error", fail);
    req.end();
  });
}

const APP = "<!doctype html><title>the app</title>";

let root: string;
let dist: string;
let studioConfig: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "ph-serve-files-"));
  dist = join(root, "dist");
  mkdirSync(dist);
  writeFileSync(join(dist, "index.html"), APP);
  writeFileSync(join(dist, "powerhouse.config.json"), "{}");
  // A file next to the build, the way a Cli keeps one per project.
  mkdirSync(join(root, "state"));
  studioConfig = join(root, "state", "studio.config.json");
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

async function serve(serveFiles: Record<string, string>, base?: string) {
  const port = await freePort();
  if (base) {
    writeFileSync(
      join(dist, "powerhouse.config.json"),
      JSON.stringify({ connect: { app: { basePath: base } } }),
    );
  }
  const server = await runConnectServer(
    {
      outDir: dist,
      port,
      host: "127.0.0.1",
      strictPort: true,
    } as ConnectPreviewArgs,
    {},
    PROJECT,
    { serveFiles },
  );
  return { port, close: () => server.close() };
}

describe("runner.serveFiles on the built-in Connect server", () => {
  it("reads the file at each request, never cached; a missing one is a 404, not the app", async () => {
    const running = await serve({ "/studio.config.json": studioConfig });
    try {
      const missing = await get(running.port, "/studio.config.json", {
        accept: "text/html,*/*",
      });
      expect(missing.status).toBe(404);
      expect(missing.headers["cache-control"]).toBe("no-store");
      expect(missing.body).not.toContain("the app");

      writeFileSync(studioConfig, JSON.stringify({ previewServerUrl: "a" }));
      const first = await get(running.port, "/studio.config.json");
      expect(first.status).toBe(200);
      expect(first.headers["content-type"]).toBe(
        "application/json; charset=utf-8",
      );
      expect(first.headers["cache-control"]).toBe("no-store");
      expect(JSON.parse(first.body)).toEqual({ previewServerUrl: "a" });

      // Rewritten by another process: the next request reads it again.
      writeFileSync(studioConfig, JSON.stringify({ previewServerUrl: "b" }));
      const again = await get(running.port, "/studio.config.json?x=1");
      expect(JSON.parse(again.body)).toEqual({ previewServerUrl: "b" });

      const head = await get(running.port, "/studio.config.json", {
        method: "HEAD",
      });
      expect(head.status).toBe(200);
      expect(head.body).toBe("");
      expect(
        (await get(running.port, "/studio.config.json", { method: "POST" }))
          .status,
      ).toBe(405);
      // The app is served as before.
      expect(
        (await get(running.port, "/", { accept: "text/html" })).body,
      ).toContain("the app");
    } finally {
      await running.close();
      rmSync(studioConfig, { force: true });
    }
  });

  it("serves nothing but the named file: other spellings of its path never reach it", async () => {
    writeFileSync(studioConfig, JSON.stringify({ secret: "the file" }));
    const running = await serve({ "/studio.config.json": studioConfig });
    try {
      for (const path of [
        "/state/studio.config.json",
        "/x/../studio.config.json",
        "/%2e%2e/state/studio.config.json",
        "/studio.config.json/",
        "/STUDIO.CONFIG.JSON",
        "/../state/studio.config.json",
        "/..%5cstate%5cstudio.config.json",
      ]) {
        const answer = await get(running.port, path);
        expect(answer.body, path).not.toContain("the file");
      }
    } finally {
      await running.close();
      rmSync(studioConfig, { force: true });
    }
  });

  it("serves under the app's base, and not outside it", async () => {
    writeFileSync(studioConfig, JSON.stringify({ base: true }));
    const running = await serve(
      { "/studio.config.json": studioConfig },
      "/studio/",
    );
    try {
      const under = await get(running.port, "/studio/studio.config.json");
      expect(under.status).toBe(200);
      expect(JSON.parse(under.body)).toEqual({ base: true });
      const outside = await get(running.port, "/studio.config.json");
      expect(outside.status).toBe(404);
      expect(outside.body).not.toContain('"base":true');
    } finally {
      await running.close();
      rmSync(studioConfig, { force: true });
      writeFileSync(join(dist, "powerhouse.config.json"), "{}");
    }
  });
});

describe("the paths runner.serveFiles may name", () => {
  const parse = (serveFiles: Record<string, string>) =>
    hostSchema.safeParse({
      name: "connect",
      runner: {
        module: "@powerhousedao/ph-cli/runners/connect",
        serveFiles,
      },
    });

  it("takes a path with an extension, under any folder", () => {
    expect(
      parse({
        "/studio.config.json": "${userData}/.ph/vetra/studio.config.json",
        "/a/b-c_d~e/notes.v2.txt": "notes.txt",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["a relative path", "studio.config.json"],
    ["a parent segment", "/../studio.config.json"],
    ["a parent segment inside", "/a/../studio.config.json"],
    ["a dot segment", "/./studio.config.json"],
    ["a hidden file", "/.env.json"],
    ["an encoded dot", "/%2e%2e/x.json"],
    ["a backslash", "/a\\b.json"],
    ["a query", "/x.json?y=1"],
    ["a trailing slash", "/x.json/"],
    ["no extension, an app route", "/studio-config"],
    ["the app's page", "/index.html"],
    ["Connect's config", "/powerhouse.config.json"],
    ["a switchboard path", "/graphql/x.json"],
    ["a drive path", "/d/x.json"],
  ])("refuses %s", (_name, path) => {
    const result = parse({ [path]: "x.json" });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain(
      JSON.stringify(`"${path}"`).slice(1, -1),
    );
  });

  it("refuses an empty file", () => {
    expect(parse({ "/x.json": "" }).success).toBe(false);
  });
});
