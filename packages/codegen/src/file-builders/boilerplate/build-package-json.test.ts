import { describe, test } from "vitest";
import { buildBoilerplatePackageJson } from "./package.json.js";

describe("Build boilerplate package.json file", () => {
  test("Should build a versioned boilerplate with version", async () => {
    const projectName = "test-project";
    const version = "5.1.0";
    const packageJson = await buildBoilerplatePackageJson({
      projectName,
      version,
    });
    console.log(packageJson);
  });
  test(
    "Should build a versioned boilerplate with tag",
    { timeout: 100000 },
    async () => {
      const projectName = "test-project";
      const testTags = ["", "latest", "dev", "staging"] as string[];
      for (const tag of testTags) {
        const packageJson = await buildBoilerplatePackageJson({
          projectName,
          tag,
        });
        console.log(packageJson);
      }
    },
  );
});
