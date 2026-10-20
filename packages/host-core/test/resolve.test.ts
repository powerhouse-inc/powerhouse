import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  checkOutputPaths,
  checkTokenSites,
  compoundOutputSource,
  describeToken,
  findRemovedForms,
  planCompound,
  renderTokens,
  resolveHostOutputs,
  schemaAtPath,
  type OutputSource,
} from "../src/resolve/index.js";
import {
  listVerbs,
  validateDeclaredHost,
  validateHost,
  type RunnerModule,
} from "../src/runner-resolver.js";
import { defineHostSchemas } from "../src/host-schemas.js";

/** The resolver over canned outputs: no process, no run record. */

const switchboardOutputs = {
  origin: "http://localhost:4801",
  endpoints: { graphql: "http://localhost:4801/graphql" },
  drives: {
    sektar: { id: "sektar", url: "http://localhost:4801/d/sektar" },
    workflows: { id: "workflows-1", url: "http://localhost:4801/d/workflows" },
  },
};

const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({ graphql: z.url(), mcp: z.url().optional() }),
  drives: z.record(
    z.string(),
    z.strictObject({ id: z.string(), url: z.url() }),
  ),
});

const canned = (outputs: Record<string, unknown>): OutputSource => ({
  lookup: (ref) =>
    ref.host in outputs
      ? { status: "available", outputs: outputs[ref.host] }
      : {
          status: "unavailable",
          message: `x needs outputs from host "${ref.host}", which is not running.`,
        },
});

const out = (host: string, path: (string | number)[]) => ({
  $output: { host, path },
});

describe("resolveHostOutputs", () => {
  const sources = {
    outputs: canned({ switchboard: switchboardOutputs }),
    env: { API_KEY: "k-1", PORT: "7" },
    builtins: { userData: "/u", projectRoot: "/p" },
    where: "hosts/connect/host.js",
  };

  it("resolves $output, $concat, $env, builtins and the string sugar", () => {
    const host = {
      name: "connect",
      a: out("switchboard", ["drives", "workflows", "url"]),
      b: { $concat: [out("switchboard", ["origin"]), ":", 1, "/x"] },
      c: { $env: "API_KEY" },
      d: { $env: "userData" },
      e: ["${projectRoot}/data", { $env: "PORT" }],
      f: { $$: { $env: "LITERAL" } },
      whole: out("switchboard", ["endpoints"]),
    };
    expect(resolveHostOutputs(host, sources)).toEqual({
      name: "connect",
      a: "http://localhost:4801/d/workflows",
      b: "http://localhost:4801:1/x",
      c: "k-1",
      d: "/u",
      e: ["/p/data", "7"],
      f: { $$: { $env: "LITERAL" } },
      whole: { graphql: "http://localhost:4801/graphql" },
    });
    // the declared host is not mutated
    expect(host.a).toEqual(out("switchboard", ["drives", "workflows", "url"]));
  });

  it("keeps a $$ escape through resolution; validateHost hands the verb the literal", () => {
    const runner: RunnerModule = {
      kind: "reactor",
      run: () => Promise.resolve(undefined),
      hostSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    };
    const resolved = resolveHostOutputs(
      {
        name: "x",
        runner: { module: "m" },
        config: { f: { $$: { $env: "X" } } },
      },
      sources,
    );
    expect(validateHost(runner, "m", resolved, "f")).toEqual({
      name: "x",
      runner: { module: "m" },
      config: { f: { $env: "X" } },
    });
  });

  it("omits the enclosing property of an unset optional $env", () => {
    expect(
      resolveHostOutputs(
        {
          keep: 1,
          key: { $env: { name: "MISSING", optional: true } },
          set: { $env: { name: "API_KEY", optional: true } },
        },
        sources,
      ),
    ).toEqual({ keep: 1, set: "k-1" });
  });

  it("fails on an unset $env, naming the variable and the host path", () => {
    expect(() =>
      resolveHostOutputs({ config: { apiKey: { $env: "MISSING" } } }, sources),
    ).toThrow(
      "hosts/connect/host.js: `config.apiKey` reads $env MISSING, which is not set.",
    );
  });

  it("fails when the producer is not running, with the source's message", () => {
    expect(() =>
      resolveHostOutputs({ a: out("assistant", ["origin"]) }, sources),
    ).toThrow(
      /hosts\/connect\/host\.js: x needs outputs from host "assistant", which is not running\.\n {2}\(needed by `a`: \$output assistant › origin\)/,
    );
  });

  it("fails on a path the live outputs lack, listing what they have", () => {
    expect(() =>
      resolveHostOutputs(
        { a: out("switchboard", ["drives", "vetra", "url"]) },
        sources,
      ),
    ).toThrow(
      /`a` reads \$output switchboard › drives\.vetra\.url, but host "switchboard" has no output at drives\.vetra \(outputs\.drives has: sektar, workflows\)/,
    );
  });

  it("rejects non-string $concat parts and optional $env where nothing can be omitted", () => {
    expect(() =>
      resolveHostOutputs(
        { a: { $concat: ["x", out("switchboard", ["endpoints"])] } },
        sources,
      ),
    ).toThrow(/every \$concat part must be a string or a number/);
    expect(() =>
      resolveHostOutputs(
        { a: [{ $env: { name: "MISSING", optional: true } }] },
        sources,
      ),
    ).toThrow(/optional \$env inside an array/);
  });

  it("deferSelf: resolves the rest now and the member references once they run", () => {
    const compound = {
      name: "clint",
      config: {
        agents: {
          assistant: { url: { $concat: [out("assistant", ["origin"]), "/a"] } },
        },
        graphql: out("switchboard", ["endpoints", "graphql"]),
        key: { $env: "API_KEY" },
      },
      children: {
        assistant: { host: "assistant", config: { x: { $env: "MISSING" } } },
      },
    };
    const deferred = resolveHostOutputs(compound, sources, {
      deferSelf: { members: [{ key: "assistant", host: "assistant" }] },
    });
    expect(deferred.needs).toEqual(["assistant"]);
    expect(deferred.deferred).toEqual([
      { path: "config.agents.assistant.url", members: ["assistant"] },
    ]);
    // children are member-level: untouched (their $env is not read here)
    expect(deferred.host.children).toEqual(compound.children);
    expect(deferred.host.config.graphql).toBe("http://localhost:4801/graphql");
    expect(deferred.host.config.key).toBe("k-1");

    const live = new Map([["assistant", { origin: "http://127.0.0.1:4910" }]]);
    const done = deferred.finish(
      compoundOutputSource(
        [{ key: "assistant", host: "assistant" }],
        live,
        "clint",
      ),
    );
    expect(done.config.agents.assistant.url).toBe("http://127.0.0.1:4910/a");
    // finishing before the member runs names it
    expect(() =>
      deferred.finish(
        compoundOutputSource(
          [{ key: "assistant", host: "assistant" }],
          new Map(),
          "clint",
        ),
      ),
    ).toThrow(/member "assistant" \(host "assistant"\) has not started yet/);
  });
});

describe("declared validation", () => {
  it("checks $output paths against the producer's outputsSchema", () => {
    const issues = checkOutputPaths(
      {
        ok: out("switchboard", ["drives", "anything", "url"]),
        mcp: out("switchboard", ["endpoints", "mcp"]),
        bad: out("switchboard", ["drives", "x", "uri"]),
        top: out("switchboard", ["originn"]),
        none: out("assistant", ["origin"]),
      },
      (ref) =>
        ref.host === "switchboard"
          ? { schema: outputsSchema, label: '"sb-runner"' }
          : {
              error: `names host "${ref.host}", which exports no outputsSchema.`,
            },
    );
    expect(issues).toEqual([
      {
        path: "bad",
        message:
          '$output switchboard › drives.x.uri: outputs.drives.x has no key "uri" (keys: id, url) in the outputsSchema of "sb-runner".',
      },
      {
        path: "top",
        message:
          '$output switchboard › originn: the outputs has no key "originn" (keys: origin, endpoints, drives) in the outputsSchema of "sb-runner".',
      },
      {
        path: "none",
        message: 'names host "assistant", which exports no outputsSchema.',
      },
    ]);
  });

  it("walks zod wrappers, records, arrays and unions", () => {
    const schema = z.object({
      list: z.array(z.object({ a: z.string() })).optional(),
      either: z.union([
        z.object({ x: z.string() }),
        z.object({ y: z.number() }),
      ]),
    });
    expect(schemaAtPath(schema, ["list", 0, "a"]).ok).toBe(true);
    expect(schemaAtPath(schema, ["list", "a"]).ok).toBe(false);
    expect(schemaAtPath(schema, ["either", "y"]).ok).toBe(true);
    expect(schemaAtPath(schema, ["either", "z"]).ok).toBe(false);
  });

  it("checks token shapes and the placement of optional $env", () => {
    expect(
      checkTokenSites({
        ok: { $env: { name: "A", optional: true } },
        list: [{ $env: { name: "B", optional: true } }],
        cat: { $concat: ["x", { $env: { name: "C", optional: true } }] },
        bad: { $output: { host: "switchboard" } },
        mapped: { $map: { over: out("s", []), to: 1 } },
        stray: { $item: ["x"] },
      }).map((i) => i.path),
    ).toEqual(["list[0]", "cat.$concat[1]", "bad", "stray"]);
  });

  it("names the token form for every removed cross-host form", () => {
    const found = findRemovedForms({
      name: "desktop",
      runner: { module: "c" },
      config: { projectDrivesIntoConnect: true, drivesPublicBase: "x" },
      children: {
        "desktop-connect": {
          host: "connect",
          runner: {
            plugins: [
              {
                module: "w",
                config: {
                  drive: { from: "desktop-switchboard", slug: "workflows" },
                },
              },
            ],
          },
          reactor: {
            backends: {
              sb: { kind: "remote", remote: { host: "switchboard" } },
            },
          },
        },
        "desktop-switchboard": { host: "switchboard" },
      },
    });
    expect(found.map((f) => f.path)).toEqual([
      "children.desktop-connect.reactor.backends.sb.remote.host",
      "children.desktop-connect.runner.plugins[0].config.drive",
      "config.projectDrivesIntoConnect",
      "config.drivesPublicBase",
    ]);
    expect(found[1].message).toBe(
      'drive: { from, slug } was removed; use switchboard.drives.workflows.url from ../switchboard/outputs.js, or { $output: { host: "switchboard", path: ["drives", "workflows", "url"] } } (add member: "desktop-switchboard" if two members run host "switchboard").',
    );
  });

  it("validateDeclaredHost runs the runner's declaredHostSchema; validateHost its resolved one", () => {
    const { declaredHostSchema, hostSchema } = defineHostSchemas(
      (s) => s.reactorHostSchema,
    );
    const runner: RunnerModule = {
      kind: "reactor",
      run: () => Promise.resolve(undefined),
      hostSchema,
      declaredHostSchema,
    };
    const host = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        backends: {
          sb: {
            kind: "remote",
            remote: { url: out("switchboard", ["endpoints", "graphql"]) },
          },
        },
      },
    };
    expect(() => validateDeclaredHost(runner, "m", host, "f")).not.toThrow();
    expect(() => validateHost(runner, "m", host, "f")).toThrow(
      /`reactor\.backends\.sb\.remote\.url` is an unresolved output token/,
    );
    const named = { ...host, name: { $env: "NAME" } };
    expect(() => validateDeclaredHost(runner, "m", named, "f")).toThrow(
      /name: this field does not take an output token/,
    );
  });
});

describe("dependency plan", () => {
  const members = [
    {
      key: "app-connect",
      host: "connect",
      refs: [
        {
          ref: { host: "switchboard" },
          path: "runner.plugins[0].config.drive",
        },
      ],
    },
    { key: "app-switchboard", host: "switchboard", refs: [] },
    {
      key: "app-proxy",
      host: "proxy",
      refs: [{ ref: { host: "connect" }, path: "config.target" }],
    },
  ];

  it("orders producers before consumers, ties in declaration order", () => {
    expect(planCompound(members).order).toEqual([
      "app-switchboard",
      "app-connect",
      "app-proxy",
    ]);
  });

  it("accepts an agreeing startOrder and rejects a contradicting one", () => {
    expect(
      planCompound(members, ["app-switchboard", "app-connect"]).source,
    ).toBe("startOrder");
    expect(() => planCompound(members, ["app-proxy"])).toThrow(
      /startOrder starts "app-proxy" before "app-connect"/,
    );
  });

  it("fails on cycles, self-references and ambiguous hosts", () => {
    expect(() =>
      planCompound([
        { key: "a", host: "a", refs: [{ ref: { host: "b" }, path: "x" }] },
        { key: "b", host: "b", refs: [{ ref: { host: "a" }, path: "y" }] },
      ]),
    ).toThrow(/cycle between "a", "b": a \(x\) needs b; b \(y\) needs a/);
    expect(() =>
      planCompound([
        { key: "a", host: "a", refs: [{ ref: { host: "a" }, path: "x" }] },
      ]),
    ).toThrow(/which is this member itself/);
    expect(() =>
      planCompound([
        { key: "c", host: "c", refs: [{ ref: { host: "s" }, path: "x" }] },
        { key: "s1", host: "s", refs: [] },
        { key: "s2", host: "s", refs: [] },
      ]),
    ).toThrow(/members "s1" and "s2" both run; add member/);
  });
});

describe("rendering and verbs", () => {
  it("describes and renders tokens for --explain", () => {
    expect(describeToken({ $env: { name: "K", optional: true } })).toBe(
      "$env K (optional)",
    );
    expect(renderTokens({ a: out("s", ["drives", "w", "url"]) })).toEqual({
      a: "«$output s › drives.w.url»",
    });
  });

  it("listVerbs honours an exported verbs list over helper functions", () => {
    const runner: RunnerModule = {
      kind: "reactor",
      hostSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
      run: () => Promise.resolve(undefined),
      dev: () => Promise.resolve(undefined),
      promptFromMessages: () => "helper",
      verbs: ["run", "dev"],
    };
    expect(listVerbs(runner)).toEqual(["dev", "run"]);
    expect(listVerbs({ ...runner, verbs: undefined })).toEqual([
      "dev",
      "promptFromMessages",
      "run",
    ]);
  });
});
