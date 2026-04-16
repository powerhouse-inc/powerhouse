import {
  createProject,
  generateApp,
  generateEditor,
} from "@powerhousedao/codegen";
import { $ } from "bun";
import { join } from "path";
import {
  DATA,
  NEW_PROJECT,
  SPEC_VERSION_1,
  SPEC_VERSION_2,
  TEST_PROJECTS,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_DOCUMENT_MODELS_SPEC_2,
  WITH_EDITORS,
  WITH_LEGACY_UNVERSIONED_DOCUMENT_MODELS,
} from "./constants.js";
import {
  cpForce,
  loadDocumentModelsInDir,
  mkdirRecursive,
  rmForce,
} from "./utils.js";

const dataDir = join(process.cwd(), DATA);
const testProjectsDir = join(process.cwd(), TEST_PROJECTS);
const cwd = process.cwd();
export async function generateTestProjects() {
  await rmForce(testProjectsDir);
  await mkdirRecursive(testProjectsDir);
  process.chdir(testProjectsDir);

  await createProject({
    name: NEW_PROJECT,
    packageManager: "pnpm",
    skipGitInit: true,
    skipInstall: true,
  });

  await cpForce(
    join(testProjectsDir, NEW_PROJECT),
    join(testProjectsDir, WITH_LEGACY_UNVERSIONED_DOCUMENT_MODELS),
  );

  await loadDocumentModelsInDir(
    join(dataDir, SPEC_VERSION_1),
    join(testProjectsDir, WITH_LEGACY_UNVERSIONED_DOCUMENT_MODELS),
  );

  await cpForce(
    join(testProjectsDir, NEW_PROJECT),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1),
  );

  await loadDocumentModelsInDir(
    join(dataDir, SPEC_VERSION_1),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1),
  );

  await cpForce(
    join(testProjectsDir, NEW_PROJECT),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2),
  );

  await loadDocumentModelsInDir(
    join(dataDir, SPEC_VERSION_2),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2),
  );

  await cpForce(
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2),
    join(testProjectsDir, WITH_EDITORS),
  );

  await generateEditor(
    {
      editorId: "existing-document-editor",
      editorName: "ExistingDocumentEditor",
      documentTypes: ["powerhouse/test-doc"],
      editorDirName: undefined,
    },
    join(testProjectsDir, WITH_EDITORS),
  );
  await generateApp(
    {
      appId: "existing-app",
      appName: "ExistingApp",
      allowedDocumentTypes: ["powerhouse/test-doc"],
      appDirName: undefined,
      isDragAndDropEnabled: true,
    },
    join(testProjectsDir, WITH_EDITORS),
  );
  process.chdir(cwd);
  await $`prettier ./test-projects --write`;
}
