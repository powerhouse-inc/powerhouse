# `services/openpanel`

OpenPanel analytics service for Connect. Full design rationale lives in the
[Brief: OpenPanel Analytics in Connect](../../../../../docs/openpanel-analytics.md)
and the wiki brief (`fd20b7ef-4c86-4d2c-9391-0999d659b64b`).

## The `events.json` contract

`events.json` is the **single source of truth** for which document operations
are tracked. It is validated at boot time by `events.ts` using a zod schema:
duplicates throw, unknown keys are rejected. You never need to touch TypeScript
to add or remove event coverage.

### Event name derivation

Names are not hand-authored — they are computed from `(documentType, actionType)`:

```
eventName = `${normalize(documentType)}.${actionType.toLowerCase()}`

normalize(s):
  1. lowercase
  2. replace "/" with "."
  3. strip any character not in [a-z0-9._-]
```

Examples:

| `documentType`              | `actionType`  | Derived event name                      |
| --------------------------- | ------------- | --------------------------------------- |
| `powerhouse/document-drive` | `ADD_FOLDER`  | `powerhouse.document-drive.add_folder`  |
| `powerhouse/document-drive` | `DELETE_NODE` | `powerhouse.document-drive.delete_node` |
| `sky/atlas-scope`           | `SET_NAME`    | `sky.atlas-scope.set_name`              |

Set `"alias"` on a mapping entry to override the derived name with a static
product-friendly label (e.g. `"drive.renamed"`).

## How to add a new mapping

1. **Verify the action type exists.** Look it up in the document model's reducer,
   for example `packages/shared/document-drive/src/reducers/` for drive actions.
   An unmatched action type loads without error but will silently never fire.

2. **Edit `events.json`.** Either add the action type to an existing entry's
   `actionTypes` array, or append a new entry object:

   ```json
   {
     "documentType": "my-org/my-model",
     "actionTypes": ["MY_ACTION"],
     "alias": "my-model.my-action" // optional
   }
   ```

3. **No TypeScript changes needed.** The loader picks up the change on next
   build/boot.

4. **Watch for duplicates.** If `(documentType, actionType)` appears more than
   once across all entries, `loadEvents()` throws at app start. Fix by removing
   the duplicate before deploying.

## Module exports

| Export                                    | Description                                                 |
| ----------------------------------------- | ----------------------------------------------------------- |
| `loadEvents(raw?)`                        | Parse + validate raw JSON, return `{ mappings, lookupMap }` |
| `eventMappings`                           | Validated array from the bundled `events.json`              |
| `eventLookupMap`                          | `Map<documentType, Map<actionType, mapping>>` — O(1) lookup |
| `normalize(s)`                            | Document-type normalizer                                    |
| `deriveEventName(mapping, op)`            | Alias or derived name for an op                             |
| `buildDefaultProperties(op)`              | Six default properties attached to every event              |
| `getOpenPanelClient()`                    | Lazy-loaded singleton                                       |
| `resetOpenPanelClient()`                  | Tear down + clear the singleton                             |
| `createOpenPanelProcessorFactory(config)` | Factory for the reactor processor                           |
