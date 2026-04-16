import { createOrUpdateManifest } from "@powerhousedao/codegen/file-builders";
import type { Manifest } from "@powerhousedao/config";
import { fileExists } from "@powerhousedao/shared/clis";
import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import path, { join } from "node:path";
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
    await createOrUpdateManifest(manifestData, testOutDirPath);
    const manifestPath = path.join(testOutDirPath, "powerhouse.manifest.json");
    expect(await fileExists(manifestPath)).toBe(true);
    expect(manifestPath).toBe(join(testOutDirPath, "powerhouse.manifest.json"));

    const content = await readFile(manifestPath, "utf-8");
    const manifest = JSON.parse(content) as Manifest;

    expect(manifest.name).toBe("@test/package");
    expect(manifest.description).toBe("Test package description");
    expect(manifest.category).toBe("");
    expect(manifest.publisher).toEqual({ name: "", url: "" });
    expect(manifest.documentModels).toEqual([]);
    expect(manifest.editors).toEqual([]);
    expect(manifest.apps).toEqual([]);
    expect(manifest.subgraphs).toEqual([]);
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
    await createOrUpdateManifest(updateData, testOutDirPath);
    const content = await readFile(
      join(testOutDirPath, "powerhouse.manifest.json"),
      "utf-8",
    );

    const manifest = JSON.parse(content) as Manifest;

    expect(manifest.name).toBe("@updated/package");
    expect(manifest.description).toBe("Updated description");
    expect(manifest.category).toBe("");
    expect(manifest.publisher).toEqual({
      name: "",
      url: "",
    });
  });

  it("should update publisher fields partially", async () => {
    const updateData = {
      publisher: {
        name: "@updated",
      },
    } as Manifest;

    const testOutDirPath = join(
      testOutputParentDir,
      "update-publisher-partially",
    );
    await cpForce(
      join(testProjectsDir, NEW_PROJECT, "powerhouse.manifest.json"),
      join(testOutDirPath, "powerhouse.manifest.json"),
    );
    await createOrUpdateManifest(updateData, testOutDirPath);

    const content = await readFile(
      join(testOutDirPath, "powerhouse.manifest.json"),
      "utf-8",
    );
    const manifest = JSON.parse(content) as Manifest;

    expect(manifest.publisher).toEqual({
      name: "@updated",
      url: "",
    });
  });

  it("should handle duplicates in modules", async () => {
    const updateData = {
      publisher: {
        name: "@updated",
      },
      documentModels: [
        {
          name: "name",
          id: "something",
        },
      ],
    } as Manifest;

    const testOutDirPath = join(
      testOutputParentDir,
      "update-publisher-partially",
    );
    await cpForce(
      join(testProjectsDir, NEW_PROJECT, "powerhouse.manifest.json"),
      join(testOutDirPath, "powerhouse.manifest.json"),
    );
    await createOrUpdateManifest(updateData, testOutDirPath);

    const updateDataWithDuplicate = {
      publisher: {
        name: "@updated",
      },
      documentModels: [
        {
          name: "name",
          id: "something",
        },
        {
          name: "name",
          id: "something",
        },
        {
          name: "other name",
          id: "something else",
        },
      ],
    } as Manifest;

    await createOrUpdateManifest(updateDataWithDuplicate, testOutDirPath);

    const content = await readFile(
      join(testOutDirPath, "powerhouse.manifest.json"),
      "utf-8",
    );
    const manifest = JSON.parse(content) as Manifest;

    expect(manifest.documentModels).toEqual([
      {
        name: "name",
        id: "something",
      },
      {
        name: "other name",
        id: "something else",
      },
    ]);
  });
});
