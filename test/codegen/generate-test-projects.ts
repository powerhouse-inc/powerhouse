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
  SPEC_VERSION_1,
  SPEC_VERSION_2,
  TEST_PROJECT,
  WITH_DOCUMENT_MODELS,
  WITH_DOCUMENT_MODELS_SPEC_1,
  WITH_DOCUMENT_MODELS_SPEC_2,
  WITH_EDITORS,
} from "./constants.js";
import { cpForce, loadDocumentModelsInDir, rmForce } from "./utils.js";

const dataDir = join(process.cwd(), DATA);

process.chdir(dataDir);

await rmForce(TEST_PROJECT);

await createProject({
  name: TEST_PROJECT,
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

await cpForce(join(dataDir, TEST_PROJECT), join(dataDir, WITH_DOCUMENT_MODELS));

await loadDocumentModelsInDir(
  join(dataDir, DOCUMENT_MODELS),
  join(dataDir, WITH_DOCUMENT_MODELS),
  false,
);

await rmForce(WITH_DOCUMENT_MODELS_SPEC_1);

await cpForce(
  join(dataDir, TEST_PROJECT),
  join(dataDir, WITH_DOCUMENT_MODELS_SPEC_1),
);

await loadDocumentModelsInDir(
  join(dataDir, SPEC_VERSION_1),
  join(dataDir, WITH_DOCUMENT_MODELS_SPEC_1),
  true,
);

await rmForce(WITH_DOCUMENT_MODELS_SPEC_2);

await cpForce(
  join(dataDir, TEST_PROJECT),
  join(dataDir, WITH_DOCUMENT_MODELS_SPEC_2),
);

await loadDocumentModelsInDir(
  join(dataDir, SPEC_VERSION_2),
  join(dataDir, WITH_DOCUMENT_MODELS_SPEC_2),
  true,
);

await rmForce(WITH_EDITORS);

await cpForce(join(dataDir, WITH_DOCUMENT_MODELS), join(dataDir, WITH_EDITORS));

const cwd = process.cwd();

process.chdir(join(dataDir, WITH_EDITORS));
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
