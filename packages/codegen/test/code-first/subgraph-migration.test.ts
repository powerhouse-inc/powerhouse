import { projectSubgraphGraphQL } from "document-model";
import { readSubgraphDefinitions } from "document-model/tooling";
import { type DocumentNode, parse } from "graphql";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  generateSubgraph,
  migrateSubgraph,
  sortedSchemaText,
  type SubgraphMigration,
} from "../../src/codegen/index.js";
import {
  uncachedDefinitionSourceRevision,
  ViteTypeScriptSourceImportAdapter,
} from "../../src/utils/definition-source-importer.js";
import {
  createPackage,
  inProject,
  removePackage,
  tree,
  typeCheck,
} from "./package.js";

const require = createRequire(import.meta.url);
const reactorApiDir = fileURLToPath(
  new URL("../../../reactor-api/", import.meta.url),
);

/** A package that resolves what converted subgraphs import. */
async function subgraphPackage(): Promise<string> {
  const dir = await createPackage();
  const link = (name: string, target: string) =>
    symlinkSync(
      realpathSync(target),
      join(dir, "node_modules", name),
      "junction",
    );
  link("@powerhousedao/reactor-api", reactorApiDir);
  link("graphql", dirname(require.resolve("graphql/package.json")));
  mkdirSync(join(dir, "scalars"));
  writeFileSync(
    join(dir, "scalars/index.ts"),
    'import { defineScalar } from "document-model/scalars";\nimport { z } from "zod";\n\nexport const HexColor = defineScalar({ name: "HexColor", schema: z.string() });\n',
  );
  symlinkSync(
    realpathSync(dirname(require.resolve("zod/package.json"))),
    join(dir, "node_modules", "zod"),
    "junction",
  );
  return dir;
}

/** tsc's diagnostics, so a failing assertion shows them. */
function diagnosticsOf(dir: string): string {
  try {
    return typeCheck(dir);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

type Files = Readonly<Record<string, string>>;

const subgraphClass = (options: {
  readonly sdl: string;
  readonly resolvers: string;
  readonly members?: string;
  readonly header?: string;
  readonly name?: string;
}) => `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
${options.header ?? ""}
export class RowSubgraph extends BaseSubgraph {
  name = ${JSON.stringify(options.name ?? "row")};
  typeDefs = gql\`${options.sdl}\`;
  resolvers = ${options.resolvers};
${options.members ?? ""}}
`;

const SDL_MODULE = `import { gql } from "graphql-tag";

export const schema = gql\`type Query { sdlLength: Int }\`;
`;

/**
 * Each row is one SDL and resolver-map feature; its index.ts uses an inline
 * gql literal unless the row gives files. `served` is the SDL the host
 * serves when it differs from the row's SDL; `contains` are lines of the
 * converted index.ts.
 */
const CONVERTED: readonly {
  readonly case: string;
  readonly sdl?: string;
  readonly resolvers?: string;
  readonly members?: string;
  readonly files?: Files;
  readonly served?: string;
  readonly contains?: readonly string[];
}[] = [
  {
    case: "a type named like a global the class's code uses",
    sdl: `type Error { message: String } type Query { failure: Error }`,
    resolvers: '{ Query: { failure: () => { throw new Error("no"); } } }',
    contains: ['import { Error as ErrorType } from "./schema.js";'],
  },
  {
    case: "an interface nothing implements",
    sdl: "interface Named { name: String } type Query { a: Int }",
    resolvers: "{ Query: { a: () => 1 } }",
  },
  {
    case: "only root types",
    sdl: "type Query { ping: String }",
    resolvers: '{ Query: { ping: () => "pong" } }',
  },
  {
    case: "objects, nullability and list nesting",
    sdl: `type Grid { cells: [[Int!]]! label: String tags: [String] }
type Query { grid: Grid! grids: [Grid!] }`,
    resolvers:
      "{ Query: { grid: () => ({ cells: [], label: null, tags: null }) } }",
  },
  {
    case: "descriptions, including block strings",
    sdl: `"""
A shelf.
Two lines.
"""
type Shelf { "The label." label: String }
"Filters shelves."
input ShelfFilter { "Only this label." label: String }
"""Kinds."""
enum Kind { "Wide." WIDE NARROW }
type Query { "One shelf." shelf("The filter." filter: ShelfFilter, kind: Kind): Shelf }`,
    resolvers: "{ Query: { shelf: () => null } }",
  },
  {
    case: "@deprecated with and without a reason",
    sdl: `enum Mode { OLD @deprecated(reason: "Use NEW.") NEW }
input Search { term: String @deprecated mode: Mode }
type Hit { text: String @deprecated(reason: "Use body.") body: String }
type Query { hits(search: Search, retired: Boolean @deprecated(reason: "Unused.")): [Hit!]! old: Int @deprecated }`,
    resolvers: "{ Query: { hits: () => [], old: () => 1 } }",
  },
  {
    case: "argument and input default values",
    sdl: `enum Order { ASC DESC }
input Range { from: Int = 0 to: Int order: Order = DESC }
input Page { size: Int! = 20 ratio: Float = 1.5 cursor: String = null tags: [String!] = ["a", "b"] range: Range = { from: 1, order: ASC } }
type Query { items(page: Page = { size: 5 }, order: Order = ASC, flag: Boolean = true, label: String = "x"): [String!]! }`,
    resolvers: "{ Query: { items: () => [] } }",
  },
  {
    case: "a union with __resolveType",
    sdl: `type Card { last4: String! } type Transfer { iban: String! }
union Payment = Card | Transfer
type Query { payments: [Payment!]! }`,
    resolvers:
      '{ Query: { payments: () => [] }, Payment: { __resolveType: (value: { last4?: string }) => (value.last4 ? "Card" : "Transfer") } }',
    contains: ['import { Payment } from "./schema.js";'],
  },
  {
    case: "a union without __resolveType",
    sdl: `type Cat { name: String } type Dog { name: String }
union Pet = Cat | Dog
type Query { pets: [Pet!]! }`,
    resolvers: "{ Query: { pets: () => [] } }",
  },
  {
    case: "interfaces, including one that implements another",
    sdl: `interface Node { id: ID! }
interface Named implements Node { id: ID! name: String! }
type User implements Node & Named { id: ID! name: String! email: String }
type Query { node(id: ID!): Node named: [Named!]! users: [User!]! }`,
    resolvers:
      '{ Query: { node: () => null, named: () => [], users: () => [] }, Node: { __resolveType: () => "User" }, Named: { __resolveType: () => "User" } }',
  },
  {
    case: "object types only an interface leads to, as in Relay's node field",
    sdl: `interface Node { id: ID! }
type Alpha implements Node { id: ID! a: String }
type Beta implements Node { id: ID! b: Int }
type Query { node(id: ID!): Node }`,
    resolvers:
      '{ Query: { node: () => null }, Node: { __resolveType: () => "Alpha" } }',
    contains: ["schema.type(Alpha),", "schema.type(Beta),"],
  },
  {
    case: "catalog and project scalars the SDL uses without declaring them",
    sdl: `type Swatch { id: OID! color: HexColor at: DateTime }
type Query { swatch(id: OID!): Swatch }`,
    resolvers: "{ Query: { swatch: () => null } }",
    served: `scalar OID scalar DateTime scalar HexColor
type Swatch { id: OID! color: HexColor at: DateTime }
type Query { swatch(id: OID!): Swatch }`,
  },
  {
    case: "an index.ts with CRLF line endings",
    sdl: "type Query { ping: String }",
    files: {
      "index.ts": subgraphClass({
        sdl: "type Query { ping: String }",
        resolvers: '{ Query: { ping: () => "pong" } }',
      }).replaceAll("\n", "\r\n"),
    },
  },
  {
    case: "computed fields, with and without a resolver",
    sdl: `type Line { amount: Float! share(of: Float = 100): Float! label(prefix: String): String }
type Query { lines: [Line!]! }`,
    resolvers:
      "{ Query: { lines: () => [] }, Line: { share: (parent: { amount: number }, args: { of: number }) => parent.amount / args.of } }",
  },
  {
    case: "a mutation, a root field without a resolver, and subscriptions with and without resolve",
    sdl: `type Tick { n: Int! }
type Query { ticks: [Tick!]! status: String }
type Mutation { tick: Tick! }
type Subscription { ticked: Tick! raw: Tick! }`,
    resolvers: `{
    Query: { ticks: () => [] },
    Mutation: { tick: () => ({ n: 1 }) },
    Subscription: {
      ticked: { subscribe: () => this.events(), resolve: (event: { n: number }) => event },
      raw: { subscribe: () => this.events() },
    },
  }`,
    members:
      "  hasSubscriptions = true;\n  async *events() {\n    yield { n: 1 };\n  }\n",
  },
  {
    case: "catalog and project scalars",
    sdl: `scalar OID scalar DateTime scalar HexColor
type Swatch { id: OID! color: HexColor at: DateTime }
type Query { swatch(id: OID!, color: HexColor = "#000000"): Swatch }`,
    resolvers: "{ Query: { swatch: () => null } }",
  },
  {
    case: "recursive and mutually recursive types",
    sdl: `type Folder { name: String! children: [Folder!]! files: [File!]! }
type File { name: String! folder: Folder! }
input TreeFilter { name: String child: TreeFilter }
type Query { root(filter: TreeFilter): Folder! }`,
    resolvers: "{ Query: { root: () => null } }",
  },
  {
    case: "the scaffold's schema.ts and getResolvers(this)",
    files: {
      "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { schema } from "./schema.js";
import { getResolvers } from "./resolvers.js";

export class RowSubgraph extends BaseSubgraph {
  name = "row";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
`,
      "schema.ts": `import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql\`
  type RowQueries { example(driveId: String!): String }
  type Query { row: RowQueries! }
\`;
`,
      "resolvers.ts": `import { type BaseSubgraph } from "@powerhousedao/reactor-api";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, unknown> => {
  void subgraph;
  return ({
    Query: { row: () => ({}) },
    RowQueries: { example: async () => "example" },
  });
};
`,
    },
  },
  {
    case: "locals named like the SDL export",
    files: {
      "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";

const echo = (schema: string) => schema;

export class RowSubgraph extends BaseSubgraph {
  name = "row";
  typeDefs = schema;
  resolvers = {
    Query: {
      sdlLength: (_parent: unknown, _args: unknown, _context: unknown, info: { readonly schema: unknown }) => {
        const { schema } = info;
        return echo(String(schema !== undefined)).length;
      },
    },
  };
}
`,
      "schema.ts": SDL_MODULE,
    },
  },
  {
    case: "an SDL file",
    files: {
      "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import schema from "./schema.graphql";

export class RowSubgraph extends BaseSubgraph {
  name = "row";
  typeDefs = schema;
  resolvers = { Query: { ping: () => "pong" } };
}
`,
      "schema.graphql": "type Query { ping: String }\n",
    },
  },
];

const refusal = (
  sdl: string,
  resolvers: string,
  members = "",
  name = "row",
): Files => ({ "index.ts": subgraphClass({ sdl, resolvers, members, name }) });

const REFUSED: readonly {
  readonly case: string;
  readonly files: Files;
  readonly message: string;
}[] = [
  {
    case: "a scalar only the host declares",
    files: refusal(
      "scalar JSONObject type Query { blob: JSONObject }",
      "{ Query: {} }",
    ),
    message: "only the host declares",
  },
  {
    case: "a federation directive",
    files: refusal(
      'type User @key(fields: "id") { id: ID! } type Query { me: User }',
      "{ Query: {} }",
    ),
    message: "@key is a directive other than @deprecated",
  },
  {
    case: "extend type",
    files: refusal(
      "type Query { a: Int } extend type Query { b: Int }",
      "{ Query: {} }",
    ),
    message: "extends Query with extend",
  },
  {
    case: "a schema block",
    files: refusal("schema { query: Root } type Root { a: Int }", "{}"),
    message: "declares a schema block",
  },
  {
    case: "a directive definition",
    files: refusal(
      "directive @auth on FIELD_DEFINITION type Query { a: Int }",
      "{}",
    ),
    message: "defines the directive @auth",
  },
  {
    case: "a type the host adds",
    files: refusal("type Query { drive: DocumentDrive }", "{}"),
    message: "references DocumentDrive, which it does not define",
  },
  {
    case: "a scalar the project does not export",
    files: refusal("scalar Money2 type Query { a: Money2 }", "{}"),
    message: "neither a catalog scalar nor exported by scalars/index.ts",
  },
  {
    case: "a scalar resolver",
    files: refusal(
      "scalar HexColor type Query { a: HexColor }",
      "{ HexColor: { serialize: String } }",
    ),
    message: "gives the scalar HexColor an implementation",
  },
  {
    case: "__isTypeOf",
    files: refusal(
      "type A { a: Int } type Query { a: A }",
      "{ A: { __isTypeOf: () => true } }",
    ),
    message: "A.__isTypeOf has no code-first form",
  },
  {
    case: "a resolver on an interface field",
    files: refusal(
      "interface I { a: Int } type T implements I { a: Int } type Query { i: I }",
      '{ I: { a: () => 1, __resolveType: () => "T" } }',
    ),
    message: "I.a is set on an interface field, which the host ignores",
  },
  {
    case: "an interface field with arguments",
    files: refusal(
      "interface I { a(x: Int): Int } type T implements I { a(x: Int): Int } type Query { i: I }",
      '{ I: { __resolveType: () => "T" } }',
    ),
    message: "The interface field I.a takes arguments",
  },
  {
    case: "a scalar no field uses",
    files: refusal("scalar DateTime type Query { a: Int }", "{}"),
    message:
      "No query, mutation, subscription or computed field reaches DateTime",
  },
  {
    case: "the SDL export used outside typeDefs",
    files: {
      "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { print } from "graphql";
import { schema } from "./schema.js";

export class RowSubgraph extends BaseSubgraph {
  name = "row";
  typeDefs = schema;
  resolvers = { Query: { sdlLength: () => print(schema).length } };
}
`,
      "schema.ts": SDL_MODULE,
    },
    message: "index.ts uses schema from schema.ts outside typeDefs",
  },
  {
    case: "the SDL export re-exported from index.ts",
    files: {
      "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";

export { schema } from "./schema.js";

export class RowSubgraph extends BaseSubgraph {
  name = "row";
  typeDefs = schema;
  resolvers = { Query: { sdlLength: () => 1 } };
}
`,
      "schema.ts": SDL_MODULE,
    },
    message: "index.ts uses schema from schema.ts outside typeDefs",
  },
  {
    case: "a spread in the resolver map",
    files: refusal(
      "type Query { a: Int }",
      "{ ...shared, Query: {} }",
      "",
      "row",
    ),
    message: "spreads another object",
  },
  {
    case: "a computed key in the resolver map",
    files: refusal("type Query { a: Int }", '{ ["Query"]: {} }'),
    message: "is not a plain key of the resolver map",
  },
  {
    case: "a subscription without subscribe",
    files: refusal(
      "type Query { a: Int } type Subscription { s: Int }",
      "{ Subscription: { s: () => 1 } }",
      "  hasSubscriptions = true;\n",
    ),
    message: "Subscription.s is not an object literal with subscribe",
  },
  {
    case: "hasSubscriptions that disagrees with the SDL",
    files: refusal(
      "type Query { a: Int } type Subscription { s: Int }",
      "{ Subscription: { s: { subscribe: () => null } } }",
    ),
    message: "declares a Subscription type, but hasSubscriptions is not true",
  },
  {
    case: "a name that is not kebab-case",
    files: refusal("type Query { a: Int }", "{}", "", "pingStats"),
    message: 'The subgraph name "pingStats" is not lowercase kebab-case',
  },
  {
    case: "a path field",
    files: refusal("type Query { a: Int }", "{}", '  path = "/x";\n'),
    message: "The class sets path",
  },
  {
    case: "an interpolated gql literal",
    files: {
      "index.ts": subgraphClass({
        sdl: "type Query { a: ${'Int'} }",
        resolvers: "{}",
      }),
    },
    message: "interpolates ${...}",
  },
  {
    case: "a class that extends another subgraph class",
    files: {
      "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
class Base extends BaseSubgraph {}
export class RowSubgraph extends Base {
  name = "row";
}
`,
    },
    message: "RowSubgraph extends Base, not BaseSubgraph",
  },
  {
    case: "defineIndexSubgraph",
    files: {
      "index.ts": `import { defineIndexSubgraph } from "@powerhousedao/reactor-api";
export const RowSubgraph = defineIndexSubgraph({});
`,
    },
    message: "built with defineIndexSubgraph",
  },
];

const filesOf = (dirName: string, files: Files) =>
  new Map(
    Object.entries(files).map(([path, text]) => [
      `subgraphs/${dirName}/${path}`,
      text,
    ]),
  );

const scalarsIndex: readonly [string, string] = [
  "scalars/index.ts",
  'export const HexColor = defineScalar({ name: "HexColor", schema: z.string() });\n',
];

const sdlOf = (files: Files, sdl?: string) =>
  sdl ??
  (Object.hasOwn(files, "schema.graphql")
    ? files["schema.graphql"]
    : /gql`([^`]*)`/.exec(files["schema.ts"])![1]);

describe("migrateSubgraph", () => {
  let dir: string;
  const importer = new ViteTypeScriptSourceImportAdapter();
  const revision = uncachedDefinitionSourceRevision();

  beforeAll(async () => {
    dir = await subgraphPackage();
  });
  afterAll(async () => {
    await importer.disposeRevision();
    removePackage(dir);
  });

  it.each(CONVERTED.map((row, index) => ({ ...row, index })))(
    "converts $case and serves the same schema",
    async ({ index, sdl, resolvers, members, files, served, contains }) => {
      const dirName = `row-${index}`;
      const input = files ?? {
        "index.ts": subgraphClass({
          sdl: sdl!,
          resolvers: resolvers!,
          members,
          name: dirName,
        }),
      };
      const migration = await migrateSubgraph({
        dirName,
        files: new Map([...filesOf(dirName, input), scalarsIndex]),
      });
      expect(migration.kind !== "converted" ? migration.refusals : []).toEqual(
        [],
      );
      if (migration.kind !== "converted") return;
      const indexBefore = input["index.ts"];
      for (const file of migration.files) {
        expect(/\r\n/.test(file.after)).toBe(/\r\n/.test(indexBefore));
        expect(file.after.replaceAll("\r\n", "")).not.toContain(
          /\r\n/.test(indexBefore) ? "\n" : "\r",
        );
      }
      const indexAfter = migration.files.find(({ path }) =>
        path.endsWith("/index.ts"),
      )!.after;
      for (const line of contains ?? []) expect(indexAfter).toContain(line);
      mkdirSync(join(dir, "subgraphs", dirName), { recursive: true });
      for (const [path, text] of Object.entries(input)) {
        writeFileSync(join(dir, "subgraphs", dirName, path), text);
      }
      for (const file of migration.files)
        writeFileSync(join(dir, file.path), file.after);

      const specifier = `./subgraphs/${dirName}/index.ts` as const;
      const { subgraphs, diagnostics } = readSubgraphDefinitions(
        await importer.importModule({
          packageRoot: dir,
          specifier,
          packageRevision: revision,
        }),
        { specifier },
      );
      expect(
        diagnostics.filter(({ severity }) => severity === "error"),
      ).toEqual([]);
      expect(
        sortedSchemaText(
          projectSubgraphGraphQL(
            subgraphs[0].definition,
          ) as unknown as DocumentNode,
        ),
      ).toBe(sortedSchemaText(parse(served ?? sdlOf(input, sdl))));
      expect(migration.sdl).toBe(
        sortedSchemaText(parse(served ?? sdlOf(input, sdl))),
      );
    },
  );

  it("leaves every converted row type-checking", () => {
    symlinkSync(
      realpathSync(join(reactorApiDir, "node_modules/graphql-tag")),
      join(dir, "node_modules", "graphql-tag"),
      "junction",
    );
    writeFileSync(
      join(dir, "subgraphs/global.d.ts"),
      'declare module "*.graphql";\n',
    );
    expect(diagnosticsOf(dir)).toBe("");
  }, 120_000);

  it.each(REFUSED)("refuses $case", async ({ files, message }) => {
    const migration = await migrateSubgraph({
      dirName: "row",
      files: new Map([...filesOf("row", files), scalarsIndex]),
    });
    expect(migration.kind).toBe("refused");
    if (migration.kind !== "refused") return;
    const [refused] = migration.refusals;
    expect(refused.reason).toContain(message);
    expect(refused.file).toMatch(/^subgraphs\/row\//);
    expect(refused.line).toBeGreaterThan(0);
    expect(refused.repair).not.toBe("");
  });
});

describe("a directory without a subgraph class", () => {
  it.each<{
    readonly case: string;
    readonly files: Files;
    readonly kind: SubgraphMigration["kind"];
  }>([
    {
      case: "helpers only",
      files: {
        "index.ts":
          "export const shout = (text: string) => text.toUpperCase();\n",
      },
      kind: "no-subgraph-class",
    },
    {
      case: "a class re-exported from its directory",
      files: {
        "index.ts": 'export { RowSubgraph } from "./row.js";\n',
        "row.ts":
          'import { BaseSubgraph } from "@powerhousedao/reactor-api";\nexport class RowSubgraph extends BaseSubgraph {}\n',
      },
      kind: "refused",
    },
    {
      case: "a re-export from outside its directory",
      files: { "index.ts": 'export * from "../shared/index.js";\n' },
      kind: "refused",
    },
  ])("$case is $kind", async ({ files, kind }) => {
    const migration = await migrateSubgraph({
      dirName: "row",
      files: filesOf("row", files),
    });
    expect(migration.kind).toBe(kind);
  });
});

describe("a scaffolded schema-first subgraph", () => {
  it("converts and passes tsc --noEmit", async () => {
    const dir = await subgraphPackage();
    try {
      symlinkSync(
        realpathSync(join(reactorApiDir, "node_modules/graphql-tag")),
        join(dir, "node_modules", "graphql-tag"),
        "junction",
      );
      await inProject(dir, (project) =>
        generateSubgraph("foo", project, { codeFirst: false }),
      );
      expect(diagnosticsOf(dir)).toBe("");
      const before = tree(join(dir, "subgraphs/foo"));
      const migration = await migrateSubgraph({
        dirName: "foo",
        files: new Map(
          Object.entries(before).map(([path, text]) => [
            `subgraphs/foo/${path}`,
            text,
          ]),
        ),
      });
      expect(migration.kind).toBe("converted");
      if (migration.kind !== "converted") return;
      expect(migration.files.map(({ path }) => path)).toEqual([
        "subgraphs/foo/index.ts",
        "subgraphs/foo/schema.ts",
      ]);
      for (const file of migration.files)
        writeFileSync(join(dir, file.path), file.after);
      expect(diagnosticsOf(dir)).toBe("");
      const after = tree(join(dir, "subgraphs/foo"));
      expect(after["resolvers.ts"]).toBe(before["resolvers.ts"]);
      expect(after["lib.ts"]).toBe(before["lib.ts"]);
      expect(
        readFileSync(join(dir, "subgraphs/foo/index.ts"), "utf8"),
      ).toContain('static override readonly subgraphName = "foo";');
    } finally {
      removePackage(dir);
    }
  }, 120_000);
});
