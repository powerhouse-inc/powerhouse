import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { checkHost, type CheckHostOptions } from "../src/check-host.js";
import type { HostIssue } from "../src/host-issues.js";
import type { OutputSource } from "../src/resolve/resolve.js";
import {
  CANNED,
  cleanupProjects,
  ENV,
  FIXTURES,
  project,
} from "./fixture-project.js";

afterAll(cleanupProjects);

function cannedSource(projectName: string): OutputSource {
  const canned = CANNED[projectName] ?? {};
  return {
    lookup(ref) {
      return Object.hasOwn(canned, ref.host)
        ? { status: "available", outputs: canned[ref.host] }
        : { status: "unavailable", message: `"${ref.host}" not canned` };
    },
  };
}

function check(
  projectName: string,
  host: string,
  extra: Partial<CheckHostOptions> = {},
) {
  return checkHost(host, {
    projectRoot: project(projectName),
    env: ENV,
    ...extra,
  });
}

function writeHost(projectName: string, folder: string, host: unknown): void {
  const dir = path.join(project(projectName), "hosts", folder);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    path.join(dir, "host.js"),
    `export default ${JSON.stringify(host)};`,
  );
}

function expectOne(
  issues: readonly HostIssue[],
  expected: Partial<HostIssue>,
  message: RegExp,
): void {
  expect(issues).toHaveLength(1);
  expect(issues[0]).toMatchObject(expected);
  expect(issues[0].message).toMatch(message);
}

const MATRIX = readdirSync(path.join(FIXTURES, "matrix", "hosts")).sort();

describe("checkHost: clean hosts", () => {
  it.each(MATRIX)(
    "matrix %s has no issues with its producers' outputs",
    async (host) => {
      const result = await check("matrix", host, {
        outputs: cannedSource("matrix"),
      });
      expect(result.issues).toEqual([]);
      expect(result.deferred).toEqual([]);
    },
  );

  it("checks $output tokens declared-only without outputs", async () => {
    const result = await check("matrix", "connect-remote");
    expect(result.issues).toEqual([]);
    expect(result.deferred.map((d) => d.path).sort()).toEqual([
      "reactor.backends.sb.remote.url",
      "reactor.drives[0].remote.url",
      "runner.plugins[0].config.drive",
    ]);
    expect(result.deferred[0].file).toBe("hosts/connect-remote/host.js");
  });

  it.each(["desktop-map", "cli-map", "studio"])(
    "compound %s checks its members declared-only without outputs",
    async (host) => {
      const result = await check("matrix", host);
      expect(result.issues).toEqual([]);
      expect(result.deferred.length).toBeGreaterThan(0);
      expect(
        result.deferred.every((d) => d.file !== `hosts/${host}/host.js`),
      ).toBe(true);
    },
  );
});

describe("checkHost: one issue per stage", () => {
  it("load: an unknown host", async () => {
    const result = await check("invariants", "nope");
    expectOne(
      result.issues,
      { stage: "load", file: "hosts/nope/host.js" },
      /Unknown host "nope"/,
    );
  });

  it.each([
    ["token-bad-path", "reactor.drives[0].remote.url", /has no key "uri"/],
    [
      "removed-from-slug",
      "runner.plugins[0].config.drive",
      /drive: \{ from, slug \} was removed/,
    ],
    ["unknown-runner-key", "runner", /Unrecognized key: "strictPortt"/],
  ])("declared: %s", async (host, at, message) => {
    const result = await check("invariants", host);
    expectOne(result.issues, { stage: "declared", path: at }, message);
  });

  it("declared: reports a removed form, a bad path and a schema error together", async () => {
    writeHost("invariants", "three-at-once", {
      name: "inv-three",
      runner: {
        module: "@powerhousedao/ph-cli/runners/connect",
        strictPortt: true,
        plugins: [
          {
            module: "@powerhousedao/connect/plugins/workflows",
            config: { drive: { from: "switchboard", slug: "workflows" } },
          },
        ],
      },
      reactor: {
        drives: [
          {
            slug: "workflows",
            remote: {
              url: {
                $output: { host: "switchboard", path: ["drives", "x", "uri"] },
              },
            },
          },
        ],
      },
    });
    const result = await check("invariants", "three-at-once");
    expect(result.issues.map((i) => [i.stage, i.path])).toEqual([
      ["declared", "runner.plugins[0].config.drive"],
      ["declared", "reactor.drives[0].remote.url"],
      ["declared", "runner"],
    ]);
  });

  it("resolve: an unset $env", async () => {
    const result = await check("invariants", "env-unset");
    expectOne(
      result.issues,
      { stage: "resolve", path: "config.apiKey" },
      /reads \$env FIXTURE_NEVER_SET, which is not set/,
    );
  });

  it("resolve: reports every unset $env", async () => {
    writeHost("invariants", "env-unset-two", {
      name: "inv-env-two",
      runner: { module: "@powerhousedao/clint/mastra-runner" },
      config: {
        apiKey: {
          $concat: [{ $env: "FIXTURE_UNSET_A" }, { $env: "FIXTURE_UNSET_B" }],
        },
      },
    });
    const result = await check("invariants", "env-unset-two");
    expect(result.issues.map((i) => [i.stage, i.path])).toEqual([
      ["resolve", "config.apiKey.$concat[0]"],
      ["resolve", "config.apiKey.$concat[1]"],
    ]);
  });

  it("resolve: reads the injected env, never process.env", async () => {
    process.env.FIXTURE_NEVER_SET = "from-process";
    try {
      const result = await check("invariants", "env-unset");
      expect(result.issues.map((i) => i.stage)).toEqual(["resolve"]);
    } finally {
      delete process.env.FIXTURE_NEVER_SET;
    }
    const clean = await check("invariants", "env-unset", {
      env: { FIXTURE_NEVER_SET: "set" },
    });
    expect(clean.issues).toEqual([]);
  });

  it("declared: a token in a field that is not token-able", async () => {
    const result = await check("invariants", "token-in-plain-field");
    expectOne(
      result.issues,
      { stage: "declared", path: "runner.host" },
      /does not take an output token/,
    );
  });

  it("compound: a startOrder that contradicts the tokens", async () => {
    const result = await check("invariants", "start-order-contradicts");
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      stage: "declared",
      file: "hosts/start-order-contradicts/host.js",
    });
    expect(result.issues[0].message).toMatch(
      /config\.startOrder starts "ui" before "sb"/,
    );
  });

  it("boot: the runner's checkBoot, standalone and as a member", async () => {
    const env = { ...ENV, FIXTURE_BOOT_ISSUE: "workers need postgres" };
    const standalone = await check("invariants", "switchboard", { env });
    expect(standalone.issues).toEqual([
      {
        stage: "boot",
        file: "hosts/switchboard/host.js",
        path: "reactor",
        message: "workers need postgres",
      },
    ]);
    const compound = await check("matrix", "cli-map", { env });
    expect(compound.issues).toEqual([
      expect.objectContaining({
        stage: "boot",
        file: "hosts/switchboard/host.js",
        message: "workers need postgres",
      }),
    ]);
  });

  it("resolved: a resolved value the hostSchema rejects, and no boot after it", async () => {
    writeHost("invariants", "resolved-bad-url", {
      name: "inv-resolved-bad-url",
      runner: { module: "@powerhousedao/ph-cli/runners/switchboard" },
      reactor: {
        drives: [
          { slug: "far", remote: { url: { $env: "FIXTURE_REMOTE_URL" } } },
        ],
      },
    });
    const env = {
      ...ENV,
      FIXTURE_REMOTE_URL: "",
      FIXTURE_BOOT_ISSUE: "would boot",
    };
    const result = await check("invariants", "resolved-bad-url", { env });
    expect(result.issues.map((i) => [i.stage, i.path])).toEqual([
      ["resolved", "reactor.drives[0].remote.url"],
    ]);
    const fixed = await check("invariants", "resolved-bad-url", {
      env: { ...env, FIXTURE_REMOTE_URL: "http://127.0.0.1:1/d/far" },
    });
    expect(fixed.issues.map((i) => i.stage)).toEqual(["boot"]);
  });

  it("boot: members are checked at the verbs the compound starts them at", async () => {
    const env = { ...ENV, FIXTURE_BOOT_ISSUE: "verb" };
    const verbsOf = async (host: string, verb?: string) =>
      (await check("matrix", host, { env, ...(verb ? { verb } : {}) })).issues
        .filter((i) => i.file === "hosts/switchboard/host.js")
        .map((i) => [i.path, i.message]);
    expect(await verbsOf("cli-map")).toEqual([["", "verb run"]]);
    expect(await verbsOf("cli-map", "dev")).toEqual([["", "verb dev"]]);
    writeHost("matrix", "compound-dev", {
      name: "lab-compound-dev",
      runner: {
        module: "@powerhousedao/host-core/runners/compound",
        defaultVerb: "dev",
      },
      children: { sb: { host: "switchboard" } },
    });
    expect(await verbsOf("compound-dev")).toEqual([["", "verb dev"]]);
  });

  it("defers a producer read both bare and member-qualified", async () => {
    writeHost("invariants", "bare-and-member", {
      name: "inv-bare-and-member",
      runner: { module: "@powerhousedao/ph-cli/runners/connect" },
      reactor: {
        drives: [
          {
            slug: "a",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  path: ["drives", "inv", "url"],
                },
              },
            },
          },
          {
            slug: "b",
            remote: {
              url: {
                $output: {
                  host: "switchboard",
                  member: "sb",
                  path: ["drives", "inv", "url"],
                },
              },
            },
          },
        ],
      },
    });
    const result = await check("invariants", "bare-and-member");
    expect(result.issues).toEqual([]);
    expect(result.deferred.map((d) => d.members)).toEqual([
      ["switchboard"],
      ["switchboard#sb"],
    ]);
  });

  it("boot: skipped at a one-shot verb", async () => {
    const env = { ...ENV, FIXTURE_BOOT_ISSUE: "workers need postgres" };
    const result = await check("invariants", "switchboard", {
      env,
      verb: "build",
    });
    expect(result.issues).toEqual([]);
  });

  it("declared: a verb the runner does not export", async () => {
    const result = await check("invariants", "switchboard", { verb: "start" });
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].stage).toBe("declared");
    expect(result.issues[0].message).toMatch(
      /does not support the verb "start"/,
    );
  });
});
