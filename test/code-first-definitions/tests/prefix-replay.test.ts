import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { Ajv } from "../src/evidence/ajv.js";
import {
  evaluateSyntheticReplay,
  SYNTHETIC_REPLAY_ASSERTION_IDS,
  type SyntheticReplayEvaluation,
} from "../src/evidence/synthetic-replay.js";

const packageRoot = resolve(import.meta.dirname, "..");
const manifestPath = resolve(
  packageRoot,
  "fixtures/histories/v1/manifest.json",
);

let evaluation: SyntheticReplayEvaluation;

beforeAll(async () => {
  evaluation = await evaluateSyntheticReplay(manifestPath);
});

describe("B2 synthetic raw replay", () => {
  it("validates the closed synthetic-only fixture manifest", async () => {
    const [schema, manifest] = await Promise.all([
      readFile(
        resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
        "utf8",
      ).then((value) => JSON.parse(value) as object),
      readFile(manifestPath, "utf8").then(
        (value) =>
          JSON.parse(value) as {
            readonly profile: string;
            readonly productionCorpusStatus: string;
            readonly cases: readonly unknown[];
          },
      ),
    ]);
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      schema,
    );
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(manifest.profile).toBe("synthetic-only-v1");
    expect(manifest.productionCorpusStatus).toBe("not-established");
    expect(manifest.cases).toHaveLength(3);
  });

  it("matches all nine coordinates at all 17 replay prefixes", () => {
    expect(evaluation.assertions.map(({ id }) => id)).toEqual(
      SYNTHETIC_REPLAY_ASSERTION_IDS,
    );
    expect(
      evaluation.assertions.every(({ outcome }) => outcome === "pass"),
    ).toBe(true);
    expect(evaluation.operationCount).toBe(14);
    expect(evaluation.prefixCount).toBe(17);
    expect(evaluation.divergences).toEqual([]);
    expect(new Set(evaluation.prefixes.map(({ caseId }) => caseId))).toEqual(
      new Set([
        "protocol-v1-mixed-outcomes",
        "protocol-v2-global-local",
        "protocol-upgrade-v1-v2",
      ]),
    );
  });

  it("covers recalculated errors, denial, skip metadata, dispatch, and upgrade", () => {
    expect(
      evaluation.prefixes.some(({ errors }) =>
        errors.some((error) => error !== null),
      ),
    ).toBe(true);
    expect(
      evaluation.prefixes.some(({ denials }) =>
        denials.includes("fixture-policy-denied"),
      ),
    ).toBe(true);
    expect(evaluation.prefixes.some(({ skips }) => skips.includes(1))).toBe(
      true,
    );
    expect(
      evaluation.prefixes.some(({ dispatches }) => dispatches.length > 0),
    ).toBe(true);
    const upgraded = evaluation.prefixes.find(
      ({ caseId, prefixIndex }) =>
        caseId === "protocol-upgrade-v1-v2" && prefixIndex === 4,
    );
    expect(upgraded?.state).toMatchObject({
      document: { version: 2 },
      global: { counter: 4, title: "After upgrade" },
    });
  });
});
