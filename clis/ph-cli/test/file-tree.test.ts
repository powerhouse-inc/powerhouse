import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  assertNoSymlinks,
  isVisibleDirectoryBasename,
  snapshotFileTree,
  writeFileIfAbsentOrEqual,
} from "../src/services/file-tree.js";
import {
  runRetireLegacyMigration,
  runToCodeMigration,
} from "../src/services/model-migrate.js";
import { runSubgraphToCodeMigration } from "../src/services/subgraph-migrate.js";

const created: string[] = [];
const repositoryRoot = resolve(import.meta.dirname, "../../..");

function temporaryDirectory(prefix: string): string {
  const path = mkdtempSync(join(tmpdir(), prefix));
  created.push(path);
  return path;
}

afterEach(() => {
  while (created.length > 0) {
    const path = created.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("deterministic file trees", () => {
  it("uses unambiguous boundaries between paths and file bytes", async () => {
    const oneFile = temporaryDirectory("ph-file-tree-one-");
    const twoFiles = temporaryDirectory("ph-file-tree-two-");
    writeFileSync(join(oneFile, "x"), Buffer.from("a\0y\0b"));
    writeFileSync(join(twoFiles, "x"), "a");
    writeFileSync(join(twoFiles, "y"), "b");
    const symlinkError = (path: string) =>
      new Error(`Unexpected symbolic link: ${path}`);

    const [first, second] = await Promise.all([
      snapshotFileTree(oneFile, symlinkError),
      snapshotFileTree(twoFiles, symlinkError),
    ]);

    expect(first.digest).not.toBe(second.digest);
  });

  it("rejects a symbolic link in a candidate path", async () => {
    const root = temporaryDirectory("ph-file-tree-link-");
    const target = temporaryDirectory("ph-file-tree-target-");
    const link = join(root, "candidate");
    symlinkSync(target, link, "dir");

    await expect(
      assertNoSymlinks(
        root,
        join(link, "index.ts"),
        (path) => new Error(`Symbolic link: ${path}`),
      ),
    ).rejects.toThrow(`Symbolic link: ${link}`);
  });

  it("does not follow a symlinked parent while creating a file", async () => {
    const root = temporaryDirectory("ph-file-tree-write-link-");
    const target = temporaryDirectory("ph-file-tree-write-target-");
    const link = join(root, "candidate");
    symlinkSync(target, link, "dir");

    await expect(
      writeFileIfAbsentOrEqual(
        root,
        join(link, "migration-report.json"),
        "report\n",
        (path) => new Error(`Symbolic link: ${path}`),
      ),
    ).rejects.toThrow(`Symbolic link: ${link}`);
    expect(() => readFileSync(join(target, "migration-report.json"))).toThrow();
  });
});

function temporaryModelPackage(): string {
  const root = temporaryDirectory("ph-model-migration-write-");
  const legacyRoot = join(root, "document-models", "todo");
  mkdirSync(legacyRoot, { recursive: true });
  cpSync(
    join(
      repositoryRoot,
      "test/versioned-documents/document-models/todo/todo.json",
    ),
    join(legacyRoot, "todo.json"),
  );
  return root;
}

function temporarySubgraphPackage(): string {
  const root = temporaryDirectory("ph-subgraph-migration-write-");
  cpSync(
    join(
      repositoryRoot,
      "test/code-first-definitions/fixtures/subgraph-migrations/v1/legacy/example",
    ),
    join(root, "subgraphs", "example"),
    { recursive: true },
  );
  return root;
}

describe("migration report writes", () => {
  it("writes beneath a temporary root whose platform path has a realpath alias", async () => {
    const root = temporaryDirectory("ph-file-tree-write-");
    const directory = join(root, "candidate");
    const path = join(directory, "migration-report.json");
    mkdirSync(directory);

    await expect(
      writeFileIfAbsentOrEqual(
        root,
        path,
        "report\n",
        (linkedPath) => new Error(`Symbolic link: ${linkedPath}`),
      ),
    ).resolves.toBe(true);
    await expect(
      writeFileIfAbsentOrEqual(
        root,
        path,
        "report\n",
        (linkedPath) => new Error(`Symbolic link: ${linkedPath}`),
      ),
    ).resolves.toBe(true);
    expect(readFileSync(path, "utf8")).toBe("report\n");
  });

  it("preserves a different model migration report", async () => {
    const packageRoot = temporaryModelPackage();
    const reportPath = join(
      packageRoot,
      "document-models/.verification/todo/migration-report.json",
    );
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, "author report\n");

    const report = await runToCodeMigration({
      family: "todo",
      apply: true,
      packageRoot,
    });

    expect(report.status).toBe("failed");
    expect(report.diagnostics[0]?.code).toBe("PH-MIGRATE-REPORT-DRIFT");
    expect(readFileSync(reportPath, "utf8")).toBe("author report\n");
  });

  it("preserves the target of a symlinked model migration report", async () => {
    const packageRoot = temporaryModelPackage();
    const candidateRoot = join(
      packageRoot,
      "document-models/.verification/todo",
    );
    const target = join(packageRoot, "model-report-target.json");
    mkdirSync(candidateRoot, { recursive: true });
    writeFileSync(target, "external report\n");
    symlinkSync(target, join(candidateRoot, "migration-report.json"), "file");

    const report = await runToCodeMigration({
      family: "todo",
      apply: true,
      packageRoot,
    });

    expect(report.status).toBe("failed");
    expect(report.diagnostics[0]?.code).toBe("PH-MIGRATE-CANDIDATE-SYMLINK");
    expect(readFileSync(target, "utf8")).toBe("external report\n");
  });

  it("preserves a different subgraph migration report", async () => {
    const packageRoot = temporarySubgraphPackage();
    const reportPath = join(
      packageRoot,
      "subgraphs/.verification/example/migration-report.json",
    );
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, "author report\n");

    const report = await runSubgraphToCodeMigration({
      subgraph: "example",
      apply: true,
      packageRoot,
    });

    expect(report.status).toBe("failed");
    expect(report.diagnostics[0]?.code).toBe(
      "PH-MIGRATE-SUBGRAPH-REPORT-DRIFT",
    );
    expect(readFileSync(reportPath, "utf8")).toBe("author report\n");
  });

  it("preserves the target of a symlinked subgraph migration report", async () => {
    const packageRoot = temporarySubgraphPackage();
    const candidateRoot = join(packageRoot, "subgraphs/.verification/example");
    const target = join(packageRoot, "subgraph-report-target.json");
    mkdirSync(candidateRoot, { recursive: true });
    writeFileSync(target, "external report\n");
    symlinkSync(target, join(candidateRoot, "migration-report.json"), "file");

    const report = await runSubgraphToCodeMigration({
      subgraph: "example",
      apply: true,
      packageRoot,
    });

    expect(report.status).toBe("failed");
    expect(report.diagnostics[0]?.code).toBe(
      "PH-MIGRATE-SUBGRAPH-CANDIDATE-SYMLINK",
    );
    expect(readFileSync(target, "utf8")).toBe("external report\n");
  });
});

describe("retirement source scanning", () => {
  it("fails closed on a symlinked TypeScript source", async () => {
    const packageRoot = temporaryModelPackage();
    const evidenceRoot = join(packageRoot, ".ph/migrations/todo");
    const sourceRoot = join(packageRoot, "src");
    const ignoredRoot = join(packageRoot, "dist");
    mkdirSync(evidenceRoot, { recursive: true });
    mkdirSync(sourceRoot);
    mkdirSync(ignoredRoot);
    writeFileSync(
      join(evidenceRoot, "equivalence-report.json"),
      JSON.stringify({
        family: {
          documentType: "test/todo",
          digest: `sha256:${"0".repeat(64)}`,
        },
      }),
    );
    writeFileSync(
      join(evidenceRoot, "masked-verification.json"),
      JSON.stringify({ status: "pass" }),
    );
    const linkedSource = join(ignoredRoot, "active.ts");
    writeFileSync(
      linkedSource,
      'export * from "../document-models/todo/index.js";\n',
    );
    symlinkSync(linkedSource, join(sourceRoot, "active.ts"), "file");

    const report = await runRetireLegacyMigration({
      family: "todo",
      apply: false,
      packageRoot,
    });

    expect(report.status).toBe("failed");
    expect(report.diagnostics[0]?.code).toBe("PH-MIGRATE-RETIRE-SYMLINK");
  });
});

describe("migration directory names", () => {
  it.each([
    "",
    " ",
    " todo",
    "todo ",
    ".git",
    ".verification",
    "../todo",
    "a/b",
    "a\\b",
  ])("rejects %j", (name) => {
    expect(isVisibleDirectoryBasename(name)).toBe(false);
  });

  it.each(["todo", "billing-statement", "Invoice_Status"])(
    "accepts %j",
    (name) => {
      expect(isVisibleDirectoryBasename(name)).toBe(true);
    },
  );

  it("returns structured failures before reading an invalid path", async () => {
    const packageRoot = temporaryDirectory("ph-invalid-migration-name-");
    const [model, subgraph] = await Promise.all([
      runToCodeMigration({
        family: ".verification",
        apply: true,
        packageRoot,
      }),
      runSubgraphToCodeMigration({
        subgraph: ".git",
        apply: true,
        packageRoot,
      }),
    ]);

    expect(model.diagnostics[0]?.code).toBe("PH-MIGRATE-FAMILY-NAME-INVALID");
    expect(subgraph.diagnostics[0]?.code).toBe(
      "PH-MIGRATE-SUBGRAPH-NAME-RESERVED",
    );
  });

  it("rejects symlinked migration-root ancestors", async () => {
    const packageRoot = temporaryDirectory("ph-symlinked-migration-root-");
    const externalModels = temporaryDirectory("ph-external-models-");
    const externalSubgraphs = temporaryDirectory("ph-external-subgraphs-");
    symlinkSync(externalModels, join(packageRoot, "document-models"), "dir");
    symlinkSync(externalSubgraphs, join(packageRoot, "subgraphs"), "dir");

    const [model, subgraph] = await Promise.all([
      runToCodeMigration({ family: "todo", apply: false, packageRoot }),
      runSubgraphToCodeMigration({
        subgraph: "todo",
        apply: false,
        packageRoot,
      }),
    ]);

    expect(model.diagnostics[0]?.code).toBe("PH-MIGRATE-RETIRE-SYMLINK");
    expect(subgraph.diagnostics[0]?.code).toBe("PH-MIGRATE-SUBGRAPH-SYMLINK");
  });
});
