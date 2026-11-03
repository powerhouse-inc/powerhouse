import { codeFirstModelGeneration } from "../../src/codegen/code-first-generation.js";
import { migrate } from "../../src/codegen/migrate.js";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateAll as generatePublicAll,
  generateAllDocumentModels as generatePublicModels,
  selectModelGeneration,
} from "../../src/codegen/index.js";
import { loadDocumentModel } from "../../src/codegen/utils.js";
import { createOrUpdateManifest } from "../../src/file-builders/manifest.js";
import {
  documentModelsIndexTemplate,
  documentModelsTemplate,
  upgradeManifestsTemplate,
} from "../../src/templates/index.mjs";
import { buildTsMorphProject, formatSafe } from "../../src/utils/index.mjs";
import {
  addTodoListVersion2,
  copySchemaFirstSpec,
  createPackage,
  inProject,
  read,
  readJson,
  removePackage,
  todo,
  tree,
  writeConfig,
  generateCodeFirstDocumentModel,
} from "./package.js";

const AGGREGATES = [
  ["document-models/index.ts", documentModelsIndexTemplate],
  ["document-models/document-models.ts", documentModelsTemplate],
  ["document-models/upgrade-manifests.ts", upgradeManifestsTemplate],
] as const;

const packages: string[] = [];
let dir: string;

async function newPackage() {
  const created = await createPackage();
  packages.push(created);
  return created;
}

afterEach(() => {
  for (const created of packages.splice(0)) removePackage(created);
});

const generation = (root = dir) =>
  selectModelGeneration({
    projectDir: root,
  });

const aggregates = () => AGGREGATES.map(([path]) => read(dir, path));
const manifest = () => readJson(dir, "powerhouse.manifest.json");

describe("bulk generation in a package with both kinds of models", () => {
  let state: DocumentModelGlobalState;
  let generated: string[];

  beforeEach(async () => {
    dir = await newPackage();
    state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) =>
      selectModelGeneration({ projectDir: dir }).generateDocumentModel(
        state,
        project,
      ),
    );
    await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
    for (const [editorName, documentType] of [
      ["Subgraph Editor", "powerhouse/subgraph"],
      ["Todo Editor", "acme/todo-list"],
    ]) {
      await inProject(dir, (project) =>
        generation().generateEditor(
          { editorName, documentTypes: [documentType] },
          project,
        ),
      );
    }
    generated = aggregates();
  });

  it("rebuilds the aggregates and the manifest from both kinds", async () => {
    for (const [path, template] of AGGREGATES) {
      writeFileSync(join(dir, path), await formatSafe(template));
    }
    writeFileSync(
      join(dir, "powerhouse.manifest.json"),
      `${JSON.stringify({ ...manifest(), documentModels: [], editors: [] }, null, 2)}\n`,
    );

    const result = await inProject(dir, (project) =>
      generation().generateAllDocumentModels(project),
    );
    await inProject(dir, (project) => generation().generateAll(project));

    expect({
      documentModels: result.documentModels.map(({ id }) => id),
      unreadableDirs: result.unreadableDirs,
      codeFirstDocumentModels: result.codeFirstDocumentModels,
    }).toStrictEqual({
      documentModels: ["powerhouse/subgraph"],
      unreadableDirs: [],
      codeFirstDocumentModels: [{ id: "acme/todo-list", name: "Todo List" }],
    });
    expect(aggregates()).toStrictEqual(generated);
    expect(manifest().documentModels).toStrictEqual([
      { id: "powerhouse/subgraph", name: "Subgraph Module" },
      { id: "acme/todo-list", name: "Todo List" },
    ]);
    expect(
      (manifest().editors as { id: string }[]).map(({ id }) => id),
    ).toStrictEqual(["subgraph-editor", "todo-editor"]);
  });

  it("preserves both inventories through the public bulk entry points", async () => {
    const result = await inProject(dir, (project) =>
      generatePublicModels(project),
    );
    expect(Object.keys(result).sort()).toEqual([
      "documentModels",
      "unreadableDirs",
    ]);
    expect(result.unreadableDirs).toEqual([]);
    await inProject(dir, (project) => generatePublicAll(project));
    expect(aggregates()).toStrictEqual(generated);
    expect(manifest().documentModels).toStrictEqual([
      { id: "powerhouse/subgraph", name: "Subgraph Module" },
      { id: "acme/todo-list", name: "Todo List" },
    ]);
  });

  it("refuses malformed config before migration writes any file", async () => {
    Object.assign(globalThis, { WORKSPACE_PACKAGES: [] });
    writeFileSync(join(dir, "powerhouse.config.json"), "{ broken");
    const before = tree(dir);
    await expect(
      migrate("6.2.3-dev.90", dir, { skipInstall: true }),
    ).rejects.toThrow("Fix its JSON before generating");
    expect(tree(dir)).toEqual(before);
  });

  it("keeps both models and the code-first editor during migration", async () => {
    Object.assign(globalThis, { WORKSPACE_PACKAGES: [] });
    await migrate("6.2.3-dev.90", dir, { skipInstall: true });
    expect(read(dir, "document-models/document-models.ts")).toContain(
      "codeFirstSource",
    );
    expect(read(dir, "editors/todo-editor/module.ts")).toContain(
      'from "../../document-models/todo-list/index.js";',
    );
    expect(
      readJson(dir, "powerhouse.manifest.json").documentModels,
    ).toContainEqual({ id: todo.documentType, name: "Todo List" });
  });

  it("removes entries nothing in the package declares", async () => {
    await createOrUpdateManifest(
      {
        documentModels: [{ id: "acme/gone", name: "Gone" }],
        editors: [{ id: "gone-editor", name: "Gone", documentTypes: [] }],
      },
      dir,
    );
    await inProject(dir, (project) => generation().generateAll(project));
    expect(manifest().documentModels).toStrictEqual([
      { id: "powerhouse/subgraph", name: "Subgraph Module" },
      { id: "acme/todo-list", name: "Todo List" },
    ]);
    expect(
      (manifest().editors as { id: string }[]).map(({ id }) => id),
    ).toStrictEqual(["subgraph-editor", "todo-editor"]);
  });

  it("keeps every model entry when a model directory cannot be read", async () => {
    mkdirSync(join(dir, "document-models/broken"));
    await createOrUpdateManifest(
      { documentModels: [{ id: "acme/broken", name: "Broken" }] },
      dir,
    );
    const result = await inProject(dir, (project) =>
      generation().generateAllDocumentModels(project),
    );
    expect(result.unreadableDirs).toStrictEqual(["broken"]);
    expect(
      (manifest().documentModels as { id: string }[]).map(({ id }) => id),
    ).toContain("acme/broken");
  });

  it("fails before writing anything when a code-first source cannot be loaded", async () => {
    const before = tree(dir);
    writeFileSync(
      join(dir, "document-models/todo-list/v1/modules/items.ts"),
      "export const broken = ;\n",
    );
    await expect(
      inProject(dir, (project) => generation().generateAll(project)),
    ).rejects.toThrow("PH-IMPORT-FAILED");
    const after = tree(dir);
    delete after["document-models/todo-list/v1/modules/items.ts"];
    delete before["document-models/todo-list/v1/modules/items.ts"];
    expect(after).toStrictEqual(before);
  });

  it("lists a model with two versions once and exports both versions", async () => {
    addTodoListVersion2(dir);
    const result = await inProject(dir, (project) =>
      generation().generateAllDocumentModels(project),
    );
    expect(result.codeFirstDocumentModels).toStrictEqual([
      { id: "acme/todo-list", name: "Todo List" },
    ]);
    expect(read(dir, "document-models/index.ts")).toContain(
      "export const TodoListV2 = codeFirstSource0.TodoList;\nexport const TodoListV1 = codeFirstSource0.TodoListV1;",
    );
    expect(read(dir, "document-models/document-models.ts")).toContain(
      "codeFirstSource0.TodoList,\n  codeFirstSource0.TodoListV1,",
    );
  });
});

describe("bulk generation with a code-first source outside document-models", () => {
  it.each(["generateAllDocumentModels", "generateAll"] as const)(
    "%s keeps every field of the manifest entries it keeps",
    async (method) => {
      dir = await newPackage();
      const state = await loadDocumentModel(copySchemaFirstSpec(dir));
      await inProject(dir, (project) =>
        generation().generateDocumentModel(state, project),
      );
      await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
      mkdirSync(join(dir, "src"));
      renameSync(
        join(dir, "document-models/todo-list"),
        join(dir, "src/todo-list"),
      );
      writeConfig(dir, {
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier: "./src/todo-list/index.ts" }],
        },
      });
      const schemaFirst = {
        id: "powerhouse/subgraph",
        name: "Subgraph Module",
        description: "schema-first, kept by hand",
      };
      const codeFirst = {
        id: todo.documentType,
        name: "Todo List",
        description: "code-first, kept by hand",
      };
      writeFileSync(
        join(dir, "powerhouse.manifest.json"),
        JSON.stringify({
          ...manifest(),
          documentModels: [
            schemaFirst,
            { id: "acme/gone", name: "Gone" },
            codeFirst,
          ],
        }),
      );

      await inProject(dir, async (project) => {
        await generation()[method](project);
      });

      expect(manifest().documentModels).toStrictEqual([schemaFirst, codeFirst]);
    },
  );
});

describe("bulk generation in a package without models", () => {
  it("writes what schema-first generation writes", async () => {
    const schemaFirst = await newPackage();
    dir = await newPackage();
    writeConfig(dir, {
      definitionSources: { formatVersion: 1, mode: "code-first", entries: [] },
    });
    for (const root of [schemaFirst, dir]) {
      await inProject(root, (project) => generation(root).generateAll(project));
    }
    expect(tree(dir)).toStrictEqual({
      ...tree(schemaFirst),
      "powerhouse.config.json": read(dir, "powerhouse.config.json"),
    });
  });
});

it("generates a code-first package without an additional source adapter", async () => {
  const root = await newPackage();
  await generateCodeFirstDocumentModel(todo, buildTsMorphProject(root));
  const generation = codeFirstModelGeneration();
  await inProject(root, (project) =>
    generation.generateEditor(
      { editorName: "Todo Editor", documentTypes: [todo.documentType] },
      project,
    ),
  );
  await inProject(root, (project) => generation.generateAll(project));
  expect(read(root, "document-models/document-models.ts")).toContain(
    "codeFirstSource",
  );
  expect(read(root, "editors/todo-editor/module.ts")).toContain(
    'from "../../document-models/todo-list/index.js";',
  );
});
