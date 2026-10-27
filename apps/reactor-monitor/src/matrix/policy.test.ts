import { describe, expect, it } from "vitest";
import {
  checkEnvKey,
  checkSetterPath,
  checkSetterValue,
  parsePath,
} from "./policy.js";

const SUBJECTS = [
  "host",
  "members.sb",
  "host.children.k",
  "members.c.children.k",
];

const SETTABLE = [
  "reactor.protocol",
  "reactor.protocol.featureFlags",
  "reactor.protocol.featureFlags.authGroups",
  "reactor.protocol.createSignaturePolicy",
  "reactor.backends.main.kind",
  "reactor.backends.main.storage.kind",
  "reactor.namespace",
  "runner.port",
];

const DELETE_ONLY = [
  "reactor.backends.main.storage.dataDir",
  "reactor.backends.main.storage.url",
  "reactor.backends.main.readModel",
];

function reason(
  path: string,
  op: "set" | "delete" = "set",
): string | undefined {
  const verdict = checkSetterPath(path, op);
  return verdict.ok ? undefined : verdict.reason;
}

describe("parsePath", () => {
  it.each([
    ["host.runner.port", ["host"], ["runner", "port"]],
    ["members.sb.reactor", ["members", "sb"], ["reactor"]],
    ["host.children.k.reactor", ["host", "children", "k"], ["reactor"]],
    [
      "members.c.children.k.runner.port",
      ["members", "c", "children", "k"],
      ["runner", "port"],
    ],
    ["host.children", ["host"], ["children"]],
  ])("splits %s into subject and rest", (path, subject, rest) => {
    expect(parsePath(path)).toEqual({
      segments: path.split("."),
      subject,
      rest,
    });
  });

  it.each([
    ["host..runner", "empty segment"],
    ["host.runner.", "empty segment"],
    ["host.__proto__.x", 'segment "__proto__"'],
    ["host.constructor", 'segment "constructor"'],
    ["members.prototype.reactor", 'segment "prototype"'],
    ["project.root", "must start at host"],
    ["members", "must start at host"],
    [Array.from({ length: 33 }, () => "a").join("."), "more than 32 segments"],
  ])("refuses %s", (path, error) => {
    const parsed = parsePath(path);
    expect("error" in parsed ? parsed.error : "").toContain(error);
  });
});

describe("checkSetterPath", () => {
  for (const subject of SUBJECTS) {
    it.each(SETTABLE)(`sets and deletes ${subject}.%s`, (rest) => {
      expect(reason(`${subject}.${rest}`, "set")).toBeUndefined();
      expect(reason(`${subject}.${rest}`, "delete")).toBeUndefined();
    });

    it.each(DELETE_ONLY)(`only deletes ${subject}.%s`, (rest) => {
      expect(reason(`${subject}.${rest}`, "delete")).toBeUndefined();
      expect(reason(`${subject}.${rest}`, "set")).toContain(
        "may only be $delete'd",
      );
    });
  }

  it.each([
    ["host.runner.module", "runner.module loads code"],
    ["host.runner.plugins", "runner.plugins loads code"],
    ["host.runner.plugins.0", "runner.plugins loads code"],
    [
      "members.sb.reactor.backends.main.packages.dynamic",
      "packages loads code",
    ],
    ["host.reactor.workflows", "workflows loads code"],
    ["host.reactor.backends.sb.remote.url", "remote.url reaches the network"],
    ["host.children.k.reactor.drives", "drives reach the network"],
    ["host.children.k.host", "children.*.host picks the code a member runs"],
    [
      "members.c.children.k.host",
      "children.*.host picks the code a member runs",
    ],
    ["host.config.apiKey", "config is runner-defined"],
    ["host.children.k.config", "config is runner-defined"],
    ["host.reactor.renown.url", "reactor.renown.url is not matrix-settable"],
    ["host.reactor", "reactor is not matrix-settable"],
    ["host.reactor.backends.main", "is not matrix-settable"],
    ["host.reactor.backends.main.storage", "is not matrix-settable"],
    ["host.children.k", "cannot replace a whole host"],
    ["members.sb", "cannot replace a whole host"],
    ["host.children", "children is not matrix-settable"],
    ["host.name", "name is not matrix-settable"],
  ])("refuses %s", (path, message) => {
    expect(reason(path, "set")).toContain(message);
    expect(reason(path, "delete")).toContain(message);
  });

  it("refuses a malformed path with the parse error", () => {
    expect(reason("host.__proto__.polluted")).toBe('segment "__proto__"');
  });
});

describe("checkSetterValue", () => {
  it.each([
    ["a plain value", { authGroups: true }],
    ["an allowlisted $env", { $env: "REACTOR_NAMESPACE" }],
    [
      "an allowlisted object $env",
      { $env: { name: "LOG_LEVEL", optional: true } },
    ],
    ["an escaped $env", { $$: { $env: "NODE_OPTIONS" } }],
    ["null", null],
  ])("accepts %s", (_name, value) => {
    expect(checkSetterValue(value)).toEqual({ ok: true });
  });

  it.each([
    ["a denied $env", { $env: "NODE_OPTIONS" }, '"NODE_OPTIONS"'],
    ["a nested denied $env", { a: [{ b: { $env: "PATH" } }] }, '"PATH"'],
    [
      "a denied object $env",
      { $env: { name: "PH_REACTOR_DATABASE_URL" } },
      '"PH_REACTOR_DATABASE_URL"',
    ],
    [
      "a code-loading REACTOR_ key",
      { $env: "REACTOR_PLUGIN_DIR" },
      '"REACTOR_PLUGIN_DIR"',
    ],
    ["a nameless object $env", { $env: { optional: true } }, '"undefined"'],
    ["a huge value", "x".repeat(9_000), "at most 8192"],
  ])("refuses %s", (_name, value, message) => {
    const verdict = checkSetterValue(value);
    expect(verdict.ok).toBe(false);
    expect(verdict.ok ? "" : verdict.reason).toContain(message);
  });
});

describe("checkEnvKey", () => {
  it.each([
    "REACTOR_WORKERS",
    "ADMINS",
    "RESOLVE_CALLER_IDENTITY",
    "INSPECTION_X",
  ])("admits %s", (key) => expect(checkEnvKey(key)).toEqual({ ok: true }));

  it.each([
    "PH_REACTOR_DATABASE_URL",
    "SKIP_CREDENTIAL_VERIFICATION",
    "ALLOW_INSECURE_SKIP_CREDENTIAL_VERIFICATION",
    "NODE_OPTIONS",
    "REACTOR_MODULE_PATH",
    "PH_MONITOR_MATRIX_PROBER",
  ])("refuses %s", (key) => {
    expect(checkEnvKey(key)).toEqual({
      ok: false,
      reason: `env ${key} is not browser-settable`,
    });
  });
});
