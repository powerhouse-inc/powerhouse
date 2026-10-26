import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { backendsToDescriptors } from "../src/backend-projection.js";
import { applyChildWrapper } from "../src/child-wrapper.js";
import { exportHost } from "../src/host-export.js";
import {
  hostExportSchema,
  type HostExport,
} from "../src/host-export-schema.js";
import {
  declaredHostSchemas,
  type ChildWrapper,
  type HostDefinition,
  type ReactorConfig,
} from "../src/host-schemas.js";
import { HostLoadError, loadHost } from "../src/host-loader.js";
import { collectTokenSites } from "../src/resolve/walk.js";
import { cleanupProjects, project } from "./fixture-project.js";

const temporary: string[] = [];
afterAll(() => {
  cleanupProjects();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function childrenOf(host: HostDefinition): Record<string, ChildWrapper> {
  return declaredHostSchemas.childrenSchema.parse(
    (host as { children?: unknown }).children,
  );
}

function reactorOf(host: unknown): ReactorConfig | undefined {
  return (host as { reactor?: ReactorConfig }).reactor;
}

function memberReactor(
  exported: HostExport,
  key: string,
): ReactorConfig | undefined {
  const wrapper = childrenOf(exported.host)[key];
  return reactorOf(applyChildWrapper(exported.members[wrapper.host], wrapper));
}

function plainProject(hosts: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-host-export-"));
  temporary.push(dir);
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab" }),
  );
  for (const [name, host] of Object.entries(hosts)) {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(dir, "hosts", name, "host.js"),
      `export default ${JSON.stringify(host)};`,
    );
  }
  return dir;
}

describe("exportHost", () => {
  it("exports a reactor host with no members", async () => {
    const root = project("scaffold");
    const exported = await exportHost(root, "switchboard");
    expect(exported).toMatchObject({
      format: "ph-host-export",
      version: 1,
      project: { name: "my-project", root: path.resolve(root) },
      name: "switchboard",
      members: {},
    });
    expect(exported.host).toEqual((await loadHost(root, "switchboard")).host);
    expect(hostExportSchema.safeParse(roundTrip(exported)).success).toBe(true);
  });

  it("exports a compound's members by folder", async () => {
    const root = project("scaffold");
    const exported = await exportHost(root, "cli");
    expect(Object.keys(exported.members)).toEqual(["switchboard", "connect"]);
    expect(hostExportSchema.safeParse(roundTrip(exported)).success).toBe(true);
    const sites = collectTokenSites(memberReactor(exported, "cli-connect"));
    expect(sites.map((site) => site.path)).toContainEqual([
      "backends",
      "sb",
      "remote",
      "url",
    ]);
  });

  it("keeps ${userData} in a desktop member's projected storage", async () => {
    const exported = await exportHost(project("scaffold"), "desktop");
    expect(Object.keys(exported.members)).toEqual(["switchboard", "connect"]);
    const parsed = hostExportSchema.parse(roundTrip(exported));
    const reactor = memberReactor(parsed, "desktop-switchboard");
    expect(collectTokenSites(reactor)).toEqual([]);
    expect(backendsToDescriptors(reactor)).toMatchObject([
      {
        kind: "in-process",
        name: "main",
        storage: { kind: "path", dataDir: "${userData}/.ph/reactor-storage" },
      },
    ]);
  });

  it("projects an inheriting member like its standalone host", async () => {
    const root = project("scaffold");
    const vetra = hostExportSchema.parse(
      roundTrip(await exportHost(root, "vetra")),
    );
    const connect = hostExportSchema.parse(
      roundTrip(await exportHost(root, "connect")),
    );
    const descriptors = backendsToDescriptors(
      memberReactor(vetra, "vetra-studio"),
    );
    expect(descriptors).toMatchObject([{ kind: "worker", name: "main" }]);
    expect(descriptors).toEqual(backendsToDescriptors(reactorOf(connect.host)));
  });

  it("follows nested compounds depth-first", async () => {
    const reactor = (name: string) => ({
      name,
      runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
    });
    const compound = (name: string, children: Record<string, unknown>) => ({
      name,
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children,
    });
    const root = plainProject({
      a: reactor("a"),
      b: reactor("b"),
      inner: compound("inner", { x: { host: "a" }, y: { host: "b" } }),
      outer: compound("outer", { i: { host: "inner" }, j: { host: "a" } }),
    });
    const exported = await exportHost(root, "outer");
    expect(Object.keys(exported.members)).toEqual(["inner", "a", "b"]);
  });

  it("terminates on a children cycle", async () => {
    const compound = (name: string, child: string) => ({
      name,
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: { c: { host: child } },
    });
    const root = plainProject({
      outer: compound("outer", "inner"),
      inner: compound("inner", "outer"),
    });
    const exported = await exportHost(root, "outer");
    expect(Object.keys(exported.members)).toEqual(["inner", "outer"]);
  });

  it("refuses a host its schema rejects", async () => {
    const root = plainProject({
      typo: {
        name: "typo",
        runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
        reactr: {},
      },
    });
    await expect(exportHost(root, "typo")).rejects.toThrow(
      /not a valid host export[\s\S]*reactr/,
    );
  });

  it("refuses invalid children", async () => {
    const root = plainProject({
      stack: {
        name: "stack",
        runner: { module: "@powerhousedao/host-core/runners/compound" },
        children: { x: {} },
      },
    });
    await expect(exportHost(root, "stack")).rejects.toThrow(
      /invalid `children`/,
    );
  });

  it("refuses an unknown host", async () => {
    await expect(exportHost(project("scaffold"), "nope")).rejects.toThrow(
      HostLoadError,
    );
  });

  it("refuses a compound whose member folder is missing", async () => {
    const root = plainProject({
      stack: {
        name: "stack",
        runner: { module: "@powerhousedao/host-core/runners/compound" },
        children: { gone: { host: "missing" } },
      },
    });
    await expect(exportHost(root, "stack")).rejects.toThrow(
      /Unknown host "missing"/,
    );
  });
});

describe("hostExportSchema", () => {
  async function cliExport(): Promise<Record<string, unknown>> {
    return roundTrip(await exportHost(project("scaffold"), "cli")) as Record<
      string,
      unknown
    >;
  }

  it("refuses another version", async () => {
    const value = { ...(await cliExport()), version: 2 };
    expect(hostExportSchema.safeParse(value).success).toBe(false);
  });

  it("refuses a missing member folder", async () => {
    const value = await cliExport();
    const { connect: _, ...members } = value.members as Record<string, unknown>;
    const result = hostExportSchema.safeParse({ ...value, members });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["host", "children", "cli-connect", "host"],
      }),
    ]);
  });

  it("refuses a member no child reaches", async () => {
    const cli = await cliExport();
    const reactorHost = roundTrip(
      await exportHost(project("scaffold"), "switchboard"),
    ) as HostExport;
    for (const value of [cli, reactorHost]) {
      const members = value.members as Record<string, unknown>;
      const result = hostExportSchema.safeParse({
        ...value,
        members: { ...members, stray: { name: "s", runner: { module: "m" } } },
      });
      expect(result.error?.issues.map((issue) => issue.path)).toEqual([
        ["members", "stray"],
      ]);
    }
  });

  it("names the field a host fails on", async () => {
    const value = await cliExport();
    const members = value.members as Record<string, Record<string, unknown>>;
    const result = hostExportSchema.safeParse({
      ...value,
      members: { ...members, connect: { ...members.connect, reactr: {} } },
    });
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ path: ["members", "connect"] }),
    ]);
    expect(result.error?.issues[0]?.message).toMatch(/reactr/);
  });

  it("refuses an unknown top-level key", async () => {
    const value = { ...(await cliExport()), resolved: true };
    expect(hostExportSchema.safeParse(value).success).toBe(false);
  });
});

describe("applyChildWrapper", () => {
  /** compound.ts memberDraft before the helper. */
  function previous(base: HostDefinition, member: ChildWrapper) {
    const reactor = member.reactor ?? base.reactor;
    const config = member.config ?? base.config;
    return {
      ...base,
      runner: { ...base.runner, ...member.runner },
      ...(config !== undefined ? { config } : {}),
      ...(reactor !== undefined ? { reactor } : {}),
    };
  }

  it.each(["cli", "desktop", "vetra"])(
    "matches the previous member draft for %s",
    async (name) => {
      const root = project("scaffold");
      const { host } = await loadHost(root, name);
      for (const wrapper of Object.values(childrenOf(host))) {
        const base = (await loadHost(root, wrapper.host)).host;
        expect(applyChildWrapper(base, wrapper)).toEqual(
          previous(base, wrapper),
        );
      }
    },
  );
});
