// @vitest-environment node
import {
  subgraphIndexFileTemplate,
  subgraphSchemaTemplate,
} from "@powerhousedao/codegen/templates";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { DEFAULT_CONFIG } from "@powerhousedao/config";
import { DocumentModelGlobalStateSchema } from "@powerhousedao/shared/document-model";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { lintSubgraphTypes } from "../codegen/subgraph-type-lint.js";
import { DocumentCodegenManager } from "../processors/codegen/document-handlers/document-codegen-manager.js";
import { DocumentModelGenerator } from "../processors/codegen/document-handlers/generators/document-model-generator.js";
import { SubgraphGenerator } from "../processors/codegen/document-handlers/generators/subgraph-generator.js";
import { utils as subgraphUtils } from "../document-models/subgraph-module/index.js";
import { checkSubgraphs } from "../processors/codegen/document-handlers/generators/utils.js";
import { logger } from "../processors/codegen/logger.js";

const temporary: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const packagesDir = join(import.meta.dirname, "../..");

const dependencies: Record<string, string> = {
  "@powerhousedao/reactor-api": join(packagesDir, "reactor-api"),
  "@powerhousedao/shared": join(packagesDir, "shared"),
  "document-model": join(packagesDir, "document-model"),
  graphql: join(packagesDir, "reactor-api/node_modules/graphql"),
  "graphql-tag": join(packagesDir, "reactor-api/node_modules/graphql-tag"),
  pg: join(packagesDir, "reactor-api/node_modules/pg"),
};

function makeProject(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "ph-subgraph-lint-"));
  temporary.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "@acme/lint",
      type: "module",
      peerDependencies: {
        "@powerhousedao/reactor-api": "6.2.3",
        "document-model": "6.2.3",
      },
      devDependencies: {
        "@powerhousedao/reactor-api": "6.2.3",
        "document-model": "6.2.3",
      },
    }),
  );
  for (const [name, target] of Object.entries(dependencies)) {
    const link = join(root, "node_modules", name);
    mkdirSync(join(link, ".."), { recursive: true });
    symlinkSync(realpathSync(target), link, "junction");
  }
  const modelDir = join(root, "document-models", "subgraph-module");
  mkdirSync(modelDir, { recursive: true });
  copyFileSync(
    join(
      import.meta.dirname,
      "../document-models/subgraph-module/subgraph-module.json",
    ),
    join(modelDir, "subgraph-module.json"),
  );
  for (const [path, content] of Object.entries(files)) {
    const file = join(root, "subgraphs", path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, content);
  }
  return root;
}

const sdlSubgraph = (className: string, name: string, sdl: string) => `
import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";

export class ${className} extends BaseSubgraph {
  static override readonly subgraphName = "${name}";

  static override getSchema(schema: SchemaBuilder<${className}>) {
    return schema.graphql({
      typeDefs: gql\`${sdl}\`,
      resolverCoordinates: [],
      resolvers: () => ({}),
    });
  }
}
`;

function sdlSubgraphs(
  subgraphs: Record<string, string>,
): Record<string, string> {
  const files: Record<string, string> = {};
  const barrel: string[] = [];
  for (const [name, sdl] of Object.entries(subgraphs)) {
    const exportName = `${name.replaceAll("-", "_")}Subgraph`;
    files[`${name}/index.ts`] = sdlSubgraph(exportName, name, sdl);
    barrel.push(`export { ${exportName} } from "./${name}/index.js";`);
  }
  files["index.ts"] = `${barrel.join("\n")}\n`;
  return files;
}

const template = (kebabCaseName: string, pascalCaseName: string) => ({
  [`${kebabCaseName}/index.ts`]: subgraphIndexFileTemplate({
    pascalCaseName,
    camelCaseName: pascalCaseName[0].toLowerCase() + pascalCaseName.slice(1),
    kebabCaseName,
  }),
  [`${kebabCaseName}/schema.ts`]: subgraphSchemaTemplate({ pascalCaseName }),
  "index.ts": `export { ${pascalCaseName}Subgraph } from "./${kebabCaseName}/index.js";\n`,
});

describe("lintSubgraphTypes", () => {
  it("is silent on a project without subgraphs", async () => {
    expect(await lintSubgraphTypes(makeProject({}))).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("is silent on the template under a name of its own", async () => {
    const root = makeProject(template("subgraph-tools", "SubgraphTools"));

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("warns on a subgraph named like the package's model subgraph", async () => {
    const root = makeProject(template("subgraph-module", "SubgraphModule"));

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Subgraph "subgraph-module" has the name of a document model subgraph, so the server refuses it. Rename the subgraph.',
      ],
    });
  });

  it("warns on a subgraph named like a core subgraph", async () => {
    const root = makeProject(
      sdlSubgraphs({ system: "type Query { tools: String }" }),
    );

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Subgraph "system" has the name of a core subgraph, so the server refuses it. Rename the subgraph.',
      ],
    });
  });

  it("warns on a type the package's model subgraph generates", async () => {
    const root = makeProject(
      sdlSubgraphs({
        tools: `
          type SubgraphModuleQueries {
            example(driveId: String!): String
          }
          type Query {
            tools: SubgraphModuleQueries!
          }
        `,
      }),
    );

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Subgraph "tools" defines SubgraphModuleQueries differently from "subgraph-module", which owns it, so the server leaves it out of the supergraph. Rename SubgraphModuleQueries in this subgraph, or define it exactly as "subgraph-module" does.',
      ],
    });
  });

  it("warns on core and reserved types", async () => {
    const root = makeProject(
      sdlSubgraphs({
        ledger: `
          type Revision {
            id: ID
          }
          type Operation {
            id: ID
          }
          type Query {
            ledger: Revision
          }
        `,
      }),
    );

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Subgraph "ledger" defines Operation, which the document-model schema generates, so the server refuses it. Rename those types in this subgraph.',
      ],
    });
  });

  it("warns on a root field another of the package's subgraphs serves", async () => {
    const sdl = "type Query { ledger: String }";
    const root = makeProject({
      ...sdlSubgraphs({ ledger: sdl, "ledger-copy": sdl }),
      "index.ts":
        'export * as A from "./ledger/index.js";\nexport * as B from "./ledger-copy/index.js";\n',
    });

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Subgraphs "ledger" and "ledger-copy" both define Query.ledger, and the supergraph can include only one of them. Define Query.ledger in one subgraph only.',
      ],
    });
  });

  it("groups the subgraphs that define a contested type the same way", async () => {
    const gadget = (fields: string, field: string) =>
      `type Query { ${field}: Gadget } type Gadget { ${fields} }`;
    const root = makeProject(
      sdlSubgraphs({
        alpha: gadget("id: ID!", "a"),
        beta: gadget("id: ID!", "b"),
        gamma: gadget("id: ID! size: Int", "c"),
      }),
    );

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Gadget is defined one way by "alpha" and "beta", and another way by "gamma". The supergraph can include the subgraphs of only one of these definitions. Make every definition of Gadget identical, or rename it where it differs.',
      ],
    });
  });

  it("warns that the server refuses a model whose schema does not build, and checks the rest", async () => {
    const root = makeProject(template("subgraph-module", "SubgraphModule"));
    const brokenDir = join(root, "document-models", "broken");
    mkdirSync(brokenDir, { recursive: true });
    writeFileSync(
      join(brokenDir, "broken.json"),
      JSON.stringify({
        id: "test/broken",
        name: "Broken",
        author: { name: "", website: "" },
        extension: "",
        description: "",
        specifications: [
          {
            version: 1,
            changeLog: [],
            modules: [
              {
                id: "m",
                name: "base",
                description: "",
                operations: [
                  {
                    id: "o",
                    name: "SET",
                    description: "",
                    schema: "input BrokenInput {",
                    template: "",
                    reducer: "",
                    errors: [],
                    examples: [],
                    scope: "global",
                  },
                ],
              },
            ],
            state: {
              global: { schema: "", initialValue: "", examples: [] },
              local: { schema: "", initialValue: "", examples: [] },
            },
          },
        ],
      }),
    );

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        expect.stringMatching(
          /^The server refuses document model "Broken": it has an unusable schema: [\s\S]+\. Fix the document model's state and operation schemas so they build\.$/,
        ),
        'Subgraph "subgraph-module" has the name of a document model subgraph, so the server refuses it. Rename the subgraph.',
      ],
    });
  });

  it("warns that the server does not serve a subgraph whose schema does not build, and leaves it out of the claims", async () => {
    const root = makeProject(
      sdlSubgraphs({
        broken: "type Query { shared: Missing }",
        working: "type Query { shared: String }",
      }),
    );

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Subgraph "broken" does not build, so the server does not serve it: Unknown type "Missing". Fix its schema so it builds, or declare the missing type.',
      ],
    });
  });

  it("reads a schema built from substitutions", async () => {
    const root = makeProject(
      sdlSubgraphs({
        ledger: "${`type Operation { id: ID }`} type Query { ledger: String }",
      }),
    );

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Subgraph "ledger" defines Operation, which the document-model schema generates, so the server refuses it. Rename those types in this subgraph.',
      ],
    });
  });

  it("refuses an old-style subgraph with the ph migrate hint", async () => {
    const root = makeProject({
      "old/index.ts": `
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";

export class Old extends BaseSubgraph {
  name = "old";
  typeDefs = gql\`type Query { old: String }\`;
}
`,
      "index.ts": 'export { Old } from "./old/index.js";\n',
    });

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [
        'PH-SG-DEFINITION-INVALID [error/definition] ./subgraphs/index.ts#/Old /Old: Old has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`. Expected: a class with its own static subgraphName and getSchema Received: Old Repair: Declare static override readonly subgraphName = "my-subgraph" and static override getSchema(schema) on Old. Run ph migrate to convert an old-style subgraph that sets name, typeDefs, resolvers, hasSubscriptions or path.',
      ],
      warnings: [],
    });
  });

  it("reports a subgraph whose getSchema throws, and still checks its siblings", async () => {
    const root = makeProject({
      ...sdlSubgraphs({
        system: "type Query { tools: String }",
      }),
      "broken/index.ts": `
import { BaseSubgraph } from "@powerhousedao/reactor-api";

export class BrokenSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "broken";

  static override getSchema(): never {
    throw new Error("no schema today");
  }
}
`,
    });

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [
        "PH-SG-DEFINITION-INVALID [error/definition] ./subgraphs/broken/index.ts#/BrokenSubgraph /BrokenSubgraph: BrokenSubgraph could not be described: Error: no schema today. Received: Error: no schema today Repair: Fix BrokenSubgraph.getSchema so that it returns its schema without throwing.",
      ],
      warnings: [
        'Subgraph "system" has the name of a core subgraph, so the server refuses it. Rename the subgraph.',
      ],
    });
  });

  it("checks a subgraph that needs a database without constructing it or running its hooks", async () => {
    const root = makeProject({
      "ledger/index.ts": `
import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";
import { gql } from "graphql-tag";
import pg from "pg";

export class LedgerSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "ledger";

  static override getSchema(schema: SchemaBuilder<LedgerSubgraph>) {
    return schema.graphql({
      typeDefs: gql\`type Operation { id: ID } type Query { ledger: Operation }\`,
      resolverCoordinates: [],
      resolvers: () => ({}),
    });
  }

  pool = new pg.Pool({ connectionString: process.env.LEDGER_DATABASE_URL });

  constructor(...args: ConstructorParameters<typeof BaseSubgraph>) {
    super(...args);
    throw new Error("LedgerSubgraph was constructed");
  }

  override async onSetup() {
    throw new Error("LedgerSubgraph.onSetup ran");
  }
}
`,
    });

    expect(await lintSubgraphTypes(root)).toEqual({
      errors: [],
      warnings: [
        'Subgraph "ledger" defines Operation, which the document-model schema generates, so the server refuses it. Rename those types in this subgraph.',
      ],
    });
  });
});

describe("checkSubgraphs", () => {
  it("succeeds on a valid project", async () => {
    await expect(
      checkSubgraphs(makeProject(template("subgraph-tools", "SubgraphTools"))),
    ).resolves.toBeUndefined();
  });

  it("rejects an old-style subgraph and logs a sibling's conflict as a warning", async () => {
    const root = makeProject({
      ...sdlSubgraphs({ system: "type Query { tools: String }" }),
      "old/index.ts": `
import { BaseSubgraph } from "@powerhousedao/reactor-api";

export class Old extends BaseSubgraph {
  name = "old";
}
`,
    });
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(checkSubgraphs(root)).rejects.toThrow(
      'PH-SG-DEFINITION-INVALID [error/definition] ./subgraphs/old/index.ts#/Old /Old: Old has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (`name`/`typeDefs`/`resolvers`): run `ph migrate`. Expected: a class with its own static subgraphName and getSchema Received: Old Repair: Declare static override readonly subgraphName = "my-subgraph" and static override getSchema(schema) on Old. Run ph migrate to convert an old-style subgraph that sets name, typeDefs, resolvers, hasSubscriptions or path.',
    );
    expect(error.mock.calls).toEqual([]);
    expect(warn.mock.calls).toEqual([
      [
        '⚠️ Subgraph "system" has the name of a core subgraph, so the server refuses it. Rename the subgraph.',
      ],
    ]);
  });
});

describe("Vetra regeneration", () => {
  function projectWithOldSubgraph() {
    const root = makeProject({
      "old/index.ts": `
import { BaseSubgraph } from "@powerhousedao/reactor-api";
export class Old extends BaseSubgraph { name = "old"; }
`,
      "index.ts": 'export { Old } from "./old/index.js";\n',
    });
    writeFileSync(join(root, "tsconfig.json"), "{}");
    const project = buildTsMorphProject(root);
    return { root, project };
  }

  it("rejects subgraph generation with the migration diagnostic", async () => {
    const { root, project } = projectWithOldSubgraph();
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
    const generator = new SubgraphGenerator(
      { PH_CONFIG: DEFAULT_CONFIG, CURRENT_WORKING_DIR: root },
      project,
    );
    const state = subgraphUtils.createDocument().state;
    state.global.name = "tools";
    state.global.status = "CONFIRMED";
    await expect(
      generator.generate({
        documentId: "subgraph-doc",
        documentType: "powerhouse/subgraph",
        branch: "main",
        scope: "global",
        state,
      }),
    ).rejects.toThrow(/PH-SG-DEFINITION-INVALID[\s\S]*ph migrate/);
    expect(info.mock.calls.flat().join("\n")).not.toContain(
      "completed successfully",
    );
  });

  it("generates the model beside an old-style subgraph, reports the subgraph, and recovers once it is fixed", async () => {
    const { root, project } = projectWithOldSubgraph();
    const error = vi.spyOn(logger, "error").mockImplementation(() => {});
    const info = vi.spyOn(logger, "info").mockImplementation(() => {});
    const debug = vi.spyOn(logger, "debug").mockImplementation(() => {});
    const manager = new DocumentCodegenManager(
      { PH_CONFIG: DEFAULT_CONFIG, CURRENT_WORKING_DIR: root },
      project,
    );
    manager.registerGenerator(
      "powerhouse/document-model",
      DocumentModelGenerator,
    );
    const input = {
      documentId: "model-doc",
      documentType: "powerhouse/document-model",
      branch: "main",
      scope: "global",
      state: {
        global: DocumentModelGlobalStateSchema().parse(
          JSON.parse(
            readFileSync(
              join(
                root,
                "document-models/subgraph-module/subgraph-module.json",
              ),
              "utf8",
            ),
          ),
        ),
      },
    };
    await manager.routeAndGenerate(input);
    await expect
      .poll(
        () =>
          error.mock.calls
            .map(([message]) => String(message))
            .find((message) =>
              message.startsWith("❌ Subgraph validation failed:"),
            ),
        { timeout: 20000 },
      )
      .toMatch(/PH-SG-DEFINITION-INVALID[\s\S]*ph migrate/);
    expect(debug.mock.calls).toContainEqual([
      "✅ Successfully generated code for document type: powerhouse/document-model",
    ]);
    expect(info.mock.calls).toContainEqual([
      "✅ Code generation completed successfully for: Subgraph Module",
    ]);
    expect(error.mock.calls.flat().join("\n")).not.toContain(
      "Error generating code for document type",
    );
    info.mockClear();
    debug.mockClear();

    rmSync(join(root, "subgraphs/old"), { recursive: true });
    for (const [file, content] of Object.entries(template("tools", "Tools"))) {
      const path = join(root, "subgraphs", file);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, content);
    }
    error.mockClear();
    await manager.routeAndGenerate(input);
    await expect
      .poll(() => debug.mock.calls, { timeout: 20000 })
      .toContainEqual([
        "✅ Successfully generated code for document type: powerhouse/document-model",
      ]);
    expect(info.mock.calls).toContainEqual([
      "✅ Code generation completed successfully for: Subgraph Module",
    ]);
    expect(error).not.toHaveBeenCalled();
  });
});
