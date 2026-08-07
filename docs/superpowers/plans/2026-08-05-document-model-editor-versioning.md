# Document Model Editor Versioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface document model versioning in the Vetra document model editor: show the current spec version, provide a "Release new version" action, view frozen old versions read-only, and interrupt breaking edits with an advisory dialog that offers to release a new version first.

**Architecture:** All changes live in `packages/powerhouse-vetra-packages/editors/document-model-editor/`. A pure classifier (`utils/change-classification.ts`) decides whether a dispatched `DocumentModelAction` is version-relevant (state-shape change, deletes, renames, operation-input changes on pre-existing operations) or safe. A thin hook (`hooks/useVersionAdvisory.ts`) intercepts dispatches, holds the pending action while an advisory modal asks the user "is this version already in use?", and remembers the answer per document+version for the browser session. New UI components render a version badge, a read-only version switcher, a release button with confirmation modal, and the advisory modal. `editor.tsx` is fixed to edit the **latest** spec (it currently reads `specifications[0]` while reducers write to the last) and wires everything together.

**Tech Stack:** React 19, TypeScript ESM (`.js` import suffixes), `graphql` (`parse`/`print`/`Kind` — already a peer dep of this package), design-system `Modal`/`ModalButton`, vitest.

**Spec:** `docs/superpowers/specs/2026-08-05-document-model-editor-versioning-design.md`

## Global Constraints

- Branch: `fix-connect-document-upgrades`. Commit after each task with conventional-commit messages ending in `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- pnpm only. Repo-root commands unless stated. Package dir: `packages/powerhouse-vetra-packages` (name `@powerhousedao/powerhouse-vetra-packages`).
- ESM imports need explicit `.js` suffixes for relative paths.
- No `any`. No new inline comments except constraints the code can't express (JSDoc on exported declarations is fine).
- New tests use `import { describe, expect, it } from "vitest"` (matches `document-models/document-model/test/*.test.ts` in this package — NOT the `node:test` style of `utils/helpers.test.ts`, which is a one-off).
- JSX copy with apostrophes must use `&apos;` or JS string expressions (`react/no-unescaped-entities`).
- Session memory for advisory choices is **in-memory** (module-level `Set`), never localStorage.
- Typecheck: `pnpm tsc` from the package dir. Lint: `pnpm exec eslint packages/powerhouse-vetra-packages/editors/document-model-editor --fix` from repo root (root config catches rules that package-local runs miss).
- Tests: `pnpm vitest --run editors/document-model-editor` from the package dir.

---

### Task 1: Foundation fix — editor edits the latest spec

**Files:**
- Modify: `packages/powerhouse-vetra-packages/editors/document-model-editor/editor.tsx:58-67`

**Interfaces:**
- Produces: `editor.tsx` locals `specifications: DocumentSpecification[]`, `latestSpec`, `previousSpec` that Task 7 builds on.

**Context:** `editor.tsx` destructures `document.state.global.specifications[0]`, but every reducer in `packages/shared/document-model/reducers.ts` targets `specifications[specifications.length - 1]`. With one spec they coincide; after a `RELEASE_NEW_VERSION` the editor would show v1 while edits land in v2.

- [ ] **Step 1: Replace the spec selection**

Replace lines 58–67 of `editor.tsx`:

```tsx
  const {
    state: {
      global: {
        schema: globalStateSchema,
        initialValue: globalStateInitialValue,
      },
      local: { schema: localStateSchema, initialValue: localStateInitialValue },
    },
    modules,
  } = document.state.global.specifications[0];
```

with:

```tsx
  const specifications = document.state.global.specifications;
  const latestSpec = specifications[specifications.length - 1];
  const {
    state: {
      global: {
        schema: globalStateSchema,
        initialValue: globalStateInitialValue,
      },
      local: { schema: localStateSchema, initialValue: localStateInitialValue },
    },
    modules,
  } = latestSpec;
```

- [ ] **Step 2: Typecheck and lint**

Run from `packages/powerhouse-vetra-packages`: `pnpm tsc`
Run from repo root: `pnpm exec eslint packages/powerhouse-vetra-packages/editors/document-model-editor --fix`
Expected: both clean.

- [ ] **Step 3: Commit**

```bash
git add packages/powerhouse-vetra-packages/editors/document-model-editor/editor.tsx
git commit -m "fix(document-model-editor): edit the latest specification, not the first

Reducers write to specifications[length - 1]; the editor rendered
specifications[0], so after a RELEASE_NEW_VERSION the editor would show
the frozen spec while edits landed in the new one.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: SDL shape diff (`diffSdlShapes`)

**Files:**
- Create: `packages/powerhouse-vetra-packages/editors/document-model-editor/utils/change-classification.ts`
- Create: `packages/powerhouse-vetra-packages/editors/document-model-editor/utils/change-classification.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type StateShapeDiff = {
    addedFields: string[];    // "TypeName.fieldName"
    removedFields: string[];  // "TypeName.fieldName"
    changedFields: string[];  // "TypeName.fieldName: OldType → NewType"
  };
  export function diffSdlShapes(oldSdl: string, newSdl: string): StateShapeDiff;
  export function hasShapeChange(diff: StateShapeDiff): boolean;
  ```
- Consumes: nothing from other tasks. Uses `graphql` package (`parse`, `print`, `Kind`).

**Behavior contract:**
- Compares object types, input types, and enums field-by-field. Field key format `TypeName.fieldName`; enum values are `EnumName.VALUE`.
- Added field → `addedFields`; removed field → `removedFields`; same field with different printed type (including nullability `String` vs `String!`) → `changedFields`. A rename naturally appears as one removed + one added entry.
- **Type-rename tolerance:** a type removed and a type added with an identical field signature (field names + printed types, with self-references normalized) is a rename of the type itself, not a shape change — both are excluded, and references to the old type name inside other fields' printed types are rewritten to the new name before comparing. This keeps "rename the model" (which renames the root `XState` type via `renameSchemaType`) from tripping the advisory.
- Reordered fields, description/doc-comment/whitespace edits → empty diff.
- Unparseable SDL (either side) → empty diff (the schema editors surface syntax errors through their own linting; a transient parse error must not block dispatch).

- [ ] **Step 1: Write the failing tests**

Create `utils/change-classification.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

From `packages/powerhouse-vetra-packages`: `pnpm vitest --run editors/document-model-editor/utils/change-classification.test.ts`
Expected: FAIL — module `./change-classification.js` not found.

- [ ] **Step 3: Implement `diffSdlShapes`**

Create `utils/change-classification.ts`:

```ts
import type {
  DocumentNode,
  EnumTypeDefinitionNode,
  InputObjectTypeDefinitionNode,
  ObjectTypeDefinitionNode,
} from "graphql";
import { Kind, parse, print } from "graphql";

export type StateShapeDiff = {
  addedFields: string[];
  removedFields: string[];
  changedFields: string[];
};

type FieldMap = Map<string, string>;
type TypeFields = Map<string, Map<string, string>>;

type ShapeTypeNode =
  | ObjectTypeDefinitionNode
  | InputObjectTypeDefinitionNode
  | EnumTypeDefinitionNode;

function isShapeTypeNode(node: { kind: string }): node is ShapeTypeNode {
  return (
    node.kind === Kind.OBJECT_TYPE_DEFINITION ||
    node.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
    node.kind === Kind.ENUM_TYPE_DEFINITION
  );
}

function collectTypeFields(doc: DocumentNode): TypeFields {
  const types: TypeFields = new Map();
  for (const definition of doc.definitions) {
    if (!isShapeTypeNode(definition)) continue;
    const fields = new Map<string, string>();
    if (definition.kind === Kind.ENUM_TYPE_DEFINITION) {
      for (const value of definition.values ?? []) {
        fields.set(value.name.value, "value");
      }
    } else {
      for (const field of definition.fields ?? []) {
        fields.set(field.name.value, print(field.type));
      }
    }
    types.set(definition.name.value, fields);
  }
  return types;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceTypeName(
  printedType: string,
  oldName: string,
  newName: string,
): string {
  return printedType.replace(
    new RegExp(`\\b${escapeRegExp(oldName)}\\b`, "g"),
    newName,
  );
}

function typeSignature(name: string, fields: Map<string, string>): string {
  return [...fields.entries()]
    .map(([field, type]) => `${field}:${replaceTypeName(type, name, "__SELF__")}`)
    .sort()
    .join("|");
}

function detectTypeRenames(
  oldTypes: TypeFields,
  newTypes: TypeFields,
): Map<string, string> {
  const renames = new Map<string, string>();
  const removed = [...oldTypes.keys()].filter((name) => !newTypes.has(name));
  const added = new Set(
    [...newTypes.keys()].filter((name) => !oldTypes.has(name)),
  );
  for (const oldName of removed) {
    const oldSignature = typeSignature(oldName, oldTypes.get(oldName)!);
    for (const newName of added) {
      if (typeSignature(newName, newTypes.get(newName)!) === oldSignature) {
        renames.set(oldName, newName);
        added.delete(newName);
        break;
      }
    }
  }
  return renames;
}

function flattenFields(types: TypeFields, renames: Map<string, string>): FieldMap {
  const fields: FieldMap = new Map();
  for (const [typeName, typeFields] of types) {
    const resolvedTypeName = renames.get(typeName) ?? typeName;
    for (const [fieldName, printedType] of typeFields) {
      let resolvedType = printedType;
      for (const [oldName, newName] of renames) {
        resolvedType = replaceTypeName(resolvedType, oldName, newName);
      }
      fields.set(`${resolvedTypeName}.${fieldName}`, resolvedType);
    }
  }
  return fields;
}

export function hasShapeChange(diff: StateShapeDiff): boolean {
  return (
    diff.addedFields.length > 0 ||
    diff.removedFields.length > 0 ||
    diff.changedFields.length > 0
  );
}

export function diffSdlShapes(oldSdl: string, newSdl: string): StateShapeDiff {
  const empty: StateShapeDiff = {
    addedFields: [],
    removedFields: [],
    changedFields: [],
  };
  let oldDoc: DocumentNode;
  let newDoc: DocumentNode;
  try {
    oldDoc = parse(oldSdl);
    newDoc = parse(newSdl);
  } catch {
    return empty;
  }
  const oldTypes = collectTypeFields(oldDoc);
  const newTypes = collectTypeFields(newDoc);
  const renames = detectTypeRenames(oldTypes, newTypes);
  const oldFields = flattenFields(oldTypes, renames);
  const newFields = flattenFields(newTypes, new Map());
  const diff: StateShapeDiff = {
    addedFields: [],
    removedFields: [],
    changedFields: [],
  };
  for (const [key, newType] of newFields) {
    const oldType = oldFields.get(key);
    if (oldType === undefined) {
      diff.addedFields.push(key);
    } else if (oldType !== newType) {
      diff.changedFields.push(`${key}: ${oldType} → ${newType}`);
    }
  }
  for (const key of oldFields.keys()) {
    if (!newFields.has(key)) {
      diff.removedFields.push(key);
    }
  }
  return diff;
}
```

- [ ] **Step 4: Run tests to verify they pass**

From `packages/powerhouse-vetra-packages`: `pnpm vitest --run editors/document-model-editor/utils/change-classification.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/powerhouse-vetra-packages/editors/document-model-editor/utils/change-classification.ts packages/powerhouse-vetra-packages/editors/document-model-editor/utils/change-classification.test.ts
git commit -m "feat(document-model-editor): SDL state-shape diff for version guidance

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Action classifier (`classifyDocumentModelAction` + `decideDispatch`)

**Files:**
- Modify: `packages/powerhouse-vetra-packages/editors/document-model-editor/utils/change-classification.ts` (append)
- Modify: `packages/powerhouse-vetra-packages/editors/document-model-editor/utils/change-classification.test.ts` (append)

**Interfaces:**
- Consumes: `diffSdlShapes`, `hasShapeChange` (Task 2); `compareStringsWithoutWhitespace` from `./helpers.js`; types `DocumentModelAction`, `DocumentSpecification`, `OperationSpecification` from `@powerhousedao/shared/document-model`.
- Produces:
  ```ts
  export type ActionClassification =
    | { kind: "safe" }
    | { kind: "version-relevant"; reason: string; diff?: StateShapeDiff };
  export function classifyDocumentModelAction(
    action: DocumentModelAction,
    latestSpec: DocumentSpecification,
    previousSpec?: DocumentSpecification,
  ): ActionClassification;
  export type DispatchDecision =
    | { kind: "dispatch" }
    | { kind: "prompt"; reason: string; diff?: StateShapeDiff };
  export function decideDispatch(
    actions: DocumentModelAction[],
    latestSpec: DocumentSpecification,
    previousSpec: DocumentSpecification | undefined,
    hasSessionChoice: boolean,
  ): DispatchDecision;
  ```

**Classification rules (from the spec, plus initialization carve-outs so brand-new models never prompt):**

| Action | Rule |
| --- | --- |
| `SET_STATE_SCHEMA` | Safe if the current schema for that scope is blank (initializing). Otherwise version-relevant iff `diffSdlShapes` reports a shape change. |
| `SET_INITIAL_STATE` | Safe if current initialValue is blank or `{}`; safe if whitespace-equal to the new value; otherwise version-relevant (replay baseline). |
| `DELETE_OPERATION`, `SET_OPERATION_NAME`, `SET_OPERATION_SCHEMA` | Safe if the operation was added since the last release (a `previousSpec` exists and doesn't contain the operation id). `SET_OPERATION_SCHEMA` is also safe when the operation's current schema is blank (initialization — `addOperationAndInitialSchema` sets it right after `ADD_OPERATION`) or when the SDL shape is unchanged. `SET_OPERATION_NAME` is also safe when the operation's current name is blank. Otherwise version-relevant. |
| `DELETE_MODULE` | Safe if the module (in `latestSpec`) has no operations, or every operation in it was added since the last release. Otherwise version-relevant. |
| Everything else (`SET_MODEL_NAME`, `SET_MODEL_ID`, `SET_MODEL_EXTENSION`, `SET_MODEL_DESCRIPTION`, `SET_AUTHOR_*`, `ADD_MODULE`, `SET_MODULE_NAME`, `ADD_OPERATION`, `SET_OPERATION_DESCRIPTION`, operation errors/examples, …) | Safe. |

- [ ] **Step 1: Write the failing tests**

Append to `utils/change-classification.test.ts`:

```ts
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
} from "./change-classification.js";

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
      setStateSchema({ schema: "type TodoLocalState { x: Int }", scope: "local" }),
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
```

- [ ] **Step 2: Run tests to verify they fail**

`pnpm vitest --run editors/document-model-editor/utils/change-classification.test.ts`
Expected: FAIL — `classifyDocumentModelAction` not exported.

- [ ] **Step 3: Implement the classifier**

Append to `utils/change-classification.ts` (add the new imports to the top of the file):

```ts
import type {
  DocumentModelAction,
  DocumentSpecification,
  ModuleSpecification,
  OperationSpecification,
} from "@powerhousedao/shared/document-model";
import { compareStringsWithoutWhitespace } from "./helpers.js";

export type ActionClassification =
  | { kind: "safe" }
  | { kind: "version-relevant"; reason: string; diff?: StateShapeDiff };

const SAFE: ActionClassification = { kind: "safe" };

function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim() || value.trim() === "{}";
}

function findOperation(
  spec: DocumentSpecification,
  operationId: string,
): OperationSpecification | undefined {
  for (const module of spec.modules) {
    const operation = module.operations.find((op) => op.id === operationId);
    if (operation) return operation;
  }
  return undefined;
}

function addedSinceLastRelease(
  operationId: string,
  previousSpec: DocumentSpecification | undefined,
): boolean {
  return previousSpec !== undefined && !findOperation(previousSpec, operationId);
}

function classifySetStateSchema(
  input: { schema: string; scope: string },
  latestSpec: DocumentSpecification,
): ActionClassification {
  const currentSchema =
    input.scope === "local"
      ? latestSpec.state.local.schema
      : latestSpec.state.global.schema;
  if (isBlank(currentSchema)) return SAFE;
  const diff = diffSdlShapes(currentSchema, input.schema);
  if (!hasShapeChange(diff)) return SAFE;
  return {
    kind: "version-relevant",
    reason: `This change alters the ${input.scope} state schema of version ${latestSpec.version}.`,
    diff,
  };
}

function classifySetInitialState(
  input: { initialValue: string; scope: string },
  latestSpec: DocumentSpecification,
): ActionClassification {
  const currentValue =
    input.scope === "local"
      ? latestSpec.state.local.initialValue
      : latestSpec.state.global.initialValue;
  if (isBlank(currentValue)) return SAFE;
  if (compareStringsWithoutWhitespace(currentValue, input.initialValue)) {
    return SAFE;
  }
  return {
    kind: "version-relevant",
    reason: `This change alters the initial ${input.scope} state of version ${latestSpec.version}, which is the replay baseline for existing documents.`,
  };
}

function classifyOperationChange(
  action: DocumentModelAction,
  operationId: string,
  latestSpec: DocumentSpecification,
  previousSpec: DocumentSpecification | undefined,
): ActionClassification {
  if (addedSinceLastRelease(operationId, previousSpec)) return SAFE;
  const operation = findOperation(latestSpec, operationId);
  if (!operation) return SAFE;
  const operationLabel = operation.name || "an operation";
  switch (action.type) {
    case "DELETE_OPERATION":
      return {
        kind: "version-relevant",
        reason: `Deleting the "${operationLabel}" operation removes it from version ${latestSpec.version}.`,
      };
    case "SET_OPERATION_NAME": {
      if (isBlank(operation.name)) return SAFE;
      return {
        kind: "version-relevant",
        reason: `Renaming the "${operationLabel}" operation changes how version ${latestSpec.version} documents replay.`,
      };
    }
    case "SET_OPERATION_SCHEMA": {
      if (isBlank(operation.schema)) return SAFE;
      const diff = diffSdlShapes(operation.schema ?? "", action.input.schema);
      if (!hasShapeChange(diff)) return SAFE;
      return {
        kind: "version-relevant",
        reason: `This change alters the input of the "${operationLabel}" operation in version ${latestSpec.version}.`,
        diff,
      };
    }
    default:
      return SAFE;
  }
}

function classifyDeleteModule(
  moduleId: string,
  latestSpec: DocumentSpecification,
  previousSpec: DocumentSpecification | undefined,
): ActionClassification {
  const module: ModuleSpecification | undefined = latestSpec.modules.find(
    (candidate) => candidate.id === moduleId,
  );
  if (!module || module.operations.length === 0) return SAFE;
  const allAddedSinceRelease = module.operations.every((operation) =>
    addedSinceLastRelease(operation.id, previousSpec),
  );
  if (allAddedSinceRelease) return SAFE;
  return {
    kind: "version-relevant",
    reason: `Deleting the "${module.name}" module removes its operations from version ${latestSpec.version}.`,
  };
}

/**
 * Classifies a document-model action as version-relevant (would break
 * documents created with the current version) or safe. `previousSpec` is the
 * last released specification, used to exempt operations added since the
 * release.
 */
export function classifyDocumentModelAction(
  action: DocumentModelAction,
  latestSpec: DocumentSpecification,
  previousSpec?: DocumentSpecification,
): ActionClassification {
  switch (action.type) {
    case "SET_STATE_SCHEMA":
      return classifySetStateSchema(action.input, latestSpec);
    case "SET_INITIAL_STATE":
      return classifySetInitialState(action.input, latestSpec);
    case "DELETE_OPERATION":
    case "SET_OPERATION_NAME":
    case "SET_OPERATION_SCHEMA":
      return classifyOperationChange(
        action,
        action.input.id,
        latestSpec,
        previousSpec,
      );
    case "DELETE_MODULE":
      return classifyDeleteModule(action.input.id, latestSpec, previousSpec);
    default:
      return SAFE;
  }
}

export type DispatchDecision =
  | { kind: "dispatch" }
  | { kind: "prompt"; reason: string; diff?: StateShapeDiff };

/**
 * Pure decision core of the version advisory: given the actions about to be
 * dispatched, decide whether to dispatch immediately or prompt the user.
 */
export function decideDispatch(
  actions: DocumentModelAction[],
  latestSpec: DocumentSpecification,
  previousSpec: DocumentSpecification | undefined,
  hasSessionChoice: boolean,
): DispatchDecision {
  if (hasSessionChoice) return { kind: "dispatch" };
  for (const action of actions) {
    const classification = classifyDocumentModelAction(
      action,
      latestSpec,
      previousSpec,
    );
    if (classification.kind === "version-relevant") {
      return {
        kind: "prompt",
        reason: classification.reason,
        diff: classification.diff,
      };
    }
  }
  return { kind: "dispatch" };
}
```

Note: if `tsc` reports that `action.input` is not narrowed by `action.type` in the `classifyOperationChange` call sites, narrow with the specific action types from `@powerhousedao/shared/document-model` (e.g. handle each case separately passing `action.input.id`); the union `DocumentModelAction` discriminates on `type`, so the switch should narrow correctly.

- [ ] **Step 4: Run tests to verify they pass**

`pnpm vitest --run editors/document-model-editor/utils/change-classification.test.ts`
Expected: PASS (all diff + classifier + decideDispatch tests).

- [ ] **Step 5: Typecheck, lint, commit**

From `packages/powerhouse-vetra-packages`: `pnpm tsc`
From repo root: `pnpm exec eslint packages/powerhouse-vetra-packages/editors/document-model-editor --fix`

```bash
git add packages/powerhouse-vetra-packages/editors/document-model-editor/utils/change-classification.ts packages/powerhouse-vetra-packages/editors/document-model-editor/utils/change-classification.test.ts
git commit -m "feat(document-model-editor): classify version-relevant model changes

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: Advisory hook (`useVersionAdvisory`)

**Files:**
- Create: `packages/powerhouse-vetra-packages/editors/document-model-editor/hooks/useVersionAdvisory.ts`

**Interfaces:**
- Consumes: `decideDispatch`, `StateShapeDiff` (Task 3); `releaseNewVersion` action creator and `DocumentSpecification` type from `@powerhousedao/shared/document-model`; `useSelectedDocumentModelDocument` from `./useDocumentModelDocument.js` (type only).
- Produces:
  ```ts
  export type VersionAdvisoryPrompt = {
    version: number;
    reason: string;
    diff?: StateShapeDiff;
  };
  export function useVersionAdvisory(args: {
    documentId: string;
    latestSpec: DocumentSpecification;
    previousSpec?: DocumentSpecification;
    dispatch: DocumentModelDispatch;
    onReleaseError?: (message: string) => void;
  }): {
    guardedDispatch: DocumentModelDispatch;
    prompt: VersionAdvisoryPrompt | undefined;
    releaseFirst: () => void;
    keepEditing: () => void;
    cancelAdvisory: () => void;
    markVersionInDevelopment: (version: number) => void;
  };
  ```
  where `export type DocumentModelDispatch = NonNullable<ReturnType<typeof useSelectedDocumentModelDocument>[1]>;`

**Behavior:** `guardedDispatch` stores the full dispatch argument tuple (`Parameters<DocumentModelDispatch>`) when prompting, so error/success callbacks survive the detour. Session choices live in a module-level `Set<string>` keyed `${documentId}:${version}` — in-memory only, so a returning publisher is asked again next session (spec decision). The decision core is `decideDispatch` (already unit-tested in Task 3); this hook is thin React glue, exercised end-to-end in Task 8.

- [ ] **Step 1: Implement the hook**

Create `hooks/useVersionAdvisory.ts`:

```ts
import type { DocumentSpecification } from "@powerhousedao/shared/document-model";
import { releaseNewVersion } from "@powerhousedao/shared/document-model";
import { useRef, useState } from "react";
import type { StateShapeDiff } from "../utils/change-classification.js";
import { decideDispatch } from "../utils/change-classification.js";
import { useSelectedDocumentModelDocument } from "./useDocumentModelDocument.js";

export type DocumentModelDispatch = NonNullable<
  ReturnType<typeof useSelectedDocumentModelDocument>[1]
>;

export type VersionAdvisoryPrompt = {
  version: number;
  reason: string;
  diff?: StateShapeDiff;
};

/**
 * Versions the user has confirmed as "still in development" (or that were
 * just created via an explicit release) for this browser session. Keyed by
 * `${documentId}:${version}`. Deliberately in-memory: a publisher returning
 * in a later session is asked again, which is when the reminder matters.
 */
const sessionVersionChoices = new Set<string>();

export function useVersionAdvisory(args: {
  documentId: string;
  latestSpec: DocumentSpecification;
  previousSpec?: DocumentSpecification;
  dispatch: DocumentModelDispatch;
  onReleaseError?: (message: string) => void;
}) {
  const { documentId, latestSpec, previousSpec, dispatch, onReleaseError } =
    args;
  const [prompt, setPrompt] = useState<VersionAdvisoryPrompt | undefined>(
    undefined,
  );
  const pendingRef = useRef<Parameters<DocumentModelDispatch> | undefined>(
    undefined,
  );
  const choiceKey = `${documentId}:${latestSpec.version}`;

  const guardedDispatch: DocumentModelDispatch = (...dispatchArgs) => {
    const [action] = dispatchArgs;
    const actions = Array.isArray(action) ? action : [action];
    const decision = decideDispatch(
      actions,
      latestSpec,
      previousSpec,
      sessionVersionChoices.has(choiceKey),
    );
    if (decision.kind === "dispatch") {
      dispatch(...dispatchArgs);
      return;
    }
    pendingRef.current = dispatchArgs;
    setPrompt({
      version: latestSpec.version,
      reason: decision.reason,
      diff: decision.diff,
    });
  };

  const flushPending = () => {
    const pending = pendingRef.current;
    pendingRef.current = undefined;
    if (pending) {
      dispatch(...pending);
    }
  };

  const releaseFirst = () => {
    setPrompt(undefined);
    if (!pendingRef.current) return;
    dispatch(
      releaseNewVersion(),
      (errors) => {
        if (errors.length > 0) {
          pendingRef.current = undefined;
          onReleaseError?.(errors[0].message);
        }
      },
      () => {
        sessionVersionChoices.add(`${documentId}:${latestSpec.version + 1}`);
        flushPending();
      },
    );
  };

  const keepEditing = () => {
    sessionVersionChoices.add(choiceKey);
    setPrompt(undefined);
    flushPending();
  };

  const cancelAdvisory = () => {
    pendingRef.current = undefined;
    setPrompt(undefined);
  };

  const markVersionInDevelopment = (version: number) => {
    sessionVersionChoices.add(`${documentId}:${version}`);
  };

  return {
    guardedDispatch,
    prompt,
    releaseFirst,
    keepEditing,
    cancelAdvisory,
    markVersionInDevelopment,
  };
}
```

If `tsc` rejects the `(errors) => …` callback types, mirror the exact callback signature used by `editor.tsx` for `dispatch(addOperation(...), (errors) => …, () => …)` — the tuple-spread `Parameters<DocumentModelDispatch>` approach keeps everything else signature-agnostic.

- [ ] **Step 2: Export from hooks index**

Check `hooks/index.ts`; if it re-exports hooks, add:

```ts
export * from "./useVersionAdvisory.js";
```

- [ ] **Step 3: Typecheck and lint**

From `packages/powerhouse-vetra-packages`: `pnpm tsc`
From repo root: `pnpm exec eslint packages/powerhouse-vetra-packages/editors/document-model-editor --fix`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/powerhouse-vetra-packages/editors/document-model-editor/hooks/
git commit -m "feat(document-model-editor): version advisory dispatch guard hook

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Version controls UI (badge, switcher, release button, release modal, frozen banner)

**Files:**
- Create: `packages/powerhouse-vetra-packages/editors/document-model-editor/components/version-controls.tsx`

**Interfaces:**
- Consumes: `Button` from `./button.js`; `Modal` from `@powerhousedao/design-system`; `ModalButton` from `@powerhousedao/design-system/connect`; `DocumentSpecification` from `@powerhousedao/shared/document-model`.
- Produces:
  ```tsx
  export function VersionControls(props: {
    specifications: DocumentSpecification[];
    viewedVersion: number;
    onViewVersion: (version: number | "latest") => void;
    onReleaseNewVersion: () => void;
  }): JSX.Element;
  export function FrozenVersionBanner(props: {
    viewedVersion: number;
    latestVersion: number;
  }): JSX.Element;
  ```

- [ ] **Step 1: Implement the components**

Create `components/version-controls.tsx`:

```tsx
import { Modal } from "@powerhousedao/design-system";
import { ModalButton } from "@powerhousedao/design-system/connect";
import type { DocumentSpecification } from "@powerhousedao/shared/document-model";
import { useState } from "react";
import { Button } from "./button.js";

const compactButtonStyle =
  "min-h-0 min-w-0 flex-none rounded-lg px-6 py-1.5 text-sm whitespace-nowrap";

type VersionControlsProps = {
  specifications: DocumentSpecification[];
  viewedVersion: number;
  onViewVersion: (version: number | "latest") => void;
  onReleaseNewVersion: () => void;
};

export function VersionControls(props: VersionControlsProps) {
  const { specifications, viewedVersion, onViewVersion, onReleaseNewVersion } =
    props;
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const latestVersion = specifications[specifications.length - 1].version;
  const nextVersion = latestVersion + 1;

  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-2">
        <span
          className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
          data-testid="model-version-badge"
        >
          Version {viewedVersion}
        </span>
        {specifications.length >= 2 && (
          <select
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            data-testid="model-version-switcher"
            onChange={(event) => {
              const version = Number(event.target.value);
              onViewVersion(version === latestVersion ? "latest" : version);
            }}
            value={viewedVersion}
          >
            {specifications.map((spec) => (
              <option key={spec.version} value={spec.version}>
                {spec.version === latestVersion
                  ? `v${spec.version} (latest)`
                  : `v${spec.version} (frozen)`}
              </option>
            ))}
          </select>
        )}
      </div>
      <Button
        className="h-8"
        data-testid="release-new-version-button"
        onClick={() => setShowReleaseModal(true)}
        type="button"
      >
        Release new version
      </Button>
      <Modal
        open={showReleaseModal}
        onOpenChange={(status: boolean) => {
          if (!status) setShowReleaseModal(false);
        }}
      >
        <div className="w-[440px] p-6">
          <div className="pb-2 text-2xl font-bold text-foreground">
            Release version {nextVersion}
          </div>
          <div className="my-4 rounded-md bg-background p-4 text-left text-sm text-foreground">
            <p>
              Version {latestVersion} will be frozen as-is. Version{" "}
              {nextVersion} starts as an identical copy, and all further edits
              apply to version {nextVersion}.
            </p>
            <p className="mt-3">
              Existing version {latestVersion} documents will be upgradeable
              once you define the migration.
            </p>
          </div>
          <div className="mt-4 flex justify-between gap-3">
            <ModalButton
              className={compactButtonStyle}
              onClick={() => setShowReleaseModal(false)}
              variant="cancel"
            >
              Cancel
            </ModalButton>
            <ModalButton
              className={compactButtonStyle}
              data-testid="confirm-release-button"
              onClick={() => {
                setShowReleaseModal(false);
                onReleaseNewVersion();
              }}
              variant="confirm"
            >
              Release version {nextVersion}
            </ModalButton>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export function FrozenVersionBanner(props: {
  viewedVersion: number;
  latestVersion: number;
}) {
  const { viewedVersion, latestVersion } = props;
  return (
    <div
      className="mb-4 rounded-md border border-border bg-muted p-3 text-sm text-foreground"
      data-testid="frozen-version-banner"
    >
      Version {viewedVersion} is frozen. You&apos;re viewing it read-only.
      Edits go to version {latestVersion}.
    </div>
  );
}
```

If `Button` doesn't accept `data-testid` cleanly (it spreads props, so it should), fall back to a plain `<button>` with the `Button` class string.

- [ ] **Step 2: Typecheck and lint**

From `packages/powerhouse-vetra-packages`: `pnpm tsc`
From repo root: `pnpm exec eslint packages/powerhouse-vetra-packages/editors/document-model-editor --fix`
Expected: clean. (Tailwind class order is auto-fixed by `--fix`.)

- [ ] **Step 3: Commit**

```bash
git add packages/powerhouse-vetra-packages/editors/document-model-editor/components/version-controls.tsx
git commit -m "feat(document-model-editor): version badge, switcher, and release controls

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Advisory modal component

**Files:**
- Create: `packages/powerhouse-vetra-packages/editors/document-model-editor/components/version-advisory-modal.tsx`

**Interfaces:**
- Consumes: `VersionAdvisoryPrompt` from `../hooks/useVersionAdvisory.js` (Task 4); `Modal`/`ModalButton` from design-system.
- Produces:
  ```tsx
  export function VersionAdvisoryModal(props: {
    prompt: VersionAdvisoryPrompt | undefined;
    onReleaseFirst: () => void;
    onKeepEditing: () => void;
    onCancel: () => void;
  }): JSX.Element | null;
  ```

**Behavior:** Renders nothing without a prompt. Field diff badges use the exact style of Connect's `ConfirmDocumentUpgradeModal` so the publisher-side and consumer-side of the upgrade story look like one feature. Dismissing via backdrop/Esc calls `onCancel` (drops the pending edit — the document is unchanged; the schema editor's local text may briefly diverge until the next document sync, which is acceptable).

- [ ] **Step 1: Implement the modal**

Create `components/version-advisory-modal.tsx`:

```tsx
import { Modal } from "@powerhousedao/design-system";
import { ModalButton } from "@powerhousedao/design-system/connect";
import type { VersionAdvisoryPrompt } from "../hooks/useVersionAdvisory.js";

const compactButtonStyle =
  "min-h-0 min-w-0 flex-none rounded-lg px-4 py-1.5 text-sm whitespace-nowrap";

function FieldDiffList(props: { label: string; fields: string[] }) {
  const { label, fields } = props;
  if (fields.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5">{label}</p>
      <div className="flex flex-col items-start gap-1">
        {fields.map((field) => (
          <span
            className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-foreground"
            key={field}
          >
            {field}
          </span>
        ))}
      </div>
    </div>
  );
}

type VersionAdvisoryModalProps = {
  prompt: VersionAdvisoryPrompt | undefined;
  onReleaseFirst: () => void;
  onKeepEditing: () => void;
  onCancel: () => void;
};

export function VersionAdvisoryModal(props: VersionAdvisoryModalProps) {
  const { prompt, onReleaseFirst, onKeepEditing, onCancel } = props;
  if (!prompt) return null;
  const { version, reason, diff } = prompt;
  const nextVersion = version + 1;

  return (
    <Modal
      open
      onOpenChange={(status: boolean) => {
        if (!status) onCancel();
      }}
    >
      <div className="w-[440px] p-6" data-testid="version-advisory-modal">
        <div className="pb-2 text-2xl font-bold text-foreground">
          Is version {version} of this model already in use?
        </div>
        <div className="my-4 rounded-md bg-background p-4 text-left text-sm text-foreground">
          <p>
            {reason} Documents created with version {version} would be
            affected.
          </p>
          {diff && (
            <>
              <FieldDiffList fields={diff.addedFields} label="New fields:" />
              <FieldDiffList
                fields={diff.removedFields}
                label="Removed fields:"
              />
              <FieldDiffList
                fields={diff.changedFields}
                label="Changed fields:"
              />
            </>
          )}
          <p className="mt-3">
            If version {version} is already published, release version{" "}
            {nextVersion} first so existing documents can be upgraded.
          </p>
        </div>
        <div className="mt-4 flex justify-between gap-3">
          <ModalButton
            className={compactButtonStyle}
            data-testid="advisory-keep-editing"
            onClick={onKeepEditing}
            variant="cancel"
          >
            Still in development — keep editing v{version}
          </ModalButton>
          <ModalButton
            className={compactButtonStyle}
            data-testid="advisory-release-first"
            onClick={onReleaseFirst}
            variant="confirm"
          >
            {`It's in use — release v${nextVersion} first`}
          </ModalButton>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck and lint**

From `packages/powerhouse-vetra-packages`: `pnpm tsc`
From repo root: `pnpm exec eslint packages/powerhouse-vetra-packages/editors/document-model-editor --fix`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/powerhouse-vetra-packages/editors/document-model-editor/components/version-advisory-modal.tsx
git commit -m "feat(document-model-editor): version advisory modal with field diff

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Wire everything into `editor.tsx`

**Files:**
- Modify: `packages/powerhouse-vetra-packages/editors/document-model-editor/editor.tsx`

**Interfaces:**
- Consumes: `latestSpec`/`specifications` locals (Task 1), `useVersionAdvisory` (Task 4), `VersionControls`/`FrozenVersionBanner` (Task 5), `VersionAdvisoryModal` (Task 6), `releaseNewVersion` from `@powerhousedao/shared/document-model`.
- Produces: the complete feature. Frozen-version read-only is enforced by wrapping the **versioned content** (state schemas + modules) in a `pointer-events-none` overlay. Model metadata (name, id, description, author) lives outside `specifications` in the data model, so it stays editable regardless of the viewed version — a deliberate refinement of the spec wording.

- [ ] **Step 1: Add version state, advisory hook, and release handler**

In `editor.tsx`:

1. Add imports: `releaseNewVersion` (append to the existing `@powerhousedao/shared/document-model` import list), and:

```tsx
import { FrozenVersionBanner, VersionControls } from "./components/version-controls.js";
import { VersionAdvisoryModal } from "./components/version-advisory-modal.js";
import { useVersionAdvisory } from "./hooks/useVersionAdvisory.js";
```

2. Replace the Task 1 spec-selection block with (keeping the destructure, now from `viewedSpec`):

```tsx
  const specifications = document.state.global.specifications;
  const latestSpec = specifications[specifications.length - 1];
  const previousSpec =
    specifications.length >= 2
      ? specifications[specifications.length - 2]
      : undefined;
  const [viewedVersion, setViewedVersion] = useState<number | "latest">(
    "latest",
  );
  const viewedSpec =
    viewedVersion === "latest"
      ? latestSpec
      : (specifications.find((spec) => spec.version === viewedVersion) ??
        latestSpec);
  const isViewingFrozenVersion = viewedSpec.version !== latestSpec.version;
  const {
    state: {
      global: {
        schema: globalStateSchema,
        initialValue: globalStateInitialValue,
      },
      local: { schema: localStateSchema, initialValue: localStateInitialValue },
    },
    modules,
  } = viewedSpec;
```

(While a frozen version is viewed, handlers compare against the frozen values — harmless because the read-only overlay prevents any edit interaction from reaching them.)

3. After the destructure, add the advisory hook and release handler:

```tsx
  const {
    guardedDispatch,
    prompt,
    releaseFirst,
    keepEditing,
    cancelAdvisory,
    markVersionInDevelopment,
  } = useVersionAdvisory({
    documentId: document.header.id,
    latestSpec,
    previousSpec,
    dispatch,
    onReleaseError: (message) => {
      if (toast) toast(message, { type: "connect-warning" });
    },
  });

  const handleReleaseNewVersion = () => {
    const nextVersion = latestSpec.version + 1;
    dispatch(
      releaseNewVersion(),
      (errors) => {
        if (errors.length > 0 && toast) {
          toast(errors[0].message, { type: "connect-warning" });
        }
      },
      () => {
        markVersionInDevelopment(nextVersion);
        setViewedVersion("latest");
      },
    );
  };
```

- [ ] **Step 2: Route handler dispatches through the guard**

Replace `dispatch(` with `guardedDispatch(` in **every handler function** (`handleSetModelId` through `addOperationAndInitialSchema`) — safe actions pass through instantly, so uniform routing keeps the code simple. Do **NOT** change the two other call sites:
- the initial-name `useEffect` (brand-new documents; blank-schema initialization is safe by construction, and swapping would churn the effect deps),
- `handleReleaseNewVersion` (releases must never be intercepted by the guard).

- [ ] **Step 3: Render the new components**

In the JSX, inside `<div className="mx-auto max-w-6xl px-4 pt-8">`:

1. First child, before `<ModelMetadata …>`:

```tsx
          <VersionControls
            specifications={specifications}
            viewedVersion={viewedSpec.version}
            onViewVersion={setViewedVersion}
            onReleaseNewVersion={handleReleaseNewVersion}
          />
```

2. Wrap the versioned content block (the `<div>` currently containing `<Suspense>…<StateSchemas …>`, `<Divider />`, the `<h3>` and `<Modules …>`) with the frozen banner + overlay:

```tsx
          {isViewingFrozenVersion && (
            <FrozenVersionBanner
              latestVersion={latestSpec.version}
              viewedVersion={viewedSpec.version}
            />
          )}
          <div
            className={
              isViewingFrozenVersion
                ? "pointer-events-none opacity-80 select-none"
                : undefined
            }
          >
            {/* existing StateSchemas / Modules block unchanged */}
          </div>
```

3. After the closing `</SchemaContextProvider>` (still inside `<main>`), render the advisory modal:

```tsx
      <VersionAdvisoryModal
        prompt={prompt}
        onReleaseFirst={releaseFirst}
        onKeepEditing={keepEditing}
        onCancel={cancelAdvisory}
      />
```

- [ ] **Step 4: Typecheck, lint, run package tests**

From `packages/powerhouse-vetra-packages`: `pnpm tsc && pnpm vitest --run editors/document-model-editor`
From repo root: `pnpm exec eslint packages/powerhouse-vetra-packages/editors/document-model-editor --fix`
Expected: all clean/passing.

- [ ] **Step 5: Commit**

```bash
git add packages/powerhouse-vetra-packages/editors/document-model-editor/editor.tsx
git commit -m "feat(document-model-editor): surface versioning with release and advisory flows

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Build, end-to-end probe, final verification

**Files:**
- Modify (if fallout): files from Tasks 1–7 only.
- Create (scratchpad, not committed): `<scratchpad>/version-ui-probe.mjs`

**Interfaces:** Consumes the full feature. Produces a verified build + probe evidence (screenshots + console output).

- [ ] **Step 1: Rebuild the package dist**

From `packages/powerhouse-vetra-packages`: `pnpm build`
Expected: success. (Stale dists have repeatedly broken manual testing on this branch — always rebuild after source changes.)

- [ ] **Step 2: Start Connect dev server and probe**

Start the repo Connect dev server if not already running (from repo root: `pnpm --filter @powerhousedao/connect dev`, serves `http://localhost:3000`). Then write the probe to the scratchpad (Playwright imported from the repo's `.pnpm` store, same technique as prior probes on this branch):

```js
import { chromium } from "/home/p/Powerhouse/powerhouse/node_modules/.pnpm/playwright@1.60.0/node_modules/playwright/index.mjs";

const S = process.env.SCRATCH ?? "/tmp";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

// dismiss cookie/consent overlays
for (let i = 0; i < 3; i++) {
  const overlayBtn = page.locator('[role="dialog"] button:visible').filter({ hasText: /accept|agree|got it|continue|close|ok/i }).first();
  if (await overlayBtn.isVisible().catch(() => false)) { await overlayBtn.click(); await page.waitForTimeout(800); } else break;
}

// create a vetra drive (document-model type is hidden in generic drives)
const createDrive = page.getByText("Create New Drive").first();
if (await createDrive.isVisible().catch(() => false)) {
  await createDrive.click();
  await page.waitForTimeout(1500);
  const vetraApp = page.getByText(/vetra/i).last();
  if (await vetraApp.isVisible().catch(() => false)) await vetraApp.click();
  await page.locator('input[placeholder="Drive name"]').fill("version-probe");
  await page.getByRole("button", { name: /create new drive/i }).first().click();
  await page.waitForTimeout(3000);
}
await page.screenshot({ path: `${S}/vprobe-1-drive.png` });

// create a DocumentModel document named probe-model (adapt selector to the vetra drive UI)
// ... click the document-model create affordance, name it, open it ...
await page.screenshot({ path: `${S}/vprobe-2-editor.png` });

// 1. badge shows Version 1
console.log("badge:", await page.getByTestId("model-version-badge").textContent().catch(() => "MISSING"));

// 2. type a shape-changing schema edit into the global state codemirror
const editor = page.locator(".cm-content").first();
await editor.click();
await page.keyboard.press("End");
await page.keyboard.type("\ntype Extra { x: Int }");
await editor.blur?.();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${S}/vprobe-3-advisory.png` });
console.log("advisory:", await page.getByTestId("version-advisory-modal").isVisible().catch(() => false));

// 3. choose "release first" and verify v2
await page.getByTestId("advisory-release-first").click();
await page.waitForTimeout(2000);
console.log("badge after:", await page.getByTestId("model-version-badge").textContent().catch(() => "MISSING"));
console.log("switcher:", await page.getByTestId("model-version-switcher").isVisible().catch(() => false));
await page.screenshot({ path: `${S}/vprobe-4-v2.png` });
await browser.close();
```

The document-creation selectors in the middle need adapting to the live vetra drive UI — inspect `${S}/vprobe-1-drive.png` and iterate. Verify in order: badge "Version 1" → advisory modal on shape change → "release first" → badge "Version 2" + switcher present → switch to v1 shows the frozen banner. Also verify a **safe** edit (model description) triggers no modal, and the explicit "Release new version" button flow works.

If no dev server can be brought up in this environment, stop and report — the user tests against their own `ph vetra` instance (their Invoice model is the real-world case).

- [ ] **Step 3: Full-package verification**

From `packages/powerhouse-vetra-packages`: `pnpm tsc && pnpm vitest --run editors/document-model-editor && pnpm build`
From repo root: `pnpm exec eslint packages/powerhouse-vetra-packages/editors/document-model-editor`
Expected: all green.

- [ ] **Step 4: Commit any fixups**

```bash
git add packages/powerhouse-vetra-packages/editors/document-model-editor
git commit -m "fix(document-model-editor): probe fixups for versioning UI

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

(Skip if no fixups were needed.)
