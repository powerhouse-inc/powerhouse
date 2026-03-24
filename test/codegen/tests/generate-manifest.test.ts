import { generateManifest } from "@powerhousedao/codegen";
import type {
  PartialPowerhouseManifest,
  PowerhouseManifest,
} from "@powerhousedao/config";
import { fileExists } from "@powerhousedao/shared/clis";
import { describe, expect, it } from "bun:test";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const testOutputDir = path.join(process.cwd(), "test-output");
const testDataDir = path.join(process.cwd(), "data");
const parentOutDirName = "generate-manifest";
const testOutputParentDir = path.join(testOutputDir, parentOutDirName);
await rm(testOutputParentDir, { recursive: true, force: true });
await mkdir(testOutputParentDir, { recursive: true });

describe("generateManifest", () => {
  it("should generate a new manifest from scratch with partial data", async () => {
    const manifestData = {
      name: "@test/package",
      description: "Test package description",
    };

    const testOutDirPath = path.join(
      testOutputParentDir,
      "manifest-from-scratch",
    );
    await mkdir(testOutDirPath, { recursive: true });
    const manifestPath = generateManifest(manifestData, testOutDirPath);

    expect(await fileExists(manifestPath)).toBe(true);
    expect(manifestPath).toBe(
      path.join(testOutDirPath, "powerhouse.manifest.json"),
    );

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
    const testOutDirPath = path.join(
      testOutputParentDir,
      "update-existing-manifest",
    );
    await cp(
      path.join(testDataDir, "test-project", "powerhouse.manifest.json"),
      path.join(testOutDirPath, "powerhouse.manifest.json"),
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

    const testOutDirPath = path.join(
      testOutputParentDir,
      "update-publisher-partially",
    );
    await cp(
      path.join(testDataDir, "test-project", "powerhouse.manifest.json"),
      path.join(testOutDirPath, "powerhouse.manifest.json"),
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
    const testOutDirPath = path.join(
      testOutputParentDir,
      "handle-malformed-existing-manifest",
    );
    await mkdir(testOutDirPath);
    const manifestPath = path.join(testOutDirPath, "powerhouse.manifest.json");
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

    const testOutDirPath = path.join(
      testOutputParentDir,
      "validate-json-structure",
    );
    await cp(
      path.join(testDataDir, "test-project", "powerhouse.manifest.json"),
      path.join(testOutDirPath, "powerhouse.manifest.json"),
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
