import {
  DocumentModelGlobalStateSchema,
  type DocumentModelModule,
  type PHBaseState,
} from "@powerhousedao/shared/document-model";
import { DefinitionSourceLoader } from "document-model/tooling";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { planDefinitionSourceRegistration } from "../../src/file-builders/definition-sources.js";
import { writeCodeFirstAggregates } from "../../src/file-builders/document-model/code-first-aggregates.js";
import { loadCodeFirstInventory } from "../../src/file-builders/document-model/code-first-inventory.js";
import { ViteTypeScriptSourceImportAdapter } from "../../src/utils/definition-source-importer.js";
import { buildTsMorphProject, formatSafe } from "../../src/utils/index.mjs";
import {
  createPackage,
  importSource,
  inProject,
  read,
  readJson,
  removePackage,
  todo,
  typeCheck,
  tree,
  writeConfig,
  generateCodeFirstDocumentModel,
} from "./package.js";

let dir: string;
beforeEach(async () => {
  dir = await createPackage();
});
afterEach(() => removePackage(dir));

const config = () => read(dir, "powerhouse.config.json");
const scaffold = (
  args: Parameters<typeof generateCodeFirstDocumentModel>[0] = todo,
) => generateCodeFirstDocumentModel(args, buildTsMorphProject(dir));

async function register(source: { specifier: `./${string}` }) {
  const { registration, commit } = await planDefinitionSourceRegistration(
    dir,
    source,
  );
  await commit();
  return registration;
}

async function refreshAggregates() {
  await inProject(dir, async (project) =>
    writeCodeFirstAggregates(project, await loadCodeFirstInventory(dir)),
  );
}

describe("planDefinitionSourceRegistration", () => {
  const source = { specifier: "./document-models/todo-list/index.ts" } as const;
  const codeFirst = (entries: unknown[]) => ({
    definitionSources: { formatVersion: 1, mode: "code-first", entries },
  });

  it("creates the field and keeps the other keys and the indentation", async () => {
    writeFileSync(
      join(dir, "powerhouse.config.json"),
      `${JSON.stringify({ a: 1 }, null, 4)}\n`,
    );
    expect(await register(source)).toBe("created");
    expect(config()).toBe(
      `${JSON.stringify({ a: 1, ...codeFirst([source]) }, null, 4)}\n`,
    );
  });

  it("converts an explicit schema-first selection", async () => {
    writeConfig(dir, {
      definitionSources: { formatVersion: 1, mode: "schema-first" },
    });
    expect(await register(source)).toBe("converted");
    expect(readJson(dir, "powerhouse.config.json")).toStrictEqual(
      codeFirst([source]),
    );
  });

  it("appends after the existing entries and writes them back as read", async () => {
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/ledger.ts"), "export {};\n");
    const ledger = { exportPath: ["Ledger"], specifier: "./src/ledger.ts" };
    writeConfig(dir, codeFirst([ledger]));
    expect(await register(source)).toBe("added");
    expect(readJson(dir, "powerhouse.config.json")).toStrictEqual(
      codeFirst([ledger, source]),
    );
  });

  it("leaves the file alone when the source is already listed", async () => {
    await register(source);
    const before = config();
    expect(await register(source)).toBe("unchanged");
    expect(config()).toBe(before);
  });

  it.each([
    ["a malformed file", "{ not json", /JSON/],
    ["a config that is not an object", "[]", /must hold a JSON object/],
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
      "an entry the loader rejects",
      JSON.stringify(codeFirst([{ specifier: "document-models/a.ts" }])),
      /PH-CONFIG-SOURCE-INVALID/,
    ],
  ])("refuses %s and leaves it untouched", async (_, contents, message) => {
    writeFileSync(join(dir, "powerhouse.config.json"), contents);
    await expect(register(source)).rejects.toThrow(message);
    expect(config()).toBe(contents);
  });
});

describe("generateCodeFirstDocumentModel", () => {
  it("writes the model, registers it and exports it from the package", async () => {
    expect(await scaffold()).toStrictEqual({
      written: [
        "document-models/todo-list/v1/definition.ts",
        "document-models/todo-list/v1/modules/items.ts",
        "document-models/todo-list/v1/index.ts",
        "document-models/todo-list/v1/tests/document-model.test.ts",
        "document-models/todo-list/v1/tests/items.test.ts",
        "document-models/todo-list/upgrades/index.ts",
        "document-models/todo-list/index.ts",
        "powerhouse.config.json",
        "document-models/index.ts",
        "document-models/document-models.ts",
        "document-models/upgrade-manifests.ts",
        "powerhouse.manifest.json",
      ],
      registration: "created",
    });
    expect(readJson(dir, "powerhouse.config.json")).toStrictEqual({
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./document-models/todo-list/index.ts" }],
      },
    });
    expect(
      readJson(dir, "powerhouse.manifest.json").documentModels,
    ).toStrictEqual([{ id: "acme/todo-list", name: "Todo List" }]);
    const header = `/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
`;
    expect(read(dir, "document-models/index.ts"))
      .toBe(`${header}import * as codeFirstSource0 from "./todo-list/index.js";

export { upgradeManifests } from "./upgrade-manifests.js";

export const TodoListV1 = codeFirstSource0.TodoList;
`);
    expect(read(dir, "document-models/document-models.ts"))
      .toBe(`${header}import * as codeFirstSource0 from "./todo-list/index.js";

export const documentModels = [codeFirstSource0.TodoList] as const;
`);
    expect(read(dir, "document-models/upgrade-manifests.ts"))
      .toBe(`${header}import type { UpgradeManifest } from "document-model";
import * as codeFirstSource0 from "./todo-list/index.js";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  codeFirstSource0.todoListUpgradeManifest,
];
`);
  });

  it.each([
    ["todo list", "Todo List", "todo-list", "TodoList", "todoList"],
    ["TodoList", "Todo List", "todo-list", "TodoList", "todoList"],
    ["todo-list", "Todo List", "todo-list", "TodoList", "todoList"],
    ["todo", "Todo", "todo", "Todo", "todo"],
  ])(
    "names %s for display, directory, types and variables",
    async (name, displayName, directory, pascal, camel) => {
      await scaffold({ ...todo, name });
      const definition = read(
        dir,
        `document-models/${directory}/v1/definition.ts`,
      );
      expect(definition).toContain(`name: "${displayName}",`);
      expect(definition).toContain(
        `export const ${camel}Model = defineDocumentModel({`,
      );
      expect(definition).toContain(`schema: ph.object("${pascal}State", {`);
      expect(read(dir, `document-models/${directory}/index.ts`)).toContain(
        `export const ${pascal} = ${pascal}V1;`,
      );
    },
  );

  it("loads as a code-first source whose module behaves as its scaffolded tests say", async () => {
    await scaffold();
    const loader = new DefinitionSourceLoader(
      new ViteTypeScriptSourceImportAdapter(),
    );
    try {
      const loaded = await loader.normalizeDefinitionSources({
        configFile: join(dir, "powerhouse.config.json"),
        packageRevision: `sha256:${"3".repeat(64)}`,
      });
      expect(loaded.diagnostics).toStrictEqual([]);
      expect(
        loaded.documentModels.map(({ source, value }) => [
          source,
          value.documentModel.global.id,
          value.documentModel.global.name,
        ]),
      ).toStrictEqual([
        [
          {
            specifier: "./document-models/todo-list/index.ts",
            exportPath: ["TodoList"],
          },
          "acme/todo-list",
          "Todo List",
        ],
      ]);
      expect(loaded.upgradeManifests.map(({ value }) => value)).toStrictEqual([
        {
          documentType: "acme/todo-list",
          latestVersion: 1,
          supportedVersions: [1],
          upgrades: {},
        },
      ]);
    } finally {
      await loader.dispose();
    }

    const { TodoList } = (await importSource(
      dir,
      "./document-models/todo-list/index.ts",
    )) as {
      TodoList: DocumentModelModule<PHBaseState & { global: unknown }>;
    };
    const actions = TodoList.actions as Record<
      string,
      (input: unknown) => never
    >;
    const add = actions.addItem({ id: "item-1", label: "Once" });
    let document = TodoList.reducer(TodoList.utils.createDocument(), add);
    document = TodoList.reducer(
      document,
      actions.setItemDone({ id: "item-1", done: true }),
    );
    expect(document.state.global).toStrictEqual({
      items: [{ id: "item-1", label: "Once", done: true }],
    });
    document = TodoList.reducer(document, add);
    expect(document.operations.global.at(-1)?.error).toBe(
      "Item item-1 is already in the list.",
    );
    expect(() => actions.addItem({ id: "item-1", label: 1 })).toThrow();
  });

  it("writes files the project formatter leaves unchanged", async () => {
    const { written } = await scaffold();
    for (const path of written.filter((file) => file.endsWith(".ts"))) {
      expect(await formatSafe(read(dir, path)), path).toBe(read(dir, path));
    }
  });

  it("exports two models whose sources type-check", async () => {
    await scaffold();
    await scaffold({ ...todo, name: "notes", documentType: "acme/notes" });
    expect(read(dir, "document-models/index.ts")).toContain(
      "export const NotesV1 = codeFirstSource0.Notes;",
    );
    expect(typeCheck(dir)).toBe("");
  });

  it("refuses an existing file without writing anything", async () => {
    mkdirSync(join(dir, "document-models/todo-list"));
    writeFileSync(join(dir, "document-models/todo-list/index.ts"), "// mine\n");
    const before = config();
    await expect(scaffold()).rejects.toThrow(
      "Refusing to overwrite document-models/todo-list/index.ts",
    );
    expect(readdirSync(join(dir, "document-models/todo-list"))).toStrictEqual([
      "index.ts",
    ]);
    expect(config()).toBe(before);
  });

  it("refuses a config it cannot merge without writing a model file", async () => {
    writeConfig(dir, {
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "document-models/a.ts" }],
      },
    });
    const before = config();
    await expect(scaffold()).rejects.toThrow(/PH-CONFIG-SOURCE-INVALID/);
    expect(existsSync(join(dir, "document-models/todo-list"))).toBe(false);
    expect(config()).toBe(before);
  });

  it("leaves the config untouched when the model files cannot be written", async () => {
    writeFileSync(join(dir, "document-models/todo-list"), "a file\n");
    const before = config();
    await expect(scaffold()).rejects.toThrow(/document-models[\\/]todo-list/);
    expect(config()).toBe(before);
  });

  it("refuses a name that cannot be an identifier", async () => {
    await expect(scaffold({ ...todo, name: "1st list" })).rejects.toThrow(
      "it must start with a letter",
    );
  });
});

describe("code-first aggregates", () => {
  const selectedModule = `export { TodoListV1 as chosen, todoListUpgradeManifest as manifest } from "../document-models/todo-list/index.js";\n`;

  it("reaches a selected export path, and a host finds one module and one manifest", async () => {
    await scaffold();
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, "src/selected.ts"), selectedModule);
    writeConfig(dir, {
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [
          { specifier: "./src/selected.ts", exportPath: ["chosen"] },
          { specifier: "./src/selected.ts", exportPath: ["manifest"] },
        ],
      },
    });
    await refreshAggregates();
    expect(read(dir, "document-models/index.ts")).toContain(
      "export const TodoListV1 = codeFirstSource0.chosen;",
    );
    expect(read(dir, "document-models/index.ts")).toContain(
      `import * as codeFirstSource0 from "../src/selected.js";`,
    );
    expect(read(dir, "document-models/upgrade-manifests.ts")).toContain(
      "codeFirstSource0.manifest,",
    );
    const namespace = await importSource(dir, "./document-models/index.ts");
    const modules = Object.values(namespace).filter(
      (value) =>
        typeof value === "object" &&
        value !== null &&
        "documentModel" in value &&
        "reducer" in value,
    );
    expect(modules).toHaveLength(1);
    expect(namespace.upgradeManifests).toHaveLength(1);
  });

  it("indexes a module reachable only inside a collection", async () => {
    await scaffold();
    writeFileSync(
      join(dir, "document-models/list.ts"),
      `import { TodoList, todoListUpgradeManifest } from "./todo-list/index.js";\nexport const all = { "todo-list": [TodoList], manifest: todoListUpgradeManifest };\n`,
    );
    writeConfig(dir, {
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./document-models/list.ts" }],
      },
    });
    await refreshAggregates();
    expect(read(dir, "document-models/index.ts")).toContain(
      `export const TodoListV1 = codeFirstSource0.all["todo-list"]["0"];`,
    );
  });

  it.each(["directly", "through a symlink"])(
    "refuses a selection of a generated aggregate %s and keeps the aggregates",
    async (route) => {
      await scaffold();
      const before = read(dir, "document-models/index.ts");
      let specifier = "./document-models/index.ts";
      if (route === "through a symlink") {
        symlinkSync(
          join(dir, "document-models/index.ts"),
          join(dir, "alias.ts"),
        );
        specifier = "./alias.ts";
      }
      writeConfig(dir, {
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier }],
        },
      });
      await expect(refreshAggregates()).rejects.toThrow(
        "Select the authored definition file instead",
      );
      expect(read(dir, "document-models/index.ts")).toBe(before);
    },
  );

  it("refuses another case of an aggregate on a case-insensitive filesystem", async ({
    skip,
  }) => {
    await scaffold();
    if (!existsSync(join(dir, "document-models/INDEX.ts"))) skip();
    const before = read(dir, "document-models/index.ts");
    writeConfig(dir, {
      definitionSources: {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./document-models/INDEX.ts" }],
      },
    });
    await expect(refreshAggregates()).rejects.toThrow(
      "Select the authored definition file instead",
    );
    expect(read(dir, "document-models/index.ts")).toBe(before);
  });

  it("removes the code-first entries of a source no longer selected", async () => {
    await scaffold();
    writeConfig(dir, {
      definitionSources: { formatVersion: 1, mode: "code-first", entries: [] },
    });
    await refreshAggregates();
    expect(read(dir, "document-models/document-models.ts")).toContain(
      "export const documentModels = [] as const;",
    );
    expect(read(dir, "document-models/upgrade-manifests.ts")).toContain(
      "export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [];",
    );
    for (const path of [
      "document-models/index.ts",
      "document-models/document-models.ts",
      "document-models/upgrade-manifests.ts",
    ]) {
      expect(read(dir, path)).not.toContain("codeFirstSource");
    }
  });

  it("rewrites the aggregates to the same bytes when nothing changed", async () => {
    await scaffold();
    const paths = [
      "document-models/index.ts",
      "document-models/document-models.ts",
      "document-models/upgrade-manifests.ts",
    ];
    const before = paths.map((path) => read(dir, path));
    await refreshAggregates();
    expect(paths.map((path) => read(dir, path))).toStrictEqual(before);
  });

  it("creates no aggregate in a package with nothing to list", async () => {
    removePackage(join(dir, "document-models"));
    writeConfig(dir, {
      definitionSources: { formatVersion: 1, mode: "code-first", entries: [] },
    });
    await refreshAggregates();
    expect(existsSync(join(dir, "document-models"))).toBe(false);
  });

  it("keeps the raw text of a file it does not need to change", async () => {
    const before = readFileSync(join(dir, "document-models/index.ts"), "utf8");
    await refreshAggregates();
    expect(read(dir, "document-models/index.ts")).toBe(before);
  });
});

it("rolls back every written file when importing an existing source fails", async () => {
  await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
  const original = read(dir, "document-models/todo-list/index.ts");
  writeFileSync(
    join(dir, "document-models/todo-list/index.ts"),
    'throw new Error("broken source");\n',
  );
  const before = tree(dir);
  const project = buildTsMorphProject(dir);
  await expect(
    generateCodeFirstDocumentModel(
      { ...todo, name: "Notes", documentType: "acme/notes" },
      project,
    ),
  ).rejects.toThrow("PH-IMPORT-FAILED");
  await project.save();
  expect(tree(dir)).toEqual(before);
  writeFileSync(join(dir, "document-models/todo-list/index.ts"), original);
  await generateCodeFirstDocumentModel(
    { ...todo, name: "Notes", documentType: "acme/notes" },
    project,
  );
  await project.save();
  expect(existsSync(join(dir, "document-models/notes/index.ts"))).toBe(true);
});

it("refuses a document type that the manifest already registers", async () => {
  const path = join(dir, "powerhouse.manifest.json");
  const manifest = readJson(dir, "powerhouse.manifest.json");
  writeFileSync(
    path,
    JSON.stringify({
      ...manifest,
      documentModels: [{ id: todo.documentType, name: "Existing" }],
    }),
  );
  const before = tree(dir);
  await expect(
    generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir)),
  ).rejects.toThrow("already registered");
  expect(tree(dir)).toEqual(before);
});

it("allows the family and its exported manifest to be selected together", async () => {
  await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
  const path = join(dir, "document-models/todo-list/index.ts");
  writeFileSync(
    path,
    readFileSync(path, "utf8") + "\nexport { family as TodoListFamily };\n",
  );
  const inventory = await loadCodeFirstInventory(dir);
  expect(
    inventory.documentModels.map(({ documentType }) => documentType),
  ).toEqual([todo.documentType]);
  expect(
    inventory.upgradeManifests.map(({ documentType }) => documentType),
  ).toEqual([todo.documentType]);
  typeCheck(dir);
});

it("refuses an unlisted schema-first spec with the same document type", async () => {
  mkdirSync(join(dir, "document-models/existing"), { recursive: true });
  const fixture: unknown = JSON.parse(
    readFileSync(
      new URL(
        "../../../vetra/document-models/subgraph-module/subgraph-module.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  writeFileSync(
    join(dir, "document-models/existing/existing.json"),
    JSON.stringify({
      ...(typeof fixture === "object" && fixture !== null ? fixture : {}),
      id: todo.documentType,
    }),
  );
  const before = tree(dir);
  await expect(
    generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir)),
  ).rejects.toThrow("already registered");
  expect(tree(dir)).toEqual(before);
});

it("refuses a scaffold that shares a directory and aggregate export with a stored model", async () => {
  const fixture = DocumentModelGlobalStateSchema().parse(
    JSON.parse(
      readFileSync(
        new URL(
          "../../../vetra/document-models/subgraph-module/subgraph-module.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ),
  );
  mkdirSync(join(dir, "document-models/todo-list"), { recursive: true });
  writeFileSync(
    join(dir, "document-models/todo-list/todo-list.json"),
    JSON.stringify({ ...fixture, name: "Todo List", id: "acme/stored" }),
  );
  const before = tree(dir);
  const project = buildTsMorphProject(dir);
  const sourceFiles = project
    .getSourceFiles()
    .map((file) => file.getFullText());
  const attempt = generateCodeFirstDocumentModel(todo, project);
  await expect(attempt).rejects.toThrow(
    "scaffold directory document-models/todo-list",
  );
  await expect(attempt).rejects.toThrow("already exports TodoListV1");
  expect(tree(dir)).toEqual(before);
  expect(project.getSourceFiles().map((file) => file.getFullText())).toEqual(
    sourceFiles,
  );
  await project.save();
  expect(tree(dir)).toEqual(before);
});
