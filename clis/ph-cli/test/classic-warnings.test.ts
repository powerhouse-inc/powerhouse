import {
  DEPRECATIONS_WARNED_ENV,
  MIGRATION_GUIDE_URL,
} from "@powerhousedao/shared/clis/deprecations";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { phCliCommands } from "../src/commands/ph-cli-commands.js";
import {
  classicDeprecations,
  classicWithoutHostsError,
  warnClassicInvocation,
  type ClassicArgSchemas,
} from "../src/utils/classic-warnings.js";
import { applyRunSugar } from "../src/utils/run-sugar.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(hosts: string[] = [], config?: unknown): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-classic-warnings-"));
  temporary.push(dir);
  for (const host of hosts) {
    const hostDir = path.join(dir, "hosts", host);
    mkdirSync(hostDir, { recursive: true });
    writeFileSync(path.join(hostDir, "host.js"), "export default {};");
  }
  if (config !== undefined) {
    writeFileSync(
      path.join(dir, "powerhouse.config.json"),
      JSON.stringify(config),
    );
  }
  return dir;
}

const MIGRATED = ["connect", "switchboard", "vetra"];

// The runners' own schemas, as `ph run` checks arguments against them.
async function schemas(): Promise<ClassicArgSchemas> {
  const [switchboard, connect] = await Promise.all([
    import("@powerhousedao/ph-run/runners/switchboard"),
    import("@powerhousedao/ph-run/runners/connect"),
  ]);
  return { switchboard: switchboard.argsSchema, connect: connect.argsSchema };
}

const texts = (
  args: string[],
  project: string,
  argSchemas?: ClassicArgSchemas,
): string[] =>
  classicDeprecations(args, project, argSchemas).map((d) => d.text);

describe("classic commands: a project without hosts/ is an error", () => {
  const known = new Set(Object.keys(phCliCommands));

  it.each([
    [["vetra"], "ph vetra", "ph run vetra"],
    [["vetra", "--watch"], "ph vetra", "ph run vetra"],
    [["connect"], "ph connect", "ph run connect dev"],
    [["connect", "studio"], "ph connect studio", "ph run connect dev"],
    [["connect", "build"], "ph connect build", "ph run connect build"],
    [["connect", "preview"], "ph connect preview", "ph run connect serve"],
    [["switchboard"], "ph switchboard", "ph run switchboard"],
    [["reactor"], "ph reactor", "ph run switchboard"],
  ])("%j names `ph migrate`", (args, typed, replacement) => {
    const project = makeProject();
    expect(classicWithoutHostsError(args, project)).toBe(
      `This project has no hosts/ folder, so \`${typed}\` cannot run. ` +
        `Run \`ph migrate\` to add the host files, then use \`${replacement}\`.`,
    );
    // The error stands alone: no warnings on top of it.
    expect(classicDeprecations(args, project)).toEqual([]);
  });

  it("an empty hosts/ folder is an error too, not a fallback", () => {
    const project = makeProject();
    const hostsDir = path.join(project, "hosts");
    mkdirSync(hostsDir);
    expect(classicWithoutHostsError(["switchboard"], project)).toBe(
      `hosts/ exists at ${hostsDir} but contains no <name>/host.js, so \`ph switchboard\` cannot run. ` +
        "Run `ph migrate` to add the host files, then use `ph run switchboard`.",
    );
    // A folder without a host.js is not a host.
    mkdirSync(path.join(hostsDir, "vetra"));
    expect(classicWithoutHostsError(["vetra"], project)).toContain(
      "Run `ph migrate`",
    );
    expect(classicDeprecations(["vetra"], project)).toEqual([]);
  });

  it("a project with a host file routes as before", () => {
    const project = makeProject(MIGRATED);
    for (const args of [
      ["vetra"],
      ["connect"],
      ["connect", "build"],
      ["switchboard"],
      ["reactor"],
    ]) {
      expect(classicWithoutHostsError(args, project)).toBeUndefined();
    }
    // `ph vetra` there is `ph run vetra`.
    expect(applyRunSugar(["vetra"], known, project).args).toEqual([
      "run",
      "vetra",
    ]);
    // Another host's file is enough: the command warns, as it did.
    const partial = makeProject(["switchboard"]);
    expect(classicWithoutHostsError(["vetra"], partial)).toBeUndefined();
    expect(texts(["vetra"], partial)).toHaveLength(1);
  });

  it("leaves the commands that boot no classic stack alone", () => {
    const project = makeProject();
    for (const args of [
      ["migrate"],
      ["init"],
      ["generate"],
      ["build"],
      ["run", "vetra"],
      ["connect", "config"],
      ["vetra", "--help"],
      ["switchboard", "-h"],
      [],
    ]) {
      expect(classicWithoutHostsError(args, project)).toBeUndefined();
    }
  });
});

describe("classic warnings: a classic command in a hosts project", () => {
  it.each([
    [["connect"], "ph connect", "connect", "ph run connect dev"],
    [
      ["connect", "build"],
      "ph connect build",
      "connect",
      "ph run connect build",
    ],
    [["switchboard"], "ph switchboard", "switchboard", "ph run switchboard"],
  ])("%j names its `ph run` form", (args, typed, host, replacement) => {
    expect(texts(args, makeProject(MIGRATED))).toEqual([
      `\`${typed}\` runs the classic way and does not read hosts/${host}/host.js. ` +
        `The classic way stops working in 6.4: use \`${replacement}\` instead.`,
    ]);
  });

  it("names the host file a project lacks", () => {
    expect(texts(["vetra"], makeProject(["switchboard"]))).toEqual([
      "`ph vetra` runs the classic way, which stops working in 6.4. " +
        "This project has no hosts/vetra/host.js: add that host file, then use `ph run vetra`.",
    ]);
  });
});

describe("classic warnings: the `ph reactor` alias", () => {
  it("names `ph run switchboard`", () => {
    expect(texts(["reactor"], makeProject(MIGRATED))).toEqual([
      "`ph reactor` is a deprecated alias and is removed in 6.4. Use `ph run switchboard` instead.",
    ]);
  });
});

describe("classic warnings: flags", () => {
  it.each([
    ["--migrate", "migrate"],
    ["--migrate-status", "migrate-status"],
    ["--reset", "reset"],
    ["--dev", "dev"],
  ])("`ph switchboard %s` became a verb", async (flag, verb) => {
    const warnings = texts(
      ["switchboard", flag],
      makeProject(MIGRATED),
      await schemas(),
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[1]).toBe(
      `\`ph switchboard ${flag}\` is deprecated and stops working in 6.4. Use \`ph run switchboard ${verb}\` instead.`,
    );
  });

  it("says nothing about a flag `ph run` takes as it is", async () => {
    const argSchemas = await schemas();
    const project = makeProject(MIGRATED);
    expect(
      texts(
        ["switchboard", "--port", "4001", "--db-path=x"],
        project,
        argSchemas,
      ),
    ).toHaveLength(1);
    expect(
      texts(
        ["connect", "studio", "--port", "3000", "--debug"],
        project,
        argSchemas,
      ),
    ).toHaveLength(1);
    // `ph vetra` in a project without hosts/vetra: member names pass.
    expect(
      texts(
        ["vetra", "--switchboard-port", "4001", "--connect-port=3000"],
        makeProject(["switchboard", "connect"]),
        argSchemas,
      ),
    ).toHaveLength(1);
  });

  it("passes on what the runner says about a retired flag", async () => {
    const warnings = texts(
      ["vetra", "--watch", "--disable-connect"],
      makeProject(["switchboard"]),
      await schemas(),
    );
    expect(warnings.slice(1)).toEqual([
      "`ph vetra --watch` is deprecated and stops working in 6.4: it is no longer needed.",
      "`ph vetra --disable-connect` is deprecated and stops working in 6.4: use `ph run switchboard dev` instead.",
    ]);
  });

  it("groups the flags without a `ph run` argument", async () => {
    const argSchemas = await schemas();
    expect(
      texts(
        ["vetra", "--logs", "--restart"],
        makeProject(["switchboard"]),
        argSchemas,
      )[1],
    ).toBe(
      "The `ph vetra` flags --logs, --restart have no `ph run vetra` argument and stop working in 6.4. " +
        "Set what they configure in the host files under hosts/ instead.",
    );
    expect(
      texts(
        ["connect", "build", "--outDir", "out"],
        makeProject(MIGRATED),
        argSchemas,
      )[1],
    ).toBe(
      "`ph connect build --outDir` has no `ph run connect build` argument and stops working in 6.4. " +
        "Set what it configures in the host files under hosts/ instead.",
    );
  });
});

describe("classic warnings: powerhouse.config.json", () => {
  it("lists the superseded keys with their host file homes", () => {
    const project = makeProject(["switchboard"], {
      studio: { port: 3000, openBrowser: true },
      reactor: { port: 4001, storage: { type: "filesystem" } },
    });
    expect(texts(["vetra"], project)[1]).toBe(
      "powerhouse.config.json sets studio.openBrowser, reactor.storage: only the classic commands read them, and 6.4 refuses them. " +
        "Move studio.openBrowser to runner.openBrowser in hosts/connect/host.js; " +
        "reactor.storage to reactor.backends.<name>.storage in hosts/switchboard/host.js.",
    );
  });

  it("says nothing about the keys the host files reference", () => {
    const project = makeProject(["switchboard"], {
      studio: { port: 3000 },
      reactor: { port: 4001 },
      vetra: { connectPort: 3001 },
      connect: { drives: { allowAddDrive: false } },
    });
    expect(texts(["vetra"], project)).toHaveLength(1);
  });
});

describe("classic warnings: what stays silent", () => {
  const known = new Set(Object.keys(phCliCommands));

  it("a migrated project that runs its hosts", () => {
    const project = makeProject(MIGRATED, { studio: { openBrowser: true } });
    for (const args of [
      ["run", "vetra"],
      ["run", "switchboard", "migrate"],
      ["run", "connect", "build"],
      ["access-token"],
      ["build"],
      ["migrate"],
      [],
    ]) {
      expect(classicDeprecations(args, project)).toEqual([]);
    }
    // `ph vetra` there is `ph run vetra`.
    const sugar = applyRunSugar(["vetra", "--watch"], known, project);
    expect(classicDeprecations(sugar.args, project)).toEqual([]);
  });

  it("help, and `ph connect config`", () => {
    const project = makeProject();
    expect(classicDeprecations(["vetra", "--help"], project)).toEqual([]);
    expect(classicDeprecations(["switchboard", "-h"], project)).toEqual([]);
    expect(classicDeprecations(["connect", "config"], project)).toEqual([]);
  });
});

describe("classic warnings: printing", () => {
  it("prints once per invocation, with the migration link", async () => {
    const env: Record<string, string | undefined> = {};
    const warnings: string[] = [];
    const warn = (text: string) => warnings.push(text);
    const project = makeProject(MIGRATED);
    await warnClassicInvocation(["reactor", "--reset"], project, env, warn);
    expect(warnings).toHaveLength(2);
    for (const warning of warnings) {
      expect(warning.startsWith("Warning: ")).toBe(true);
      expect(warning.endsWith(` See ${MIGRATION_GUIDE_URL}`)).toBe(true);
    }
    expect(warnings[1]).toContain("Use `ph run switchboard reset` instead.");
    // A classic command this one spawns inherits the env.
    await warnClassicInvocation(["switchboard"], project, { ...env }, warn);
    expect(warnings).toHaveLength(2);
    expect(env[DEPRECATIONS_WARNED_ENV]?.split(",")).toContain("classic");
  });

  it("prints nothing and marks nothing for `ph run`", async () => {
    const env: Record<string, string | undefined> = {};
    const warnings: string[] = [];
    await warnClassicInvocation(
      ["run", "vetra"],
      makeProject(MIGRATED),
      env,
      (text) => warnings.push(text),
    );
    expect(warnings).toEqual([]);
    expect(env).toEqual({});
  });

  it("writes to stderr by default", async () => {
    const calls: unknown[][] = [];
    const original = console.warn;
    console.warn = (...args: unknown[]) => calls.push(args);
    try {
      await warnClassicInvocation(["switchboard"], makeProject(MIGRATED), {});
    } finally {
      console.warn = original;
    }
    expect(calls).toHaveLength(1);
  });
});
