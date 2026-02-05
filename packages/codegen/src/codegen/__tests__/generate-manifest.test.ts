import type {
  PartialPowerhouseManifest,
  PowerhouseManifest,
} from "@powerhousedao/config";
import path from "node:path";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
  type TestContext,
} from "vitest";
import { generateManifest } from "../generate.js";
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
  purgeDirAfterTest,
  resetDirForTest,
} from "./utils.js";
import { readFile, rm, writeFile } from "node:fs/promises";
import { fileExists } from "@powerhousedao/common/clis";

describe("generateManifest", () => {
  const testDir = import.meta.dirname;
  const outDirName = getTestOutputDir(
    testDir,
    GENERATE_MANIFEST_TEST_OUTPUT_DIR,
  );
  let testOutDirPath = getTestOutDirPath("initial", outDirName);

  async function setupTest(context: TestContext, testDataDir: string) {
    testOutDirPath = getTestOutDirPath(context.task.name, outDirName);

    await copyAllFiles(testDataDir, testOutDirPath);
  }

  beforeAll(async () => {
    await resetDirForTest(outDirName);
  });

  afterAll(async () => {
    await purgeDirAfterTest(outDirName);
  });
  it("should generate a new manifest from scratch with partial data", async (context) => {
    await setupTest(context, getTestDataDir(testDir, MANIFEST_TEST_PROJECT));
    const manifestData = {
      name: "@test/package",
      description: "Test package description",
    };

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

  it("should update existing manifest preserving all existing fields", async (context) => {
    await setupTest(
      context,
      getTestDataDir(testDir, MANIFEST_TEST_PROJECT_WITH_EXISTING_MANIFEST),
    );

    const updateData = {
      name: "@updated/package",
      description: "Updated description",
    };

    const manifestPath = generateManifest(updateData, testOutDirPath);
    const content = await readFile(manifestPath, "utf-8");

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

  it("should update publisher fields partially", async (context) => {
    await setupTest(
      context,
      getTestDataDir(testDir, MANIFEST_TEST_PROJECT_WITH_EXISTING_MANIFEST),
    );
    const updateData: PartialPowerhouseManifest = {
      publisher: {
        name: "@updated",
      },
    };

    const manifestPath = generateManifest(updateData, testOutDirPath);

    const content = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.publisher).toEqual({
      name: "@updated",
      url: "https://example.com/existing",
    });
  });

  it("should handle malformed existing manifest gracefully", async (context) => {
    await setupTest(context, getTestDataDir(testDir, MANIFEST_TEST_PROJECT));
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

  it("should use current working directory when projectRoot is not provided", async () => {
    const originalCwd = process.cwd();
    process.chdir(testDir);

    try {
      const manifestData = {
        name: "@test/package",
        description: "Test description",
      };

      const manifestPath = generateManifest(manifestData);

      expect(manifestPath).toBe(path.join(testDir, "powerhouse.manifest.json"));
      expect(await fileExists(manifestPath)).toBe(true);
    } finally {
      await rm(path.join(testDir, "powerhouse.manifest.json"), {
        force: true,
      });
      process.chdir(originalCwd);
    }
  });

  it("should validate JSON structure matches expected format", async (context) => {
    await setupTest(context, getTestDataDir(testDir, MANIFEST_TEST_PROJECT));
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
