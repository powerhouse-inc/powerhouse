# Reducers

Contents:

- [Where reducer code lives](#where-reducer-code-lives)
- [Purity](#purity)
- [Nullable inputs](#nullable-inputs)
- [Operation errors](#operation-errors)
  - [Defining errors](#defining-errors)
  - [Throwing errors](#throwing-errors)

## Where reducer code lives

- Each module has `document-models/<name>/v<n>/src/reducers/<module>.ts`. It exports an object with one method per operation, named `<operation>Operation(state, action)` in camelCase.
- The reducer code you send with `SET_OPERATION_REDUCER` (or `ADD_OPERATION`'s `reducer`) is the method body only, without a function header. Codegen uses it when the file lacks that method.
- Reducers are wrapped with Mutative: mutate `state` directly.
- Put external imports at the top of the reducer file in `src/`.
- Keep the model's reducer code and the file in step. See "Change a document model" in SKILL.md.

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
id: action.input.id || crypto.randomUUID();
timestamp: action.input.timestamp || new Date();
```

Every dynamic value comes from the action input:

- Ids: add `id: OID!` to the input schema and use `action.input.id`.
- Timestamps: add `timestamp: DateTime!` to the input schema.
- Computed values: compute them before dispatching the action.

```typescript
// Bad: impure
const newItem = {
  id: crypto.randomUUID(),
  createdAt: new Date(),
};

// Good: pure
const newItem = {
  id: action.input.id,
  createdAt: action.input.createdAt,
};
```

## Nullable inputs

- Optional input fields have type `InputMaybe<T>`: `T | null | undefined`.
- Optional state fields have type `Maybe<T>`: `T | null`.
- Assign with `??`, never `||`. `||` turns valid falsy values (`0`, `false`, `""`) into the fallback. With no applicable default, use `?? null`.

```typescript
// Bad: type error with Maybe<string>
amount: action.input.amount,
notes: action.input.notes,

// Good: null where there is no default, the default where there is; 0 is kept
amount: action.input.amount ?? null,
notes: action.input.notes ?? [],
```

When assigning an optional input conditionally, exclude both `null` and `undefined`:

```typescript
// Bad: Type 'string | null' is not assignable to type 'string'.
if (action.input.field !== undefined) state.field = action.input.field;

// Bad: skips valid falsy values such as 0, false and ""
if (action.input.field) state.field = action.input.field;

// Good: != null excludes both null and undefined
if (action.input.field != null) state.field = action.input.field;
```

## Operation errors

Define specific errors for each operation's invalid inputs and edge cases. Action inputs are validated against the input schema before the reducer runs, so check business rules, not types.

### Defining errors

Add each error with `ADD_OPERATION_ERROR`:

- `errorCode`: upper snake case, e.g. `"MISSING_ID"`, `"ENTRY_NOT_FOUND"`. It becomes the generated class's `errorCode`; an empty code falls back to the name.
- `errorName`: PascalCase ending in `Error`, e.g. `"MissingIdError"`, `"EntryNotFoundError"`. Codegen generates a class from the name.
- `errorDescription`: the condition, in plain words.

Error ids are unique. Several operations of a module may define the same error name, e.g. `EntryNotFoundError`, if they give it the same code: codegen writes one class, and fails when one name has two codes. Prefer a specific error to a generic validation error.

Common errors:

- `EntityNotFoundError`: a referenced entity does not exist.
- `DuplicateIdError`: the id of a new entry already exists.
- `InvalidInputError`: the input breaks a business rule.
- `PermissionDeniedError`: access control refuses the change.

### Throwing errors

Reference the error class by name. Codegen adds the import for every error the module defines.

```typescript
// Good
if (entryIndex === -1) {
  throw new EntryNotFoundError("Entry not found");
}

// Bad: generic Error
throw new Error("Something went wrong");

// Bad: nested access
throw new errors.ModuleName.MissingIdError("message");
```

The generated reducer file opens with `import { … } from "../../gen/<module>/error.js";`. That import is codegen's; leave it, and don't add error imports of your own.

A thrown error does not undo the reducer's earlier changes: the operation is recorded with its `error`, and the state keeps whatever the reducer changed before the throw. Validate and throw before you mutate anything.

Testing errors: see [testing.md](testing.md).
