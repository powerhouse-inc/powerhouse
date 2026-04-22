import {
  createProject,
  generateApp,
  generateEditor,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import {
  NEW_PROJECT,
  SPEC_VERSION_1,
  SPEC_VERSION_2,
  TEST_PROJECTS,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_DOCUMENT_MODELS_SPEC_2,
  WITH_EDITORS,
} from "./constants.js";
import {
  cpForce,
  loadDocumentModelsInDir,
  mkdirRecursive,
  rmForce,
  runTsc,
} from "./utils.js";

export async function generateTestProjects() {
  await rmForce(TEST_PROJECTS);
  await mkdirRecursive(TEST_PROJECTS);

  process.chdir(TEST_PROJECTS);
  await createProject({
    name: "new-project",
    packageManager: "pnpm",
    skipGitInit: true,
    skipInstall: true,
  });
  await runTsc(NEW_PROJECT);
  await cpForce(NEW_PROJECT, WITH_DOCUMENT_MODELS_SPEC_1);
  await loadDocumentModelsInDir(SPEC_VERSION_1, WITH_DOCUMENT_MODELS_SPEC_1);
  await runTsc(WITH_DOCUMENT_MODELS_SPEC_1);

  await cpForce(NEW_PROJECT, WITH_DOCUMENT_MODELS_SPEC_2);

  await loadDocumentModelsInDir(SPEC_VERSION_2, WITH_DOCUMENT_MODELS_SPEC_2);

  await runTsc(WITH_DOCUMENT_MODELS_SPEC_2);

  await cpForce(WITH_DOCUMENT_MODELS_SPEC_2, WITH_EDITORS);

  process.chdir(WITH_EDITORS);
  const project = buildTsMorphProject(WITH_EDITORS);
  await generateEditor(
    {
      editorId: "existing-document-editor",
      editorName: "ExistingDocumentEditor",
      documentTypes: ["powerhouse/test-doc"],
      editorDirName: undefined,
    },
    project,
  );
  await generateApp(
    {
      appId: "existing-app",
      appName: "ExistingApp",
      allowedDocumentTypes: ["powerhouse/test-doc"],
      appDirName: undefined,
      isDragAndDropEnabled: true,
    },
    project,
  );

  await project.save();
  await runTsc(WITH_EDITORS);
}
