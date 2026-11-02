import { mkdirSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateEditor as generatePublicEditor,
  selectModelGeneration,
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
  writeConfig,
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

const generation = () =>
  selectModelGeneration({
    projectDir: dir,
  });

const generateEditor = (request = todoEditor) =>
  inProject(dir, (project) => generatePublicEditor(request, project));

function select(entries: unknown[]) {
  writeConfig(dir, {
    definitionSources: { formatVersion: 1, mode: "code-first", entries },
  });
}

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

  it("imports the latest of two versions from the source that names it", async () => {
    addTodoListVersion2(dir);
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src/models.ts"),
      'export { TodoListV1, TodoListV2, todoListUpgradeManifest } from "../document-models/todo-list/index.js";\n',
    );
    select([{ specifier: "./src/models.ts" }]);
    await generateEditor();
    expect(read(dir, "editors/todo-editor/editor.tsx")).toContain(
      'import { TodoListV2 as documentModel } from "../../src/models.js";',
    );
  });

  it("refuses a version exported only inside another value", async () => {
    writeFileSync(
      join(dir, "document-models/list.ts"),
      'import { TodoList, todoListUpgradeManifest } from "./todo-list/index.js";\nexport const all = { models: [TodoList], manifest: todoListUpgradeManifest };\n',
    );
    select([{ specifier: "./document-models/list.ts" }]);
    await expect(generateEditor()).rejects.toThrow(
      "exports version 1 of acme/todo-list only inside another value",
    );
  });

  it("keeps an existing editor when its version lost its name", async () => {
    await generateEditor();
    const files = ["editor.tsx", "module.ts"].map((name) =>
      read(dir, `editors/todo-editor/${name}`),
    );
    writeFileSync(
      join(dir, "document-models/list.ts"),
      'import { TodoList, todoListUpgradeManifest } from "./todo-list/index.js";\nexport const all = { models: [TodoList], manifest: todoListUpgradeManifest };\n',
    );
    select([{ specifier: "./document-models/list.ts" }]);
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
      "Failed to get document type metadata for document type: acme/missing.",
    );
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
    mkdirSync(join(dir, "src"));
    writeFileSync(
      join(dir, "src/models.ts"),
      [
        'export { TodoList as DocumentOf, todoListUpgradeManifest } from "../document-models/todo-list/index.js";',
        'export { Notes as documentModel, notesUpgradeManifest } from "../document-models/notes/index.js";',
        "",
      ].join("\n"),
    );
    select([
      { specifier: "./document-models/editor/index.ts" },
      { specifier: "./src/models.ts" },
    ]);

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
      'import { DocumentOf as documentModel } from "../../src/models.js";',
    );
    expect(read(dir, "editors/notes-editor/editor.tsx")).toContain(
      'import { documentModel } from "../../src/models.js";',
    );
  }, 20_000);
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
}, 20_000);
