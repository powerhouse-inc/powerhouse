import { generateManifest } from "@powerhousedao/codegen";
import type {
  PartialPowerhouseManifest,
  PowerhouseManifest,
} from "@powerhousedao/config";
import { fileExists } from "@powerhousedao/shared/clis";
import { describe, expect, it } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NEW_PROJECT, TEST_OUTPUT, TEST_PROJECTS } from "../constants.js";
import { cpForce, mkdirRecursive, rmForce } from "../utils.js";

const parentOutDir = join(process.cwd(), TEST_OUTPUT);
const testProjectsDir = join(process.cwd(), TEST_PROJECTS);
const testOutputParentDir = join(parentOutDir, "generate-manifest");
await rmForce(testOutputParentDir);
await mkdirRecursive(testOutputParentDir);

describe("generateManifest", () => {
  it("should generate a new manifest from scratch with partial data", async () => {
    const manifestData = {
      name: "@test/package",
      description: "Test package description",
    };

    const testOutDirPath = join(testOutputParentDir, "manifest-from-scratch");
    await mkdirRecursive(testOutDirPath);
    const manifestPath = generateManifest(manifestData, testOutDirPath);

    expect(await fileExists(manifestPath)).toBe(true);
    expect(manifestPath).toBe(join(testOutDirPath, "powerhouse.manifest.json"));

    const content = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.name).toBe("@test/package");
    expect(manifest.description).toBe("Test package description");
    expect(manifest.category).toBe("");
    expect(manifest.publisher).toEqual({ name: "", url: "" });
    expect(manifest.documentModels).toEqual([]);
    expect(manifest.editors).toEqual([]);
    expect(manifest.apps).toEqual([]);
    expect(manifest.subgraphs).toEqual([]);
    expect(manifest.importScripts).toEqual([]);
  });

  it("should update existing manifest preserving all existing fields", async () => {
    const updateData = {
      name: "@updated/package",
      description: "Updated description",
    };
    const testOutDirPath = join(
      testOutputParentDir,
      "update-existing-manifest",
    );
    await cpForce(
      join(testProjectsDir, NEW_PROJECT, "powerhouse.manifest.json"),
      join(testOutDirPath, "powerhouse.manifest.json"),
    );
    const manifestPath = generateManifest(updateData, testOutDirPath);
    const content = await readFile(manifestPath, "utf-8");

    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.name).toBe("@updated/package");
    expect(manifest.description).toBe("Updated description");
    expect(manifest.category).toBe("");
    expect(manifest.publisher).toEqual({
      name: "",
      url: "",
    });
  });

  it("should update publisher fields partially", async () => {
    const updateData: PartialPowerhouseManifest = {
      publisher: {
        name: "@updated",
      },
    };

    const testOutDirPath = join(
      testOutputParentDir,
      "update-publisher-partially",
    );
    await cpForce(
      join(testProjectsDir, NEW_PROJECT, "powerhouse.manifest.json"),
      join(testOutDirPath, "powerhouse.manifest.json"),
    );
    const manifestPath = generateManifest(updateData, testOutDirPath);

    const content = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.publisher).toEqual({
      name: "@updated",
      url: "",
    });
  });

  it("should handle malformed existing manifest gracefully", async () => {
    const testOutDirPath = join(
      testOutputParentDir,
      "handle-malformed-existing-manifest",
    );
    await mkdirRecursive(testOutDirPath);
    const manifestPath = join(testOutDirPath, "powerhouse.manifest.json");
    await writeFile(manifestPath, "{ invalid json }");

    const updateData = {
      name: "@test/package",
      description: "Test description",
    };

    const resultPath = generateManifest(updateData, testOutDirPath);

    expect(await fileExists(resultPath)).toBe(true);

    const content = await readFile(resultPath, "utf-8");
    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.name).toBe("@test/package");
    expect(manifest.description).toBe("Test description");
    expect(manifest.category).toBe("");
  });

  it("should validate JSON structure matches expected format", async () => {
    const manifestData = {
      name: "@test/package",
      description: "Test package",
      category: "testing",
      publisher: {
        name: "@test",
        url: "https://test.com",
      },
      documentModels: [{ id: "test/doc", name: "Test Doc" }],
      editors: [
        {
          id: "test-editor",
          name: "Test Editor",
          documentTypes: ["test/doc"],
        },
      ],
      apps: [
        {
          id: "test-app",
          name: "Test App",
          documentTypes: ["test/doc"],
        },
      ],
      subgraphs: [
        {
          id: "test-subgraph",
          name: "Test Subgraph",
          documentTypes: ["test/doc"],
        },
      ],
      importScripts: [
        {
          id: "test-script",
          name: "Test Script",
          documentTypes: ["test/doc"],
        },
      ],
    };

    const testOutDirPath = join(testOutputParentDir, "validate-json-structure");
    await cpForce(
      join(testProjectsDir, NEW_PROJECT, "powerhouse.manifest.json"),
      join(testOutDirPath, "powerhouse.manifest.json"),
    );
    const manifestPath = generateManifest(manifestData, testOutDirPath);
    const content = await readFile(manifestPath, "utf-8");

    // Verify it's properly formatted JSON
    expect(() => JSON.parse(content) as PowerhouseManifest).not.toThrow();

    // Verify structure
    const manifest = JSON.parse(content) as PowerhouseManifest;
    expect(manifest).toEqual(manifestData);

    // Verify formatting (4 spaces indentation)
    expect(content).toContain('    "name":');
    expect(content).toContain('        "id":');
  });
});
