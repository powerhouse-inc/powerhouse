import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { runCompound } from "../src/compound.js";
import { loadHost } from "../src/host-loader.js";
import { declaredHostSchemas, defineHostSchemas } from "../src/host-schemas.js";
import {
  checkOutputPaths,
  checkTokenSites,
  collectTokenSites,
  compoundOutputSource,
  describeMapElements,
  describeToken,
  outputSitesOf,
  planCompound,
  resolveHostOutputs,
  type OutputSource,
  type OutputsSchemaLookup,
} from "../src/resolve/index.js";
import {
  validateDeclaredHost,
  validateHost,
  type RunnerModule,
} from "../src/runner-resolver.js";
import type {
  ArrayMapToken,
  ItemToken,
  OutputToken,
  RecordMapToken,
} from "../src/tokens.js";

/** `$map` / `$item` / `$key` (typed-host-configs 3.3) over canned outputs. */

const out = (host: string, path: (string | number)[]) => ({
  $output: { host, path },
});

// Published in NON-sorted order: `$map` must visit records key-sorted.
const switchboardOutputs = {
  origin: "http://localhost:4801",
  endpoints: { graphql: "http://localhost:4801/graphql" },
  drives: {
    workflows: { id: "workflows-1", url: "http://localhost:4801/d/workflows" },
    sektar: { id: "sektar", url: "http://localhost:4801/d/sektar" },
    "a-plugin": { id: "a-1", url: "http://localhost:4801/d/a-plugin" },
  },
  listeners: [
    { name: "http", port: 4801, tags: { primary: "yes" } },
    { name: "ws", port: 4802, tags: {} },
  ],
};

const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({ graphql: z.url(), mcp: z.url().optional() }),
  drives: z.record(
    z.string(),
    z.strictObject({
      id: z.string(),
      url: z.url(),
      icon: z.string().optional(),
    }),
  ),
  listeners: z.array(
    z.strictObject({
      name: z.string(),
      port: z.number(),
      tags: z.record(z.string(), z.string()),
    }),
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

const sources = {
  outputs: canned({ switchboard: switchboardOutputs }),
  env: { TAG: "t" },
  where: "hosts/cli/host.js",
};

const schemaOf = (): OutputsSchemaLookup => ({
  schema: outputsSchema,
  label: '"sb-runner" (host "switchboard")',
});

const declared = (host: unknown) => [
  ...checkTokenSites(host),
  ...checkOutputPaths(host, schemaOf),
];

const drivesMap = {
  $map: {
    over: out("switchboard", ["drives"]),
    to: { slug: { $key: true }, remote: { url: { $item: ["url"] } } },
  },
};

describe("$map resolution", () => {
  it("visits a record key-sorted, whatever order the producer published", () => {
    expect(resolveHostOutputs({ drives: drivesMap }, sources)).toEqual({
      drives: [
        {
          slug: "a-plugin",
          remote: { url: "http://localhost:4801/d/a-plugin" },
        },
        { slug: "sektar", remote: { url: "http://localhost:4801/d/sektar" } },
        {
          slug: "workflows",
          remote: { url: "http://localhost:4801/d/workflows" },
        },
      ],
    });
  });

  it("visits an array in order; $key is the index and $item [] the element", () => {
    const host = {
      ports: {
        $map: {
          over: out("switchboard", ["listeners"]),
          to: {
            at: { $key: true },
            port: { $item: ["port"] },
            all: { $item: [] },
          },
        },
      },
    };
    expect(resolveHostOutputs(host, sources).ports).toEqual([
      { at: 0, port: 4801, all: switchboardOutputs.listeners[0] },
      { at: 1, port: 4802, all: switchboardOutputs.listeners[1] },
    ]);
  });

  it('into: "record" keeps the input keys (sorted)', () => {
    const host = {
      urls: {
        $map: {
          over: out("switchboard", ["drives"]),
          to: { $item: ["url"] },
          into: "record",
        },
      },
    };
    const urls = resolveHostOutputs(host, sources).urls;
    expect(urls).toEqual({
      "a-plugin": "http://localhost:4801/d/a-plugin",
      sektar: "http://localhost:4801/d/sektar",
      workflows: "http://localhost:4801/d/workflows",
    });
    expect(Object.keys(urls as object)).toEqual([
      "a-plugin",
      "sektar",
      "workflows",
    ]);
  });

  it("nests: an inner over may be an $item; named bindings reach the outer map", () => {
    const host = {
      tags: {
        $map: {
          over: out("switchboard", ["listeners"]),
          as: "listener",
          to: {
            $map: {
              over: { $item: ["tags"] },
              to: {
                $concat: [
                  { $item: { as: "listener", path: ["name"] } },
                  "#",
                  { $key: "listener" },
                  ":",
                  { $key: true },
                  "=",
                  { $item: [] },
                  "@",
                  out("switchboard", ["origin"]),
                ],
              },
            },
          },
        },
      },
    };
    expect(resolveHostOutputs(host, sources).tags).toEqual([
      ["http#0:primary=yes@http://localhost:4801"],
      [],
    ]);
  });

  it("renders an empty collection as [] (or {} into a record)", () => {
    const empty = { switchboard: { drives: {}, listeners: [] } };
    const host = {
      a: { $map: { over: out("switchboard", ["drives"]), to: 1 } },
      b: { $map: { over: out("switchboard", ["listeners"]), to: 1 } },
      c: {
        $map: { over: out("switchboard", ["drives"]), to: 1, into: "record" },
      },
    };
    expect(resolveHostOutputs(host, { outputs: canned(empty) })).toEqual({
      a: [],
      b: [],
      c: {},
    });
  });

  it("omits a template property whose optional $env is unset", () => {
    const host = {
      d: {
        $map: {
          over: out("switchboard", ["drives"]),
          to: {
            slug: { $key: true },
            tag: { $env: { name: "NOPE", optional: true } },
            env: { $env: "TAG" },
          },
          into: "record",
        },
      },
    };
    const d = resolveHostOutputs(host, sources).d as Record<string, unknown>;
    expect(d.sektar).toEqual({ slug: "sektar", env: "t" });
  });

  it("keeps a $$ escape inside a template literal", () => {
    const host = {
      d: {
        $map: {
          over: out("switchboard", ["drives"]),
          to: { $$: { $key: true } },
        },
      },
    };
    expect(resolveHostOutputs(host, sources).d).toEqual([
      { $$: { $key: true } },
      { $$: { $key: true } },
      { $$: { $key: true } },
    ]);
  });
});

/* ---------------------------------------------------- the 3.3 error cases */

describe("$map errors (3.3)", () => {
  it("declared: $item outside any $map", () => {
    const issues = declared({ url: { $item: ["url"] } });
    expect(issues).toEqual([
      {
        path: "url",
        message: expect.stringContaining(
          "$item is used outside any $map",
        ) as string,
      },
    ]);
  });

  it("declared: $key outside any $map", () => {
    const issues = declared({ slug: { $key: true } });
    expect(issues.map((i) => [i.path, i.message.slice(0, 29)])).toEqual([
      ["slug", "$key is used outside any $map"],
    ]);
  });

  it("declared: $item / $key naming an unknown binding", () => {
    const host = {
      d: {
        $map: {
          over: out("switchboard", ["drives"]),
          as: "drive",
          to: {
            a: { $item: { as: "drve", path: ["url"] } },
            b: { $key: "listener" },
          },
        },
      },
    };
    const issues = declared(host);
    expect(issues.map((i) => i.path)).toEqual(["d.$map.to.a", "d.$map.to.b"]);
    expect(issues[0].message).toBe(
      '$item(drve) url names the $map binding "drve", which no enclosing $map declares (enclosing bindings: "drive").',
    );
    expect(issues[1].message).toContain('binding "listener"');
  });

  it("declared: over whose schema is not an array or a record", () => {
    const issues = declared({
      d: { $map: { over: out("switchboard", ["origin"]), to: 1 } },
    });
    expect(issues).toEqual([
      {
        path: "d",
        message:
          '$map over $output switchboard › origin in the outputsSchema of "sb-runner" (host "switchboard") is a string, not an array or a record; a $map iterates a collection.',
      },
    ]);
  });

  it('declared: into: "record" over an array', () => {
    const issues = declared({
      d: {
        $map: {
          over: out("switchboard", ["listeners"]),
          to: { $item: ["port"] },
          into: "record",
        },
      },
    });
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe("d");
    expect(issues[0].message).toContain(
      'into: "record" maps over $output switchboard › listeners',
    );
    expect(issues[0].message).toContain("which is an array");
  });

  it("declared: an $item path absent from the element schema (incl. nested and named)", () => {
    const issues = declared({
      d: {
        $map: {
          over: out("switchboard", ["drives"]),
          as: "drive",
          to: { url: { $item: ["urll"] }, ok: { $item: ["icon"] } },
        },
      },
      n: {
        $map: {
          over: out("switchboard", ["listeners"]),
          as: "l",
          to: {
            $map: {
              over: { $item: ["tags"] },
              to: {
                a: { $item: { as: "l", path: ["nme"] } },
                b: { $item: ["x"] },
              },
            },
          },
        },
      },
    });
    expect(issues.map((i) => i.path)).toEqual([
      "d.$map.to.url",
      "n.$map.to.$map.to.a",
      "n.$map.to.$map.to.b",
    ]);
    expect(issues[0].message).toBe(
      '$item urll: the element of the $map at d (as "drive") has no key "urll" (keys: id, url, icon) (element of $output switchboard › drives in the outputsSchema of "sb-runner" (host "switchboard")).',
    );
    expect(issues[1].message).toContain('has no key "nme"');
    // the inner map iterates `tags`, a record of STRINGS: no ["x"] in one
    expect(issues[2].message).toContain("is a string, not a container");
  });

  it("declared: a nested over whose $item is not a collection", () => {
    const issues = declared({
      n: {
        $map: {
          over: out("switchboard", ["listeners"]),
          to: { $map: { over: { $item: ["port"] }, to: 1 } },
        },
      },
    });
    expect(issues.map((i) => i.path)).toEqual(["n.$map.to"]);
    expect(issues[0].message).toContain(
      "is a number, not an array or a record",
    );
  });

  it("declared: optional $env as the whole template", () => {
    const issues = declared({
      d: {
        $map: {
          over: out("switchboard", ["drives"]),
          to: { $env: { name: "X", optional: true } },
        },
      },
    });
    expect(issues.map((i) => i.path)).toEqual(["d.$map.to"]);
    expect(issues[0].message).toContain("not as the whole $map template");
  });

  it("resolve: over resolved to a non-collection", () => {
    const odd = canned({ switchboard: { drives: "nope" } });
    expect(() =>
      resolveHostOutputs(
        { d: { $map: { over: out("switchboard", ["drives"]), to: 1 } } },
        { outputs: odd, where: "hosts/cli/host.js" },
      ),
    ).toThrow(
      'hosts/cli/host.js: `d` is a $map whose over ($output switchboard › drives) resolved to "nope", which is not an array or a record.',
    );
  });

  it('resolve: into: "record" over a value that is not a record', () => {
    const host = {
      d: {
        $map: {
          over: out("switchboard", ["listeners"]),
          to: 1,
          into: "record",
        },
      },
    };
    expect(() => resolveHostOutputs(host, sources)).toThrow(
      /`d` is a \$map with into: "record", but its over \(\$output switchboard › listeners\) resolved to an array, which has no keys to keep/,
    );
  });

  it("resolve: an element missing a path the schema marked optional", () => {
    const host = {
      d: {
        $map: {
          over: out("switchboard", ["drives"]),
          to: { icon: { $item: ["icon"] } },
        },
      },
    };
    expect(() => resolveHostOutputs(host, sources)).toThrow(
      'hosts/cli/host.js: `d.$map.to.icon` reads $item icon, but $map element d["a-plugin"] has no icon (it has: id, url). (rendering $map element d["a-plugin"])',
    );
  });

  it("resolve: $item / $key outside a map or naming an unknown binding (backstop)", () => {
    expect(() => resolveHostOutputs({ a: { $item: ["x"] } }, sources)).toThrow(
      "`a` uses $item outside any $map",
    );
    expect(() =>
      resolveHostOutputs(
        {
          d: {
            $map: {
              over: out("switchboard", ["drives"]),
              to: { $key: "outer" },
            },
          },
        },
        sources,
      ),
    ).toThrow(
      'uses $key with binding "outer", which no enclosing $map declares (as: none).',
    );
  });

  it("resolve: optional $env as the whole template (backstop)", () => {
    const host = {
      d: {
        $map: {
          over: out("switchboard", ["drives"]),
          to: { $env: { name: "NOPE", optional: true } },
        },
      },
    };
    expect(() => resolveHostOutputs(host, sources)).toThrow(
      "is an optional $env as the whole $map template",
    );
  });

  it("resolved validation: a rendered element failing the target schema names the host path and the element key", () => {
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
        drives: {
          $map: {
            over: out("switchboard", ["drives"]),
            // a string where a boolean is expected: every element fails
            to: { slug: { $key: true }, availableOffline: { $item: ["id"] } },
          },
        },
      },
    };
    validateDeclaredHost(runner, "m", host, "hosts/x/host.js", {
      outputsSchemaOf: schemaOf,
    });
    const resolved = resolveHostOutputs(host, sources);
    expect(() =>
      validateHost(runner, "m", resolved, "hosts/x/host.js"),
    ).toThrow(
      /reactor\.drives\.0\.availableOffline \(\$map element "a-plugin"\): /,
    );
  });
});

describe("$map review fixes", () => {
  it("declared: a catchall object and a tuple are collections", () => {
    const loose = z.strictObject({
      tags: z.object({}).catchall(z.strictObject({ url: z.url() })),
      pair: z.tuple([z.string(), z.number()]),
    });
    const lookup = (): OutputsSchemaLookup => ({ schema: loose, label: "x" });
    const host = {
      a: {
        $map: {
          over: out("switchboard", ["tags"]),
          to: { $item: ["url"] },
          into: "record",
        },
      },
      b: { $map: { over: out("switchboard", ["pair"]), to: { $key: true } } },
      c: {
        $map: { over: out("switchboard", ["tags"]), to: { $item: ["nope"] } },
      },
    };
    expect(checkOutputPaths(host, lookup).map((i) => i.path)).toEqual([
      "c.$map.to",
    ]);
  });

  it("deferSelf: finish() keeps the $map provenance of rendered arrays", () => {
    const host = {
      name: "shell",
      reactor: { drives: drivesMap },
      config: { url: out("agent", ["origin"]) },
      children: { agent: { host: "agent" } },
    };
    const partial = resolveHostOutputs(host, sources, {
      deferSelf: { members: [{ key: "agent", host: "agent" }] },
    });
    const done = partial.finish(
      compoundOutputSource(
        [{ key: "agent", host: "agent" }],
        new Map([["agent", { origin: "http://a" }]]),
        "shell",
      ),
    );
    expect(done.config).toEqual({ url: "http://a" });
    expect(describeMapElements(done, ["reactor", "drives", 1, "slug"])).toBe(
      '$map element "sektar"',
    );
  });
});

/* ------------------------------------------------------- walk, plan, docs */

describe("$map in the walk, the plan and --explain", () => {
  it("collects the tokens of over and the template with their scopes", () => {
    const sites = collectTokenSites({ drives: drivesMap });
    expect(
      sites.map((s) => [s.key, s.position, s.scopes.length, s.path.join(".")]),
    ).toEqual([
      ["$map", "property", 0, "drives"],
      ["$output", "over", 0, "drives.$map.over"],
      ["$key", "property", 1, "drives.$map.to.slug"],
      ["$item", "property", 1, "drives.$map.to.remote.url"],
    ]);
    expect(outputSitesOf({ drives: drivesMap }).map((s) => s.path)).toEqual([
      "drives.$map.over",
    ]);
  });

  it("orders a compound by the $output inside a $map", () => {
    const plan = planCompound([
      {
        key: "cli-connect",
        host: "connect",
        refs: outputSitesOf({ reactor: { drives: drivesMap } }),
      },
      { key: "cli-switchboard", host: "switchboard", refs: [] },
    ]);
    expect(plan.order).toEqual(["cli-switchboard", "cli-connect"]);
  });

  it("describes $map, $item and $key", () => {
    expect(describeToken(drivesMap)).toBe(
      '$map over [$output switchboard › drives] → {"slug":"«$key»","remote":{"url":"«$item url»"}}',
    );
    expect(describeToken({ $item: { as: "d", path: [] } })).toBe(
      "$item(d) <element>",
    );
    expect(describeToken({ $key: "d" })).toBe("$key(d)");
  });
});

/* ------------------------------------------------------------------ types */

describe("$map typing (tsc -p hosts positions)", () => {
  // The shape `ph generate hosts` writes to hosts/switchboard/outputs.d.ts.
  const switchboard: {
    endpoints: {
      graphql: OutputToken<string>;
      mcp: OutputToken<string | undefined>;
    };
    drives: {
      sektar: { id: OutputToken<string>; url: OutputToken<string> };
      $item: { id: ItemToken<string>; url: ItemToken<string> };
    };
  } = {
    endpoints: {
      graphql: out("switchboard", ["endpoints", "graphql"]),
      mcp: out("switchboard", ["endpoints", "mcp"]),
    },
    drives: {
      sektar: {
        id: out("switchboard", ["drives", "sektar", "id"]),
        url: out("switchboard", ["drives", "sektar", "url"]),
      },
      $item: { id: { $item: ["id"] }, url: { $item: ["url"] } },
    },
  };
  type DeclaredHost = z.input<typeof declaredHostSchemas.reactorHostSchema>;

  it("accepts $map in reactor.drives with $item in string positions", () => {
    const host = {
      name: "cli-connect",
      runner: { module: "m" },
      reactor: {
        backends: {
          sb: {
            kind: "remote",
            remote: { url: switchboard.endpoints.graphql },
          },
        },
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: {
              slug: { $key: true },
              name: switchboard.drives.$item.id,
              remote: { url: switchboard.drives.$item.url },
            },
          },
        },
      },
    } satisfies DeclaredHost;
    expect(host.name).toBe("cli-connect");
  });

  it("rejects $item where its type does not fit, and misplaced $map shapes", () => {
    const boolItem: DeclaredHost = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        // @ts-expect-error -- an ItemToken<string> where a boolean is expected
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: {
              slug: "s",
              availableOffline: switchboard.drives.$item.url,
            },
          },
        },
      },
    };
    const objectItem: DeclaredHost = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        // @ts-expect-error -- the $item tree (an object) is not a string
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: {
              slug: switchboard.drives.$item,
            },
          },
        },
      },
    };
    const recordInto: DeclaredHost = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        // @ts-expect-error -- into: "record" renders a record, drives is an array
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: { slug: { $key: true } },
            into: "record",
          },
        },
      },
    };
    const mapInString: DeclaredHost = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        backends: {
          sb: {
            kind: "remote",
            remote: {
              // @ts-expect-error -- a $map renders a collection, not a URL
              url: { $map: { over: switchboard.endpoints.graphql, to: "x" } },
            },
          },
        },
      },
    };
    const optionalOutput: DeclaredHost = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        backends: {
          // @ts-expect-error -- endpoints.mcp may be undefined; url is required
          sb: { kind: "remote", remote: { url: switchboard.endpoints.mcp } },
        },
      },
    };
    expect([
      boolItem,
      objectItem,
      recordInto,
      mapInString,
      optionalOutput,
    ]).toHaveLength(5);
  });
});

describe("$map template typing: $key and optional slots", () => {
  type DeclaredHost = z.input<typeof declaredHostSchemas.reactorHostSchema>;
  type Listener = { name: string; port?: number };
  // Branded overs, as outputs.d.ts types a nested collection ($item leaf).
  const listeners: ItemToken<{ name: string }[]> = { $item: ["listeners"] };
  const listenerList: OutputToken<{ name: string }[]> = out("sb", ["l"]);
  const driveRecord: OutputToken<Record<string, { url: string }>> = out("sb", [
    "drives",
  ]);

  it("types $key: true by the over: a number over an array, a string over a record", () => {
    const numberKey: ArrayMapToken<Listener> = {
      $map: { over: listenerList, to: { name: "x", port: { $key: true } } },
    };
    const stringKey: ArrayMapToken<Listener> = {
      $map: { over: driveRecord, to: { name: { $key: true } } },
    };
    const arrayKeyInString: ArrayMapToken<Listener> = {
      // @ts-expect-error -- an array map's $key is a number; name takes a string
      $map: { over: listenerList, to: { name: { $key: true } } },
    };
    const recordKeyInNumber: ArrayMapToken<Listener> = {
      // @ts-expect-error -- a record map's $key is a string; port takes a number
      $map: { over: driveRecord, to: { name: "x", port: { $key: true } } },
    };
    // A hand-written over carries no brand: either key type may be meant.
    const unbranded: ArrayMapToken<Listener> = {
      $map: { over: out("sb", ["l"]), to: { name: { $key: true } } },
    };
    // A named outer key's type is not tracked.
    const named: ArrayMapToken<Listener> = {
      $map: { over: listenerList, to: { name: { $key: "outer" } } },
    };
    const recordInto: RecordMapToken<Listener> = {
      $map: { over: driveRecord, to: { name: { $key: true } }, into: "record" },
    };
    expect([
      numberKey,
      stringKey,
      arrayKeyInString,
      recordKeyInNumber,
      unbranded,
      named,
      recordInto,
    ]).toHaveLength(7);
  });

  it("rejects an array map's $key in a drive slug (reactor.drives)", () => {
    const host: DeclaredHost = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        // @ts-expect-error -- the over is an array: $key is a number, slug a string
        drives: { $map: { over: listenerList, to: { slug: { $key: true } } } },
      },
    };
    const nested: DeclaredHost = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        drives: {
          $map: {
            over: driveRecord,
            as: "drive",
            to: { slug: { $key: true }, name: { $key: "drive" } },
          },
        },
      },
    };
    expect([host, nested, listeners]).toHaveLength(3);
  });

  it("lets a token that may produce undefined fill an optional slot", () => {
    const maybeName: ItemToken<string | undefined> = { $item: ["name"] };
    const host = {
      name: "x",
      runner: { module: "m" },
      reactor: {
        drives: {
          $map: {
            over: driveRecord,
            to: { slug: { $key: true }, name: maybeName },
          },
        },
      },
    } satisfies DeclaredHost;
    expect(host.name).toBe("x");
  });
});

/* ---------------------------------------------- the cli-style compound */

const temporary: string[] = [];
afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const ZOD_DIR = path.dirname(
  createRequire(import.meta.url).resolve("zod/package.json"),
);

/** The Sektar/scaffold cli shape: a switchboard member that DECLARES one
 * drive and publishes it plus plugin-created ones, and a Connect member
 * whose drives are a `$map` over the switchboard's `drives` output. Fake
 * runners (no processes); the declared first member is the consumer, so
 * only the token puts the switchboard first. */
function makeCliProject(): { dir: string; sink: string } {
  const dir = mkdtempSync(path.join(tmpdir(), "ph-map-"));
  temporary.push(dir);
  writeFileSync(path.join(dir, "powerhouse.config.json"), "{}");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "lab", type: "module" }),
  );
  const sink = path.join(dir, "calls.json");
  mkdirSync(path.join(dir, "node_modules"), { recursive: true });
  symlinkSync(ZOD_DIR, path.join(dir, "node_modules", "zod"), "dir");
  const pkgDir = path.join(dir, "node_modules", "fake-runner");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({
      name: "fake-runner",
      type: "module",
      exports: { ".": { import: "./index.js", default: "./index.js" } },
    }),
  );
  writeFileSync(
    path.join(pkgDir, "index.js"),
    `
import { appendFileSync } from "node:fs";
import { z } from "zod";
const sink = ${JSON.stringify(sink)};
export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const outputsSchema = z.strictObject({
  origin: z.url(),
  endpoints: z.strictObject({ graphql: z.url() }).optional(),
  drives: z.record(z.string(), z.strictObject({ id: z.string(), url: z.url() })).optional(),
});
export async function run(host) {
  appendFileSync(sink, JSON.stringify({ name: host.name, reactor: host.reactor ?? null }) + "\\n");
  const shutdown = async () => {};
  if (host.name.includes("switchboard")) {
    // declared drives first, then what plugins created at boot (unsorted)
    const drives = {};
    for (const d of host.reactor.drives) drives[d.slug] = { id: d.slug, url: "http://127.0.0.1:7064/d/" + d.slug };
    drives.workflows = { id: "workflows-x", url: "http://127.0.0.1:7064/d/workflows" };
    drives.attachments = { id: "attachments-x", url: "http://127.0.0.1:7064/d/attachments" };
    return {
      outputs: {
        origin: "http://127.0.0.1:7064",
        endpoints: { graphql: "http://127.0.0.1:7064/graphql" },
        drives,
      },
      shutdown,
    };
  }
  return { outputs: { origin: "http://127.0.0.1:3064" }, shutdown };
}
`,
  );
  const write = (name: string, source: string) => {
    const d = path.join(dir, "hosts", name);
    mkdirSync(d, { recursive: true });
    writeFileSync(path.join(d, "host.js"), source);
  };
  write(
    "switchboard",
    `export default { name: "lab-switchboard", runner: { module: "fake-runner" }, reactor: { drives: [{ slug: "sektar", name: "Sektar" }] } };`,
  );
  write(
    "connect",
    `export default { name: "lab-connect", runner: { module: "fake-runner" } };`,
  );
  write(
    "cli",
    `export default {
      name: "cli",
      runner: { module: "fake-runner", defaultVerb: "run" },
      children: {
        "cli-connect": {
          host: "connect",
          reactor: {
            backends: {
              sb: { kind: "remote", remote: { url: { $output: { host: "switchboard", path: ["endpoints", "graphql"] } } } },
            },
            drives: {
              $map: {
                over: { $output: { host: "switchboard", path: ["drives"] } },
                to: {
                  slug: { $key: true },
                  remote: { url: { $item: ["url"] } },
                },
              },
            },
          },
        },
        "cli-switchboard": { host: "switchboard" },
      },
    };`,
  );
  return { dir, sink };
}

describe("cli-style compound: $map over the switchboard's drives", () => {
  it("attaches every drive the switchboard serves, plugin-created ones included, key-sorted", async () => {
    const { dir, sink } = makeCliProject();
    const host = (await loadHost(dir, "cli")).host;
    const result = await runCompound(
      host,
      { projectRoot: dir, verb: "run", env: {} },
      { projectName: "lab", installSignalHandlers: false },
    );
    const calls = existsSync(sink)
      ? readFileSync(sink, "utf8")
          .trim()
          .split("\n")
          .map((l) => JSON.parse(l) as { name: string; reactor: unknown })
      : [];
    expect(calls.map((c) => c.name)).toEqual([
      "lab-switchboard",
      "lab-connect",
    ]);
    expect(calls[1].reactor).toEqual({
      backends: {
        sb: {
          kind: "remote",
          remote: { url: "http://127.0.0.1:7064/graphql" },
        },
      },
      drives: [
        {
          slug: "attachments",
          remote: { url: "http://127.0.0.1:7064/d/attachments" },
        },
        { slug: "sektar", remote: { url: "http://127.0.0.1:7064/d/sektar" } },
        {
          slug: "workflows",
          remote: { url: "http://127.0.0.1:7064/d/workflows" },
        },
      ],
    });
    await result.shutdown();
  });

  it("the same member passes the real declared and resolved host schemas", () => {
    const { declaredHostSchema, hostSchema } = defineHostSchemas(
      (s) => s.reactorHostSchema,
    );
    const runner: RunnerModule = {
      kind: "reactor",
      run: () => Promise.resolve(undefined),
      hostSchema,
      declaredHostSchema,
    };
    const member = {
      name: "lab-connect",
      runner: { module: "m" },
      reactor: {
        backends: {
          sb: {
            kind: "remote",
            remote: { url: out("switchboard", ["endpoints", "graphql"]) },
          },
        },
        drives: drivesMap,
      },
    };
    validateDeclaredHost(runner, "m", member, "hosts/connect/host.js", {
      outputsSchemaOf: schemaOf,
    });
    // a compound wrapper's reactor section takes the same declared form
    expect(
      declaredHostSchemas.childWrapperSchema.safeParse({
        host: "connect",
        reactor: member.reactor,
      }).success,
    ).toBe(true);
    // validateHost returns the runner's parsed output (typed here by the
    // resolved schema it ran).
    const resolved = hostSchema.parse(
      validateHost(
        runner,
        "m",
        resolveHostOutputs(member, sources),
        "hosts/connect/host.js",
      ),
    );
    expect(resolved.reactor?.drives?.map((d) => d.slug)).toEqual([
      "a-plugin",
      "sektar",
      "workflows",
    ]);
  });
});
