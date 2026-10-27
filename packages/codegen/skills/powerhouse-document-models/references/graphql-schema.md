# GraphQL schema rules

- [State schema](#state-schema)
- [State type names](#state-type-names)
- [Scalars](#scalars)
- [Arrays, objects and ids](#arrays-objects-and-ids)
- [Input types](#input-types)
- [Empty inputs](#empty-inputs)

Set the state schema with `SET_STATE_SCHEMA` and each operation's input schema with `SET_OPERATION_SCHEMA` (or `ADD_OPERATION`'s `schema`).

## State schema

A user must always be able to create an empty document without providing any information. So:

- Make most fields optional. Use `!` only where needed.
- Operations set values; the schema holds no defaults.
- A root field can be required (`!`) only if it has a logical default, e.g. an empty array or an enum's initial status.
- Collections are `[Type!]!`: no nulls inside, and the array itself defaults to empty.
- A child object's field can be required only if all its required fields also have logical defaults.
- Use an `enum` for workflow statuses, e.g. `status: OrderStatus!` where the enum has an initial value such as `DRAFT`.

## State type names

Codegen expects these names. Any other name breaks the TypeScript build.

- Global state, set with `SET_STATE_SCHEMA` and `scope: "global"`: `<DocumentModelName>State`. Never `<DocumentModelName>GlobalState`.
- Local state: `<DocumentModelName>LocalState`.

```graphql
# Wrong
type TodoListGlobalState {
  todos: [Todo!]!
}

# Right: global
type TodoListState {
  todos: [Todo!]!
}

# Right: local
type TodoListLocalState {
  localTodos: [Todo!]!
}
```

## Scalars

| Standard | Identity | Amounts | Specialized |
| --- | --- | --- | --- |
| `String` | `OID` (object id) | `Amount` | `EthereumAddress` |
| `Int` | `PHID` (Powerhouse id) | `Amount_Tokens` | `EmailAddress` |
| `Float` | `OLabel` | `Amount_Money` | `Date` |
| `Boolean` | | `Amount_Fiat` | `DateTime` |
| | | `Amount_Currency` | `URL` |
| | | `Amount_Crypto` | `Currency` |
| | | `Amount_Percentage` | |

## Arrays, objects and ids

- Arrays are required: `[ObjectType!]!`.
- An object in an array has an `OID!` field that identifies it.
- Add an `OLabel` for metadata where it fits.
- `OID` is the primary key (`id: OID!`) and the foreign key (`otherObjectId: OID!`) inside a document.
- `PHID` only references other documents, e.g. in the drive. Store cached properties next to it, like a link preview whose title may go stale.
- Never use the GraphQL `ID` type in a document model.
- No `position` or `weight` fields. The array index is the order; an operation such as `MOVE_X` reorders the array.
- A tree is a flat list with `parentId: OID` (`null` for a root node). No recursive or nested types.

## Input types

- Name inputs for the user's intent. Prefer simple, specific fields to nested types.
- The `OID` of a new object is an input field. The editor generates it with `generateId()` from `document-model` and passes it in the action; users don't type ids.
- The root input type is `<OperationName>Input`, the PascalCase of the operation name: `SET_CATEGORY_LABEL` takes `SetCategoryLabelInput`. Any other name breaks codegen.
- An input schema can reference only the state schema's `enum` and scalar types. Reference state enums directly; never redefine them.
- Mirror every other state type with an input type of its own, e.g. state `MenuItem` becomes `NewMenuItemInput` for the add operation.
- Each operation has its own input types. Don't share mirror types between operations.

## Empty inputs

Codegen does not support an input type with no fields. Add the optional field `_empty: Boolean`. Codegen recognises that name and makes the action creator's input optional.

```graphql
# Breaks codegen
input ClearAllInput {}

# Works
input ClearAllInput {
  _empty: Boolean
}
```
