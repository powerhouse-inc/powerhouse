import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { checkHost } from "../src/check-host.js";
import {
  memberLogFile,
  runCompound,
  type RunCompoundResult,
} from "../src/compound.js";
import { COMPOUND_MEMBER_ENV } from "../src/compound-member.js";
import { loadHost, moduleRootOf } from "../src/host-loader.js";
import { parseHostRef } from "../src/host-ref.js";
import {
  clearRunRecord,
  isPidAlive,
  listRunRecords,
  probeRun,
  readRunRecord,
  runRecordKey,
  writeRunRecord,
} from "../src/run-record.js";
import { resolveRunnerModule } from "../src/runner-resolver.js";

// Hosts an installed package supplies (decision D5). The project `lab` has
// its own hosts and two installed packages: `@acme/tools` (scoped, linked
// in from a store folder as pnpm does, with its own copy of the runner
// `kit-runner`) and `kit` (unscoped); `@acme/bare` is installed without
// hosts.

/** A fake `ph run`: an own-process member writes its record where `ph run
 * <ref>` files it, behind the package for a package's host. */
const FAKE_PH_RUN = `import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const [, , , folder, verb = "run"] = process.argv;
const member = JSON.parse(process.env.${COMPOUND_MEMBER_ENV});
const host = member.host;
const slash = folder.lastIndexOf("/");
const pkg = slash === -1 ? undefined : folder.slice(0, slash);
const runDir = path.join(process.env.PH_USER_DATA_DIR, ".ph", "run", ...(pkg ? pkg.split("/") : []));
const file = path.join(runDir, host.name + ".json");
process.on("exit", () => {
  try {
    if (JSON.parse(readFileSync(file, "utf8")).pid === process.pid) rmSync(file);
  } catch {}
});
console.log("fake ph run " + folder + " " + verb + " as member " + member.member + " of " + member.compound);
mkdirSync(runDir, { recursive: true });
writeFileSync(file, JSON.stringify({
  version: 2,
  host: host.name,
  ...(pkg ? { package: pkg } : {}),
  projectName: "lab",
  kind: "reactor",
  verb,
  pid: process.pid,
  startedAt: new Date().toISOString(),
  outputs: { origin: "http://localhost:1" },
}));
process.stdin.on("end", () => process.exit(0));
process.stdin.resume();
`;

/** The runner both the project and @acme/tools ship a copy of: `who` tells
 * them apart. */
const kitRunner = (who: string) => `export const kind = "reactor";
export const who = "${who}";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const outputsSchema = { safeParse: (data) => ({ success: true, data }) };
export async function run(host, ctx) {
  (globalThis.__kitCalls ??= []).push({
    who,
    name: host.name,
    projectRoot: ctx.projectRoot,
    hostPackage: ctx.hostPackage ? ctx.hostPackage.name : null,
  });
  return { outputs: { origin: "http://localhost:1", who } };
}
`;

const FAKE_COMPOUND = `export const kind = "compound";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run() {}
`;

interface KitCall {
  who: string;
  name: string;
  projectRoot: string;
  hostPackage: string | null;
}

declare global {
  var __kitCalls: KitCall[] | undefined;
}

let base: string;
let project: string;
let store: string;

function write(file: string, source: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function pkg(dir: string, name: string, files: Record<string, string> = {}) {
  write(
    path.join(dir, "package.json"),
    JSON.stringify({ name, type: "module", main: "index.js" }),
  );
  for (const [file, source] of Object.entries(files)) {
    write(path.join(dir, file), source);
  }
}

const host = (body: Record<string, unknown>) =>
  `export default ${JSON.stringify(body)};`;

beforeAll(() => {
  base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-package-hosts-")));
  project = path.join(base, "lab");
  store = path.join(base, "store");

  pkg(project, "lab");
  const modules = path.join(project, "node_modules");
  pkg(path.join(modules, "kit-runner"), "kit-runner", {
    "index.js": kitRunner("project"),
  });
  pkg(path.join(modules, "fake-compound"), "fake-compound", {
    "index.js": FAKE_COMPOUND,
  });
  pkg(path.join(modules, "@powerhousedao", "ph-cli"), "@powerhousedao/ph-cli", {
    "dist/cli.mjs": FAKE_PH_RUN,
  });
  pkg(path.join(modules, "@acme", "bare"), "@acme/bare");
  write(
    path.join(project, "hosts/sb/host.js"),
    host({ name: "lab-sb", runner: { module: "kit-runner" } }),
  );
  write(
    path.join(project, "hosts/app/host.js"),
    host({ name: "lab-app", runner: { module: "kit-runner" } }),
  );
  // A project compound that names a package's host in the full form.
  write(
    path.join(project, "hosts/full/host.js"),
    host({
      name: "full",
      runner: { module: "fake-compound" },
      children: {
        tool: { host: "@acme/tools/sb", process: "own" },
        app: { host: "app" },
      },
    }),
  );
  // Half of a cycle across project and package.
  write(
    path.join(project, "hosts/loop/host.js"),
    host({
      name: "loop",
      runner: { module: "fake-compound" },
      children: { ring: { host: "@acme/tools/ring" } },
    }),
  );

  // @acme/tools: its real folder is in the store, linked into the project.
  const tools = path.join(store, "tools");
  pkg(tools, "@acme/tools", {
    "node_modules/kit-runner/package.json": JSON.stringify({
      name: "kit-runner",
      type: "module",
      main: "index.js",
    }),
    "node_modules/kit-runner/index.js": kitRunner("package"),
    "node_modules/fake-compound/package.json": JSON.stringify({
      name: "fake-compound",
      type: "module",
      main: "index.js",
    }),
    "node_modules/fake-compound/index.js": FAKE_COMPOUND,
    "hosts/sb/host.js": host({
      name: "tools-sb",
      runner: { module: "kit-runner" },
    }),
    // A sibling import inside the package: the package's own sb.
    "hosts/studio/host.js": `import sb from "../sb/host.js";
export default { name: "tools-studio", runner: { ...sb.runner } };`,
    // Bare members: sb is the package's, app only the project's.
    "hosts/stack/host.js": host({
      name: "stack",
      runner: { module: "fake-compound" },
      children: { sb: { host: "sb" }, app: { host: "app" } },
    }),
    "hosts/solo/host.js": host({
      name: "solo",
      runner: { module: "fake-compound" },
      children: { sb: { host: "sb", process: "own" } },
    }),
    "hosts/ghost/host.js": host({
      name: "ghost",
      runner: { module: "fake-compound" },
      children: { x: { host: "nowhere" } },
    }),
    "hosts/ring/host.js": host({
      name: "ring",
      runner: { module: "fake-compound" },
      children: { loop: { host: "loop" } },
    }),
  });
  mkdirSync(path.join(modules, "@acme"), { recursive: true });
  symlinkSync(tools, path.join(modules, "@acme", "tools"), "junction");

  const kit = path.join(store, "kit");
  pkg(kit, "kit", {
    "hosts/studio/host.js": host({
      name: "kit-studio",
      runner: { module: "kit-runner" },
    }),
  });
  symlinkSync(kit, path.join(modules, "kit"), "junction");
});

const results: RunCompoundResult[] = [];
afterEach(async () => {
  for (const result of results.splice(0)) await result.shutdown();
  globalThis.__kitCalls = undefined;
  rmSync(path.join(project, ".ph"), {
    recursive: true,
    force: true,
    maxRetries: 10,
  });
});

afterAll(() => {
  rmSync(base, { recursive: true, force: true, maxRetries: 10 });
});

const calls = () => globalThis.__kitCalls ?? [];

/** `ph run <ref>` up to the compound runner: what start-run hands it. */
async function startCompound(ref: string): Promise<RunCompoundResult> {
  const loaded = await loadHost(project, ref);
  const result = await runCompound(
    loaded.host,
    {
      projectRoot: project,
      verb: "run",
      env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot },
      ...(loaded.package ? { hostPackage: loaded.package } : {}),
    },
    {
      projectName: "lab",
      installSignalHandlers: false,
      exit: () => undefined,
    },
  );
  results.push(result);
  return result;
}

describe("the name grammar", () => {
  it("splits a ref at its last /: a bare name, a scoped and an unscoped package", () => {
    expect(parseHostRef("switchboard")).toEqual({ host: "switchboard" });
    expect(parseHostRef("@powerhousedao/vetra-cli/studio")).toEqual({
      package: "@powerhousedao/vetra-cli",
      host: "studio",
    });
    expect(parseHostRef("vetra-cli/studio")).toEqual({
      package: "vetra-cli",
      host: "studio",
    });
  });

  it("refuses a package without a host, a host with a / and an empty host", () => {
    expect(() => parseHostRef("@acme/tools")).toThrow(
      /"@acme\/tools" names a package, not a host[\s\S]*ph run @acme\/tools\/<host>/,
    );
    expect(() => parseHostRef("@acme/tools/")).toThrow(
      /"@acme\/tools\/" names a package, not a host/,
    );
    expect(() => parseHostRef("tools/")).toThrow(
      /"tools\/" names package "tools" but no host/,
    );
    expect(() => parseHostRef("a/b/c")).toThrow(
      /a host name has no "\/", and "a\/b" is no package name/,
    );
    expect(() => parseHostRef("@acme/tools/sb/x")).toThrow(
      /"@acme\/tools\/sb" is no package name/,
    );
  });
});

describe("rule 1: a bare name is always the project's", () => {
  it("loads the project's host although an installed package has one of that name", async () => {
    const loaded = await loadHost(project, "sb");
    expect(loaded.host.name).toBe("lab-sb");
    expect(loaded.file).toBe(path.join(project, "hosts", "sb", "host.js"));
    expect(loaded.ref).toBe("sb");
    expect(loaded.package).toBeUndefined();
  });

  it("keeps the loader's own message for a project host that does not exist", async () => {
    await expect(loadHost(project, "studio")).rejects.toThrow(
      'Unknown host "studio". Available hosts: app, full, loop, sb.',
    );
  });
});

describe("rule 2: <package>/<host> is the installed package's", () => {
  it("loads a scoped package's host from its real folder", async () => {
    const loaded = await loadHost(project, "@acme/tools/sb");
    expect(loaded.host.name).toBe("tools-sb");
    expect(loaded.ref).toBe("@acme/tools/sb");
    expect(loaded.package).toEqual({
      name: "@acme/tools",
      root: path.join(store, "tools"),
    });
    expect(loaded.file).toBe(
      path.join(store, "tools", "hosts", "sb", "host.js"),
    );
  });

  it("loads an unscoped package's host", async () => {
    const loaded = await loadHost(project, "kit/studio");
    expect(loaded.host.name).toBe("kit-studio");
    expect(loaded.package?.name).toBe("kit");
  });

  it("resolves a package host's sibling import inside the package", async () => {
    const loaded = await loadHost(project, "@acme/tools/studio");
    expect(loaded.host).toEqual({
      name: "tools-studio",
      runner: { module: "kit-runner" },
    });
  });

  it("refuses a package that is not installed, has no hosts, or lacks the host", async () => {
    await expect(loadHost(project, "@acme/nope/sb")).rejects.toThrow(
      /Package "@acme\/nope" is not installed in this project, so it supplies no host "sb"\.[\s\S]*Add @acme\/nope as a dependency/,
    );
    await expect(loadHost(project, "@acme/bare/sb")).rejects.toThrow(
      /Package "@acme\/bare" supplies no hosts: .* has no hosts\/<name>\/host\.js, so "@acme\/bare\/sb" cannot run\./,
    );
    await expect(loadHost(project, "@acme/tools/nope")).rejects.toThrow(
      'Package "@acme/tools" supplies no host "nope". Its hosts: ghost, ring, sb, solo, stack, studio.',
    );
  });

  it("refuses the project's own package name: its hosts are addressed bare", async () => {
    await expect(loadHost(project, "lab/sb")).rejects.toThrow(
      /"lab\/sb": "lab" is this project's own package\.[\s\S]*`ph run sb`/,
    );
  });
});

describe("module specifiers resolve against the package, the project stays the project", () => {
  it("resolves a package host's runner from the package's dependencies", async () => {
    const loaded = await loadHost(project, "@acme/tools/sb");
    expect(moduleRootOf(project, loaded)).toBe(path.join(store, "tools"));
    const runner = await resolveRunnerModule(
      moduleRootOf(project, loaded),
      loaded.host.runner.module,
    );
    expect(runner.who).toBe("package");
    // The same specifier from a project host is the project's copy.
    const own = await loadHost(project, "sb");
    const projectRunner = await resolveRunnerModule(
      moduleRootOf(project, own),
      own.host.runner.module,
    );
    expect(projectRunner.who).toBe("project");
  });
});

describe("rule 3: a package's compound names its members there first", () => {
  it("runs a bare member from the package when it ships one, else from the project", async () => {
    const result = await startCompound("@acme/tools/stack");
    expect(result.started.map((m) => [m.name, m.ref])).toEqual([
      ["sb", "@acme/tools/sb"],
      ["app", "app"],
    ]);
    // Each member's runner from its own supplier; the project stays the
    // project's for both.
    expect(calls()).toEqual([
      {
        who: "package",
        name: "tools-sb",
        projectRoot: project,
        hostPackage: "@acme/tools",
      },
      {
        who: "project",
        name: "lab-app",
        projectRoot: project,
        hostPackage: null,
      },
    ]);
  });

  it("starts an own-process member by its full ref", async () => {
    const result = await startCompound("@acme/tools/solo");
    const [member] = result.started;
    expect(member.ref).toBe("@acme/tools/sb");
    const record = readRunRecord(project, "@acme/tools/tools-sb");
    expect(record?.package).toBe("@acme/tools");
    expect(isPidAlive(record!.pid)).toBe(true);
    // Rule 4: the compound logs its member under the package's folder.
    const logs = path.join(project, ".ph", "services", "@acme", "tools", "sb");
    const [log] = readdirSync(logs);
    await vi.waitFor(() =>
      expect(readFileSync(path.join(logs, log), "utf8")).toContain(
        "fake ph run @acme/tools/sb run as member sb of solo",
      ),
    );
    await result.shutdown();
    expect(isPidAlive(record!.pid)).toBe(false);
    expect(readRunRecord(project, "@acme/tools/tools-sb")).toBeUndefined();
  });

  it("runs a member written <package>/<host> from a project compound", async () => {
    const result = await startCompound("full");
    expect(result.started.map((m) => [m.name, m.ref])).toEqual([
      ["tool", "@acme/tools/sb"],
      ["app", "app"],
    ]);
    expect(readRunRecord(project, "full")?.members?.tool.host).toBe(
      "@acme/tools/sb",
    );
    // The project's compound keeps its members' logs in the project's
    // folder, whoever supplies the member.
    expect(existsSync(path.join(project, ".ph", "services", "tool"))).toBe(
      true,
    );
  });

  it("names both places when a bare member is in neither", async () => {
    await expect(startCompound("@acme/tools/ghost")).rejects.toThrow(
      'Unknown host "nowhere": package "@acme/tools" supplies none (its hosts: ghost, ring, sb, solo, stack, studio), and neither does the project (its hosts: app, full, loop, sb).',
    );
  });

  it("refuses a member cycle across package and project before anything starts", async () => {
    await expect(startCompound("@acme/tools/ring")).rejects.toThrow(
      "@acme/tools/hosts/ring: compound member cycle: loop -> @acme/tools/ring -> loop.",
    );
    await expect(startCompound("loop")).rejects.toThrow(
      "hosts/loop: compound member cycle: @acme/tools/ring -> loop -> @acme/tools/ring.",
    );
    expect(calls()).toEqual([]);
    expect(listRunRecords(project)).toEqual([]);
  });

  it("reports the cycle and checks a package's compound in ph host check", async () => {
    const ring = await checkHost("@acme/tools/ring", {
      projectRoot: project,
      env: {},
    });
    expect(ring.issues).toContainEqual(
      expect.objectContaining({
        file: "@acme/tools/hosts/ring/host.js",
        path: "children",
        message: "compound member cycle: loop -> @acme/tools/ring -> loop.",
      }),
    );
    const stack = await checkHost("@acme/tools/stack", {
      projectRoot: project,
      env: {},
    });
    expect(stack.issues).toEqual([]);
  });
});

describe("rule 4: a package host's state is in a folder named after the package", () => {
  it("files the package's compound record behind the package, its members by ref", async () => {
    await startCompound("@acme/tools/stack");
    const file = path.join(
      project,
      ".ph",
      "run",
      "@acme",
      "tools",
      "stack.json",
    );
    expect(existsSync(file)).toBe(true);
    const record = readRunRecord(project, "@acme/tools/stack");
    expect(record).toMatchObject({ host: "stack", package: "@acme/tools" });
    expect(record?.members?.sb.host).toBe("@acme/tools/sb");
    expect(record?.members?.app.host).toBe("app");
    // Nothing of it under the project's own key.
    expect(readRunRecord(project, "stack")).toBeUndefined();
  });

  it("keeps a project host and a package host of the same name apart", () => {
    const record = (pkgName?: string) => ({
      version: 2 as const,
      host: "studio",
      ...(pkgName ? { package: pkgName } : {}),
      projectName: "lab",
      kind: "reactor" as const,
      verb: "run",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      outputs: { who: pkgName ?? "project" },
    });
    writeRunRecord(project, record());
    writeRunRecord(project, record("@acme/tools"));
    writeRunRecord(project, record("kit"));
    expect(runRecordKey("studio", "@acme/tools")).toBe("@acme/tools/studio");
    expect(readRunRecord(project, "studio")?.outputs).toEqual({
      who: "project",
    });
    expect(readRunRecord(project, "@acme/tools/studio")?.outputs).toEqual({
      who: "@acme/tools",
    });
    expect(readRunRecord(project, "kit/studio")?.outputs).toEqual({
      who: "kit",
    });
    expect(probeRun(project, "@acme/tools/studio", "lab").status).toBe("live");
    expect(
      listRunRecords(project)
        .map((r) => runRecordKey(r.host, r.package))
        .sort(),
    ).toEqual(["@acme/tools/studio", "kit/studio", "studio"]);
    clearRunRecord(project, "@acme/tools/studio");
    expect(readRunRecord(project, "@acme/tools/studio")).toBeUndefined();
    expect(readRunRecord(project, "studio")).toBeDefined();
  });

  it("refuses a key that names no package or leaves the run folder", () => {
    expect(() =>
      writeRunRecord(project, {
        version: 2,
        host: "x",
        package: "../out",
        projectName: "lab",
        kind: "reactor",
        verb: "run",
        pid: 1,
        startedAt: "",
      }),
    ).toThrow();
    expect(readRunRecord(project, "a/b/c")).toBeUndefined();
    expect(readRunRecord(project, "@acme/../x")).toBeUndefined();
  });

  it("puts a package compound's member logs in the package's folder", () => {
    const file = memberLogFile(project, {}, "switchboard", "@acme/tools");
    expect(path.dirname(file)).toBe(
      path.join(project, ".ph", "services", "@acme", "tools", "switchboard"),
    );
    expect(path.basename(file)).toMatch(/^switchboard\.\d+\.log$/);
  });
});
