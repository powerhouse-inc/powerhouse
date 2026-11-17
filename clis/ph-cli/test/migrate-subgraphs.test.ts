import { mkdirSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { migrate } from "../src/commands/migrate.js";
import { startMigrate } from "../src/services/migrate.js";
import type { MigrateArgs } from "../src/types.js";
import {
  snapshot,
  TWIN_FILES,
  writeProject,
} from "./migrate-subgraphs-project.js";
import { gqlModule } from "./subgraph-project.js";
import { projectTypeErrors, resolverCallErrors } from "@powerhousedao/codegen";

vi.mock("../src/services/migrate.js", () => ({ startMigrate: vi.fn() }));

/** The resolver calls of the subgraph's index.ts that the project's tsc rejects. */
function rejectedResolverCalls(root: string, index: string) {
  const check = projectTypeErrors(root, [dirname(index)], [index]);
  if (check.kind !== "checked")
    throw new Error("tsc did not check the project");
  return resolverCallErrors(root, [index], check.errors);
}

const STATS = {
  "subgraphs/stats/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { schema } from "./schema.js";
import { getResolvers } from "./resolvers.js";

export class StatsSubgraph extends BaseSubgraph {
  name = "stats";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
`,
  "subgraphs/stats/schema.ts": gqlModule(
    "type StatsQueries { example(driveId: String!): String }\ntype Query { stats: StatsQueries! }",
  ),
  "subgraphs/stats/resolvers.ts": `import { type BaseSubgraph } from "@powerhousedao/reactor-api";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, unknown> => {
  const read = subgraph.readClient;
  void read;
  return ({
    Query: { stats: () => ({}) },
    StatsQueries: { example: async () => "example" },
  });
};
`,
  "subgraphs/stats/lib.ts":
    "/**\n * This is a scaffold file meant for customization.\n */\n",
};

const FEDERATED = {
  "subgraphs/federated/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";

export class FederatedSubgraph extends BaseSubgraph {
  name = "federated";
  typeDefs = schema;
  resolvers = {
    Query: { me: () => null },
    User: { __resolveReference: (reference: { id: string }) => reference },
  };
}
`,
  "subgraphs/federated/schema.ts": gqlModule(
    'type User @key(fields: "id") { id: ID! }\ntype Query { me: User }',
  ),
};

/** Its scalar export is named HexColor, but the scalar it defines is Colour: only loading the module shows it. */
const COLORS = {
  "scalars/index.ts": `import { defineScalar } from "document-model/scalars";
import { z } from "zod";

export const HexColor = defineScalar({ name: "Colour", schema: z.string() });
`,
  "subgraphs/colors/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";

export class ColorsSubgraph extends BaseSubgraph {
  name = "colors";
  typeDefs = schema;
  resolvers = { Query: { color: () => "#000000" } };
}
`,
  "subgraphs/colors/schema.ts": gqlModule(
    "scalar HexColor\ntype Query { color: HexColor }",
  ),
};

function runMigrate(
  root: string,
  args: Partial<MigrateArgs>,
): Promise<{ readonly code: number; readonly output: string }> {
  let output = "";
  const write = vi
    .spyOn(process.stdout, "write")
    .mockImplementation((chunk: string | Uint8Array) => {
      output += String(chunk);
      return true;
    });
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  const exit = vi.spyOn(process, "exit").mockImplementation((code) => {
    throw new ExitSignal(Number(code ?? 0));
  });
  const restore = () => {
    write.mockRestore();
    cwd.mockRestore();
    exit.mockRestore();
  };
  return migrate
    .handler({
      versionPositional: undefined,
      version: undefined,
      force: undefined,
      debug: undefined,
      subgraphs: undefined,
      subgraph: [],
      documentModels: undefined,
      documentModel: [],
      renameConflictingTypes: undefined,
      strictResolvers: undefined,
      dryRun: undefined,
      ...args,
    })
    .then(
      () => {
        restore();
        throw new Error("ph migrate returned without exiting");
      },
      (error: unknown) => {
        restore();
        if (!(error instanceof ExitSignal)) throw error;
        return { code: error.code, output };
      },
    );
}

class ExitSignal extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

describe("ph migrate --subgraphs on a project", () => {
  let root: string;
  let original: Record<string, string>;

  beforeAll(() => {
    root = writeProject({ ...STATS, ...FEDERATED, ...COLORS, ...TWIN_FILES });
    original = snapshot(root);
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it("--dry-run prints the diff and writes nothing", async () => {
    const { code, output } = await runMigrate(root, {
      subgraphs: true,
      dryRun: true,
    });
    expect(code).toBe(1);
    expect(snapshot(root)).toEqual(original);
    expect(output).toContain(
      "subgraphs/stats: would convert StatsSubgraph to code-first",
    );
    expect(output).toContain(
      "--- a/subgraphs/stats/index.ts\n+++ b/subgraphs/stats/index.ts\n",
    );
    expect(output).toContain(
      '+  static override readonly subgraphName = "stats";',
    );
    expect(output).toContain('-  name = "stats";');
    expect(output).toContain("subgraphs/federated: not converted");
  }, 60_000);

  it("--subgraphs converts and verifies, refuses with exit 1, and restores a subgraph that fails verification", async () => {
    const { code, output } = await runMigrate(root, { subgraphs: true });
    const after = snapshot(root);
    expect(code).toBe(1);
    expect(output).toContain(
      "subgraphs/stats: converted StatsSubgraph to code-first; it serves the same schema",
    );
    expect(output).toContain(
      "subgraphs/catalog: converted CatalogSubgraph to code-first; it serves the same schema",
    );
    expect(after["subgraphs/stats/index.ts"]).toContain(
      "export class StatsSubgraph extends Subgraph {",
    );
    expect(after["subgraphs/stats/schema.ts"]).toContain(
      'export const StatsQueries = ph.object("StatsQueries", { fields: {} });',
    );
    // The resolvers are now the class's members; lib.ts is untouched.
    expect(after["subgraphs/stats/resolvers.ts"]).toContain(
      "export const getResolvers",
    );
    expect(after["subgraphs/stats/index.ts"]).toContain(
      'import "./resolvers.js";',
    );
    expect(after["subgraphs/stats/index.ts"]).toContain(
      "resolve: ({ subgraph }) => subgraph.#stats(),",
    );
    expect(after["subgraphs/stats/index.ts"]).toContain("this.readClient");
    expect(after["subgraphs/stats/lib.ts"]).toBe(
      original["subgraphs/stats/lib.ts"],
    );

    expect(output).toContain(
      "subgraphs/federated: not converted\n  subgraphs/federated/index.ts:9: User.__resolveReference has no code-first form. A code-first entity resolves a reference to the representation the gateway sends.",
    );
    expect(output).toMatch(
      /subgraphs\/colors: not converted; its files are restored\. The converted subgraph serves a different schema:\n[^]*\+scalar Colour/,
    );
    const untouched = Object.keys(original).filter(
      (path) =>
        path.startsWith("subgraphs/federated/") ||
        path.startsWith("subgraphs/colors/") ||
        path.startsWith("scalars/"),
    );
    expect(untouched).toHaveLength(5);
    for (const path of untouched) expect(after[path]).toBe(original[path]);
    expect(Object.keys(after).sort()).toEqual(Object.keys(original).sort());

    expect(after["package.json"]).toBe(original["package.json"]);
  }, 60_000);

  it("a second run changes nothing", async () => {
    const before = snapshot(root);
    const { code, output } = await runMigrate(root, {
      subgraph: ["stats", "catalog"],
    });
    expect(code).toBe(0);
    expect(output).toBe(
      "subgraphs/stats: already code-first\nsubgraphs/catalog: already code-first\n",
    );
    expect(snapshot(root)).toEqual(before);
  }, 60_000);

  it("without a subgraph flag, ph migrate takes its usual path", async () => {
    vi.mocked(startMigrate).mockClear();
    const before = snapshot(root);
    const { code } = await runMigrate(root, { version: "dev" });
    expect(code).toBe(0);
    expect(vi.mocked(startMigrate)).toHaveBeenCalledOnce();
    expect(vi.mocked(startMigrate).mock.calls[0][0]).toMatchObject({
      version: "dev",
    });
    expect(snapshot(root)).toEqual(before);
  });

  it("with a subgraph flag, ph migrate never takes its usual path", async () => {
    vi.mocked(startMigrate).mockClear();
    const { code } = await runMigrate(root, { subgraph: ["stats"] });
    expect(code).toBe(0);
    expect(vi.mocked(startMigrate)).not.toHaveBeenCalled();
  });
});

describe("ph migrate preserves external subgraph readers", () => {
  it.each(["schema", "resolvers"])(
    "protects a percent-encoded %s reader",
    async (target) => {
      const encoded = target === "schema" ? "%73chema" : "%72esolvers";
      const reader = `export const read = () => import("./subgraphs/stats/${encoded}.ts");`;
      const root = writeProject({ ...STATS, "outside.mjs": reader });
      try {
        const before = snapshot(root);
        const result = await runMigrate(root, { subgraphs: true });
        if (target === "schema") {
          expect(result.code, result.output).toBe(1);
          expect(snapshot(root)).toEqual(before);
        } else {
          expect(result.code, result.output).toBe(0);
          expect(
            readFileSync(join(root, "subgraphs/stats/resolvers.ts"), "utf8"),
          ).toContain("export const getResolvers");
          expect(readFileSync(join(root, "outside.mjs"), "utf8")).toBe(reader);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it.each(["schema", "resolvers"])(
    "protects %s through an imports redirect to another local package's subpath",
    async (target) => {
      const reader = `export { ${target === "schema" ? "schema" : "getResolvers"} } from "#legacy";`;
      const root = writeProject({
        ...STATS,
        "package.json": JSON.stringify({
          name: "@acme/catalog",
          type: "module",
          peerDependencies: { "@powerhousedao/reactor-api": "^6.2.0" },
          imports: { "#legacy": "@acme/entry/legacy" },
        }),
        "subgraphs/stats/package.json": JSON.stringify({
          name: "@acme/entry",
          type: "module",
          exports: {
            "./legacy": { types: "./types.d.ts", default: `./${target}.ts` },
          },
        }),
        "subgraphs/stats/types.d.ts":
          "export declare const schema: unknown; export declare const getResolvers: unknown;",
        "outside.ts": reader,
      });
      try {
        mkdirSync(join(root, "node_modules/@acme"), { recursive: true });
        symlinkSync(
          join(root, "subgraphs/stats"),
          join(root, "node_modules/@acme/entry"),
          "junction",
        );
        const before = snapshot(root);
        const result = await runMigrate(root, { subgraphs: true });
        if (target === "schema") {
          expect(result.code, result.output).toBe(1);
          expect(snapshot(root)).toEqual(before);
        } else {
          expect(result.code, result.output).toBe(0);
          expect(
            readFileSync(join(root, "subgraphs/stats/resolvers.ts"), "utf8"),
          ).toContain("export const getResolvers");
          expect(readFileSync(join(root, "outside.ts"), "utf8")).toBe(reader);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it.each(
    ["nested", "sibling", "root", "outside-types"].flatMap((layout) =>
      ["schema", "resolvers", "index"].flatMap((target) =>
        ["outside.ts", "subgraphs/stats/reader.ts"].map((reader) => ({
          layout,
          target,
          reader,
        })),
      ),
    ),
  )(
    "protects $target read from $reader through a $layout directory package with a separate declaration entry",
    async ({ layout, target, reader }) => {
      const dir =
        layout === "root"
          ? "."
          : layout === "sibling"
            ? "legacy-entry"
            : "subgraphs/stats";
      const runtime =
        layout === "root"
          ? `./subgraphs/stats/${target}.ts`
          : layout === "sibling"
            ? `../subgraphs/stats/${target}.ts`
            : `./${target}.ts`;
      const files =
        target === "index"
          ? {
              "subgraphs/stats/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => 7 } });
export class StatsSubgraph extends BaseSubgraph {
  name = "stats";
  typeDefs = gql\`type Query { value: Int }\`;
  resolvers = getResolvers(this);
}`,
            }
          : STATS;
      const types =
        layout === "outside-types" ? "../../declarations.d.ts" : "./types.d.ts";
      const root = writeProject({
        ...files,
        [`${dir}/package.json`]: JSON.stringify({
          name: "@acme/entry",
          type: "module",
          types,
          main: runtime,
        }),
        [layout === "outside-types"
          ? "declarations.d.ts"
          : `${dir}/types.d.ts`]:
          "export declare const schema: unknown; export declare const getResolvers: unknown;",
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            module: "ESNext",
            moduleResolution: "Bundler",
            paths: { "@legacy": [`./${dir}`] },
          },
        }),
        [reader]: `export { ${target === "schema" ? "schema" : "getResolvers"} } from "@legacy";`,
      });
      try {
        const before = snapshot(root);
        const result = await runMigrate(root, { subgraphs: true });
        if (target === "resolvers") {
          expect(result.code, result.output).toBe(0);
          expect(
            readFileSync(join(root, "subgraphs/stats/resolvers.ts"), "utf8"),
          ).toContain("export const getResolvers");
          expect(readFileSync(join(root, reader), "utf8")).toBe(before[reader]);
        } else {
          expect(result.code, result.output).toBe(1);
          expect(snapshot(root)).toEqual(before);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it("refuses recursively expanding package mappings before writing", async () => {
    const root = writeProject({
      ...STATS,
      "package.json": JSON.stringify({
        name: "@acme/catalog",
        type: "module",
        imports: {
          "#*": { custom: "#again-*", default: "./subgraphs/stats/schema.ts" },
        },
      }),
      "outside.ts": 'export { schema } from "#schema";',
    });
    try {
      const before = snapshot(root);
      await expect(runMigrate(root, { subgraphs: true })).rejects.toThrow(
        "redirects recursively",
      );
      expect(snapshot(root)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(
    [
      "imports",
      "exports",
      "paths",
      "imports-node",
      "imports-literal",
      "exports-custom",
      "imports-pattern",
      "exports-pattern",
      "imports-chain",
    ].flatMap((mapping) =>
      ["schema", "resolvers"].flatMap((target) =>
        ["outside.ts", "subgraphs/stats/reader.ts"].map((reader) => ({
          mapping,
          target,
          reader,
        })),
      ),
    ),
  )(
    "protects $target read from $reader through $mapping without subgraphs in the alias",
    async ({ mapping, target, reader }) => {
      const prefix = mapping.startsWith("exports")
        ? "@acme/catalog/legacy"
        : "#legacy";
      const alias =
        mapping === "imports-literal"
          ? `${prefix}?mode#full`
          : mapping.endsWith("pattern")
            ? `${prefix}/${target}`
            : prefix;
      const runtime = `./subgraphs/stats/${target}.ts`;
      const root = writeProject({
        ...STATS,
        "package.json": JSON.stringify({
          name: "@acme/catalog",
          type: "module",
          peerDependencies: { "@powerhousedao/reactor-api": "^6.2.0" },
          ...((mapping === "imports" || mapping === "imports-literal") && {
            imports: { [alias]: runtime },
          }),
          ...(mapping === "imports-node" && {
            imports: { [alias]: { node: runtime, default: "./types.ts" } },
          }),
          ...(mapping === "exports-custom" && {
            exports: {
              "./legacy": {
                custom: [null, { source: runtime }],
                default: "./types.ts",
              },
            },
          }),
          ...(mapping === "imports-pattern" && {
            imports: {
              "#legacy/*": {
                custom: "./subgraphs/stats/*.ts",
                default: "./types.ts",
              },
            },
          }),
          ...(mapping === "exports-pattern" && {
            exports: {
              "./legacy/*": {
                custom: "./subgraphs/stats/*.ts",
                default: "./types.ts",
              },
            },
          }),
          ...(mapping === "imports-chain" && {
            imports: { [alias]: "@acme/catalog/legacy" },
            exports: { "./legacy": { node: runtime, default: "./types.ts" } },
          }),

          ...(mapping === "exports" && {
            exports: { "./legacy": { types: "./types.ts", default: runtime } },
          }),
        }),
        ...(mapping === "paths" && {
          "tsconfig.json": JSON.stringify({ extends: "./tsconfig.base.json" }),
          "tsconfig.base.json": JSON.stringify({
            compilerOptions: {
              module: "ESNext",
              moduleResolution: "Node",
              paths: { [alias]: [runtime] },
            },
          }),
        }),
        "types.ts":
          "export const schema: unknown = undefined; export const getResolvers: unknown = undefined;",
        [reader]: `export { ${target === "schema" ? "schema" : "getResolvers"} } from "${alias}";`,
      });
      try {
        const before = snapshot(root);
        const result = await runMigrate(root, { subgraphs: true });
        if (target === "schema") {
          expect(result.code, result.output).toBe(1);
          expect(result.output).toContain("relative import graph");
          expect(snapshot(root)).toEqual(before);
        } else {
          expect(result.code, result.output).toBe(0);
          expect(
            readFileSync(join(root, "subgraphs/stats/resolvers.ts"), "utf8"),
          ).toContain("export const getResolvers");
          expect(readFileSync(join(root, reader), "utf8")).toBe(before[reader]);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it.each([
    'import { getResolvers } from /* retained reader */ "./subgraphs/stats/resolvers.js"; export { getResolvers };',
    "export const load = () => import(`./subgraphs/stats/resolvers.js`);",
    'export { getResolvers } from /* retained reader */ "./subgraphs/stats/resolvers.js";',
    'export const load = () => import("#subgraphs/stats/resolvers.js");',
    'export const load = () => import("@example/subgraphs/subgraphs/stats/resolvers.js");',
  ])(
    "keeps a factory read by %s",
    async (reader) => {
      const root = writeProject({ ...STATS, "outside.ts": reader });
      try {
        const result = await runMigrate(root, { subgraphs: true });
        expect(result.code, result.output).toBe(0);
        expect(
          readFileSync(join(root, "subgraphs/stats/resolvers.ts"), "utf8"),
        ).toContain("export const getResolvers");
        expect(readFileSync(join(root, "outside.ts"), "utf8")).toBe(reader);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it.each([
    {
      reader:
        'import { getResolvers } from "./subgraphs/stats/resolvers.js"; export const read = getResolvers;',
      converts: true,
    },
    {
      reader:
        'import * as stats from "./subgraphs/stats/resolvers.js"; export const names = Object.keys(stats);',
      converts: false,
    },
  ])(
    "exports a factory helper only when no outside file reads the module whole: $reader",
    async ({ reader, converts }) => {
      const root = writeProject({
        ...STATS,
        "subgraphs/stats/resolvers.ts": STATS["subgraphs/stats/resolvers.ts"]
          .replace(
            "export const getResolvers",
            'const label = "example";\n\nexport const getResolvers',
          )
          .replace('async () => "example"', "async () => label"),
        "outside.ts": reader,
      });
      try {
        const before = snapshot(root);
        const result = await runMigrate(root, { subgraphs: true });
        if (converts) {
          expect(result.code, result.output).toBe(0);
          expect(
            readFileSync(join(root, "subgraphs/stats/resolvers.ts"), "utf8"),
          ).toContain('export const label = "example";');
        } else {
          expect(result.code, result.output).toBe(1);
          expect(result.output).toContain("reads whole");
          expect(snapshot(root)).toEqual(before);
        }
        expect(readFileSync(join(root, "outside.ts"), "utf8")).toBe(reader);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it("refuses a symlinked schema output without changing its target", async () => {
    const root = writeProject({
      "subgraphs/link/index.ts":
        'import { BaseSubgraph } from "@powerhousedao/reactor-api"; import { gql } from "graphql-tag"; export class LinkSubgraph extends BaseSubgraph { name = "link"; typeDefs = gql`type Query { value: Int }`; resolvers = { Query: { value: () => 1 } }; }',
      "subgraphs/link/authored.ts": "export const authored = 42;\n",
    });
    try {
      symlinkSync(
        join(root, "subgraphs/link/authored.ts"),
        join(root, "subgraphs/link/schema.ts"),
        "file",
      );
      const before = snapshot(root);
      const result = await runMigrate(root, { subgraphs: true });
      expect(result.code).toBe(1);
      expect(result.output).toContain("symbolic link");
      expect(snapshot(root)).toEqual(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

const itemSubgraph = (className: string, name: string, item: string) => ({
  [`subgraphs/${name}/index.ts`]: `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";

export class ${className} extends BaseSubgraph {
  name = ${JSON.stringify(name)};
  typeDefs = schema;
  resolvers = { Query: { ${name}Items: () => [] } };
}
`,
  [`subgraphs/${name}/schema.ts`]: gqlModule(
    `type Item { ${item} }\ntype Query { ${name}Items: [Item!]! }`,
  ),
});

const ITEM_SUBGRAPHS = {
  ...itemSubgraph("AlphaSubgraph", "alpha", "id: String!"),
  ...itemSubgraph("BetaSubgraph", "beta", "id: Int!"),
  "subgraphs/index.ts":
    'export { AlphaSubgraph } from "./alpha/index.js";\nexport { BetaSubgraph } from "./beta/index.js";\n',
};

describe("ph migrate --subgraphs on subgraphs that share a type name", () => {
  // Schema-first subgraphs may each declare their own Item; code-first ones
  // are composed, and the host leaves out one that redefines another's type.
  it("converts the first and restores the one the host would leave out", async () => {
    const root = writeProject(ITEM_SUBGRAPHS);
    try {
      const before = snapshot(root);
      const { code, output } = await runMigrate(root, { subgraphs: true });
      expect(code).toBe(1);
      expect(output).toContain(
        "subgraphs/alpha: converted AlphaSubgraph to code-first; it serves the same schema",
      );
      expect(output).toContain(
        "subgraphs/beta: not converted; its files are restored. The host would not serve the package's code-first subgraphs together:",
      );
      expect(output).toContain("define type Item differently");
      const after = snapshot(root);
      for (const file of [
        "subgraphs/beta/index.ts",
        "subgraphs/beta/schema.ts",
      ]) {
        expect(after[file]).toBe(before[file]);
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);

  it("refuses a subgraph that conflicts with one an earlier run converted", async () => {
    const root = writeProject(ITEM_SUBGRAPHS);
    try {
      expect((await runMigrate(root, { subgraph: ["alpha"] })).code).toBe(0);
      const before = snapshot(root);
      const { code, output } = await runMigrate(root, { subgraph: ["beta"] });
      expect(output).toContain("define type Item differently");
      expect(code).toBe(1);
      expect(snapshot(root)["subgraphs/beta/index.ts"]).toBe(
        before["subgraphs/beta/index.ts"],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 120_000);
});

describe("ph migrate --subgraph on an SDL file", () => {
  it("keeps schema.graphql and says it is no longer used", async () => {
    const graphql = "type Query { ping: String }\n";
    const root = writeProject({
      "subgraphs/ping/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import schema from "./schema.graphql";

export class PingSubgraph extends BaseSubgraph {
  name = "ping";
  typeDefs = schema;
  resolvers = { Query: { ping: () => "pong" } };
}
`,
      "subgraphs/ping/schema.graphql": graphql,
    });
    try {
      const { code, output } = await runMigrate(root, { subgraph: ["ping"] });
      expect(code).toBe(0);
      expect(output).toBe(
        "subgraphs/ping: converted PingSubgraph to code-first; it serves the same schema\nsubgraphs/ping/schema.graphql is no longer used; the schema is now in subgraphs/ping/schema.ts. It was kept, and you can delete it.\n",
      );
      expect(snapshot(root)["subgraphs/ping/schema.graphql"]).toBe(graphql);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

/** A subgraph whose resolvers disagree with its schema, in a project with its own tsc. */
function looseProject(): string {
  const root = writeProject({
    "tsconfig.json": `${JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      include: ["subgraphs/**/*.ts"],
    })}\n`,
    "subgraphs/loose/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import schema from "./schema.graphql";

export class LooseSubgraph extends BaseSubgraph {
  name = "loose";
  typeDefs = schema;
  resolvers = {
    Query: {
      title: () => null,
      double: (_: unknown, args: { by: number }) => args.by * 2,
      ping: () => "pong",
    },
  };
}
`,
    "subgraphs/loose/schema.graphql":
      "type Query { title: String! double(by: Int): Int! ping: String! }\n",
  });
  symlinkSync(
    dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
    join(root, "node_modules", "typescript"),
    "junction",
  );
  return root;
}

describe("ph migrate --subgraphs on resolvers that disagree with their schema", () => {
  it("casts each call TypeScript rejects, so the project compiles, and lists them", async () => {
    const root = looseProject();
    try {
      const { code, output } = await runMigrate(root, { subgraph: ["loose"] });
      expect(code).toBe(0);
      expect(output).toContain(
        "subgraphs/loose: converted LooseSubgraph to code-first; it serves the same schema",
      );
      // The schema-first map never checked them: title returns null for a
      // String!, and double's args claim a number the schema lets be null.
      expect(output).toContain(
        "Note: 2 resolver calls disagree with the schema the subgraph serves. The schema-first map never checked them; each call is cast",
      );
      expect(output).toMatch(
        /subgraphs\/loose\/index\.ts:\d+ Query\.title: Type 'null' is not assignable/,
      );
      expect(output).toMatch(/subgraphs\/loose\/index\.ts:\d+ Query\.double: /);
      expect(output).not.toContain("Query.ping");
      expect(output).not.toContain("still rejected");
      const index = snapshot(root)["subgraphs/loose/index.ts"];
      // The result of title and the args of double are cast; ping is not.
      expect(index).toContain("subgraph.#title() as never");
      expect(index).toContain("subgraph.#double(parent, args as never)");
      expect(index).toContain("resolve: ({ subgraph }) => subgraph.#ping(),");
      expect(index.match(/\/\/ ph migrate: /g)).toHaveLength(2);
      expect(rejectedResolverCalls(root, "subgraphs/loose/index.ts")).toEqual(
        [],
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);

  it("leaves them rejected with --strict-resolvers", async () => {
    const root = looseProject();
    try {
      const { code, output } = await runMigrate(root, {
        subgraph: ["loose"],
        strictResolvers: true,
      });
      expect(code).toBe(0);
      expect(output).toContain(
        "Note: 2 resolver calls disagree with the schema the subgraph serves, so TypeScript rejects them.",
      );
      expect(snapshot(root)["subgraphs/loose/index.ts"]).not.toContain(
        "as never",
      );
      expect(
        rejectedResolverCalls(root, "subgraphs/loose/index.ts"),
      ).toHaveLength(2);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});

describe("ph migrate --subgraphs with nothing to convert", () => {
  const HELPERS = {
    "subgraphs/utils/index.ts":
      'export const shout = (text: string) => text.toUpperCase();\nexport class NotFound extends Error {}\nexport { gql } from "graphql-tag";\n',
  };
  const PING = {
    "subgraphs/ping/index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";

export class PingSubgraph extends BaseSubgraph {
  name = "ping";
  typeDefs = schema;
  resolvers = { Query: { ping: () => "pong" } };
}
`,
    "subgraphs/ping/schema.ts": gqlModule("type Query { ping: String }"),
  };

  it.each([
    {
      case: "skips a helper directory and converts the subgraph next to it",
      files: { ...HELPERS, ...PING },
      args: { subgraphs: true },
      code: 0,
      output:
        "subgraphs/ping: converted PingSubgraph to code-first; it serves the same schema\nsubgraphs/utils: no subgraph class, skipped\n",
    },
    {
      case: "says so when only a helper directory is left",
      files: HELPERS,
      args: { subgraphs: true },
      code: 0,
      output:
        "subgraphs/utils: no subgraph class, skipped\nNo schema-first subgraphs to convert.\n",
    },
    {
      case: "refuses a helper directory named with --subgraph",
      files: HELPERS,
      args: { subgraph: ["utils"] },
      code: 1,
      output:
        "subgraphs/utils: not converted\n  subgraphs/utils/index.ts:1: index.ts exports no subgraph class.\n    Name a directory that holds a subgraph, or move the helpers out of subgraphs/.\n",
    },
    {
      case: "refuses a subgraph whose class comes from outside its directory",
      files: {
        "subgraphs/outer/index.ts":
          'import { OuterSubgraph } from "../../lib/outer.js";\nexport { OuterSubgraph };\n',
        "lib/outer.ts":
          'import { BaseSubgraph } from "@powerhousedao/reactor-api";\nexport class OuterSubgraph extends BaseSubgraph {\n  name = "outer";\n}\n',
      },
      args: { subgraphs: true },
      code: 1,
      output:
        "subgraphs/outer: not converted\n  subgraphs/outer/index.ts:2: index.ts exports OuterSubgraph from ../../lib/outer.js, outside subgraphs/outer, so it is not converted here.\n    Move the subgraph class into this directory, or convert it by hand.\n",
    },
    {
      case: "says so in a project without subgraphs/",
      files: {} as Readonly<Record<string, string>>,
      args: { subgraphs: true },
      code: 0,
      output: "No schema-first subgraphs to convert.\n",
    },
  ])(
    "$case",
    async ({ files, args, code, output }) => {
      const root = writeProject(files);
      try {
        const result = await runMigrate(root, args);
        expect(result.code).toBe(code);
        expect(result.output).toBe(output);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

describe("ph migrate flags", () => {
  it.each([
    {
      args: { strictResolvers: true },
      message:
        "--strict-resolvers applies only with --subgraphs or --subgraph.",
    },
    {
      args: { subgraphs: true, renameConflictingTypes: true },
      message:
        "--rename-conflicting-types applies only with --document-models or --document-model.",
    },
    {
      args: { documentModels: true, versionPositional: "6.0.0" },
      message:
        "--document-models, --document-model, --subgraphs and --subgraph convert to code-first only; they take no version and no --force.",
    },
    {
      args: { subgraph: ["stats"], force: true },
      message:
        "--document-models, --document-model, --subgraphs and --subgraph convert to code-first only; they take no version and no --force.",
    },
  ])("refuses $args", async ({ args, message }) => {
    vi.mocked(startMigrate).mockClear();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const root = writeProject({});
    try {
      const result = await runMigrate(root, args);
      expect(result).toEqual({ code: 1, output: "" });
      expect(error).toHaveBeenCalledExactlyOnceWith(message);
      expect(vi.mocked(startMigrate)).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("runs both conversions and exits 1 when either fails", async () => {
    const root = writeProject({});
    try {
      const result = await runMigrate(root, {
        documentModel: ["missing"],
        subgraphs: true,
      });
      expect(result).toEqual({
        code: 1,
        output:
          "document-models/missing: not found. Name a directory of document-models/ that holds a document model.\nNo schema-first subgraphs to convert.\n",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
