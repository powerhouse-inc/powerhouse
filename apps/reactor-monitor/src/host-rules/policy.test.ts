import { describe, expect, it } from "vitest";
import { stack } from "./__fixtures__/hosts.js";
import {
  checkEnvKey,
  checkSetter,
  checkSetterValue,
  isContainedPath,
  NAME_REASON,
  parsePath,
  REMOTE_URL_REASON,
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
  ["reactor.backends.main.storage.dataDir", ".ph/reactor-storage"],
  ["reactor.namespace", "ns"],
  ["reactor.placement.primary", "main"],
  ["reactor.placement.drives.b", "sb"],
  ["runner.port", 4001],
  ["runner.dev", true],
  ["reactor.backends.main.readModel.url", ".ph/read-storage"],
  ["config.switchboard.workers.executor.count", 2],
  ["config.switchboard.workers", { projection: { enabled: true } }],
  ["config.switchboard.inspection.callsPerMinute", 7],
  ["config.switchboard.auth.admins", ["0xabc"]],
  ["config.switchboard.auth.documentPermissions.enabled", true],
  ["config.switchboard.features.mcp", false],
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

  it("lets a remote open only a drive of a member of this host", () => {
    const at = "host.children.ui.reactor.backends.remote.remote.url";
    const drive = (host: string, path: string[]) => ({
      $output: { host, member: "sb", path },
    });
    const sibling = drive("switchboard", ["drives", "powerhouse", "url"]);
    expect(reason({ path: at, value: sibling })).toBeUndefined();
    for (const value of [
      "https://elsewhere.example/d/powerhouse",
      drive("switchboard", ["endpoints", "graphql"]),
      drive("switchboard", ["drives", "powerhouse"]),
      drive("switchboard", ["drives", "powerhouse", "url", "x"]),
      drive("ghost", ["drives", "powerhouse", "url"]),
    ]) {
      expect(reason({ path: at, value })).toBe(REMOTE_URL_REASON);
    }
    expect(checkSetter({ path: at, value: sibling }).ok).toBe(false);
  });

  describe("drive lists", () => {
    const at = "host.children.ui.reactor.drives";
    const link = (slug: string, host = "switchboard") => ({
      slug,
      remote: {
        url: { $output: { host, member: "sb", path: ["drives", slug, "url"] } },
      },
    });
    const own = { slug: "powerhouse", name: "my-project" };

    it("takes the drives the reactor has, named drives and member drive links", () => {
      expect(reason({ path: at, value: [own, link("b")] })).toBeUndefined();
      expect(
        reason({ path: at, value: [own, { slug: "shared", name: "Shared" }] }),
      ).toBeUndefined();
      expect(reason({ path: at, value: [] })).toBeUndefined();
    });

    it.each([
      [
        "a link to another server",
        { slug: "b", remote: { url: "https://x/d/b" } },
      ],
      ["a link under another slug", { ...link("c"), slug: "b" }],
      ["a link to no member", link("b", "ghost")],
      ["a drive with more than a name", { slug: "b", projectHash: true }],
      ["a token", { $output: { host: "switchboard", path: ["drives"] } }],
    ])("refuses %s", (_name, entry) => {
      expect(reason({ path: at, value: [own, entry] })).toContain(
        "only add a drive by name",
      );
    });

    it("refuses a list that is not a list", () => {
      expect(reason({ path: at, value: { $map: {} } })).toContain(
        "only add a drive by name",
      );
    });
  });

  it("lets a wrapper copy its folder's reactor block, as it is", () => {
    const envelope = stack();
    const connect = envelope.members.connect as Record<string, unknown>;
    const block = {
      ...(connect.reactor as Record<string, unknown>),
      workflows: true,
      renown: { url: "https://renown.example" },
      backends: {
        main: { kind: "worker", packages: { specs: ["@acme/models"] } },
      },
    };
    const withBlock = {
      ...envelope,
      members: { ...envelope.members, connect: { ...connect, reactor: block } },
    };
    const copy = { path: "host.children.ui.reactor", value: block };
    expect(checkSetter(copy, withBlock)).toEqual({ ok: true });
    const changed = { ...block, workflows: false };
    expect(
      checkSetter({ ...copy, value: changed }, withBlock).ok === false,
    ).toBe(true);
    // a child with its own block copies nothing from the folder
    const wrapped = structuredClone(withBlock);
    (wrapped.host as { children: Record<string, unknown> }).children.ui = {
      host: "connect",
      reactor: { backends: {} },
    };
    expect(checkSetter(copy, wrapped).ok).toBe(false);
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
    ["host.children.k.reactor.drives", "drive"],
    ["host.config.apiKey", "runner config"],
    ["host.children.k.config", "runner config"],
    ["host.config.switchboard.packages.registryUrl", "document-model packages"],
    ["host.config.switchboard.packages.dynamic", "document-model packages"],
    ["host.config.switchboard.features.workflows", "workflows"],
  ])("refuses the code-loading or network path %s", (path, message) => {
    expect(reason({ path, value: "x" })).toContain(message);
    expect(reason({ path, value: DELETE })).toContain(message);
  });

  it.each([
    ["protocol.featureFlags.authGroups", "access control"],
    ["storage.reactor.url", "its storage"],
    ["storage.readModel", "search data folder"],
    ["server.port", "Set its port instead"],
    ["server.dev", "hot reload"],
    ["logLevel", "host's environment"],
  ])(
    "sends config.switchboard.%s to where the switchboard reads it",
    (key, message) => {
      const path = `host.children.k.config.switchboard.${key}`;
      expect(reason({ path, value: "x" })).toContain(message);
      expect(reason({ path, value: DELETE })).toContain(message);
      expect(reason({ path, value: "x" })).toContain("won't start");
    },
  );

  it("refuses other switchboard settings, naming them only in the hint", () => {
    expect(
      checkSetter({
        path: "host.config.switchboard.attachments.urlSigningSecret",
        value: "s",
      }),
    ).toEqual({
      ok: false,
      reason: "The monitor can't change this setting.",
      hint: "config.switchboard.attachments.urlSigningSecret",
    });
    expect(
      reason({
        path: "host.config.switchboard.auth.renown.source",
        value: "self",
      }),
    ).toBe("The monitor can't change this setting.");
  });

  it.each([
    ["host.reactor.renown.url", "reactor.renown.url"],
    ["host.reactor", "reactor"],
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

  it.each(["host.name", "members.sb.name"])("sets the name at %s", (path) => {
    expect(reason({ path, value: "renamed-host_2.v1" })).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ["..", ".."],
    ["a parent path", "../../../some/dir/package"],
    ["a slash", "a/b"],
    ["a backslash", "a\\b"],
    ["an absolute path", "/etc/passwd"],
    ["a drive path", "C:x"],
    ["a leading dot", ".hidden"],
    ["a space", "my host"],
    ["an empty name", ""],
    ["an over-long name", "x".repeat(129)],
    ["an $env token", { $env: "LOG_LEVEL" }],
    ["a number", 7],
  ])("refuses a name with %s", (_name, value) => {
    for (const path of ["host.name", "members.sb.name"]) {
      expect(reason({ path, value: value as Setter["value"] })).toBe(
        NAME_REASON,
      );
    }
  });

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
      false,
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
    ["reactor.backends.main.readModel.url", "${userData}/read", true],
    [
      "reactor.backends.main.readModel.url",
      "postgres://db.example/reactor",
      false,
    ],
    ["reactor.backends.main.readModel.url", "../read", false],
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
    ["./.ph/x", true],
    [".ph/./x", true],
    ["${userData}/.ph/x", true],
    ["${userData}/x", true],
    ["", false],
    [".", false],
    [".ph", false],
    ["${userData}", false],
    ["./data", false],
    ["src/data", false],
    ["node_modules/x", false],
    ["hosts/x", false],
    ["~/x", false],
    ["/abs", false],
    ["\\\\share\\x", false],
    ["C:\\data", false],
    [".ph/../src", false],
    ["${userData}/../x", false],
    ["https://x", false],
    [".ph/${HOME}", false],
  ])("%s → %s", (path, ok) => {
    expect(isContainedPath(path)).toBe(ok);
  });
});
