# Types and fields with `ph`

You build every code-first declaration with `ph`, which you import from `document-model`. `ph` has two kinds of builder: named types and field uses.

## Named types and field uses

A named type has a name. You declare it once and refer to it from fields. The named-type builders are `ph.object`, `ph.input`, `ph.enum`, `ph.interface`, and `ph.union`. Each one takes a name as its first argument and adds a top-level type to the model's SDL.

A field use describes one field inside a type and has no name of its own. The field-use builders are the scalar builders, such as `ph.String`, `ph.PHID`, and `ph.DateTime`, plus `ph.list` and `ph.ref`.

```ts
import { ph } from "document-model";

const Priority = ph.enum("Priority", { values: ["LOW", "HIGH"] });

const Item = ph.object("Item", {
  fields: {
    id: ph.OID({ required: true }),        // a field use
    priority: ph.ref(Priority),            // a reference to a named type
    tags: ph.list(ph.String({ required: true })),
  },
});
```

To use a named type in a field, wrap it in `ph.ref`. If you put the named type in the field directly, the declaration fails. A named type adds a type definition to the SDL, and a field needs a field use.

## Mark required fields with `required`

Every field is optional unless you pass `{ required: true }`. A required field is non-null in the SDL. There is no `optional` option, no `nullable` option, and no `.required()` method.

With one way to mark a required field, each declaration has exactly one SDL form. That keeps the declaration comparable with its stored specification. `required` works the same way on a scalar, a list, and a reference:

```ts
ph.String()                                  // String
ph.String({ required: true })                // String!
ph.list(ph.String({ required: true }))       // [String!]
ph.list(ph.String(), { required: true })     // [String]!
```

## Declarations that fail

The declarations below fail as soon as the module runs. Each failure reports a diagnostic that tells you how to fix it. All four would otherwise produce a model whose runtime behavior does not match its TypeScript types.

**A scalar builder that is not called.** `ph.String` is the builder, and `ph.String()` is the field. If a field holds `ph.String` without the call, the diagnostic is `PH-SCALAR-FACTORY-AS-FIELD`.

**A named type in a field.** `ph.object(...)` declares a type. To use it in a field, wrap it in `ph.ref(...)`. Otherwise the diagnostic is `PH-DEF-TYPE-AS-FIELD`.

**An operation name that changes when the action creator name is derived from it.** An operation named `setPHID` gets the action creator name `setPhid`. The TypeScript key and the runtime key would then differ. The diagnostic tells you to rename the operation to `setPhid`.

**An input type with the wrong name.** The stored format ties the name of an operation's input type to the operation. The `setTitle` operation takes `SetTitleInput`. If you name the input `TitleInput`, the diagnostic tells you the name it expects.

## Declare a scalar for your package

`ph` includes the catalog scalars, such as `ph.PHID`. To add a scalar of your own, call `defineScalar`. The catalog scalars use the same function. `defineScalar` returns a builder that you call in a field the same way you call `ph.PHID`.

```ts
import { defineScalar, ph } from "document-model";
import { z } from "zod";

export const HexColor = defineScalar({
  name: "HexColor",
  description: "A six-digit hexadecimal color, such as #1a2b3c.",
  representation: "string",
  validator: z.string().regex(/^#[0-9a-f]{6}$/i),
  zodSource: "z.string().regex(/^#[0-9a-f]{6}$/i)",
});

const Label = ph.object("Label", {
  fields: { color: HexColor({ required: true }) },
});
```

`defineScalar` requires `name`, `description`, `representation`, `validator`, and `zodSource`. The other options have defaults.

- `validator` checks each value at runtime.
- `zodSource` is the same rule written as source text, for generated code. No tool compares `validator` with `zodSource`. When you change one, change the other.
- If you omit `coercion`, `defineScalar` derives it from `validator` and `representation`.

A package scalar then works like a catalog scalar:

- The model definition lists the scalar in `scalars`, with the implementation `package#HexColor` and its full definition. The definition is included because no catalog has it.
- Action creators and reducers check its values with `validator`.
- The GraphQL host declares the scalar with its description and uses its coercion.

The GraphQL name of the scalar depends on where you use it:

- In a document model, the host adds the model prefix, the same as for the model's types. In a `Todo` model, `HexColor` becomes `Todo_HexColor`.
- In a code-first subgraph, the scalar keeps its own name, `HexColor`, the same as the subgraph's types.
- A catalog scalar keeps its name and its existing host binding.

### Naming rules

A package scalar cannot use the name of a catalog scalar, a GraphQL built-in scalar, or a named type in the same model or subgraph.

Declare each scalar once and import its builder where you need it. If one package has two different declarations with the same name, `ph model check` reports an error. So a scalar name refers to one scalar in all models and subgraphs of the package.

:::warning
When you change a scalar declaration, you change the definition of every model that uses it. The change can also make some stored operations fail when they replay.
:::
