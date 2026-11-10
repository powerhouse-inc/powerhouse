import {
  existsSync,
  mkdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const PH_CLI = join(import.meta.dirname, "..");
const PACKAGES = join(PH_CLI, "..", "..", "packages");
const REACTOR_API = join(PACKAGES, "reactor-api");
const DOCUMENT_MODEL = join(PACKAGES, "document-model");

function linkPackage(root: string, name: string, from: string): void {
  const target = join(root, "node_modules", name);
  mkdirSync(dirname(target), { recursive: true });
  rmSync(target, { recursive: true, force: true });
  symlinkSync(realpathSync.native(from), target);
}

const packageDir = (resolver: string, name: string) =>
  dirname(createRequire(resolver).resolve(`${name}/package.json`));

/**
 * Installs what a project's subgraph modules import: document-model and zod
 * when the project has none yet, reactor-api and @powerhousedao/shared as a
 * generated project depends on them, and graphql-tag for schema-first SDL.
 */
export function installSubgraphDependencies(root: string): void {
  if (!existsSync(join(root, "node_modules", "document-model"))) {
    linkPackage(root, "document-model", DOCUMENT_MODEL);
    linkPackage(
      root,
      "zod",
      packageDir(join(DOCUMENT_MODEL, "package.json"), "zod"),
    );
  }
  linkPackage(root, "@powerhousedao/reactor-api", REACTOR_API);
  linkPackage(root, "@powerhousedao/shared", join(PACKAGES, "shared"));
  const reactorApi = join(REACTOR_API, "package.json");
  linkPackage(root, "graphql-tag", packageDir(reactorApi, "graphql-tag"));
  linkPackage(root, "graphql", packageDir(reactorApi, "graphql"));
}

/** A code-first subgraph module serving `Query.<field>` of a list of `<type>`. */
export function codeFirstSubgraph(
  options: {
    readonly className?: string;
    readonly name?: string;
    readonly field?: string;
    readonly type?: string;
    readonly typeFields?: string;
    readonly preamble?: string;
  } = {},
): string {
  const {
    className = "ItemsSubgraph",
    name = "items",
    field = "items",
    type = "Item",
    typeFields = "id: ph.OID({ required: true }), label: ph.String()",
    preamble = "",
  } = options;
  return `import { Subgraph } from "@powerhousedao/reactor-api";
import { ph } from "document-model";
${preamble}
const ${type} = ph.object(${JSON.stringify(type)}, {
  fields: { ${typeFields} },
});

export class ${className} extends Subgraph {
  static subgraphName = ${JSON.stringify(name)};

  static getSchema(schema) {
    return [
      schema.query(${JSON.stringify(field)}, {
        type: ph.list(ph.ref(${type}, { required: true }), { required: true }),
        resolve: () => [],
      }),
    ];
  }
}
`;
}

/** A schema-first subgraph as codegen writes one: a class with instance fields and SDL in schema.ts. */
export function schemaFirstSubgraph(
  className: string,
  name: string,
  schema: string,
  indexPreamble = "",
): Record<string, string> {
  return {
    "index.ts": `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";
${indexPreamble}
export class ${className} extends BaseSubgraph {
  name = ${JSON.stringify(name)};
  typeDefs = schema;
  resolvers = {};
}
`,
    "schema.ts": schema,
  };
}

export const gqlModule = (sdl: string) =>
  `import { gql } from "graphql-tag";\n\nexport const schema = gql\`\n${sdl}\n\`;\n`;

/** `subgraphs/<dir>/<file>` entries for each directory, and the barrel codegen writes over them. */
export function subgraphFiles(
  dirs: Readonly<Record<string, Readonly<Record<string, string>>>>,
  exports: Readonly<Record<string, string>>,
): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(dirs).flatMap(([dir, files]) =>
        Object.entries(files).map(([file, text]) => [
          `subgraphs/${dir}/${file}`,
          text,
        ]),
      ),
    ),
    "subgraphs/index.ts": Object.entries(exports)
      .map(([alias, dir]) => `export * as ${alias} from "./${dir}/index.js";\n`)
      .join(""),
  };
}

/** Two code-first subgraphs named `items`: an error in either profile. */
export const DUPLICATE_ITEMS = subgraphFiles(
  {
    items: { "index.ts": codeFirstSubgraph() },
    more: {
      "index.ts": codeFirstSubgraph({
        className: "MoreItemsSubgraph",
        field: "moreItems",
      }),
    },
  },
  { ItemsSubgraph: "items", MoreItemsSubgraph: "more" },
);
