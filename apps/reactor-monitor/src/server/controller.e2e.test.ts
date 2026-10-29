import { provisionRemote } from "@powerhousedao/reactor-monitor";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
import { routeSeedOf } from "../builder/route.ts";
import { browserReactors, reactorsOf } from "../builder/run.ts";
import {
  capabilitiesResponseSchema,
  draftCheckResponseSchema,
  errorResponseSchema,
  exportResponseSchema,
  instanceSchema,
  TOKEN_HEADER,
  type Instance,
} from "../controller/api.ts";
import { managedDescriptors } from "../controller/managed.ts";
import {
  addDriveStatus,
  applyOption,
  hostOptions,
  membersOf,
  type HostDraft,
} from "../host-rules/index.ts";
import {
  createMonitorController,
  type MonitorController,
} from "./controller.ts";
import { createControllerHandler } from "./http.ts";

// The switchboard and the check worker run ph-cli and host-core dists.

const here = path.dirname(fileURLToPath(import.meta.url));
const PH_CLI_DIR = path.resolve(here, "../../../../clis/ph-cli");
const HOST_CORE_DIR = path.resolve(here, "../../../../packages/host-core");
const CONNECT_DIR = path.resolve(here, "../../../../apps/connect");
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
  symlinkSync(
    CONNECT_DIR,
    path.join(dir, "node_modules", "@powerhousedao", "connect"),
    "dir",
  );
  copyFileSync(SCAFFOLD_CONFIG, path.join(dir, "powerhouse.config.json"));
  const connectFiles: Record<string, string> = {
    "index.html": `<!doctype html><html><body><div id="root"></div><script type="module" src="/main.tsx"></script></body></html>`,
    "main.tsx": `import { startConnect } from "@powerhousedao/connect";\nstartConnect(() => import("./index.js"));\n`,
    "index.ts": `export const documentModels = [];\nexport const editors = [];\n`,
  };
  for (const [file, content] of Object.entries(connectFiles)) {
    writeFileSync(path.join(dir, file), content);
  }
  mkdirSync(path.join(dir, "hosts", "app"), { recursive: true });
  writeFileSync(
    path.join(dir, "hosts", "app", "host.js"),
    `export default {
  name: "monitor-e2e-app",
  runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 6498 },
  reactor: { backends: { main: { kind: "worker" } } },
};
`,
  );
  mkdirSync(path.join(dir, "hosts", "web"));
  writeFileSync(
    path.join(dir, "hosts", "web", "host.js"),
    `export default {
  name: "monitor-e2e-web",
  runner: { module: "@powerhousedao/host-core/runners/compound" },
  children: { sb: { host: "member" }, app: { host: "app" } },
};
`,
  );
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

    it("checks a draft whose Connect opens two of the switchboard's drives", async () => {
      const exported = await call(
        "GET",
        `export?${new URLSearchParams({ project, host: "web" }).toString()}`,
      );
      const { export: envelope, baseDigest } = exportResponseSchema.parse(
        exported.body,
      );
      const context = capabilitiesResponseSchema.parse(
        (await call("GET", "capabilities")).body,
      );
      let hostDraft: HostDraft = { envelope, env: {} };
      let draft = newDraft(
        { kind: "project", project, host: "web", export: envelope },
        baseDigest,
      );
      for (const id of [
        "Shared",
        "host.children.app:reach:open:sb:powerhouse",
        "host.children.app:reach:open:sb:shared",
      ]) {
        const option = id.startsWith("host.")
          ? hostOptions(hostDraft, context).find(
              (candidate) => candidate.id === id,
            )
          : addDriveStatus(hostDraft, context, "host.children.sb", id);
        expect(option?.reason, id).toBeUndefined();
        hostDraft = applyOption(hostDraft, option!).draft;
        draft = addEdit(draft, option!.setters);
      }
      const checked = await call("POST", "drafts/check", requestOf(draft));
      expect(checked.status, JSON.stringify(checked.body)).toBe(200);
      expect(draftCheckResponseSchema.parse(checked.body)).toEqual({
        ruleIssues: [],
        issues: [],
      });
    });

    it("starts a Connect linked to a switchboard drive: serves its placement, attaches the switchboard, routes both", async () => {
      const exported = await call(
        "GET",
        `export?${new URLSearchParams({ project, host: "web" }).toString()}`,
      );
      const { export: envelope, baseDigest } = exportResponseSchema.parse(
        exported.body,
      );
      const context = capabilitiesResponseSchema.parse(
        (await call("GET", "capabilities")).body,
      );
      let hostDraft: HostDraft = { envelope, env: {} };
      let draft = newDraft(
        { kind: "project", project, host: "web", export: envelope },
        baseDigest,
      );
      for (const id of ["Shared", "host.children.app:reach:open:sb:shared"]) {
        const option = id.startsWith("host.")
          ? hostOptions(hostDraft, context).find(
              (candidate) => candidate.id === id,
            )
          : addDriveStatus(hostDraft, context, "host.children.sb", id);
        expect(option?.reason, id).toBeUndefined();
        hostDraft = applyOption(hostDraft, option!).draft;
        draft = addEdit(draft, option!.setters);
      }

      const started = await call("POST", "drafts", requestOf(draft));
      expect(started.status, JSON.stringify(started.body)).toBe(202);
      const { id } = instanceSchema.parse(started.body);
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
      const running = instance!;
      const shared = running.members?.sb.outputs?.drives.shared;
      expect(shared?.url).toMatch(/^http:\/\/[^/]+:\d+\/d\/shared$/);

      // The copy's Connect serves the link and the placement from the draft.
      const app = running.members?.app.app ?? "";
      const { connect: served } = (await (
        await fetch(new URL("powerhouse.config.json", app))
      ).json()) as {
        connect: {
          instance?: { remoteBackends?: { name: string; url: string }[] };
          drives?: {
            defaultDrives?: {
              url?: string;
              backend?: string;
              sync?: boolean;
            }[];
          };
        };
      };
      const sharedPort = new URL(shared!.url).port;
      const servedUrl = expect.stringMatching(
        new RegExp(`^http://[^/]+:${sharedPort}/d/shared$`),
      ) as string;
      expect(served.instance?.remoteBackends).toEqual([
        { name: "sb", url: servedUrl },
      ]);
      expect(served.drives?.defaultDrives).toEqual([
        expect.objectContaining({ url: servedUrl, backend: "sb", sync: false }),
      ]);

      // Start provisions the Connect's browser reactor and attaches sb.
      const members = membersOf(hostDraft);
      const browser = browserReactors(hostDraft.envelope, members);
      expect(
        browser.map(({ descriptor, member, backend }) => [
          descriptor.kind,
          member,
          backend,
        ]),
      ).toEqual([["worker", "app", "main"]]);
      const attached = managedDescriptors(running, []);
      expect(attached.map((d) => d.managedBy.member)).toEqual(["sb"]);
      const remote = await provisionRemote(attached[0]);
      expect(remote.url).toBe(running.members?.sb.outputs?.graphql);
      await remote.kill();

      const seed = routeSeedOf({
        id: "e2e",
        member: members.find((member) => member.key === "app")!,
        members,
        run: {
          id,
          status: "running",
          source: running.source,
          reactors: reactorsOf(running),
          browser: [browser[0].descriptor.name],
          attached: {
            browser: [
              {
                name: browser[0].descriptor.name,
                member: "app",
                backend: "main",
              },
            ],
            remote: [{ name: attached[0].name, member: "sb" }],
          },
        },
        context,
      });
      expect(seed?.backends).toEqual([
        { reactor: browser[0].descriptor.name, backend: "main" },
        { reactor: attached[0].name, backend: "sb" },
      ]);
      expect(seed?.collections).toEqual({ [shared!.id]: attached[0].name });

      const stopped = await call("DELETE", `instances/${id}`);
      expect(instanceSchema.parse(stopped.body).status).toBe("exited");
      await expect(fetch(app)).rejects.toThrow();
    }, 420_000);

    it("starts a draft with a Connect member from its throwaway copy, serves Connect, removes the copy on stop", async () => {
      const exported = await call(
        "GET",
        `export?${new URLSearchParams({ project, host: "web" }).toString()}`,
      );
      expect(exported.status, JSON.stringify(exported.body)).toBe(200);
      const { export: envelope, baseDigest } = exportResponseSchema.parse(
        exported.body,
      );
      const draft = newDraft(
        { kind: "project", project, host: "web", export: envelope },
        baseDigest,
      );

      const started = await call("POST", "drafts", requestOf(draft));
      expect(started.status, JSON.stringify(started.body)).toBe(202);
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
      expect(instance?.members?.sb.outputs?.graphql).toMatch(
        /^http:\/\/[^/]+:\d+\/graphql$/,
      );
      const member = instance?.members?.app;
      expect(member?.outputs).toBeUndefined();
      const app = member?.app ?? "";
      // The copy's fixed Connect port: the host's 6498 plus the offset.
      expect(new URL(app).port).toBe("16498");

      const page = await fetch(app);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("/main.tsx");
      const main = await fetch(new URL("main.tsx", app));
      expect(main.status).toBe(200);
      expect(await main.text()).toContain("/@fs/");
      // Built on first request, inside the copy.
      const worker = await fetch(
        new URL("__reactor_worker__/worker-meta.json", app),
      );
      expect(worker.status, await worker.clone().text()).toBe(200);
      expect(await worker.json()).toHaveProperty("sourceDigest");
      expect(
        existsSync(
          path.join(
            instanceDir,
            "project",
            "node_modules",
            ".ph-reactor-worker",
          ),
        ),
      ).toBe(true);

      // A second copy can't take the same Connect port.
      const second = await call("POST", "drafts", requestOf(draft));
      expect(second.status).toBe(409);
      expect(errorResponseSchema.parse(second.body).error.code).toBe(
        "port_taken",
      );
      expect(controller.list()).toHaveLength(1);

      const stopped = await call("DELETE", `instances/${id}`);
      expect(instanceSchema.parse(stopped.body).status).toBe("exited");
      expect(existsSync(instanceDir)).toBe(false);
      for (const written of [
        ".ph",
        ".tanstack",
        "node_modules/.ph-reactor-worker",
      ]) {
        expect(existsSync(path.join(project, written)), written).toBe(false);
      }
      expect(
        readdirSync(path.join(project, "node_modules")).filter((name) =>
          name.startsWith(".vite"),
        ),
      ).toEqual([]);
      await expect(fetch(app)).rejects.toThrow();
    }, 420_000);
  },
);
