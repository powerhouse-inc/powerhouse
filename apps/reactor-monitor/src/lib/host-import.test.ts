import {
  hostExportSchema,
  type HostExport,
} from "@powerhousedao/host-core/schema";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXPORT_FILE,
  parseHostExport,
  planImport,
  type ImportIssue,
} from "./host-import.js";

const FIXTURES = [
  "switchboard",
  "connect",
  "cli",
  "desktop",
  "vetra",
  "assistant",
];

function fixtureText(name: string): string {
  return readFileSync(
    new URL(`./__fixtures__/host-export/${name}.json`, import.meta.url),
    "utf8",
  );
}

function fixture(name: string): HostExport {
  return JSON.parse(fixtureText(name)) as HostExport;
}

function plan(value: unknown) {
  const parsed = parseHostExport(JSON.stringify(value));
  expect(parsed.issues.filter((i) => i.severity === "error")).toEqual([]);
  return planImport(parsed.export!);
}

function errors(issues: readonly ImportIssue[]) {
  return issues.filter((issue) => issue.severity === "error");
}

const reactorHost = (reactor: unknown) => ({
  format: "ph-host-export",
  version: 1,
  project: { name: "p", root: "/project" },
  name: "solo",
  host: {
    name: "solo",
    runner: { module: "@powerhousedao/ph-cli/runners/connect" },
    reactor,
  },
  members: {},
});

describe("fixtures", () => {
  it.each(FIXTURES)("%s still parses as a host export", (name) => {
    expect(hostExportSchema.safeParse(fixture(name)).success).toBe(true);
    expect(parseHostExport(fixtureText(name)).export).toBeDefined();
  });
});

describe("parseHostExport", () => {
  it("refuses non-JSON", () => {
    const { export: exp, issues } = parseHostExport("{nope");
    expect(exp).toBeUndefined();
    expect(issues).toEqual([
      expect.objectContaining({
        severity: "error",
        stage: "load",
        file: EXPORT_FILE,
      }),
    ]);
    expect(issues[0].message).toMatch(/^Not JSON/);
  });

  it("refuses a wrong format", () => {
    const { export: exp, issues } = parseHostExport(
      JSON.stringify({ ...fixture("cli"), format: "other" }),
    );
    expect(exp).toBeUndefined();
    expect(issues).toEqual([
      expect.objectContaining({ file: EXPORT_FILE, path: "format" }),
    ]);
  });

  it("names a missing member by the child that reaches it", () => {
    const cli = fixture("cli");
    const { connect: _connect, ...members } = cli.members;
    const { issues } = parseHostExport(JSON.stringify({ ...cli, members }));
    expect(issues).toEqual([
      expect.objectContaining({
        file: "hosts/cli/host.js",
        path: "children.cli-connect.host",
        message: 'Member folder "connect" is missing from members.',
      }),
    ]);
  });

  it("names the field a member fails on", () => {
    const cli = fixture("cli");
    const connect = { ...cli.members.connect, reactr: {} };
    const { export: exp, issues } = parseHostExport(
      JSON.stringify({ ...cli, members: { ...cli.members, connect } }),
    );
    expect(exp).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      file: "hosts/connect/host.js",
      path: "",
    });
    expect(issues[0].message).toMatch(/reactr/);
  });

  it("names a nested field a member fails on", () => {
    const cli = fixture("cli");
    const connect = {
      ...cli.members.connect,
      reactor: { backends: { main: { kind: "wrkr" } } },
    };
    const { issues } = parseHostExport(
      JSON.stringify({ ...cli, members: { ...cli.members, connect } }),
    );
    expect(issues).toEqual([
      expect.objectContaining({
        file: "hosts/connect/host.js",
        path: "reactor.backends.main.kind",
      }),
    ]);
  });

  it("refuses a malformed token", () => {
    const { export: exp, issues } = parseHostExport(
      JSON.stringify(
        reactorHost({
          backends: { sb: { kind: "remote", remote: { url: { $env: 3 } } } },
        }),
      ),
    );
    expect(exp).toBeUndefined();
    expect(errors(issues).map((i) => i.path)).toEqual([
      "reactor.backends.sb.remote.url",
    ]);
  });
});

describe("planImport", () => {
  it("derives the cli Connect's remote and keeps the switchboard row", () => {
    const { setName, rows, issues } = plan(fixture("cli"));
    expect(setName).toBe("cli");
    expect(rows).toEqual([
      expect.objectContaining({
        include: true,
        member: "cli-switchboard",
        backend: "main",
        descriptor: {
          kind: "remote",
          name: "cli-switchboard.main",
          remote: { url: "http://localhost:7491/graphql" },
        },
        url: { value: "http://localhost:7491/graphql", derived: true },
      }),
    ]);
    expect(issues.map((issue) => issue.message)).toContain(
      "cli-connect.sb attaches to http://localhost:7491/graphql, as cli-switchboard.main does; only cli-switchboard.main is imported.",
    );
  });

  it("projects desktop's server reactor onto idb and drops dynamic", () => {
    const { rows, issues } = plan(fixture("desktop"));
    expect(rows.map((row) => row.descriptor)).toEqual([
      {
        kind: "in-process",
        name: "desktop-switchboard.main",
        storage: { kind: "idb" },
        featureFlags: {
          documentDecisions: false,
          authEnforcement: false,
          authGroups: false,
          authConditions: false,
        },
      },
      expect.objectContaining({ kind: "worker", name: "desktop-connect.main" }),
    ]);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        file: "hosts/desktop/host.js",
        path: "children.desktop-switchboard.reactor.backends.main.storage",
      }),
    );
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "info",
        path: "children.desktop-switchboard.reactor.backends.main.packages.dynamic",
      }),
    );
  });

  it("gives standalone Connect one worker row and lists what it ignores", () => {
    const { rows, issues } = plan(fixture("connect"));
    expect(rows.map((row) => row.descriptor.name)).toEqual(["connect.main"]);
    expect(rows[0].descriptor.kind).toBe("worker");
    const ignored = issues.find((issue) =>
      issue.message.includes("not projected into the monitor"),
    );
    expect(ignored?.message).toMatch(/reactor\.drives/);
    expect(ignored?.message).toMatch(
      /reactor\.protocol\.createSignaturePolicy/,
    );
    expect(ignored?.message).toMatch(/runner\.plugins/);
  });

  it("keeps vetra's switchboard and studio rows", () => {
    const { rows } = plan(fixture("vetra"));
    expect(
      rows.map((row) => [row.descriptor.name, row.descriptor.kind]),
    ).toEqual([
      ["vetra-switchboard.main", "remote"],
      ["vetra-studio.main", "worker"],
    ]);
  });

  it("asks for a URL the export cannot derive", () => {
    const { rows, issues } = plan(fixture("assistant"));
    expect(rows).toEqual([
      expect.objectContaining({
        include: true,
        descriptor: {
          kind: "remote",
          name: "assistant.switchboard",
          remote: { url: "" },
        },
        url: { value: undefined, derived: false },
      }),
    ]);
    const warning = issues.find(
      (issue) => issue.path === "reactor.backends.switchboard.remote.url",
    );
    expect(warning?.severity).toBe("warning");
    expect(warning?.message).toMatch(/names host "switchboard"/);
  });

  it("asks for a URL when the switchboard binds port 0", () => {
    const cli = fixture("cli");
    const children = {
      ...(cli.host as { children: Record<string, unknown> }).children,
      "cli-switchboard": { host: "switchboard", runner: { port: 0 } },
    };
    const { rows } = plan({ ...cli, host: { ...cli.host, children } });
    expect(rows.map((row) => [row.descriptor.name, row.url])).toEqual([
      ["cli-switchboard.main", { value: undefined, derived: false }],
      ["cli-connect.sb", { value: undefined, derived: false }],
    ]);
  });

  it("keeps a literal remote URL as given", () => {
    const { rows } = plan(
      reactorHost({
        backends: {
          sb: { kind: "remote", remote: { url: "https://sb.example/graphql" } },
        },
      }),
    );
    expect(rows[0].url).toEqual({
      value: "https://sb.example/graphql",
      derived: false,
    });
  });

  it("excludes an in-process postgres backend", () => {
    const { rows, issues } = plan(
      reactorHost({
        backends: {
          main: { kind: "in-process", storage: { kind: "postgres" } },
          mem: { kind: "in-process", storage: { kind: "memory" } },
        },
      }),
    );
    expect(rows.map((row) => [row.descriptor.name, row.include])).toEqual([
      ["solo.main", false],
      ["solo.mem", true],
    ]);
    expect(rows[0].excluded).toMatch(/attach the switchboard/);
    expect(errors(issues)).toEqual([
      expect.objectContaining({
        path: "reactor.backends.main.storage.kind",
      }),
    ]);
  });

  it("names nested members by key path and stops at a cycle", () => {
    const reactor = (name: string) => ({
      name,
      runner: { module: "@powerhousedao/ph-cli/runners/connect" },
      reactor: { backends: { main: { kind: "worker" } } },
    });
    const compound = (name: string, children: Record<string, unknown>) => ({
      name,
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children,
    });
    const { rows, issues } = plan({
      format: "ph-host-export",
      version: 1,
      project: { name: "p", root: "/project" },
      name: "outer",
      host: compound("outer", { i: { host: "inner" }, j: { host: "a" } }),
      members: {
        inner: compound("inner", { x: { host: "a" }, back: { host: "outer" } }),
        a: reactor("a"),
        outer: compound("outer", { i: { host: "inner" }, j: { host: "a" } }),
      },
    });
    expect(rows.map((row) => row.descriptor.name)).toEqual([
      "i.x.main",
      "j.main",
    ]);
    expect(issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        file: "hosts/inner/host.js",
        path: "children.back.host",
      }),
    );
  });
});
