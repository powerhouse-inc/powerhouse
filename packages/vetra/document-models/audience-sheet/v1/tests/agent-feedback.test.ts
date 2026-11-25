import {
  addSuggestion,
  reducer,
  removeSuggestion,
  resolveSuggestion,
  setReadyForFeedback,
  utils,
} from "document-models/audience-sheet/v1";
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
  it("sets the ready flag", () => {
    const doc = utils.createDocument();
    const next = reducer(doc, setReadyForFeedback({ ready: true }));
    expect(next.state.global.agentFeedback.readyForFeedback).toBe(true);
  });

  it("adds and resolves a suggestion", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addSuggestion({
        id: "g1",
        createdAt: TS,
        agent: "critic",
        content: "Segments overlap.",
      }),
    );
    expect(doc.state.global.agentFeedback.suggestions).toHaveLength(1);
    expect(doc.state.global.agentFeedback.suggestions[0].resolution).toBeNull();

    doc = reducer(
      doc,
      resolveSuggestion({
        id: "g1",
        resolvedAt: TS,
        decision: "ACCEPTED",
        changeApplied: true,
      }),
    );
    expect(doc.state.global.agentFeedback.suggestions[0].resolution).toEqual({
      resolvedAt: TS,
      decision: "ACCEPTED",
      comment: null,
      changeApplied: true,
    });
  });

  it("rejects resolving twice and duplicate ids", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addSuggestion({ id: "g1", createdAt: TS, agent: "a", content: "x" }),
    );
    expect(
      failure(() =>
        reducer(
          doc,
          addSuggestion({ id: "g1", createdAt: TS, agent: "a", content: "y" }),
        ),
      ),
    ).toBeTruthy();
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
      failure(() =>
        reducer(
          doc,
          resolveSuggestion({
            id: "g1",
            resolvedAt: TS,
            decision: "ACCEPTED",
            changeApplied: false,
          }),
        ),
      ),
    ).toBeTruthy();
  });

  it("removes a suggestion", () => {
    let doc = utils.createDocument();
    doc = reducer(
      doc,
      addSuggestion({ id: "g1", createdAt: TS, agent: "a", content: "x" }),
    );
    doc = reducer(doc, removeSuggestion({ id: "g1" }));
    expect(doc.state.global.agentFeedback.suggestions).toHaveLength(0);
  });
});
