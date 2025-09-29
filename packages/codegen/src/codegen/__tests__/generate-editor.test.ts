import { type PowerhouseConfig } from "@powerhousedao/config/powerhouse";
import { exec } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { generateEditor } from "../index.js";
import {
  EXPECTED_EDITOR_CONTENT,
  EXPECTED_EDITOR_CONTENT_NO_DOCUMENT_TYPES,
  EXPECTED_HOOK_CONTENT,
  EXPECTED_INDEX_CONTENT,
  EXPECTED_INDEX_CONTENT_NO_DOCUMENT_TYPES,
  EXPECTED_MAIN_INDEX_CONTENT,
  EXPECTED_MAIN_INDEX_CONTENT_NO_DOCUMENT_TYPES,
} from "./generate-editor.expected.js";

// Set this to false to keep the generated files for inspection
const CLEANUP_AFTER_TESTS = true;

describe("generateEditor", () => {
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

  const compile = () =>
    new Promise((resolve, reject) => {
      const output: { stdout: string[]; stderr: string[] } = {
        stdout: [],
        stderr: [],
      };
      const child = exec(
        "npx tsc --project tsconfig.document-editor.test.json",
        { cwd: process.cwd() },
      );
      child.stdout?.on("data", (data) => {
        output.stdout.push(data);
      });
      child.stderr?.on("data", (data) => {
        output.stderr.push(data);
      });
      child.on("close", (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          reject(
            new Error(
              `tsc failed with code ${code}:\n${output.stdout.join("")}\n${output.stderr.join("")}`,
            ),
          );
        }
      });
    });

  it("should generate a generic document editor", async () => {
    const name = "GenericDocumentEditor";
    await generateEditor(name, [], config, "test-generic-document-editor");

    const editorDir = path.join(testDir, "generic-document-editor");
    expect(fs.existsSync(editorDir)).toBe(true);

    const indexPath = path.join(editorDir, "index.ts");
    const editorPath = path.join(editorDir, "editor.tsx");
    const hooksPath = path.join(editorDir, "hooks");

    expect(fs.existsSync(editorPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(hooksPath)).toBe(false);

    const indexContent = fs.readFileSync(indexPath, "utf-8").trim();
    expect(indexContent).toBe(EXPECTED_INDEX_CONTENT_NO_DOCUMENT_TYPES.trim());

    const editorContent = fs.readFileSync(editorPath, "utf-8").trim();
    expect(editorContent).toBe(
      EXPECTED_EDITOR_CONTENT_NO_DOCUMENT_TYPES.trim(),
    );

    const mainIndexPath = path.join(testDir, "index.ts");
    const mainIndexContent = fs
      .readFileSync(mainIndexPath, "utf-8")
      .replace(/\s+$/, "");
    expect(mainIndexContent).toStrictEqual(
      EXPECTED_MAIN_INDEX_CONTENT_NO_DOCUMENT_TYPES,
    );

    await compile();
  });

  it("should generate a Document Model editor", async () => {
    const name = "DocumentModelEditor";
    await generateEditor(
      name,
      ["powerhouse/document-model"],
      config,
      "test-document-model-editor",
    );

    const editorDir = path.join(testDir, "document-model-editor");
    expect(fs.existsSync(editorDir)).toBe(true);

    const indexPath = path.join(editorDir, "index.ts");
    const editorPath = path.join(editorDir, "editor.tsx");
    const hookPath = path.join(
      editorDir,
      "../hooks/useDocumentModelDocument.ts",
    );

    expect(fs.existsSync(editorPath)).toBe(true);
    expect(fs.existsSync(indexPath)).toBe(true);
    expect(fs.existsSync(hookPath)).toBe(true);

    const indexContent = fs.readFileSync(indexPath, "utf-8").trim();
    expect(indexContent).toBe(EXPECTED_INDEX_CONTENT.trim());

    const editorContent = fs.readFileSync(editorPath, "utf-8").trim();
    expect(editorContent).toBe(EXPECTED_EDITOR_CONTENT.trim());

    const hookContent = fs.readFileSync(hookPath, "utf-8").trim();
    expect(hookContent).toBe(EXPECTED_HOOK_CONTENT.trim());

    const mainIndexPath = path.join(testDir, "index.ts");
    const mainIndexContent = fs
      .readFileSync(mainIndexPath, "utf-8")
      .replace(/\s+$/, "");
    expect(mainIndexContent).toStrictEqual(EXPECTED_MAIN_INDEX_CONTENT);

    await compile();
  });
});
