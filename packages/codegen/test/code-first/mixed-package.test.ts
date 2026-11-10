import { generateDocumentModel as generatePublicDocumentModel } from "../../src/codegen/index.js";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { modelGeneration } from "../../src/codegen/index.js";
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
  typeCheck,
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

describe("model discovery in generation", () => {
  it.each(["single", "all"])(
    "refuses conflicting model ownership before %s editor generation writes",
    async (kind) => {
      const state = {
        ...(await loadDocumentModel(copySchemaFirstSpec(dir))),
        id: todo.documentType,
      };
      await inProject(dir, (project) =>
        generatePublicDocumentModel(state, project),
      );
      const donor = await newPackage();
      await generateCodeFirstDocumentModel(todo, buildTsMorphProject(donor));
      cpSync(
        join(donor, "document-models/todo-list"),
        join(dir, "document-models/todo-list"),
        { recursive: true },
      );
      const before = tree(dir);
      await expect(
        inProject(dir, async (project) => {
          if (kind === "single")
            await modelGeneration.generateEditor(
              { editorName: "Todo Editor", documentTypes: [todo.documentType] },
              project,
            );
          else await modelGeneration.generateAllEditors(project);
        }),
      ).rejects.toThrow(`both declare document type ${todo.documentType}`);
      expect(tree(dir)).toStrictEqual(before);
    },
  );

  it.each(["missing", "empty", "unexported"])(
    "refuses generation when a declared model has a %s entry without changing files",
    async (entry) => {
      await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
      const path = join(dir, "document-models/todo-list/index.ts");
      if (entry === "missing") rmSync(path);
      else
        writeFileSync(
          path,
          entry === "empty"
            ? "export {};\n"
            : `${read(dir, "document-models/todo-list/index.ts").replaceAll("export const", "const")}\nexport {};\n`,
        );
      const before = tree(dir);
      await expect(
        inProject(dir, (project) =>
          modelGeneration.generateAllDocumentModels(project),
        ),
      ).rejects.toThrow(/not export|no model entry|unregistered/i);
      expect(tree(dir)).toStrictEqual(before);
    },
  );

  it.each(["single", "all"])(
    "refuses an authored barrel before %s schema generation writes anything",
    async (kind) => {
      const state = await loadDocumentModel(copySchemaFirstSpec(dir));
      await inProject(dir, (project) =>
        generatePublicDocumentModel(state, project),
      );
      const spec = "document-models/subgraph-module/subgraph-module.json";
      const changed = {
        ...readJson(dir, spec),
        description: "Changed description",
      };
      writeFileSync(join(dir, spec), JSON.stringify(changed));
      writeFileSync(
        join(dir, "document-models/index.ts"),
        `${read(dir, "document-models/index.ts")}export const authored = 1;\n`,
      );
      const before = tree(dir);
      await expect(
        inProject(dir, async (project) =>
          kind === "single"
            ? generatePublicDocumentModel(
                await loadDocumentModel(join(dir, spec)),
                project,
              )
            : modelGeneration.generateAllDocumentModels(project),
        ),
      ).rejects.toThrow("export const authored = 1");
      expect(tree(dir)).toStrictEqual(before);
    },
  );

  it.each(["model", "editor", "editors", "scaffold"])(
    "publishes a newly discovered code-first model when generating %s",
    async (kind) => {
      const state = await loadDocumentModel(copySchemaFirstSpec(dir));
      await inProject(dir, (project) =>
        generatePublicDocumentModel(state, project),
      );
      const donor = await newPackage();
      await generateCodeFirstDocumentModel(todo, buildTsMorphProject(donor));
      cpSync(
        join(donor, "document-models/todo-list"),
        join(dir, "document-models/todo-list"),
        { recursive: true },
      );
      await inProject(dir, async (project) => {
        await (kind === "model"
          ? generatePublicDocumentModel(state, project)
          : kind === "editor"
            ? modelGeneration.generateEditor(
                {
                  editorName: "Subgraph Editor",
                  documentTypes: ["powerhouse/subgraph"],
                },
                project,
              )
            : kind === "scaffold"
              ? modelGeneration.scaffoldDocumentModel(
                  { ...todo, name: "notes", documentType: "acme/notes" },
                  project,
                )
              : modelGeneration.generateAllEditors(project));
      });
      expect(readJson(dir, "powerhouse.manifest.json").documentModels).toEqual(
        expect.arrayContaining([{ id: "acme/todo-list", name: "Todo List" }]),
      );
      expect(read(dir, "document-models/index.ts")).toContain(
        "export const TodoListV1",
      );
      expect(read(dir, "document-models/document-models.ts")).toMatch(
        /codeFirstSource\d\.TodoList/,
      );
    },
  );

  it("refuses a hidden second model in a directory whose first model is exported", async () => {
    await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
    const donor = await newPackage();
    await generateCodeFirstDocumentModel(
      { ...todo, name: "notes", documentType: "acme/notes" },
      buildTsMorphProject(donor),
    );
    cpSync(
      join(donor, "document-models/notes"),
      join(dir, "document-models/todo-list/notes"),
      { recursive: true },
    );
    writeFileSync(
      join(dir, "document-models/todo-list/index.ts"),
      `${read(dir, "document-models/todo-list/index.ts")}\nimport "./notes/index.js";\n`,
    );
    const before = tree(dir);
    await expect(
      inProject(dir, (project) =>
        modelGeneration.generateAllDocumentModels(project),
      ),
    ).rejects.toThrow("PH-PKG-DEFINITION-UNREGISTERED");
    expect(tree(dir)).toStrictEqual(before);
  });

  it("preserves schema-first barrel ordering beyond nine versions", async () => {
    for (const version of [1, 2, 10]) {
      const path = join(dir, `document-models/many/v${version}`);
      mkdirSync(join(path, "gen"), { recursive: true });
      writeFileSync(
        join(path, "module.ts"),
        'import type { DocumentModel } from "document-model";\nexport const Many: DocumentModel = {} as DocumentModel;\n',
      );
    }
    await inProject(dir, (project) =>
      modelGeneration.generateAllDocumentModels(project),
    );
    const index = read(dir, "document-models/index.ts");
    expect(index.indexOf("ManyV1 }")).toBeLessThan(index.indexOf("ManyV10 }"));
    expect(index.indexOf("ManyV10 }")).toBeLessThan(index.indexOf("ManyV2 }"));
  });

  it("regenerates and retains a schema-first model reached through an in-package symlink", async () => {
    const state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) =>
      generatePublicDocumentModel(state, project),
    );
    mkdirSync(join(dir, "src"));
    renameSync(
      join(dir, "document-models/subgraph-module"),
      join(dir, "src/subgraph-module"),
    );
    symlinkSync(
      "../src/subgraph-module",
      join(dir, "document-models/subgraph-module"),
      "dir",
    );
    const spec = "src/subgraph-module/subgraph-module.json";
    writeFileSync(
      join(dir, spec),
      JSON.stringify({
        ...readJson(dir, spec),
        description: "Symlinked model",
      }),
    );
    await inProject(dir, (project) =>
      modelGeneration.generateAllDocumentModels(project),
    );
    expect(readJson(dir, "powerhouse.manifest.json").documentModels).toEqual([
      { id: "powerhouse/subgraph", name: "Subgraph Module" },
    ]);
    expect(read(dir, "src/subgraph-module/v1/gen/document-model.ts")).toContain(
      "Symlinked model",
    );
    expect(read(dir, "document-models/index.ts")).toContain("SubgraphModuleV1");
    expect(read(dir, "document-models/document-models.ts")).toContain(
      "SubgraphModuleV1",
    );
  });

  it.each([
    ["the seeded index barrel", undefined],
    ["an index barrel that holds only the empty module marker", "export {};\n"],
  ])("writes the schema-only barrel format over %s", async (_, barrel) => {
    if (barrel !== undefined) {
      writeFileSync(join(dir, "document-models/index.ts"), barrel);
    }
    const state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) =>
      generatePublicDocumentModel(state, project),
    );
    expect(
      existsSync(join(dir, "document-models/subgraph-module/v1/module.ts")),
    ).toBe(true);
    expect(read(dir, "document-models/index.ts")).toBe(
      `/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
export { SubgraphModule as SubgraphModuleV1 } from "./subgraph-module/v1/module.js";
export { upgradeManifests } from "./upgrade-manifests.js";
`,
    );
  });
});

describe("a schema-first package that adds a code-first model", () => {
  it("keeps both models when regenerating despite an obsolete authoring-mode setting", async () => {
    const state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) =>
      generatePublicDocumentModel(state, project),
    );
    const schemaFirstIndex = read(dir, "document-models/index.ts");
    await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
    const scaffolded = AGGREGATES.map((path) => read(dir, path));
    writeConfig(dir, {
      definitionSources: { formatVersion: 1, mode: "schema-first" },
    });

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
      generatePublicDocumentModel(state, project),
    );
    await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
    await inProject(dir, (project) =>
      modelGeneration.generateEditor(
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

describe("the shared barrels", () => {
  async function mixedPackage() {
    const state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) =>
      generatePublicDocumentModel(state, project),
    );
    await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
    return AGGREGATES.map((path) => read(dir, path));
  }

  it("recreate deleted barrels from the model directories alone", async () => {
    const generated = await mixedPackage();
    for (const path of AGGREGATES) rmSync(join(dir, path));
    await inProject(dir, (project) =>
      modelGeneration.generateAllDocumentModels(project),
    );
    expect(AGGREGATES.map((path) => read(dir, path))).toStrictEqual(generated);
  });

  it("are byte-identical across repeated bulk generation", async () => {
    await mixedPackage();
    await inProject(dir, (project) =>
      modelGeneration.generateAllDocumentModels(project),
    );
    const once = tree(dir);
    await inProject(dir, (project) =>
      modelGeneration.generateAllDocumentModels(project),
    );
    expect(tree(dir)).toStrictEqual(once);
  });

  it("drop a removed code-first model's exports and manifest entry", async () => {
    await mixedPackage();
    rmSync(join(dir, "document-models/todo-list"), { recursive: true });
    await inProject(dir, (project) =>
      modelGeneration.generateAllDocumentModels(project),
    );
    for (const path of AGGREGATES) {
      expect(read(dir, path)).not.toContain("codeFirstSource");
      expect(read(dir, path)).not.toContain("todo-list");
    }
    expect(
      readJson(dir, "powerhouse.manifest.json").documentModels,
    ).toStrictEqual([{ id: "powerhouse/subgraph", name: "Subgraph Module" }]);
  });

  it("keep every export and manifest entry when a code-first entry throws", async () => {
    const generated = await mixedPackage();
    const manifest = read(dir, "powerhouse.manifest.json");
    writeFileSync(
      join(dir, "document-models/todo-list/index.ts"),
      'throw new Error("todo list is broken");\n',
    );
    await expect(
      inProject(dir, (project) =>
        modelGeneration.generateAllDocumentModels(project),
      ),
    ).rejects.toThrow("todo list is broken");
    expect(AGGREGATES.map((path) => read(dir, path))).toStrictEqual(generated);
    expect(read(dir, "powerhouse.manifest.json")).toBe(manifest);
  });

  it("keep a legacy documentModels re-export, and add it nowhere else", async () => {
    await mixedPackage();
    expect(read(dir, "document-models/index.ts")).not.toContain(
      "export { documentModels }",
    );
    writeFileSync(
      join(dir, "document-models/index.ts"),
      `${read(dir, "document-models/index.ts")}export { documentModels } from "./document-models.js";\n`,
    );
    await inProject(dir, (project) =>
      modelGeneration.generateAllDocumentModels(project),
    );
    expect(read(dir, "document-models/index.ts")).toContain(
      'export { documentModels } from "./document-models.js";',
    );
    const state = await loadDocumentModel(join(dir, "subgraph-module.json"));
    await inProject(dir, (project) =>
      generatePublicDocumentModel(state, project),
    );
    expect(read(dir, "document-models/index.ts")).toContain(
      'export { documentModels } from "./document-models.js";',
    );
  });
});

/**
 * Relative imports in `dirs` that name no file. Outside ./document-models no
 * path alias exists, so generated code must import by relative path.
 */
function unresolvedImports(root: string, dirs: readonly string[]): string[] {
  return dirs.flatMap((dirName) =>
    readdirSync(join(root, dirName), { recursive: true })
      .map(String)
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) => {
        const path = join(root, dirName, file);
        const text = readFileSync(path, "utf8");
        const aliased =
          dirName !== "document-models" && /from "document-models\//.test(text)
            ? [`${dirName}/${file}: document-models alias`]
            : [];
        const missing = [...text.matchAll(/from "(\.\.?\/[^"]+)"/g)]
          .map(([, specifier]) => specifier)
          .filter((specifier) => {
            const target = resolve(dirname(path), specifier);
            return ![".ts", ".tsx"].some((extension) =>
              existsSync(target.replace(/\.js$/, extension)),
            );
          })
          .map((specifier) => `${dirName}/${file}: ${specifier}`);
        return [...aliased, ...missing];
      }),
  );
}

describe("a configured documentModelsDir", () => {
  it("generates a stored model there and links both styles from the canonical barrels", async () => {
    writeConfig(dir, { documentModelsDir: "./models" });
    await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
    expect(read(dir, "models/todo-list/index.ts")).toContain(
      "export const TodoList",
    );
    expect(read(dir, "document-models/index.ts")).toContain(
      'import * as codeFirstSource0 from "../models/todo-list/index.js";',
    );
    expect(typeCheck(dir)).toBe("");
    const state = await loadDocumentModel(copySchemaFirstSpec(dir));
    await inProject(dir, (project) =>
      generatePublicDocumentModel(state, project),
    );
    await inProject(dir, (project) =>
      modelGeneration.generateEditor(
        {
          editorName: "Subgraph Editor",
          documentTypes: ["powerhouse/subgraph"],
        },
        project,
      ),
    );
    await inProject(dir, (project) =>
      modelGeneration.generateAllDocumentModels(project),
    );

    expect(existsSync(join(dir, "models/subgraph-module/v1/module.ts"))).toBe(
      true,
    );
    expect(existsSync(join(dir, "document-models/subgraph-module"))).toBe(
      false,
    );
    const index = read(dir, "document-models/index.ts");
    expect(index).toContain(
      'export { SubgraphModule as SubgraphModuleV1 } from "../models/subgraph-module/v1/module.js";',
    );
    expect(index).toContain(
      'import * as codeFirstSource0 from "../models/todo-list/index.js";',
    );
    expect(read(dir, "document-models/document-models.ts")).toContain(
      'from "../models/subgraph-module/v1/index.js"',
    );
    expect(read(dir, "document-models/upgrade-manifests.ts")).toContain(
      'from "../models/subgraph-module/upgrades/index.js"',
    );
    expect(read(dir, "editors/subgraph-editor/editor.tsx")).toContain(
      'from "../../models/subgraph-module/index.js";',
    );
    expect(
      unresolvedImports(dir, ["models", "document-models", "editors"]),
    ).toStrictEqual([]);
    expect(
      readJson(dir, "powerhouse.manifest.json").documentModels,
    ).toStrictEqual([
      { id: "acme/todo-list", name: "Todo List" },
      { id: "powerhouse/subgraph", name: "Subgraph Module" },
    ]);
  });
});
