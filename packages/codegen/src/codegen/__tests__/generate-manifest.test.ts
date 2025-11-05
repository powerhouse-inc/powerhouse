import type {
  PartialPowerhouseManifest,
  PowerhouseManifest,
} from "@powerhousedao/config";
import fs, { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateManifest } from "../generate.js";
import { PURGE_AFTER_TEST } from "./config.js";
import {
  GENERATE_MANIFEST_TEST_OUTPUT_DIR,
  MANIFEST_TEST_PROJECT,
  MANIFEST_TEST_PROJECT_WITH_EXISTING_MANIFEST,
} from "./constants.js";
import {
  copyAllFiles,
  getTestDataDir,
  getTestOutDirPath,
  getTestOutputDir,
} from "./utils.js";

describe("generateManifest", () => {
  const testDir = import.meta.dirname;
  const outDirName = getTestOutputDir(
    testDir,
    GENERATE_MANIFEST_TEST_OUTPUT_DIR,
  );
  let testOutDirCount = 0;
  let testOutDirPath = getTestOutDirPath(testOutDirCount, outDirName);

  async function setupTest(testDataDir: string) {
    testOutDirCount++;
    testOutDirPath = getTestOutDirPath(testOutDirCount, outDirName);

    await copyAllFiles(testDataDir, testOutDirPath);
  }

  beforeAll(() => {
    try {
      rmSync(outDirName, { recursive: true, force: true });
    } catch (error) {
      // Ignore error if folder doesn't exist
    }
    mkdirSync(outDirName, { recursive: true });
  });

  afterAll(() => {
    if (PURGE_AFTER_TEST) {
      try {
        rmSync(outDirName, { recursive: true, force: true });
      } catch (error) {
        // Ignore error if folder doesn't exist
      }
    }
  });
  it("should generate a new manifest from scratch with partial data", async () => {
    await setupTest(getTestDataDir(testDir, MANIFEST_TEST_PROJECT));
    const manifestData = {
      name: "@test/package",
      description: "Test package description",
    };

    const manifestPath = generateManifest(manifestData, testOutDirPath);

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(manifestPath).toBe(
      path.join(testOutDirPath, "powerhouse.manifest.json"),
    );

    const content = fs.readFileSync(manifestPath, "utf-8");
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
    await setupTest(
      getTestDataDir(testDir, MANIFEST_TEST_PROJECT_WITH_EXISTING_MANIFEST),
    );

    const updateData = {
      name: "@updated/package",
      description: "Updated description",
    };

    const manifestPath = generateManifest(updateData, testOutDirPath);
    const content = fs.readFileSync(manifestPath, "utf-8");

    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.name).toBe("@updated/package");
    expect(manifest.description).toBe("Updated description");
    expect(manifest.category).toBe("test-category");
    expect(manifest.publisher).toEqual({
      name: "@existing",
      url: "https://example.com/existing",
    });
    expect(manifest.documentModels).toEqual([
      { id: "test/document", name: "Test Document" },
    ]);
    expect(manifest.editors).toEqual([
      {
        id: "test-editor",
        name: "Test Editor",
        documentTypes: ["test/document"],
      },
    ]);
    expect(manifest.apps).toEqual([
      {
        id: "test-app",
        name: "Test App",
        documentTypes: ["test/document"],
      },
    ]);
    expect(manifest.subgraphs).toEqual([
      {
        id: "test-subgraph",
        name: "Test Subgraph",
        documentTypes: ["test/document"],
      },
    ]);
    expect(manifest.importScripts).toEqual([
      {
        id: "test-script",
        name: "Test Script",
        documentTypes: ["test/document"],
      },
    ]);
  });

  it("should update publisher fields partially", async () => {
    await setupTest(
      getTestDataDir(testDir, MANIFEST_TEST_PROJECT_WITH_EXISTING_MANIFEST),
    );
    const updateData: PartialPowerhouseManifest = {
      publisher: {
        name: "@updated",
      },
    };

    const manifestPath = generateManifest(updateData, testOutDirPath);

    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.publisher).toEqual({
      name: "@updated",
      url: "https://example.com/existing",
    });
  });

  it("should handle malformed existing manifest gracefully", async () => {
    await setupTest(getTestDataDir(testDir, MANIFEST_TEST_PROJECT));
    const manifestPath = path.join(testOutDirPath, "powerhouse.manifest.json");
    fs.writeFileSync(manifestPath, "{ invalid json }");

    const updateData = {
      name: "@test/package",
      description: "Test description",
    };

    const resultPath = generateManifest(updateData, testOutDirPath);

    expect(fs.existsSync(resultPath)).toBe(true);

    const content = fs.readFileSync(resultPath, "utf-8");
    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.name).toBe("@test/package");
    expect(manifest.description).toBe("Test description");
    expect(manifest.category).toBe("");
  });

  it("should use current working directory when projectRoot is not provided", () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const manifestData = {
        name: "@test/package",
        description: "Test description",
      };

      const manifestPath = generateManifest(manifestData);

      expect(manifestPath).toBe(path.join(testDir, "powerhouse.manifest.json"));
      expect(fs.existsSync(manifestPath)).toBe(true);
    } finally {
      fs.rmSync(path.join(testDir, "powerhouse.manifest.json"), {
        force: true,
      });
      process.chdir(originalCwd);
    }
  });

  it("should validate JSON structure matches expected format", async () => {
    await setupTest(getTestDataDir(testDir, MANIFEST_TEST_PROJECT));
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

    const manifestPath = generateManifest(manifestData, testOutDirPath);
    const content = fs.readFileSync(manifestPath, "utf-8");

    // Verify it's properly formatted JSON
    expect(() => JSON.parse(content)).not.toThrow();

    // Verify structure
    const manifest = JSON.parse(content) as PowerhouseManifest;
    expect(manifest).toEqual(manifestData);

    // Verify formatting (4 spaces indentation)
    expect(content).toContain('    "name":');
    expect(content).toContain('        "id":');
  });
});
