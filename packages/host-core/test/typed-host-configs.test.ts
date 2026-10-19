import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { runCompound } from "../src/compound.js";
import { substituteBuiltinEnv } from "../src/env-substitution.js";
import { loadHost } from "../src/host-loader.js";
import {
  compoundHostSchema,
  emitHostJsonSchema,
  genericCompoundHostSchema,
  makeHostSchemas,
  reactorHostSchema,
  type HostDefinition,
} from "../src/host-schemas.js";
import { toStartedHandle } from "../src/runner-handle.js";
import {
  RunnerError,
  validateHost,
  type RunnerModule,
} from "../src/runner-resolver.js";
import { findToken, isToken, ref } from "../src/tokens.js";

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const issues = (result: { success: boolean; error?: z.ZodError }) =>
  JSON.stringify(result.error?.issues ?? []);

/* --------------------------------------------------------- 2.1 invariants */

describe("host schemas: invariants owned by the schema", () => {
  const compound = {
    name: "app",
    runner: { module: "@powerhousedao/host-core/runners/compound" },
    children: { a: { host: "switchboard" }, b: { host: "connect" } },
  };

  it("rejects an unknown startOrder name, naming the path", () => {
    const result = genericCompoundHostSchema.safeParse({
      ...compound,
      config: { startOrder: ["a", "c"] },
    });
    expect(result.success).toBe(false);
    expect(issues(result)).toContain('"path":["config","startOrder",1]');
    expect(issues(result)).toContain('startOrder names \\"c\\"');
    expect(
      genericCompoundHostSchema.safeParse({
        ...compound,
        config: { startOrder: ["b", "a"] },
      }).success,
    ).toBe(true);
  });

  it("rejects unknown compound wiring keys (the wiring is strict)", () => {
    expect(
      genericCompoundHostSchema.safeParse({
        ...compound,
        config: { startOrdr: ["a"] },
      }).success,
    ).toBe(false);
  });

  it("rejects a top-level typo (`reactr`) on reactor and compound hosts", () => {
    const reactor = reactorHostSchema.safeParse({
      name: "x",
      runner: { module: "m" },
      reactr: {},
    });
    expect(reactor.success).toBe(false);
    expect(issues(reactor)).toContain("reactr");
    expect(
      compoundHostSchema.safeParse({ ...compound, childrn: {} }).success,
    ).toBe(false);
  });

  it("requires a backend kind", () => {
    const result = reactorHostSchema.safeParse({
      name: "x",
      runner: { module: "m" },
      reactor: { backends: { main: { storage: { kind: "memory" } } } },
    });
    expect(result.success).toBe(false);
    expect(issues(result)).toContain('"backends","main","kind"');
  });

  it("still accepts remote: { host } until T3", () => {
    expect(
      reactorHostSchema.safeParse({
        name: "assistant",
        runner: { module: "m" },
        reactor: {
          backends: {
            switchboard: { kind: "remote", remote: { host: "switchboard" } },
          },
        },
      }).success,
    ).toBe(true);
  });

  it("makes reactor XOR children a type error on HostDefinition", () => {
    type Both = {
      name: string;
      runner: { module: string };
      reactor: Record<string, never>;
      children: Record<string, never>;
    };
    const bothIsAHost: Both extends HostDefinition ? true : false = false;
    expect(bothIsAHost).toBe(false);
  });

  it("emits a per-runner JSON Schema with a stable $id", () => {
    const emitted = emitHostJsonSchema("host-x", reactorHostSchema);
    expect(emitted.$id).toBe(
      "https://powerhouse.inc/schemas/host-x.schema.json",
    );
    expect(emitted.additionalProperties).toBe(false);
  });

  it("builds declared and resolved schema sets (identical until T3 applies ref)", () => {
    const declared = makeHostSchemas({ tokens: "allow" });
    const resolved = makeHostSchemas({ tokens: "forbid" });
    const host = { name: "x", runner: { module: "m" } };
    expect(declared.reactorHostSchema.safeParse(host).success).toBe(true);
    expect(resolved.reactorHostSchema.safeParse(host).success).toBe(true);
  });
});

/* -------------------------------------------------------------- validateHost */

function runnerWith(
  kind: "reactor" | "compound",
  hostSchema: RunnerModule["hostSchema"],
  verbs: string[] = ["run", "dev"],
): RunnerModule {
  const module: RunnerModule = {
    kind,
    hostSchema,
    run: () => Promise.resolve(undefined),
  };
  for (const verb of verbs) module[verb] = () => Promise.resolve(undefined);
  return module;
}

describe("validateHost", () => {
  const reactorRunner = runnerWith("reactor", reactorHostSchema);
  const compoundRunner = runnerWith("compound", compoundHostSchema);

  it("rejects children on a reactor runner, naming the kind", () => {
    expect(() =>
      validateHost(
        reactorRunner,
        "fake/reactor",
        { name: "x", runner: { module: "fake/reactor" }, children: {} },
        "hosts/x/host.js",
      ),
    ).toThrow(/"fake\/reactor" is a reactor runner.*`children`/);
  });

  it("rejects reactor on a compound runner, naming the kind", () => {
    expect(() =>
      validateHost(
        compoundRunner,
        "fake/compound",
        {
          name: "x",
          runner: { module: "fake/compound" },
          children: {},
          reactor: {},
        },
        "hosts/x/host.js",
      ),
    ).toThrow(/"fake\/compound" is a compound runner.*`reactor`/);
  });

  it("rejects a defaultVerb the runner does not export", () => {
    expect(() =>
      validateHost(
        reactorRunner,
        "fake/reactor",
        { name: "x", runner: { module: "fake/reactor", defaultVerb: "serv" } },
        "hosts/x/host.js",
      ),
    ).toThrow(/defaultVerb "serv".*Supported verbs: dev, run/);
  });

  it("rejects plugin verbs the runner does not export", () => {
    expect(() =>
      validateHost(
        reactorRunner,
        "fake/reactor",
        {
          name: "x",
          runner: {
            module: "fake/reactor",
            plugins: [{ module: "p", verbs: ["dev", "bild"] }],
          },
        },
        "hosts/x/host.js",
      ),
    ).toThrow(/plugin "p" is scoped to verb "bild"/);
  });

  it("forbids output tokens until they are resolved (T3)", () => {
    expect(() =>
      validateHost(
        reactorRunner,
        "fake/reactor",
        {
          name: "x",
          runner: { module: "fake/reactor" },
          config: { url: { $output: { host: "switchboard", path: ["o"] } } },
        },
        "hosts/x/host.js",
      ),
    ).toThrow(/`config.url` is an output token \(\$output\)/);
  });

  it("returns the parsed host, so defaults reach the verb", () => {
    const withDefault = reactorHostSchema.extend({
      config: z.object({ mode: z.string().default("fast") }),
    });
    const runner = runnerWith("reactor", withDefault);
    const parsed = validateHost(
      runner,
      "fake/reactor",
      { name: "x", runner: { module: "fake/reactor" }, config: {} },
      "hosts/x/host.js",
    );
    expect(parsed).toMatchObject({ config: { mode: "fast" } });
  });

  it("reports schema issues as a RunnerError with paths", () => {
    expect(() =>
      validateHost(
        reactorRunner,
        "fake/reactor",
        { name: "", runner: { module: "fake/reactor" } },
        "hosts/x/host.js",
      ),
    ).toThrow(RunnerError);
  });
});

/* ---------------------------------------------------------- tokens and $env */

describe("tokens", () => {
  it("recognises sole-key operators only", () => {
    expect(isToken({ $env: "HOME" })).toBe(true);
    expect(isToken({ $env: "HOME", other: 1 })).toBe(false);
    expect(isToken({ $unknown: 1 })).toBe(false);
    expect(isToken(["$env"])).toBe(false);
  });

  it("finds the first token's path; `$$` escapes a literal", () => {
    expect(findToken({ a: [{ b: { $concat: ["x", 1] } }] })).toEqual({
      path: "a[0].b",
      key: "$concat",
    });
    expect(
      findToken({ a: { $$: { $output: { host: "h", path: [] } } } }),
    ).toBeUndefined();
  });

  it("ref() accepts the value or a token", () => {
    const url = ref(z.url());
    expect(url.safeParse("http://x").success).toBe(true);
    expect(
      url.safeParse({ $output: { host: "switchboard", path: ["origin"] } })
        .success,
    ).toBe(true);
    expect(url.safeParse({ $output: { host: "switchboard" } }).success).toBe(
      false,
    );
  });

  it("substitutes the built-in $env sugar purely", () => {
    const input = { a: "${userData}/x", b: ["${projectRoot}"], c: "${other}" };
    expect(
      substituteBuiltinEnv(input, { userData: "/u", projectRoot: "/p" }),
    ).toEqual({ a: "/u/x", b: ["/p"], c: "${other}" });
    expect(input.a).toBe("${userData}/x");
  });
});

/* ----------------------------------------------------------- runner handles */

describe("runner handles", () => {
  it("normalizes a void return and validates handle data", () => {
    expect(toStartedHandle(undefined, "m")).toEqual({ outputs: {} });
    expect(() => toStartedHandle({ port: "4001" }, "m")).toThrow(
      /m returned an invalid runner handle/,
    );
  });
});

/* -------------------------------------------- stub compound (3.6 contract) */

/** Members whose fake runner logs (verb, ctx.verb, ctx.parent) and its
 * shutdown; `fail` makes the named member's start throw. */
function makeStubCompound(opts: { fail?: string } = {}): {
  dir: string;
  sink: string;
} {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-typed-hosts-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const sink = path.join(dir, "calls.jsonl");
  const pkgDir = path.join(dir, "node_modules", "stub-runner");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name: "stub-runner", type: "module", main: "index.js" }),
  );
  writeFileSync(
    path.join(pkgDir, "index.js"),
    `
import { appendFileSync } from "node:fs";
const log = (e) => appendFileSync(${JSON.stringify(sink)}, JSON.stringify(e) + "\\n");
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
function start(verb) {
  return async (host, ctx) => {
    if (host.name === ${JSON.stringify(opts.fail ?? "")}) throw new Error("boom");
    log({ event: "start", name: host.name, verb, ctxVerb: ctx.verb, parent: ctx.parent ?? null });
    return {
      outputs: { origin: "http://127.0.0.1:" + host.runner.port },
      ready: Promise.resolve(),
      shutdown: async () => log({ event: "shutdown", name: host.name }),
    };
  };
}
export const run = start("run");
export const serve = start("serve");
`,
  );
  const write = (name: string, source: string) => {
    mkdirSync(path.join(dir, "hosts", name), { recursive: true });
    writeFileSync(path.join(dir, "hosts", name, "host.js"), source);
  };
  write(
    "server",
    `export default { name: "server", runner: { module: "stub-runner", port: 7001 } };`,
  );
  write(
    "web",
    `export default { name: "web", runner: { module: "stub-runner", port: 3001 } };`,
  );
  write(
    "app",
    `export default {
      name: "app",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: {
        server: { host: "server" },
        web: { host: "web", runner: { defaultVerb: "serve" } },
      },
      config: { startOrder: ["server", "web"] },
    };`,
  );
  return { dir, sink };
}

interface StubEvent {
  event: "start" | "shutdown";
  name: string;
  verb?: string;
  ctxVerb?: string;
  parent?: { host: string; verb: string } | null;
}

function events(sink: string): StubEvent[] {
  if (!existsSync(sink)) return [];
  return readFileSync(sink, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as StubEvent);
}

describe("stub compound", () => {
  it("gives each member its own verb and the compound as ctx.parent", async () => {
    const { dir, sink } = makeStubCompound();
    const host = (await loadHost(dir, "app")).host;
    const result = await runCompound(
      host,
      { projectRoot: dir, verb: "run", env: {} },
      { projectName: "lab", installSignalHandlers: false },
    );
    const started = events(sink).filter((e) => e.event === "start");
    expect(started).toEqual([
      {
        event: "start",
        name: "server",
        verb: "run",
        ctxVerb: "run",
        parent: { host: "app", verb: "run" },
      },
      {
        event: "start",
        name: "web",
        verb: "serve",
        ctxVerb: "serve",
        parent: { host: "app", verb: "run" },
      },
    ]);
    expect(result.started.map((m) => m.handle.outputs)).toEqual([
      { origin: "http://127.0.0.1:7001" },
      { origin: "http://127.0.0.1:3001" },
    ]);
    await result.shutdown();
  });

  it("tears down every member through shutdown(), in reverse order", async () => {
    const { dir, sink } = makeStubCompound();
    const host = (await loadHost(dir, "app")).host;
    const result = await runCompound(
      host,
      { projectRoot: dir, verb: "run", env: {} },
      { projectName: "lab", installSignalHandlers: false },
    );
    await result.shutdown();
    expect(
      events(sink)
        .filter((e) => e.event === "shutdown")
        .map((e) => e.name),
    ).toEqual(["web", "server"]);
  });

  it("tears down started members when a later member fails to start", async () => {
    const { dir, sink } = makeStubCompound({ fail: "web" });
    const host = (await loadHost(dir, "app")).host;
    await expect(
      runCompound(
        host,
        { projectRoot: dir, verb: "run", env: {} },
        { projectName: "lab", installSignalHandlers: false },
      ),
    ).rejects.toThrow(/boom/);
    expect(
      events(sink)
        .filter((e) => e.event === "shutdown")
        .map((e) => e.name),
    ).toEqual(["server"]);
  });

  it("refuses an unknown startOrder name before starting anything", async () => {
    const { dir, sink } = makeStubCompound();
    const host = (await loadHost(dir, "app")).host;
    await expect(
      runCompound(
        { ...host, config: { startOrder: ["server", "wbe"] } },
        { projectRoot: dir, verb: "run", env: {} },
        { projectName: "lab", installSignalHandlers: false },
      ),
    ).rejects.toThrow(/startOrder names "wbe"/);
    expect(events(sink)).toEqual([]);
  });
});
