import { spawnSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { IndentationText, Node, Project, Scope, SyntaxKind } from "ts-morph";
import { afterEach, describe, expect, it } from "vitest";
import {
  migrateSubgraphs,
  migrateSubgraphSourceFile,
  migratedPackageJson,
  resolveManagedDependencies,
} from "@powerhousedao/codegen";
import { cleanUp, packageWith, writeTsconfig } from "./helpers/declarations.js";
import { plainCompile } from "./helpers/workspace.js";

const fixtures = fileURLToPath(
  new URL("./fixtures/migrate-subgraphs/", import.meta.url),
);
const reactorApi = fileURLToPath(
  new URL("../../../packages/reactor-api/", import.meta.url),
);
const fromReactorApi = createRequire(join(reactorApi, "package.json"));
type Served = { typeDefs: unknown; resolvers: object };
type Migrated = {
  new (args: never): Partial<Served> & { onSetup(): Promise<void> };
  [key: symbol]: () => {
    describe(): { typeDefs: unknown; hasSubscriptions: boolean };
    bind(instance: object): { resolvers: object };
  };
};
const legacyArgs = {
  reactorClient: { getDocumentModelModules: () => ({ results: [] }) },
} as never;
const nameAccess =
  "accesses the old name field; update it manually to use subgraphName instead.";
const instanceEscape =
  "uses this as a value (an alias, destructuring, an argument, a return value or a stored value); read members as this.member or update it manually.";
const resolversForm =
  "Resolvers must be an inline resolver map or a resolver factory called as factory(this); update it manually.";
const resolverMapForm =
  "Resolver maps may contain only nested maps, functions, literals and imported or module const values; update it manually.";
const factoryForm =
  "Resolver factories may only read BaseSubgraph services, as in const reactor = subgraph.reactorClient, before returning a resolver map; update it manually.";
const replacedService = (member: string) =>
  `replaces the BaseSubgraph service ${member}, which resolvers may capture; the migrated class builds resolvers after onSetup instead of at construction, so update it manually.`;
const packageReference = (className: string) =>
  `Package code references ${className} outside an import or export, and migration removes its old fields; update it manually.`;
const namespaceUse = (className: string) =>
  `Package code uses a namespace that exposes ${className} other than to read a named member, and migration removes its old fields; update it manually.`;
const relocatedSuper =
  "Resolvers use super, which changes meaning when migration moves them into the static getSchema; update it manually.";
const parameterType = (type: string) =>
  `parameter type ${type} may require an old authoring field; type it as BaseSubgraph or the subgraph class, then run the migration again.`;
const sharedFactory = (className: string) =>
  `${className}'s resolver factory is also used here, outside the classes being migrated; give ${className} its own factory or update it manually.`;
const frozenFactory = (className: string) =>
  `${className}'s resolver factory needs this return type removed, but its file has a subgraph that cannot be migrated; migrate that subgraph first or update ${className} manually.`;
const literalSchema = "gql`type Query { example: String }`";
const legacyHeader =
  'import { BaseSubgraph } from "@powerhousedao/reactor-api";\nimport { gql } from "graphql-tag";\n';
const legacyClass = (
  className: string,
  route: string,
  resolvers = '{ Query: { example: () => "literal" } }',
  members = "",
) =>
  `export class ${className} extends BaseSubgraph {\n  name = "${route}";\n  typeDefs = ${literalSchema};\n  resolvers = ${resolvers};\n${members}}\n`;
const cli = fileURLToPath(new URL("../dist/cli.mjs", import.meta.url));
const temporaryDirectories: string[] = [];
afterEach(async () => {
  cleanUp();
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const readFixture = (path: string) => readFile(join(fixtures, path), "utf8");

async function fixture(name = "released") {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { indentationText: IndentationText.TwoSpaces },
  });
  project.createSourceFile(
    "/subgraphs/example/schema.ts",
    await readFixture("released/schema.ts.txt"),
  );
  const resolvers = project.createSourceFile(
    "/subgraphs/example/resolvers.ts",
    await readFixture("released/resolvers.ts.txt"),
  );
  if (name === "custom")
    project.createSourceFile(
      "/subgraphs/example/extra-resolvers.ts",
      await readFixture("custom/extra-resolvers.ts.txt"),
    );
  const source = await readFixture(`${name}/index.ts.txt`);
  const file = project.createSourceFile("/subgraphs/example/index.ts", source);
  return { project, file, source, resolvers };
}

function textsOf(project: Project) {
  return Object.fromEntries(
    project
      .getSourceFiles()
      .map((file) => [file.getFilePath(), file.getFullText()]),
  );
}

async function migrateInMemory(entry: string, files: Record<string, string>) {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files))
    project.createSourceFile(path, source);
  const outcome = await migrateSubgraphSourceFile(
    project.getSourceFileOrThrow(entry),
  );
  return { outcome, texts: textsOf(project) };
}

async function expectFactoryRefused(
  resolverSource: string,
  line: number,
  message: string,
) {
  const { file, source, resolvers } = await fixture();
  resolvers.replaceWithText(resolverSource);
  expect(await migrateSubgraphSourceFile(file)).toStrictEqual({
    changed: false,
    diagnostics: [{ file: "/subgraphs/example/resolvers.ts", line, message }],
  });
  expect(file.getFullText()).toBe(source);
  expect(resolvers.getFullText()).toBe(resolverSource);
}

async function releasedFiles(edit = (source: string) => source) {
  const files: Record<string, string> = {};
  for (const name of ["index", "schema", "resolvers"])
    files[`subgraphs/example/${name}.ts`] = edit(
      await readFixture(`released/${name}.ts.txt`),
    );
  return files;
}

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "ph-migrate-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function linkServingModules(directory: string) {
  const modules = join(directory, "node_modules");
  await mkdir(join(modules, "@powerhousedao"), { recursive: true });
  await symlink(reactorApi, join(modules, "@powerhousedao", "reactor-api"));
  for (const name of ["graphql", "graphql-tag"])
    await symlink(
      dirname(fromReactorApi.resolve(`${name}/package.json`)),
      join(modules, name),
    );
}

async function servingDirectory() {
  const directory = await temporaryDirectory();
  await linkServingModules(directory);
  await symlink(
    dirname(createRequire(import.meta.url).resolve("typescript/package.json")),
    join(directory, "node_modules", "typescript"),
  );
  await writeFile(join(directory, "package.json"), '{"type":"module"}\n');
  return directory;
}

async function beforeAndAfter(files: Record<string, string>) {
  const before = await servingDirectory();
  const after = await servingDirectory();
  await writeSources(before, files);
  return { before, after, sources: await writeSources(after, files) };
}

function expectCompiles(directory: string) {
  writeTsconfig(
    directory,
    {
      strict: true,
      noImplicitOverride: true,
      noEmit: true,
      emitDeclarationOnly: false,
    },
    ["subgraphs/**/*.ts"],
  );
  const compiled = plainCompile(directory);
  expect(compiled.status, compiled.output).toBe(0);
}

async function expectNoEdits(directory: string, diagnostics: object[] = []) {
  expect(await migrateSubgraphs(directory)).toStrictEqual({
    changedFiles: [],
    diagnostics,
  });
}

function runMigrate(directory: string) {
  return spawnSync(process.execPath, [cli, "migrate", "--subgraphs-only"], {
    cwd: directory,
    encoding: "utf8",
    timeout: 30_000,
  });
}

function serve(subgraph: Served, source: string, contextValue?: object) {
  const { buildSubgraphSchema } = fromReactorApi("@apollo/subgraph") as {
    buildSubgraphSchema: (modules: readonly Served[]) => unknown;
  };
  const { graphql } = fromReactorApi("graphql") as {
    graphql: (request: {
      schema: unknown;
      source: string;
      contextValue?: object;
    }) => Promise<unknown>;
  };
  return graphql({
    schema: buildSubgraphSchema([subgraph]),
    source,
    contextValue,
  });
}

async function exportOf<T>(file: string, name: string) {
  return ((await import(pathToFileURL(file).href)) as Record<string, T>)[name];
}

async function writeSources(directory: string, files: Record<string, string>) {
  const sources = new Map<string, string>();
  for (const [name, source] of Object.entries(files)) {
    const path = join(directory, name);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, source);
    sources.set(path, source);
  }
  return sources;
}

async function expectUnchanged(sources: ReadonlyMap<string, string>) {
  for (const [path, source] of sources)
    expect(await readFile(path, "utf8")).toBe(source);
}

async function serveExport(
  file: string,
  className: string,
  modern: boolean,
  source = "{ example }",
  contextValue?: object,
) {
  const Subgraph = await exportOf<Migrated>(file, className);
  const instance = new Subgraph(legacyArgs);
  await instance.onSetup();
  if (!modern) return serve(instance as Served, source, contextValue);
  const protocol = Subgraph[Symbol.for("powerhouse.subgraph")]();
  return serve(
    {
      typeDefs: protocol.describe().typeDefs,
      resolvers: protocol.bind(instance).resolvers,
    },
    source,
    contextValue,
  );
}

async function expectServedAlike(
  { before, after }: { before: string; after: string },
  file: string,
  className: string,
  expected: unknown,
  {
    query,
    contextValue,
    migrated = true,
  }: { query?: string; contextValue?: object; migrated?: boolean } = {},
) {
  expect(
    await serveExport(
      join(before, file),
      className,
      false,
      query,
      contextValue,
    ),
  ).toEqual(expected);
  expect(
    await serveExport(
      join(after, file),
      className,
      migrated,
      query,
      contextValue,
    ),
  ).toEqual(expected);
}

function mainTemplateSubgraph(
  name: string,
  { custom = false, classTyped = false } = {},
): Record<string, string> {
  const pascal = name.charAt(0).toUpperCase() + name.slice(1);
  const resolverImport = classTyped
    ? `import type { ${pascal}Subgraph } from "./index.js";`
    : `import { type BaseSubgraph${custom ? ", type Context" : ""} } from "@powerhousedao/reactor-api";`;
  return {
    [`subgraphs/${name}/index.ts`]: `
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { schema } from "./schema.js";
import { getResolvers } from "./resolvers.js";

export class ${pascal}Subgraph extends BaseSubgraph {
  name = "${name}";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  ${custom ? 'setupValue = ""; async onSetup() { this.setupValue = String((await this.reactorClient.getDocumentModelModules()).results.length); }' : "async onSetup() {}"}
  async onDisconnect() {}
}
`,
    [`subgraphs/${name}/resolvers.ts`]: `
${resolverImport}

export const getResolvers = (subgraph: ${classTyped ? `${pascal}Subgraph` : "BaseSubgraph"}): Record<string, unknown> => {
  const reactor = subgraph.reactorClient;

  return ({
    Query: {
      ${name}: () => ({}), // namespace resolver for nested queries
    },
    ${pascal}SubgraphQueries: {
      example: async (parent: unknown, args: { driveId: string }${custom ? ", context: Context" : ""}) => {
        return ${custom ? '"example:" + String(context.driveId) + ":" + String(Boolean(reactor))' : '"example"'};
      },
    },
  });
};
`,
    [`subgraphs/${name}/schema.ts`]: `
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql\`
"""
${pascal} Subgraph Queries
"""
type ${pascal}SubgraphQueries {
    example(driveId: String!): String
}

type Query {
    ${name}: ${pascal}SubgraphQueries!
}

\`
`,
  };
}

describe("ph migrate subgraphs", () => {
  it("rewrites an old-major reactor-api peer to the target release pin", () => {
    const packageJson = {
      name: "@acme/subgraphs",
      version: "1.0.0",
      peerDependencies: { "@powerhousedao/reactor-api": "^6.0.0" },
    };
    const managed = resolveManagedDependencies({
      packageJson,
      features: ["subgraph"],
      fullyQualifiedVersion: "7.0.0-dev.1",
      workspacePackageNames: [],
    });

    const migrated = migratedPackageJson(packageJson, managed);

    expect(migrated.peerDependencies?.["@powerhousedao/reactor-api"]).toBe(
      "7.0.0-dev.1",
    );
    expect(migrated.devDependencies?.["@powerhousedao/reactor-api"]).toBe(
      "7.0.0-dev.1",
    );
  });

  for (const name of ["released", "custom", "inline"]) {
    it(`converts the ${name} fixture to the exact class source`, async () => {
      const { file } = await fixture(name);
      expect(await migrateSubgraphSourceFile(file)).toEqual({
        changed: true,
        diagnostics: [],
      });
      expect(file.getFullText()).toBe(
        await readFixture(`${name}/expected.ts.txt`),
      );
    });
  }

  it("removes an unused DocumentNode alias and preserves a still-used type import", async () => {
    const { file, source } = await fixture();
    file.replaceWithText(
      source
        .replaceAll("DocumentNode", "AstDocument")
        .replace(
          "import type { AstDocument }",
          "import type { DocumentNode as AstDocument }",
        ),
    );
    expect((await migrateSubgraphSourceFile(file)).changed).toBe(true);
    expect(file.getFullText()).not.toContain('from "graphql"');

    const retained = await fixture();
    retained.file.replaceWithText(
      retained.source + "\nexport type RetainedDocument = DocumentNode;\n",
    );
    expect((await migrateSubgraphSourceFile(retained.file)).changed).toBe(true);
    expect(retained.file.getFullText()).toContain(
      'import type { DocumentNode } from "graphql";',
    );
    expect(retained.file.getFullText()).toContain(
      "export type RetainedDocument = DocumentNode;",
    );
  });

  it("removes only the released factory's opaque return annotation", async () => {
    const { file, resolvers } = await fixture();
    expect(await migrateSubgraphSourceFile(file)).toEqual({
      changed: true,
      diagnostics: [],
    });
    expect(resolvers.getFullText()).toBe(
      await readFixture("released/expected-resolvers.ts.txt"),
    );
  });

  it("removes the unused DocumentNode import when graphql's types resolve, as in a real project", async () => {
    const directory = packageWith("schema-first");
    await linkServingModules(directory);
    await writeSources(directory, await releasedFiles());

    expect((await migrateSubgraphs(directory)).diagnostics).toEqual([]);

    expect(
      await readFile(join(directory, "subgraphs/example/index.ts"), "utf8"),
    ).toBe(await readFixture("released/expected.ts.txt"));
  }, 60_000);

  it("avoids shadowing existing resolver, SDL and type names", async () => {
    const { file, source } = await fixture();
    file.replaceWithText(
      source
        .replace("import { schema }", "import { schema as schemaBuilder }")
        .replace("= schema;", "= schemaBuilder;") +
        '\nconst s = "user value";\ntype SchemaBuilder = string;\n',
    );
    expect(await migrateSubgraphSourceFile(file)).toEqual({
      changed: true,
      diagnostics: [],
    });
    expect(file.getText()).toContain(
      "getSchema(schemaBuilder_: SchemaBuilder_<ExampleSubgraph>)",
    );
    expect(file.getText()).toContain("typeDefs: schemaBuilder,");
    expect(file.getText()).toContain("resolvers: (s_) => getResolvers(s_)");
    expect(file.getText()).toContain("type SchemaBuilder as SchemaBuilder_");
  });

  it("is a no-op on a second run", async () => {
    const { file } = await fixture();
    expect((await migrateSubgraphSourceFile(file)).changed).toBe(true);
    const migrated = file.getFullText();
    expect(await migrateSubgraphSourceFile(file)).toEqual({
      changed: false,
      diagnostics: [],
    });
    expect(file.getFullText()).toBe(migrated);
  });

  it.each([
    [
      'name = "example";',
      "name = process.env.SUBGRAPH_NAME;",
      "Subgraph name must be a string literal",
    ],
    [
      'name = "example";',
      'name = "Example_API";',
      "not canonical lowercase kebab-case",
    ],
    [
      "typeDefs: DocumentNode = schema;",
      "typeDefs = buildSchema();",
      "Computed typeDefs",
    ],
    [
      "resolvers = getResolvers(this);",
      "resolvers = buildResolvers(this);",
      "Cannot resolve a single static declaration",
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = { ...JSON.parse("{}") };',
      resolverMapForm,
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = { ...getResolvers(this), Extra: { example: () => "extra" } };',
      resolverMapForm,
    ],
    [
      "resolvers = getResolvers(this);",
      "resolvers = { Query: getResolvers(this).Query };",
      resolverMapForm,
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = { Query: { example: () => "x" }, Extra: queries };\nlet queries = {};',
      resolverMapForm,
    ],
    [
      "resolvers = getResolvers(this);",
      "resolvers = getResolvers();",
      resolversForm,
    ],
    [
      "resolvers = getResolvers(this);",
      "resolvers = getResolvers(this as ExampleSubgraph);",
      resolversForm,
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = (() => ({ Query: { example: () => "x" } }))(this.status);',
      resolversForm,
    ],
    [
      "additionalContextFields = {};",
      "additionalContextFields = { user: currentUser() };",
      "additionalContextFields must be a literal or an imported or module const value; update it manually.",
    ],
    [
      "export class ExampleSubgraph extends BaseSubgraph",
      "abstract class SharedBase extends BaseSubgraph {}\nexport class ExampleSubgraph extends SharedBase",
      "Old-style subgraph extends a shared base",
    ],
  ])(
    "reports unsupported input with its location and leaves the file unchanged (%s)",
    async (before, after, message) => {
      const { file, source } = await fixture();
      file.replaceWithText(source.replace(before, after));
      const original = file.getFullText();
      const outcome = await migrateSubgraphSourceFile(file);
      expect(outcome.changed).toBe(false);
      expect(outcome.diagnostics).toHaveLength(1);
      const diagnostic = outcome.diagnostics.at(0);
      expect(diagnostic?.file).toBe("/subgraphs/example/index.ts");
      expect(diagnostic?.message).toContain(message);
      expect(diagnostic?.line).toBeGreaterThan(0);
      expect(file.getFullText()).toBe(original);
    },
  );

  it.each([
    ['let map = { Query: { example: () => "example" } }; return map;', 1],
    [
      'const map = { Query: { example: () => "example" } }; map.Query.example = () => "changed"; return map;',
      1,
    ],
    ["if (Date.now()) return {}; return {};", 1],
    [
      "const captured = (subgraph as any).status; return { Query: { example: () => captured } };",
      1,
    ],
    [
      "const captured = (subgraph as any).reactorClient.label; return { Query: { example: () => captured } };",
      1,
    ],
    [
      "const { label } = (subgraph as any).reactorClient; return { Query: { example: () => label } };",
      1,
    ],
    ['return { ["Query"]: { example: () => "example" } };', 2],
    ["return new Map();", 2],
  ])(
    "reports a dynamic resolver factory without changing its consumer (%s)",
    (body, form) =>
      expectFactoryRefused(
        `export const getResolvers = (subgraph: unknown) => { ${body} };`,
        1,
        form === 1 ? factoryForm : resolverMapForm,
      ),
  );

  it.each([
    ...[
      "subgraph.name",
      'subgraph["name"]',
      "(subgraph).name",
      "subgraph!.name",
      "(subgraph as { name: string }).name",
      "subgraph?.name",
      'subgraph?.["name"]',
    ].map((read) => [
      "subgraph: any",
      `return { Query: { example: () => ${read} } };`,
      nameAccess,
    ]),
    [
      "subgraph: { name: string }",
      "return { Query: { example: () => subgraph.name } };",
      nameAccess,
    ],
    ["subgraph: unknown", 'subgraph.name = "changed"; return {};', nameAccess],
    [
      "subgraph: unknown",
      '({ value: subgraph.name } = { value: "changed" }); return {};',
      nameAccess,
    ],
    [
      "subgraph: unknown",
      'const key = "name"; return { Query: { example: () => subgraph[key] } };',
      "reads an old authoring field dynamically; update it manually.",
    ],
    [
      "subgraph: unknown",
      "const alias = subgraph; return { Query: { example: () => alias.name } };",
      "passes its subgraph parameter dynamically; update it manually.",
    ],
    [
      "subgraph: { name: string }",
      'return { Query: { example: () => "literal" } };',
      parameterType("{ name: string }"),
    ],
  ])(
    "refuses old resolver parameter usage without editing either source (%s) => { %s }",
    (parameter, body, message) =>
      expectFactoryRefused(
        `export const getResolvers = (${parameter}) => { ${body} };\n`,
        1,
        `Resolver factory ${message}`,
      ),
  );

  it.each([
    "type Legacy = { name: string };",
    "interface Legacy { name: string }",
    "type Legacy = BaseSubgraph & { name: string };",
    'class Legacy { name = "required"; }',
  ])(
    "refuses a factory parameter typed by a declared contract without editing either source (%s)",
    (contract) =>
      expectFactoryRefused(
        `import { type BaseSubgraph } from "@powerhousedao/reactor-api";\n${contract}\nexport const getResolvers = (subgraph: Legacy) => ({ Query: { example: () => "literal" } });\n`,
        3,
        `Resolver factory ${parameterType("Legacy")}`,
      ),
  );

  it("refuses a factory that other code in the class file also calls", async () => {
    const files = {
      "/subgraphs/x.ts": `${legacyHeader}const getResolvers = (s: any): Record<string, unknown> => ({ Query: { example: () => "literal" } });
export const custom = getResolvers({});
custom.Extra = { example: () => "custom" };
${legacyClass("X", "x", "getResolvers(this)")}`,
    };
    expect(await migrateInMemory("/subgraphs/x.ts", files)).toStrictEqual({
      outcome: {
        changed: false,
        diagnostics: [
          { file: "/subgraphs/x.ts", line: 4, message: sharedFactory("X") },
        ],
      },
      texts: files,
    });
  });

  it.each([
    [
      "through a tsconfig path",
      "@app/resolvers",
      {
        "tsconfig.json": JSON.stringify({
          compilerOptions: {
            paths: { "@app/resolvers": ["./subgraphs/example/resolvers.ts"] },
          },
        }),
      },
    ],
    ["without a tsconfig", "../subgraphs/example/resolvers.js", {}],
  ])(
    "refuses a factory that package code outside subgraphs/ reaches %s",
    async (_case, specifier, config) => {
      const directory = await temporaryDirectory();
      const sources = await writeSources(directory, {
        ...config,
        "src/custom.ts": `import { getResolvers } from "${specifier}";\n\nexport const custom = getResolvers({} as never);\ncustom.Extra = { example: () => "custom" };\n`,
        ...(await releasedFiles()),
      });
      expect(await migrateSubgraphs(directory)).toStrictEqual({
        changedFiles: [],
        diagnostics: [
          {
            file: join(directory, "src", "custom.ts"),
            line: 3,
            message: sharedFactory("ExampleSubgraph"),
          },
        ],
      });
      await expectUnchanged(sources);
    },
  );

  it("refuses a class whose factory partner was refused for another shared factory", async () => {
    const directory = await temporaryDirectory();
    const imports = `${legacyHeader}import { shared, extra } from "./factories.js";\n`;
    const sources = await writeSources(directory, {
      "subgraphs/factories.ts":
        'export const shared = (s: any) => ({ Query: { example: () => "shared" } });\nexport const extra = (s: any) => ({ Query: { example: () => "extra" } });\n',
      "subgraphs/good.ts":
        imports +
        legacyClass("Good", "good", "extra(this)") +
        legacyClass("Partner", "partner", "shared(this)"),
      "subgraphs/second.ts":
        imports + legacyClass("Second", "second", "shared(this)"),
      "src/custom.ts":
        'import { extra } from "../subgraphs/factories.js";\nexport const value = extra({});\n',
    });
    expect(await migrateSubgraphs(directory)).toStrictEqual({
      changedFiles: [],
      diagnostics: [
        {
          file: join(directory, "src", "custom.ts"),
          line: 2,
          message: sharedFactory("Good"),
        },
        {
          file: join(directory, "subgraphs", "good.ts"),
          line: 12,
          message: sharedFactory("Second"),
        },
      ],
    });
    await expectUnchanged(sources);
  });

  it.each([
    [
      "calls the factory",
      "getResolvers(this)",
      { file: "bad.ts", line: 9, message: sharedFactory("Good") },
    ],
    [
      "does not call the factory",
      '{ Query: { example: () => "bad" } }',
      { file: "bad.ts", line: 4, message: frozenFactory("Good") },
    ],
  ])(
    "leaves a refused subgraph's file and every class using its factory unchanged when the refused class %s",
    async (_case, badResolvers, diagnostic) => {
      const directory = await temporaryDirectory();
      const sources = await writeSources(directory, {
        "subgraphs/bad.ts": `${legacyHeader}
export const getResolvers = (s: any): Record<string, unknown> => ({ Query: { example: () => "literal" } });

${legacyClass("Bad", "Bad", badResolvers)}`,
        "subgraphs/good.ts": `${legacyHeader}import { getResolvers } from "./bad.js";
${legacyClass("Good", "good", "getResolvers(this)")}`,
      });
      const subgraphs = join(directory, "subgraphs");
      expect(await migrateSubgraphs(directory)).toStrictEqual({
        changedFiles: [],
        diagnostics: [
          {
            file: join(subgraphs, "bad.ts"),
            line: 7,
            message:
              'Subgraph name "Bad" is not canonical lowercase kebab-case. Rename it explicitly because it is a public URL.',
          },
          { ...diagnostic, file: join(subgraphs, diagnostic.file) },
        ],
      });
      await expectUnchanged(sources);
    },
  );

  it.each([
    [
      "re-export alias",
      {
        "resolvers.ts":
          'export const getResolvers = (s: any): Record<string, unknown> => ({ Query: { example: () => "literal" } });\n',
        "facade.ts": 'export { getResolvers as make } from "./resolvers.js";\n',
      },
      "make",
    ],
    [
      "star barrel",
      {
        "resolvers.ts":
          'export const getResolvers = (s: any): Record<string, unknown> => ({ Query: { example: () => "literal" } });\n',
        "facade.ts": 'export * from "./resolvers.js";\n',
      },
      "getResolvers",
    ],
    [
      "default function",
      {
        "resolvers.ts":
          'export default function getResolvers(s: any): Record<string, unknown> {\n  return { Query: { example: () => "literal" } };\n}\n',
        "facade.ts":
          'export { default as getResolvers } from "./resolvers.js";\n',
      },
      "getResolvers",
    ],
    [
      "default assignment",
      {
        "resolvers.ts":
          'const getResolvers = (s: any): Record<string, unknown> => ({ Query: { example: () => "literal" } });\nexport default getResolvers;\n',
        "facade.ts":
          'export { default as getResolvers } from "./resolvers.js";\n',
      },
      "getResolvers",
    ],
  ])(
    "converts two classes sharing a factory through a %s, serves the same result and repeats without edits",
    async (_layout, factoryFiles, binding) => {
      const legacy = (className: string, route: string) =>
        `${legacyHeader}import { ${binding} } from "./facade.js";\n${legacyClass(className, route, `${binding}(this)`)}`;
      const directories = await beforeAndAfter({
        ...Object.fromEntries(
          Object.entries(factoryFiles).map(([name, source]) => [
            `subgraphs/${name}`,
            source,
          ]),
        ),
        "subgraphs/first.ts": legacy("First", "first"),
        "subgraphs/second.ts": legacy("Second", "second"),
        "subgraphs/index.ts":
          'export * as FirstNamespace from "./first.js";\nexport * as SecondNamespace from "./second.js";\n',
      });
      const { after } = directories;
      const result = await migrateSubgraphs(after);
      expect(result.diagnostics).toStrictEqual([]);
      expect(result.changedFiles).toContain(
        join(after, "subgraphs", "resolvers.ts"),
      );
      expect(
        await readFile(join(after, "subgraphs", "resolvers.ts"), "utf8"),
      ).not.toContain("Record<string, unknown>");
      for (const className of ["First", "Second"])
        await expectServedAlike(
          directories,
          `subgraphs/${className.toLowerCase()}.ts`,
          className,
          { data: { example: "literal" } },
        );
      expectCompiles(after);
      await expectNoEdits(after);
    },
    60_000,
  );

  it("converts two classes sharing one factory in one file and repeats without edits", async () => {
    const directories = await beforeAndAfter({
      "subgraphs/pair.ts": `${legacyHeader}const getResolvers = (s: any): Record<string, unknown> => ({ Query: { example: () => "literal" } });
${legacyClass("First", "first", "getResolvers(this)")}${legacyClass("Second", "second", "getResolvers(this)")}`,
    });
    const { after } = directories;
    const pair = join(after, "subgraphs", "pair.ts");
    expect(await migrateSubgraphs(after)).toStrictEqual({
      changedFiles: [pair],
      diagnostics: [],
    });
    expect(await readFile(pair, "utf8")).not.toContain(
      "Record<string, unknown>",
    );
    for (const className of ["First", "Second"])
      await expectServedAlike(directories, "subgraphs/pair.ts", className, {
        data: { example: "literal" },
      });
    expectCompiles(after);
    await expectNoEdits(after);
  }, 60_000);

  it.each([
    [
      'readPublic() { return getResolvers({ name: "public" }).Query.example(); }',
    ],
    ["readBad(bad: any) { return getResolvers(bad).Query.example(); }"],
  ])(
    "refuses a factory that reads name when the class also calls it elsewhere (%s)",
    async (method) => {
      const files = {
        "/subgraphs/good.ts": `${legacyHeader}const getResolvers = (s: any) => ({ Query: { example: () => s.name } });
${legacyClass("Good", "good", "getResolvers(this)", `  ${method}\n`)}`,
        "/subgraphs/bad.ts": `${legacyHeader}${legacyClass("Bad", "Bad", "{ Query: { example: () => this.name } }")}`,
      };
      expect(await migrateInMemory("/subgraphs/good.ts", files)).toStrictEqual({
        outcome: {
          changed: false,
          diagnostics: [
            {
              file: "/subgraphs/good.ts",
              line: 3,
              message: `Resolver factory ${nameAccess}`,
            },
          ],
        },
        texts: files,
      });
    },
  );

  it.each([
    [
      'const getResolvers = (s: any): Record<string, unknown> => ({ Query: { example: () => "x" } });\nexport default getResolvers;\n',
      'const getResolvers = (s: any) => ({ Query: { example: () => "x" } });\nexport default getResolvers;\n',
    ],
    [
      'const getResolvers = (s: any) => ({ Query: { example: () => "x" } })\nexport default getResolvers\n',
      'const getResolvers = (s: any) => ({ Query: { example: () => "x" } })\nexport default getResolvers\n',
    ],
  ])(
    "converts a default-export assignment factory and edits it only to remove an opaque return annotation (%s)",
    async (before, after) => {
      const { outcome, texts } = await migrateInMemory("/subgraphs/x.ts", {
        "/subgraphs/resolvers.ts": before,
        "/subgraphs/x.ts": `${legacyHeader}import getResolvers from "./resolvers.js";\n${legacyClass("X", "x", "getResolvers(this)")}`,
      });
      expect(outcome).toStrictEqual({ changed: true, diagnostics: [] });
      expect(texts["/subgraphs/resolvers.ts"]).toBe(after);
      expect(texts["/subgraphs/x.ts"]).toContain(
        "resolvers: (s) => getResolvers(s),",
      );
    },
  );

  it("refuses a legacy class behind an imported shared base", async () => {
    const { project, file, source } = await fixture();
    project.createSourceFile(
      "/subgraphs/base.ts",
      'import { BaseSubgraph } from "@powerhousedao/reactor-api";\nexport abstract class SharedBase extends BaseSubgraph {}\n',
    );
    const original =
      'import { SharedBase } from "../base.js";\n' +
      source.replace("extends BaseSubgraph", "extends SharedBase");
    file.replaceWithText(original);
    const outcome = await migrateSubgraphSourceFile(file);
    expect(outcome.changed).toBe(false);
    expect(outcome.diagnostics).toStrictEqual([
      {
        file: "/subgraphs/example/index.ts",
        line: 7,
        message:
          "Old-style subgraph extends a shared base; update its inherited fields and schema manually.",
      },
    ]);
    expect(file.getFullText()).toBe(original);
  });

  it.each([
    ['getResolvers({ name: "other" })', "subgraph"],
    ["getResolvers({}, this)", "options, subgraph"],
  ])(
    "refuses a resolver factory whose receiver cannot be identified (%s)",
    async (call, parameters) => {
      const { file, source, resolvers } = await fixture();
      const original = source.replace("getResolvers(this)", call);
      file.replaceWithText(original);
      const resolverSource = `export const getResolvers = (${parameters}) => ({ Query: { example: () => subgraph.name } });\n`;
      resolvers.replaceWithText(resolverSource);
      expect(await migrateSubgraphSourceFile(file)).toStrictEqual({
        changed: false,
        diagnostics: [
          {
            file: "/subgraphs/example/index.ts",
            line: 9,
            message: resolversForm,
          },
        ],
      });
      expect(file.getFullText()).toBe(original);
      expect(resolvers.getFullText()).toBe(resolverSource);
    },
  );

  it.each<[string, string, number, string]>([
    ...[
      "this.name",
      'this["name"]',
      "(this).name",
      '(this)["name"]',
      "this!.name",
      "(this as ExampleSubgraph).name",
      "(this satisfies ExampleSubgraph).name",
      "(<ExampleSubgraph>this).name",
      "this?.name",
      'this?.["name"]',
    ].map((read): [string, string, number, string] => [
      "resolvers = getResolvers(this);",
      `resolvers = { Query: { example: () => ${read} } };`,
      9,
      nameAccess,
    ]),
    [
      "async onSetup() {}",
      "async onSetup() { console.log((this as ExampleSubgraph)!.name); }",
      11,
      nameAccess,
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = { Query: { example: () => this[process.env.KEY ?? "name"] } };',
      9,
      "reads an old authoring field dynamically; update it manually.",
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = { Query: { example: () => (this as any)[process.env.KEY ?? "name"] } };',
      9,
      "reads an old authoring field dynamically; update it manually.",
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = { Query: { example: () => (this.name = "changed") } };',
      9,
      nameAccess,
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = { Query: { example: () => ((this as any).name = "changed") } };',
      9,
      nameAccess,
    ],
    [
      "resolvers = getResolvers(this);",
      'resolvers = { Query: { example: () => this!["typeDefs"] } };',
      9,
      "reads or writes an old authoring field; update it manually.",
    ],
    ...[
      "{ const self = this; return self.name; }",
      "{ const { name } = this; return name; }",
      "readName(this)",
      "new Reader(this)",
      "(this as ExampleSubgraph)!",
      "{ cache.set(this, true); return null; }",
    ].map((resolve): [string, string, number, string] => [
      "resolvers = getResolvers(this);",
      `resolvers = { Query: { example: () => ${resolve} } };`,
      9,
      instanceEscape,
    ]),
    ...[
      "async onSetup() { const self = this; this.label = String(self.name); }",
      "async onSetup() { registry.current = this; }",
      "self() { return this; }",
    ].map((member): [string, string, number, string] => [
      "async onSetup() {}",
      member,
      11,
      instanceEscape,
    ]),
    ...[
      "async onSetup() { this.reactorClient = { ...this.reactorClient }; }",
      "async onSetup() { for (this.reactorClient of [this.reactorClient]) {} }",
      "async onSetup() { for ((this as any).reactorClient in {}) {} }",
      "async onSetup() { (this as any).reactorClient++; }",
      "async onSetup() { --(this as any).reactorClient; }",
    ].map((member): [string, string, number, string] => [
      "async onSetup() {}",
      member,
      11,
      replacedService("reactorClient"),
    ]),
  ])(
    "refuses old instance field access without editing any source (%s → %s)",
    async (before, after, line, message) => {
      const { project, file, source } = await fixture();
      file.replaceWithText(source.replace(before, after));
      const original = textsOf(project);
      expect(await migrateSubgraphSourceFile(file)).toStrictEqual({
        changed: false,
        diagnostics: [
          {
            file: "/subgraphs/example/index.ts",
            line,
            message: `Instance code ${message}`,
          },
        ],
      });
      expect(textsOf(project)).toStrictEqual(original);
    },
  );

  it.each([
    [
      "Bad",
      [
        {
          file: "bad.ts",
          line: 6,
          message:
            'Subgraph name "Bad" is not canonical lowercase kebab-case. Rename it explicitly because it is a public URL.',
        },
        {
          file: "resolvers.ts",
          line: 2,
          message: `Resolver factory ${nameAccess}`,
        },
      ],
    ],
    [
      "bad",
      [
        {
          file: "resolvers.ts",
          line: 2,
          message: `Resolver factory ${nameAccess}`,
        },
      ],
    ],
  ])(
    "refuses a shared, publicly exported factory that reads name and leaves every caller working (Bad named %s)",
    async (badName, diagnostics) => {
      const directory = await servingDirectory();
      const subgraphs = join(directory, "subgraphs");
      const legacy = (className: string, name: string) =>
        `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

export class ${className} extends BaseSubgraph {
  name = "${name}";
  typeDefs = schema;
  resolvers = getResolvers(this);
}
`;
      const sources = await writeSources(directory, {
        "subgraphs/resolvers.ts":
          "export const getResolvers = (subgraph: { name: string }) => ({\n  Query: { example: () => subgraph.name },\n});\n",
        "subgraphs/schema.ts":
          'import { gql } from "graphql-tag";\n\nexport const schema = gql`\n  type Query {\n    example: String\n  }\n`;\n',
        "subgraphs/good.ts": legacy("Good", "good"),
        "subgraphs/bad.ts": legacy("Bad", badName),
        "subgraphs/index.ts":
          'export * from "./good.js";\nexport * from "./bad.js";\nexport { getResolvers } from "./resolvers.js";\n',
        "public.ts": 'export { getResolvers } from "./subgraphs/index.js";\n',
        "consumer.ts":
          'import { getResolvers } from "./public.js";\n\nexport const value = getResolvers({ name: "public" }).Query.example();\n',
      });

      expect(await migrateSubgraphs(directory)).toStrictEqual({
        changedFiles: [],
        diagnostics: diagnostics.map((diagnostic) => ({
          ...diagnostic,
          file: join(subgraphs, diagnostic.file),
        })),
      });
      await expectUnchanged(sources);
      expect(await exportOf(join(directory, "consumer.ts"), "value")).toBe(
        "public",
      );
      const Bad = await exportOf<new (args: never) => Served>(
        join(subgraphs, "bad.ts"),
        "Bad",
      );
      expect(await serve(new Bad(legacyArgs), "{ example }")).toEqual({
        data: { example: badName },
      });
    },
    60_000,
  );

  it("leaves every class in a file unchanged when any class cannot convert", async () => {
    const { file, source, resolvers } = await fixture();
    const originalResolvers = resolvers.getFullText();
    file.replaceWithText(
      source +
        '\nexport class InvalidSubgraph extends BaseSubgraph { name = "Bad"; typeDefs = schema; resolvers = getResolvers(this); }\n',
    );
    const original = file.getFullText();
    expect((await migrateSubgraphSourceFile(file)).changed).toBe(false);
    expect(file.getFullText()).toBe(original);
    expect(resolvers.getFullText()).toBe(originalResolvers);
  });

  it("writes the converted class and inferred resolver factory while preserving schema text", async () => {
    const directory = await temporaryDirectory();
    await writeSources(directory, await releasedFiles());
    const target = join(directory, "subgraphs", "example");
    expect(await migrateSubgraphs(directory)).toStrictEqual({
      changedFiles: [join(target, "index.ts"), join(target, "resolvers.ts")],
      diagnostics: [],
    });
    expect(await readFile(join(target, "index.ts"), "utf8")).toBe(
      await readFixture("released/expected.ts.txt"),
    );
    expect(await readFile(join(target, "schema.ts"), "utf8")).toBe(
      await readFixture("released/schema.ts.txt"),
    );
    expect(await readFile(join(target, "resolvers.ts"), "utf8")).toBe(
      await readFixture("released/expected-resolvers.ts.txt"),
    );
    await expectNoEdits(directory);
  });

  it("preserves the released namespace and adds a checked class export", async () => {
    const directory = await temporaryDirectory();
    await writeSources(directory, {
      ...(await releasedFiles()),
      "subgraphs/index.ts": `/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
export * as ExampleSubgraph from "./example/index.js";
export * as Helpers from "./example/schema.js";
`,
    });
    const barrel = join(directory, "subgraphs", "index.ts");

    const result = await migrateSubgraphs(directory);

    expect(result.diagnostics).toEqual([]);
    expect(result.changedFiles).toContain(barrel);
    expect(await readFile(barrel, "utf8"))
      .toBe(`import type { SubgraphCheck } from "@powerhousedao/reactor-api";
import { ExampleSubgraph as ExampleExampleSubgraph } from "./example/index.js";

export * as ExampleSubgraph from "./example/index.js";
export * as Helpers from "./example/schema.js";

export { ExampleExampleSubgraph };
const checkExampleExampleSubgraph: SubgraphCheck<
  typeof ExampleExampleSubgraph
> = true;
void checkExampleExampleSubgraph;
`);
    await expectNoEdits(directory);
  }, 60_000);

  it("runs the built ph migrate --subgraphs-only command without a registry or package upgrade", async () => {
    const directory = await temporaryDirectory();
    await writeSources(directory, await releasedFiles());
    const first = runMigrate(directory);
    expect(first.status, first.stdout + first.stderr).toBe(0);
    expect(first.stdout).toContain("Migrated subgraph");
    expect(
      await readFile(join(directory, "subgraphs/example/index.ts"), "utf8"),
    ).toBe(await readFixture("released/expected.ts.txt"));
    const second = runMigrate(directory);
    expect(second.status, second.stdout + second.stderr).toBe(0);
    expect(second.stdout).not.toContain("Migrated subgraph");
  }, 60_000);

  it("rejects dynamic resolvers through the built migrate command without writing sources", async () => {
    const directory = await temporaryDirectory();
    const sources = await writeSources(directory, {
      ...(await releasedFiles()),
      "subgraphs/example/resolvers.ts":
        "export const getResolvers = (subgraph: unknown) => { let map = {}; return map; };\n",
    });
    const result = runMigrate(directory);
    expect(result.status, result.stdout + result.stderr).toBe(1);
    expect(result.stdout + result.stderr).toContain(
      `${join(directory, "subgraphs/example/resolvers.ts")}:1: ${factoryForm}`,
    );
    await expectUnchanged(sources);
  }, 60_000);

  it("converts the released template into a class that compiles and serves the same result", async () => {
    const directory = packageWith("schema-first");
    await linkServingModules(directory);
    const target = (root: string) =>
      join(directory, root, "subgraphs", "example");
    for (const root of ["released", "."])
      await writeSources(join(directory, root), await releasedFiles());

    expect(await migrateSubgraphs(directory)).toStrictEqual({
      changedFiles: [
        join(target("."), "index.ts"),
        join(target("."), "resolvers.ts"),
      ],
      diagnostics: [],
    });
    await expectNoEdits(directory);
    expectCompiles(directory);

    const { print } = fromReactorApi("graphql") as {
      print: (document: unknown) => string;
    };
    const Released = await exportOf<new (args: never) => Served>(
      join(target("released"), "index.ts"),
      "ExampleSubgraph",
    );
    const released = new Released(legacyArgs);
    const Migrated = await exportOf<Migrated>(
      join(target("."), "index.ts"),
      "ExampleSubgraph",
    );
    const protocol = Migrated[Symbol.for("powerhouse.subgraph")]();
    const described = protocol.describe();
    const served = {
      typeDefs: described.typeDefs,
      resolvers: protocol.bind(new Migrated(legacyArgs)).resolvers,
    };
    const query = '{ example { example(driveId: "d") } }';
    expect(print(served.typeDefs)).toBe(print(released.typeDefs));
    expect(described.hasSubscriptions).toBe(false);
    expect(await serve(released, query)).toEqual({
      data: { example: { example: "example" } },
    });
    expect(await serve(served, query)).toEqual({
      data: { example: { example: "example" } },
    });

    await writeFile(
      join(target("."), "resolvers.ts"),
      await readFixture("released/resolvers.ts.txt"),
    );
    const opaque = plainCompile(directory);
    expect(opaque.status, opaque.output).toBe(1);
    expect(opaque.output).toContain("TS2322");
    expect(opaque.output).toContain("Record<string, unknown>");
  }, 60_000);

  it("converts a factory that already reads subgraphName and serves the route name", async () => {
    const directory = await servingDirectory();
    await writeSources(
      directory,
      await releasedFiles((source) =>
        source.replace('return "example";', "return subgraph.subgraphName;"),
      ),
    );
    expect((await migrateSubgraphs(directory)).diagnostics).toStrictEqual([]);
    expect(
      await serveExport(
        join(directory, "subgraphs/example/index.ts"),
        "ExampleSubgraph",
        true,
        '{ example { example(driveId: "d") } }',
      ),
    ).toEqual({ data: { example: { example: "example" } } });
  }, 60_000);

  it.each([
    [
      "an immediately called inline initializer",
      "",
      "resolvers = (() => { const captured = this.status; return { Query: { example: () => captured } }; })();",
      'async onSetup() { this.status = "ready"; }',
      8,
      resolversForm,
    ],
    [
      "an immediately called function in a factory",
      "const getResolvers = (s: any) => { const captured = (() => s.status)(); return { Query: { example: () => captured } }; };",
      "resolvers = getResolvers(this);",
      'async onSetup() { this.status = "ready"; }',
      3,
      factoryForm,
    ],
    [
      "a local function a factory calls",
      "const getResolvers = (s: any) => { function capture() { return s.status; } const captured = capture(); return { Query: { example: () => captured } }; };",
      "resolvers = getResolvers(this);",
      'async onSetup() { this.status = "ready"; }',
      3,
      factoryForm,
    ],
    [
      "a captured service that setup replaces",
      'const getResolvers = (s: BaseSubgraph) => { const captured = s.reactorClient; return { Query: { example: () => (captured === s.reactorClient ? "same" : "different") } }; };',
      "resolvers = getResolvers(this);",
      "async onSetup() { this.reactorClient = { ...this.reactorClient }; }",
      9,
      `Instance code ${replacedService("reactorClient")}`,
    ],
    [
      "a captured service that setup replaces in a for-of head",
      'const getResolvers = (s: BaseSubgraph) => { const captured = s.reactorClient; return { Query: { example: () => (captured === s.reactorClient ? "same" : "different") } }; };',
      "resolvers = getResolvers(this);",
      "async onSetup() { for (this.reactorClient of [{ ...this.reactorClient }]) {} }",
      9,
      `Instance code ${replacedService("reactorClient")}`,
    ],
    [
      "a captured service that setup replaces through a cast",
      "const getResolvers = (s: BaseSubgraph) => { const captured = s.reactorClient; return { Query: { example: () => String((captured as any).label) } }; };",
      "resolvers = getResolvers(this);",
      'async onSetup() { this.reactorClient = { label: "ready" } as any; }',
      9,
      `Instance code ${replacedService("reactorClient")}`,
    ],
    [
      "an eager read beneath a service",
      "const getResolvers = (s: BaseSubgraph) => { const captured = (s.reactorClient as any).label; return { Query: { example: () => String(captured) } }; };",
      "resolvers = getResolvers(this);",
      'async onSetup() { (this.reactorClient as any).label = "ready"; }',
      3,
      factoryForm,
    ],
    ...["getResolvers()", "getResolvers(this)"].flatMap(
      (call): [string, string, string, string, number, string][] => [
        [
          `a mutable module binding captured by ${call}`,
          'let status = "constructed"; const getResolvers = () => { const captured = status; return { Query: { example: () => captured } }; };',
          `resolvers = ${call};`,
          'async onSetup() { status = "ready"; }',
          call === "getResolvers()" ? 8 : 3,
          call === "getResolvers()" ? resolversForm : factoryForm,
        ],
        [
          `a side effect in ${call}`,
          'let status = "constructed"; const getResolvers = () => { status = "factory"; return { Query: { example: () => status } }; };',
          `resolvers = ${call};`,
          'async onSetup() { status = "setup"; }',
          call === "getResolvers()" ? 8 : 3,
          call === "getResolvers()" ? resolversForm : factoryForm,
        ],
      ],
    ),
    [
      "a factory parameter typed by another class",
      'class Contract { name = "required"; } const getResolvers = (s: Contract) => ({ Query: { example: () => "literal" } });',
      "resolvers = getResolvers(this);",
      "",
      3,
      `Resolver factory ${parameterType("Contract")}`,
    ],
    [
      "an optional factory call",
      'const getResolvers = (s: any) => ({ Query: { example: () => "literal" } });',
      "resolvers = getResolvers?.(this);",
      "",
      8,
      resolversForm,
    ],
    [
      "an inline resolver that uses the class's super",
      "",
      'resolvers = { Query: { example: () => (super.toString().startsWith("[object") ? "object" : "function") } };',
      "",
      8,
      relocatedSuper,
    ],
    [
      "an inline resolver that calls an inherited helper through super",
      "",
      'resolvers = { Query: { example: async () => String(await super.servesDocument("", {} as never)) } };',
      "",
      8,
      relocatedSuper,
    ],
  ])(
    "refuses %s without editing the source",
    async (_case, helper, resolvers, setup, line, message) => {
      const files = {
        "/subgraphs/x.ts": `${legacyHeader}${helper}\nexport class X extends BaseSubgraph {\n  name = "x";\n  typeDefs = ${literalSchema};\n  status = "constructed";\n  ${resolvers}\n  ${setup}\n}\n`,
      };
      expect(await migrateInMemory("/subgraphs/x.ts", files)).toStrictEqual({
        outcome: {
          changed: false,
          diagnostics: [{ file: "/subgraphs/x.ts", line, message }],
        },
        texts: files,
      });
    },
  );

  it("converts a resolver method whose super is its own object's, compiles and serves the same result", async () => {
    const directories = await beforeAndAfter({
      "subgraphs/x.ts": `${legacyHeader}${legacyClass("X", "x", "{ Query: { example() { return super.toString(); } } }")}`,
    });
    const { after } = directories;
    expect(await migrateSubgraphs(after)).toStrictEqual({
      changedFiles: [join(after, "subgraphs", "x.ts")],
      diagnostics: [],
    });
    expectCompiles(after);
    await expectServedAlike(directories, "subgraphs/x.ts", "X", {
      data: { example: "[object Undefined]" },
    });
    await expectNoEdits(after);
  }, 60_000);

  it.each([
    ["directly", "return new B({ reactorClient: {} } as never).name;", ""],
    ...[
      "class View {\n  name?: string;\n}",
      "interface View {\n  name?: string;\n}",
      "type View = { name?: string };",
    ].map((contract) => [
      `through a structural ${contract.split(" ")[0]}`,
      "const view: View = new B({ reactorClient: {} } as never); return view.name;",
      contract,
    ]),
  ])(
    "refuses a class that other package code constructs (%s), and converts the rest with the same result",
    async (_case, body, contract) => {
      const directories = await beforeAndAfter({
        "subgraphs/a.ts": `${legacyHeader}import { readName } from "../src/consumer.js";\n${legacyClass("A", "a", "{ Query: { example: () => readName() } }")}`,
        "subgraphs/b.ts": `${legacyHeader}${legacyClass("B", "b")}`,
        "src/consumer.ts": `import { B } from "../subgraphs/b.js";\n\nexport function readName() {\n  ${body}\n}\n${contract}\n`,
      });
      const { after, sources } = directories;
      sources.delete(join(after, "subgraphs", "a.ts"));
      expect(await migrateSubgraphs(after)).toStrictEqual({
        changedFiles: [join(after, "subgraphs", "a.ts")],
        diagnostics: [
          {
            file: join(after, "src", "consumer.ts"),
            line: 4,
            message: packageReference("B"),
          },
        ],
      });
      await expectUnchanged(sources);
      await expectServedAlike(directories, "subgraphs/a.ts", "A", {
        data: { example: "b" },
      });
    },
    60_000,
  );

  it.each([
    [
      "a type annotation",
      "export const label = (value: B) => value.subgraphName;",
      2,
    ],
    ["a type query", "export type Constructor = typeof B;", 2],
    [
      "instanceof",
      "export const isB = (value: unknown) => value instanceof B;",
      2,
    ],
    ["a stored value", "export const subgraphs = [B];", 2],
    ["an argument", "export const registered = new Set([B]);", 2],
    [
      "an aliased import",
      'export { B as Renamed } from "../subgraphs/b.js";\nimport { B as Alias } from "../subgraphs/b.js";\nexport const made = new Alias({} as never);',
      4,
    ],
    [
      "a namespace import",
      'import * as subgraphs from "../subgraphs/b.js";\nexport const made = new subgraphs.B({} as never);',
      3,
    ],
  ])(
    "refuses a class that package code references through %s without editing any source",
    async (_case, use, line) => {
      const files = {
        "/subgraphs/b.ts": `${legacyHeader}${legacyClass("B", "b")}`,
        "/src/consumer.ts": `import { B } from "../subgraphs/b.js";\n${use}\n`,
      };
      expect(await migrateInMemory("/subgraphs/b.ts", files)).toStrictEqual({
        outcome: {
          changed: false,
          diagnostics: [
            {
              file: "/src/consumer.ts",
              line,
              message: packageReference("B"),
            },
          ],
        },
        texts: files,
      });
    },
  );

  it("converts a class that package code reaches only through imports, exports and its factory's parameter type", async () => {
    const others = {
      "/subgraphs/resolvers.ts":
        'import type { B } from "./b.js";\nexport const getResolvers = (subgraph: B) => ({ Query: { example: () => subgraph.subgraphName } });\n',
      "/subgraphs/index.ts":
        'export * from "./b.js";\nexport { B as Renamed } from "./b.js";\n',
      "/src/public.ts":
        'import Default, { B } from "../subgraphs/b.js";\nexport { B, Default };\n',
      "/src/route.ts":
        'import type { BaseSubgraph } from "@powerhousedao/reactor-api";\nexport const route = (subgraph: BaseSubgraph) => subgraph.path;\n',
    };
    const {
      outcome,
      texts: { "/subgraphs/b.ts": migrated, ...rest },
    } = await migrateInMemory("/subgraphs/b.ts", {
      "/subgraphs/b.ts": `${legacyHeader}import { getResolvers } from "./resolvers.js";\n${legacyClass("B", "b", "getResolvers(this)")}export default B;\n`,
      ...others,
    });
    expect(outcome).toStrictEqual({ changed: true, diagnostics: [] });
    expect(migrated).toContain("resolvers: (s) => getResolvers(s),");
    expect(rest).toStrictEqual(others);
  });

  it("captures exactly the public services the BaseSubgraph constructor assigns", () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const base = project
      .addSourceFileAtPath(join(reactorApi, "src/graphql/base-subgraph.ts"))
      .getClassOrThrow("BaseSubgraph");
    const assigned = base
      .getConstructors()
      .flatMap((constructor) =>
        constructor.getDescendantsOfKind(SyntaxKind.BinaryExpression),
      )
      .filter(
        (assignment) =>
          assignment.getOperatorToken().getKind() === SyntaxKind.EqualsToken,
      )
      .map((assignment) => assignment.getLeft())
      .filter(
        (target) =>
          Node.isPropertyAccessExpression(target) &&
          target.getExpression().getKind() === SyntaxKind.ThisKeyword &&
          !target.getName().startsWith("#") &&
          base.getProperty(target.getName())?.getScope() === Scope.Public,
      )
      .map((target) => target.getText().replace("this.", ""));
    const captured = project
      .addSourceFileAtPath(
        fileURLToPath(
          new URL(
            "../../../packages/codegen/src/codegen/migrate-subgraphs.ts",
            import.meta.url,
          ),
        ),
      )
      .getVariableDeclarationOrThrow("constructedMembers")
      .getInitializerOrThrow()
      .getDescendantsOfKind(SyntaxKind.StringLiteral)
      .map((literal) => literal.getLiteralText());
    expect(captured.toSorted()).toStrictEqual(assigned.toSorted());
    expect(captured).toStrictEqual([
      "reactorClient",
      "http",
      "graphqlManager",
      "relationalDb",
      "syncManager",
      "documentPermissionService",
      "authorizationService",
      "syncServingGate",
      "credentials",
    ]);
  });

  it.each([false, true])(
    "converts a four-subgraph package from main's templates (customized: %s), compiles, serves the same results and repeats without edits",
    async (customized) => {
      const names = ["alpha", "billing", "custom", "delta"];
      const files: Record<string, string> = {
        "subgraphs/index.ts": names
          .map(
            (name) => `export * as ${name}Namespace from "./${name}/index.js";`,
          )
          .join("\n"),
      };
      for (const name of names)
        Object.assign(
          files,
          mainTemplateSubgraph(name, {
            custom: customized && name === "custom",
          }),
        );
      const directories = await beforeAndAfter(files);
      const { after } = directories;
      const first = await migrateSubgraphs(after);
      expect(first.diagnostics).toStrictEqual([]);
      expect(first.changedFiles).toHaveLength(9);
      expectCompiles(after);
      for (const name of names) {
        const pascal = name.charAt(0).toUpperCase() + name.slice(1);
        await expectServedAlike(
          directories,
          `subgraphs/${name}/index.ts`,
          `${pascal}Subgraph`,
          {
            data: {
              [name]: {
                example:
                  customized && name === "custom"
                    ? "example:request-drive:true"
                    : "example",
              },
            },
          },
          {
            query: `{ ${name} { example(driveId: "d") } }`,
            contextValue: { driveId: "request-drive" },
          },
        );
      }
      await expectNoEdits(after);
    },
    120_000,
  );

  it("converts an inline resolver map with scalar instances and imported const and function declaration resolvers, compiles and serves the same result", async () => {
    const directories = await beforeAndAfter({
      "subgraphs/scalars.ts":
        'import { GraphQLScalarType } from "graphql";\n\nexport const DateScalar = new GraphQLScalarType({\n  name: "Date",\n  serialize: (value) => `date:${String(value)}`,\n});\n\nexport const today = () => "today";\n\nexport function now() {\n  return "now";\n}\n',
      "subgraphs/calendar.ts": `${legacyHeader}import { GraphQLScalarType } from "graphql";
import { DateScalar, now, today } from "./scalars.js";

const TimeScalar = new GraphQLScalarType({
  name: "Time",
  serialize: (value) => \`time:\${String(value)}\`,
});

export class CalendarSubgraph extends BaseSubgraph {
  name = "calendar";
  typeDefs = gql\`
    scalar Date
    scalar Time
    type Query {
      date: Date
      time: Time
      label: String
    }
  \`;
  readonly label = "calendar";
  resolvers = {
    Date: DateScalar,
    Time: TimeScalar,
    Query: { date: today, time: now, label: () => this.label },
  };
}
`,
    });
    const { after } = directories;
    expect(await migrateSubgraphs(after)).toStrictEqual({
      changedFiles: [join(after, "subgraphs", "calendar.ts")],
      diagnostics: [],
    });
    expectCompiles(after);
    await expectServedAlike(
      directories,
      "subgraphs/calendar.ts",
      "CalendarSubgraph",
      { data: { date: "date:today", time: "time:now", label: "calendar" } },
      { query: "{ date time label }" },
    );
    await expectNoEdits(after);
  }, 60_000);

  it("refuses a main-template subgraph that package code discovers through a namespace, and converts the rest with the same result", async () => {
    const alphaFiles = Object.entries(
      mainTemplateSubgraph("alpha", { classTyped: true }),
    ).map(([path, source]): [string, string] => [
      path,
      source
        .replace(
          "import { BaseSubgraph }",
          "import { BaseSubgraph, type SubgraphArgs }",
        )
        .replace(
          'name = "alpha";',
          'constructor(readonly hostArgs: SubgraphArgs) {\n    super(hostArgs);\n  }\n  name = "alpha";',
        )
        .replace(
          "import type { AlphaSubgraph }",
          'import { routeNames } from "../../src/catalog.js";\nimport type { AlphaSubgraph }',
        )
        .replace('return "example";', "return routeNames(subgraph.hostArgs);"),
    ]);
    const directories = await beforeAndAfter({
      ...Object.fromEntries(alphaFiles),
      ...mainTemplateSubgraph("billing"),
      "subgraphs/index.ts":
        'export * as AlphaSubgraph from "./alpha/index.js";\nexport * as BillingSubgraph from "./billing/index.js";\n',
      "index.ts": 'export * from "./subgraphs/index.js";\n',
      "src/billing-entries.ts":
        'export * from "../subgraphs/billing/index.js";\n',
      "src/catalog.ts":
        'import type { SubgraphArgs } from "@powerhousedao/reactor-api";\nimport * as entries from "./billing-entries.js";\n\nexport function routeNames(args: SubgraphArgs) {\n  return Object.values(entries)\n    .filter((entry) => typeof entry === "function")\n    .map((Subgraph) => new Subgraph(args).name)\n    .join(",");\n}\n',
    });
    const { after, sources } = directories;
    const alpha = join(after, "subgraphs", "alpha");
    for (const file of ["index.ts", "resolvers.ts"])
      sources.delete(join(alpha, file));
    sources.delete(join(after, "subgraphs", "index.ts"));
    const refusal = {
      file: join(after, "src", "catalog.ts"),
      line: 5,
      message: namespaceUse("BillingSubgraph"),
    };
    expect(await migrateSubgraphs(after)).toStrictEqual({
      changedFiles: [
        join(after, "subgraphs", "index.ts"),
        join(alpha, "index.ts"),
        join(alpha, "resolvers.ts"),
      ],
      diagnostics: [refusal],
    });
    await expectUnchanged(sources);
    await expectServedAlike(
      directories,
      "subgraphs/alpha/index.ts",
      "AlphaSubgraph",
      { data: { alpha: { example: "billing" } } },
      { query: '{ alpha { example(driveId: "d") } }' },
    );
    await expectNoEdits(after, [refusal]);
  }, 60_000);

  it.each([
    [
      "a namespace import",
      {},
      'import * as entries from "../subgraphs/b.js";',
      "Object.values(entries)",
      ["B"],
      ["subgraphs/a.ts"],
      "b",
    ],
    [
      "the namespace of a barrel that migration would extend",
      { "subgraphs/index.ts": 'export * from "./b.js";\n' },
      'import * as entries from "../subgraphs/index.js";',
      "Object.values(entries)",
      ["A", "B"],
      [],
      "b",
    ],
    [
      "a dynamic import of the barrel",
      {
        "subgraphs/index.ts":
          'export * from "./a.js";\nexport * from "./b.js";\n',
      },
      "",
      'Object.values(await import("../subgraphs/index.js"))',
      ["A", "B"],
      [],
      "a,b",
    ],
  ])(
    "refuses each class that package code reaches through %s, and serves the same result",
    async (_case, barrel, header, entries, refused, changed, example) => {
      const directories = await beforeAndAfter({
        ...barrel,
        "subgraphs/a.ts": `${legacyHeader}import { names } from "../src/catalog.js";\n${legacyClass("A", "a", "{ Query: { example: () => names() } }")}`,
        "subgraphs/b.ts": `${legacyHeader}${legacyClass("B", "b")}`,
        "src/catalog.ts": `${header}\nexport async function names() {\n  return ${entries}\n    .filter((entry) => typeof entry === "function")\n    .map((Subgraph) => new Subgraph({ reactorClient: {} } as never).name)\n    .join(",");\n}\n`,
      });
      const { after, sources } = directories;
      for (const file of changed) sources.delete(join(after, file));
      const diagnostics = refused.map((className) => ({
        file: join(after, "src", "catalog.ts"),
        line: 3,
        message: namespaceUse(className),
      }));
      expect(await migrateSubgraphs(after)).toStrictEqual({
        changedFiles: changed.map((file) => join(after, file)),
        diagnostics,
      });
      await expectUnchanged(sources);
      await expectServedAlike(
        directories,
        "subgraphs/a.ts",
        "A",
        { data: { example } },
        { migrated: changed.length > 0 },
      );
      await expectNoEdits(after, diagnostics);
    },
    60_000,
  );

  it.each([
    ["Object.values", "export const all = Object.values(ns);", 3],
    ["a spread", "export const all = { ...ns };", 3],
    ["an argument", "export const label = String(ns);", 3],
    ["for...in", "for (const key in ns) console.log(key);", 3],
    [
      "a dynamic key",
      "export const pick = (key: string) => (ns as Record<string, unknown>)[key];",
      3,
    ],
    ["a type query", "export type All = typeof ns;", 3],
    [
      "an alias",
      "const alias = ns;\nexport const all = Object.values(alias);",
      4,
    ],
    [
      "a named import of export * as",
      'import { BNamespace } from "../subgraphs/index.js";\nexport const all = Object.values(BNamespace);',
      4,
    ],
    [
      "a nested namespace member",
      'import * as root from "../subgraphs/index.js";\nexport const all = Object.values(root.BNamespace);',
      4,
    ],
    [
      "await import()",
      'export const load = async () => Object.values(await import("../subgraphs/b.js"));',
      3,
    ],
    [
      "a const bound to import()",
      'export async function load() {\n  const loaded = await import("../subgraphs/b.js");\n  return Object.values(loaded);\n}',
      5,
    ],
    [
      "import().then",
      'export const load = () => import("../subgraphs/b.js").then(Object.values);',
      3,
    ],
    [
      "require",
      'export const all = Object.values(require("../subgraphs/b.js"));',
      3,
    ],
    [
      "a class member of require",
      'export const made = new (require("../subgraphs/b.js").B)({} as never);',
      3,
    ],
    [
      "an import with a computed specifier",
      "export const load = (path: string) => import(path);",
      3,
    ],
  ])(
    "refuses a class that a namespace exposes to %s without editing any source",
    async (_case, use, line) => {
      const files = {
        "/subgraphs/b.ts": `${legacyHeader}export const other = 1;\n${legacyClass("B", "b")}`,
        "/subgraphs/index.ts": 'export * as BNamespace from "./b.js";\n',
        "/src/consumer.ts": `import * as ns from "../subgraphs/b.js";\nexport const other = ns.other;\n${use}\n`,
      };
      expect(await migrateInMemory("/subgraphs/b.ts", files)).toStrictEqual({
        outcome: {
          changed: false,
          diagnostics: [
            { file: "/src/consumer.ts", line, message: namespaceUse("B") },
          ],
        },
        texts: files,
      });
    },
  );

  it("converts a class whose namespaces package code only re-exports or reads named members of", async () => {
    const others = {
      "/subgraphs/index.ts":
        'export * as BNamespace from "./b.js";\nexport * from "./b.js";\n',
      "/index.ts":
        'export * from "./subgraphs/index.js";\nexport * as Subgraphs from "./subgraphs/index.js";\n',
      "/src/consumer.ts":
        'import * as ns from "../subgraphs/b.js";\nimport * as root from "../index.js";\nimport { BNamespace } from "../subgraphs/index.js";\nexport { ns, BNamespace as Again };\nexport default root;\nexport const values = [ns.other, ns["other"], root.Subgraphs.BNamespace.other, BNamespace.other];\nexport type Other = typeof ns.other;\nexport const load = async () => (await import("../subgraphs/b.js")).other;\nexport const required = require("../subgraphs/b.js").other;\nexport const external = import("graphql");\n',
    };
    const {
      outcome,
      texts: { "/subgraphs/b.ts": _migrated, ...rest },
    } = await migrateInMemory("/subgraphs/b.ts", {
      "/subgraphs/b.ts": `${legacyHeader}export const other = 1;\n${legacyClass("B", "b")}`,
      ...others,
    });
    expect(outcome).toStrictEqual({ changed: true, diagnostics: [] });
    expect(rest).toStrictEqual(others);
  });

  it.each([
    [
      "an imported const",
      { "subgraphs/leaf.ts": 'export const example = () => "literal";\n' },
      'import { example } from "./leaf.js";',
      "",
    ],
    [
      "a module const",
      {},
      'const example = () => "literal";\nconst tenant = "acme";',
      "  additionalContextFields = { tenant };\n",
    ],
  ])(
    "converts a shorthand resolver leaf naming %s, compiles, serves the same result and repeats without edits",
    async (_case, leaf, declaration, fields) => {
      const directories = await beforeAndAfter({
        ...leaf,
        "subgraphs/x.ts": `${legacyHeader}${declaration}\n${legacyClass("X", "x", "{ Query: { example } }", fields)}`,
      });
      const { after } = directories;
      const migrated = join(after, "subgraphs", "x.ts");
      expect(await migrateSubgraphs(after)).toStrictEqual({
        changedFiles: [migrated],
        diagnostics: [],
      });
      expect(await readFile(migrated, "utf8")).toContain(
        "resolvers: (s) => ({ Query: { example } }),",
      );
      expectCompiles(after);
      await expectServedAlike(directories, "subgraphs/x.ts", "X", {
        data: { example: "literal" },
      });
      await expectNoEdits(after);
    },
    60_000,
  );

  it.each([
    ["export * as BillingSubgraph", 3],
    ["export { BillingSubgraph }", 2],
    ["export *", 3],
  ])(
    "converts a main-template subgraph behind a %s barrel that the package root re-exports, compiles, serves the same result and repeats without edits",
    async (barrel, changed) => {
      const directories = await beforeAndAfter({
        ...mainTemplateSubgraph("billing", { classTyped: true }),
        "subgraphs/index.ts": `${barrel} from "./billing/index.js";\n`,
        "index.ts":
          'export * from "./subgraphs/index.js";\nexport * as Subgraphs from "./subgraphs/index.js";\n',
      });
      const { after } = directories;
      const first = await migrateSubgraphs(after);
      expect(first.diagnostics).toStrictEqual([]);
      expect(first.changedFiles).toHaveLength(changed);
      expectCompiles(after);
      await expectServedAlike(
        directories,
        "subgraphs/billing/index.ts",
        "BillingSubgraph",
        { data: { billing: { example: "example" } } },
        { query: '{ billing { example(driveId: "d") } }' },
      );
      await expectNoEdits(after);
    },
    60_000,
  );
});
