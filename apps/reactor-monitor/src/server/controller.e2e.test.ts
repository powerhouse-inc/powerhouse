import { provisionRemote } from "@powerhousedao/reactor-monitor";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  errorResponseSchema,
  instanceSchema,
  TOKEN_HEADER,
  type Instance,
} from "../controller/api.ts";
import {
  createMonitorController,
  type MonitorController,
} from "./controller.ts";
import { createControllerHandler } from "./http.ts";

// The switchboard and the check worker run ph-cli and host-core dists.

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI_DIR = path.resolve(here, "../../../../clis/ph-cli");
const SCAFFOLD_CONFIG = path.resolve(
  here,
  "../../../../packages/host-core/test/fixtures/hosts/scaffold/powerhouse.config.json",
);
const HOST_NAME = "monitor-e2e-switchboard";
const TOKEN = "e2e".repeat(16);

function makeProject(base: string): string {
  const dir = path.join(base, "project");
  mkdirSync(path.join(dir, "node_modules", "@powerhousedao"), {
    recursive: true,
  });
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "monitor-e2e", type: "module", private: true }),
  );
  symlinkSync(
    PH_CLI_DIR,
    path.join(dir, "node_modules", "@powerhousedao", "ph-cli"),
    "dir",
  );
  copyFileSync(SCAFFOLD_CONFIG, path.join(dir, "powerhouse.config.json"));
  mkdirSync(path.join(dir, "hosts", "sb"), { recursive: true });
  writeFileSync(
    path.join(dir, "hosts", "sb", "host.js"),
    `export default {
  name: "${HOST_NAME}",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard", port: 0 },
  reactor: {
    backends: {
      main: {
        kind: "in-process",
        storage: { kind: "path", dataDir: "\${userData}/.ph/reactor-storage" },
      },
    },
  },
};
`,
  );
  // An unset $env fails the check, so nothing starts.
  mkdirSync(path.join(dir, "hosts", "needs-env"));
  writeFileSync(
    path.join(dir, "hosts", "needs-env", "host.js"),
    `export default {
  name: "needs-env",
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    port: { $env: "MONITOR_E2E_PORT" },
  },
  reactor: { backends: { main: { kind: "in-process" } } },
};
`,
  );
  return dir;
}

describe.skipIf(process.platform === "win32")(
  "monitor controller (real switchboard)",
  () => {
    let base: string;
    let project: string;
    let controller: MonitorController;
    let server: http.Server;
    let api: string;

    beforeAll(async () => {
      base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-monitor-e2e-")));
      project = makeProject(base);
      mkdirSync(path.join(base, "tmp"));
      controller = createMonitorController({
        projectRoots: [project],
        tmpDir: path.join(base, "tmp"),
        readyTimeoutMs: 150_000,
      });
      const handler = createControllerHandler({ controller, token: TOKEN });
      server = http.createServer((req, res) =>
        handler(req, res, () => {
          res.statusCode = 404;
          res.end();
        }),
      );
      await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
      api = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__ph-monitor`;
    });

    afterAll(async () => {
      await controller.dispose();
      await new Promise((r) => server.close(r));
      rmSync(base, { recursive: true, force: true });
    });

    const call = async (method: string, route: string, body?: unknown) => {
      const res = await fetch(`${api}/${route}`, {
        method,
        headers: {
          [TOKEN_HEADER]: TOKEN,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return { status: res.status, body: (await res.json()) as unknown };
    };

    it("refuses a host whose check fails, starting nothing", async () => {
      const reply = await call("POST", "instances", {
        project,
        host: "needs-env",
      });
      expect(reply.status).toBe(422);
      const { error } = errorResponseSchema.parse(reply.body);
      expect(error.code).toBe("check_failed");
      expect(error.issues?.map((i) => i.stage)).toContain("resolve");
      expect(controller.list()).toEqual([]);
    }, 120_000);

    it("starts a switchboard, attaches to its inspection endpoint, stops it", async () => {
      const started = await call("POST", "instances", { project, host: "sb" });
      expect(started.status).toBe(202);
      const { id } = instanceSchema.parse(started.body);
      const dataDir = path.join(controller.tempRoot, id);

      let instance: Instance | undefined;
      const deadline = Date.now() + 150_000;
      while (Date.now() < deadline) {
        instance = instanceSchema.parse(
          (await call("GET", `instances/${id}`)).body,
        );
        if (instance.status !== "starting") break;
        await new Promise((r) => setTimeout(r, 500));
      }
      expect(instance?.error).toBeUndefined();
      expect(instance?.status).toBe("running");
      const graphql = instance?.outputs?.graphql ?? "";
      expect(graphql).toMatch(/^http:\/\/[^/]+:\d+\/graphql$/);
      expect(
        existsSync(path.join(dataDir, ".ph", "run", `${HOST_NAME}.json`)),
      ).toBe(true);

      const remote = await provisionRemote({
        name: "e2e",
        kind: "remote",
        remote: { url: graphql },
      });
      expect(remote.endpoint).toBe(`${graphql}/inspection`);
      expect(remote.info).toBeDefined();
      await remote.kill();

      const stopped = await call("DELETE", `instances/${id}`);
      expect(instanceSchema.parse(stopped.body)).toMatchObject({
        status: "exited",
        exit: { code: 0, forced: false },
      });
      expect(existsSync(dataDir)).toBe(false);
      expect(existsSync(path.join(project, ".ph"))).toBe(false);
      expect((await call("GET", `instances/${id}`)).status).toBe(404);
      await expect(fetch(graphql, { method: "POST" })).rejects.toThrow();
    }, 240_000);
  },
);
