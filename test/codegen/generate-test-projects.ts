import {
  createProject,
  generateDriveEditor,
  generateEditor,
} from "@powerhousedao/codegen";
import { join } from "path";
import { readPackage } from "read-pkg";
import { writePackage } from "write-package";
import {
  DATA,
  DOCUMENT_MODELS,
  NEW_PROJECT,
  SPEC_VERSION_1,
  SPEC_VERSION_2,
  TEST_PROJECTS,
  WITH_DOCUMENT_MODELS,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_DOCUMENT_MODELS_SPEC_2,
  WITH_EDITORS,
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

  const packageJson = await readPackage();
  packageJson.dependencies = {};
  packageJson.devDependencies = {};
  packageJson.peerDependencies = {};
  packageJson.optionalDependencies = {};
  await writePackage(packageJson);

  await rmForce(WITH_DOCUMENT_MODELS);

  await cpForce(
    join(testProjectsDir, NEW_PROJECT),
    join(testProjectsDir, WITH_DOCUMENT_MODELS),
  );

  await loadDocumentModelsInDir(
    join(dataDir, DOCUMENT_MODELS),
    join(testProjectsDir, WITH_DOCUMENT_MODELS),
    false,
  );

  await rmForce(WITH_DOCUMENT_MODELS_SPEC_1);

  await cpForce(
    join(testProjectsDir, NEW_PROJECT),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1),
  );

  await loadDocumentModelsInDir(
    join(dataDir, SPEC_VERSION_1),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_1),
    true,
  );

  await rmForce(WITH_DOCUMENT_MODELS_SPEC_2);

  await cpForce(
    join(testProjectsDir, NEW_PROJECT),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2),
  );

  await loadDocumentModelsInDir(
    join(dataDir, SPEC_VERSION_2),
    join(testProjectsDir, WITH_DOCUMENT_MODELS_SPEC_2),
    true,
  );

  await rmForce(WITH_EDITORS);

  await cpForce(
    join(testProjectsDir, WITH_DOCUMENT_MODELS),
    join(testProjectsDir, WITH_EDITORS),
  );

  process.chdir(join(testProjectsDir, WITH_EDITORS));
  await generateEditor({
    editorId: "existing-document-editor",
    editorName: "ExistingDocumentEditor",
    documentTypes: ["powerhouse/test-doc"],
    useTsMorph: true,
    skipFormat: false,
    specifiedPackageName: undefined,
    editorDirName: undefined,
  });
  await generateDriveEditor({
    driveEditorId: "existing-drive-editor",
    driveEditorName: "ExistingDriveEditor",
    allowedDocumentTypes: ["powerhouse/test-doc"],
    specifiedPackageName: undefined,
    driveEditorDirName: undefined,
    useTsMorph: true,
    isDragAndDropEnabled: true,
    skipFormat: false,
  });
  process.chdir(cwd);
}
