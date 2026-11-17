import { projectSubgraphGraphQL } from "document-model";
import { readSubgraphDefinitions } from "document-model/tooling";
import { type DocumentNode, parse } from "graphql";
import {
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  castResolverTypeErrors,
  projectTypeErrors,
  resolverCallErrors,
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
  importSource,
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
  link("typescript", dirname(require.resolve("typescript/package.json")));
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

/** Writes the converted files and removes the ones the conversion folded away. */
function writeMigration(
  dir: string,
  files: readonly { readonly path: string; readonly after: string | null }[],
) {
  for (const { path, after } of files) {
    if (after === null) rmSync(join(dir, path));
    else writeFileSync(join(dir, path), after);
  }
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

/** The index.ts `ph generate` scaffolds for a subgraph named row. */
const SCAFFOLD_INDEX = `import { BaseSubgraph } from "@powerhousedao/reactor-api";
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
  /** Module-level code above the class. */
  readonly header?: string;
  readonly files?: Files;
  readonly served?: string;
  readonly contains?: readonly string[];
  readonly resolved?: number | readonly number[];
}[] = [
  {
    case: "a recursive named function resolver",
    sdl: "type Query { value(n: Int!): Int }",
    resolvers:
      "{ Query: { value: function recurse(_parent: unknown, { n }: { n: number }): number { return n === 0 ? 0 : 1 + recurse(_parent, { n: n - 1 }); } } }",
    members:
      "observed = ((this.resolvers as { Query: { value: (parent: unknown, args: { n: number }) => number } }).Query.value)(undefined, { n: 3 });",
    resolved: 3,
  },
  {
    case: "indirect eval that has no access to local bindings",
    sdl: "type Query { value: Int }",
    resolvers: '{ Query: { value: () => (0, eval)("7") } }',
    resolved: 7,
  },
  {
    case: "a variable annotation referring to a renamed factory constant",
    files: {
      "index.ts": SCAFFOLD_INDEX.replace(
        "export class",
        "const LIMIT = 4; void LIMIT; export class",
      ),
      "schema.ts":
        'import { gql } from "graphql-tag"; export const schema = gql`type Query { value: Int }`;\n',
      "resolvers.ts":
        "export const getResolvers = () => { const LIMIT = 3; const stored: typeof LIMIT = LIMIT; return { Query: { value: () => stored } }; };",
    },
    served: "type Query { value: Int }",
    resolved: 3,
  },
  ...[
    ["function marker() {}", 'Number(Object.hasOwn(marker, "prototype"))', 1],
    [
      "function marker() {}",
      "Number(Reflect.construct(marker, []) !== undefined)",
      1,
    ],
    ["function marker() {}", 'Number(marker.name === "marker")', 1],
    ["const marker = () => {};", 'Number(marker.name === "marker")', 1],
    ["let marker = () => {};", 'Number(marker.name === "marker")', 1],
    [
      "const __proto__ = () => {};",
      'Number(__proto__.name === "__proto__")',
      1,
    ],
    ["const m\\u0061rker = () => {};", 'Number(marker.name === "marker")', 1],
    [
      "const marker: (value: number) => number = value => value;",
      'Number(marker.name === "marker") + marker(0)',
      1,
    ],
    [
      "const values = [7]; function marker(subgraph = 1) { return { n: values[0] + subgraph }; }",
      "Reflect.construct(marker, [0]).n",
      7,
    ],
  ].map(([declaration, expression, resolved]) => ({
    case: `factory function semantics: ${declaration} / ${expression}`,
    files: {
      "index.ts": SCAFFOLD_INDEX,
      "schema.ts":
        'import { gql } from "graphql-tag"; export const schema = gql`type Query { value: Int }`;\n',
      "resolvers.ts": `export const getResolvers = () => { ${declaration} return { Query: { value: () => ${expression} } }; };`,
    },
    served: "type Query { value: Int }",
    resolved: Number(resolved),
  })),
  ...[
    {
      name: "subgraph",
      declaration:
        'const subgraph = 7; function marker() { return Number(String(subgraph) === "7"); }',
      expression: "marker()",
    },
    {
      name: "LIMIT",
      declaration:
        'const LIMIT = 7; const LIMIT2: (n: number) => number = n => Number(String(LIMIT) === "7") + n;',
      expression: "LIMIT2(0)",
    },
    {
      name: "LIMIT",
      declaration:
        'const LIMIT = 7; function marker(LIMIT2 = 0) { void LIMIT2; return Number(String(LIMIT) === "7"); }',
      expression: "marker()",
    },
    {
      name: "LIMIT",
      declaration:
        'const LIMIT = 7; function LIMIT2() { return Number(String(LIMIT) === "7"); }',
      expression: "LIMIT2()",
    },
  ].map(({ name, declaration, expression }) => ({
    case: `factory functions keep reading renamed module bindings: ${name}`,
    files: {
      "index.ts": SCAFFOLD_INDEX.replace(
        "export class",
        `const ${name} = 0; void ${name}; export class`,
      ),
      "schema.ts":
        'import { gql } from "graphql-tag"; export const schema = gql`type Query { value: Int }`;\n',
      "resolvers.ts": `export const getResolvers = (_input: unknown) => { ${declaration} return { Query: { value: () => ${expression} } }; };`,
    },
    served: "type Query { value: Int }",
    resolved: 1,
  })),
  ...[false, true].map((hasConstructor) => ({
    case: `an unread getter initialization ${hasConstructor ? "with" : "without"} a constructor`,
    files: {
      "index.ts": SCAFFOLD_INDEX.replace(
        "  name =",
        `  reads = 0;\n  get initialized() { this.reads++; return true; }\n${hasConstructor ? "  constructor(...args: ConstructorParameters<typeof BaseSubgraph>) { super(...args); }\n" : ""}  name =`,
      ),
      "schema.ts":
        'import { gql } from "graphql-tag"; export const schema = gql`type Query { value: Int }`;\n',
      "resolvers.ts":
        "export const getResolvers = (subgraph: { initialized: boolean; reads: number }) => { const initialized = subgraph.initialized; void initialized; return { Query: { value: () => subgraph.reads } }; };\n",
    },
    served: "type Query { value: Int }",
    resolved: 1,
  })),
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
    case: "extend type blocks merged into their types",
    sdl: `type Query { a: Int } extend type Query { b: String } enum Mode { ON } extend enum Mode { OFF }
type Thing { id: ID! } extend type Thing { mode: Mode }`,
    resolvers: '{ Query: { a: () => 1, b: () => "b" } }',
    served: `type Query { a: Int b: String } enum Mode { ON OFF } type Thing { id: ID! mode: Mode }`,
  },
  {
    case: "a factory whose map uses shorthands, a value read in void, and a helper called before it is declared",
    files: {
      "index.ts": SCAFFOLD_INDEX,
      "schema.ts": `import { gql } from "graphql-tag";

export const schema = gql\`type Query { sdlLength: Int count: Int }\`;
`,
      "polyfill.ts": "export {};\n",
      "resolvers.ts": `import "./polyfill.js";
import type { BaseSubgraph } from "@powerhousedao/reactor-api";

export const getResolvers = (subgraph: BaseSubgraph) => {
  const client = subgraph.reactorClient;
  const first = helper();
  function helper() {
    return client === undefined ? 0 : 1;
  }
  const sdlLength = () => {
    void client;
    return first;
  };
  return { Query: { sdlLength, count: () => first + 1 } };
};
`,
    },
    served: "type Query { sdlLength: Int count: Int }",
    contains: [
      'import "./resolvers.js";',
      "readonly #client = this.reactorClient;",
      "void this.#client;",
      "subgraph.#sdlLength(parent, args, request, info),",
    ],
  },
  {
    case: "a literal Query lacking a field, and imported const arrows named like the entry's parameters",
    files: {
      "index.ts": SCAFFOLD_INDEX,
      "schema.ts": `import { gql } from "graphql-tag";

export const schema = gql\`type Query { sdlLength: Int missing: Int }\`;
`,
      "resolvers.ts": `import { args } from "./args.js";

export const getResolvers = () => ({ Query: { sdlLength: args } });
`,
      "args.ts": "export const args = () => 1;\n",
    },
    served: "type Query { sdlLength: Int missing: Int }",
    contains: [
      "subgraph.#sdlLength(parent, args, request, info),",
      "resolve: () => null",
    ],
  },
  {
    case: "a resolver factory given an object of what the resolvers need",
    files: {
      "index.ts": SCAFFOLD_INDEX.replace(
        "resolvers = getResolvers(this);",
        "resolvers = getResolvers({ factor: 3, label: () => this.constructor.name });",
      ),
      "schema.ts": `import { gql } from "graphql-tag";

export const schema = gql\`type Query { sdlLength: Int name: String }\`;
`,
      "resolvers.ts": `type Deps = { readonly factor: number; readonly label: () => string };

export function getResolvers(deps: Deps): Record<string, unknown> {
  const { factor } = deps;
  return {
    Query: { sdlLength: () => factor * 2, name: () => deps.label() },
  };
}
`,
    },
    served: "type Query { sdlLength: Int name: String }",
    contains: [
      "readonly #deps: Deps = { factor: 3, label: () => this.constructor.name };",
      "readonly #factor = this.#deps.factor;",
      "readonly #name = () => this.#deps.label();",
    ],
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
      '{ Query: { payments: () => [] }, Payment: { __resolveType: (value: object) => ("last4" in value ? "Card" : "Transfer") } }',
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
      "{ Query: { lines: () => [] }, Line: { share: (parent: { amount: number }, args: { of?: number | null }) => parent.amount / (args.of ?? 100) } }",
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
      raw: { subscribe: () => this.rawEvents() },
    },
  }`,
    members:
      "  hasSubscriptions = true;\n  async *events() {\n    yield { n: 1 };\n  }\n  async *rawEvents() {\n    yield { raw: { n: 1 } };\n  }\n",
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
    resolvers:
      '{ Query: { root: () => ({ name: "root", children: [], files: [] }) } }',
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
  {
    case: "the scaffold's root description, on Query and on Mutation",
    files: {
      "index.ts": SCAFFOLD_INDEX,
      "schema.ts": `import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql\`
  """
  Subgraph definition
  """
  type Query {
    statements(teamId: PHID): [Statement!]!
  }

  """
  Subgraph definition
  """
  type Mutation {
    refresh(id: OID!): Boolean
  }

  type Statement {
    id: OID!
    month: String! ## JAN2026
  }
\`;
`,
      "resolvers.ts": `export const getResolvers = (_subgraph: unknown) => ({
  Query: { statements: () => [] },
  Mutation: { refresh: () => true },
});
`,
    },
    served: `scalar PHID scalar OID
"""Subgraph definition"""
type Query { statements(teamId: PHID): [Statement!]! }
"""Subgraph definition"""
type Mutation { refresh(id: OID!): Boolean }
type Statement { id: OID! month: String! }`,
    contains: [
      'schema.root("query", { description: "Subgraph definition" }),',
      'schema.root("mutation", { description: "Subgraph definition" }),',
    ],
  },
  {
    case: "an entity's @key on a type only the entity reaches",
    sdl: `type Builder @key(fields: "id") { id: PHID name: String! contributors: [Builder!]! }
type BuilderProfile { id: PHID name: String }
type Query { builders: [BuilderProfile!]! }`,
    resolvers: "{ Query: { builders: () => [] } }",
    served: `scalar PHID
type Builder @key(fields: "id") { id: PHID name: String! contributors: [Builder!]! }
type BuilderProfile { id: PHID name: String }
type Query { builders: [BuilderProfile!]! }`,
    contains: [
      "schema.type(Builder),",
      'schema.entity(Builder, { key: "id" }),',
    ],
  },
  {
    case: "JSONObject, which the host declares",
    sdl: `"Output type for PDF chunk upload"
type UploadOutput { success: Boolean! data: JSONObject error: String }
type Query { meta(filter: JSONObject): JSONObject! }
type Mutation { upload(chunk: String!): UploadOutput! }`,
    resolvers:
      "{ Query: { meta: () => ({}) }, Mutation: { upload: () => ({ success: true, data: null, error: null }) } }",
    served: `scalar JSONObject
"Output type for PDF chunk upload"
type UploadOutput { success: Boolean! data: JSONObject error: String }
type Query { meta(filter: JSONObject): JSONObject! }
type Mutation { upload(chunk: String!): UploadOutput! }`,
    contains: [
      'import { hostScalars, ph } from "document-model";',
      "type: hostScalars.JSONObject({ required: true }),",
    ],
  },
  {
    case: "a resolver factory in resolvers/index.ts with a sibling helper",
    files: {
      "index.ts": SCAFFOLD_INDEX.replace(
        "./resolvers.js",
        "./resolvers/index.js",
      ),
      "schema.ts": `import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql\`
  type Template { id: OID! title: String }
  type Query { templates(status: String): [Template!]! count: Int }
\`;
`,
      "resolvers/index.ts": `import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { templates } from "./queries.js";

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactorClient = subgraph.reactorClient;

  return {
    Query: { templates: () => templates(reactorClient), count: () => 0 },
  };
};
`,
      "resolvers/queries.ts": `export function templates(client: unknown) {
  return client === undefined ? [] : [];
}
`,
    },
    served: `scalar OID
type Template { id: OID! title: String }
type Query { templates(status: String): [Template!]! count: Int }`,
    contains: [
      'import { templates } from "./resolvers/queries.js";',
      "readonly #reactorClient = this.reactorClient;",
      "readonly #templates = () => templates(this.#reactorClient);",
      "subgraph.#templates()",
    ],
  },
];

const refusal = (
  sdl: string,
  resolvers: string,
  members = "",
  name = "row",
): Files => ({ "index.ts": subgraphClass({ sdl, resolvers, members, name }) });

/** The scaffold's index.ts, with its resolver factory in resolvers.ts. */
const factoryRefusal = (resolvers: string): Files => ({
  "index.ts": SCAFFOLD_INDEX,
  "schema.ts": SDL_MODULE,
  "resolvers.ts": resolvers,
});

const REFUSED: readonly {
  readonly case: string;
  readonly files: Files;
  readonly message: string;
}[] = [
  {
    case: "an SDL composed through runtime imports",
    files: {
      "index.ts": SCAFFOLD_INDEX,
      "schema.ts": `import { gql } from "graphql-tag";
import { CORE } from "./schema-core.js";
import { EXTRA } from "./schema-extra.js";

export const schema = gql([CORE, EXTRA].join("\\n"));
`,
      "schema-core.ts":
        'export const CORE = /* GraphQL */ `type Query { a: Int ${"b: String"} }`;\n',
      "schema-extra.ts":
        'const LIMIT = "Int";\nexport const EXTRA = "extend type Query { c: " + LIMIT + " }";\n',
      "resolvers.ts": `export const getResolvers = () => ({
  Query: { a: () => 1, b: () => "b", c: () => 2 },
});
`,
    },
    message: "schema.ts imports a runtime dependency",
  },

  ...[
    'import { schema } from "@example/package/subgraphs/row/schema.js"; void schema;',
    'export { schema } from "@example/package/subgraphs/row/schema.js";',
    'const path = "@example/package/subgraphs/row/schema.js"; export const read = () => import(path);',
    'import { schema } from "#subgraphs/row/schema.js"; void schema;',
    'import { schema } from "@example/subgraphs/subgraphs/row/schema.js"; void schema;',
  ].map((reader) => ({
    case: `a package or alias reader of the SDL: ${reader}`,
    files: {
      ...factoryRefusal(
        "export const getResolvers = () => ({ Query: { sdlLength: () => 1 } });",
      ),
      "reader.ts": reader,
    },
    message: "reads schema.ts through a package or alias path",
  })),
  {
    case: "a factory resolver that evaluates a captured binding",
    files: factoryRefusal(
      'export const getResolvers = () => { const values = [7]; return { Query: { sdlLength: () => eval("values[0]") } }; };',
    ),
    message: "calls eval",
  },
  {
    case: "an inline resolver that evaluates its argument count",
    files: refusal(
      "type Query { value: Int }",
      '{ Query: { value() { return (eval as typeof eval)("arguments.length"); } } }',
    ),
    message: "calls eval",
  },
  {
    case: "root resolvers that are { resolve } field configs",
    files: {
      "index.ts": subgraphClass({
        sdl: "type Query { motto: String slogan: String }",
        header:
          'const motto = { resolve: () => "Read more." };\nclass FieldConfig { resolve() { return "Read on."; } }\nconst slogan = new FieldConfig();',
        resolvers: "{ Query: { motto, slogan } }",
      }),
    },
    message: "receiver or selected function can change",
  },
  ...[
    "const queries = { sdlLength: () => 1 };",
    "const queries: { sdlLength?: (parent: unknown, args: unknown, request: unknown, info: unknown) => number } = { sdlLength: () => 1 };",
    "const build = () => ({ sdlLength: () => 1 }); const queries = build();",
    "const queries = { sdlLength: () => 1 } as const;",
    "const queries: Record<string, () => number> = { sdlLength: () => 1 };",
    "const queries: {} = { sdlLength: () => 1 };",
  ].map((declaration) => ({
    case: `a built Query: ${declaration}`,
    files: factoryRefusal(
      `${declaration}\nexport const getResolvers = () => ({ Query: queries });`,
    ),
    message: "receiver and selected function",
  })),
  {
    case: "a variable type that refers to a factory function",
    files: factoryRefusal(
      "export const getResolvers = () => { const marker = () => 1; const alias: typeof marker = marker; return { Query: { sdlLength: alias } }; };",
    ),
    message: "The type of alias reads marker",
  },
  ...["this", "arguments"].map((frame) => ({
    case: `a factory function expression reading its own ${frame}`,
    files: factoryRefusal(
      `export const getResolvers = () => { const marker = function(this: unknown) { void ${frame}; return 1; }; return { Query: { sdlLength: () => marker() } }; };`,
    ),
    message: `marker reads ${frame}`,
  })),
  {
    case: "an additional index reader of the factory binding",
    files: {
      ...factoryRefusal(
        "export const getResolvers = () => ({ Query: { sdlLength: () => 1 } });",
      ),
      "index.ts": `${SCAFFOLD_INDEX}\nexport const legacy = () => getResolvers().Query.sdlLength();`,
    },
    message: "is read outside the class's resolver initializer",
  },
  {
    case: "a recursive factory binding reader",
    files: factoryRefusal(
      "const read = () => typeof getResolvers; export const getResolvers = () => ({ Query: { sdlLength: () => read().length } });",
    ),
    message: "is read outside the class's resolver initializer",
  },
  {
    case: "a moved resolver that reads its module location",
    files: factoryRefusal(
      "export const getResolvers = () => ({ Query: { sdlLength: () => import.meta.url.length } });",
    ),
    message: "moved code reads import.meta",
  },
  ...["subgraph.reads", "offset"].map((capture) => ({
    case: `a named recursive resolver capturing ${capture}`,
    files:
      factoryRefusal(`export const getResolvers = (subgraph: { reads: number }) => {
      const offset = subgraph.reads;
      return { Query: { sdlLength: function recurse(n = 1): number { return n === 0 ? ${capture} : recurse(n - 1); } } };
    };`),
    message: "references its own function while capturing",
  })),
  {
    case: "a static SDL reader with a query suffix",
    files: {
      ...factoryRefusal(
        "export const getResolvers = () => ({ Query: { sdlLength: () => 1 } });",
      ),
      "reader.ts":
        'import { schema } from "./schema.js?legacy"; export const legacy = schema;',
    },
    message: "reads schema.ts through a path outside a static import",
  },
  {
    case: "a referenced resolveType that cannot prove abstractType is unused",
    files: {
      "index.ts": subgraphClass({
        sdl: "type A { a: Int } type B { b: Int } union U = A | B type Query { u: U }",
        header:
          'let resolve = () => "A"; resolve = function () { return arguments[3] ? "A" : "B"; };',
        resolvers:
          "{ Query: { u: () => null }, U: { __resolveType: resolve } }",
      }),
    },
    message: "may read its fourth parameter, abstractType",
  },
  {
    case: "a dynamic SDL reader with a query suffix",
    files: factoryRefusal(
      'export const getResolvers = () => ({ Query: { sdlLength: async () => (await import("./schema.js?legacy")).schema.definitions.length } });',
    ),
    message: "reads schema.ts through a path outside a static import",
  },
  {
    case: "a dynamic SDL reader in the resolver factory",
    files: factoryRefusal(
      'export const getResolvers = () => ({ Query: { sdlLength: async () => (await import("./schema.js")).schema.definitions.length } });',
    ),
    message: "reads schema.ts through a path outside a static import",
  },
  {
    case: "a resolver whose type does not say how to call it",
    files: refusal(
      "type Query { a: Int }",
      "{ Query: { a: (globalThis as never as { a: any }).a } }",
    ),
    message: "its type does not say whether it is a resolver function",
  },
  {
    case: "a __resolveType that reads abstractType",
    files: refusal(
      "type A { a: Int } type B { b: Int } union U = A | B type Query { u: U }",
      '{ Query: { u: () => null }, U: { __resolveType: (value: object, context: unknown, info: unknown, abstractType: unknown) => (abstractType ? "A" : "B") } }',
    ),
    message: "may read its fourth parameter, abstractType",
  },
  {
    case: "a Query built by an expression of unknown type",
    files: factoryRefusal(`const build = (): any => ({});
export const getResolvers = () => ({ Query: build() });
`),
    message: "whose type does not say which fields it resolves",
  },
  {
    case: "a Query that is a class instance",
    files: factoryRefusal(`class Queries {
  sdlLength() {
    return 1;
  }
}
export const getResolvers = () => ({ Query: new Queries() });
`),
    message: "are a class instance",
  },
  {
    case: "a factory type that reads the subgraph",
    files:
      factoryRefusal(`export const getResolvers = (subgraph: { readonly reactorClient: unknown }) => {
  type Client = typeof subgraph.reactorClient;
  const client: Client = subgraph.reactorClient;
  return { Query: { sdlLength: () => (client ? 1 : 0) } };
};
`),
    message: "The type Client reads subgraph",
  },
  {
    case: "a resolver that assigns a variable of a resolvers file that stays",
    files: {
      ...factoryRefusal(`export let calls = 0;
export const getResolvers = () => ({
  Query: { sdlLength: () => ++calls },
});
`),
      "counter.test.ts":
        'import { calls } from "./resolvers.js";\nexport const seen = calls;\n',
    },
    message: "The resolvers assign calls",
  },
  {
    case: "a built Query whose resolver is a function or a { resolve } config",
    files:
      factoryRefusal(`type Resolver = (() => number) | { resolve: () => number };
const queries: { sdlLength: Resolver } = { sdlLength: () => 1 };
export const getResolvers = () => ({ Query: queries });
`),
    message: "receiver and selected function",
  },
  {
    case: "a folded declaration named like a global index.ts reads",
    files: {
      ...factoryRefusal(`const URL = "http://api";
export const getResolvers = () => ({ Query: { sdlLength: () => URL.length } });
`),
      "index.ts": SCAFFOLD_INDEX.replace(
        "export class",
        'export const home = () => new URL("http://x/").href;\n\nexport class',
      ),
    },
    message: "would shadow the global URL that index.ts reads",
  },
  {
    case: "a helper function declaration that reads arguments",
    files:
      factoryRefusal(`export const getResolvers = (subgraph: { readonly name: string }) => {
  function sum(..._: number[]) {
    return subgraph.name.length + arguments.length;
  }
  return { Query: { sdlLength: () => sum(1, 2) } };
};
`),
    message: "sum reads arguments",
  },
  {
    case: "a destructuring assignment to a variable of a resolvers file that stays",
    files: {
      ...factoryRefusal(`export let calls = 0;
export const getResolvers = () => ({
  Query: {
    sdlLength: () => {
      [calls] = [calls + 1];
      return calls;
    },
  },
});
`),
      "counter.test.ts":
        'import { calls } from "./resolvers.js";\nexport const seen = calls;\n',
    },
    message: "The resolvers assign calls",
  },
  {
    case: "a resolver factory that runs a statement before its map",
    files: factoryRefusal(`export const getResolvers = (subgraph: unknown) => {
  console.log("loaded", subgraph);
  return { Query: { sdlLength: () => 1 } };
};
`),
    message: 'runs console.log("loaded", subgraph); before it returns',
  },
  {
    case: "a resolver factory that reads its own this",
    files:
      factoryRefusal(`export function getResolvers(this: unknown, subgraph: unknown) {
  const self = this;
  return { Query: { sdlLength: () => (self === subgraph ? 1 : 0) } };
}
`),
    message: "only a factory that takes one parameter, given one argument",
  },
  {
    case: "a resolver factory whose parameter has a default",
    files: {
      ...factoryRefusal(`export const getResolvers = (label = "fallback") => ({
  Query: { sdlLength: () => label.length },
});
`),
      "index.ts": SCAFFOLD_INDEX.replace(
        "getResolvers(this)",
        "getResolvers(undefined)",
      ),
    },
    message: "The parameter has no default unless the argument is this.",
  },
  {
    case: "a resolver factory given an argument it does not take",
    files: {
      ...factoryRefusal(`export const getResolvers = () => ({
  Query: { sdlLength: () => 1 },
});
`),
      "index.ts": SCAFFOLD_INDEX.replace(
        "getResolvers(this)",
        "getResolvers((globalThis as { n?: number }).n = 1)",
      ),
    },
    message: "only a factory that takes one parameter, given one argument",
  },
  {
    case: "an instance value read inside a function with its own this",
    files:
      factoryRefusal(`export const getResolvers = (subgraph: { readonly name: string }) => {
  const { name } = subgraph;
  return {
    Query: {
      sdlLength: () => [1].map(function () { return name.length; })[0],
    },
  };
};
`),
    message: "is read inside a nested function with its own this",
  },
  {
    case: "a federation directive other than @key",
    files: refusal(
      'type User @key(fields: "id") @shareable { id: ID! } type Query { me: User }',
      "{ Query: {} }",
    ),
    message: "@shareable is a directive other than @deprecated",
  },
  {
    case: "@key with an argument other than fields",
    files: refusal(
      'type User @key(fields: "id", resolvable: false) { id: ID! } type Query { me: User }',
      "{ Query: {} }",
    ),
    message: "@key on User takes arguments other than one fields string",
  },
  {
    case: "@key on an interface",
    files: refusal(
      'interface Node @key(fields: "id") { id: ID! } type User implements Node { id: ID! } type Query { node: Node }',
      '{ Node: { __resolveType: () => "User" } }',
    ),
    message: "@key is on Node, which is not an object type",
  },
  {
    case: "an @key whose fields the type does not declare",
    files: refusal(
      'type User @key(fields: "uuid") { id: ID! } type Query { me: User }',
      "{ Query: {} }",
    ),
    message: "is not a selection of User's fields: User has no field uuid.",
  },
  {
    case: "an entity's __resolveReference",
    files: refusal(
      'type User @key(fields: "id") { id: ID! } type Query { me: User }',
      "{ User: { __resolveReference: (reference: { id: string }) => reference } }",
    ),
    message:
      "User.__resolveReference has no code-first form. A code-first entity resolves a reference to the representation the gateway sends.",
  },
  {
    case: "a root type that implements an interface",
    files: refusal(
      "interface Named { name: String } type Query implements Named { name: String }",
      "{}",
    ),
    message: "The root type Query implements an interface",
  },
  {
    case: "Subscription resolvers that are not an object literal",
    files: refusal(
      "type Query { a: Int } type Subscription { s: Int }",
      "{ Subscription: makeSubscriptions() }",
      "  hasSubscriptions = true;\n",
    ),
    message:
      "The resolvers of Subscription are not an object literal, so the conversion cannot tell which of its fields have resolvers.",
  },
  {
    case: "an object type's resolvers that are not an object literal",
    files: refusal(
      "type Row { a: Int } type Query { row: Row }",
      "{ Row: makeRowResolvers() }",
    ),
    message: "The resolvers of Row are not an object literal",
  },
  {
    case: "a resolver factory outside the subgraph's directory",
    files: {
      "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
import { getResolvers } from "../shared/resolvers.js";

export class RowSubgraph extends BaseSubgraph {
  name = "row";
  typeDefs = gql\`type Query { a: Int }\`;
  resolvers = getResolvers(this);
}
`,
    },
    message:
      "getResolvers is imported from ../shared/resolvers.js, outside this subgraph's directory.",
  },
  {
    case: "a nested module that imports schema.ts",
    files: {
      "index.ts": SCAFFOLD_INDEX.replace(
        "./resolvers.js",
        "./resolvers/index.js",
      ),
      "schema.ts": SDL_MODULE,
      "resolvers/index.ts": `import { schema } from "../schema.js";

export const getResolvers = (_subgraph: unknown) => {
  void schema;
  return { Query: { sdlLength: () => 1 } };
};
`,
    },
    // The SDL it reads moves to schema-sdl.ts, under the name index.ts's own
    // SDL import still has while the resolvers move.
    message:
      "The resolvers read schema, the schema-first SDL, which index.ts also imports for typeDefs",
  },
  {
    case: "an extension of a type the SDL does not define",
    files: refusal(
      "type Query { a: Int } extend type User { b: Int }",
      "{ Query: {} }",
    ),
    message: "extends User with extend",
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
    case: "a gql literal that interpolates a value known only at run time",
    files: {
      "index.ts": subgraphClass({
        sdl: "type Query { a: ${process.env.TYPE} }",
        resolvers: "{}",
      }),
    },
    message: "The SDL is built by code that only runs at run time",
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

  it.each([
    "unused",
    "ordered",
    "empty-entry",
    "capture",
    "reexport",
    "initializer",
    "mixed-type",
    "mixed-value",
    "kept-parameter-type",
    "kept-return-type",
  ])(
    "preserves %s factory initialization dependencies",
    async (kind) => {
      const packageDir = await subgraphPackage();
      symlinkSync(
        realpathSync(
          dirname(
            createRequire(join(reactorApiDir, "package.json")).resolve(
              "graphql-tag/package.json",
            ),
          ),
        ),
        join(packageDir, "node_modules/graphql-tag"),
        "junction",
      );
      const config = JSON.parse(
        readFileSync(join(packageDir, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: Record<string, unknown> };
      config.compilerOptions.verbatimModuleSyntax =
        !kind.startsWith("mixed") && !kind.startsWith("kept");
      writeFileSync(join(packageDir, "tsconfig.json"), JSON.stringify(config));
      const readsCaptured =
        kind === "reexport" ||
        kind === "initializer" ||
        kind.startsWith("mixed") ||
        kind.startsWith("kept");
      const files = new Map(
        filesOf("effects", {
          "index.ts": subgraphClass({
            sdl: "type Query { value: Int }",
            resolvers:
              kind === "empty-entry"
                ? "{ Query: { value: () => globalThis.migrationFactoryInit ?? 0 } }"
                : readsCaptured
                  ? "getResolvers(this)"
                  : "getResolvers()",
            members: readsCaptured
              ? "readonly observed = captured;"
              : undefined,
            header:
              kind === "empty-entry"
                ? 'import {} from "./bootstrap.js";'
                : `import { getResolvers${kind === "mixed-type" ? ", type Marker" : kind === "mixed-value" ? ", boot" : ""} } from "./resolvers.js";` +
                  (readsCaptured
                    ? ' import { captured } from "./capture.js";'
                    : ""),
          }).replace(
            "export class",
            (kind === "capture"
              ? "globalThis.migrationFactoryInit = 7; "
              : "") + "export class",
          ),
          "resolvers.ts":
            kind === "unused"
              ? 'import { boot } from "./bootstrap.js"; export const getResolvers = () => ({ Query: { value: () => globalThis.migrationFactoryInit ?? 0 } });'
              : kind === "capture"
                ? "const captured = globalThis.migrationFactoryInit ?? 0; export const getResolvers = () => ({ Query: { value: () => captured } });"
                : readsCaptured
                  ? (kind === "reexport"
                      ? 'export { boot } from "./bootstrap.js";'
                      : "export type Marker = { observed: number }; type Value = number; export const boot = (globalThis.migrationFactoryInit = 7);") +
                    ` export const getResolvers = (subgraph: ${kind === "kept-parameter-type" ? "Marker" : "{ observed: number }"}) => ({ Query: { value: ()${kind === "kept-return-type" ? ": Value" : ""} => subgraph.observed } });`
                  : 'import "./bootstrap.js"; import { captured } from "./capture.js"; export const getResolvers = () => ({ Query: { value: () => captured } });',
          "bootstrap.ts":
            "declare global { var migrationFactoryInit: number | undefined; } export const boot = (globalThis.migrationFactoryInit = 7);",
          "capture.ts":
            "export const captured = globalThis.migrationFactoryInit ?? 0;",
        }),
      );
      const observe = async () => {
        Reflect.deleteProperty(globalThis, "migrationFactoryInit");
        const namespace = await importSource(
          packageDir,
          "./subgraphs/effects/index.ts",
        );
        const Constructor = namespace.RowSubgraph as new (args: object) => {
          resolvers: { Query: { value: () => number } };
        };
        expect(new Constructor({}).resolvers.Query.value()).toBe(
          kind === "capture" ? 0 : 7,
        );
      };
      try {
        for (const [path, text] of files) {
          mkdirSync(dirname(join(packageDir, path)), { recursive: true });
          writeFileSync(join(packageDir, path), text);
        }
        await observe();
        typeCheck(packageDir);
        const migration = await migrateSubgraph({ dirName: "effects", files });
        expect(migration.kind).toBe("converted");
        if (migration.kind !== "converted") throw new Error("not converted");
        writeMigration(packageDir, migration.files);
        await observe();
        typeCheck(packageDir);
      } finally {
        Reflect.deleteProperty(globalThis, "migrationFactoryInit");
        removePackage(packageDir);
      }
    },
    120_000,
  );

  it.each([
    "inline",
    "declaration",
    "inferred-local",
    "sibling-type",
    "external-type-use",
    "external-runtime-use",
  ])(
    "preserves initialization order with an earlier %s import",
    async (kind) => {
      const packageDir = await subgraphPackage();
      symlinkSync(
        realpathSync(
          dirname(
            createRequire(join(reactorApiDir, "package.json")).resolve(
              "graphql-tag/package.json",
            ),
          ),
        ),
        join(packageDir, "node_modules/graphql-tag"),
        "junction",
      );
      const config = JSON.parse(
        readFileSync(join(packageDir, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: Record<string, unknown> };
      config.compilerOptions.verbatimModuleSyntax = false;
      writeFileSync(join(packageDir, "tsconfig.json"), JSON.stringify(config));
      const external = kind.startsWith("external");
      const imported =
        kind === "declaration"
          ? "type { value }"
          : kind === "inline"
            ? "{ type value }"
            : kind === "sibling-type"
              ? "{ type Marker }"
              : "{ value }";
      const expected = kind === "external-runtime-use" ? 0 : 7;
      const files = filesOf("order", {
        "index.ts": subgraphClass({
          sdl: "type Query { value: Int }",
          resolvers: "getResolvers(this)",
          header: `import ${imported} from "./${external ? "values" : "resolvers"}.js"; import "./bootstrap.js"; import { getResolvers } from "./resolvers.js";`,
          members:
            kind === "external-runtime-use"
              ? "readonly observed = value;"
              : kind === "sibling-type"
                ? "declare observed: Marker;"
                : "declare observed: typeof value;",
        }),
        "resolvers.ts":
          (external
            ? 'import { value } from "./values.js";'
            : "export type Marker = number; export const value = globalThis.migrationFactoryInit ?? 0;") +
          " export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => value } });",
        "values.ts":
          "export const value = globalThis.migrationFactoryInit ?? 0;",
        "bootstrap.ts":
          "declare global { var migrationFactoryInit: number | undefined; } globalThis.migrationFactoryInit = 7; export {};",
      });
      const observe = async () => {
        Reflect.deleteProperty(globalThis, "migrationFactoryInit");
        const namespace = await importSource(
          packageDir,
          "./subgraphs/order/index.ts",
        );
        const Constructor = namespace.RowSubgraph as new (args: object) => {
          resolvers: { Query: { value: () => number } };
        };
        expect(new Constructor({}).resolvers.Query.value()).toBe(expected);
      };
      try {
        for (const [path, text] of files) {
          mkdirSync(dirname(join(packageDir, path)), { recursive: true });
          writeFileSync(join(packageDir, path), text);
        }
        await observe();
        typeCheck(packageDir);
        const before = new Map(files);
        const migration = await migrateSubgraph({ dirName: "order", files });
        if (kind === "declaration" || kind === "sibling-type") {
          expect(migration.kind).toBe("converted");
          if (migration.kind !== "converted") throw new Error("not converted");
          writeMigration(packageDir, migration.files);
        } else {
          expect(migration.kind).toBe("refused");
          if (migration.kind !== "refused") throw new Error("not refused");
          expect(migration.refusals[0].reason).toContain(
            "change initialization order",
          );
          expect(files).toEqual(before);
        }
        await observe();
        typeCheck(packageDir);
      } finally {
        Reflect.deleteProperty(globalThis, "migrationFactoryInit");
        removePackage(packageDir);
      }
    },
    120_000,
  );

  it.each([
    {
      name: "aliased value",
      imports:
        'import { getResolvers, value as factoryValue } from "./resolvers.js";',
      members: "readonly observed = factoryValue;",
      factory:
        "export const value = 7; export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => value } });",
    },
    {
      name: "inline type-only value",
      imports: 'import { getResolvers, type value } from "./resolvers.js";',
      members: "declare observed: typeof value;",
      factory:
        "export const value = 7; export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => value } });",
    },
    {
      name: "declaration type-only value",
      imports:
        'import { getResolvers } from "./resolvers.js"; import type { value, Marker } from "./resolvers.js";',
      members: "declare observed: typeof value; declare marker: Marker;",
      factory:
        "export type Marker = unknown; export const value = 7; export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => value } });",
    },
    {
      name: "local parameter type",
      imports: 'import { getResolvers } from "./resolvers.js";',
      members: "readonly observed = 7;",
      factory:
        "type Marker = { observed: number }; export const getResolvers = (subgraph: Marker) => ({ Query: { value: () => subgraph.observed } });",
    },
    {
      name: "imported parameter type",
      imports: 'import { getResolvers } from "./resolvers.js";',
      members: "readonly observed = 7;",
      factory:
        'import type { Marker } from "./types.js"; export const getResolvers = (subgraph: Marker) => ({ Query: { value: () => subgraph.observed } });',
    },
    {
      name: "shadowed parameter type",
      imports: 'import { getResolvers } from "./resolvers.js";',
      members:
        "readonly observed = 7; other(Marker: number) { return Marker; }",
      factory:
        "type Marker = { observed: number }; export const getResolvers = (subgraph: Marker) => ({ Query: { value: () => subgraph.observed } });",
    },
    {
      name: "parameter value query",
      imports: 'import { getResolvers } from "./resolvers.js";',
      members: "readonly observed = 7;",
      factory:
        "const sample = { observed: 7 }; export const getResolvers = (subgraph: typeof sample) => ({ Query: { value: () => subgraph.observed } });",
    },
    ...["local", "imported"].flatMap((origin) =>
      ["unknown", "typeof sample"].map((parameter) => ({
        name: `${origin} shorthand with ${parameter} parameter`,
        imports: 'import { getResolvers } from "./resolvers.js";',
        members: "readonly observed = 7;",
        factory:
          (origin === "local"
            ? "const sample = { observed: 7 };"
            : 'import { sample } from "./values.js";') +
          ` export const getResolvers = (_subgraph: ${parameter}) => ({ Query: { value: () => ({ sample }).sample.observed } });`,
      })),
    ),
    {
      name: "a helper the factory module exports",
      imports: 'import { getResolvers } from "./resolvers.js";',
      members: "",
      factory:
        "export const ping = () => 7; export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => ping() } });",
    },
    {
      name: "a resolver the factory module imports from another module",
      imports: 'import { getResolvers } from "./resolvers.js";',
      members: "",
      factory:
        'import { readValue } from "./read.js"; export const getResolvers = (_subgraph: unknown): Record<string, unknown> => ({ Query: { value: readValue } });',
    },
    {
      name: "preserved type re-export",
      imports:
        'import { getResolvers } from "./resolvers.js"; import type { sample } from "./resolvers.js"; export type { sample };',
      members: "readonly observed = 7;",
      factory:
        "export const sample = { observed: 7 }; export const getResolvers = (_subgraph: typeof sample) => ({ Query: { value: () => 7 } });",
    },
  ])(
    "preserves required imports for $name",
    async (spec) => {
      const packageDir = await subgraphPackage();
      symlinkSync(
        realpathSync(
          dirname(
            createRequire(join(reactorApiDir, "package.json")).resolve(
              "graphql-tag/package.json",
            ),
          ),
        ),
        join(packageDir, "node_modules/graphql-tag"),
        "junction",
      );
      const config = JSON.parse(
        readFileSync(join(packageDir, "tsconfig.json"), "utf8"),
      ) as { compilerOptions: Record<string, unknown> };
      config.compilerOptions.noUnusedLocals = true;
      writeFileSync(join(packageDir, "tsconfig.json"), JSON.stringify(config));
      const files = new Map(
        filesOf("bindings", {
          "index.ts": subgraphClass({
            sdl: "type Query { value: Int }",
            resolvers: "getResolvers(this)",
            header: spec.imports,
            members: spec.members,
          }),
          "resolvers.ts": spec.factory,
          "types.ts": "export type Marker = { observed: number };",
          "values.ts": "export const sample = { observed: 7 };",
          "read.ts":
            "export const readValue = (_parent: unknown, _args: unknown, _context: unknown, _info: unknown) => 7;",
        }),
      );
      const observe = async () => {
        const namespace = await importSource(
          packageDir,
          "./subgraphs/bindings/index.ts",
        );
        const Constructor = namespace.RowSubgraph as new (args: object) => {
          resolvers: { Query: { value: () => number } };
        };
        expect(new Constructor({}).resolvers.Query.value()).toBe(7);
      };
      try {
        for (const [path, text] of files) {
          mkdirSync(dirname(join(packageDir, path)), { recursive: true });
          writeFileSync(join(packageDir, path), text);
        }
        typeCheck(packageDir);
        await observe();
        const migration = await migrateSubgraph({ dirName: "bindings", files });
        expect(migration.kind).toBe("converted");
        if (migration.kind !== "converted") throw new Error("not converted");
        writeMigration(packageDir, migration.files);
        typeCheck(packageDir);
        await observe();
      } finally {
        removePackage(packageDir);
      }
    },
    120_000,
  );

  it.each([
    { name: "value", extra: "" },
    { name: "value and type", extra: "export type Sdl = typeof QUERY;" },
  ])(
    "keeps loading a module the SDL read only as a $name",
    async (spec) => {
      const packageDir = await subgraphPackage();
      symlinkSync(
        realpathSync(
          dirname(
            createRequire(join(reactorApiDir, "package.json")).resolve(
              "graphql-tag/package.json",
            ),
          ),
        ),
        join(packageDir, "node_modules/graphql-tag"),
        "junction",
      );
      const files = new Map(
        filesOf("stats", {
          "index.ts": subgraphClass({
            sdl: "${QUERY}",
            resolvers: "{ Query: { value: () => state.n } }",
            header: `import { state } from "./state.js";\nimport { QUERY } from "./sdl-parts.js";\n${spec.extra}`,
          }),
          "state.ts": "export const state = { n: 0 };\n",
          "sdl-parts.ts":
            'import { state } from "./state.js";\nstate.n = 7;\nexport const QUERY = "type Query { value: Int }";\n',
        }),
      );
      const observe = async () => {
        const namespace = await importSource(
          packageDir,
          "./subgraphs/stats/index.ts",
        );
        const Constructor = namespace.RowSubgraph as new (args: object) => {
          resolvers: { Query: { value: () => number } };
        };
        expect(new Constructor({}).resolvers.Query.value()).toBe(7);
      };
      try {
        for (const [path, text] of files) {
          mkdirSync(dirname(join(packageDir, path)), { recursive: true });
          writeFileSync(join(packageDir, path), text);
        }
        typeCheck(packageDir);
        await observe();
        const migration = await migrateSubgraph({ dirName: "stats", files });
        expect(migration.kind).toBe("converted");
        if (migration.kind !== "converted") throw new Error("not converted");
        expect(
          migration.files.find(
            ({ path }) => path === "subgraphs/stats/index.ts",
          )?.after,
        ).toContain('import "./sdl-parts.js";');
        writeMigration(packageDir, migration.files);
        typeCheck(packageDir);
        await observe();
      } finally {
        removePackage(packageDir);
      }
    },
    120_000,
  );

  it.each([
    "inline",
    "declaration",
    "default",
    "namespace",
    "alias",
    "runtime",
  ])(
    "checks runtime capability of a reused %s factory dependency",
    async (kind) => {
      const name =
        kind === "namespace"
          ? "values"
          : kind === "alias"
            ? "localValue"
            : "value";
      const entryImport =
        kind === "default"
          ? 'import type value from "./values.js";'
          : kind === "namespace"
            ? 'import type * as values from "./values.js";'
            : `import ${kind === "declaration" ? "type " : ""}{ ${kind === "inline" || kind === "alias" ? "type " : ""}value${kind === "alias" ? " as localValue" : ""} } from "./values.js";`;
      const factoryImport =
        kind === "default"
          ? 'import value from "./values.js";'
          : kind === "namespace"
            ? 'import * as values from "./values.js";'
            : `import { value${kind === "alias" ? " as localValue" : ""} } from "./values.js";`;
      const files = new Map(
        filesOf("capability", {
          "index.ts": subgraphClass({
            sdl: "type Query { value: Int }",
            resolvers: "getResolvers(this)",
            header:
              'import { getResolvers } from "./resolvers.js"; ' + entryImport,
            members: `declare observed: typeof ${name};`,
          }),
          "resolvers.ts":
            factoryImport +
            ` export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => ${kind === "namespace" ? "values.value" : name} } });`,
          "values.ts": "export const value = 7; export default value;",
        }),
      );
      const before = new Map(files);
      const migration = await migrateSubgraph({ dirName: "capability", files });
      if (kind === "runtime") {
        expect(migration.kind).toBe("converted");
      } else {
        expect(migration.kind).toBe("refused");
        if (migration.kind !== "refused") throw new Error("not refused");
        expect(migration.refusals[0].reason).toContain(
          "imports it only as a type",
        );
        expect(files).toEqual(before);
      }
    },
  );

  it("refuses merged factory declarations unchanged", async () => {
    const files = new Map(
      filesOf("merged", {
        "index.ts": subgraphClass({
          sdl: "type Query { value: Thing } type Thing { n: Int label: String }",
          resolvers: "getResolvers(this)",
          header: 'import { getResolvers } from "./resolvers.js";',
        }),
        "resolvers.ts":
          'interface Value { n: number } interface Value { label: string } export const getResolvers = (_subgraph: unknown) => ({ Query: { value: (): Value => ({ n: 7, label: "x" }) } });',
      }),
    );
    const before = new Map(files);
    const migration = await migrateSubgraph({ dirName: "merged", files });
    expect(migration.kind).toBe("refused");
    if (migration.kind !== "refused") throw new Error("not refused");
    expect(migration.refusals[0].reason).toContain("merged declarations");
    expect(files).toEqual(before);
  });

  it.each([
    ["value: (_parent, args) => args.n", ""],
    ["value(_parent, args) { return args.n; }", ""],
    ["value: function (_parent, { n }) { return n; }", ""],
    ['"value"(_parent, args) { return args.n; }', ""],
    ["value(_parent, args) { return args.n; }", "?"],
    ["value(_parent, args) { return args.n; }", " | { other(): string }"],
  ])(
    "refuses a resolver that would lose contextual parameter types: %s (optional %s)",
    async (member, optional) => {
      const union = optional.startsWith(" |");
      const files = new Map(
        filesOf("context", {
          "index.ts": subgraphClass({
            sdl: "type Query { value(n: Int!): Int }",
            resolvers: "getResolvers()",
            header: 'import { getResolvers } from "./resolvers.js";',
          }),
          "resolvers.ts": union
            ? `type Resolvers = { Query: { value(parent: unknown, args: { n: number }): number }${optional} }; export const getResolvers = (): Resolvers => ({ Query: { ${member} } });`
            : `type Resolvers = { Query${optional}: { value${optional}: (parent: unknown, args: { n: number }) => number } }; export const getResolvers = (): Resolvers => ({ Query: { ${member} } });`,
        }),
      );
      const before = new Map(files);
      const migration = await migrateSubgraph({ dirName: "context", files });
      expect(migration.kind).toBe("refused");
      if (migration.kind !== "refused") throw new Error("not refused");
      expect(migration.refusals[0].reason).toContain(
        "contextual parameter, receiver, or yield types",
      );
      expect(files).toEqual(before);
    },
  );

  it.each(["satisfies", "as", "nested return"])(
    "refuses context-dependent parameters from %s",
    async (context) => {
      const nested = context === "nested return";
      const files = new Map(
        filesOf("context", {
          "index.ts": subgraphClass({
            sdl: nested
              ? "type Query { thing: Thing } type Thing { value(n: Int!): Int }"
              : "type Query { value(n: Int!): Int }",
            resolvers: "getResolvers(this)",
            header: 'import { getResolvers } from "./resolvers.js";',
          }),
          "resolvers.ts": nested
            ? "type Resolvers = { Query: { thing: () => { value: (args: { n: number }) => number } } }; export const getResolvers = (_subgraph: unknown): Resolvers => ({ Query: { thing: () => ({ value: ({ n }) => n }) } });"
            : `type Resolver = (parent: unknown, args: { n: number }) => number; export const getResolvers = (_subgraph: unknown) => ({ Query: { value: ((_parent, args) => args.n) ${context} Resolver } });`,
        }),
      );
      const before = new Map(files);
      const migration = await migrateSubgraph({ dirName: "context", files });
      expect(migration.kind).toBe("refused");
      if (migration.kind !== "refused") throw new Error("not refused");
      expect(migration.refusals[0].reason).toContain(
        "contextual parameter, receiver, or yield types",
      );
      expect(files).toEqual(before);
    },
  );

  it.each([
    "(_parent: unknown, args: { n: number }) => [args.n].map((n) => n + 1)[0]",
    "(_parent, args: { n: number }) => args.n",
  ])(
    "converts a resolver an unknown-typed map gives no parameter types: %s",
    async (resolver) => {
      const files = new Map(
        filesOf("context", {
          "index.ts": subgraphClass({
            sdl: "type Query { value(n: Int!): Int }",
            resolvers: "getResolvers(this)",
            header: 'import { getResolvers } from "./resolvers.js";',
          }),
          "resolvers.ts": `export const getResolvers = (_subgraph: unknown): Record<string, unknown> => ({ Query: { value: ${resolver} } });`,
        }),
      );
      const migration = await migrateSubgraph({ dirName: "context", files });
      expect(migration.kind).toBe("converted");
    },
  );

  it("refuses contextual receiver typing inside a returned resolver object", async () => {
    const files = new Map(
      filesOf("context", {
        "index.ts": subgraphClass({
          sdl: "type Query { thing: Thing } type Thing { value(n: Int!): Int }",
          resolvers: "getResolvers(this)",
          header: 'import { getResolvers } from "./resolvers.js";',
        }),
        "resolvers.ts":
          "type Thing = { value(): number } & ThisType<{ n: number | undefined }>; type Resolvers = { Query: { thing: () => Thing } }; export const getResolvers = (_subgraph: unknown): Resolvers => ({ Query: { thing: () => ({ value() { return this.n ?? 3; } }) } });",
      }),
    );
    const before = new Map(files);
    const migration = await migrateSubgraph({ dirName: "context", files });
    expect(migration.kind).toBe("refused");
    if (migration.kind !== "refused") throw new Error("not refused");
    expect(migration.refusals[0].reason).toContain(
      "contextual parameter, receiver, or yield types",
    );
    expect(files).toEqual(before);
  });

  it.each(["satisfies", "map", "nested"])(
    "refuses contextual yield typing from %s",
    async (context) => {
      const nested = context === "nested";
      const generator =
        "function* () { const n = yield 1; if (n !== undefined) yield n; }";
      const files = new Map(
        filesOf("context", {
          "index.ts": subgraphClass({
            sdl: nested
              ? "type Query { thing: Thing } type Thing { values: [Int!]! }"
              : "type Query { values: [Int!]! }",
            resolvers: "getResolvers(this)",
            header: 'import { getResolvers } from "./resolvers.js";',
          }),
          "resolvers.ts":
            "type Resolver = () => Generator<number, void, number>; " +
            (context === "satisfies"
              ? `export const getResolvers = (_subgraph: unknown) => ({ Query: { values: (${generator}) satisfies Resolver } });`
              : nested
                ? `type Resolvers = { Query: { thing: () => { values: Resolver } } }; export const getResolvers = (_subgraph: unknown): Resolvers => ({ Query: { thing: () => ({ values: ${generator} }) } });`
                : `type Resolvers = { Query: { values: Resolver } }; export const getResolvers = (_subgraph: unknown): Resolvers => ({ Query: { values: ${generator} } });`),
        }),
      );
      const before = new Map(files);
      const migration = await migrateSubgraph({ dirName: "context", files });
      expect(migration.kind).toBe("refused");
      if (migration.kind !== "refused") throw new Error("not refused");
      expect(migration.refusals[0].reason).toContain("yield types");
      expect(files).toEqual(before);
    },
  );

  it("refuses adding an export beside the factory module's own export *", async () => {
    const files = new Map(
      filesOf("shared", {
        "index.ts": subgraphClass({
          sdl: "type Query { value: Int }",
          resolvers: "getResolvers(this)",
          header: 'import { getResolvers } from "./resolvers.js";',
        }),
        "resolvers.ts":
          'export * from "./other.js"; const value = 7; export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => value } });',
        "other.ts": "export const value = 1;",
      }),
    );
    const before = new Map(files);
    const migration = await migrateSubgraph({ dirName: "shared", files });
    expect(migration.kind).toBe("refused");
    if (migration.kind !== "refused") throw new Error("not refused");
    expect(migration.refusals[0].reason).toContain("export surface");
    expect(files).toEqual(before);
  });

  it.each(["internal", "encoded", "external"])(
    "refuses adding exports to a factory with an %s reader",
    async (reader) => {
      const files = new Map(
        filesOf("shared", {
          "index.ts": subgraphClass({
            sdl: "type Query { value: Int }",
            resolvers: "getResolvers(this)",
            header: 'import { getResolvers } from "./resolvers.js";',
          }),
          "resolvers.ts":
            "const value = 7; export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => value } });",
          ...(reader === "external"
            ? {}
            : {
                "barrel.mjs": `export * from "./${reader === "encoded" ? "%72" : "r"}esolvers.ts"; export * from "./other.ts";`,
                "other.ts": "export const value = 9;",
              }),
        }),
      );
      const before = new Map(files);
      const migration = await migrateSubgraph({
        dirName: "shared",
        files,
        ...(reader === "external" && {
          importedFromOutside: new Set(["subgraphs/shared/resolvers.ts"]),
        }),
      });
      expect(migration.kind).toBe("refused");
      if (migration.kind !== "refused") throw new Error("not refused");
      expect(migration.refusals[0].reason).toContain("export surface");
      expect(files).toEqual(before);
    },
  );

  it("keeps an existing factory export readable after conversion", async () => {
    const files = new Map(
      filesOf("shared", {
        "index.ts": subgraphClass({
          sdl: "type Query { value: Int }",
          resolvers: "getResolvers(this)",
          header: 'import { getResolvers } from "./resolvers.js";',
        }),
        "resolvers.ts":
          "export const value = 7; export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => value } });",
        "barrel.mjs": 'export * from "./resolvers.ts";',
      }),
    );
    const migration = await migrateSubgraph({ dirName: "shared", files });
    expect(migration.kind).toBe("converted");
    if (migration.kind !== "converted") throw new Error("not converted");
    const factory = migration.files.find((file) =>
      file.path.endsWith("/resolvers.ts"),
    );
    expect(
      factory?.after ?? files.get("subgraphs/shared/resolvers.ts"),
    ).toContain("export const value = 7;");
    expect(files.get("subgraphs/shared/barrel.mjs")).toBe(
      'export * from "./resolvers.ts";',
    );
  });

  it.each([
    'import { schema } from "./%73chema.ts"; export const read = schema;',
    'export { schema } from "./%73chema.ts";',
  ])("refuses an encoded static SDL reader: %s", async (reader) => {
    const files = new Map(
      filesOf("encoded", {
        "index.ts": SCAFFOLD_INDEX,
        "schema.ts": SDL_MODULE,
        "resolvers.ts":
          "export const getResolvers = () => ({ Query: { sdlLength: () => 1 } });",
        "reader.mjs": reader,
      }),
    );
    const before = new Map(files);
    const migration = await migrateSubgraph({ dirName: "encoded", files });
    expect(migration.kind).toBe("refused");
    if (migration.kind !== "refused") throw new Error("not refused");
    expect(migration.refusals[0].reason).toContain("percent-encoded path");
    expect(files).toEqual(before);
  });

  it.each(["typeof Date.now", "typeof ({ Date }.Date.now)"])(
    "refuses a retained factory binding that would shadow %s",
    async (expression) => {
      const files = new Map(
        filesOf("shadow", {
          "index.ts": subgraphClass({
            sdl: "type Query { value: Int }",
            resolvers: "getResolvers(this)",
            header: 'import { getResolvers } from "./resolvers.js";',
            members: `readonly nativeDate = ${expression};`,
          }),
          "resolvers.ts":
            'import { boot } from "./bootstrap.js"; const Date = 7; export const getResolvers = (subgraph: { nativeDate: string }) => ({ Query: { value: () => Date + (subgraph.nativeDate === "function" ? 0 : 1) } });',
          "bootstrap.ts": "export const boot = 1;",
        }),
      );
      const before = new Map(files);
      const migration = await migrateSubgraph({ dirName: "shadow", files });
      expect(migration.kind).toBe("refused");
      if (migration.kind !== "refused") throw new Error("not refused");
      expect(migration.refusals[0].reason).toContain("shadow the global Date");
      expect(files).toEqual(before);
    },
  );

  it("refuses to discard a schema module's initialization dependency", async () => {
    const files = new Map(
      filesOf("effects", {
        "index.ts": SCAFFOLD_INDEX,
        "schema.ts": 'import "./bootstrap.js";\n' + SDL_MODULE,
        "resolvers.ts":
          "export const getResolvers = () => ({ Query: { sdlLength: () => 1 } });",
        "bootstrap.ts": "export const boot = 1;",
      }),
    );
    const before = new Map(files);
    const migration = await migrateSubgraph({ dirName: "effects", files });
    expect(migration.kind).toBe("refused");
    if (migration.kind !== "refused") throw new Error("not refused");
    expect(migration.refusals[0].reason).toContain(
      "initialization would be lost",
    );
    expect(files).toEqual(before);
  });

  it.each(CONVERTED.map((row, index) => ({ ...row, index })))(
    "converts $case and serves the same schema",
    async ({
      index,
      sdl,
      resolvers,
      members,
      header,
      files,
      served,
      contains,
      resolved,
    }) => {
      const dirName = `row-${index}`;
      const input = files ?? {
        "index.ts": subgraphClass({
          sdl: sdl!,
          resolvers: resolvers!,
          members,
          header,
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
      for (const { after } of migration.files) {
        if (after === null) continue;
        expect(/\r\n/.test(after)).toBe(/\r\n/.test(indexBefore));
        expect(after.replaceAll("\r\n", "")).not.toContain(
          /\r\n/.test(indexBefore) ? "\n" : "\r",
        );
      }
      const indexAfter = migration.files.find(({ path }) =>
        path.endsWith("/index.ts"),
      )!.after;
      for (const line of contains ?? []) expect(indexAfter).toContain(line);
      mkdirSync(join(dir, "subgraphs", dirName), { recursive: true });
      for (const [path, text] of Object.entries(input)) {
        const target = join(dir, "subgraphs", dirName, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, text);
      }
      writeMigration(dir, migration.files);

      const specifier = `./subgraphs/${dirName}/index.ts` as const;
      const namespace = await importer.importModule({
        packageRoot: dir,
        specifier,
        packageRevision: revision,
      });
      const { subgraphs, diagnostics } = readSubgraphDefinitions(namespace, {
        specifier,
      });
      if (resolved !== undefined) {
        const Constructor = namespace.RowSubgraph as new (args: object) => {
          resolvers: {
            Query: { value: (...args: unknown[]) => number | Iterable<number> };
          };
        };
        const value = new Constructor({}).resolvers.Query.value(
          undefined,
          { n: 3 },
          {},
          {},
        );
        expect(typeof value === "number" ? value : [...value]).toEqual(
          resolved,
        );
      }
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

  it.each([
    'export const read = () => import("./%72esolvers.js");',
    'export const read = () => import("./resolvers.js?legacy");',
    'export const read = () => import("./resolvers.js#legacy");',
    'const path = "./resolvers.js"; export const read = () => import(path);',
    "const path = `./resolvers.js`; export const read = () => import(path);",
    'import { getResolvers } from "@example/package/subgraphs/row/resolvers.js"; export const read = () => getResolvers();',
    'import { getResolvers } from "#subgraphs/row/resolvers.js"; export const read = () => getResolvers();',
    'import { getResolvers } from "@example/subgraphs/subgraphs/row/resolvers.js"; export const read = () => getResolvers();',
  ])("keeps the factory for an internal module reader: %s", async (reader) => {
    const factory =
      "export const getResolvers = () => ({ Query: { sdlLength: () => 1 } });\n";
    const input = new Map(
      filesOf("row", {
        "index.ts": SCAFFOLD_INDEX,
        "schema.ts": SDL_MODULE,
        "resolvers.ts": factory,
        "reader.js": reader,
      }),
    );
    const migration = await migrateSubgraph({ dirName: "row", files: input });
    expect(migration.kind).toBe("converted");
    if (migration.kind !== "converted") throw new Error("not converted");
    for (const file of migration.files) {
      if (file.after === null) input.delete(file.path);
      else input.set(file.path, file.after);
    }
    expect(input.get("subgraphs/row/resolvers.ts")).toBe(factory);
    expect(input.get("subgraphs/row/reader.js")).toBe(reader);
  });

  it("refuses a same-file factory whose entry module has external readers", async () => {
    const migration = await migrateSubgraph({
      dirName: "shared",
      files: new Map(
        filesOf("shared", {
          "index.ts": subgraphClass({
            sdl: "type Query { value: Int }",
            header:
              "export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => 7 } });",
            resolvers: "getResolvers(this)",
          }),
        }),
      ),
      importedFromOutside: new Set(["subgraphs/shared/index.ts"]),
    });
    expect(migration.kind).toBe("refused");
    if (migration.kind !== "refused") throw new Error("not refused");
    expect(migration.refusals[0].reason).toContain(
      "removing the factory could break its exports",
    );
  });

  it.each([
    'import { getResolvers } from "./index.js"; export const read = () => getResolvers({});',
    'export { getResolvers } from "./index.js";',
    'export * from "./index.js";',
    'const path = "./index.js"; export const read = () => import(path);',
    'import { getResolvers } from "@example/package/subgraphs/shared/index.js"; export const read = () => getResolvers({});',
    'import { getResolvers } from "#subgraphs/shared/index.js"; export const read = () => getResolvers({});',
    'import { getResolvers } from "@example/subgraphs/subgraphs/shared/index.js"; export const read = () => getResolvers({});',
  ])(
    "refuses a same-file factory with an internal reader: %s",
    async (reader) => {
      const migration = await migrateSubgraph({
        dirName: "shared",
        files: filesOf("shared", {
          "index.ts": subgraphClass({
            sdl: "type Query { value: Int }",
            header:
              "export const getResolvers = (_subgraph: unknown) => ({ Query: { value: () => 7 } });",
            resolvers: "getResolvers(this)",
          }),
          "reader.ts": reader,
        }),
      });
      expect(migration.kind).toBe("refused");
      if (migration.kind !== "refused") throw new Error("not refused");
      expect(migration.refusals[0].reason).toContain(
        "removing the factory could break its exports",
      );
    },
  );

  it.each(["const marker = () => {};", "function marker() {}"])(
    "keeps factory-local function identities separate for each instance: %s",
    async (declaration) => {
      const dirName = declaration.startsWith("const")
        ? "identity-arrow"
        : "identity-function";
      const input = new Map(
        filesOf(dirName, {
          ...factoryRefusal(`const seen = new WeakSet<() => void>();
export const getResolvers = () => {
  ${declaration}
  return { Query: { sdlLength: () => {
    const repeat = seen.has(marker);
    seen.add(marker);
    return Number(repeat);
  } } };
};`),
        }),
      );
      const migration = await migrateSubgraph({
        dirName,
        files: input,
      });
      expect(migration.kind === "converted" ? [] : migration.refusals).toEqual(
        [],
      );
      if (migration.kind !== "converted") throw new Error("not converted");
      for (const [path, text] of input) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
      }
      writeMigration(dir, migration.files);
      const namespace = await importer.importModule({
        packageRoot: dir,
        specifier: `./subgraphs/${dirName}/index.ts`,
        packageRevision: revision,
      });
      const Constructor = namespace.RowSubgraph as new (args: object) => {
        resolvers: { Query: { sdlLength: () => number } };
      };
      expect([
        new Constructor({}).resolvers.Query.sdlLength(),
        new Constructor({}).resolvers.Query.sdlLength(),
      ]).toEqual([0, 0]);
    },
  );

  it("leaves every converted row type-checking after marking resolver compatibility casts", async () => {
    symlinkSync(
      realpathSync(join(reactorApiDir, "node_modules/graphql-tag")),
      join(dir, "node_modules", "graphql-tag"),
      "junction",
    );
    writeFileSync(
      join(dir, "subgraphs/global.d.ts"),
      'declare module "*.graphql";\n',
    );
    const paths = CONVERTED.map(
      (_, index) => `subgraphs/row-${index}/index.ts`,
    );
    const check = projectTypeErrors(dir, ["subgraphs"], paths);
    expect(check.kind).toBe("checked");
    if (check.kind !== "checked")
      throw new Error("tsc did not check the project");
    writeMigration(
      dir,
      await castResolverTypeErrors(
        dir,
        resolverCallErrors(dir, paths, check.errors),
      ),
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

  it.each([
    'import getResolvers from "./index.js"; export const read = () => getResolvers({});',
    'import { default as read } from "./index.js"; export { read };',
    'export { default as read } from "./index.js";',
  ])("refuses a shared default factory: %s", async (reader) => {
    const migration = await migrateSubgraph({
      dirName: "shared",
      files: filesOf("shared", {
        "index.ts": subgraphClass({
          sdl: "type Query { value: Int }",
          header:
            "export default function getResolvers(_subgraph: unknown) { return { Query: { value: () => 7 } }; }",
          resolvers: "getResolvers(this)",
        }),
        "reader.ts": reader,
      }),
    });
    expect(migration.kind).toBe("refused");
    if (migration.kind !== "refused") throw new Error("not refused");
    expect(migration.refusals[0].reason).toContain(
      "removing the factory could break its exports",
    );
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
      // The resolvers become members; their original import graph stays loaded.
      expect(
        migration.files.map(({ path, after }) => [path, after === null]),
      ).toEqual([
        ["subgraphs/foo/index.ts", false],
        ["subgraphs/foo/schema.ts", false],
      ]);
      writeMigration(dir, migration.files);
      expect(diagnosticsOf(dir)).toBe("");
      const after = tree(join(dir, "subgraphs/foo"));
      expect(after["resolvers.ts"]).toBe(before["resolvers.ts"]);
      expect(after["lib.ts"]).toBe(before["lib.ts"]);
      const index = readFileSync(join(dir, "subgraphs/foo/index.ts"), "utf8");
      expect(index).toContain('static override readonly subgraphName = "foo";');
      expect(index).not.toContain("getResolvers");
      expect(index).not.toContain("#delegate");
    } finally {
      removePackage(dir);
    }
  }, 120_000);
});

/**
 * A resolver factory written the ways real projects write one: values and
 * mutable state before the map, helpers that do and do not read them, a
 * method resolver, a field resolver, __resolveType and an imported module.
 */
const LEDGER: Files = {
  "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
import { getResolvers } from "./resolvers.js";

export class LedgerSubgraph extends BaseSubgraph {
  name = "ledger";
  typeDefs = gql\`
    type Owner { name: String! }
    type Entry { id: ID! amount: Float! owner: Owner }
    union Item = Entry | Owner
    type Query { entries(min: Float): [Entry!]! items: [Item!]! count: Int! label: String! }
    type Mutation { add(amount: Float!, owner: String): Entry! }
  \`;
  resolvers = getResolvers(this);
}
`,
  "resolvers.ts": `import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import { describeOwner } from "./owners.js";

type EntryRecord = { id: string; amount: number; ownerName: string | null };

const PREFIX = "e";

export const getResolvers = (subgraph: BaseSubgraph) => {
  const { reactorClient } = subgraph;
  // The name the ledger reports.
  const label = "ledger";
  let entries: EntryRecord[] = [];
  const nextId = () => \`\${PREFIX}\${entries.length + 1}\`;
  function above(min: number | null | undefined) {
    return entries.filter((entry) => min == null || entry.amount >= min);
  }
  const round = (value: number) => Math.round(value * 100) / 100;

  return {
    Query: {
      entries: (_: unknown, args: { min?: number | null }) =>
        above(args.min).map((entry) => ({ ...entry, amount: round(entry.amount) })),
      items: () => [...entries, { name: describeOwner(label) }],
      count: () => (reactorClient === undefined ? -1 : entries.length),
      label: () => label,
    },
    Mutation: {
      add(_: unknown, args: { amount: number; owner?: string | null }) {
        const entry = { id: nextId(), amount: args.amount, ownerName: args.owner ?? null };
        entries = [...entries, entry];
        return entry;
      },
    },
    Entry: {
      owner: (parent: { id: string }) => {
        const name = entries.find((entry) => entry.id === parent.id)?.ownerName;
        return name == null ? null : { name };
      },
    },
    Item: {
      __resolveType: (value: object) => ("amount" in value ? "Entry" : "Owner"),
    },
  };
};
`,
  "owners.ts": `export const describeOwner = (label: string) => \`owner of \${label}\`;
`,
};

describe("a resolver factory folded into the class", () => {
  let dir: string;
  const importer = new ViteTypeScriptSourceImportAdapter();
  const revision = uncachedDefinitionSourceRevision();

  beforeAll(async () => {
    dir = await subgraphPackage();
    symlinkSync(
      realpathSync(join(reactorApiDir, "node_modules/graphql-tag")),
      join(dir, "node_modules", "graphql-tag"),
      "junction",
    );
  });
  afterAll(async () => {
    await importer.disposeRevision();
    removePackage(dir);
  });

  it("calls each resolver directly, type-checks, and resolves as the schema-first map did", async () => {
    for (const dirName of ["ledger", "ledger-before"]) {
      for (const [path, text] of Object.entries(LEDGER)) {
        mkdirSync(join(dir, "subgraphs", dirName), { recursive: true });
        writeFileSync(join(dir, "subgraphs", dirName, path), text);
      }
    }
    const migration = await migrateSubgraph({
      dirName: "ledger",
      files: new Map([...filesOf("ledger", LEDGER), scalarsIndex]),
    });
    expect(migration.kind !== "converted" ? migration.refusals : []).toEqual(
      [],
    );
    if (migration.kind !== "converted") return;
    expect(
      migration.files.map(({ path, after }) => [path, after === null]),
    ).toEqual([
      ["subgraphs/ledger/index.ts", false],
      ["subgraphs/ledger/resolvers.ts", false],
      ["subgraphs/ledger/schema.ts", false],
    ]);
    writeMigration(dir, migration.files);
    const index = readFileSync(join(dir, "subgraphs/ledger/index.ts"), "utf8");
    for (const line of [
      'import { describeOwner } from "./owners.js";',
      "readonly #reactorClient = this.reactorClient;",
      "#entries: EntryRecord[] = [];",
      "return function above(min: number | null | undefined) {",
      "subgraph.#queryEntries(parent, args)",
      "readonly #queryEntries = (_: unknown, args: { min?: number | null }) =>",
      "resolve: ({ subgraph }) => subgraph.#count(),",
      "resolve: ({ parent, args, subgraph }) => subgraph.#add(parent, args),",
      "  #add(_: unknown, args: { amount: number; owner?: string | null }) {",
      "this.#entries = [...this.#entries, entry];",
      "resolve: ({ parent, subgraph }) => subgraph.#entryOwner(parent),",
      "subgraph.#resolveItemType(value),",
    ]) {
      expect(index).toContain(line);
    }
    const retained = readFileSync(
      join(dir, "subgraphs/ledger/resolvers.ts"),
      "utf8",
    );
    expect(retained).toContain("export type EntryRecord");
    expect(retained).toContain('export const PREFIX = "e";');
    expect(index).toContain(
      '// The name the ledger reports.\nconst label = "ledger";',
    );
    expect(index).not.toContain("getResolvers");
    expect(diagnosticsOf(dir)).toBe("");

    const load = async (dirName: string) => {
      const module = await importer.importModule({
        packageRoot: dir,
        specifier: `./subgraphs/${dirName}/index.ts`,
        packageRevision: revision,
      });
      const Subgraph = module.LedgerSubgraph as new (args: unknown) => {
        readonly resolvers: Record<
          string,
          Record<string, (...args: unknown[]) => unknown>
        >;
      };
      return new Subgraph({ reactorClient: {} });
    };
    const run = async (dirName: string) => {
      const { resolvers } = await load(dirName);
      const call = (type: string, field: string, ...args: unknown[]) =>
        resolvers[type][field](...args);
      return [
        await call(
          "Mutation",
          "add",
          undefined,
          { amount: 5, owner: "ann" },
          {},
          {},
        ),
        await call("Mutation", "add", undefined, { amount: 1.234 }, {}, {}),
        await call("Query", "entries", undefined, { min: 2 }, {}, {}),
        await call("Query", "entries", undefined, {}, {}, {}),
        await call("Query", "items", undefined, {}, {}, {}),
        await call("Query", "count", undefined, {}, {}, {}),
        await call("Query", "label", undefined, {}, {}, {}),
        await call("Entry", "owner", { id: "e1" }, {}, {}, {}),
        await call("Entry", "owner", { id: "e2" }, {}, {}, {}),
        await (resolvers.Item.__resolveType as (...args: unknown[]) => unknown)(
          { amount: 1 },
          {},
          {},
        ),
      ];
    };
    const after = await run("ledger");
    expect(after).toEqual(await run("ledger-before"));
    expect(after[2]).toEqual([{ id: "e1", amount: 5, ownerName: "ann" }]);
    // Each instance keeps its own state, as each getResolvers call did.
    expect(await run("ledger")).toEqual(after);
  }, 240_000);
});

describe("a subgraph whose other files import the SDL", () => {
  it("keeps the SDL in schema-sdl.ts and points those files at it", async () => {
    const migration = await migrateSubgraph({
      dirName: "row",
      files: new Map([
        ...filesOf("row", {
          "index.ts": SCAFFOLD_INDEX,
          "schema.ts": SDL_MODULE,
          "resolvers.ts":
            "export const getResolvers = () => ({ Query: { sdlLength: () => 1 } });\n",
          "tests/schema.test.ts":
            'import { schema } from "../schema.js";\nexport const kinds = schema.definitions.length;\n',
        }),
        scalarsIndex,
      ]),
    });
    expect(migration.kind !== "converted" ? migration.refusals : []).toEqual(
      [],
    );
    if (migration.kind !== "converted") return;
    const after = new Map(
      migration.files.map(({ path, after }) => [path, after]),
    );
    expect(after.get("subgraphs/row/schema-sdl.ts")).toBe(SDL_MODULE);
    expect(after.get("subgraphs/row/tests/schema.test.ts")).toBe(
      'import { schema } from "../schema-sdl.js";\nexport const kinds = schema.definitions.length;\n',
    );
    expect(after.get("subgraphs/row/schema.ts")).not.toContain("gql");
    expect(migration.notes).toEqual([
      expect.stringContaining(
        "subgraphs/row/resolvers.ts is kept to preserve its initialization order",
      ),
      expect.stringContaining(
        "subgraphs/row/schema-sdl.ts keeps the schema-first SDL for subgraphs/row/tests/schema.test.ts",
      ),
    ]);
  });
});
