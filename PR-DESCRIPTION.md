## Summary

Converts primitive action inputs to object types for `SET_NAME`, `UNDO`, and `REDO` actions to fix GraphQL serialization issues.

## Problem

The `Action` type in GraphQL defines `input: JSONObject!`, but `JSONObject` only accepts objects, not primitives. Actions like `SET_NAME` (string input) and `UNDO`/`REDO` (number inputs) could not be properly serialized through GraphQL, causing sync failures between reactors.

## Solution

Changed action inputs from primitives to objects:

| Action     | Before            | After                       |
| ---------- | ----------------- | --------------------------- |
| `SET_NAME` | `input: "my-doc"` | `input: { name: "my-doc" }` |
| `UNDO`     | `input: 1`        | `input: { count: 1 }`       |
| `REDO`     | `input: 1`        | `input: { count: 1 }`       |

## Notes

- **Public API unchanged** - function signatures remain the same (`setName(name)`, `undo(count)`, `redo(count)`)
- Conversion to object format happens internally in the action creators
- Backwards-compatible handling added for legacy operations with primitive inputs
