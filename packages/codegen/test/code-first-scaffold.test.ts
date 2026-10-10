import {
  chmodSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { DefinitionSourceLoader } from "document-model/tooling";
import { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ZodError } from "zod";
import {
  generateCodeFirstDocumentModel,
  generateCodeFirstSubgraph,
} from "../src/codegen/generate.js";
import { codeFirstAggregateSources } from "../src/file-builders/document-model/code-first-aggregates.js";
import {
  createOrUpdateManifest,
  planDefinitionSourceRegistration,
} from "../src/file-builders/index.mts";
import { buildTsMorphProject, formatSafe } from "../src/utils/index.mts";
import { refreshDocumentModelAggregates } from "../src/file-builders/document-model/document-model.js";
import { ViteTypeScriptSourceImportAdapter } from "../src/utils/definition-source-importer.js";
import { createCodeFirstPackage } from "./code-first-package.js";

let projectDir: string;
let enteredFrom: string;

const configPath = () => join(projectDir, "powerhouse.config.json");

function writeConfig(value: unknown): void {
  writeFileSync(configPath(), `${JSON.stringify(value, null, 2)}\n`);
}

function readConfig(): Record<string, unknown> {
  return JSON.parse(readFileSync(configPath(), "utf8")) as Record<
    string,
    unknown
  >;
}

async function registerDefinitionSource(
  ...args: Parameters<typeof planDefinitionSourceRegistration>
) {
  const { registration, commit } = await planDefinitionSourceRegistration(
    ...args,
  );
  await commit();
  return registration;
}

function read(path: string): string {
  return readFileSync(join(projectDir, path), "utf8");
}

const manifestPath = () => join(projectDir, "powerhouse.manifest.json");

function readManifestJson(): unknown {
  return JSON.parse(read("powerhouse.manifest.json"));
}

async function writeInitManifest(): Promise<void> {
  await createOrUpdateManifest({ name: "new-project" }, projectDir);
}

const todo = {
  name: "todo",
  documentType: "acme-things/todo",
  author: { name: "acme-things", website: null },
};

async function generateModel(args = todo) {
  const project = buildTsMorphProject(projectDir);
  const result = await generateCodeFirstDocumentModel(args, project);
  await project.save();
  return result;
}

async function generateSubgraph(name: string) {
  const project = buildTsMorphProject(projectDir);
  const result = await generateCodeFirstSubgraph(name, project);
  await project.save();
  return result;
}

beforeEach(() => {
  enteredFrom = process.cwd();
  projectDir = createCodeFirstPackage();
});

afterEach(() => {
  process.chdir(enteredFrom);
  rmSync(projectDir, { recursive: true, force: true });
});

describe("planDefinitionSourceRegistration", () => {
  const source = { specifier: "./document-models/todo/index.ts" } as const;

  it("leaves the file untouched when the source is already listed", async () => {
    await registerDefinitionSource(projectDir, source);
    const before = readFileSync(configPath(), "utf8");
    expect(await registerDefinitionSource(projectDir, source)).toBe(
      "unchanged",
    );
    expect(readFileSync(configPath(), "utf8")).toBe(before);
  });

  it("appends after existing entries and writes them back as read", async () => {
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [
          { exportPath: ["ledger"], specifier: "./document-models/ledger.ts" },
        ],
      },
    });
    expect(await registerDefinitionSource(projectDir, source)).toBe("added");
    expect(read("powerhouse.config.json")).toBe(
      `${JSON.stringify(
        {
          definitionSources: {
            formatVersion: 1,
            mode: "code-first",
            entries: [
              {
                exportPath: ["ledger"],
                specifier: "./document-models/ledger.ts",
              },
              { specifier: "./document-models/todo/index.ts" },
            ],
          },
        },
        null,
        2,
      )}\n`,
    );
  });

  it("adds the source when a listed entry selects another export of it", async () => {
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ ...source, exportPath: ["todoV1"] }],
      },
    });
    expect(await registerDefinitionSource(projectDir, source)).toBe("added");
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ ...source, exportPath: ["todoV1"] }, source],
    });
  });

  it("fills an empty code-first entry list", async () => {
    writeConfig({
      definitionSources: { formatVersion: 1, mode: "code-first", entries: [] },
    });
    expect(await registerDefinitionSource(projectDir, source)).toBe("added");
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./document-models/todo/index.ts" }],
    });
  });

  it("converts an explicit schema-first selection", async () => {
    writeConfig({
      definitionSources: { formatVersion: 1, mode: "schema-first" },
    });
    expect(await registerDefinitionSource(projectDir, source)).toBe(
      "converted",
    );
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./document-models/todo/index.ts" }],
    });
  });

  it("creates the field and keeps the file's other keys and indentation", async () => {
    writeFileSync(configPath(), `${JSON.stringify({ a: 1 }, null, 4)}\n`);
    expect(await registerDefinitionSource(projectDir, source)).toBe("created");
    expect(read("powerhouse.config.json")).toBe(
      `${JSON.stringify(
        {
          a: 1,
          definitionSources: {
            formatVersion: 1,
            mode: "code-first",
            entries: [{ specifier: "./document-models/todo/index.ts" }],
          },
        },
        null,
        4,
      )}\n`,
    );
  });

  it.each([
    ["a malformed file", "{ not json", /JSON/],
    ["a config that is not a JSON object", "[]", /must hold a JSON object/],
    [
      "an unsupported format version",
      JSON.stringify({
        definitionSources: { formatVersion: 2, mode: "code-first" },
      }),
      /formatVersion 2/,
    ],
    [
      "an unknown mode",
      JSON.stringify({
        definitionSources: { formatVersion: 1, mode: "typescript" },
      }),
      /definitionSources\.mode/,
    ],
    [
      "an entry the loader would reject",
      JSON.stringify({
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier: "document-models/a.ts" }, 42],
        },
      }),
      /PH-CONFIG-SOURCE-INVALID/,
    ],
  ])("refuses %s and leaves it untouched", async (_, contents, message) => {
    writeFileSync(configPath(), contents);
    await expect(registerDefinitionSource(projectDir, source)).rejects.toThrow(
      message,
    );
    expect(readFileSync(configPath(), "utf8")).toBe(contents);
  });
});

describe("generateCodeFirstDocumentModel", () => {
  it("writes the model, registers it, and exports it from the package", async () => {
    expect(await generateModel()).toStrictEqual({
      written: [
        "document-models/todo/v1/definition.ts",
        "document-models/todo/v1/modules/items.ts",
        "document-models/todo/v1/index.ts",
        "document-models/todo/v1/tests/document-model.test.ts",
        "document-models/todo/v1/tests/items.test.ts",
        "document-models/todo/upgrades/versions.ts",
        "document-models/todo/upgrades/upgrade-manifest.ts",
        "document-models/todo/upgrades/index.ts",
        "document-models/todo/index.ts",
        "powerhouse.manifest.json",
      ],
      registration: "created",
    });
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./document-models/todo/index.ts" }],
    });
    expect(read("document-models/index.ts")).toBe(
      `import * as codeFirstSource0 from "./todo/index.js";

export * from "./todo/index.js";

export const codeFirstDocumentModel0_0 =
  codeFirstSource0["documentModels"]["0"];

export { documentModels } from "./document-models.js";
export { upgradeManifests } from "./upgrade-manifests.js";
`,
    );
    expect(read("document-models/document-models.ts")).toBe(
      `import * as documentModelsCodeFirst0 from "./todo/index.js";

/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */

export const documentModels = [
  documentModelsCodeFirst0["documentModels"]["0"],
] as const;
`,
    );
    expect(read("document-models/upgrade-manifests.ts")).toBe(
      `/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { UpgradeManifest } from "document-model";
import * as upgradeManifestsCodeFirst0 from "./todo/index.js";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  upgradeManifestsCodeFirst0["todoFamily"]["upgradeManifest"],
];
`,
    );
  });

  it("writes files the project formatter leaves unchanged", async () => {
    const { written } = await generateModel();
    const sources = written.filter((path) => path.endsWith(".ts"));
    expect(sources).toHaveLength(9);
    for (const path of sources) {
      expect(await formatSafe(read(path)), path).toBe(read(path));
    }
  });

  it("refuses an existing file without writing anything", async () => {
    mkdirSync(join(projectDir, "document-models", "todo"));
    writeFileSync(
      join(projectDir, "document-models/todo/index.ts"),
      "// mine\n",
    );
    const config = readFileSync(configPath(), "utf8");

    await expect(generateModel()).rejects.toThrow(
      "Refusing to overwrite document-models/todo/index.ts",
    );
    expect(readdirSync(join(projectDir, "document-models", "todo"))).toEqual([
      "index.ts",
    ]);
    expect(read("document-models/todo/index.ts")).toBe("// mine\n");
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });

  it("refuses a config it cannot merge without writing any model file", async () => {
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "document-models/a.ts" }],
      },
    });
    const config = readFileSync(configPath(), "utf8");
    await expect(generateModel()).rejects.toThrow(/PH-CONFIG-SOURCE-INVALID/);
    expect(existsSync(join(projectDir, "document-models", "todo"))).toBe(false);
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });

  it("leaves the config untouched when the model files cannot be written", async () => {
    writeFileSync(join(projectDir, "document-models", "todo"), "a file\n");
    const config = readFileSync(configPath(), "utf8");
    await expect(generateModel()).rejects.toThrow(/definition\.ts/);
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });

  it("exports two models from an index with no type errors", async () => {
    await generateModel();
    await generateModel({
      name: "notes",
      documentType: "acme-things/notes",
      author: todo.author,
    });
    const project = new Project({
      tsConfigFilePath: join(projectDir, "tsconfig.json"),
    });
    const diagnostics = project
      .getSourceFileOrThrow(join(projectDir, "document-models/index.ts"))
      .getPreEmitDiagnostics()
      .map((diagnostic) => diagnostic.getMessageText());
    expect(diagnostics).toStrictEqual([]);
  });
});

describe("code-first aggregate modules", () => {
  it("does not import model collections from a scalar-only source", async () => {
    writeFileSync(
      join(projectDir, "document-models", "scalars.ts"),
      `import { defineScalar, ph } from "document-model";
       const { validator, zodSource } = ph.EmailAddress.binding;
       export const ContactEmail = defineScalar({ name: "ContactEmail", description: "An email", representation: "string", validator, zodSource });`,
    );
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./document-models/scalars.ts" }],
      },
    });
    await generateModel();
    expect(read("document-models/document-models.ts")).not.toContain(
      "scalars.js",
    );
    expect(read("document-models/upgrade-manifests.ts")).not.toContain(
      "scalars.js",
    );
    expect(read("document-models/document-models.ts")).toContain(
      "./todo/index.js",
    );
  });

  it("uses the selected named exports instead of assuming collection exports", async () => {
    await generateModel();
    writeFileSync(
      join(projectDir, "document-models", "selected.ts"),
      `
      export { todoV1 as chosen } from "./todo/index.js";
      export { todoUpgradeManifest as manifest } from "./todo/index.js";
    `,
    );
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [
          {
            specifier: "./document-models/selected.ts",
            exportPath: ["chosen"],
          },
          {
            specifier: "./document-models/selected.ts",
            exportPath: ["manifest"],
          },
        ],
      },
    });
    const project = buildTsMorphProject(projectDir);
    await refreshDocumentModelAggregates(project);
    await project.save();
    expect(read("document-models/index.ts")).toBe(
      `import * as codeFirstSource0 from "./selected.js";

export const codeFirstDocumentModel0_0 = codeFirstSource0["chosen"];

export { documentModels } from "./document-models.js";
export { upgradeManifests } from "./upgrade-manifests.js";
`,
    );
    expect(read("document-models/document-models.ts")).toBe(
      `import * as documentModelsCodeFirst0 from "./selected.js";

/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */

export const documentModels = [documentModelsCodeFirst0["chosen"]] as const;
`,
    );
    expect(read("document-models/upgrade-manifests.ts")).toBe(
      `/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { UpgradeManifest } from "document-model";
import * as upgradeManifestsCodeFirst0 from "./selected.js";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  upgradeManifestsCodeFirst0["manifest"],
];
`,
    );
  });

  const todoManifest = {
    specifier: "./document-models/todo/index.ts",
    exportPath: ["todoUpgradeManifest"],
  };

  it.each([
    {
      selection: "collection",
      dir: "document-models",
      entries: [
        {
          specifier: "./document-models/selected.ts",
          exportPath: ["documentModels"],
        },
        todoManifest,
      ],
      imported: "./selected.js",
    },
    {
      selection: "family",
      dir: "document-models",
      entries: [
        { specifier: "./document-models/selected.ts", exportPath: ["Family"] },
      ],
      imported: "./selected.js",
    },
    {
      selection: "source outside document-models",
      dir: "src",
      entries: [
        { specifier: "./src/selected.ts", exportPath: ["documentModels"] },
        todoManifest,
      ],
      imported: "../src/selected.js",
    },
  ])(
    "publishes one worker module and one upgrade manifest from a selected $selection",
    async ({ dir, entries, imported }) => {
      await generateModel();
      mkdirSync(join(projectDir, dir), { recursive: true });
      writeFileSync(
        join(projectDir, dir, "selected.ts"),
        `
        import { todoV1, todoFamily } from "${dir === "src" ? "../document-models" : "."}/todo/index.js";
        export const documentModels = [todoV1];
        export const Family = todoFamily;
      `,
      );
      writeConfig({
        definitionSources: { formatVersion: 1, mode: "code-first", entries },
      });
      const project = buildTsMorphProject(projectDir);
      await refreshDocumentModelAggregates(project);
      await project.save();
      expect(read("document-models/index.ts")).toContain(
        `import * as codeFirstSource0 from "${imported}";`,
      );
      const importer = new ViteTypeScriptSourceImportAdapter();
      try {
        const namespace = await importer.importModule({
          packageRoot: projectDir,
          specifier: "./document-models/index.ts",
          packageRevision: `sha256:${"1".repeat(64)}`,
        });
        const modules = Object.values(namespace).filter(
          (value) =>
            value !== null &&
            typeof value === "object" &&
            "documentModel" in value &&
            "reducer" in value &&
            typeof value.reducer === "function",
        );
        expect(modules).toHaveLength(1);
        expect(namespace.upgradeManifests).toHaveLength(1);
      } finally {
        await importer.disposeRevision();
      }
    },
  );

  it.each(
    ["index.ts", "document-models.ts", "upgrade-manifests.ts"].flatMap(
      (name) => [
        [name, "directly"],
        [name, "through a symlink"],
      ],
    ),
  )(
    "preserves aggregates when a definition source selects generated %s %s",
    async (name, route) => {
      await generateModel();
      const files = ["index.ts", "document-models.ts", "upgrade-manifests.ts"];
      const before = files.map((file) => read(`document-models/${file}`));
      let specifier = `./document-models/${name}`;
      if (route === "through a symlink") {
        symlinkSync(
          join(projectDir, "document-models", name),
          join(projectDir, "aggregate-alias.ts"),
        );
        specifier = "./aggregate-alias.ts";
      }
      writeConfig({
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier }],
        },
      });
      await expect(
        refreshDocumentModelAggregates(buildTsMorphProject(projectDir)),
      ).rejects.toThrow(/Select the original authored definition file/);
      expect(files.map((file) => read(`document-models/${file}`))).toEqual(
        before,
      );
    },
  );

  it("finds no code-first sources in a legacy or schema-first package", async () => {
    expect(await codeFirstAggregateSources(projectDir)).toStrictEqual([]);
    writeConfig({
      definitionSources: { formatVersion: 1, mode: "schema-first" },
    });
    expect(await codeFirstAggregateSources(projectDir)).toStrictEqual([]);
    rmSync(configPath());
    expect(await codeFirstAggregateSources(projectDir)).toStrictEqual([]);
  });

  it("keeps a schema-first model's upgrade manifest next to code-first ones", async () => {
    await generateModel();
    mkdirSync(join(projectDir, "document-models/legacy/upgrades"), {
      recursive: true,
    });
    writeFileSync(
      join(projectDir, "document-models/legacy/upgrades/upgrade-manifest.ts"),
      `import type { UpgradeManifest } from "document-model";

export const legacyUpgradeManifest: UpgradeManifest<readonly [1]> = {
  documentType: "acme-things/legacy",
  latestVersion: 1,
  supportedVersions: [1],
  upgrades: {},
};
`,
    );
    const project = buildTsMorphProject(projectDir);
    await refreshDocumentModelAggregates(project);
    await project.save();
    expect(read("document-models/upgrade-manifests.ts")).toBe(
      `/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { UpgradeManifest } from "document-model";
import { legacyUpgradeManifest } from "document-models/legacy/upgrades";
import * as upgradeManifestsCodeFirst0 from "./todo/index.js";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  legacyUpgradeManifest,
  upgradeManifestsCodeFirst0["todoFamily"]["upgradeManifest"],
];
`,
    );
  });

  it("refuses a selected source that exports no definition", async () => {
    await generateModel();
    const before = read("document-models/document-models.ts");
    writeFileSync(
      join(projectDir, "document-models", "bad.ts"),
      "export const notADefinition = 42;\n",
    );
    writeConfig({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./document-models/bad.ts" }],
      },
    });
    await expect(
      refreshDocumentModelAggregates(buildTsMorphProject(projectDir)),
    ).rejects.toThrow(/PH-PKG-DEFINITION-UNRECOGNIZED/);
    expect(read("document-models/document-models.ts")).toBe(before);
  });
});

describe("generateCodeFirstSubgraph", () => {
  it("writes the declaration and exports it under its constant's name", async () => {
    expect(await generateSubgraph("widgets")).toStrictEqual({
      written: [
        "subgraphs/widgets.ts",
        "subgraphs/index.ts",
        "powerhouse.manifest.json",
      ],
      registration: "created",
    });
    expect(read("subgraphs/index.ts")).toBe(
      'export * as WidgetsSubgraph from "./widgets.js";\n',
    );
    expect(read("subgraphs/widgets.ts")).toContain(
      "export const WidgetsSubgraph = defineSubgraph({",
    );
    expect(readConfig().definitionSources).toStrictEqual({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./subgraphs/widgets.ts" }],
    });
  });

  it("kebab-cases a multi-word name for the file", async () => {
    expect((await generateSubgraph("SearchIndex")).written).toStrictEqual([
      "subgraphs/search-index.ts",
      "subgraphs/index.ts",
      "powerhouse.manifest.json",
    ]);
    expect(read("subgraphs/index.ts")).toBe(
      'export * as SearchIndexSubgraph from "./search-index.js";\n',
    );
  });

  it("keeps the exports already in subgraphs/index.ts and adds none twice", async () => {
    mkdirSync(join(projectDir, "subgraphs"));
    writeFileSync(
      join(projectDir, "subgraphs/index.ts"),
      "export * as ExistingSubgraph from './existing/index.js';\nexport * as WidgetsSubgraph from './widgets.js';\n",
    );
    await generateSubgraph("widgets");
    expect(read("subgraphs/index.ts")).toBe(
      'export * as ExistingSubgraph from "./existing/index.js";\nexport * as WidgetsSubgraph from "./widgets.js";\n',
    );
  });

  it("refuses to overwrite an edited declaration", async () => {
    await generateSubgraph("widgets");
    writeFileSync(join(projectDir, "subgraphs/widgets.ts"), "// mine\n");
    const config = readFileSync(configPath(), "utf8");
    await expect(generateSubgraph("widgets")).rejects.toThrow(
      "Refusing to overwrite subgraphs/widgets.ts",
    );
    expect(read("subgraphs/widgets.ts")).toBe("// mine\n");
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });

  it("leaves the config untouched when the declaration cannot be written", async () => {
    writeFileSync(join(projectDir, "subgraphs"), "a file\n");
    const config = readFileSync(configPath(), "utf8");
    await expect(generateSubgraph("widgets")).rejects.toThrow(/widgets\.ts/);
    expect(readFileSync(configPath(), "utf8")).toBe(config);
  });
});

describe("code-first manifest registration", () => {
  const notes = {
    name: "notes",
    documentType: "acme-things/notes",
    author: todo.author,
  };
  const readOnlyUnsupported =
    process.platform === "win32" || process.getuid?.() === 0;

  it("adds the model to the manifest ph init wrote and changes nothing else", async () => {
    await writeInitManifest();
    await generateModel();
    expect(read("powerhouse.manifest.json")).toBe(`{
  "name": "new-project",
  "description": "",
  "category": "",
  "publisher": {
    "name": "",
    "url": ""
  },
  "documentModels": [
    {
      "name": "Todo",
      "id": "acme-things/todo"
    }
  ],
  "apps": [],
  "editors": [],
  "processors": [],
  "subgraphs": [],
  "config": []
}
`);
  });

  it("creates the manifest, named after the package, when there is none", async () => {
    await generateModel();
    expect(read("powerhouse.manifest.json")).toBe(`{
  "name": "@acme/things",
  "description": "",
  "category": "",
  "publisher": {
    "name": "",
    "url": ""
  },
  "documentModels": [
    {
      "name": "Todo",
      "id": "acme-things/todo"
    }
  ],
  "apps": [],
  "editors": [],
  "processors": [],
  "subgraphs": [],
  "config": []
}
`);
  });

  it("keeps an existing entry for the document type and adds no second one", async () => {
    writeFileSync(
      manifestPath(),
      JSON.stringify({
        name: "@acme/things",
        documentModels: [{ name: "Todo List", id: "acme-things/todo" }],
      }),
    );
    await generateModel();
    expect(readManifestJson()).toStrictEqual({
      name: "@acme/things",
      documentModels: [{ id: "acme-things/todo", name: "Todo List" }],
      publisher: {},
      editors: [],
      apps: [],
      processors: [],
      subgraphs: [],
      config: [],
    });
  });

  it("lists every model it scaffolds", async () => {
    await generateModel();
    await generateModel(notes);
    expect(readManifestJson()).toMatchObject({
      documentModels: [
        { id: "acme-things/todo", name: "Todo" },
        { id: "acme-things/notes", name: "Notes" },
      ],
    });
  });

  it.each([
    ["model", () => generateModel(), "document-models/todo"],
    ["subgraph", () => generateSubgraph("widgets"), "subgraphs/widgets.ts"],
  ])(
    "refuses an invalid manifest before writing the %s",
    async (_, generate, written) => {
      const manifest = JSON.stringify({
        name: "@acme/things",
        config: [{ name: "OLD", type: "legacy" }],
      });
      writeFileSync(manifestPath(), manifest);
      const config = readFileSync(configPath(), "utf8");
      const rejection = generate();
      await expect(rejection).rejects.toBeInstanceOf(ZodError);
      await expect(rejection).rejects.toMatchObject({
        issues: [{ path: ["config", 0, "type"] }],
      });
      expect(existsSync(join(projectDir, written))).toBe(false);
      expect(readFileSync(configPath(), "utf8")).toBe(config);
      expect(read("powerhouse.manifest.json")).toBe(manifest);
    },
  );

  it("saves the aggregates it rebuilds and no other file in the caller's project", async () => {
    writeFileSync(join(projectDir, "notes.ts"), "export const notes = 1;\n");
    const project = buildTsMorphProject(projectDir);
    project
      .addSourceFileAtPath(join(projectDir, "notes.ts"))
      .replaceWithText("export const notes = 2;\n");
    await generateCodeFirstDocumentModel(todo, project);
    expect(read("notes.ts")).toBe("export const notes = 1;\n");
    expect(read("document-models/index.ts")).toContain(
      'export * from "./todo/index.js";',
    );
    expect(
      readdirSync(join(projectDir, "document-models")).sort(),
    ).toStrictEqual([
      "document-models.ts",
      "index.ts",
      "todo",
      "upgrade-manifests.ts",
    ]);
  });

  it.skipIf(readOnlyUnsupported)(
    "leaves the manifest untouched when document-models/index.ts cannot be saved",
    async () => {
      await generateModel();
      const manifest = read("powerhouse.manifest.json");
      chmodSync(join(projectDir, "document-models", "index.ts"), 0o444);
      await expect(generateModel(notes)).rejects.toThrow(/EACCES/);
      expect(read("powerhouse.manifest.json")).toBe(manifest);
    },
  );

  it.skipIf(readOnlyUnsupported)(
    "leaves the manifest untouched when subgraphs/index.ts cannot be saved",
    async () => {
      await generateSubgraph("widgets");
      const manifest = read("powerhouse.manifest.json");
      chmodSync(join(projectDir, "subgraphs", "index.ts"), 0o444);
      await expect(generateSubgraph("gadgets")).rejects.toThrow(/EACCES/);
      expect(read("powerhouse.manifest.json")).toBe(manifest);
    },
  );

  it("adds a multi-word subgraph next to an existing one", async () => {
    writeFileSync(
      manifestPath(),
      JSON.stringify({
        name: "@acme/things",
        subgraphs: [{ name: "billing", id: "billing" }],
      }),
    );
    await generateSubgraph("Widget Feed");
    expect(readManifestJson()).toStrictEqual({
      name: "@acme/things",
      subgraphs: [
        { id: "billing", name: "billing" },
        { name: "Widget Feed", id: "widget-feed" },
      ],
      publisher: {},
      documentModels: [],
      editors: [],
      apps: [],
      processors: [],
      config: [],
    });
  });

  it("lists the ids the loader compiles", async () => {
    await generateModel();
    await generateSubgraph("Widget Feed");
    const loader = new DefinitionSourceLoader(
      new ViteTypeScriptSourceImportAdapter(),
    );
    try {
      const loaded = await loader.normalizeDefinitionSources({
        configFile: configPath(),
        packageRevision: `sha256:${"2".repeat(64)}`,
      });
      expect(
        loaded.documentModels.map(({ value }) => ({
          name: value.documentModel.global.name,
          id: value.documentModel.global.id,
        })),
      ).toStrictEqual([{ name: "Todo", id: "acme-things/todo" }]);
      expect(loaded.subgraphs).toHaveLength(1);
      expect(loaded.subgraphs[0]?.value).toHaveProperty(
        ["definition", "name"],
        "widget-feed",
      );
    } finally {
      await loader.dispose();
    }
    expect(readManifestJson()).toMatchObject({
      documentModels: [{ name: "Todo", id: "acme-things/todo" }],
      subgraphs: [{ name: "Widget Feed", id: "widget-feed" }],
    });
  });
});
