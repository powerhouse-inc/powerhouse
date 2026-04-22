import { buildBoilerplatePackageJson } from "@powerhousedao/codegen/file-builders";
import { describe, expect, test } from "bun:test";
import { validate } from "package-json-validator";

describe("Build boilerplate package.json file", () => {
  test("Should build a versioned boilerplate with version", async () => {
    const name = "test-project";
    const version = "5.0.1";
    const packageJson = await buildBoilerplatePackageJson({
      name,
      version,
    });
    const validationResult = validate(packageJson);
    expect(validationResult.valid).toBe(true);
  });
  test("Should build a versioned boilerplate with tag", async () => {
    const name = "test-project";
    const testTags = ["", "latest", "dev"] as string[];
    for (const tag of testTags) {
      const packageJson = await buildBoilerplatePackageJson({
        name,
        tag,
      });
      const validationResult = validate(packageJson);
      if (!validationResult.valid) {
        console.log(validationResult);
      }
      expect(validationResult.valid).toBe(true);
    }
  });
});
