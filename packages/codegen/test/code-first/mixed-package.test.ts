import { generateDocumentModel as generatePublicDocumentModel } from "../../src/codegen/index.js";
import { DEFAULT_AUTHORING_MODE } from "@powerhousedao/shared/clis/definition-sources";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateDocumentModel } from "../../src/codegen/generate.js";
import { selectModelGeneration } from "../../src/codegen/index.js";
import { loadDocumentModel } from "../../src/codegen/utils.js";
import { buildTsMorphProject } from "../../src/utils/index.mjs";
import {
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
  "document-models/index.ts",
  "document-models/document-models.ts",
  "document-models/upgrade-manifests.ts",
];

const packages: string[] = [];
let dir: string;

async function newPackage() {
  const created = await createPackage();
  packages.push(created);
  return created;
}

beforeEach(async () => {
  dir = await newPackage();
});
afterEach(() => {
  for (const created of packages.splice(0)) removePackage(created);
});

describe("selectModelGeneration", () => {
  it.each([
    ["no definitionSources", {}, DEFAULT_AUTHORING_MODE],
    [
      "an explicit schema-first selection",
      { definitionSources: { formatVersion: 1, mode: "schema-first" } },
      "schema-first",
    ],
    [
      "a code-first selection",
      {
        definitionSources: {
          formatVersion: 1,
          mode: "code-first",
          entries: [],
        },
      },
      "code-first",
    ],
    ["--code-first", { codeFirst: true }, "code-first"],
    [
      "--code-first over a schema-first selection",
      {
        codeFirst: true,
        definitionSources: { formatVersion: 1, mode: "schema-first" },
      },
      "code-first",
    ],
    [
      "--code-first over a selection it cannot parse",
      { codeFirst: true, definitionSources: { formatVersion: 2 } },
      "code-first",
    ],
  ])("resolves %s", (_, input, mode) => {
    const codeFirst = "codeFirst" in input ? input.codeFirst : undefined;
    writeConfig(dir, {
      definitionSources:
        "definitionSources" in input ? input.definitionSources : undefined,
    });
    expect(selectModelGeneration({ projectDir: dir, codeFirst }).mode).toBe(
      mode,
    );
  });

  it("refuses a definitionSources value it cannot parse", () => {
    writeConfig(dir, {
      definitionSources: { formatVersion: 2, mode: "code-first" },
    });
    expect(() => selectModelGeneration({ projectDir: dir })).toThrow(
      "powerhouse.config.json has an invalid definitionSources.formatVersion",
    );
  });
});

describe("schema-first generation", () => {
  it("writes the same files through either selection as today's generateDocumentModel", async () => {
    const direct = await newPackage();
    const explicit = await newPackage();
    writeConfig(explicit, {
      definitionSources: { formatVersion: 1, mode: "schema-first" },
    });
    await inProject(direct, async (project) =>
      generateDocumentModel(
        await loadDocumentModel(copySchemaFirstSpec(direct)),
        project,
      ),
    );
    for (const root of [dir, explicit]) {
      const state = await loadDocumentModel(copySchemaFirstSpec(root));
      await inProject(root, (project) =>
        selectModelGeneration({
          projectDir: root,
        }).generateDocumentModel(state, project),
      );
    }

    const expected = tree(direct);
    expect(Object.keys(expected)).toContain(
      "document-models/subgraph-module/v1/module.ts",
    );
    expect(tree(dir)).toStrictEqual(expected);
    expect(tree(explicit)).toStrictEqual({
      ...expected,
      "powerhouse.config.json": read(explicit, "powerhouse.config.json"),
    });
  });
});

describe("a schema-first package that adds a code-first model", () => {
  it("keeps both models through the public entry when the schema-first model is generated again", async () => {
    const state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) =>
      selectModelGeneration({ projectDir: dir }).generateDocumentModel(
        state,
        project,
      ),
    );
    const schemaFirstIndex = read(dir, "document-models/index.ts");
    await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
    const scaffolded = AGGREGATES.map((path) => read(dir, path));

    const generation = selectModelGeneration({
      projectDir: dir,
    });
    expect(generation.mode).toBe("code-first");
    await inProject(dir, (project) =>
      generatePublicDocumentModel(state, project),
    );

    expect(AGGREGATES.map((path) => read(dir, path))).toStrictEqual(scaffolded);
    const header = schemaFirstIndex.slice(
      0,
      schemaFirstIndex.indexOf("*/\n") + 3,
    );
    expect(read(dir, "document-models/index.ts")).toBe(
      `${header}import * as codeFirstSource0 from "./todo-list/index.js";

${schemaFirstIndex.slice(header.length)}
export const TodoListV1 = codeFirstSource0.TodoList;
`,
    );
    expect(read(dir, "document-models/document-models.ts")).toContain(
      "export const documentModels = [\n  SubgraphModuleV1,\n  codeFirstSource0.TodoList,\n] as const;",
    );
    expect(read(dir, "document-models/upgrade-manifests.ts")).toContain(
      "codeFirstSource0.todoListUpgradeManifest,",
    );
    expect(
      readJson(dir, "powerhouse.manifest.json").documentModels,
    ).toStrictEqual([
      { id: "powerhouse/subgraph", name: "Subgraph Module" },
      { id: "acme/todo-list", name: "Todo List" },
    ]);
  });

  it("writes today's editor for the schema-first model", async () => {
    const state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) =>
      selectModelGeneration({ projectDir: dir }).generateDocumentModel(
        state,
        project,
      ),
    );
    await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
    await inProject(dir, (project) =>
      selectModelGeneration({
        projectDir: dir,
      }).generateEditor(
        {
          editorName: "Subgraph Editor",
          documentTypes: ["powerhouse/subgraph"],
        },
        project,
      ),
    );
    expect(read(dir, "editors/subgraph-editor/editor.tsx")).toContain(
      'from "document-models/subgraph-module";',
    );
  });
});
