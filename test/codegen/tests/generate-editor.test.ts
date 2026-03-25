import { generateEditor } from "@powerhousedao/codegen";
import { directoryExists, fileExists } from "@powerhousedao/shared/clis";
import { $ } from "bun";
import { afterAll, describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  DATA,
  TEST_OUTPUT,
  WITH_DOCUMENT_MODELS,
  WITH_EDITORS,
} from "../constants.js";
import { cpForce } from "../utils.js";

const cwd = process.cwd();
const parentOutDir = join(cwd, TEST_OUTPUT);
const dataDir = join(cwd, DATA);

type GenerateEditorOptions = Parameters<typeof generateEditor>[0];

describe("generateEditor", () => {
  afterAll(() => {
    process.chdir(cwd);
  });
  const editorName = "TestDocEditor";
  const documentTypes = ["powerhouse/test-doc"];
  const editorId = "test-document-model-editor";

  const options: GenerateEditorOptions = {
    editorName,
    editorId,
    documentTypes,
    useTsMorph: true,
    skipFormat: false,
    specifiedPackageName: undefined,
    editorDirName: undefined,
  };
  it("should generate a Document Model editor", async () => {
    const outDir = join(parentOutDir, "generate-editor");

    await cpForce(join(dataDir, WITH_DOCUMENT_MODELS), outDir);
    process.chdir(outDir);
    await generateEditor({
      ...options,
    });
    const editorsDir = join(outDir, "editors");
    const editorsFilePath = join(editorsDir, "editors.ts");
    expect(await fileExists(editorsFilePath)).toBe(true);
    const editorsContent = await readFile(editorsFilePath, "utf-8");
    expect(editorsContent).toContain(
      `import { TestDocEditor } from "./test-doc-editor/module.js";`,
    );
    expect(editorsContent).toContain(`export const editors: EditorModule[]`);
    expect(editorsContent).toContain(`TestDocEditor`);

    const editorDir = join(editorsDir, "test-doc-editor");
    expect(await directoryExists(editorDir)).toBe(true);

    const editorPath = join(editorDir, "editor.tsx");
    expect(await fileExists(editorPath)).toBe(true);
    const editorContent = await readFile(editorPath, "utf-8");
    expect(editorContent).toContain(`DocumentStateViewer`);
    expect(editorContent).toContain(`export default function Editor()`);
    expect(editorContent).toContain(`<DocumentToolbar />`);
    expect(editorContent).toContain(`dispatch(actions.setName(name));`);

    const modulePath = join(editorDir, "module.ts");
    expect(await fileExists(modulePath)).toBe(true);
    const moduleContent = await readFile(modulePath, "utf-8");
    expect(moduleContent).toContain(`export const TestDocEditor: EditorModule`);
    expect(moduleContent).toContain(`documentTypes: ["powerhouse/test-doc`);
    expect(moduleContent).toContain(`id: "test-document-model-editor"`);
    expect(moduleContent).toContain(`name: "TestDocEditor"`);

    await $`bun run --cwd ${outDir} tsc --noEmit`;
  });

  it("should append new exports to existing editors.ts file", async () => {
    const outDir = join(parentOutDir, "append-to-existing-editors");
    await cpForce(join(dataDir, WITH_EDITORS), outDir);
    process.chdir(outDir);
    await generateEditor({
      ...options,
    });
    const editorsDir = join(outDir, "editors");
    const editorsFilePath = join(editorsDir, "editors.ts");
    const editorsContent = await readFile(editorsFilePath, "utf-8");
    expect(editorsContent).toContain(`export const editors: EditorModule[]`);
    expect(editorsContent).toContain(`ExistingDocumentEditor`);
    expect(editorsContent).toContain(`ExistingDriveEditor`);
    expect(editorsContent).toContain(`TestDocEditor`);
    await $`bun run --cwd ${outDir} tsc --noEmit`;
  });
});
