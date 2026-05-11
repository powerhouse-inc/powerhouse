import { generateAllEditors, generateEditor } from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  getEditorMetadata,
} from "@powerhousedao/codegen/utils";
import { dirname } from "node:path";
import type { GenerateEditorArgs } from "../types.js";

export async function startGenerateEditor(
  args: GenerateEditorArgs,
  projectDir: string,
) {
  const { name, documentType, dir, all, debug } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (all) {
    await generateAllEditors(project);
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
    const editorArgs = getEditorMetadata(project, dirname(dir));
    if (!editorArgs) {
      throw new Error(`Failed to get data for editor in dir "${dir}"`);
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
  } else {
    console.log("Please specify either `name`, `dir`, or `all`.");
    return;
  }
  await project.save();
}
