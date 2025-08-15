import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generateDriveEditor } from "../index.js";
import {
  EXPECTED_DRIVE_EXPLORER_EXPORT,
  EXPECTED_EDITOR_CONTENT,
  EXPECTED_EXISTING_EDITOR_EXPORT,
  EXPECTED_HEADER_COMMENT,
  EXPECTED_INDEX_CONTENT,
  EXPECTED_MAIN_INDEX_CONTENT,
} from "./generate-drive-editor.expected.js";

// Set this to false to keep the generated files for inspection
const CLEANUP_AFTER_TESTS = true;

describe("generateDriveEditor", () => {
  let testDir: string;
  const config: PowerhouseConfig = {
    editorsDir: "",
    documentModelsDir: "",
    processorsDir: "",
    subgraphsDir: "",
    importScriptsDir: "",
    skipFormat: true,
    logLevel: "info",
  };

  beforeEach(() => {
    testDir = path.join(__dirname, "temp");
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDir, { recursive: true });
    config.editorsDir = testDir;
  });

  afterAll(() => {
    if (CLEANUP_AFTER_TESTS && fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should generate a drive editor with the correct files and content", async () => {
    const name = "AtlasDriveExplorer";
    await generateDriveEditor(name, config, "AtlasDriveExplorer");

    const editorDir = path.join(testDir, "atlas-drive-explorer");
    expect(fs.existsSync(editorDir)).toBe(true);

    expect(fs.existsSync(path.join(editorDir, "components"))).toBe(true);
    expect(fs.existsSync(path.join(editorDir, "types"))).toBe(true);

    expect(
      fs.existsSync(path.join(editorDir, "components/DriveExplorer.tsx")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(editorDir, "components/FolderTree.tsx")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(editorDir, "components/EditorContainer.tsx")),
    ).toBe(true);
    expect(
      fs.existsSync(path.join(editorDir, "components/CreateDocument.tsx")),
    ).toBe(true);

    expect(fs.existsSync(path.join(editorDir, "types/css.d.ts"))).toBe(true);

    const indexPath = path.join(editorDir, "index.ts");
    const indexContent = fs.readFileSync(indexPath, "utf-8").trim();
    expect(indexContent).toBe(EXPECTED_INDEX_CONTENT.trim());

    const editorPath = path.join(editorDir, "editor.tsx");
    const editorContent = fs.readFileSync(editorPath, "utf-8").trim();
    expect(editorContent).toBe(EXPECTED_EDITOR_CONTENT.trim());

    const mainIndexPath = path.join(testDir, "index.ts");
    const mainIndexContent = fs
      .readFileSync(mainIndexPath, "utf-8")
      .replace(/\s+$/, "");
    expect(mainIndexContent).toBe(EXPECTED_MAIN_INDEX_CONTENT);
  });

  it("should generate a drive editor with default id when no appId is provided", async () => {
    const name = "TestApp";
    await generateDriveEditor(name, config); // No appId provided

    const editorDir = path.join(testDir, "test-app");
    const indexPath = path.join(editorDir, "index.ts");
    const indexContent = fs.readFileSync(indexPath, "utf-8");
    
    expect(indexContent).toContain('id: "drive-editor-id"');
  });

  it("should append new exports to existing index.ts file", async () => {
    const name = "AtlasDriveExplorer";
    const existingContent = `${EXPECTED_HEADER_COMMENT}

${EXPECTED_EXISTING_EDITOR_EXPORT}`;

    const mainIndexPath = path.join(testDir, "index.ts");
    fs.writeFileSync(mainIndexPath, existingContent);

    await generateDriveEditor(name, config);

    const mainIndexContent = fs
      .readFileSync(mainIndexPath, "utf-8")
      .replace(/\s+$/, "");

    // Verify the header comment is preserved
    expect(mainIndexContent).toContain(EXPECTED_HEADER_COMMENT);

    // Verify both exports are present
    expect(mainIndexContent).toContain(EXPECTED_EXISTING_EDITOR_EXPORT);
    expect(mainIndexContent).toContain(EXPECTED_DRIVE_EXPLORER_EXPORT);
  });
});
