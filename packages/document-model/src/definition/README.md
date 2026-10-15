# Definition compatibility contract

Code-first compilation produces runtime behavior and a stored specification.
Consumers must preserve each operation identity rather than reconstruct it from
another field.

| Identity                  | Consumer contract                                                            |
| ------------------------- | ---------------------------------------------------------------------------- |
| Declaration operation key | [naming.ts](naming.ts) derives defaults and applies overrides.               |
| Compiled operation `id`   | Joins the compiled operation to its stored specification operation.          |
| Stored operation `name`   | Names the served GraphQL mutation.                                           |
| `creatorKey`              | Retrieves the creator from the model's `actions` object.                     |
| `actionType`              | Selects reducer dispatch, operation authorization and attachment extraction. |
| `input.name`              | Selects the input root in stored GraphQL SDL.                                |

## Consumers

- [materialize.ts](materialize.ts) indexes reducers by `actionType`, exposes
  `creatorKey` actions and validates input before dispatch. Persisted scope routes
  state.
- [Document-model subgraph](../../../reactor-api/src/graphql/document-model-subgraph.ts)
  uses stored names, creator keys and action types independently. Unreadable
  definitions fall back to stored SDL with an additional permission check against
  the constructed action's type.
- [Attachment schema compiler](../../../reactor-attachments/src/reference-index/attachment-schema-compiler.ts)
  selects `actionType`, joins stored SDL by operation `id` and reads `input.name`.
  Specifications without compiled definitions use legacy naming derivation.

## Replay compatibility

Declared operations precede system fallbacks. A declared `NOOP` can have
attachment-bearing input and must retain its extractor. The fallback also accepts
persisted `LOAD_STATE` and `PRUNE` without operation input for old history.

Missing or ambiguous mappings fail compilation. Preserve the diagnostic instead of
discarding reference updates as if no input existed.

## Checks

- [Naming](../../test/definition/naming.test.ts),
  [compiler regressions](../../test/definition/compiler-regressions.test.ts) and
  [scalar parity](../../test/definition/scalar-model-parity.test.ts) cover compiled
  identities and runtime behavior.
- [Attachment compiler](../../../reactor-attachments/test/reference-index/attachment-schema-compiler.test.ts)
  covers overrides, declared `NOOP` and legacy system actions;
  [reference read-model tests](../../../reactor-attachments/test/read-models/attachment-reference/read-model.test.ts)
  cover persistence.
- [GraphQL consumer tests](../../../reactor-api/test/) cover served behavior.
  Rebuild changed `document-model` output before consumers resolving `dist`.
