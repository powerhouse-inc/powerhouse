import {
  FEATURE_DEPENDENCIES,
  PIECES_FRAMEWORK_PACKAGE,
  VERSIONED_DEV_DEPENDENCIES,
} from "@powerhousedao/shared/clis";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectFeatures, syncFeatureDependencies } from "./features.js";
import { resolveManagedDependencies } from "./migrate.js";

const PIN = "6.2.3-dev.13";

type Deps = Record<string, string> | undefined;
type Manifest = { peerDependencies?: Deps; devDependencies?: Deps };

const created: string[] = [];

afterEach(() => {
  for (const dir of created.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeProject(overrides: Record<string, unknown> = {}): string {
  const dir = mkdtempSync(join(tmpdir(), "ph-features-"));
  created.push(dir);
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify(
      {
        name: "test-project",
        version: "1.0.0",
        peerDependencies: { "document-model": PIN },
        devDependencies: { "document-model": PIN },
        ...overrides,
      },
      null,
      2,
    ),
  );
  return dir;
}

function writePiecesIndex(dir: string): void {
  mkdirSync(join(dir, "pieces"), { recursive: true });
  writeFileSync(join(dir, "pieces", "index.ts"), "export const pieces = [];\n");
}

function writePiece(dir: string, name: string): void {
  mkdirSync(join(dir, "pieces", name), { recursive: true });
  writeFileSync(
    join(dir, "pieces", name, "index.ts"),
    "export const piece = {};\n",
  );
}

const readManifest = (dir: string) =>
  JSON.parse(readFileSync(join(dir, "package.json"), "utf-8")) as Manifest;

describe("piece feature detection", () => {
  it("does not detect the feature in a project with no pieces", () => {
    expect(detectFeatures(makeProject())).not.toContain("piece");
  });

  it("does not detect the feature from a bare pieces/index.ts", () => {
    const dir = makeProject();
    writePiecesIndex(dir);
    expect(detectFeatures(dir)).not.toContain("piece");
  });

  it("detects the feature from a pieces/<name>/index.ts", () => {
    const dir = makeProject();
    writePiecesIndex(dir);
    writePiece(dir, "my-piece");
    expect(detectFeatures(dir)).toContain("piece");
  });
});

describe("piece feature dependencies", () => {
  it("declares the framework dev-only", () => {
    expect(FEATURE_DEPENDENCIES.piece).toEqual({
      peerVersioned: [],
      peerExternal: {},
      devVersioned: [PIECES_FRAMEWORK_PACKAGE],
    });
  });

  it("keeps the framework out of the every-project dev list", () => {
    expect(VERSIONED_DEV_DEPENDENCIES).not.toContain(PIECES_FRAMEWORK_PACKAGE);
  });
});

describe("syncFeatureDependencies for a piece", () => {
  it("writes a dev entry at the document-model pin and no peer entry", async () => {
    const dir = makeProject();
    writePiece(dir, "my-piece");
    await syncFeatureDependencies(detectFeatures(dir), dir);

    const manifest = readManifest(dir);
    expect(manifest.devDependencies?.[PIECES_FRAMEWORK_PACKAGE]).toBe(PIN);
    expect(manifest.peerDependencies).not.toHaveProperty(
      PIECES_FRAMEWORK_PACKAGE,
    );
  });

  it("leaves the package.json untouched on a second run", async () => {
    const dir = makeProject();
    writePiece(dir, "my-piece");
    await syncFeatureDependencies(detectFeatures(dir), dir);
    const afterFirst = readFileSync(join(dir, "package.json"), "utf-8");
    await syncFeatureDependencies(detectFeatures(dir), dir);
    expect(readFileSync(join(dir, "package.json"), "utf-8")).toBe(afterFirst);
  });

  it("refuses without a document-model version to anchor to", async () => {
    const dir = makeProject({ peerDependencies: {}, devDependencies: {} });
    writePiece(dir, "my-piece");
    await expect(
      syncFeatureDependencies(detectFeatures(dir), dir),
    ).rejects.toThrow("Run `ph migrate` first");
  });
});

describe("migrate and the piece feature", () => {
  const NEXT = "6.3.0-dev.1";
  // Empty on purpose: with the workspace-name fallback off, only membership of
  // the managed dev list can move the framework's pin.
  const workspacePackageNames: string[] = [];

  it("moves an existing framework pin to the migrated version", () => {
    const { devDependencies, peerDependencies } = resolveManagedDependencies({
      packageJson: {
        devDependencies: { [PIECES_FRAMEWORK_PACKAGE]: "6.0.0" },
      },
      features: ["piece"],
      fullyQualifiedVersion: NEXT,
      workspacePackageNames,
    });
    expect(devDependencies[PIECES_FRAMEWORK_PACKAGE]).toBe(NEXT);
    expect(peerDependencies).not.toHaveProperty(PIECES_FRAMEWORK_PACKAGE);
  });

  it("adds the framework to a project that has a piece but not the dep", () => {
    const { devDependencies } = resolveManagedDependencies({
      packageJson: {},
      features: ["piece"],
      fullyQualifiedVersion: NEXT,
      workspacePackageNames,
    });
    expect(devDependencies[PIECES_FRAMEWORK_PACKAGE]).toBe(NEXT);
  });

  it("strips a stray peer entry for the framework", () => {
    const { peerDependencies, devDependencies } = resolveManagedDependencies({
      packageJson: {
        peerDependencies: { [PIECES_FRAMEWORK_PACKAGE]: "6.0.0" },
      },
      features: ["piece"],
      fullyQualifiedVersion: NEXT,
      workspacePackageNames,
    });
    expect(peerDependencies).not.toHaveProperty(PIECES_FRAMEWORK_PACKAGE);
    expect(devDependencies[PIECES_FRAMEWORK_PACKAGE]).toBe(NEXT);
  });

  it("leaves the framework alone for a project with no piece", () => {
    const { devDependencies } = resolveManagedDependencies({
      packageJson: {
        devDependencies: { [PIECES_FRAMEWORK_PACKAGE]: "6.0.0" },
      },
      features: [],
      fullyQualifiedVersion: NEXT,
      workspacePackageNames,
    });
    expect(devDependencies[PIECES_FRAMEWORK_PACKAGE]).toBe("6.0.0");
  });
});
