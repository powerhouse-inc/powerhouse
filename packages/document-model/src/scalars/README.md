# Scalars

This directory holds the scalar catalog, the 21 scalars such as `PHID`, `Amount_Money` and `DateTime`, and `defineScalar`, which a project uses to declare its own scalars. `document-model/scalars` exports both.

## Where each part lives

- `types.ts` defines `ScalarDefinition`, its brand and version, and the metadata a definition carries.
- `declarations/` has one file per catalog scalar. `catalog.ts` lists them in catalog order.
- `define-catalog-scalar.ts` brands and freezes a catalog declaration.
- `define-scalar.ts` checks a project scalar's input and derives its metadata. `representation.ts` reads the representation a zod schema states.
- `coercion.ts` and `scalar-literal.ts` build the explicit coercions some catalog scalars declare. `parseLiteral` reads `ScalarLiteralNode`, a closed literal grammar, so a declaration never needs graphql-js.

## Metadata

Every definition this release makes carries `representation` beside its schema, and may carry `coercion`:

| Field            | Meaning                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `representation` | The wire shape of a value: `string`, `number`, `boolean`, `json-object`, `json` or `opaque`. It picks the literal kinds a derived coercion accepts.                              |
| `coercion`       | The GraphQL coercion: `parseValue`, `parseLiteral` and `serialize`. Absent means derived: the schema runs on every path, and only the literal kinds of `representation` parse. |

Nothing on this release reads these fields: not the GraphQL host, codegen or attachments. A later release's code-first tooling will.

A version 1 definition from a release before this metadata has neither field, so `ScalarDefinition` declares them optional. `DescribedScalarDefinition` is the type the catalog and `defineScalar` return, with `representation` present.

### Catalog scalars

Each declaration states its `representation`. The explicit coercions follow the scalar resolvers of the `document-engineering` package this catalog replaced. The GraphQL host never served those resolvers and passes catalog values through today, so wiring these coercions into the host will change what it accepts, such as refusing the literal `7` for `Amount_Money`:

- `Amount_Money`, `Amount_Percentage`, `Amount_Tokens`, `Amount` and `Amount_Fiat` parse a number only from a float literal.
- `Amount_Crypto` and `Amount_Currency` take a numeric string value.
- `Unknown` passes every value through.
- `Upload` refuses every literal.

### Project scalars

`defineScalar` derives `representation` from the schema's output JSON Schema (`z.toJSONSchema`). A union of several shapes, such as strings and numbers, is `json`. When zod cannot state the shape, as for `z.custom`, it is also `json` unless the input sets one. A project scalar has no explicit coercion, so its coercion is derived.

The `representation` input key is for a schema whose shape zod cannot state. A value that contradicts a shape zod does state is refused, including a narrower one for a union of several shapes. `opaque` is always refused, because `defineScalar` refuses a schema whose output is not JSON. The check reads shapes, not values, so a union branch no value can satisfy, such as `z.literal("a").and(z.literal("b"))`, still counts its shape.

```ts
export const HexColor = defineScalar({
  name: "HexColor",
  schema: z.custom<string>(
    (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value),
  ),
  representation: "string",
});
```

## Add a catalog scalar

1. Create `declarations/<name>.ts` with `defineCatalogScalar`, stating its `representation`, and its `coercion` when it is not derived.
2. Append it to `scalarCatalog` in `catalog.ts`.
3. Add its cases to `test/scalars/catalog.test.ts`, and its row to the metadata table in `test/scalars/metadata.test.ts`.
