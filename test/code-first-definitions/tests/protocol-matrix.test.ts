import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  PROTOCOL_MATRIX_ROWS,
  PROTOCOL_ROUTES,
  canonicalProtocolJson,
  evaluateProtocolMatrix,
  executeProtocolMatrixRow,
  type ProtocolMatrixManifest,
} from "../src/evidence/protocol-matrix.js";

const matrixPath = fileURLToPath(
  new URL("../fixtures/protocol/v1/matrix.json", import.meta.url),
);

async function matrix(): Promise<ProtocolMatrixManifest> {
  return JSON.parse(
    await readFile(matrixPath, "utf8"),
  ) as ProtocolMatrixManifest;
}

describe("B3 protocol and family matrix", () => {
  test("contains every stable row and public route", async () => {
    const fixture = await matrix();
    expect(fixture.caseCount).toBe(23);
    expect(fixture.cases.map(({ rowId }) => rowId)).toEqual(
      PROTOCOL_MATRIX_ROWS.map(({ rowId }) => rowId),
    );
    expect(new Set(fixture.cases.map(({ route }) => route))).toEqual(
      new Set(PROTOCOL_ROUTES),
    );
  });

  test("legacy and code-first implementations match all committed outcomes", async () => {
    const evaluation = await evaluateProtocolMatrix(matrixPath);
    expect(evaluation.assertions.map(({ id }) => id)).toEqual([
      "B3.validation",
      "B3.scope",
      "B3.state",
      "B3.hash",
      "B3.error",
      "B3.dispatch",
      "B3.version",
      "B3.upgrade",
    ]);
    expect(
      evaluation.assertions.map(({ outcome, failures }) => ({
        outcome,
        failureCount: failures.length,
      })),
    ).toEqual(
      Array.from({ length: 8 }, () => ({
        outcome: "pass",
        failureCount: 0,
      })),
    );
    expect(evaluation.rows).toHaveLength(23);
    expect(
      evaluation.rows.every(({ firstMismatch }) => firstMismatch === null),
    ).toBe(true);
  });

  test("locks the compatibility edge cases explicitly", async () => {
    const fixture = await matrix();
    const byId = new Map(fixture.cases.map((row) => [row.rowId, row]));
    expect(byId.get("wrong-scope-core-v1")?.expected.outcomeCode).toBe(
      "applied",
    );
    expect(byId.get("unknown-runtime-scope")?.expected.outcomeCode).toBe(
      "reducer-error",
    );
    expect(byId.get("domain-error-default")?.expected).toMatchObject({
      errorCode: "Rejected",
      storedErrorCode: "STORED_REJECTION",
    });
    expect(byId.get("domain-error-explicit")?.expected.errors).toContain(
      "error:global:0:explicit rejection",
    );
    expect(
      byId.get("stored-version-zero")?.expected.selectedModuleVersion,
    ).toBe(1);
    expect(byId.get("upgrade-v1-v2")?.expected.upgradePath).toEqual([2]);
    expect(
      byId.get("duplicate-action-type-rejects-complete-model")?.expected.errors,
    ).toEqual([
      "legacy:PH-DM-DUPLICATE-ACTION",
      "code-first:PH-DM-DUPLICATE-ACTION",
    ]);
  });

  test("repeated execution is deterministic after volatile fields are projected", () => {
    for (const row of PROTOCOL_MATRIX_ROWS) {
      const first = executeProtocolMatrixRow("code-first", row);
      const second = executeProtocolMatrixRow("code-first", row);
      expect(canonicalProtocolJson(first)).toBe(canonicalProtocolJson(second));
    }
  });
});
