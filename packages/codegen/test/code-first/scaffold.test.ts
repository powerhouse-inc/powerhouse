import {
  DocumentModelGlobalStateSchema,
  type DocumentModelModule,
  type PHBaseState,
} from "@powerhousedao/shared/document-model";
import { DefinitionSourceLoader } from "document-model/tooling";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeDocumentModelAggregates } from "../../src/file-builders/document-model/aggregates.js";
import { loadDocumentModelInventory } from "../../src/file-builders/document-model/document-model-inventory.js";
import { ViteTypeScriptSourceImportAdapter } from "../../src/utils/definition-source-importer.js";
import { buildTsMorphProject, formatSafe } from "../../src/utils/index.mjs";
import {
  addTodoListVersion2,
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

async function refreshAggregates() {
  await inProject(dir, async (project) =>
    writeDocumentModelAggregates(
      project,
      await loadDocumentModelInventory(dir),
    ),
  );
}

describe("generateCodeFirstDocumentModel", () => {
  it("writes the model where discovery finds it and exports it from the package", async () => {
    writeConfig(dir, { logLevel: "warn" });
    const before = config();
    expect(await scaffold()).toStrictEqual({
      written: [
        "document-models/todo-list/v1/definition.ts",
        "document-models/todo-list/v1/modules/items.ts",
        "document-models/todo-list/v1/index.ts",
        "document-models/todo-list/v1/tests/document-model.test.ts",
        "document-models/todo-list/v1/tests/items.test.ts",
        "document-models/todo-list/upgrades/index.ts",
        "document-models/todo-list/index.ts",
        "document-models/index.ts",
        "document-models/document-models.ts",
        "document-models/upgrade-manifests.ts",
        "powerhouse.manifest.json",
      ],
    });
    expect(config()).toBe(before);
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
  it("executes reducers and an upgrade through the discovered family's generated exports", async () => {
    await scaffold();
    addTodoListVersion2(dir);
    await refreshAggregates();
    writeFileSync(
      join(dir, "verify-family.ts"),
      `
import { TodoListV1, TodoListV2, upgradeManifests } from "./document-models/index.js";
import { applyUpgradeDocumentAction, computeUpgradeTransitions } from "document-model";
const original = TodoListV1.reducer(TodoListV1.utils.createDocument(), TodoListV1.actions.addItem({ id: "proof", label: "Kept through upgrade" }));
const before = original.state.document.version;
const upgraded = applyUpgradeDocumentAction(original, {
  id: "upgrade-proof", type: "UPGRADE_DOCUMENT", scope: "document", timestampUtcMs: new Date().toISOString(),
  input: { documentId: original.header.id, model: original.header.documentType, fromVersion: 1, toVersion: 2 },
}, computeUpgradeTransitions(upgradeManifests[0], 1, 2));
export const proof = {
  before,
  after: upgraded.state.document.version,
  state: upgraded.state.global,
  latest: TodoListV2.utils.createDocument().state.document.version,
  versions: upgradeManifests[0].supportedVersions,
};
`,
    );
    const { proof } = await importSource(dir, "./verify-family.ts");
    expect(proof).toStrictEqual({
      before: 1,
      after: 2,
      state: {
        items: [{ id: "proof", label: "Kept through upgrade", done: false }],
      },
      latest: 2,
      versions: [1, 2],
    });
  });

  /** Moves the scaffolded entry to family.ts and gives the model a new index.ts. */
  function replaceEntry(text: string) {
    const model = join(dir, "document-models/todo-list");
    renameSync(join(model, "index.ts"), join(model, "family.ts"));
    writeFileSync(join(model, "index.ts"), text);
  }

  it("reaches a value under its exported name, and a host finds one module and one manifest", async () => {
    await scaffold();
    replaceEntry(
      'export { TodoListV1 as chosen, todoListUpgradeManifest as manifest } from "./family.js";\n',
    );
    await refreshAggregates();
    expect(read(dir, "document-models/index.ts")).toContain(
      "export const TodoListV1 = codeFirstSource0.chosen;",
    );
    expect(read(dir, "document-models/index.ts")).toContain(
      `import * as codeFirstSource0 from "./todo-list/index.js";`,
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
    replaceEntry(
      `import { TodoList, todoListUpgradeManifest } from "./family.js";\nexport const all = { "todo-list": [TodoList], manifest: todoListUpgradeManifest };\n`,
    );
    await refreshAggregates();
    expect(read(dir, "document-models/index.ts")).toContain(
      `export const TodoListV1 = codeFirstSource0.all["todo-list"]["0"];`,
    );
  });

  it("refuses a model entry that links to a generated barrel and keeps the barrels", async () => {
    await scaffold();
    const before = read(dir, "document-models/index.ts");
    mkdirSync(join(dir, "document-models/alias"));
    symlinkSync(
      join(dir, "document-models/index.ts"),
      join(dir, "document-models/alias/index.ts"),
    );
    await expect(refreshAggregates()).rejects.toThrow(
      "./document-models/alias/index.ts resolves to a barrel codegen generates",
    );
    expect(read(dir, "document-models/index.ts")).toBe(before);
  });

  it("removes the code-first entries of a deleted model directory", async () => {
    await scaffold();
    rmSync(join(dir, "document-models/todo-list"), { recursive: true });
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
    await refreshAggregates();
    expect(existsSync(join(dir, "document-models"))).toBe(false);
  });

  it("settles the barrels of a package without models in one write", async () => {
    await refreshAggregates();
    const settled = read(dir, "document-models/index.ts");
    expect(settled).toContain(
      'export { upgradeManifests } from "./upgrade-manifests.js";',
    );
    await refreshAggregates();
    expect(read(dir, "document-models/index.ts")).toBe(settled);
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
  const inventory = await loadDocumentModelInventory(dir);
  expect(
    inventory.documentModels.map(({ documentType }) => documentType),
  ).toEqual([todo.documentType]);
  expect(
    inventory.upgradeManifests.map(({ documentType }) => documentType),
  ).toEqual([todo.documentType]);
  typeCheck(dir);
});

it("refuses a stored schema-first spec with the same document type", async () => {
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
