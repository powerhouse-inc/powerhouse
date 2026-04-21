import {
  createProject,
  generateApp,
  generateEditor,
} from "@powerhousedao/codegen";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
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
} from "./constants.js";
import {
  cpForce,
  loadDocumentModelsInDir,
  mkdirRecursive,
  rmForce,
  runTsc,
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
  await runTsc(join(testProjectsDir, NEW_PROJECT));

  await cpForce(
    join(testProjectsDir, NEW_PROJECT),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1),
  );

  await loadDocumentModelsInDir(
    join(dataDir, SPEC_VERSION_1),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1),
  );
  await runTsc(join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1));

  await cpForce(
    join(testProjectsDir, NEW_PROJECT),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2),
  );

  await loadDocumentModelsInDir(
    join(dataDir, SPEC_VERSION_2),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2),
  );

  await runTsc(join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2));

  await cpForce(
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2),
    join(testProjectsDir, WITH_EDITORS),
  );

  process.chdir(join(testProjectsDir, WITH_EDITORS));
  const project = buildTsMorphProject(join(testProjectsDir, WITH_EDITORS));

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

  process.chdir(cwd);
  await runTsc(join(testProjectsDir, WITH_EDITORS));
  await $`prettier ./test-projects --write`;
}
