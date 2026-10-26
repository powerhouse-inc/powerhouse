import type { HostIssue, SpawnedHost } from "@powerhousedao/host-core";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkResponseSchema,
  errorResponseSchema,
  hostsResponseSchema,
  instanceSchema,
  instancesResponseSchema,
  logsResponseSchema,
  projectsResponseSchema,
  TOKEN_HEADER,
} from "../controller/api.ts";
import {
  createMonitorController,
  type MonitorController,
} from "./controller.ts";
import { createControllerHandler } from "./http.ts";

const TOKEN = "a".repeat(64);

interface Reply {
  status: number;
  body: unknown;
}

describe("controller HTTP handler", () => {
  let base: string;
  let project: string;
  let controller: MonitorController;
  let server: http.Server;
  let port: number;
  let issues: HostIssue[];

  beforeEach(async () => {
    base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-monitor-http-")));
    project = path.join(base, "project");
    mkdirSync(path.join(project, "hosts", "sb"), { recursive: true });
    writeFileSync(path.join(project, "hosts", "sb", "host.js"), "");
    mkdirSync(path.join(base, "tmp"));
    issues = [];
    controller = createMonitorController({
      projectRoots: [project],
      tmpDir: path.join(base, "tmp"),
      check: () => Promise.resolve(issues),
      spawn: (options) => {
        options.onOutput?.("stdout", "booted\n");
        const exited = Promise.resolve({
          code: 0,
          signal: null,
          forced: false,
        });
        return Promise.resolve({
          pid: 1234,
          dataDir: options.dataDir,
          outputs: {
            origin: "http://127.0.0.1:9",
            endpoints: { graphql: "http://127.0.0.1:9/graphql" },
            drives: {},
          },
          exited: new Promise(() => {}),
          stop: () => exited,
        } as unknown as SpawnedHost);
      },
    });
    const handler = createControllerHandler({ controller, token: TOKEN });
    server = http.createServer((req, res) =>
      handler(req, res, () => {
        res.statusCode = 418;
        res.end();
      }),
    );
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await controller.dispose();
    await new Promise((r) => server.close(r));
    rmSync(base, { recursive: true, force: true });
  });

  const call = (
    method: string,
    route: string,
    options: { headers?: Record<string, string>; body?: string } = {},
  ) =>
    new Promise<Reply>((resolve, reject) => {
      const req = http.request(
        {
          host: "127.0.0.1",
          port,
          method,
          path: route,
          headers: {
            host: `127.0.0.1:${port}`,
            [TOKEN_HEADER]: TOKEN,
            ...(options.body ? { "content-type": "application/json" } : {}),
            ...options.headers,
          },
        },
        (res) => {
          let text = "";
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => (text += chunk));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              body: text ? (JSON.parse(text) as unknown) : undefined,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end(options.body);
    });

  const codeOf = (reply: Reply) =>
    errorResponseSchema.parse(reply.body).error.code;

  it("refuses a Host that is not loopback on this port", async () => {
    for (const host of [
      "evil.example:" + String(port),
      `127.0.0.1:${port + 1}`,
      "127.0.0.1",
      `localhost.evil.example:${port}`,
    ]) {
      const reply = await call("GET", "/__ph-monitor/projects", {
        headers: { host },
      });
      expect(reply.status).toBe(403);
      expect(codeOf(reply)).toBe("bad_host");
    }
    for (const host of [`localhost:${port}`, `[::1]:${port}`]) {
      const reply = await call("GET", "/__ph-monitor/projects", {
        headers: { host },
      });
      expect(reply.status).toBe(200);
    }
  });

  it("refuses foreign origins, including other loopback ports", async () => {
    for (const headers of [
      { origin: "http://localhost:3000" },
      { origin: `http://localhost:${port}` },
      { origin: "null" },
      { "sec-fetch-site": "same-site" },
      { "sec-fetch-site": "cross-site" },
    ] as Record<string, string>[]) {
      const reply = await call("GET", "/__ph-monitor/projects", { headers });
      expect(reply.status).toBe(403);
      expect(codeOf(reply)).toBe("bad_origin");
    }
    const same = await call("GET", "/__ph-monitor/projects", {
      headers: {
        origin: `http://127.0.0.1:${port}`,
        "sec-fetch-site": "same-origin",
      },
    });
    expect(same.status).toBe(200);
  });

  it("requires the token", async () => {
    for (const headers of [
      { [TOKEN_HEADER]: "" },
      { [TOKEN_HEADER]: "b".repeat(64) },
      { [TOKEN_HEADER]: TOKEN.slice(1) },
    ]) {
      const reply = await call("GET", "/__ph-monitor/projects", { headers });
      expect(reply.status).toBe(401);
      expect(codeOf(reply)).toBe("bad_token");
    }
  });

  it("passes other paths through", async () => {
    expect((await call("GET", "/index.html")).status).toBe(418);
  });

  it("refuses bad bodies", async () => {
    for (const body of [
      "{",
      JSON.stringify({ project }),
      JSON.stringify({ project, host: "sb", verb: "build" }),
      JSON.stringify({ project, host: "sb", env: { "BAD-KEY": "x" } }),
      JSON.stringify({ project, host: "sb", env: { A: 1 } }),
    ]) {
      const reply = await call("POST", "/__ph-monitor/instances", { body });
      expect(reply.status).toBe(400);
      expect(codeOf(reply)).toBe("bad_request");
    }
    const big = JSON.stringify({
      project,
      host: "sb",
      pad: "x".repeat(70_000),
    });
    expect(
      (await call("POST", "/__ph-monitor/check", { body: big })).status,
    ).toBe(400);
  });

  it("maps controller errors", async () => {
    const outside = await call("GET", `/__ph-monitor/hosts?project=${base}`);
    expect(outside.status).toBe(403);
    expect(codeOf(outside)).toBe("unknown_project");

    const denied = await call("POST", "/__ph-monitor/check", {
      body: JSON.stringify({ project, host: "sb", env: { PATH: "/x" } }),
    });
    expect(codeOf(denied)).toBe("env_denied");

    issues = [
      { stage: "boot", file: "hosts/sb/host.js", path: "", message: "no" },
    ];
    const refused = await call("POST", "/__ph-monitor/instances", {
      body: JSON.stringify({ project, host: "sb" }),
    });
    expect(refused.status).toBe(422);
    expect(errorResponseSchema.parse(refused.body).error).toMatchObject({
      code: "check_failed",
      issues,
    });

    const missing = await call("GET", "/__ph-monitor/instances/nope");
    expect(missing.status).toBe(404);
    expect(codeOf(missing)).toBe("not_found");
    expect((await call("PUT", "/__ph-monitor/instances")).status).toBe(404);
  });

  it("round-trips every route through its schema", async () => {
    const projects = projectsResponseSchema.parse(
      (await call("GET", "/__ph-monitor/projects")).body,
    );
    expect(projects.projects).toEqual([{ root: project, name: "project" }]);

    const hosts = await call(
      "GET",
      `/__ph-monitor/hosts?project=${encodeURIComponent(project)}`,
    );
    expect(hostsResponseSchema.parse(hosts.body).hosts).toEqual(["sb"]);

    const body = JSON.stringify({ project, host: "sb", env: { A: "1" } });
    const checked = await call("POST", "/__ph-monitor/check", { body });
    expect(checkResponseSchema.parse(checked.body)).toEqual({ issues: [] });

    const started = await call("POST", "/__ph-monitor/instances", { body });
    expect(started.status).toBe(202);
    const instance = instanceSchema.parse(started.body);

    const running = instanceSchema.parse(
      (await call("GET", `/__ph-monitor/instances/${instance.id}`)).body,
    );
    expect(running).toMatchObject({
      status: "running",
      pid: 1234,
      outputs: { graphql: "http://127.0.0.1:9/graphql" },
    });
    const listed = instancesResponseSchema.parse(
      (await call("GET", "/__ph-monitor/instances")).body,
    );
    expect(listed.instances.map((i) => i.id)).toEqual([instance.id]);

    const logs = logsResponseSchema.parse(
      (await call("GET", `/__ph-monitor/instances/${instance.id}/logs?since=0`))
        .body,
    );
    expect(logs).toEqual({
      next: 1,
      lines: [{ seq: 0, stream: "stdout", text: "booted" }],
    });

    const stopped = instanceSchema.parse(
      (await call("DELETE", `/__ph-monitor/instances/${instance.id}`)).body,
    );
    expect(stopped.status).toBe("exited");

    await call("POST", "/__ph-monitor/instances", { body });
    const all = instancesResponseSchema.parse(
      (await call("DELETE", "/__ph-monitor/instances")).body,
    );
    expect(all.instances.map((i) => i.status)).toEqual(["exited"]);
    expect(controller.list()).toEqual([]);
  });
});
