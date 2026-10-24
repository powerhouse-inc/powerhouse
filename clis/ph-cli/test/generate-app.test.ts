import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startGenerateApp } from "../src/services/generate-app.js";
import type { GenerateAppArgs } from "../src/types.js";

const originalCwd = process.cwd();
let root: string;
let logged: string[];

function args(overrides: Partial<GenerateAppArgs>): GenerateAppArgs {
  return {
    name: undefined,
    allowedDocumentTypes: undefined,
    document: undefined,
    dir: undefined,
    disableDragAndDrop: false,
    all: false,
    extract: false,
    debug: undefined,
    ...overrides,
  };
}

function readManifestApps() {
  const manifest = JSON.parse(
    readFileSync(join(root, "powerhouse.manifest.json"), "utf8"),
  ) as { apps: { id: string; name: string }[] };
  return manifest.apps;
}

beforeEach(async () => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "ph-generate-app-")));
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@acme/stockroom", type: "module" }, null, 2),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  await startGenerateApp(
    args({ name: "Stockroom App", allowedDocumentTypes: ["acme/stock-item"] }),
    root,
  );
  logged = [];
  vi.spyOn(console, "log").mockImplementation((line: string) => {
    logged.push(line);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(originalCwd);
  rmSync(root, { recursive: true, force: true });
});

describe("ph-cli generate app", () => {
  it("--all keeps the manifest's apps", async () => {
    await startGenerateApp(args({ all: true }), root);

    expect(readManifestApps()).toEqual([
      expect.objectContaining({ id: "stockroom-app", name: "Stockroom App" }),
    ]);
    expect(
      readFileSync(join(root, "editors/stockroom-app/config.ts"), "utf8"),
    ).toContain('"acme/stock-item"');
    expect(logged).toEqual([
      'Regenerated app "Stockroom App" in editors/stockroom-app',
    ]);
  });

  it.each([
    "stockroom-app",
    "editors/stockroom-app",
    "editors/stockroom-app/module.ts",
  ])("--dir %s regenerates the app", async (dir) => {
    await startGenerateApp(args({ dir }), root);

    expect(logged).toEqual([
      'Regenerated app "Stockroom App" in editors/stockroom-app',
    ]);
    expect(readManifestApps().map((app) => app.id)).toEqual(["stockroom-app"]);
  });

  it("--dir takes an absolute path", async () => {
    await startGenerateApp(
      args({ dir: join(root, "editors", "stockroom-app") }),
      root,
    );

    expect(logged).toEqual([
      'Regenerated app "Stockroom App" in editors/stockroom-app',
    ]);
  });

  it.each(["missing-app", "editors"])(
    "--dir %s says what it expects",
    async (dir) => {
      await expect(startGenerateApp(args({ dir }), root)).rejects.toThrow(
        `No directory in editors/ for --dir "${dir}": expected its name ("my-app") or its path ("editors/my-app").`,
      );
    },
  );

  it("--dir rejects a document editor", async () => {
    mkdirSync(join(root, "editors", "stock-item-editor"));
    writeFileSync(
      join(root, "editors", "stock-item-editor", "module.ts"),
      [
        'import type { EditorModule } from "document-model";',
        "export const StockItemEditor: EditorModule = {",
        "  Component: () => null,",
        '  documentTypes: ["acme/stock-item"],',
        '  config: { id: "stock-item-editor", name: "Stock Item Editor" },',
        "};",
      ].join("\n"),
    );

    await expect(
      startGenerateApp(args({ dir: "stock-item-editor" }), root),
    ).rejects.toThrow(
      "editors/stock-item-editor is a document editor, not a drive app",
    );
  });

  it("--extract writes a spec for the app", async () => {
    await startGenerateApp(args({ extract: true }), root);

    const specPath = join(root, "specs", "apps", "stockroom-app.app.phd");
    expect(logged).toEqual([`Wrote ${specPath}`]);
    expect(existsSync(specPath)).toBe(true);
  });

  it("--extract says when there is no app", async () => {
    rmSync(join(root, "editors", "stockroom-app"), { recursive: true });

    await startGenerateApp(args({ extract: true }), root);

    expect(logged).toEqual(["No drive apps found in editors/."]);
  });
});
