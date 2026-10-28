import type { HostExport } from "@powerhousedao/host-core/schema";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  containedPath,
  MaterializeError,
  materialize,
  renderHostFiles,
  withFreePorts,
} from "./materialize.ts";

const SWITCHBOARD = "@powerhousedao/ph-cli/runners/switchboard";

function switchboard(name: string, port: number) {
  return {
    name,
    runner: { module: SWITCHBOARD, port },
    reactor: { backends: { main: { kind: "in-process" } } },
  };
}

function duo(root: string): HostExport {
  return {
    format: "ph-host-export",
    version: 1,
    project: { name: "p", root },
    name: "duo",
    host: {
      name: "duo",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: {
        a: { host: "sb-a" },
        b: { host: "sb-b", runner: { port: 4900 } },
        ui: { host: "ui", runner: { port: 3000 } },
      },
    },
    members: {
      "sb-a": switchboard("sb-a", 4801),
      "sb-b": switchboard("sb-b", 4802),
      ui: {
        name: "ui",
        runner: { module: "@powerhousedao/ph-cli/runners/connect", port: 3001 },
      },
    },
  } as HostExport;
}

function listTree(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).sort();
}

function hostFile(project: string, folder: string): unknown {
  const source = readFileSync(
    path.join(project, "hosts", folder, "host.js"),
    "utf8",
  );
  return JSON.parse(source.replace(/^export default /, "").replace(/;\n$/, ""));
}

describe("materialize", () => {
  let base: string;
  let source: string;
  let instanceDir: string;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-materialize-")));
    source = path.join(base, "source");
    const store = path.join(base, "store");
    mkdirSync(path.join(store, "dep"), { recursive: true });
    mkdirSync(path.join(store, "scoped"), { recursive: true });
    mkdirSync(path.join(source, "node_modules", "@scope"), { recursive: true });
    mkdirSync(path.join(source, "node_modules", ".pnpm"));
    mkdirSync(path.join(source, "node_modules", "plain"));
    // pnpm's relative links; materialize must not copy them as they are.
    symlinkSync(
      path.relative(path.join(source, "node_modules"), path.join(store, "dep")),
      path.join(source, "node_modules", "dep"),
      "dir",
    );
    symlinkSync(
      path.join(store, "scoped"),
      path.join(source, "node_modules", "@scope", "pkg"),
      "dir",
    );
    symlinkSync(
      path.join(base, "missing"),
      path.join(source, "node_modules", "broken"),
      "dir",
    );
    writeFileSync(path.join(source, "package.json"), '{"name":"p"}');
    writeFileSync(path.join(source, "powerhouse.config.json"), "{}");
    instanceDir = path.join(base, "tmp", "instance");
    mkdirSync(path.join(base, "tmp"));
  });

  afterEach(() => {
    rmSync(base, { recursive: true, force: true });
  });

  it("writes the hosts, the project files and real-path package links", () => {
    const before = listTree(source);
    const { projectDir, dataDir } = materialize(
      instanceDir,
      source,
      duo(source),
    );
    expect(projectDir).toBe(path.join(instanceDir, "project"));
    expect(dataDir).toBe(path.join(instanceDir, "data"));
    expect(listTree(source)).toEqual(before);
    expect(readdirSync(path.join(base, "tmp"))).toEqual(["instance"]);

    expect(readdirSync(path.join(projectDir, "hosts")).sort()).toEqual([
      "duo",
      "sb-a",
      "sb-b",
      "ui",
    ]);
    expect(readFileSync(path.join(projectDir, "package.json"), "utf8")).toBe(
      '{"name":"p"}',
    );
    expect(existsSync(path.join(projectDir, "powerhouse.config.json"))).toBe(
      true,
    );

    const modules = path.join(projectDir, "node_modules");
    expect(lstatSync(modules).isSymbolicLink()).toBe(false);
    expect(lstatSync(path.join(modules, "@scope")).isSymbolicLink()).toBe(
      false,
    );
    // Absolute links to real paths, never pnpm's relative ones.
    const links = {
      dep: path.join(base, "store", "dep"),
      "@scope/pkg": path.join(base, "store", "scoped"),
      plain: path.join(source, "node_modules", "plain"),
    };
    for (const [name, target] of Object.entries(links)) {
      const link = path.join(modules, name);
      expect(path.isAbsolute(readlinkSync(link))).toBe(true);
      expect(realpathSync(link)).toBe(target);
    }
    expect(existsSync(path.join(modules, ".pnpm"))).toBe(false);
    expect(existsSync(path.join(modules, "broken"))).toBe(false);
  });

  it("gives every switchboard a free port, and only switchboards", () => {
    const { projectDir } = materialize(instanceDir, source, duo(source));
    expect(hostFile(projectDir, "sb-a")).toMatchObject({
      runner: { module: SWITCHBOARD, port: 0 },
    });
    expect(hostFile(projectDir, "sb-b")).toMatchObject({ runner: { port: 0 } });
    expect(hostFile(projectDir, "ui")).toMatchObject({
      runner: { port: 3001 },
    });
    expect(hostFile(projectDir, "duo")).toMatchObject({
      children: {
        a: { host: "sb-a", runner: { port: 0 } },
        b: { host: "sb-b", runner: { port: 0 } },
        ui: { host: "ui", runner: { port: 3000 } },
      },
    });
  });

  it("rewrites a standalone switchboard's port", () => {
    const envelope = {
      ...duo(source),
      name: "sb",
      host: switchboard("sb", 4801),
      members: {},
    } as HostExport;
    expect(withFreePorts(envelope).host).toMatchObject({ runner: { port: 0 } });
    expect(envelope.host).toMatchObject({ runner: { port: 4801 } });
  });

  it.each([
    ["..", "members"],
    ["../escape", "members"],
    ["a/b", "members"],
    ["a\\b", "members"],
    ["/abs", "members"],
    [".hidden", "members"],
    ["", "members"],
    ["../escape", "name"],
  ])("refuses the folder %j (%s) and writes nothing", (folder, where) => {
    const envelope = duo(source);
    const broken: HostExport =
      where === "name"
        ? { ...envelope, name: folder }
        : {
            ...envelope,
            members: {
              ...envelope.members,
              [folder]: switchboard("x", 1) as HostExport["host"],
            },
          };
    expect(() => materialize(instanceDir, source, broken)).toThrow(
      MaterializeError,
    );
    expect(existsSync(instanceDir)).toBe(false);
    expect(readdirSync(base).sort()).toEqual(["source", "store", "tmp"]);
  });

  it("refuses an instance folder that already exists", () => {
    mkdirSync(instanceDir);
    expect(() => materialize(instanceDir, source, duo(source))).toThrow(
      /EEXIST/,
    );
  });

  it("renders host files as plain data", () => {
    const files = renderHostFiles(duo(source));
    expect(files.get("duo")).toMatch(/^export default \{\n/);
    expect(files.get("duo")).not.toMatch(/\bimport\b/);
  });

  it("containedPath refuses anything that leaves the folder", () => {
    const dir = path.join(base, "dir");
    expect(containedPath(dir, "a", "b")).toBe(path.join(dir, "a", "b"));
    for (const bad of ["..", "../x", "/abs", "a/../../x", ""]) {
      expect(() => containedPath(dir, bad)).toThrow(MaterializeError);
    }
  });
});
