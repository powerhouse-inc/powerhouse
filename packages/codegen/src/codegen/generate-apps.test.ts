// A fresh ts-morph project loads no files, so these tests scaffold apps with
// one project and regenerate them with another, as `ph-cli generate app` does.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { documentEditorModuleFileTemplate } from "templates";
import { afterEach, describe, expect, it } from "vitest";
import { buildTsMorphProject } from "../utils/ts-morph-project.js";
import { generateAllApps, generateApp } from "./generate.js";

const temporary: string[] = [];

afterEach(() => {
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function makeProject(
  apps: { name: string; allowedDocumentTypes?: string[] }[],
) {
  const root = mkdtempSync(join(tmpdir(), "ph-generate-apps-"));
  temporary.push(root);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@acme/stockroom", type: "module" }, null, 2),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  const project = buildTsMorphProject(root);
  for (const { name, allowedDocumentTypes } of apps) {
    await generateApp({ appName: name, allowedDocumentTypes }, project);
  }
  await project.save();
  return root;
}

function readManifestApps(root: string) {
  const manifest = JSON.parse(
    readFileSync(join(root, "powerhouse.manifest.json"), "utf8"),
  ) as { apps: { id: string; name: string }[] };
  return manifest.apps;
}

async function regenerateAll(root: string) {
  const project = buildTsMorphProject(root);
  const result = await generateAllApps(project);
  await project.save();
  return result;
}

describe("generateAllApps", () => {
  it("keeps an existing app in the manifest and its config", async () => {
    const root = await makeProject([
      { name: "Stockroom App", allowedDocumentTypes: ["acme/stock-item"] },
    ]);
    const configPath = join(root, "editors", "stockroom-app", "config.ts");
    const configBefore = readFileSync(configPath, "utf8");

    const { apps, unreadableDirs } = await regenerateAll(root);

    expect(apps.map((app) => app.dirName)).toEqual(["stockroom-app"]);
    expect(unreadableDirs).toEqual([]);
    expect(readManifestApps(root)).toEqual([
      expect.objectContaining({ id: "stockroom-app", name: "Stockroom App" }),
    ]);
    expect(configBefore).toContain('"acme/stock-item"');
    expect(readFileSync(configPath, "utf8")).toBe(configBefore);
  });

  it("drops the manifest entry of an app whose directory is gone", async () => {
    const root = await makeProject([
      { name: "Stockroom App" },
      { name: "Ledger App" },
    ]);
    rmSync(join(root, "editors", "ledger-app"), { recursive: true });

    await regenerateAll(root);

    expect(readManifestApps(root).map((app) => app.id)).toEqual([
      "stockroom-app",
    ]);
  });

  it("keeps the manifest's apps when a module.ts can't be read", async () => {
    const root = await makeProject([
      { name: "Stockroom App" },
      { name: "Ledger App" },
    ]);
    writeFileSync(
      join(root, "editors", "ledger-app", "module.ts"),
      [
        'import type { EditorModule } from "document-model";',
        'const id = "ledger-app";',
        "export const LedgerApp: EditorModule = {",
        "  Component: () => null,",
        '  documentTypes: ["powerhouse/document-drive"],',
        '  config: { id, name: "Ledger App" },',
        "};",
      ].join("\n"),
    );

    const { apps, unreadableDirs } = await regenerateAll(root);

    expect(apps.map((app) => app.dirName)).toEqual(["stockroom-app"]);
    expect(unreadableDirs).toEqual(["ledger-app"]);
    expect(
      readManifestApps(root)
        .map((app) => app.id)
        .sort(),
    ).toEqual(["ledger-app", "stockroom-app"]);
  });
});

describe("an app's module.ts", () => {
  it("says codegen writes it once, and keeps an edit on regenerate", async () => {
    const root = await makeProject([{ name: "Stockroom App" }]);
    const modulePath = join(root, "editors", "stockroom-app", "module.ts");
    const scaffolded = readFileSync(modulePath, "utf8");
    expect(scaffolded).not.toContain("DO NOT EDIT");
    expect(scaffolded).toContain("Codegen does not update it");

    const edited = scaffolded.replace(
      'name: "Stockroom App"',
      'name: "Stockroom"',
    );
    writeFileSync(modulePath, edited);
    await regenerateAll(root);

    expect(readFileSync(modulePath, "utf8")).toBe(edited);
  });

  it("differs from an editor's, which codegen rewrites", () => {
    const editorModule = documentEditorModuleFileTemplate({
      editorName: "Stock Editor",
      pascalCaseEditorName: "StockEditor",
      editorId: "stock-editor",
      documentTypes: ["acme/stock-item"],
    });
    expect(editorModule).toContain("WARNING: DO NOT EDIT");
  });
});
