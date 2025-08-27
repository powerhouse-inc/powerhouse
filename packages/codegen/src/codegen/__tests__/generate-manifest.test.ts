import {
  type PartialPowerhouseManifest,
  type PowerhouseManifest,
} from "@powerhousedao/config";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generateManifest } from "../index.js";

// Set this to false to keep the generated files for inspection
const CLEANUP_AFTER_TESTS = true;

describe("generateManifest", () => {
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, "temp");
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterAll(() => {
    if (CLEANUP_AFTER_TESTS && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should generate a new manifest from scratch with partial data", () => {
    const manifestData = {
      name: "@test/package",
      description: "Test package description",
    };

    const manifestPath = generateManifest(manifestData, testDir);

    expect(fs.existsSync(manifestPath)).toBe(true);
    expect(manifestPath).toBe(path.join(testDir, "powerhouse.manifest.json"));

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

  it("should update existing manifest preserving all existing fields", () => {
    const existingManifest: PowerhouseManifest = {
      name: "@existing/package",
      description: "Existing description",
      category: "test-category",
      publisher: {
        name: "@existing",
        url: "https://example.com/existing",
      },
      documentModels: [{ id: "test/document", name: "Test Document" }],
      editors: [
        {
          id: "test-editor",
          name: "Test Editor",
          documentTypes: ["test/document"],
        },
      ],
      apps: [
        {
          id: "test-app",
          name: "Test App",
          documentTypes: ["test/document"],
        },
      ],
      subgraphs: [
        {
          id: "test-subgraph",
          name: "Test Subgraph",
          documentTypes: ["test/document"],
        },
      ],
      importScripts: [
        {
          id: "test-script",
          name: "Test Script",
          documentTypes: ["test/document"],
        },
      ],
    };

    const manifestPath = path.join(testDir, "powerhouse.manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(existingManifest, null, 4));

    const updateData = {
      name: "@updated/package",
      description: "Updated description",
    };

    generateManifest(updateData, testDir);

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

  it("should update publisher fields partially", () => {
    const existingManifest: PowerhouseManifest = {
      name: "@existing/package",
      description: "Existing description",
      category: "",
      publisher: {
        name: "@existing",
        url: "https://example.com/existing",
      },
      documentModels: [],
      editors: [],
      apps: [],
      subgraphs: [],
      importScripts: [],
    };

    const manifestPath = path.join(testDir, "powerhouse.manifest.json");
    fs.writeFileSync(manifestPath, JSON.stringify(existingManifest, null, 4));

    const updateData: PartialPowerhouseManifest = {
      publisher: {
        name: "@updated",
      },
    };

    generateManifest(updateData, testDir);

    const content = fs.readFileSync(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as PowerhouseManifest;

    expect(manifest.publisher).toEqual({
      name: "@updated",
      url: "https://example.com/existing",
    });
  });

  it("should handle malformed existing manifest gracefully", () => {
    const manifestPath = path.join(testDir, "powerhouse.manifest.json");
    fs.writeFileSync(manifestPath, "{ invalid json }");

    const updateData = {
      name: "@test/package",
      description: "Test description",
    };

    const resultPath = generateManifest(updateData, testDir);

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
      process.chdir(originalCwd);
    }
  });

  it("should validate JSON structure matches expected format", () => {
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

    const manifestPath = generateManifest(manifestData, testDir);
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
