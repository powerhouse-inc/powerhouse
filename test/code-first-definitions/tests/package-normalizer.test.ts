import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { Ajv } from "../src/evidence/ajv.js";
import {
  B8_HOSTS,
  evaluateLoaderCompatibility,
  runLoaderCompatibilityCases,
  type LoaderCompatibilityEvaluation,
} from "../src/evidence/loader-compatibility.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(packageRoot, "fixtures/packages/v1/manifest.json");

let evaluation: LoaderCompatibilityEvaluation;

beforeAll(async () => {
  evaluation = await evaluateLoaderCompatibility(manifestPath);
}, 60_000);

describe("B8 definition-source and loader compatibility", () => {
  it("validates the closed eleven-host fixture manifest", async () => {
    const [schema, manifest] = await Promise.all([
      readFile(
        resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as object),
      readFile(manifestPath, "utf8").then(
        (value) =>
          JSON.parse(value) as {
            readonly cases: readonly { readonly caseId: string }[];
          },
      ),
    ]);
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      schema,
    );
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(manifest.cases.map(({ caseId }) => caseId)).toEqual(B8_HOSTS);
  });

  it("passes every host assertion without a legacy/code-first mismatch", () => {
    expect(evaluation.assertions).toHaveLength(B8_HOSTS.length);
    expect(
      evaluation.assertions.every(({ outcome }) => outcome === "pass"),
    ).toBe(true);
    expect(
      evaluation.hosts.every(({ firstMismatch }) => firstMismatch === null),
    ).toBe(true);
  });

  it("locks each host's current namespace and version-selection quirks", () => {
    const byId = Object.fromEntries(
      evaluation.hosts.map((host) => [host.hostId, host]),
    );
    expect(byId["node-server"]?.registrationOutcome).toBe(
      "models=2;subgraphs=5;manifests=1",
    );
    expect(byId["http-cdn"]?.registrationOutcome).toBe(
      "flattened=3;non-callables=filtered",
    );
    expect(byId["vite-local"]?.registrationOutcome).toBe(
      "models=2;subgraphs=1",
    );
    expect(byId["browser-static"]?.registrationOutcome).toContain(
      "selected=powerhouse/loader-fixture@2",
    );
    expect(byId.connect?.registrationOutcome).toContain(
      "selected=powerhouse/loader-fixture@1",
    );
    expect(byId["reactor-worker"]?.selectedNamedWorkerReference).toEqual({
      specifier: "./models.ts",
      exportName: "LoaderModelV2",
    });
    expect(byId.registry?.diagnostics).toEqual(["DuplicateModuleError"]);
  });

  it("normalizes one explicit source module identically through Vite and build adapters", () => {
    const probe = runLoaderCompatibilityCases(packageRoot);
    expect(probe.definitionSource).toMatchObject({
      normalizedSources: [
        "./source-models.ts#/LoaderModelV2",
        "./source-models.ts#/nested/model~1v1",
      ],
      acceptedExports: [
        "powerhouse/loader-fixture@1",
        "powerhouse/loader-fixture@2",
      ],
      importCount: 1,
    });
  });
});
