# Custom scalars

A custom scalar is a GraphQL scalar that your project defines with a zod schema. You declare it in a document model's SDL or use it in a custom subgraph. Codegen generates its TypeScript type and its zod validation from that schema, and the host checks every input value of the scalar against the same schema.

Use a custom scalar when a field needs a format that the built-in scalars don't cover. This page uses an `Iban` scalar for international bank account numbers.

## Define a scalar

Export each scalar from `scalars/index.ts` at the project root. `ph init` doesn't create this file. Create it when you add your first custom scalar.

```ts title="scalars/index.ts"
import { defineScalar } from "document-model/scalars";
import { z } from "zod";

export const Iban = defineScalar({
  name: "Iban",
  description: "International bank account number",
  schema: z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/),
  example: "DE89370400440532013000",
});
```

`defineScalar` accepts these keys and no others:

| Key           | Required | Purpose                                                                                                                              |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`        | Yes      | The GraphQL name of the scalar.                                                                                                      |
| `schema`      | Yes      | A zod schema. Its output is the TypeScript type of the scalar and the value that reducers receive. The host validates input with it. |
| `description` | No       | The scalar's GraphQL description. Introspection shows it.                                                                            |
| `example`     | No       | A value the schema accepts. Generated reducer tests use its parsed form as the mock value for fields of this scalar.                 |

API clients see the schema's error message when they send an invalid value. To replace zod's default message, pass `error`:

```ts
schema: z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, {
  error: "Expected an IBAN such as DE89370400440532013000",
}),
```

Scalars run in Connect and on every host. Import only packages that run in both the browser and Node. `ph build` fails when `scalars/index.ts` imports a package that needs a native addon or a WebAssembly module.

### Name the export after the scalar

The export name must equal `name`. Codegen never runs your project code. It reads `Iban` from the SDL and imports `Iban` from `scalars/index.ts` by that name. The host also refuses a scalar whose export key differs from `name`.

`defineScalar` throws for these names:

- A name that is not a valid GraphQL name.
- A GraphQL built-in scalar: `String`, `Int`, `Float`, `Boolean` or `ID`.
- A Powerhouse catalog scalar: `Address`, `Amount`, `Amount_Crypto`, `Amount_Currency`, `Amount_Fiat`, `Amount_Money`, `Amount_Percentage`, `Amount_Tokens`, `AttachmentRef`, `Currency`, `Date`, `DateTime`, `EmailAddress`, `EthereumAddress`, `JSONObject`, `OID`, `OLabel`, `PHID`, `Unknown`, `Upload` or `URL`.

It also throws for any key that is not in the table above, and for an `example` that the schema refuses. The message names the scalar and the reason:

```text
Cannot define scalar "Int": the name is a GraphQL built-in scalar.
Cannot define scalar "Iban": the example fails the schema: ✖ Invalid string: must match pattern /^[A-Z]{2}\d{2}/
```

Scalar names are global on a host. The scalars of every installed package share one namespace with the catalog. If two packages define the same name with different definitions, the host keeps the one it loaded first and refuses the other.

### Use the value type in TypeScript

`ScalarValue` gives the TypeScript type of a scalar's values, which is the output type of its schema. For `Iban`, the type is `string`:

```ts
import type { ScalarValue } from "document-model/scalars";
import type { Iban } from "./scalars/index.js";

type IbanValue = ScalarValue<typeof Iban>; // string
```

A schema that ends in `.brand<"Iban">()` gives `string & $brand<"Iban">`, so TypeScript refuses a plain string where an `Iban` is expected. The `example` still takes a plain string, because it has the schema's input type. `defineScalar` parses the example and stores the output.

### Return JSON that the schema accepts again

The output of the schema is the canonical value of the scalar. Reducers receive the canonical value, and the document state stores it. `defineScalar` accepts a schema only when its output is JSON and is a valid input of the same schema. The host also checks that the output comes back unchanged when the schema parses it again.

A schema can normalize the value. This `Iban` accepts lowercase letters and spaces around the number:

```ts title="scalars/index.ts"
export const Iban = defineScalar({
  name: "Iban",
  description: "International bank account number",
  schema: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/),
  example: "DE89370400440532013000",
});
```

When a client sends `" de89370400440532013000 "`, the reducer receives `"DE89370400440532013000"`, whether the operation comes from Connect or from the host. An operation that Connect stores keeps the input as the user entered it.

`defineScalar` accepts these schemas:

- Checks such as `.regex()` and `.refine()`.
- `.brand()`.
- `.trim()`, `.toLowerCase()`, `.toUpperCase()` and `.overwrite()`.
- A `.transform()` that keeps the type and returns the same value when it runs again.
- `z.enum`, `z.literal` and unions.
- Objects, including objects with optional or nullable properties.
- Arrays, records and tuples.
- `z.coerce.number()`, `z.coerce.string()` and `z.preprocess(String, z.string())`.
- `.catch()`.
- `z.custom` with a JSON type, such as ``z.custom<`0x${string}`>()``.

A refused schema fails to type-check. The error names one of five causes:

| Cause in the error                                                                             | Refused schemas                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defineScalar refuses this schema: its output is any`                                          | `z.any()`, `z.custom<any>()`                                                                                                                                                |
| `defineScalar refuses this schema: it accepts a missing value; nullability belongs in the SDL` | `.optional()`, `.nullish()`, `.default()` and `.prefault()`, also on `z.coerce` and `z.preprocess` schemas                                                                  |
| `defineScalar refuses this schema: its output must be JSON`                                    | An `undefined` at the top level or inside an array, such as `z.array(z.string().optional())`, a `Date` output, `z.unknown()`, `z.bigint()`, an object with a function field |
| `defineScalar refuses this schema: its output can be null; nullability belongs in the SDL`     | `.nullable()`, a top-level `z.json()`                                                                                                                                       |
| `defineScalar refuses this schema: its output must pass the schema again`                      | A `.transform()` or `.pipe()` that changes the type, such as `.transform(Number)` or `z.string().pipe(z.coerce.number())`                                                   |

Make a field nullable in the SDL instead of in the schema. `iban: Iban` is nullable, and `iban: Iban!` is not.

For `schema: z.string().transform(Number)`, TypeScript reports:

```text
Type 'ZodPipe<ZodString, ZodTransform<number, string>>' is not assignable to type 'ZodPipe<ZodString, ZodTransform<number, string>> & OutputFailsSchema'.
  Property '"defineScalar refuses this schema: its output must pass the schema again"' is missing in type 'ZodPipe<ZodString, ZodTransform<number, string>>' but required in type 'OutputFailsSchema'.
```

TypeScript doesn't see every output that isn't JSON. It misses an explicit `undefined` in an optional object property, such as a transform that returns `{ value: undefined }` for `{ value?: string }`, and an `any` inside an object, such as `z.object({ value: z.any() })`. The host refuses such a value. Connect doesn't check it and stores it in the state.

`defineScalar` also checks for a missing-value schema at runtime. This check catches JavaScript callers, casts, and a union with a coercing default, such as `z.union([z.coerce.number().default(7), z.string()])`, which TypeScript accepts:

```text
Cannot define scalar "Count": the schema accepts a missing value; nullability belongs in the SDL.
```

TypeScript can't tell whether a transform returns the same value when it runs again. The host checks that for every value it parses. For details, see [What the host validates](#what-the-host-validates).

A schema with `.catch()` replaces a value that fails the schema with the fallback. The fallback must still be JSON that the schema returns unchanged on a second parse. Otherwise the host refuses it. For example, `z.string().regex(/^ok$/).catch((ctx) => String(ctx.input) + "!")` turns `"bad"` into `"bad!"`, and the host refuses the value because `"bad!"` parses to `"bad!!"`.

The generated code makes a nullable field `.nullish()`, so a missing nullable field stays missing, even with `.catch()`. A required field can still get a value in Connect when a caller skips the types and leaves it out or sets it to `undefined`. The host never parses an absent value. In the reducer:

- `.catch("c")` fills a missing required field with `"c"`.
- `z.preprocess((v) => v ?? "x", z.string())` fills it with `"x"`.
- `z.coerce.string()` turns a field set to `undefined` into the string `"undefined"`.
- `z.preprocess(String, z.string())` turns a missing or `undefined` field into `"undefined"`.

Use `z.string()` when a missing value must fail.

### Store free-form JSON in an object

A top-level `z.json()` can output `null`, so `defineScalar` refuses it with `its output can be null`. To accept any JSON value, put `z.json()` in an object property:

```ts title="scalars/index.ts"
export const Metadata = defineScalar({
  name: "Metadata",
  description: "Free-form JSON under a meta key",
  schema: z.object({ meta: z.json() }),
  example: { meta: { tags: ["a", "b"] } },
});
```

### Store a big integer as a decimal string

A `bigint` isn't JSON, so a scalar can't output one. Define a big integer as a decimal string:

```ts title="scalars/index.ts"
export const BigInteger = defineScalar({
  name: "BigInteger",
  description: "A signed integer of any size, as a decimal string",
  schema: z
    .string()
    .regex(/^-?\d+$/)
    .transform((s) => BigInt(s).toString())
    .brand<"BigInteger">(),
  example: "123",
});
```

The transform writes one form for each number, so `"007"` becomes `"7"` and `"-0"` becomes `"0"`. The `example` is a plain string, because it has the schema's input type. In a reducer, convert the value with `BigInt` for arithmetic, and parse the result to write it back:

```ts
addAmountOperation(state, action) {
  const total = BigInt(state.total) + BigInt(action.input.amount);
  state.total = BigInteger.schema.parse(total.toString());
},
```

The parse returns the branded type that the state field expects.

## Use the scalar in a document model

Declare `scalar Iban` once, in the state schema. The Vetra document-model editor merges the state and operation schemas, so a second declaration is a duplicate type there. Then use `Iban` like any other type, in state types and in operation inputs:

```graphql title="State schema"
scalar Iban

type PaymentState {
  iban: Iban
}
```

```graphql title="Operation schema"
input SetIbanInput {
  iban: Iban!
}
```

Regenerate the code:

```bash
ph generate all
```

The generated files in `document-models/<model>/v<N>/gen/schema/` import the definition from `scalars/index.ts`:

- `types.ts` maps the input and output types of `Iban` to `import("document-model/scalars").ScalarValue<typeof import("../../../../../scalars/index.js").Iban>`.
- `zod.ts` imports `{ Iban }` and validates `Iban` fields with `Iban.schema`.

The generated reducer parses each operation's input with its zod schema. When the input uses `Iban`, directly or through a nested input type or a list, the reducer passes the parsed input to your operation reducer. Your reducer then receives canonical scalar values, whatever sent the operation: Connect, a GraphQL mutation or sync. For these operations, `z.object` drops keys that the input type doesn't declare, and a default value on an input field in the SDL fills in a missing field.

Other operations receive the input as it was stored, as before. A model without custom scalars regenerates the same reducer, so its stored operations replay to the same state.

Generated reducer tests mock `Iban` input fields with `Iban.example`, wrapped in an array for a list field. Without `example`, they generate a value from `Iban.schema`. For a `z.custom` schema, the mock generator throws `No generator for schema custom`, so set `example` when you use `z.custom`.

## Use the scalar in a custom subgraph

A custom subgraph uses `Iban` in its typeDefs. You can declare `scalar Iban` in the subgraph or leave the declaration out. The host declares every registered scalar in every subgraph and drops the subgraph's own declaration.

```ts title="subgraphs/payments/schema.ts"
import { gql } from "graphql-tag";
import type { DocumentNode } from "graphql";

export const schema: DocumentNode = gql`
  type Query {
    ibanCountry(iban: Iban!): String!
  }
`;
```

The host parses `iban` with the schema before the resolver runs, so the resolver receives the canonical value:

```ts title="subgraphs/payments/resolvers.ts"
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { ScalarValue } from "document-model/scalars";
import type { Iban } from "../../scalars/index.js";

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => ({
  Query: {
    ibanCountry: (_parent: unknown, args: { iban: ScalarValue<typeof Iban> }) =>
      args.iban.slice(0, 2),
  },
});
```

`Iban` has the same name everywhere: in the document-model subgraph at `/graphql/<model-name>`, in the custom subgraph at `/graphql/payments` and in the supergraph at `/graphql`. The host never prefixes it.

For how to create and run a subgraph, see [Using subgraphs](/academy/Build/WorkWithData/UsingSubgraphs).

## Add custom scalars to an existing project

1. In the project root, run:

   ```bash
   ph migrate
   ```

   `ph migrate` adds the `./scalars` export to `package.json` and the `scalars` paths to `tsconfig.json`. It doesn't create or change `scalars/index.ts`. As for any upgrade, it also updates the Powerhouse dependencies and regenerates the code.

2. Create `scalars/index.ts` at the project root and define your scalars in it.
3. Declare them in the model SDL.
4. Run `ph generate all`.
5. Before you publish the package, run `ph build`. Hosts load the scalars from the package's `./scalars` export, which points into `dist/`.

A project without custom scalars generates the same reducers as before. Only operations whose input uses a custom scalar receive the parsed input, as described in [Use the scalar in a document model](#use-the-scalar-in-a-document-model).

## What the host validates

A host, such as Switchboard or `ph vetra`, loads each package's `./scalars` export before the package's document models and subgraphs. Each exported definition registers its scalar by name.

For each registered scalar, the host checks input values:

- `parseValue` checks values that arrive as variables.
- `parseLiteral` checks values written inline in the query.

Both run the scalar's `schema` and pass its output to the resolver. When the schema refuses a value, the host refuses the request. The error message holds the GraphQL prefix, the scalar name and the message from `z.prettifyError`. For a variable:

```text
Variable "$iban" got invalid value "not-an-iban"; Expected type "Iban". Iban: ✖ Invalid string: must match pattern /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/
```

For an inline literal:

```text
Expected value of type "Iban!", found "not-an-iban"; Iban: ✖ Invalid string: must match pattern /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/
```

Both then write the output to JSON and read it back. If the copy differs from the output, the host refuses the request. This check catches schemas that skip the type check, such as one from a JavaScript package. For a schema that outputs a `bigint`, the value `"7"` gives:

```text
Iban: the schema output is not JSON: 7n
```

A number scalar refuses `-0` for the same reason, because JSON writes `-0` as `0`.

Last, both parse the JSON copy a second time. If the second parse refuses the copy or returns a different value, the host refuses the request. For a scalar `Bang` with the schema `z.string().transform((s) => s + "!")`, the value `"abc"` gives:

```text
Bang: the schema must accept its own output unchanged, but "abc!" parses to "abc!!".
```

When the second parse refuses the copy, the message ends with `fails it:` and the zod error instead:

```text
Iban: the schema must accept its own output unchanged, but 7 fails it: ✖ Invalid input: expected string, received number
```

Connect doesn't run the JSON check or the second parse. It parses each input once, in the reducer.

The subgraphs run these checks. The supergraph at `/graphql` forwards the value to the subgraph. It returns the subgraph's refusal inside a `400: Bad Request` error, with the message above under `extensions.response.body.errors`.

`serialize` returns values unchanged. The host doesn't check the values that resolvers return.

The host doesn't run the schemas of the catalog scalars, such as `EmailAddress` and `DateTime`. Codegen messages call these the built-in scalars. The host passes their values through as before.

The host refuses to register a scalar in these cases:

- The definition comes from a version of `document-model` whose definition format the host doesn't support.
- The export key differs from `name`.
- The name is a GraphQL built-in, a catalog scalar, or a type of the generated document-model schema such as `Query` or `Operation`. `defineScalar` doesn't check schema type names. A package that bundles another copy of `document-model` runs that copy's `defineScalar`, so the host checks all three again.
- Another package already registered the same name with a different definition. The first package loaded wins.

The host logs one warning per package, with the same header as a failed load, and names the packages involved:

```text
Failed to load scalars from @acme/payments:
  Scalar Iban of package @acme/payments is refused: package @acme/banking already registers a different Iban.
```

A refused scalar is not served. The package's other scalars, document models and subgraphs still load.

A scalar can also take a name that a host subgraph defines as a type, such as `PHDocument`. The host registers it but doesn't serve it, and the subgraph keeps the name. The host logs an error instead of the warning above:

```text
Refusing scalar PHDocument of package @acme/payments: subgraph r defines a type of that name
```

In `ph vetra`, saving `scalars/index.ts` rebuilds the GraphQL schema and reloads the project's document models, so the reducers also parse with the new definition. You don't need to restart.

An object or list default value for an argument or input field of a custom or catalog scalar type breaks GraphQL introspection today.

## Use your own resolver for a scalar

A subgraph can put its own `GraphQLScalarType` for a registered scalar in its `resolvers`. The subgraph's resolver wins in that subgraph, and the registered validation doesn't run there. The host logs one warning per subgraph and scalar:

```text
Subgraph payments provides its own resolver for registered scalar Iban; the registered validation is not applied.
```

If you replace the resolver, your `parseValue` and `parseLiteral` must do the validation.

## Fix common errors

### Codegen stops with "declares scalar Iban, which is not a built-in scalar"

```text
Model PaymentModel declares scalar Iban, which is not a built-in scalar. Create scalars/index.ts and export it from there with defineScalar.
```

The model declares a scalar that isn't in the catalog, and the project has no `scalars/index.ts`. Create `scalars/index.ts` at the project root and export the scalar from it with `defineScalar`.

### TypeScript reports "has no exported member 'Iban'"

TypeScript reports these errors in `gen/schema/zod.ts` and `gen/schema/types.ts`:

```text
error TS2305: Module '"../../../../../scalars/index.js"' has no exported member 'Iban'.
error TS2694: Namespace '"<project>/scalars/index"' has no exported member 'Iban'.
```

The model declares `scalar Iban`, but `scalars/index.ts` doesn't export `Iban`. Export it with `defineScalar`, and check that the export name equals `name`.

### TypeScript reports "defineScalar refuses this schema"

```text
Property '"defineScalar refuses this schema: its output must pass the schema again"' is missing in type 'ZodPipe<ZodString, ZodTransform<number, string>>' but required in type 'OutputFailsSchema'.
```

The text after `refuses this schema:` names the cause:

- `its output is any`: replace `z.any()` or `z.custom<any>()` with a schema for the actual type.
- `it accepts a missing value; nullability belongs in the SDL`: remove `.optional()`, `.nullish()`, `.default()` or `.prefault()`, and make the field nullable in the SDL.
- `its output must be JSON`: remove `.optional()` inside arrays, and return strings instead of a `Date` or a `bigint`.
- `its output can be null; nullability belongs in the SDL`: remove `.nullable()`, and make the field nullable in the SDL. For free-form JSON, see [Store free-form JSON in an object](#store-free-form-json-in-an-object).
- `its output must pass the schema again`: make the transform return a value of the input type.

For the full lists, see [Return JSON that the schema accepts again](#return-json-that-the-schema-accepts-again).

### `defineScalar` throws "Cannot define scalar"

```text
Cannot define scalar "Iban": the example fails the schema: ✖ Invalid string: must match pattern /^[A-Z]{2}\d{2}/
Cannot define scalar "Count": the schema accepts a missing value; nullability belongs in the SDL.
```

The first error means `example` fails the schema. Change the example to a value the schema accepts. The second comes from a schema with `.optional()`, `.nullish()`, `.default()` or `.prefault()` that skipped the type check, for example through a cast, or that sits in a union. Remove the modifier and make the field nullable in the SDL. Other messages name an invalid or reserved name, or an unknown input key. See [Name the export after the scalar](#name-the-export-after-the-scalar).

### The host refuses a value with "the schema output is not JSON"

```text
Iban: the schema output is not JSON: 7n
```

The schema returned a value that JSON can't hold unchanged, such as a `bigint`, a `Date`, `-0` or an object property set to `undefined`. TypeScript refuses a `bigint` or `Date` output, unless it comes from an `any` inside an object or the schema skipped the type check. Return a JSON value instead. For `-0`, the client must send `0`.

### The host refuses a value with "the schema must accept its own output unchanged"

```text
Bang: the schema must accept its own output unchanged, but "abc!" parses to "abc!!".
```

A transform in the schema changes its own output each time it runs. Change the transform so that running it on its output returns the same value. When the message ends with `fails it:`, the schema refuses its own output. Make the output a valid input of the schema.

### A custom subgraph fails with an unknown type

```text
Unknown type "Iban".
```

No loaded package registers `Iban`. Check that `scalars/index.ts` exports it and that `package.json` has the `./scalars` export. For an installed package, check that `ph build` ran before you published it. If the host refused the scalar, it logged a `Failed to load scalars from <package>:` warning with the reason.

### `ph build` fails with "Document models and scalars run in Connect and on every host"

```text
scalars/index.ts imports <package>, which needs the WebAssembly module <file>. Document models and scalars run in Connect and on every host: use it from a subgraph, processor or piece instead.
```

The scalar imports a package that can't run in Connect. Move the validation that needs the package into a subgraph.
