import type {
  Operation,
  RetractActionInput,
} from "@powerhousedao/shared/document-model";
import {
  appliedOperations,
  baseCreateDocument,
  redo,
  SubmittedUndoRefusedError,
  undo,
} from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import {
  type CountDocument,
  countReducer,
  createCountDocumentState,
  error,
  increment,
  pressOn3,
  testCreateBaseState,
} from "../helpers.js";

function v3Document(): CountDocument {
  const document = baseCreateDocument(
    createCountDocumentState,
    testCreateBaseState({ count: 0 }, { name: "" }),
    "",
    { "base-reducer": 3 },
  );
  expect(document.header.protocolVersions?.["base-reducer"]).toBe(3);
  return document;
}

const lastRow = (document: CountDocument): Operation =>
  document.operations.global!.at(-1)!;

const appliedIds = (document: CountDocument) =>
  appliedOperations(document.operations.global!).map(
    (operation) => operation.action.id,
  );

function expectRetractOf(document: CountDocument, target: string): string {
  const row = lastRow(document);
  expect(row.action.type).toBe("RETRACT");
  expect((row.action.input as RetractActionInput).target).toBe(target);
  expect(row.skip).toBe(0);
  return row.action.id;
}

describe("base-reducer 3 undo and redo stack, as a client plans it", () => {
  it("a b: UNDO retracts b", () => {
    const a = increment();
    const b = increment();
    let document = countReducer(v3Document(), a);
    document = countReducer(document, b);

    document = pressOn3(document, "UNDO");

    expectRetractOf(document, b.id);
    expect(appliedIds(document)).toEqual([a.id]);
    expect(document.state.global.count).toBe(1);
  });

  it("a b R(b): UNDO retracts a", () => {
    const a = increment();
    const b = increment();
    let document = countReducer(v3Document(), a);
    document = countReducer(document, b);
    document = pressOn3(document, "UNDO");

    document = pressOn3(document, "UNDO");

    expectRetractOf(document, a.id);
    expect(appliedIds(document)).toEqual([]);
    expect(document.state.global.count).toBe(0);
  });

  it("a b R(b) R(a): REDO retracts R(a)", () => {
    const a = increment();
    const b = increment();
    let document = countReducer(v3Document(), a);
    document = countReducer(document, b);
    document = pressOn3(document, "UNDO");
    document = pressOn3(document, "UNDO");
    const retractA = lastRow(document).action.id;

    document = pressOn3(document, "REDO");

    expectRetractOf(document, retractA);
    expect(appliedIds(document)).toEqual([a.id]);
    expect(document.state.global.count).toBe(1);
  });

  it("a b R(b) R(a) R': REDO retracts R(b)", () => {
    const a = increment();
    const b = increment();
    let document = countReducer(v3Document(), a);
    document = countReducer(document, b);
    document = pressOn3(document, "UNDO");
    const retractB = lastRow(document).action.id;
    document = pressOn3(document, "UNDO");
    document = pressOn3(document, "REDO");

    document = pressOn3(document, "REDO");

    expectRetractOf(document, retractB);
    expect(appliedIds(document)).toEqual([a.id, b.id]);
    expect(document.state.global.count).toBe(2);
  });

  it("a b R(b) c: REDO is refused because c follows the undo", () => {
    const a = increment();
    const b = increment();
    const c = increment();
    let document = countReducer(v3Document(), a);
    document = countReducer(document, b);
    document = pressOn3(document, "UNDO");
    document = countReducer(document, c);
    const before = document;

    expect(() => pressOn3(before, "REDO")).toThrow(
      /Cannot redo: nothing to redo/,
    );
    expect(appliedIds(before)).toEqual([a.id, c.id]);
    expect(before.state.global.count).toBe(2);
  });

  it("UNDO skips a row whose action threw", () => {
    const a = increment();
    let document = countReducer(v3Document(), a);
    document = countReducer(document, error());
    expect(document.operations.global).toHaveLength(2);

    document = pressOn3(document, "UNDO");

    expectRetractOf(document, a.id);
    expect(document.state.global.count).toBe(0);
  });

  it("a dispatched UNDO or REDO is refused, whatever its count", () => {
    let document = countReducer(v3Document(), increment());
    document = countReducer(document, increment());
    const before = document;

    for (const action of [undo(), undo(2), redo()]) {
      expect(() => countReducer(before, action)).toThrow(
        SubmittedUndoRefusedError,
      );
    }
    expect(before.operations.global).toHaveLength(2);
  });

  it("UNDO, REDO, UNDO succeeds", () => {
    const a = increment();
    const b = increment();
    let document = countReducer(v3Document(), a);
    document = countReducer(document, b);
    document = pressOn3(document, "UNDO");
    const retractB = expectRetractOf(document, b.id);

    document = pressOn3(document, "REDO");
    expectRetractOf(document, retractB);
    expect(document.state.global.count).toBe(2);

    document = pressOn3(document, "UNDO");
    expectRetractOf(document, b.id);
    expect(appliedIds(document)).toEqual([a.id]);
    expect(document.state.global.count).toBe(1);
  });
});
