import { describe, expect, it } from "vitest";
import type {
  DocumentSpecification,
  OperationSpecification,
} from "@powerhousedao/shared/document-model";
import {
  deleteModule,
  deleteOperation,
  setInitialState,
  setModelDescription,
  setOperationName,
  setOperationSchema,
  setStateSchema,
} from "@powerhousedao/shared/document-model";
import {
  classifyDocumentModelAction,
  decideDispatch,
  diffSdlShapes,
  hasShapeChange,
} from "./change-classification.js";

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
    const diff = diffSdlShapes(
      "type Broken {",
      "type TodoState { title: String }",
    );
    expect(hasShapeChange(diff)).toBe(false);
  });
});

function makeOperation(
  overrides: Partial<OperationSpecification> = {},
): OperationSpecification {
  return {
    id: "op-1",
    name: "SET_TITLE",
    description: null,
    schema: "input SetTitleInput { title: String! }",
    template: null,
    reducer: null,
    errors: [],
    examples: [],
    scope: "global",
    ...overrides,
  };
}

function makeSpec(
  overrides: Partial<DocumentSpecification> = {},
): DocumentSpecification {
  return {
    version: 1,
    changeLog: [],
    state: {
      global: {
        schema: "type TodoState { title: String }",
        initialValue: '{ "title": "" }',
        examples: [],
      },
      local: { schema: "", initialValue: "", examples: [] },
    },
    modules: [
      {
        id: "mod-1",
        name: "general",
        description: null,
        operations: [makeOperation()],
      },
    ],
    ...overrides,
  };
}

describe("classifyDocumentModelAction", () => {
  it("flags a state schema shape change with the field diff", () => {
    const result = classifyDocumentModelAction(
      setStateSchema({
        schema: "type TodoState { title: String name: String }",
        scope: "global",
      }),
      makeSpec(),
    );
    expect(result.kind).toBe("version-relevant");
    if (result.kind === "version-relevant") {
      expect(result.diff?.addedFields).toEqual(["TodoState.name"]);
    }
  });

  it("treats a cosmetic state schema edit as safe", () => {
    const result = classifyDocumentModelAction(
      setStateSchema({
        schema: '"""doc"""\ntype TodoState { title: String }',
        scope: "global",
      }),
      makeSpec(),
    );
    expect(result.kind).toBe("safe");
  });

  it("treats initializing a blank schema as safe", () => {
    const result = classifyDocumentModelAction(
      setStateSchema({
        schema: "type TodoLocalState { x: Int }",
        scope: "local",
      }),
      makeSpec(),
    );
    expect(result.kind).toBe("safe");
  });

  it("flags an initial state change", () => {
    const result = classifyDocumentModelAction(
      setInitialState({ initialValue: '{ "title": "new" }', scope: "global" }),
      makeSpec(),
    );
    expect(result.kind).toBe("version-relevant");
  });

  it("treats a whitespace-only initial state edit as safe", () => {
    const result = classifyDocumentModelAction(
      setInitialState({ initialValue: '{"title":""}', scope: "global" }),
      makeSpec(),
    );
    expect(result.kind).toBe("safe");
  });

  it("flags deleting a pre-existing operation", () => {
    const result = classifyDocumentModelAction(
      deleteOperation({ id: "op-1" }),
      makeSpec(),
    );
    expect(result.kind).toBe("version-relevant");
  });

  it("treats deleting an operation added since the last release as safe", () => {
    const previousSpec = makeSpec({ modules: [] });
    const result = classifyDocumentModelAction(
      deleteOperation({ id: "op-1" }),
      makeSpec({ version: 2 }),
      previousSpec,
    );
    expect(result.kind).toBe("safe");
  });

  it("flags renaming a pre-existing operation", () => {
    const result = classifyDocumentModelAction(
      setOperationName({ id: "op-1", name: "SET_HEADING" }),
      makeSpec(),
    );
    expect(result.kind).toBe("version-relevant");
  });

  it("treats initializing an operation schema as safe", () => {
    const spec = makeSpec({
      modules: [
        {
          id: "mod-1",
          name: "general",
          description: null,
          operations: [makeOperation({ schema: null })],
        },
      ],
    });
    const result = classifyDocumentModelAction(
      setOperationSchema({
        id: "op-1",
        schema: "input SetTitleInput { title: String! }",
      }),
      spec,
    );
    expect(result.kind).toBe("safe");
  });

  it("flags an operation input shape change on a pre-existing operation", () => {
    const result = classifyDocumentModelAction(
      setOperationSchema({
        id: "op-1",
        schema: "input SetTitleInput { title: String! priority: Int }",
      }),
      makeSpec(),
    );
    expect(result.kind).toBe("version-relevant");
  });

  it("flags clearing an operation schema as version-relevant", () => {
    const result = classifyDocumentModelAction(
      setOperationSchema({
        id: "op-1",
        schema: "",
      }),
      makeSpec(),
    );
    expect(result.kind).toBe("version-relevant");
  });

  it("flags deleting a module with pre-existing operations", () => {
    const result = classifyDocumentModelAction(
      deleteModule({ id: "mod-1" }),
      makeSpec(),
    );
    expect(result.kind).toBe("version-relevant");
  });

  it("treats deleting an empty module as safe", () => {
    const spec = makeSpec({
      modules: [
        { id: "mod-2", name: "empty", description: null, operations: [] },
      ],
    });
    const result = classifyDocumentModelAction(
      deleteModule({ id: "mod-2" }),
      spec,
    );
    expect(result.kind).toBe("safe");
  });

  it("treats metadata edits as safe", () => {
    const result = classifyDocumentModelAction(
      setModelDescription({ description: "new description" }),
      makeSpec(),
    );
    expect(result.kind).toBe("safe");
  });
});

describe("decideDispatch", () => {
  it("dispatches when a session choice exists", () => {
    const decision = decideDispatch(
      [deleteOperation({ id: "op-1" })],
      makeSpec(),
      undefined,
      true,
    );
    expect(decision.kind).toBe("dispatch");
  });

  it("prompts on the first version-relevant action in a batch", () => {
    const decision = decideDispatch(
      [
        setModelDescription({ description: "x" }),
        deleteOperation({ id: "op-1" }),
      ],
      makeSpec(),
      undefined,
      false,
    );
    expect(decision.kind).toBe("prompt");
  });

  it("dispatches when all actions are safe", () => {
    const decision = decideDispatch(
      [setModelDescription({ description: "x" })],
      makeSpec(),
      undefined,
      false,
    );
    expect(decision.kind).toBe("dispatch");
  });
});
