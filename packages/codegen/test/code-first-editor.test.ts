import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  generateAll,
  generateCodeFirstDocumentModel,
  generateEditor,
} from "../src/codegen/generate.js";
import { buildTsMorphProject } from "../src/utils/index.mts";
import {
  addTaskVersion2,
  createCodeFirstPackage,
} from "./code-first-package.js";

let projectDir: string;

const path = (...segments: string[]) => join(projectDir, ...segments);
const read = (...segments: string[]) => readFileSync(path(...segments), "utf8");

async function inProject(generate: (project: Project) => Promise<unknown>) {
  const project = buildTsMorphProject(projectDir);
  await generate(project);
  await project.save();
}

const generateTaskEditor = (documentType = "acme-things/task") =>
  inProject((project) =>
    generateEditor(
      { editorName: "TaskEditor", documentTypes: [documentType] },
      project,
    ),
  );

function selectEntries(entries: unknown[]) {
  const config = JSON.parse(read("powerhouse.config.json")) as {
    definitionSources: { entries: unknown[] };
  };
  config.definitionSources.entries = entries;
  writeFileSync(
    path("powerhouse.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

function replaceTaskExport() {
  const index = read("document-models/task/index.ts");
  const named = "export const taskV1 = taskFamily.at(1);";
  expect(index).toContain(named);
  writeFileSync(
    path("document-models/task/index.ts"),
    index.replace(named, "const taskV1 = taskFamily.at(1);"),
  );
}

const taskImport =
  'import { taskV1 } from "../../document-models/task/index.js";';

function taskSources() {
  return readdirSync(path("document-models/task"), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const file = join(entry.parentPath, entry.name);
      return [file, readFileSync(file, "utf8")];
    });
}

beforeEach(async () => {
  projectDir = createCodeFirstPackage();
  await inProject((project) =>
    generateCodeFirstDocumentModel(
      {
        name: "task",
        documentType: "acme-things/task",
        author: { name: "acme-things", website: null },
      },
      project,
    ),
  );
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

describe("generateEditor for a code-first document model", () => {
  it("imports the latest version by its export name", async () => {
    await generateTaskEditor();

    const editor = read("editors/task-editor/editor.tsx");
    expect(editor).toContain(
      'import { taskV1 } from "../../document-models/task/index.js";',
    );
    expect(editor).toContain(
      "type TaskDocument = DocumentOf<typeof taskV1>;\ntype TaskAction = ActionOf<typeof taskV1>;",
    );
    expect(editor).toContain("dispatch(taskV1.actions.setName(name));");
    expect(read("editors/task-editor/module.ts")).toContain(
      'documentTypes: ["acme-things/task"],',
    );
    expect(
      JSON.parse(read("powerhouse.manifest.json")) as unknown,
    ).toMatchObject({
      editors: [
        {
          name: "TaskEditor",
          id: "task-editor",
          documentTypes: ["acme-things/task"],
        },
      ],
    });
  });

  it("regenerates with generateAll and leaves the model sources alone", async () => {
    await generateTaskEditor();
    const editor = read("editors/task-editor/editor.tsx");
    const sources = taskSources();

    await inProject(generateAll);

    expect(read("editors/task-editor/editor.tsx")).toBe(editor);
    expect(taskSources()).toStrictEqual(sources);
    expect(
      JSON.parse(read("powerhouse.manifest.json")) as unknown,
    ).toMatchObject({
      editors: [
        {
          name: "TaskEditor",
          id: "task-editor",
          documentTypes: ["acme-things/task"],
        },
      ],
    });
  });

  it("fails for a type no model declares", async () => {
    await expect(generateTaskEditor("nope/nope")).rejects.toThrow(
      "Failed to get document type metadata for document type: nope/nope.",
    );
  });

  it("refuses a version that is exported only inside a collection", async () => {
    replaceTaskExport();

    await expect(generateTaskEditor()).rejects.toThrow(
      "./document-models/task/index.ts exports version 1 of acme-things/task only inside another value, so an editor cannot import it by name. Export that version by name from ./document-models/task/index.ts, as a reactor worker also imports a version by its export name.",
    );
  });

  it("imports the latest of several versions", async () => {
    addTaskVersion2(projectDir);
    await generateTaskEditor();

    expect(read("editors/task-editor/editor.tsx")).toContain(
      'import { taskV2 } from "../../document-models/task/index.js";',
    );
  });

  it("imports a named export rather than the default export", async () => {
    writeFileSync(
      path("document-models/task/index.ts"),
      `${read("document-models/task/index.ts")}\nexport default taskV1;\n`,
    );
    await generateTaskEditor();

    expect(read("editors/task-editor/editor.tsx")).toContain(taskImport);
  });

  it("imports from the source that exports the version by name", async () => {
    writeFileSync(
      path("document-models/all.ts"),
      'import { taskV1 } from "./task/index.js";\n\nexport const models = [taskV1];\n',
    );
    selectEntries([
      { specifier: "./document-models/all.ts" },
      { specifier: "./document-models/task/index.ts" },
    ]);
    await generateTaskEditor();

    expect(read("editors/task-editor/editor.tsx")).toContain(taskImport);
  });

  it("keeps an existing editor whose version is no longer exported by name", async () => {
    await generateTaskEditor();
    const editor = read("editors/task-editor/editor.tsx");
    replaceTaskExport();

    await generateTaskEditor();

    expect(read("editors/task-editor/editor.tsx")).toBe(editor);
  });

  it("skips a malformed model of another type", async () => {
    writeFileSync(
      path("model.ts"),
      "export const model = { reducer: (state: unknown) => state, documentModel: {} };\n",
    );
    selectEntries([
      { specifier: "./document-models/task/index.ts" },
      { specifier: "./model.ts" },
    ]);
    await generateTaskEditor();

    expect(read("editors/task-editor/editor.tsx")).toContain(taskImport);
  });

  it("reads an empty entry list as no code-first sources", async () => {
    selectEntries([]);

    await expect(generateTaskEditor()).rejects.toThrow(
      "Failed to get document type metadata for document type: acme-things/task.",
    );
  });
});
