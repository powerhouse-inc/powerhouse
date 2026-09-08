import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Ajv } from "../src/evidence/ajv.js";
import {
  evaluatePackedConsumers,
  type PackedConsumerEvaluation,
} from "../src/evidence/packed-consumers.js";
import { B5_CASE_IDS } from "../src/evidence/packed-consumers-probe.js";

const packageRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(
  packageRoot,
  "fixtures/packed-consumers/manifest-v1.json",
);

let evaluation: PackedConsumerEvaluation;

beforeAll(async () => {
  evaluation = await evaluatePackedConsumers(manifestPath);
}, 60_000);

describe("B5 packed declarations", () => {
  it("validates the closed two-consumer fixture manifest", async () => {
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
    expect(manifest.cases.map(({ caseId }) => caseId)).toEqual(B5_CASE_IDS);
  });

  it("passes all packed type, import, worker, and portability assertions", () => {
    expect(evaluation.assertions.map(({ id }) => id)).toEqual([
      "B5.pack",
      "B5.node-types",
      "B5.browser-types",
      "B5.node-import",
      "B5.worker-import",
      "B5.portability",
    ]);
    expect(
      evaluation.assertions.every(({ outcome }) => outcome === "pass"),
    ).toBe(true);
  });

  it("resolves both consumers entirely inside their fresh installations", () => {
    expect(evaluation.consumers).toHaveLength(2);
    expect(
      evaluation.consumers.every(
        ({ escapedPaths }) => escapedPaths.length === 0,
      ),
    ).toBe(true);
    expect(
      evaluation.consumers.map(
        ({ importedLogicalKeys }) => importedLogicalKeys,
      ),
    ).toEqual([
      ["test/todo@1", "test/todo@2"],
      ["test/todo@1", "test/todo@2"],
    ]);
    expect(evaluation.consumers[1]?.workerHandshake).toMatchObject({
      status: "ok",
      actionType: "EDIT_TITLE",
      splitEntryMatches: true,
    });
  });
});
