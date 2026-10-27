import { describe, expect, it } from "vitest";
import { stack } from "./__fixtures__/hosts.js";
import {
  checkEnvKey,
  checkSetter,
  checkSetterValue,
  isContainedPath,
  parsePath,
} from "./policy.js";
import type { Setter } from "./schema.js";

const SUBJECTS = [
  "host",
  "members.sb",
  "host.children.k",
  "members.c.children.k",
];
const ENVELOPE = stack();
const DELETE = { $delete: true } as const;

const SETTABLE: [string, unknown][] = [
  ["reactor.protocol", { featureFlags: {} }],
  ["reactor.protocol.featureFlags.authGroups", true],
  ["reactor.protocol.createSignaturePolicy", "legacy"],
  ["reactor.backends.main.kind", "worker"],
  ["reactor.backends.main.storage.kind", "idb"],
  ["reactor.backends.main.storage.dataDir", { $env: "REACTOR_DATA_DIR" }],
  ["reactor.backends.main.readModel.url", ".ph/read-storage"],
  ["reactor.namespace", "ns"],
  ["reactor.placement.primary", "main"],
  ["runner.port", 4001],
  ["runner.dev", true],
];

const DELETE_ONLY = [
  "reactor.backends.main",
  "reactor.backends.main.storage",
  "reactor.backends.main.storage.url",
  "reactor.backends.main.readModel",
  "reactor.backends.main.remote",
  "reactor.placement",
];

function reason(setter: Setter): string | undefined {
  const verdict = checkSetter(setter, ENVELOPE);
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
  ])("splits %s", (path, subject, rest) => {
    expect(parsePath(path)).toEqual({
      segments: path.split("."),
      subject,
      rest,
    });
  });

  it.each([
    ["host..runner", "has an empty part"],
    ["host.runner.", "has an empty part"],
    ["host.__proto__.x", 'reserved name "__proto__"'],
    ["host.constructor", 'reserved name "constructor"'],
    ["members.prototype.reactor", 'reserved name "prototype"'],
    [
      "host.reactor.backends.main.storage.dataDir.$env",
      "points inside a token",
    ],
    ["project.root", "must start at host"],
    ["members", "must start at host"],
    [Array.from({ length: 33 }, () => "a").join("."), "longer than 32 parts"],
  ])("refuses %s", (path, error) => {
    const parsed = parsePath(path);
    expect("error" in parsed ? parsed.error : "").toContain(error);
  });
});

describe("checkSetter", () => {
  for (const subject of SUBJECTS) {
    it.each(SETTABLE)(`sets and removes ${subject}.%s`, (rest, value) => {
      expect(
        reason({ path: `${subject}.${rest}`, value: value as Setter["value"] }),
      ).toBeUndefined();
      expect(
        reason({ path: `${subject}.${rest}`, value: DELETE }),
      ).toBeUndefined();
    });

    it.each(DELETE_ONLY)(`only removes ${subject}.%s`, (rest) => {
      expect(
        reason({ path: `${subject}.${rest}`, value: DELETE }),
      ).toBeUndefined();
      expect(reason({ path: `${subject}.${rest}`, value: "x" })).toContain(
        "can only remove",
      );
    });
  }

  it("writes a whole backend leaf by leaf", () => {
    expect(
      reason({
        path: "host.children.ui.reactor.backends.tab",
        value: { kind: "in-process", storage: { kind: "memory" } },
      }),
    ).toBeUndefined();
    expect(
      reason({
        path: "host.children.ui.reactor.backends.tab",
        value: { kind: "in-process", packages: { specs: ["@evil/pkg"] } },
      }),
    ).toContain("document-model packages");
  });

  it("adds and removes a member that runs an existing folder", () => {
    expect(
      reason({
        path: "host.children.sb2",
        value: { host: "switchboard", runner: { port: 4002 } },
      }),
    ).toBeUndefined();
    expect(
      reason({ path: "host.children.sb2", value: DELETE }),
    ).toBeUndefined();
    expect(
      reason({ path: "host.children.sb2", value: { host: "elsewhere" } }),
    ).toContain(`"elsewhere" isn't one`);
    expect(
      reason({
        path: "host.children.sb2",
        value: { host: "switchboard", runner: { module: "x" } },
      }),
    ).toContain("which runner");
    expect(
      reason({ path: "host.children.sb.host", value: "connect" }),
    ).toBeUndefined();
  });

  it("lets a remote point only at a member of this host", () => {
    const at = "host.children.ui.reactor.backends.remote.remote.url";
    const sibling = {
      $output: { host: "switchboard", path: ["endpoints", "graphql"] },
    };
    expect(reason({ path: at, value: sibling })).toBeUndefined();
    expect(
      reason({ path: at, value: "https://elsewhere.example/graphql" }),
    ).toBe("A reactor can only sync with another reactor in this host.");
    expect(
      reason({
        path: at,
        value: { $output: { host: "ghost", path: ["endpoints", "graphql"] } },
      }),
    ).toBe("A reactor can only sync with another reactor in this host.");
    expect(checkSetter({ path: at, value: sibling }).ok).toBe(false);
  });

  it.each([
    ["host.runner.module", "which runner"],
    ["host.runner.plugins", "plugins"],
    ["host.runner.plugins.0", "plugins"],
    [
      "members.sb.reactor.backends.main.packages.dynamic",
      "document-model packages",
    ],
    ["host.reactor.workflows", "workflows"],
    ["host.children.k.reactor.drives", "drives"],
    ["host.config.apiKey", "runner config"],
    ["host.children.k.config", "runner config"],
  ])("refuses the code-loading or network path %s", (path, message) => {
    expect(reason({ path, value: "x" })).toContain(message);
    expect(reason({ path, value: DELETE })).toContain(message);
  });

  it.each([
    ["host.reactor.renown.url", "reactor.renown.url"],
    ["host.reactor", "reactor"],
    ["host.name", "name"],
    ["host.children", "children"],
  ])(
    "refuses the unlisted path %s, naming it only in the hint",
    (path, hint) => {
      expect(checkSetter({ path, value: "x" }, ENVELOPE)).toEqual({
        ok: false,
        reason: "The monitor can't change this setting.",
        hint,
      });
    },
  );

  it("removes a member folder but never the host", () => {
    expect(
      reason({ path: "members.switchboard", value: DELETE }),
    ).toBeUndefined();
    expect(reason({ path: "members.sb", value: {} })).toBe(
      "The monitor can't replace a whole host file.",
    );
    expect(reason({ path: "host", value: DELETE })).toBe(
      "The monitor can't remove the host itself.",
    );
  });

  it.each<[string, unknown, boolean]>([
    ["reactor.backends.main.storage.dataDir", ".ph/reactor-storage", true],
    [
      "reactor.backends.main.storage.dataDir",
      "${userData}/.ph/reactor-storage",
      true,
    ],
    [
      "reactor.backends.main.storage.dataDir",
      { $env: "REACTOR_DATA_DIR" },
      true,
    ],
    [
      "reactor.backends.main.storage.dataDir",
      "/Users/someone/repo/.ph/reactor-storage",
      false,
    ],
    ["reactor.backends.main.storage.dataDir", "../../elsewhere", false],
    ["reactor.backends.main.storage.dataDir", "${userData}/../x", false],
    ["reactor.backends.main.storage.dataDir", "C:\\data", false],
    ["reactor.backends.main.storage.dataDir", 42, false],
    ["reactor.backends.main.readModel.url", ".ph/read-storage", true],
    [
      "reactor.backends.main.readModel.url",
      "postgres://evil.example:5432/x",
      false,
    ],
    ["reactor.backends.main.readModel.url", { $env: "REACTOR_READ" }, false],
  ])("keeps %s = %j inside the project: %s", (rest, value, ok) => {
    expect(
      checkSetter({ path: `host.${rest}`, value: value as Setter["value"] }).ok,
    ).toBe(ok);
  });

  it("checks the value's size and $env names", () => {
    expect(
      reason({
        path: "host.reactor.namespace",
        value: { $env: "NODE_OPTIONS" },
      }),
    ).toContain("NODE_OPTIONS");
    expect(
      reason({ path: "host.reactor.namespace", value: "é".repeat(4_200) }),
    ).toContain("8402 bytes");
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
    ["a denied $env", { $env: "NODE_OPTIONS" }, "NODE_OPTIONS loads code"],
    [
      "a nested denied $env",
      { a: [{ b: { $env: "PATH" } }] },
      "PATH loads code",
    ],
    [
      "a database $env",
      { $env: { name: "PH_REACTOR_DATABASE_URL" } },
      "controller's config",
    ],
    [
      "a nameless object $env",
      { $env: { optional: true } },
      "isn't a valid name",
    ],
  ])("refuses %s", (_name, value, message) => {
    const verdict = checkSetterValue(value);
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
    [
      "PH_REACTOR_DATABASE_URL",
      "The database comes from the controller's config.",
    ],
    ["RENOWN_SOURCE", "Set signer credentials in powerhouse.config.json."],
    [
      "NODE_OPTIONS",
      "NODE_OPTIONS loads code, so only the controller's config can set it.",
    ],
    [
      "REACTOR_MODULE_PATH",
      "REACTOR_MODULE_PATH loads code, so only the controller's config can set it.",
    ],
    [
      "SKIP_CREDENTIAL_VERIFICATION",
      "The monitor doesn't pass SKIP_CREDENTIAL_VERIFICATION to reactors.",
    ],
    [
      "lower",
      `"lower" isn't a valid name. Use capital letters, digits and _, and don't start with a digit.`,
    ],
  ])("refuses %s", (key, reason) => {
    expect(checkEnvKey(key)).toEqual({ ok: false, reason });
  });
});

describe("isContainedPath", () => {
  it.each<[string, boolean]>([
    [".ph/reactor-storage", true],
    ["./data", true],
    ["${userData}/.ph/x", true],
    ["", false],
    ["/abs", false],
    ["\\\\share\\x", false],
    ["a/../../b", false],
    ["https://x", false],
    ["${HOME}/x", false],
  ])("%s → %s", (path, ok) => {
    expect(isContainedPath(path)).toBe(ok);
  });
});
