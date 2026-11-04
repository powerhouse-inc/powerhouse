import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import {
  createServer as createHttpServer,
  request,
  type Server,
} from "node:http";
import { connect, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  isAllowedHost,
  runConnectServer,
} from "../src/services/connect-server.js";
import type { ConnectPreviewArgs } from "../src/services/classic-args.js";

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

const argsFor = (dist: string, port: number, more = {}) =>
  ({
    outDir: dist,
    port,
    host: "127.0.0.1",
    strictPort: true,
    ...more,
  }) as ConnectPreviewArgs;

let dist: string;
let switchboard: Server;
let switchboardOrigin: string;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "ph-connect-server-"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>app</title>");
  writeFileSync(join(dist, "powerhouse.config.json"), "{}");
  switchboard = createHttpServer((req, res) => {
    if (req.url === "/graphql/stream") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: first\n\n");
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ host: req.headers.host, url: req.url }));
  });
  // Agrees to anything, then echoes: all this needs is both ways through.
  switchboard.on("upgrade", (req, socket) => {
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\n" +
        "Upgrade: websocket\r\nConnection: Upgrade\r\n" +
        `X-Saw-Url: ${req.url}\r\nX-Saw-Host: ${req.headers.host}\r\n\r\n`,
    );
    socket.on("data", (data) => socket.write(data));
    socket.on("end", () => socket.end());
  });
  const port = await freePort();
  await new Promise<void>((done) =>
    switchboard.listen(port, "127.0.0.1", done),
  );
  switchboardOrigin = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  switchboard.closeAllConnections();
  await new Promise<void>((done) => switchboard.close(() => done()));
  rmSync(dist, { recursive: true, force: true });
});

/** Connects a raw socket and returns its text so far, and a way to send more. */
function upgrade(port: number, path: string, host: string) {
  const socket = connect(port, "127.0.0.1");
  let text = "";
  socket.on("data", (data) => (text += data.toString()));
  socket.on("error", () => undefined);
  const closed = new Promise<void>((done) => socket.once("close", done));
  socket.write(
    `GET ${path} HTTP/1.1\r\nHost: ${host}\r\n` +
      "Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
  );
  return { socket, closed, text: () => text };
}

const until = async (check: () => boolean) => {
  for (let i = 0; i < 200 && !check(); i++) {
    await new Promise((done) => setTimeout(done, 10));
  }
  expect(check()).toBe(true);
};

describe("the built-in Connect server", () => {
  it("joins a websocket to the switchboard, both ways, on GraphQL's path", async () => {
    const port = await freePort();
    const running = await runConnectServer(argsFor(dist, port), {}, PROJECT, {
      proxy: switchboardOrigin,
    });
    try {
      const ws = upgrade(
        port,
        "/graphql/subscriptions?a=1",
        `localhost:${port}`,
      );
      await until(() => ws.text().includes("101 Switching Protocols"));
      expect(ws.text()).toContain("X-Saw-Url: /graphql/subscriptions?a=1");
      expect(ws.text()).toContain(`X-Saw-Host: localhost:${port}`);
      ws.socket.write("ping");
      await until(() => ws.text().endsWith("ping"));
      ws.socket.destroy();
    } finally {
      await running.close();
    }
  });

  it("refuses a websocket anywhere else, and from a name it doesn't know", async () => {
    const port = await freePort();
    const running = await runConnectServer(argsFor(dist, port), {}, PROJECT, {
      proxy: switchboardOrigin,
    });
    try {
      const elsewhere = upgrade(port, "/assets/x", `localhost:${port}`);
      await elsewhere.closed;
      expect(elsewhere.text()).toBe("");
      const rebound = upgrade(port, "/graphql", "attacker.example");
      await rebound.closed;
      expect(rebound.text()).toBe("");
    } finally {
      await running.close();
    }
  });

  it("closes with a websocket and a subscription stream still open", async () => {
    const port = await freePort();
    const running = await runConnectServer(argsFor(dist, port), {}, PROJECT, {
      proxy: switchboardOrigin,
    });
    const ws = upgrade(port, "/graphql", `localhost:${port}`);
    await until(() => ws.text().includes("101"));
    let streamed = "";
    const stream = request({
      port,
      host: "127.0.0.1",
      path: "/graphql/stream",
    });
    stream.on("error", () => undefined);
    stream.on("response", (res) => {
      res.on("error", () => undefined);
      res.on("data", (data: Buffer) => (streamed += data.toString()));
    });
    stream.end();
    await until(() => streamed.includes("first"));

    await running.close();

    await ws.closed;
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
  });

  it("keeps the Host the browser sent when proxying", async () => {
    const port = await freePort();
    const running = await runConnectServer(argsFor(dist, port), {}, PROJECT, {
      proxy: switchboardOrigin,
    });
    try {
      const answer = await fetch(`http://localhost:${port}/graphql`, {
        method: "POST",
        body: "{}",
      });
      expect(await answer.json()).toMatchObject({
        host: `localhost:${port}`,
      });
    } finally {
      await running.close();
    }
  });

  it("answers 502 when the switchboard is down", async () => {
    const port = await freePort();
    const gone = await freePort();
    const running = await runConnectServer(argsFor(dist, port), {}, PROJECT, {
      proxy: `http://127.0.0.1:${gone}`,
    });
    try {
      const answer = await fetch(`http://127.0.0.1:${port}/graphql`, {
        method: "POST",
        body: "{}",
      });
      expect(answer.status).toBe(502);
    } finally {
      await running.close();
    }
  });

  it("answers a preflight, and marks every response open", async () => {
    const port = await freePort();
    const running = await runConnectServer(argsFor(dist, port), {}, PROJECT);
    try {
      const preflight = await fetch(`http://127.0.0.1:${port}/`, {
        method: "OPTIONS",
        headers: { "access-control-request-headers": "x-custom" },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get("access-control-allow-headers")).toBe(
        "x-custom",
      );
      const page = await fetch(`http://127.0.0.1:${port}/`);
      expect(page.headers.get("access-control-allow-origin")).toBe("*");
    } finally {
      await running.close();
    }
  });

  it("refuses a name that isn't this computer's", async () => {
    const port = await freePort();
    const running = await runConnectServer(argsFor(dist, port), {}, PROJECT);
    const raw = connect(port, "127.0.0.1");
    let text = "";
    raw.on("data", (data) => (text += data.toString()));
    raw.write("GET / HTTP/1.1\r\nHost: attacker.example\r\n\r\n");
    try {
      await until(() => text.includes("403"));
    } finally {
      raw.destroy();
      await running.close();
    }
  });

  it("knows the names of this computer", () => {
    expect(isAllowedHost("localhost:6540")).toBe(true);
    expect(isAllowedHost("app.localhost")).toBe(true);
    expect(isAllowedHost("127.0.0.1:6540")).toBe(true);
    expect(isAllowedHost("[::1]:6540")).toBe(true);
    expect(isAllowedHost("192.168.1.20:2541")).toBe(true);
    expect(isAllowedHost("evil.example")).toBe(false);
    expect(isAllowedHost(undefined)).toBe(false);
  });

  it("fails on a taken port when strict, and moves on when not", async () => {
    const port = await freePort();
    const first = await runConnectServer(argsFor(dist, port), {}, PROJECT);
    await expect(
      runConnectServer(argsFor(dist, port), {}, PROJECT),
    ).rejects.toThrow(`Port ${port} is already in use`);
    const second = await runConnectServer(
      argsFor(dist, port, { strictPort: false }),
      {},
      PROJECT,
    );
    try {
      expect(second.resolvedUrls.local[0]).not.toContain(`:${port}/`);
    } finally {
      await second.close();
      await first.close();
    }
  });

  it("refuses to start without a build, before binding its port", async () => {
    const project = mkdtempSync(join(tmpdir(), "ph-connect-nobuild-"));
    try {
      mkdirSync(join(project, "empty-build"));
      const port = await freePort();
      await expect(
        runConnectServer(argsFor(".ph/connect-build/dist/", port), {}, project),
      ).rejects.toThrow(
        "No Connect build to serve: .ph/connect-build/dist/index.html is missing. Build it first with `ph connect build`, or `ph run <host> build` for a host's Connect.",
      );
      await expect(
        runConnectServer(argsFor("empty-build", port), {}, project),
      ).rejects.toThrow(
        'No Connect build to serve: empty-build/index.html is missing. Build it first with `ph connect build --outDir "empty-build"`, or `ph run <host> build` for a host\'s Connect.',
      );
      const elsewhere = join(project, "..", "ph-elsewhere-build");
      await expect(
        runConnectServer(argsFor(elsewhere, port), {}, project),
      ).rejects.toThrow(
        `No Connect build to serve: ${join(elsewhere, "index.html").split("\\").join("/")} is missing.`,
      );
      const source = join(project, "source");
      await expect(
        runConnectServer(
          argsFor(join(source, ".ph/connect-build/dist"), port),
          {},
          join(project, "copy"),
        ),
      ).rejects.toThrow(
        `Build it first with \`ph connect build\` in ${source.split("\\").join("/")}, or`,
      );
      mkdirSync(join(project, "..build"));
      await expect(
        runConnectServer(argsFor("..build", port), {}, project),
      ).rejects.toThrow(
        "No Connect build to serve: ..build/index.html is missing.",
      );
      const probe = createServer();
      await new Promise<void>((done, fail) => {
        probe.once("error", fail);
        probe.listen(port, "127.0.0.1", () => probe.close(() => done()));
      });
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  });
});
