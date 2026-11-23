# Reducers

Contents:

- [Where reducer code lives](#where-reducer-code-lives)
- [Purity](#purity)
- [Nullable inputs](#nullable-inputs)
- [Operation errors](#operation-errors)
  - [Declaring errors](#declaring-errors)
  - [Throwing errors](#throwing-errors)

## Where reducer code lives

Each module is a file `document-models/<name>/v<n>/modules/<module>.ts`. It declares the module's operations; an operation holds its input, its errors and its reducer, `reduce(state, input, context)`.

```typescript
import { ph } from "document-model";
import { orderModel } from "../definition.js";

export const orderLineItems = orderModel.module("line-items", {
  operations: ({ global }) => ({
    addLineItem: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          label: ph.String({ required: true }),
        },
      }),
      errors: { DuplicateLineItem: { code: "DUPLICATE_LINE_ITEM" } },
      reduce(state, input, { errors }) {
        if (state.lineItems.some((item) => item.id === input.id)) {
          throw new errors.DuplicateLineItem(`Line item ${input.id} exists.`);
        }
        state.lineItems.push({ id: input.id, label: input.label });
      },
    }),
  }),
});
```

- The operation's key is its name in camelCase. The action creator has the same name (`actions.addLineItem`), and the action type is its upper snake case (`ADD_LINE_ITEM`).
- `global({...})` declares an operation on the global state, `local({...})` one on the local state: `operations: ({ global, local }) => ({ ... })`.
- `reduce` changes `state` in place and returns nothing.
- A module takes effect once `v<n>/index.ts` lists it in `<model>.version({ modules: [...] })`.
- Nothing is generated from a module, so there is no second copy to keep in step.

## Purity

Reducers are pure synchronous functions: the same state and action always give the same result.

Forbidden in reducers:

- `crypto.randomUUID()`, `Math.random()`, `Date.now()`, `new Date()`
- External API calls or other side effects
- Asynchronous functions
- Any other non-deterministic function

Never fall back to a non-deterministic value:

```typescript
// Forbidden
id: input.id || crypto.randomUUID();
timestamp: input.timestamp || new Date();
```

Every dynamic value comes from the action input:

- Ids: add `id: ph.OID({ required: true })` to the input and use `input.id`.
- Timestamps: add `timestamp: ph.DateTime({ required: true })` to the input.
- Computed values: compute them before dispatching the action.

```typescript
// Bad: impure
const newItem = {
  id: crypto.randomUUID(),
  createdAt: new Date(),
};

// Good: pure
const newItem = {
  id: input.id,
  createdAt: input.createdAt,
};
```

## Nullable inputs

- A field is optional unless it is declared with `{ required: true }`.
- An optional input field is `T | null | undefined`. An optional state field is `T | null`.
- Assign with `??`, never `||`. `||` turns valid falsy values (`0`, `false`, `""`) into the fallback. With no applicable default, use `?? null`.

```typescript
// Bad: type error, the state field does not take undefined
amount: input.amount,
notes: input.notes,

// Good: null where there is no default, the default where there is; 0 is kept
amount: input.amount ?? null,
notes: input.notes ?? [],
```

When assigning an optional input conditionally, exclude both `null` and `undefined`:

```typescript
// Bad: Type 'string | null' is not assignable to type 'string'.
if (input.field !== undefined) state.field = input.field;

// Bad: skips valid falsy values such as 0, false and ""
if (input.field) state.field = input.field;

// Good: != null excludes both null and undefined
if (input.field != null) state.field = input.field;
```

## Operation errors

Declare specific errors for each operation's invalid inputs and edge cases. An action's input is validated against the declared input before the reducer runs, so check business rules, not types.

### Declaring errors

An operation's `errors` maps each error name to its code:

```typescript
errors: {
  EntryNotFound: { code: "ENTRY_NOT_FOUND" },
  DuplicateId: { code: "DUPLICATE_ID" },
},
```

- The name is PascalCase and says what went wrong, e.g. `EntryNotFound`, `MissingId`.
- The code is upper snake case, e.g. `"ENTRY_NOT_FOUND"`. It is the thrown error's `errorCode`.

Prefer a specific error to a generic validation error. Common errors:

- `EntityNotFound`: a referenced entity does not exist.
- `DuplicateId`: the id of a new entry already exists.
- `InvalidInput`: the input breaks a business rule.
- `PermissionDenied`: access control refuses the change.

### Throwing errors

The declared errors arrive as classes on the reducer's third argument:

```typescript
// Good
reduce(state, input, { errors }) {
  const entry = state.entries.find((candidate) => candidate.id === input.id);
  if (entry === undefined) {
    throw new errors.EntryNotFound(`No entry has id ${input.id}.`);
  }
  entry.label = input.label;
},

// Bad: generic Error
throw new Error("Something went wrong");
```

A thrown error does not undo the reducer's earlier changes: the operation is recorded with its `error`, and the state keeps whatever the reducer changed before the throw. Validate and throw before you mutate anything.

Testing errors: see [testing.md](testing.md).
