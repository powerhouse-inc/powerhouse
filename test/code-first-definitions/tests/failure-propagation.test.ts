import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DefinitionSourceLoader,
  type TypeScriptSourceImportInterface,
} from "document-model/tooling";
import { createByteManifest } from "../src/evidence/byte-manifest.js";
import { RecordingRegistryAdapter } from "../src/evidence/recording-registry-adapter.js";

type FailureCase = {
  readonly caseId: string;
  readonly category: string;
  readonly config: Record<string, unknown> | null;
  readonly cliSources: readonly string[];
  readonly expected: {
    readonly status: "ready" | "failed" | "skipped" | "process-failed";
    readonly diagnosticCodes: readonly string[];
    readonly sourceOrigin: "config" | "cli" | null;
    readonly bundleWriteCount: number;
    readonly registryRequestCount: number;
    readonly decoyImportCount: number;
  };
};

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(
  packageRoot,
  "fixtures/reproductions/v1/failure-propagation",
);
const manifest = JSON.parse(
  readFileSync(join(fixtureRoot, "manifest.json"), "utf8"),
) as { readonly cases: readonly FailureCase[] };
const created: string[] = [];
const resolutionCaseIds = new Set([
  "definition-sources-missing",
  "definition-sources-empty",
  "definition-sources-version-unsupported",
  "duplicate-canonical-source",
  "source-root-escape",
  "source-external-symlink",
  "config-only-selection",
  "cli-replaces-missing-selection",
  "cli-replaces-unsupported-selection",
  "explicit-legacy-mode",
  "decoy-source-tree-not-scanned",
]);

function temporaryProject(config: Record<string, unknown>): string {
  const root = mkdtempSync(join(packageRoot, ".failure-case-"));
  created.push(root);
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "powerhouse.config.json"), JSON.stringify(config));
  writeFileSync(join(root, "src", "definition.ts"), "export {};\n");
  return root;
}

afterEach(() => {
  while (created.length > 0) {
    const directory = created.pop();
    if (directory) rmSync(directory, { recursive: true, force: true });
  }
});

describe("B9 failure propagation baseline", () => {
  it("stops a real workspace ph build before changing bundle output", async () => {
    const source = join(fixtureRoot, "packages", "tsc-failure");
    const project = mkdtempSync(join(packageRoot, ".tsc-failure-"));
    created.push(project);
    cpSync(source, project, { recursive: true });
    cpSync(join(fixtureRoot, "prior-output"), join(project, "dist"), {
      recursive: true,
    });
    const expectedManifest = JSON.parse(
      readFileSync(join(fixtureRoot, "prior-output-manifest.json"), "utf8"),
    ) as { readonly files: unknown };
    const before = await createByteManifest(join(project, "dist"));
    expect(before).toEqual(expectedManifest.files);

    const ph = join(packageRoot, "node_modules", ".bin", "ph");
    expect(existsSync(ph)).toBe(true);
    const env = { ...process.env };
    delete env.PH_BUILD_ALLOW_TS_ERRORS;
    const result = spawnSync(ph, ["build"], {
      cwd: project,
      encoding: "utf8",
      env,
    });

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "Type 'number' is not assignable to type 'string'",
    );
    expect(await createByteManifest(join(project, "dist"))).toEqual(before);
  }, 30_000);

  it("covers the strict config and source-selection matrix without scanning decoys", () => {
    const importModule = vi.fn<TypeScriptSourceImportInterface["importModule"]>(
      () => Promise.resolve({ definition: {} }),
    );
    const loader = new DefinitionSourceLoader({ importModule });
    const cases = manifest.cases.filter((entry) =>
      resolutionCaseIds.has(entry.caseId),
    );

    for (const fixture of cases) {
      const root = temporaryProject(fixture.config ?? {});
      writeFileSync(
        join(root, "src", "decoy.ts"),
        "throw new Error('must not import');\n",
      );
      if (fixture.caseId === "source-external-symlink") {
        const externalRoot = mkdtempSync(
          join(packageRoot, ".external-source-"),
        );
        created.push(externalRoot);
        const external = join(externalRoot, "external.ts");
        writeFileSync(external, "export {};\n");
        symlinkSync(external, join(root, "src", "external.ts"));
      }

      const result = loader.resolve({
        configFile: join(root, "powerhouse.config.json"),
        cliSources: fixture.cliSources,
      });
      expect(result.status, fixture.caseId).toBe(fixture.expected.status);
      expect(
        result.diagnostics.map(({ code }) => code),
        fixture.caseId,
      ).toEqual(fixture.expected.diagnosticCodes);
      expect(result.sourceSet.origin, fixture.caseId).toBe(
        fixture.expected.sourceOrigin,
      );
    }

    expect(importModule).not.toHaveBeenCalled();
  });

  it("keeps the recording registry at zero requests on a failed preflight", () => {
    const adapter = new RecordingRegistryAdapter();

    expect(adapter.requestCount).toBe(0);
    expect(adapter.journal).toEqual([]);
    expect(
      JSON.parse(
        readFileSync(
          join(fixtureRoot, "recording-registry-journal.json"),
          "utf8",
        ),
      ),
    ).toEqual({ formatVersion: 1, requests: [] });
  });
});
