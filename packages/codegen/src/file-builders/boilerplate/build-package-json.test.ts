import { validate } from "package-json-validator";
import { describe, expect, test } from "vitest";
import { buildBoilerplatePackageJson } from "./package.json.js";

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
  test(
    "Should build a versioned boilerplate with tag",
    { timeout: 100000 },
    async () => {
      const name = "test-project";
      const testTags = ["", "latest", "dev", "staging"] as string[];
      for (const tag of testTags) {
        const packageJson = await buildBoilerplatePackageJson({
          name,
          tag,
        });
        const validationResult = validate(packageJson);
        expect(validationResult.valid).toBe(true);
      }
    },
  );
});
