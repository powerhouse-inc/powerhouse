# Issue: Primitive Action Inputs in GraphQL Subgraphs

## Problem Summary

When documents are created or mutated through auto-generated GraphQL subgraphs, operations with **primitive inputs** (string, number) cannot be properly handled by GraphQL. This affects base document operations like `SET_NAME`, `REDO`, and `UNDO`.

## Background

### Document Model Architecture

The Powerhouse document system uses an event-sourcing pattern where:

1. **Documents** have a header (id, name, type) and state
2. **Actions** are dispatched to modify documents
3. **Operations** are the persisted records of actions applied
4. Each action has a `type`, `input`, and `scope`

### Base Document Actions

The `document-model` package defines base actions that apply to ALL document types:

| Action       | Input Type                             | Purpose                  |
| ------------ | -------------------------------------- | ------------------------ |
| `SET_NAME`   | `string`                               | Sets the document's name |
| `REDO`       | `number`                               | Redoes N operations      |
| `UNDO`       | `number`                               | Undoes N operations      |
| `PRUNE`      | `{ start?: number, end?: number }`     | Prunes operation history |
| `LOAD_STATE` | `{ state: {...}, operations: number }` | Loads a state snapshot   |

Note: `SET_NAME`, `REDO`, and `UNDO` have **primitive inputs** while `PRUNE` and `LOAD_STATE` have **object inputs**.

### GraphQL Subgraph Generation

The `reactor-api` package auto-generates GraphQL subgraphs for each document model. For each operation defined in a document model, it generates:

1. A GraphQL input type from the operation's schema
2. A mutation that accepts that input type

Example for a document model operation with an object input:

```graphql
input DocumentModel_AddModuleInput {
  id: String!
  name: String!
}

type Mutation {
  DocumentModel_addModule(
    docId: PHID!
    input: DocumentModel_AddModuleInput!
  ): DocumentModel!
}
```

## The Problem

### GraphQL Cannot Handle Primitive Input Types

GraphQL input types MUST be:

- Scalars (String, Int, Boolean, etc.)
- Enums
- Input Object Types

You **cannot** define a GraphQL input type as just a primitive:

```graphql
# THIS IS INVALID - you can't have an input type that's just a string
input SetNameInput = String  # NOT VALID GRAPHQL
```

### Current Schema Definitions

In `document-model/src/core/schemas.ts`:

```typescript
// These are primitives, not objects
export const RedoActionInputSchema = z.number;
export const SetNameActionInputSchema = z.string;
export const UndoActionInputSchema = z.number;
```

In `document-model/src/core/types.ts`:

```typescript
export type SchemaRedoAction = {
  input: Scalars["Int"]["input"]; // number
  // ...
};

export type SchemaSetNameAction = {
  input: Scalars["String"]["input"]; // string
  // ...
};

export type SchemaUndoAction = {
  input: Scalars["Int"]["input"]; // number
  // ...
};
```

### How Subgraph Schema Generation Fails

In `reactor-api/src/utils/create-schema.ts`, the schema generator:

1. Filters operations using `hasValidSchema()`:

```typescript
const hasValidSchema = (schema: string | null | undefined): boolean =>
  !!(schema && /\b(input|type|enum|union|interface)\s+\w+/.test(schema));
```

2. For operations that pass this filter, it generates mutations with typed inputs:

```typescript
`${documentName}_${camelCase(op.name!)}(docId: PHID!, input: ${documentName}_${pascalCase(op.name!)}Input!)`;
```

**The problem**: Operations like `SET_NAME` with primitive schemas don't have `input TypeName { }` definitions, so either:

- They're filtered out entirely (no mutation generated)
- Or if included, the input type reference is invalid

### Real-World Failure Scenario

When a user creates a document through the GraphQL subgraph:

1. User calls `DocumentModel_createDocument(name: "my-doc", parentIdentifier: "...")`
2. The subgraph resolver creates the document
3. Then it tries to set the name using `setName(name)`:

```typescript
// In document-model-subgraph.ts
if (name) {
  const updatedDoc = await this.reactorClient.execute(
    createdDoc.id,
    "main",
    [setName(name)], // Creates action with input: "my-doc" (a string)
  );
}
```

4. The `SET_NAME` action is created with `input: "my-doc"` (primitive string)
5. When this operation syncs to other nodes or is processed, issues arise because the GraphQL schema expects a typed input object

### Root Cause: Action Type Expects JSONObject

The actual root cause is in `packages/reactor-api/src/graphql/reactor/schema.graphql`. The `Action` type defines:

```graphql
type Action {
  id: String!
  type: String!
  timestampUtcMs: String!
  input: JSONObject! # <-- THIS IS THE PROBLEM
  scope: String!
  attachments: [Attachment!]
  context: ActionContext
}
```

The `input` field is typed as `JSONObject!`. The `JSONObject` scalar from `graphql-type-json` **only accepts objects, NOT primitives** (strings, numbers, booleans).

When `setName(name)` creates an action:

```typescript
{
  type: "SET_NAME",
  input: "my-doc",  // This is a STRING, not an object!
  scope: "global",
  // ...
}
```

This action **cannot be serialized** through GraphQL because `"my-doc"` (a string) is not a valid `JSONObject`. This causes sync failures when:

1. Operations are returned in GraphQL responses
2. Actions sync between reactors via GraphQL mutations like `mutateDocument`
3. The `mutateDocument` mutation also expects `actions: [JSONObject!]!`

**The fix requires changing `input: JSONObject!` to `input: JSON!`** where `JSON` is a scalar that accepts any JSON value including primitives.

### Contrast with Connect/Vetra

Connect and Vetra handle document creation differently - they set the name **directly on the document header** before creation:

```typescript
// In reactor-browser/src/actions/document.ts
const newDocument = documentModelModule.utils.createDocument({...});
newDocument.header.name = name;  // Set directly on header
await reactorClient.createDocumentInDrive(driveId, newDocument, parentFolder);
```

This bypasses the `SET_NAME` action entirely for initial document creation.

## Code References

### Action Creators

- `packages/document-model/src/core/actions.ts` - `undo()`, `redo()` action creators
- `packages/document-model/src/document-model/actions.ts` - `setName()` action creator

### Type Definitions

- `packages/document-model/src/core/types.ts` - `SchemaSetNameAction`, `SchemaRedoAction`, `SchemaUndoAction`
- `packages/document-model/src/core/schemas.ts` - Zod schemas for action inputs

### Schema Generation

- `packages/reactor-api/src/utils/create-schema.ts` - `generateDocumentModelSchema()`, `hasValidSchema()`

### Subgraph Implementation

- `packages/reactor-api/src/graphql/document-model-subgraph.ts` - `DocumentModelSubgraph` class, `_createDocument` mutation

### Operation Reducers

- `packages/document-model/src/core/operations.ts` - `setNameOperation()`, `redoOperation()`, `undoOperation()`
- `packages/document-model/src/core/reducer.ts` - Main reducer that handles SET_NAME, REDO, UNDO

## Possible Solutions

### Solution 1: Change Primitive Inputs to Objects

Change the action inputs from primitives to objects:

```typescript
// Before
export type SetNameActionInput = string;
export type RedoActionInput = number;
export type UndoActionInput = number;

// After
export type SetNameActionInput = { name: string };
export type RedoActionInput = { count: number };
export type UndoActionInput = { count: number };
```

**Pros:**

- GraphQL can generate proper input types
- Type-safe and explicit

**Cons:**

- Breaking change for existing operations in the database
- Requires updating all code that creates/handles these actions
- Need to handle migration of existing data

### Solution 2: Use JSON Scalar for Primitive Inputs

Use a `JSON` scalar type (from `graphql-type-json`) that accepts any JSON value including primitives:

```graphql
scalar JSON # Accepts strings, numbers, booleans, null, arrays, objects
type Mutation {
  DocumentModel_setName(docId: PHID!, input: JSON!): DocumentModel!
}
```

**Pros:**

- No breaking changes to existing action structures
- Flexible - works with any input type

**Cons:**

- Loses type safety in GraphQL schema
- Clients don't get proper input type hints
- Need to add JSON scalar alongside existing JSONObject

### Solution 3: Bypass SET_NAME for Document Creation

Similar to Connect/Vetra, set the name on the document header during creation instead of using a separate `SET_NAME` action:

```typescript
// In createEmptyDocument resolver
const document = module.utils.createDocument();
document.header.name = options.name; // Set before creation
return reactorClient.create(document, parentIdentifier);
```

**Pros:**

- No changes to action types needed
- Simpler flow for document creation

**Cons:**

- Only solves the creation case, not general SET_NAME usage through GraphQL
- Doesn't address REDO/UNDO issues

### Solution 4: Special Handling in Schema Generation

Detect primitive input types during schema generation and handle them specially:

```typescript
// In generateDocumentModelSchema
if (isPrimitiveInputSchema(op.schema)) {
  // Generate mutation with scalar input directly
  `${documentName}_${camelCase(op.name!)}(docId: PHID!, input: String!)`;
} else {
  // Generate mutation with typed input object
  `${documentName}_${camelCase(op.name!)}(docId: PHID!, input: ${documentName}_${pascalCase(op.name!)}Input!)`;
}
```

**Pros:**

- No breaking changes to action structures
- Type-safe for primitives

**Cons:**

- Complex detection logic needed
- Need to handle each primitive type differently

## Questions to Resolve

1. Do we need backward compatibility with existing operations in databases?
2. Should all document models handle SET_NAME/REDO/UNDO, or only specific ones?
3. Is losing GraphQL type safety (with JSON scalar) acceptable?
4. Should we combine solutions (e.g., Solution 3 for creation + Solution 2 for mutations)?

## Related Files

```
packages/document-model/
├── src/core/
│   ├── actions.ts          # undo(), redo() creators
│   ├── operations.ts       # setNameOperation(), redoOperation()
│   ├── reducer.ts          # Handles SET_NAME, REDO, UNDO
│   ├── schemas.ts          # Zod schemas (primitives)
│   └── types.ts            # TypeScript types
├── src/document-model/
│   └── actions.ts          # setName() creator

packages/reactor-api/
├── src/graphql/
│   ├── document-model-subgraph.ts  # Subgraph class, _createDocument mutation
│   └── reactor/
│       ├── schema.graphql  # Action type with input: JSONObject! (ROOT CAUSE)
│       └── resolvers.ts    # createEmptyDocument()
├── src/utils/
│   └── create-schema.ts    # Schema generation

packages/reactor/
├── src/client/
│   ├── types.ts            # CreateDocumentOptions
│   └── reactor-client.ts   # createEmpty(), createDocumentInDrive()

packages/reactor-browser/
├── src/actions/
│   └── document.ts         # addDocument() - how Connect creates docs
```

---

## Implementation: Solution 1 Applied

**Date:** February 2025

We implemented **Solution 1: Change Primitive Inputs to Objects** to fix the GraphQL serialization issue. This section documents the changes made.

### Summary of Changes

The following action inputs were converted from primitives to objects:

| Action     | Before            | After                       |
| ---------- | ----------------- | --------------------------- |
| `SET_NAME` | `input: "my-doc"` | `input: { name: "my-doc" }` |
| `UNDO`     | `input: 1`        | `input: { count: 1 }`       |
| `REDO`     | `input: 1`        | `input: { count: 1 }`       |

### Files Modified

#### 1. Zod Schemas (`packages/document-model/src/core/schemas.ts`)

Converted schema definitions from primitives to objects:

```typescript
// Before
export const RedoActionInputSchema = z.number;
export const SetNameActionInputSchema = z.string;
export const UndoActionInputSchema = z.number;

// After
export function RedoActionInputSchema() {
  return z.object({ count: z.number() });
}

export function SetNameActionInputSchema() {
  return z.object({ name: z.string() });
}

export function UndoActionInputSchema() {
  return z.object({ count: z.number() });
}
```

#### 2. TypeScript Types (`packages/document-model/src/core/types.ts`)

Added new input types and updated schema action types:

```typescript
// New input types
export type RedoActionInput = { count: Scalars["Int"]["input"] };
export type SetNameActionInput = { name: Scalars["String"]["input"] };
export type UndoActionInput = { count: Scalars["Int"]["input"] };

// Updated schema types
export type SchemaRedoAction = {
  // ...
  input: RedoActionInput; // was: Scalars["Int"]["input"]
};

export type SchemaSetNameAction = {
  // ...
  input: SetNameActionInput; // was: Scalars["String"]["input"]
};

export type SchemaUndoAction = {
  // ...
  input: UndoActionInput; // was: Scalars["Int"]["input"]
};
```

#### 3. GraphQL Schema (`packages/document-model/schemas/document/index.graphql`)

Added new GraphQL input types:

```graphql
input SetNameActionInput {
  name: String!
}

input UndoActionInput {
  count: Int!
}

input RedoActionInput {
  count: Int!
}

# Updated action inputs
input SetNameAction {
  type: SET_NAME!
  input: SetNameActionInput! # was: String!
}

input UndoAction {
  type: UNDO!
  input: UndoActionInput! # was: Int!
}

input RedoAction {
  type: REDO!
  input: RedoActionInput! # was: Int!
}
```

#### 4. Action Creators

**`packages/document-model/src/document-model/actions.ts`:**

```typescript
// Before
export const setName = (name: string) =>
  createAction<SetNameAction>("SET_NAME", name, ...);

// After
export const setName = (name: string) =>
  createAction<SetNameAction>("SET_NAME", { name }, ...);
```

**`packages/document-model/src/core/actions.ts`:**

```typescript
// Before
export const undo = (skip = 1, scope = "global") =>
  createAction<UndoAction>("UNDO", skip, ...);

export const redo = (count = 1, scope = "global") =>
  createAction<RedoAction>("REDO", count, ...);

// After
export const undo = (count = 1, scope = "global") =>
  createAction<UndoAction>("UNDO", { count }, ...);

export const redo = (count = 1, scope = "global") =>
  createAction<RedoAction>("REDO", { count }, ...);
```

Note: The `undo` parameter was also renamed from `skip` to `count` for consistency.

#### 5. Operation Handlers (`packages/document-model/src/core/operations.ts`)

**`setNameOperation`:**

```typescript
// Before
export function setNameOperation<TDocument extends PHDocument>(
  document: TDocument,
  name: string,
) {
  return { ...document, header: { ...document.header, name } };
}

// After
export function setNameOperation<TDocument extends PHDocument>(
  document: TDocument,
  input: { name: string },
) {
  return { ...document, header: { ...document.header, name: input.name } };
}
```

**`redoOperation`:**

Added backwards-compatible input handling:

```typescript
// Handle both object format { count: number } and legacy number format
const count =
  typeof input === "object" && input !== null && "count" in input
    ? (input as { count: number }).count
    : input;
```

#### 6. Test Files

Updated test assertions to expect object inputs:

- `packages/document-model/test/document/reducer.test.ts`
- `packages/document-model/test/document/local.test.ts`
- `packages/document-model/test/helpers.ts` (test helper `setLocalName`)

Example assertion change:

```typescript
// Before
expect(action.input).toBe("Document");

// After
expect(action.input).toEqual({ name: "Document" });
```

### Backwards Compatibility

**Public API remains unchanged.** The function signatures are the same:

- `setName(name: string)` - unchanged
- `undo(count?: number, scope?: string)` - unchanged (param renamed from `skip` to `count`)
- `redo(count?: number, scope?: string)` - unchanged

The conversion to object format happens internally in the action creators.

**Legacy operation handling:** The `redoOperation` function includes backwards-compatible handling for operations that may have been created with the old primitive format.

### Migration Considerations

1. **Existing operations in databases:** Operations stored with primitive inputs will need migration or the reducers need to handle both formats (as done in `redoOperation`).

2. **Third-party code:** Any code that directly inspects `action.input` for these operations will need to be updated to expect objects instead of primitives.

3. **GraphQL clients:** Clients that construct these operations manually will need to wrap values in objects.

### Verification

- All `document-model` tests pass (321 passed)
- TypeScript compilation succeeds for `document-model`, `document-drive`, and `reactor-api`
- The changes enable proper GraphQL serialization since all inputs are now objects compatible with `JSONObject`
