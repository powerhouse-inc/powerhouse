import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Ajv } from "../src/evidence/ajv.js";
import { publishArtifactSet } from "../src/evidence/artifact-set.js";
import {
  evidenceExitCode,
  runGateEvidence,
} from "../src/evidence/run-gate-evidence.js";
import { readJson } from "../src/evidence/utils.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const created: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "ph-gate-artifacts-"));
  created.push(directory);
  return directory;
}

afterEach(() => {
  while (created.length > 0) {
    const directory = created.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("gate evidence protocol", () => {
  it("validates the B9 fixture and complete passing report", async () => {
    const fixtureSchema = await readJson(
      resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
    );
    const reportSchema = await readJson(
      resolve(packageRoot, "schemas/gate-evidence-report-v1.schema.json"),
    );
    const manifestPath = resolve(
      packageRoot,
      "fixtures/reproductions/v1/failure-propagation/manifest.json",
    );
    const manifest = await readJson(manifestPath);
    const ajv = new Ajv({ allErrors: true, strict: false });

    expect(ajv.compile(fixtureSchema as object)(manifest)).toBe(true);
    const report = await runGateEvidence({
      gate: "B9",
      repositoryRoot,
      fixtureManifest: manifestPath,
      commandArgs: ["--gate", "B9"],
    });
    expect(report.evidence).toEqual({ outcome: "pass" });
    expect(report.assertions).toHaveLength(9);
    expect(report.assertions.every(({ outcome }) => outcome === "pass")).toBe(
      true,
    );
    expect(report.artifacts.map(({ name }) => name)).toEqual([
      "failure-manifest",
      "recording-registry-journal",
      "output-tree-manifests",
    ]);
    expect(report.results.injections).toHaveLength(29);
    expect(ajv.compile(reportSchema as object)(report)).toBe(true);
  }, 60_000);

  it("maps gate outcomes to the fixed process exit codes", () => {
    expect(evidenceExitCode("pass")).toBe(0);
    expect(evidenceExitCode("fail")).toBe(1);
    expect(evidenceExitCode("blocked")).toBe(2);
    expect(evidenceExitCode("cancelled")).toBe(130);
  });

  it("publishes a complete artifact set with one final rename", async () => {
    const parent = temporaryDirectory();
    const destination = join(parent, "B9");

    const files = await publishArtifactSet({
      destination,
      write: async (stagingDirectory) => {
        await mkdir(join(stagingDirectory, "nested"));
        await writeFile(join(stagingDirectory, "report.json"), "{}\n");
        await writeFile(join(stagingDirectory, "nested", "data.txt"), "data\n");
      },
    });

    expect(files.map(({ path }) => path)).toEqual([
      "nested/data.txt",
      "report.json",
    ]);
    expect(await readdir(destination)).toEqual([
      "artifact-manifest.json",
      "nested",
      "report.json",
    ]);
    expect(
      (await readdir(parent)).filter((name) => name.includes("staging")),
    ).toEqual([]);
  });

  it("removes staging output after cancellation", async () => {
    const parent = temporaryDirectory();
    const destination = join(parent, "B9");
    const controller = new AbortController();

    await expect(
      publishArtifactSet({
        destination,
        signal: controller.signal,
        write: async (stagingDirectory) => {
          await writeFile(join(stagingDirectory, "partial.txt"), "partial\n");
          controller.abort(new DOMException("cancelled", "AbortError"));
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(await readdir(parent)).toEqual([]);
  });

  it("keeps the three review vectors byte-identical to cf-spec", async () => {
    const pairs = [
      [
        "cf-spec/fixtures/v1/document-model-definition.json",
        "test/code-first-definitions/fixtures/definitions/v1/document-model/review-vector.json",
      ],
      [
        "cf-spec/fixtures/v1/subgraph-definition.json",
        "test/code-first-definitions/fixtures/definitions/v1/subgraph/review-vector.json",
      ],
      [
        "cf-spec/fixtures/v1/scalar-definition.json",
        "test/code-first-definitions/fixtures/scalars/v1/review-vector.json",
      ],
    ] as const;

    for (const [source, copy] of pairs) {
      expect(await readFile(resolve(repositoryRoot, copy))).toEqual(
        await readFile(resolve(repositoryRoot, source)),
      );
    }
  });
});
