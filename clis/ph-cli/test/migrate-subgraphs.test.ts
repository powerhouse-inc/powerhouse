import { rmSync } from "node:fs";
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

vi.mock("../src/services/migrate.js", () => ({ startMigrate: vi.fn() }));

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
  resolvers = { Query: { me: () => null } };
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
    for (const path of [
      "subgraphs/stats/resolvers.ts",
      "subgraphs/stats/lib.ts",
    ]) {
      expect(after[path]).toBe(original[path]);
    }

    expect(output).toContain(
      "subgraphs/federated: not converted\n  subgraphs/federated/schema.ts:4: @key is a directive other than @deprecated",
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
