import { generateAllEditors, generateEditor } from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  getEditorMetadata,
} from "@powerhousedao/codegen/utils";
import {
  extractEditorDocuments,
  generateEditorFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { DocumentEditorDocument } from "@powerhousedao/vetra/document-models/document-editor";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GenerateEditorArgs } from "../types.js";
import { resolveModuleDirName } from "../utils/module-dir.js";

const MODULE_FILE_EXPECTATION =
  "an EditorModule with string literals for config.id, config.name and documentTypes";

export async function startGenerateEditor(
  args: GenerateEditorArgs,
  projectDir: string,
) {
  const { name, documentType, document, dir, all, extract, debug } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (extract) {
    const docs = extractEditorDocuments(project);
    if (docs.length === 0) {
      console.log("No document editors found in editors/.");
    }
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
  const report: string[] = [];
  if (all) {
    const { editors, unreadableDirs } = await generateAllEditors(project);
    if (editors.length === 0 && unreadableDirs.length === 0) {
      report.push("No document editors found in editors/.");
    }
    for (const editor of editors) {
      report.push(
        `Regenerated editor "${editor.name}" in editors/${editor.dirName}`,
      );
    }
    for (const dirName of unreadableDirs) {
      console.warn(
        `Skipped editors/${dirName}: expected its module.ts to export ${MODULE_FILE_EXPECTATION}. Kept the manifest's editors.`,
      );
    }
  } else if (document) {
    const doc = (await getDocument(document)) as DocumentEditorDocument;
    await generateEditorFromDocument(doc, project);
  } else if (name) {
    if (!documentType) {
      throw new Error(
        "Please specify a document type for the new editor to generate.",
      );
    }
    await generateEditor(
      { editorName: name, documentTypes: [documentType] },
      project,
    );
  } else if (dir) {
    const dirName = resolveModuleDirName(
      projectDir,
      "editors",
      dir,
      "my-editor",
    );
    if (!existsSync(join(projectDir, "editors", dirName, "module.ts"))) {
      throw new Error(`editors/${dirName} has no module.ts.`);
    }
    const editorArgs = getEditorMetadata(project, dirName);
    if (!editorArgs) {
      throw new Error(
        `Could not read editors/${dirName}/module.ts: expected ${MODULE_FILE_EXPECTATION}.`,
      );
    }
    if (editorArgs.documentTypes.includes("powerhouse/document-drive")) {
      throw new Error(
        `editors/${dirName} is a drive app, not a document editor. Use \`ph-cli generate app --dir ${dirName}\` instead.`,
      );
    }
    const {
      name: editorName,
      id: editorId,
      dirName: editorDirName,
      documentTypes,
    } = editorArgs;
    await generateEditor(
      {
        editorName,
        editorId,
        editorDirName,
        documentTypes,
      },
      project,
    );
    report.push(
      `Regenerated editor "${editorName}" in editors/${editorDirName}`,
    );
  } else {
    console.log(
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    );
    return;
  }
  await project.save();
  for (const line of report) {
    console.log(line);
  }
}
