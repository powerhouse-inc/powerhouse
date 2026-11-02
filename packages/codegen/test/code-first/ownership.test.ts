import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectModelGeneration } from "../../src/codegen/index.js";
import { loadDocumentModel } from "../../src/codegen/utils.js";
import { buildTsMorphProject } from "../../src/utils/index.mjs";
import {
  createPackage,
  generateCodeFirstDocumentModel,
  removePackage,
  schemaFirstSpecPath,
  todo,
  writeConfig,
} from "./package.js";

const caseInsensitiveFs = (() => {
  const probe = mkdtempSync(join(tmpdir(), "ph-case-"));
  try {
    mkdirSync(join(probe, "Tasks"));
    return existsSync(join(probe, "tasks"));
  } finally {
    rmSync(probe, { recursive: true, force: true });
  }
})();

const packages: string[] = [];
let dir: string;
let spec: DocumentModelGlobalState;

beforeEach(async () => {
  dir = await createPackage();
  packages.push(dir);
  await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
  spec = await loadDocumentModel(schemaFirstSpecPath);
});
afterEach(() => {
  for (const created of packages.splice(0)) removePackage(created);
});

const generation = () => selectModelGeneration({ projectDir: dir });

/** Every file and directory outside node_modules, with file bytes. */
function disk(root: string): Record<string, string | null> {
  return Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(
        ({ parentPath, name }) =>
          ![parentPath, name].some((part) => part.includes("node_modules")),
      )
      .map((entry): [string, string | null] => {
        const path = join(entry.parentPath, entry.name);
        return [
          relative(root, path),
          entry.isFile() ? readFileSync(path, "utf8") : null,
        ];
      })
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function inMemory(project: Project): Record<string, string> {
  return Object.fromEntries(
    project
      .getSourceFiles()
      .map((file) => [file.getFilePath(), file.getFullText()]),
  );
}

function openProject() {
  const project = buildTsMorphProject(dir);
  project.addSourceFilesAtPaths(join(dir, "document-models/**/*.ts"));
  return project;
}

async function expectRefusedWithoutWrites(
  run: (project: Project) => Promise<unknown>,
  ...messages: string[]
) {
  const project = openProject();
  const diskBefore = disk(dir);
  const memoryBefore = inMemory(project);
  const error = await run(project).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(Error);
  expect(disk(dir)).toStrictEqual(diskBefore);
  expect(inMemory(project)).toStrictEqual(memoryBefore);
  for (const message of messages) {
    expect((error as Error).message).toContain(message);
  }
  await project.save();
  expect(disk(dir)).toStrictEqual(diskBefore);
}

function moveCodeFirstModel(to: string) {
  mkdirSync(join(dir, to, ".."), { recursive: true });
  renameSync(join(dir, "document-models/todo-list"), join(dir, to));
  writeConfig(dir, {
    definitionSources: {
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: `./${to}/index.ts` }],
    },
  });
}

function storeSpec(dirName: string, state: DocumentModelGlobalState) {
  mkdirSync(join(dir, "document-models", dirName), { recursive: true });
  writeFileSync(
    join(dir, "document-models", dirName, `${dirName}.json`),
    JSON.stringify(state, null, 2),
  );
}

describe("generating one schema-first model in a code-first package", () => {
  it("refuses a document type a code-first model declares, under another name", async () => {
    await expectRefusedWithoutWrites(
      (project) =>
        generation().generateDocumentModel(
          { ...spec, id: todo.documentType, name: "Other List" },
          project,
        ),
      'the schema-first model "Other List" and ./document-models/todo-list/index.ts both declare document type acme/todo-list.',
    );
  });

  it("refuses the name of a code-first model under another document type", async () => {
    await expectRefusedWithoutWrites(
      (project) =>
        generation().generateDocumentModel(
          { ...spec, id: "acme/imported", name: "Todo List" },
          project,
        ),
      'the schema-first model "Todo List" would overwrite document-models/todo-list/index.ts, loaded from ./document-models/todo-list/index.ts, while writing document-models/todo-list.',
      'the schema-first model "Todo List" and ./document-models/todo-list/index.ts both export TodoListV1 from document-models/index.ts.',
    );
  });

  it("refuses the name of a code-first model whose source lives under src", async () => {
    moveCodeFirstModel("src/todo-list");
    await expectRefusedWithoutWrites(
      (project) =>
        generation().generateDocumentModel(
          { ...spec, id: "acme/imported", name: "Todo List" },
          project,
        ),
      'the schema-first model "Todo List" and ./src/todo-list/index.ts both export TodoListV1 from document-models/index.ts.',
    );
  });

  it("refuses a directory that holds a code-first source of another name", async () => {
    moveCodeFirstModel("document-models/tasks");
    await expectRefusedWithoutWrites(
      (project) =>
        generation().generateDocumentModel(
          { ...spec, id: "acme/tasks", name: "Tasks" },
          project,
        ),
      'the schema-first model "Tasks" would overwrite document-models/tasks/index.ts, loaded from ./document-models/tasks/index.ts, while writing document-models/tasks.',
    );
  });

  it("refuses a directory that links to a code-first model directory", async () => {
    moveCodeFirstModel("document-models/tasks");
    symlinkSync(
      join(dir, "document-models/tasks"),
      join(dir, "document-models/chores"),
      "junction",
    );
    await expectRefusedWithoutWrites(
      (project) =>
        generation().generateDocumentModel(
          { ...spec, id: "acme/chores", name: "Chores" },
          project,
        ),
      'the schema-first model "Chores" would overwrite document-models/tasks/index.ts, loaded from ./document-models/tasks/index.ts, while writing document-models/chores.',
    );
  });

  it.runIf(caseInsensitiveFs)(
    "refuses a directory that differs from a code-first model directory only in case",
    async () => {
      moveCodeFirstModel("document-models/Tasks");
      await expectRefusedWithoutWrites(
        (project) =>
          generation().generateDocumentModel(
            { ...spec, id: "acme/tasks", name: "Tasks" },
            project,
          ),
        'the schema-first model "Tasks" would overwrite document-models/Tasks/index.ts, loaded from ./document-models/Tasks/index.ts, while writing document-models/tasks.',
      );
    },
  );

  it("checks existing stored specifications before generating another model", async () => {
    storeSpec("zz-clash", { ...spec, id: todo.documentType, name: "Zz Clash" });
    await expectRefusedWithoutWrites(
      (project) => generation().generateDocumentModel(spec, project),
      "document-models/zz-clash/zz-clash.json and ./document-models/todo-list/index.ts both declare document type acme/todo-list.",
    );
  });

  it.each([false, true])(
    "preserves barrel-selected authored files, with stored specification present: %s",
    async (withSpec) => {
      moveCodeFirstModel("document-models/tasks");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(
        join(dir, "src/models.ts"),
        'export * from "../document-models/tasks/index.js";\n',
      );
      writeConfig(dir, {
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier: "./src/models.ts" }],
        },
      });
      if (withSpec)
        storeSpec("tasks", { ...spec, id: "acme/tasks", name: "Tasks" });
      await expectRefusedWithoutWrites(
        (project) =>
          generation().generateDocumentModel(
            { ...spec, id: "acme/tasks", name: "Tasks" },
            project,
          ),
        "document-models/tasks/index.ts, loaded from ./src/models.ts",
      );
    },
  );

  it("generates a model that shares nothing with the code-first model", async () => {
    moveCodeFirstModel("document-models/tasks");
    const project = buildTsMorphProject(dir);
    await generation().generateDocumentModel(spec, project);
    await project.save();
    expect(
      existsSync(join(dir, "document-models/subgraph-module/v1/module.ts")),
    ).toBe(true);
    expect(
      readFileSync(join(dir, "document-models/tasks/index.ts"), "utf8"),
    ).toContain("export const TodoList");
  });
});

describe("generating every model in a code-first package", () => {
  beforeEach(() => {
    storeSpec("subgraph-module", spec);
  });

  it.each(["generateAllDocumentModels", "generateAll"] as const)(
    "%s checks every stored spec before it writes the first one",
    async (method) => {
      storeSpec("zz-clash", {
        ...spec,
        id: todo.documentType,
        name: "Zz Clash",
      });
      await expectRefusedWithoutWrites(
        (project) => generation()[method](project),
        "document-models/zz-clash/zz-clash.json and ./document-models/todo-list/index.ts both declare document type acme/todo-list.",
      );
    },
  );

  it.each(["generateAllDocumentModels", "generateAll"] as const)(
    "%s preserves barrel-selected authored files beside a stored specification",
    async (method) => {
      moveCodeFirstModel("document-models/tasks");
      mkdirSync(join(dir, "src"), { recursive: true });
      writeFileSync(
        join(dir, "src/models.ts"),
        'export * from "../document-models/tasks/index.js";\n',
      );
      writeConfig(dir, {
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [{ specifier: "./src/models.ts" }],
        },
      });
      storeSpec("tasks", { ...spec, id: "acme/tasks", name: "Tasks" });
      await expectRefusedWithoutWrites(
        (project) => generation()[method](project),
        "document-models/tasks/index.ts, loaded from ./src/models.ts",
      );
    },
  );

  it.each([
    "generateAllDocumentModels",
    "generateAll",
    "generateDocumentModel",
  ] as const)(
    "%s refuses duplicate code-first aggregate names before any writes",
    async (method) => {
      cpSync(
        join(dir, "document-models/todo-list"),
        join(dir, "document-models/other"),
        { recursive: true },
      );
      for (const path of ["v1/definition.ts", "upgrades/index.ts"]) {
        const file = join(dir, "document-models/other", path);
        writeFileSync(
          file,
          readFileSync(file, "utf8").replaceAll(
            todo.documentType,
            "acme/other",
          ),
        );
      }
      writeConfig(dir, {
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [
            { specifier: "./document-models/todo-list/index.ts" },
            { specifier: "./document-models/other/index.ts" },
          ],
        },
      });
      await expectRefusedWithoutWrites(
        (project) =>
          method === "generateDocumentModel"
            ? generation().generateDocumentModel(spec, project)
            : generation()[method](project),
        "both export TodoListV1",
      );
    },
  );

  it.each([
    "generateAllDocumentModels",
    "generateAll",
    "generateDocumentModel",
  ] as const)(
    "%s preflights exports from old modules without a readable stored spec",
    async (method) => {
      mkdirSync(join(dir, "document-models/orphan/v1"), { recursive: true });
      const moduleText = readFileSync(
        new URL(
          "../../../vetra/document-models/subgraph-module/v1/module.ts",
          import.meta.url,
        ),
        "utf8",
      );
      writeFileSync(
        join(dir, "document-models/orphan/v1/module.ts"),
        moduleText.replace(
          "export const SubgraphModule",
          "export const TodoList",
        ),
      );
      await expectRefusedWithoutWrites(
        (project) =>
          method === "generateDocumentModel"
            ? generation().generateDocumentModel(spec, project)
            : generation()[method](project),
        "document-models/orphan/v1/module.ts",
        "TodoListV1",
      );
    },
  );

  it("names the actual dependency file when a definition imports stored-model output", async () => {
    const project = buildTsMorphProject(dir);
    await generation().generateDocumentModel(spec, project);
    await project.save();
    const definition = join(dir, "document-models/todo-list/v1/definition.ts");
    writeFileSync(
      definition,
      readFileSync(definition, "utf8") +
        '\nexport { documentType as storedType } from "../../subgraph-module/v1/gen/document-type.js";\n',
    );
    await expectRefusedWithoutWrites(
      (project) => generation().generateAllDocumentModels(project),
      "./document-models/todo-list/index.ts",
      "document-models/subgraph-module/v1/gen/document-type.ts",
    );
  });

  it("refuses a stored spec left inside a code-first model directory", async () => {
    storeSpec("todo-list", {
      ...spec,
      id: "acme/imported",
      name: "Todo List",
    });
    await expectRefusedWithoutWrites(
      (project) => generation().generateAll(project),
      "document-models/todo-list/todo-list.json would overwrite document-models/todo-list/index.ts, loaded from ./document-models/todo-list/index.ts, while writing document-models/todo-list.",
    );
  });
});

it("checks the actual names of stored versions a single-model command will not rewrite", async () => {
  const existing = buildTsMorphProject(dir);
  await generation().generateDocumentModel(spec, existing);
  await existing.save();
  const moduleFile = join(dir, "document-models/subgraph-module/v1/module.ts");
  writeFileSync(
    moduleFile,
    readFileSync(moduleFile, "utf8").replace(
      "export const SubgraphModule",
      "export const TodoList",
    ),
  );
  await expectRefusedWithoutWrites(
    (project) =>
      generation().generateDocumentModel(
        { ...spec, id: "acme/another", name: "Another Model" },
        project,
      ),
    "document-models/subgraph-module/v1/module.ts",
    "TodoListV1",
  );
});
