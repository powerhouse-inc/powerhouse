import {
  addSuggestion,
  reducer,
  removeSuggestion,
  resolveSuggestion,
  setReadyForFeedback,
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

describe("Agent feedback operations", () => {
  it("sets ready, adds, resolves and removes suggestions", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, setReadyForFeedback({ ready: true }));
    expect(doc.state.global.agentFeedback.readyForFeedback).toBe(true);

    doc = reducer(
      doc,
      addSuggestion({
        id: "g1",
        createdAt: TS,
        agent: "critic",
        content: "Reasoning is thin.",
      }),
    );
    doc = reducer(
      doc,
      resolveSuggestion({
        id: "g1",
        resolvedAt: TS,
        decision: "ACCEPTED",
        comment: "Fair.",
        changeApplied: true,
      }),
    );
    expect(doc.state.global.agentFeedback.suggestions[0].resolution).toEqual({
      resolvedAt: TS,
      decision: "ACCEPTED",
      comment: "Fair.",
      changeApplied: true,
    });

    doc = reducer(doc, removeSuggestion({ id: "g1" }));
    expect(doc.state.global.agentFeedback.suggestions).toHaveLength(0);
  });

  it("rejects resolving an unknown suggestion", () => {
    const doc = utils.createDocument();
    expect(
      failure(() =>
        reducer(
          doc,
          resolveSuggestion({
            id: "nope",
            resolvedAt: TS,
            decision: "DISMISSED",
            changeApplied: false,
          }),
        ),
      ),
    ).toBeTruthy();
  });
});
