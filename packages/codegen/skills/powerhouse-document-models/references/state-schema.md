# State and input schema rules

Contents:

- [Declaring types](#declaring-types)
- [State schema](#state-schema)
- [State type names](#state-type-names)
- [Scalars](#scalars)
- [Arrays, objects and ids](#arrays-objects-and-ids)
- [Input types](#input-types)
- [Empty inputs](#empty-inputs)

## Declaring types

State and inputs are declared with the `ph` builders from `document-model`. The state lives in `v<n>/definition.ts`, each operation's input in its module.

```typescript
import { defineDocumentModel, ph } from "document-model";

export const OrderStatus = ph.enum("OrderStatus", {
  values: ["DRAFT", "PLACED"],
});

export const LineItem = ph.object("LineItem", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
    quantity: ph.Int(),
  },
});

export const orderModel = defineDocumentModel({
  id: "pizza-plaza/order",
  name: "Order",
  description: "An order and its line items.",
  extension: ".ordr",
  version: 1,
  author: { name: "Pizza Plaza", website: null },
  scopes: {
    global: {
      schema: ph.object("OrderState", {
        fields: {
          status: ph.ref(OrderStatus, { required: true }),
          lineItems: ph.list(ph.ref(LineItem, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: { status: "DRAFT", lineItems: [] },
    },
  },
});
```

- A scalar field is a call: `ph.String()`, `ph.OID({ required: true })`.
- `ph.object`, `ph.enum` and `ph.union` declare named types. A field uses one with `ph.ref(Type)`.
- `ph.list(item)` is an array of `item`.
- A field is optional unless its options say `{ required: true }`. For a list, the item and the list each have their own.

## State schema

A user must always be able to create an empty document without providing any information. So:

- Make most fields optional. Use `required: true` only where needed.
- Operations set values. `initialValue` holds only what an empty document needs.
- A root field can be required only if it has a logical default in `initialValue`, e.g. an empty array or an enum's initial status.
- Collections are required lists of required items: no nulls inside, and the array itself starts empty.
- A child object's field can be required only if all its required fields also have logical defaults.
- Use an enum for workflow statuses, with an initial value such as `DRAFT`.

## State type names

- Global state, `scopes.global.schema`: `ph.object("<DocumentModelName>State", ...)`. Never `<DocumentModelName>GlobalState`.
- Local state, `scopes.local.schema`: `ph.object("<DocumentModelName>LocalState", ...)`. A model without local state leaves `scopes.local` out.

`<DocumentModelName>` is the model's name in PascalCase: `"Todo List"` has `TodoListState` and `TodoListLocalState`.

## Scalars

| Standard | Identity | Amounts | Specialized |
| --- | --- | --- | --- |
| `ph.String` | `ph.OID` (object id) | `ph.Amount` | `ph.EthereumAddress` |
| `ph.Int` | `ph.PHID` (Powerhouse id) | `ph.Tokens` | `ph.EmailAddress` |
| `ph.Float` | `ph.OLabel` | `ph.Money` | `ph.Date` |
| `ph.Boolean` | | `ph.AmountFiat` | `ph.DateTime` |
| | | `ph.AmountCurrency` | `ph.URL` |
| | | `ph.AmountCrypto` | `ph.Currency` |
| | | `ph.Percentage` | |

## Arrays, objects and ids

- Arrays are required lists of required items.
- An object in an array has a required `ph.OID` field that identifies it.
- Add a `ph.OLabel` for metadata where it fits.
- `OID` is the primary key (`id`) and the foreign key (`otherObjectId`) inside a document.
- `PHID` only references other documents, e.g. in the drive. Store cached properties next to it, like a link preview whose title may go stale.
- Never use `ph.ID` in a document model.
- No `position` or `weight` fields. The array index is the order; an operation such as `moveItem` reorders the array.
- A tree is a flat list with an optional `parentId: ph.OID()` (`null` for a root node). No recursive or nested types.

## Input types

- An operation declares its input inline: `input: ph.input({ fields: { ... } })`.
- Name the fields for the user's intent. Prefer simple, specific fields to nested types.
- The `OID` of a new object is an input field. The editor generates it with `generateId()` from `document-model` and passes it in the action; users don't type ids.
- An input references the state's enums directly with `ph.ref(TheEnum)`; never redeclare them.
- An input cannot hold a state object type. Mirror it with a `ph.input("NewLineItemInput", { fields })` of its own and reference that.
- Each operation has its own input types. Don't share mirror types between operations.

## Empty inputs

An operation that takes no input declares one without fields. The action creator's argument is then optional:

```typescript
clearAll: global({
  input: ph.input({ fields: {} }),
  reduce(state) {
    state.lineItems = [];
  },
}),
```

```typescript
reducer(document, actions.clearAll());
```
