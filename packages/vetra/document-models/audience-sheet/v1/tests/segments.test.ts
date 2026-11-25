import {
  addOutcomePriority,
  addSegment,
  addSegmentEvidence,
  addSegmentRole,
  reducer,
  removeOutcomePriority,
  removeSegment,
  removeSegmentEvidence,
  removeSegmentRole,
  reorderOutcomePriorities,
  reorderSegmentRoles,
  reorderSegments,
  updateOutcomePriority,
  updateOutcomePrioritySnippet,
  updateSegment,
  updateSegmentEvidence,
  updateSegmentRoleSnippet,
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

const PROBLEM = "phd:problem-sheet:1";

describe("Segment operations", () => {
  it("adds, updates, reorders and removes segments", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addSegment({ id: "s1", name: "Condo boards" }));
    doc = reducer(doc, addSegment({ id: "s2", name: "Co-housing" }));
    expect(doc.state.global.segments.map((s) => s.id)).toEqual(["s1", "s2"]);

    doc = reducer(
      doc,
      updateSegment({ id: "s1", description: "Self-managed boards" }),
    );
    expect(doc.state.global.segments[0].description).toBe(
      "Self-managed boards",
    );

    doc = reducer(doc, reorderSegments({ ids: ["s2"], insertBefore: "s1" }));
    expect(doc.state.global.segments.map((s) => s.id)).toEqual(["s2", "s1"]);

    doc = reducer(doc, removeSegment({ id: "s2" }));
    expect(doc.state.global.segments.map((s) => s.id)).toEqual(["s1"]);
  });

  it("rejects a duplicate segment id and operations on unknown segments", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addSegment({ id: "s1", name: "A" }));
    expect(
      failure(() => reducer(doc, addSegment({ id: "s1", name: "B" }))),
    ).toBeTruthy();
    expect(
      failure(() => reducer(doc, updateSegment({ id: "nope", name: "x" }))),
    ).toBeTruthy();
  });

  it("manages role references with snippets", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addSegment({ id: "s1", name: "Condo boards" }));
    doc = reducer(
      doc,
      addSegmentRole({
        segmentId: "s1",
        id: "rr1",
        documentId: PROBLEM,
        objectId: "oid:role-treasurer",
        name: "Treasurer",
        kind: "PRIMARY",
      }),
    );
    expect(doc.state.global.segments[0].roles[0]).toEqual({
      id: "rr1",
      documentId: PROBLEM,
      objectId: "oid:role-treasurer",
      name: "Treasurer",
      kind: "PRIMARY",
    });

    doc = reducer(
      doc,
      updateSegmentRoleSnippet({
        segmentId: "s1",
        id: "rr1",
        name: "Group Treasurer",
      }),
    );
    expect(doc.state.global.segments[0].roles[0].name).toBe("Group Treasurer");
    expect(doc.state.global.segments[0].roles[0].objectId).toBe(
      "oid:role-treasurer",
    );

    doc = reducer(doc, removeSegmentRole({ segmentId: "s1", id: "rr1" }));
    expect(doc.state.global.segments[0].roles).toHaveLength(0);
  });

  it("derives opportunity on add and recomputes on update", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addSegment({ id: "s1", name: "Condo boards" }));
    doc = reducer(
      doc,
      addOutcomePriority({
        segmentId: "s1",
        id: "p1",
        outcomeDocumentId: PROBLEM,
        outcomeObjectId: "oid:outcome-decision-time",
        outcomeStatement: "Decrease decision time",
        outcomeScope: "CORE",
        importance: 9,
        satisfaction: 3,
        source: "BUILDER",
      }),
    );
    // opportunity = importance + max(0, importance - satisfaction) = 9 + 6 = 15
    expect(doc.state.global.segments[0].outcomePriorities[0].opportunity).toBe(
      15,
    );

    doc = reducer(
      doc,
      updateOutcomePriority({ segmentId: "s1", id: "p1", satisfaction: 9 }),
    );
    // 9 + max(0, 9 - 9) = 9
    expect(doc.state.global.segments[0].outcomePriorities[0].opportunity).toBe(
      9,
    );
  });

  it("refreshes an outcome priority snippet and reorders priorities", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addSegment({ id: "s1", name: "Condo boards" }));
    doc = reducer(
      doc,
      addOutcomePriority({
        segmentId: "s1",
        id: "p1",
        outcomeDocumentId: PROBLEM,
        outcomeObjectId: "o1",
        importance: 5,
        satisfaction: 5,
        source: "BUILDER",
      }),
    );
    doc = reducer(
      doc,
      addOutcomePriority({
        segmentId: "s1",
        id: "p2",
        outcomeDocumentId: PROBLEM,
        outcomeObjectId: "o2",
        importance: 5,
        satisfaction: 5,
        source: "BUILDER",
      }),
    );
    doc = reducer(
      doc,
      updateOutcomePrioritySnippet({
        segmentId: "s1",
        id: "p1",
        statement: "Avoid double-booking",
        scope: "CORE",
      }),
    );
    expect(
      doc.state.global.segments[0].outcomePriorities[0].outcome.statement,
    ).toBe("Avoid double-booking");

    doc = reducer(
      doc,
      reorderOutcomePriorities({
        segmentId: "s1",
        ids: ["p2"],
        insertBefore: "p1",
      }),
    );
    expect(
      doc.state.global.segments[0].outcomePriorities.map((p) => p.id),
    ).toEqual(["p2", "p1"]);

    doc = reducer(doc, removeOutcomePriority({ segmentId: "s1", id: "p1" }));
    expect(
      doc.state.global.segments[0].outcomePriorities.map((p) => p.id),
    ).toEqual(["p2"]);
  });

  it("manages segment evidence", () => {
    let doc = utils.createDocument();
    doc = reducer(doc, addSegment({ id: "s1", name: "Condo boards" }));
    doc = reducer(
      doc,
      addSegmentEvidence({
        segmentId: "s1",
        id: "e1",
        source: "USER_RESEARCH",
        content: "20 interviews confirm low satisfaction.",
      }),
    );
    expect(doc.state.global.segments[0].evidence[0].source).toBe(
      "USER_RESEARCH",
    );
    expect(doc.state.global.segments[0].evidence[0].recordedAt).toBeNull();

    doc = reducer(
      doc,
      updateSegmentEvidence({ segmentId: "s1", id: "e1", source: "BUILDER" }),
    );
    expect(doc.state.global.segments[0].evidence[0].source).toBe("BUILDER");

    doc = reducer(doc, removeSegmentEvidence({ segmentId: "s1", id: "e1" }));
    expect(doc.state.global.segments[0].evidence).toHaveLength(0);
  });

  it("rejects role/priority/evidence ops on an unknown segment", () => {
    const doc = utils.createDocument();
    expect(
      failure(() =>
        reducer(
          doc,
          addSegmentRole({
            segmentId: "nope",
            id: "rr1",
            documentId: PROBLEM,
            objectId: "o1",
          }),
        ),
      ),
    ).toBeTruthy();
  });
});
