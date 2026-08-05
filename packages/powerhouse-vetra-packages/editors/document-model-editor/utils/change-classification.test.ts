import { describe, expect, it } from "vitest";
import { diffSdlShapes, hasShapeChange } from "./change-classification.js";

describe("diffSdlShapes", () => {
  it("detects an added field", () => {
    const diff = diffSdlShapes(
      "type TodoState { title: String }",
      "type TodoState { title: String description: String }",
    );
    expect(diff.addedFields).toEqual(["TodoState.description"]);
    expect(diff.removedFields).toEqual([]);
    expect(diff.changedFields).toEqual([]);
    expect(hasShapeChange(diff)).toBe(true);
  });

  it("detects a removed field", () => {
    const diff = diffSdlShapes(
      "type TodoState { title: String description: String }",
      "type TodoState { title: String }",
    );
    expect(diff.removedFields).toEqual(["TodoState.description"]);
  });

  it("reports a field rename as removed + added", () => {
    const diff = diffSdlShapes(
      "type TodoState { title: String }",
      "type TodoState { name: String }",
    );
    expect(diff.removedFields).toEqual(["TodoState.title"]);
    expect(diff.addedFields).toEqual(["TodoState.name"]);
  });

  it("detects a field type change", () => {
    const diff = diffSdlShapes(
      "type InvoiceState { amount: Int }",
      "type InvoiceState { amount: Float }",
    );
    expect(diff.changedFields).toEqual(["InvoiceState.amount: Int → Float"]);
  });

  it("detects a nullability change", () => {
    const diff = diffSdlShapes(
      "type TodoState { title: String }",
      "type TodoState { title: String! }",
    );
    expect(diff.changedFields).toEqual(["TodoState.title: String → String!"]);
  });

  it("ignores field reordering and descriptions", () => {
    const diff = diffSdlShapes(
      "type TodoState { title: String done: Boolean }",
      '"""A todo"""\ntype TodoState {\n  done: Boolean\n  "the title"\n  title: String\n}',
    );
    expect(hasShapeChange(diff)).toBe(false);
  });

  it("treats a type rename with identical fields as no shape change", () => {
    const diff = diffSdlShapes(
      "type TodoState { title: String items: [TodoItem!]! } type TodoItem { id: ID! }",
      "type TaskState { title: String items: [TodoItem!]! } type TodoItem { id: ID! }",
    );
    expect(hasShapeChange(diff)).toBe(false);
  });

  it("rewrites references to a renamed type before comparing", () => {
    const diff = diffSdlShapes(
      "type TodoState { items: [TodoItem!]! } type TodoItem { id: ID! }",
      "type TodoState { items: [TaskItem!]! } type TaskItem { id: ID! }",
    );
    expect(hasShapeChange(diff)).toBe(false);
  });

  it("detects enum value changes", () => {
    const diff = diffSdlShapes(
      "type S { status: Status } enum Status { OPEN }",
      "type S { status: Status } enum Status { OPEN CLOSED }",
    );
    expect(diff.addedFields).toEqual(["Status.CLOSED"]);
  });

  it("returns an empty diff for unparseable SDL", () => {
    const diff = diffSdlShapes("type Broken {", "type TodoState { title: String }");
    expect(hasShapeChange(diff)).toBe(false);
  });
});
