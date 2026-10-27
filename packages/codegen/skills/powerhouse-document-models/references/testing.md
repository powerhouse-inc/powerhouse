# Testing reducers

- [Coverage rule](#coverage-rule)
- [Testing reducer errors](#testing-reducer-errors)
- [Reaching 100% coverage](#reaching-100-coverage)

## Coverage rule

- Run `npm run test:coverage` after any reducer change. Coverage counts `document-models/**/src/reducers/**`.
- Reducers stay at 95% or more on lines, branches, functions and statements. Below that, add tests in `document-models/<name>/v<n>/tests/` until it passes. Don't lower the threshold or exclude files.
- Cover the happy path and every error defined with `ADD_OPERATION_ERROR`. Each error is a branch.
- Import the reducer, `utils`, action creators and input schemas from `document-models/<name>/v<n>`, as the generated tests do.
- The generated `should handle <operation> operation` tests check that the recorded operation has no `error`. They fail while the reducer is codegen's stub, and for an operation that needs existing state (e.g. a book to finish): dispatch that state first in the test.

## Testing reducer errors

A reducer that throws does not throw out of `reducer`:

1. The reducer throws, e.g. `throw new InvalidNameError("message")`.
2. The operation is still recorded in `document.operations.global` (or `.local`).
3. Its `error` property holds the error message as a string.
4. Changes made before the throw stay in the state. The state is not rolled back.

Never use `.toThrow()` or `expect(() => ...).toThrow()` for reducer errors. Read the operation instead, at the right index: the index is the number of operations dispatched before it in that scope. The first operation is `[0]`; after three earlier operations it is `[3]`.

```typescript
it("should return error and not mutate state", () => {
  const document = utils.createDocument();
  const initialState = document.state.global.name;

  const updatedDocument = reducer(document, setName({ name: "invalid" }));

  // 0 = first operation
  expect(updatedDocument.operations.global[0].error).toBe(
    "Name is not allowed",
  );
  // The reducer threw before changing anything
  expect(updatedDocument.state.global.name).toBe(initialState);
});

// Wrong: never use toThrow()
expect(() => reducer(document, setName({ name: "invalid" }))).toThrow();
```

This holds for the document `reducer` returns in tests. An editor in Connect gets rejected actions through `dispatch`'s `onErrors` callback instead; the powerhouse-editors skill covers it.

## Reaching 100% coverage

95% is the floor. Push toward 100% where you can. Statements and lines get there quickly; branches are the hard part, since every `||`, `??`, `if` and `&&` is two branches.

Write a few scenario tests first, each chaining many operations the way a real consumer would. One flow test that runs 14 operations is worth more than 14 isolated tests.

Then sort each uncovered branch before writing a test for it:

1. Wrong nullability: the type allows `null`, but the value is always set. Fix the type (e.g. `Int!` through `SET_STATE_SCHEMA` or `SET_OPERATION_SCHEMA`), and the fallback branch disappears.
2. Missing validation: the field is required for a variant, but the reducer accepts its absence. Add a named error with `ADD_OPERATION_ERROR` and reject. The new branch is reachable and worth a test.
3. Wrong operator: `||` where `??` belongs, so falsy but valid values (`0`, `false`, `""`) become the fallback. Fix the operator and test with a falsy value.
4. Real optionality: both sides are reachable with valid inputs. Vary the inputs of existing scenario tests to hit both.

Then extend the scenario tests to reach the rest:

- Skip initialization to reach "not yet initialized" branches.
- Chain invalid operations and read their errors by operation index, as above.
- Use minimal or empty inputs for fallback-to-null branches.
- Vary inputs so both sides of each real `??` are hit.

Don't test around bad types; fix them. An untestable branch almost always means a type that is too loose, a missing validation or the wrong operator.
