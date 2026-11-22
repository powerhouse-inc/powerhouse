import {
  addSuggestion,
  reducer,
  removeSuggestion,
  resolveSuggestion,
  setReadyForFeedback,
  utils,
} from "document-models/brand-sheet/v1";
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
        content: "Maxim is weak.",
      }),
    );
    expect(doc.state.global.agentFeedback.suggestions[0].resolution).toBeNull();

    doc = reducer(
      doc,
      resolveSuggestion({
        id: "g1",
        resolvedAt: TS,
        decision: "DISMISSED",
        changeApplied: false,
      }),
    );
    expect(
      doc.state.global.agentFeedback.suggestions[0].resolution?.decision,
    ).toBe("DISMISSED");

    doc = reducer(doc, removeSuggestion({ id: "g1" }));
    expect(doc.state.global.agentFeedback.suggestions).toHaveLength(0);
  });

  it("rejects resolving twice", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addSuggestion({ id: "g1", createdAt: TS, agent: "a", content: "x" }),
    );
    doc = reducer(
      doc,
      resolveSuggestion({
        id: "g1",
        resolvedAt: TS,
        decision: "ACCEPTED",
        changeApplied: true,
      }),
    );
    expect(
      failure(() =>
        reducer(
          doc,
          resolveSuggestion({
            id: "g1",
            resolvedAt: TS,
            decision: "ACCEPTED",
            changeApplied: true,
          }),
        ),
      ),
    ).toBeTruthy();
  });
});
