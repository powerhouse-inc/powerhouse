import {
  archiveFeature,
  clearPromotion,
  commitFeature,
  promoteToSpec,
  reducer,
  reopenFeature,
  startEvaluation,
  utils,
} from "document-models/feature/v1";
import { describe, expect, it } from "vitest";

function failure(run: () => ReturnType<typeof reducer>): unknown {
  try {
    return run().operations.global.at(-1)?.error ?? null;
  } catch (e) {
    return e;
  }
}

const TS = "2026-05-29T10:00:00.000Z";

describe("Lifecycle transitions", () => {
  it("walks PROPOSED → EVALUATING → COMMITTED → IN_SPEC and records promotion", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, startEvaluation({}));
    expect(doc.state.global.status).toBe("EVALUATING");
    doc = reducer(doc, commitFeature({}));
    expect(doc.state.global.status).toBe("COMMITTED");
    doc = reducer(
      doc,
      promoteToSpec({
        promotedAt: TS,
        promotedBy: "wouter",
        rationale: "Won over alternatives.",
      }),
    );
    expect(doc.state.global.status).toBe("IN_SPEC");
    expect(doc.state.global.promotion).toEqual({
      promotedAt: TS,
      promotedBy: "wouter",
      rationale: "Won over alternatives.",
    });

    doc = reducer(doc, clearPromotion({}));
    expect(doc.state.global.promotion).toBeNull();
  });

  it("rejects invalid source transitions", () => {
    const doc = utils.createDocument();
    // Cannot promote straight from PROPOSED.
    expect(
      failure(() => reducer(doc, promoteToSpec({ promotedAt: TS }))),
    ).toBeTruthy();
    // Cannot start evaluation twice.
    const evaluating = reducer(doc, startEvaluation({}));
    expect(
      failure(() => reducer(evaluating, startEvaluation({}))),
    ).toBeTruthy();
  });

  it("archives, then reopens to PROPOSED", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, archiveFeature({ reason: "Out of scope for v1." }));
    expect(doc.state.global.status).toBe("ARCHIVED");
    expect(doc.state.global.notes).toBe("Out of scope for v1.");

    doc = reducer(doc, reopenFeature({}));
    expect(doc.state.global.status).toBe("PROPOSED");
  });
});
