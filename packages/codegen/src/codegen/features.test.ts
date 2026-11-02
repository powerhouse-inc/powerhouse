import {
  FEATURE_DEPENDENCIES,
  KYSELY_PACKAGE,
  PIECES_FRAMEWORK_PACKAGE,
  REACTOR_API_PACKAGE,
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
import { buildTsMorphProject } from "../utils/ts-morph-project.js";
import { detectFeatures, syncFeatureDependencies } from "./features.js";
import { generateProcessor, generateSubgraph } from "./generate.js";
import { migratedPackageJson, resolveManagedDependencies } from "./migrate.js";

const PIN = "6.2.3-dev.13";

type Deps = Record<string, string> | undefined;
type Manifest = {
  dependencies?: Deps;
  peerDependencies?: Deps;
  devDependencies?: Deps;
};

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
    expect(await syncFeatureDependencies(detectFeatures(dir), dir)).toEqual([
      PIECES_FRAMEWORK_PACKAGE,
    ]);

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
    expect(await syncFeatureDependencies(detectFeatures(dir), dir)).toEqual([]);
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

describe("migrate and connect-core", () => {
  it("adds connect-core as a peer and dev dependency to a project without it", () => {
    const { peerDependencies, devDependencies } = resolveManagedDependencies({
      packageJson: {
        peerDependencies: { "document-model": "6.0.0" },
        devDependencies: { "@powerhousedao/connect": "6.0.0" },
      },
      features: [],
      fullyQualifiedVersion: "6.3.0-dev.1",
      workspacePackageNames: [],
    });
    expect(peerDependencies["@powerhousedao/connect-core"]).toBe("6.3.0-dev.1");
    expect(devDependencies["@powerhousedao/connect-core"]).toBe("6.3.0-dev.1");
  });
});

async function scaffoldSubgraph(dir: string, name: string) {
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  const project = buildTsMorphProject(dir);
  await generateSubgraph(name, project);
  await project.save();
}

describe("subgraph feature", () => {
  it("is not detected from the aggregate subgraphs/index.ts alone", () => {
    const dir = makeProject();
    mkdirSync(join(dir, "subgraphs"));
    writeFileSync(join(dir, "subgraphs", "index.ts"), "export {};\n");
    expect(detectFeatures(dir)).not.toContain("subgraph");
  });

  it("is detected from a scaffolded subgraph", async () => {
    const dir = makeProject();
    await scaffoldSubgraph(dir, "Stock");
    expect(detectFeatures(dir)).toContain("subgraph");
  });

  it("adds reactor-api as a peer and dev dependency at the document-model pin", async () => {
    const dir = makeProject();
    await scaffoldSubgraph(dir, "Stock");

    expect(await syncFeatureDependencies(detectFeatures(dir), dir)).toEqual([
      REACTOR_API_PACKAGE,
    ]);
    const manifest = readManifest(dir);
    expect(manifest.peerDependencies?.[REACTOR_API_PACKAGE]).toBe(PIN);
    expect(manifest.devDependencies?.[REACTOR_API_PACKAGE]).toBe(PIN);
  });

  it("moves a reactor-api in dependencies to a peer and dev pin", async () => {
    const dir = makeProject({
      dependencies: { [REACTOR_API_PACKAGE]: PIN, luxon: "^3.0.0" },
    });
    await scaffoldSubgraph(dir, "Stock");

    expect(await syncFeatureDependencies(detectFeatures(dir), dir)).toEqual([
      REACTOR_API_PACKAGE,
    ]);

    const manifest = readManifest(dir);
    expect(manifest.dependencies).toEqual({ luxon: "^3.0.0" });
    expect(manifest.peerDependencies?.[REACTOR_API_PACKAGE]).toBe(PIN);
    expect(manifest.devDependencies?.[REACTOR_API_PACKAGE]).toBe(PIN);
  });

  it("migrates a reactor-api in dependencies to a peer and dev pin", () => {
    const managed = resolveManagedDependencies({
      packageJson: {
        dependencies: { [REACTOR_API_PACKAGE]: "6.0.0" },
        peerDependencies: { [REACTOR_API_PACKAGE]: "6.0.0" },
      },
      features: ["subgraph"],
      fullyQualifiedVersion: "6.3.0-dev.1",
      workspacePackageNames: [],
    });
    const migrated = migratedPackageJson(
      { dependencies: { [REACTOR_API_PACKAGE]: "6.0.0" } },
      managed,
    );
    expect(migrated.dependencies).toBeUndefined();
    expect(migrated.peerDependencies?.[REACTOR_API_PACKAGE]).toBe(
      "6.3.0-dev.1",
    );
    expect(migrated.devDependencies?.[REACTOR_API_PACKAGE]).toBe("6.3.0-dev.1");
  });

  it("moves reactor-api to the migrated version", () => {
    const { peerDependencies, devDependencies } = resolveManagedDependencies({
      packageJson: {
        peerDependencies: { [REACTOR_API_PACKAGE]: "6.0.0" },
        devDependencies: { [REACTOR_API_PACKAGE]: "6.0.0" },
      },
      features: ["subgraph"],
      fullyQualifiedVersion: "6.3.0-dev.1",
      workspacePackageNames: [],
    });
    expect(peerDependencies[REACTOR_API_PACKAGE]).toBe("6.3.0-dev.1");
    expect(devDependencies[REACTOR_API_PACKAGE]).toBe("6.3.0-dev.1");
  });
});

async function scaffoldProcessor(
  dir: string,
  processorType: "analytics" | "relationalDb",
) {
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({ compilerOptions: { module: "nodenext" } }, null, 2),
  );
  const project = buildTsMorphProject(dir);
  await generateProcessor(
    {
      processorName: "Stock Indexer",
      processorType,
      processorApps: ["switchboard"],
      documentTypes: ["acme/stock-item"],
    },
    project,
  );
  await project.save();
}

describe("relational db processor feature", () => {
  it("is detected from a scaffolded relational db processor only", async () => {
    const relational = makeProject();
    await scaffoldProcessor(relational, "relationalDb");
    const analytics = makeProject();
    await scaffoldProcessor(analytics, "analytics");

    expect(detectFeatures(relational)).toEqual(["relationalDbProcessor"]);
    expect(detectFeatures(analytics)).toEqual(["analyticsProcessor"]);
  });

  it("adds kysely as a peer and a pinned dev dependency", async () => {
    const dir = makeProject();
    await scaffoldProcessor(dir, "relationalDb");

    expect(await syncFeatureDependencies(detectFeatures(dir), dir)).toEqual([
      KYSELY_PACKAGE,
    ]);
    const manifest = readManifest(dir);
    expect(manifest.peerDependencies?.[KYSELY_PACKAGE]).toBe("^0.28");
    expect(manifest.devDependencies?.[KYSELY_PACKAGE]).toBe("0.28.16");
  });
});
