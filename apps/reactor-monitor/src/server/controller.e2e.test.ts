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
import { addEdit, newDraft, requestOf } from "../builder/draft.ts";
import {
  capabilitiesResponseSchema,
  errorResponseSchema,
  exportResponseSchema,
  instanceSchema,
  TOKEN_HEADER,
  type Instance,
} from "../controller/api.ts";
import { applyOption, hostOptions } from "../host-rules/index.ts";
import {
  createMonitorController,
  type MonitorController,
} from "./controller.ts";
import { createControllerHandler } from "./http.ts";

// The switchboard and the check worker run ph-cli and host-core dists.

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI_DIR = path.resolve(here, "../../../../clis/ph-cli");
const HOST_CORE_DIR = path.resolve(here, "../../../../packages/host-core");
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
  // The compound runner resolves from the project root.
  symlinkSync(
    HOST_CORE_DIR,
    path.join(dir, "node_modules", "@powerhousedao", "host-core"),
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
  // A member's own port must be positive; a started copy rewrites it to 0.
  mkdirSync(path.join(dir, "hosts", "member"));
  writeFileSync(
    path.join(dir, "hosts", "member", "host.js"),
    `export default {
  name: "monitor-e2e-member",
  runner: { module: "@powerhousedao/ph-cli/runners/switchboard", port: 7499 },
  reactor: {
    backends: {
      main: { kind: "in-process", storage: { kind: "path", dataDir: ".ph/a/reactor-storage" } },
    },
  },
};
`,
  );
  mkdirSync(path.join(dir, "hosts", "duo"));
  writeFileSync(
    path.join(dir, "hosts", "duo", "host.js"),
    `export default {
  name: "monitor-e2e-duo",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  children: { a: { host: "member" } },
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

      const drive = Object.values(instance?.outputs?.drives ?? {}).at(0)?.url;
      expect(drive).toMatch(/^http:\/\/[^/]+:\d+\/d\/[^/]+$/);

      const remote = await provisionRemote({
        name: "e2e",
        kind: "remote",
        remote: { url: drive ?? "" },
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

    it("starts a builder draft with a second switchboard, attaches both, removes the copy on stop", async () => {
      const exported = await call(
        "GET",
        `export?${new URLSearchParams({ project, host: "duo" }).toString()}`,
      );
      expect(exported.status, JSON.stringify(exported.body)).toBe(200);
      const { export: envelope, baseDigest } = exportResponseSchema.parse(
        exported.body,
      );
      const context = capabilitiesResponseSchema.parse(
        (await call("GET", "capabilities")).body,
      );
      const option = hostOptions({ envelope, env: {} }, context).find(
        (candidate) => candidate.id === "host:add:switchboard",
      );
      expect(option?.enabled).toBe(true);
      expect(applyOption({ envelope, env: {} }, option!).refused).toBe(
        undefined,
      );
      const draft = addEdit(
        newDraft(
          { kind: "project", project, host: "duo", export: envelope },
          baseDigest,
        ),
        option!.setters,
      );

      const started = await call("POST", "drafts", requestOf(draft));
      expect(started.status).toBe(202);
      const { id } = instanceSchema.parse(started.body);
      const instanceDir = path.join(controller.tempRoot, id);

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
      expect(instance?.source).toEqual({ project, host: "duo" });
      const urls = Object.values(instance?.members ?? {}).flatMap((member) =>
        member.outputs ? [member.outputs.graphql] : [],
      );
      expect(urls).toHaveLength(2);
      expect(new Set(urls).size).toBe(2);
      expect(urls.filter((url) => url.includes(":7499/"))).toEqual([]);

      const drives = Object.values(instance?.members ?? {}).flatMap((member) =>
        Object.values(member.outputs?.drives ?? {})
          .slice(0, 1)
          .map((drive) => drive.url),
      );
      expect(drives).toHaveLength(2);
      for (const [index, drive] of drives.entries()) {
        const remote = await provisionRemote({
          name: drive,
          kind: "remote",
          remote: { url: drive },
        });
        expect(remote.url).toBe(urls[index]);
        expect(remote.endpoint).toBe(`${urls[index]}/inspection`);
        expect(remote.info).toBeDefined();
        await remote.kill();
      }

      const stopped = await call("DELETE", `instances/${id}`);
      expect(instanceSchema.parse(stopped.body).status).toBe("exited");
      expect(existsSync(instanceDir)).toBe(false);
      expect(existsSync(path.join(project, ".ph"))).toBe(false);
      for (const url of urls) {
        await expect(fetch(url, { method: "POST" })).rejects.toThrow();
      }
    }, 300_000);
  },
);
