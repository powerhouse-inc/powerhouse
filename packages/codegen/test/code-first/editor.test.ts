import {
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prop } from "remeda";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateEditor as generatePublicEditor,
  modelGeneration,
  type GenerateEditorRequest,
} from "../../src/codegen/index.js";
import { buildTsMorphProject, formatFileText } from "../../src/utils/index.mjs";
import {
  addTodoListVersion2,
  createPackage,
  inProject,
  read,
  readJson,
  removePackage,
  todo,
  typeCheck,
  generateCodeFirstDocumentModel,
} from "./package.js";

let dir: string;
beforeEach(async () => {
  dir = await createPackage();
  await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
});
afterEach(() => removePackage(dir));

const todoEditor: GenerateEditorRequest = {
  editorName: "Todo Editor",
  documentTypes: ["acme/todo-list"],
};

const generation = () => modelGeneration;

const generateEditor = (request = todoEditor) =>
  inProject(dir, (project) => generatePublicEditor(request, project));

/** Moves a model's authored entry to family.ts and gives it a new index.ts. */
function reexport(model: string, entry: string) {
  const directory = join(dir, "document-models", model);
  renameSync(join(directory, "index.ts"), join(directory, "family.ts"));
  writeFileSync(join(directory, "index.ts"), entry);
}

/** Rebuilds the barrels after an entry changed what it exports. */
const regenerateModels = () =>
  inProject(dir, (project) => generation().generateAllDocumentModels(project));

const ONLY_INSIDE_ANOTHER_VALUE =
  'import { TodoList, todoListUpgradeManifest } from "./family.js";\nexport const all = { models: [TodoList], manifest: todoListUpgradeManifest };\n';

describe("generateEditor for a code-first model", () => {
  it("imports the latest version by its export name and registers the editor", async () => {
    await generateEditor();
    const editor = read(dir, "editors/todo-editor/editor.tsx");
    expect(editor).toContain(
      'import { TodoList as documentModel } from "../../document-models/todo-list/index.js";',
    );
    expect(editor).toContain(
      "}: EditorProps<\n  DocumentOf<typeof documentModel>,\n  ActionOf<typeof documentModel>\n>) {",
    );
    expect(editor).toContain("dispatch(documentModel.actions.setName(name),");
    expect(
      [...editor.matchAll(/<h3 className="text-base">([^<]+)<\/h3>/g)].map(
        ([, title]) => title,
      ),
    ).toStrictEqual([
      "ID",
      "Created",
      "Type",
      "Last Modified",
      "Document State",
    ]);
    expect(editor).toContain(
      "value={new Date(document.header.createdAtUtcIso).toLocaleString()}",
    );
    expect(await formatFileText("editor.tsx", editor)).toBe(editor);
    expect(read(dir, "editors/todo-editor/module.ts")).toBe(`/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type * as documentModelTypes from "document-model";
import { lazy } from "react";
import type { TodoList as documentModel } from "../../document-models/todo-list/index.js";

/** Document editor module for the "acme/todo-list" document type */
export const TodoEditor: documentModelTypes.EditorModule<
  documentModelTypes.DocumentOf<typeof documentModel>,
  documentModelTypes.ActionOf<typeof documentModel>
> = {
  Component: lazy(() => import("./editor.js")),
  documentTypes: ["acme/todo-list"],
  config: {
    id: "todo-editor",
    name: "Todo Editor",
  },
};
`);
    expect(read(dir, "editors/editors.ts")).toContain(
      'import { TodoEditor } from "./todo-editor/module.js";',
    );
    expect(read(dir, "editors/index.ts")).toContain(
      'export { TodoEditor } from "./todo-editor/module.js";',
    );
    expect(readJson(dir, "powerhouse.manifest.json").editors).toStrictEqual([
      {
        id: "todo-editor",
        name: "Todo Editor",
        documentTypes: ["acme/todo-list"],
      },
    ]);
  });

  it("regenerates every editor and keeps an edited component", async () => {
    await generateEditor();
    const edited = read(dir, "editors/todo-editor/editor.tsx").replace(
      "Document Name",
      "List Name",
    );
    writeFileSync(join(dir, "editors/todo-editor/editor.tsx"), edited);
    const typed = read(dir, "editors/todo-editor/module.ts");
    writeFileSync(
      join(dir, "editors/todo-editor/module.ts"),
      typed.replace(/EditorModule<[^=]*>/, "EditorModule"),
    );

    const result = await inProject(dir, (project) =>
      generation().generateAllEditors(project),
    );

    expect(result).toStrictEqual({
      editors: [
        {
          name: "Todo Editor",
          id: "todo-editor",
          dirName: "todo-editor",
          documentTypes: ["acme/todo-list"],
        },
      ],
      unreadableDirs: [],
    });
    expect(read(dir, "editors/todo-editor/editor.tsx")).toBe(edited);
    expect(read(dir, "editors/todo-editor/module.ts")).toBe(typed);
  });

  it("imports the latest of two versions by the name its entry exports", async () => {
    addTodoListVersion2(dir);
    reexport(
      "todo-list",
      'export { TodoListV1, TodoListV2, todoListUpgradeManifest } from "./family.js";\n',
    );
    await generateEditor();
    expect(read(dir, "editors/todo-editor/editor.tsx")).toContain(
      'import { TodoListV2 as documentModel } from "../../document-models/todo-list/index.js";',
    );
  });

  it("refuses a version exported only inside another value", async () => {
    reexport("todo-list", ONLY_INSIDE_ANOTHER_VALUE);
    await expect(generateEditor()).rejects.toThrow(
      "exports version 1 of acme/todo-list only inside another value",
    );
  });

  it("keeps an existing editor when its version lost its name", async () => {
    await generateEditor();
    const files = ["editor.tsx", "module.ts"].map((name) =>
      read(dir, `editors/todo-editor/${name}`),
    );
    reexport("todo-list", ONLY_INSIDE_ANOTHER_VALUE);
    await generateEditor();
    expect(
      ["editor.tsx", "module.ts"].map((name) =>
        read(dir, `editors/todo-editor/${name}`),
      ),
    ).toStrictEqual(files);
  });

  it("fails for a document type no model declares", async () => {
    await expect(
      generateEditor({ ...todoEditor, documentTypes: ["acme/missing"] }),
    ).rejects.toThrow(
      "No code-first or schema-first document model in this package declares document type acme/missing.\nCode-first models declare: acme/todo-list.\nPass --document-type with a document type a model declares.",
    );
  });

  it("names the stale editor and its fix after the model's document type changes", async () => {
    await generateEditor();
    const model = join(dir, "document-models/todo-list");
    for (const entry of readdirSync(model, { recursive: true })) {
      const file = join(model, String(entry));
      if (!file.endsWith(".ts")) continue;
      const text = readFileSync(file, "utf8");
      writeFileSync(
        file,
        text.replaceAll("acme/todo-list", "acme/renamed-list"),
      );
    }

    await expect(
      inProject(dir, (project) => generation().generateAllEditors(project)),
    ).rejects.toThrow(
      "editors/todo-editor/module.ts edits document type acme/todo-list, which no code-first or schema-first document model in this package declares.\nCode-first models declare: acme/renamed-list.\nIf the model's document type changed, set documentTypes in editors/todo-editor/module.ts to the new type, then generate the editor again.",
    );

    const module = join(dir, "editors/todo-editor/module.ts");
    writeFileSync(
      module,
      readFileSync(module, "utf8").replaceAll(
        '"acme/todo-list"',
        '"acme/renamed-list"',
      ),
    );
    const result = await inProject(dir, (project) =>
      generation().generateAllEditors(project),
    );
    expect(result.editors.map(prop("documentTypes"))).toStrictEqual([
      ["acme/renamed-list"],
    ]);
  });
});

const designSystem = fileURLToPath(
  new URL("../../../design-system/", import.meta.url),
);

/** Lets `tsc` resolve the React and design-system imports of an editor. */
function linkEditorDependencies() {
  for (const [target, link] of [
    ["node_modules/react", "react"],
    ["node_modules/@types/react", "@types/react"],
    ["", "@powerhousedao/design-system"],
  ]) {
    mkdirSync(dirname(join(dir, "node_modules", link)), { recursive: true });
    symlinkSync(
      join(designSystem, target),
      join(dir, "node_modules", link),
      "junction",
    );
  }
  renameSync(join(dir, "tsconfig.json"), join(dir, "tsconfig.base.json"));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      extends: "./tsconfig.base.json",
      compilerOptions: { jsx: "react-jsx" },
    }),
  );
}

describe("an editor for a model whose export name a template also uses", () => {
  it("type-checks for models named Editor, DocumentOf and documentModel", async () => {
    linkEditorDependencies();
    for (const name of ["Editor", "Notes"]) {
      await generateCodeFirstDocumentModel(
        { ...todo, name, documentType: `acme/${name.toLowerCase()}` },
        buildTsMorphProject(dir),
      );
    }
    reexport(
      "todo-list",
      'export { TodoList as DocumentOf, todoListUpgradeManifest } from "./family.js";\n',
    );
    reexport(
      "notes",
      'export { Notes as documentModel, notesUpgradeManifest } from "./family.js";\n',
    );
    await regenerateModels();

    await generateEditor({
      editorName: "Editor",
      documentTypes: ["acme/editor"],
    });
    await generateEditor();
    await generateEditor({
      editorName: "Notes Editor",
      documentTypes: ["acme/notes"],
    });

    expect(typeCheck(dir)).toBe("");
    expect(read(dir, "editors/editor/editor.tsx")).toContain(
      'import { Editor as documentModel } from "../../document-models/editor/index.js";',
    );
    expect(read(dir, "editors/editor/module.ts")).toContain(
      "export const Editor: documentModelTypes.EditorModule<",
    );
    expect(read(dir, "editors/todo-editor/editor.tsx")).toContain(
      'import { DocumentOf as documentModel } from "../../document-models/todo-list/index.js";',
    );
    expect(read(dir, "editors/notes-editor/editor.tsx")).toContain(
      'import { documentModel } from "../../document-models/notes/index.js";',
    );
  });
});

it("type-checks editor names that match the framework type imports", async () => {
  linkEditorDependencies();
  for (const editorName of [
    "Editor Module",
    "Action Of",
    "Document Of",
    "Document Model Types",
  ]) {
    await generateEditor({ editorName, documentTypes: ["acme/todo-list"] });
  }
  expect(typeCheck(dir)).toBe("");
});
