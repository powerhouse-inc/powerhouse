import { createProject } from "@powerhousedao/codegen";
import { rm } from "fs/promises";
import { readPackage } from "read-pkg";
import { writePackage } from "write-package";

const testsDataDir = "./data";
const testProjectName = "test-project";

process.chdir(testsDataDir);

await rm(testProjectName, { recursive: true, force: true });

await createProject({
  name: testProjectName,
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
