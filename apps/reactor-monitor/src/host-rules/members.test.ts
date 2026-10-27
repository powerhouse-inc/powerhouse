import { describe, expect, it } from "vitest";
import { hostExport, stack } from "./__fixtures__/hosts.js";
import { fileOf, membersOf, primaryBackendName } from "./members.js";

function summary(name: Parameters<typeof hostExport>[0]) {
  return membersOf({ envelope: hostExport(name) }).map((member) => ({
    path: member.path,
    role: member.role,
    reactorAt: member.reactorAt,
    backends: member.backends.map((backend) => [backend.name, backend.mode]),
  }));
}

describe("membersOf", () => {
  it("reads a standalone host as one member", () => {
    expect(summary("switchboard")).toEqual([
      {
        path: "host",
        role: "switchboard",
        reactorAt: "host.reactor",
        backends: [],
      },
    ]);
    expect(summary("connect")).toEqual([
      {
        path: "host",
        role: "connect",
        reactorAt: "host.reactor",
        backends: [["main", "browser"]],
      },
    ]);
  });

  it("uses a wrapper's reactor in place of the member's", () => {
    expect(summary("cli")).toEqual([
      // No wrapper runner: the role comes from the member's own module.
      {
        path: "host.children.cli-switchboard",
        role: "switchboard",
        reactorAt: "members.switchboard.reactor",
        backends: [],
      },
      {
        path: "host.children.cli-connect",
        role: "connect",
        reactorAt: "host.children.cli-connect.reactor",
        backends: [["sb", "remote"]],
      },
    ]);
  });

  it("gives each backend its own attach mode", () => {
    expect(summary("desktop")).toEqual([
      {
        path: "host.children.desktop-switchboard",
        role: "switchboard",
        reactorAt: "host.children.desktop-switchboard.reactor",
        backends: [["main", "controller"]],
      },
      {
        path: "host.children.desktop-connect",
        role: "connect",
        reactorAt: "host.children.desktop-connect.reactor",
        backends: [["main", "browser"]],
      },
    ]);
  });

  it("treats a switchboard's extra backends as the monitor's", () => {
    const envelope = hostExport("switchboard");
    (envelope.host as { reactor: Record<string, unknown> }).reactor.backends = {
      tab: { kind: "in-process", storage: { kind: "memory" } },
      main: { kind: "in-process", storage: { kind: "path" } },
    };
    const [member] = membersOf({ envelope });
    expect(member.backends.map((b) => [b.name, b.primary, b.mode])).toEqual([
      ["tab", false, "browser"],
      ["main", true, "controller"],
    ]);
  });

  it("picks the primary backend as host-core does", () => {
    expect(primaryBackendName(undefined)).toBeUndefined();
    expect(primaryBackendName({ backends: {} })).toBeUndefined();
    expect(primaryBackendName({ backends: { a: {}, local: {} } })).toBe(
      "local",
    );
    expect(
      primaryBackendName({ backends: { a: {}, main: {}, local: {} } }),
    ).toBe("main");
    expect(primaryBackendName({ backends: { a: {}, b: {} } })).toBe("a");
    expect(
      primaryBackendName({
        backends: { a: {}, main: {} },
        placement: { primary: "a" },
      }),
    ).toBe("a");
  });

  it("knows dev mode from the verb or runner.dev", () => {
    const vetra = { envelope: hostExport("vetra") };
    expect(membersOf(vetra).map((member) => member.dev)).toEqual([true, true]);
    expect(
      membersOf(vetra, { verb: "run" }).map((member) => member.dev),
    ).toEqual([false, false]);
    const envelope = stack();
    (
      envelope.host as { children: Record<string, Record<string, unknown>> }
    ).children.sb.runner = {
      dev: true,
    };
    expect(membersOf({ envelope }).map((member) => member.dev)).toEqual([
      true,
      false,
    ]);
  });

  it("hands each member its own env", () => {
    const members = membersOf({
      envelope: stack(),
      env: { "host.children.sb": { REACTOR_WORKERS: "2" } },
    });
    expect(members.map((member) => member.env)).toEqual([
      { REACTOR_WORKERS: "2" },
      {},
    ]);
  });

  it("names the file a path lives in", () => {
    const envelope = stack();
    expect(fileOf(envelope, "host.children.sb.reactor")).toBe(
      "hosts/stack/host.js",
    );
    expect(fileOf(envelope, "members.switchboard.reactor")).toBe(
      "hosts/switchboard/host.js",
    );
    expect(fileOf(envelope, "host.children.sb.env.X")).toBe(
      "hosts/stack/host.js",
    );
  });
});
