import { createProject } from "@powerhousedao/codegen";
import { cp, rm } from "fs/promises";
import { join } from "path";
import { readPackage } from "read-pkg";
import { writePackage } from "write-package";
import { loadDocumentModelsInDir } from "./utils.js";

const dataDir = join(process.cwd(), "data");
const testProject = "test-project";

process.chdir(dataDir);

await rm(testProject, { recursive: true, force: true });

await createProject({
  name: testProject,
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

const testProjectWithDocumentModels = "test-project-with-document-models";

await rm(testProjectWithDocumentModels, {
  recursive: true,
  force: true,
});

await cp(
  join(dataDir, testProject),
  join(dataDir, testProjectWithDocumentModels),
  {
    recursive: true,
    force: true,
  },
);

await loadDocumentModelsInDir(
  join(dataDir, "document-models"),
  join(dataDir, testProjectWithDocumentModels),
  false,
);

const withDocumentModelsSpec1 = "with-document-models-at-spec-1";

await rm(withDocumentModelsSpec1, {
  recursive: true,
  force: true,
});

await cp(join(dataDir, testProject), join(dataDir, withDocumentModelsSpec1), {
  recursive: true,
  force: true,
});

await loadDocumentModelsInDir(
  join(dataDir, "spec-version-1"),
  join(dataDir, withDocumentModelsSpec1),
  true,
);

const withDocumentModelsSpec2 = "with-document-models-at-spec-2";

await rm(withDocumentModelsSpec2, {
  recursive: true,
  force: true,
});

await cp(join(dataDir, testProject), join(dataDir, withDocumentModelsSpec2), {
  recursive: true,
  force: true,
});

await loadDocumentModelsInDir(
  join(dataDir, "spec-version-2"),
  join(dataDir, withDocumentModelsSpec2),
  true,
);
