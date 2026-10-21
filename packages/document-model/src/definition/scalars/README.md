# Scalar catalog

This directory holds the 21 catalog scalars, such as `PHID`, `Amount_Money`, and `DateTime`, and the `defineScalar` and `defineInternalScalar` that declare them. Each catalog scalar is declared once, in `declarations/`. `defineScalar` is also part of the author API: a package declares its own scalars with it, and a code-first model or subgraph references one through the factory it returns. See [Package scalars](#package-scalars).

20 of the catalog scalars are author scalars, which a document model or subgraph may reference. `JSONObject` is an internal scalar, which only the reactor host declares. A subgraph can reference it and a document model cannot. See [Internal scalars](#internal-scalars).

## Where each part lives

- `declarations/` has one file per built-in scalar. `declarations/index.ts` lists them in catalog order, and `declarations/amounts.ts` holds what several amount scalars share.
- `declaration.ts` defines `ScalarDeclaration`, the object a declaration file writes. The TSDoc on each field states what it means and its default. `withDefaults` fills every default except `coercion`. When a declaration omits `coercion`, `defineScalar` derives one with `deriveCoercion` from `coercion.ts`.
- `define-scalar.ts` compiles one declaration. `defineScalar` returns a field factory, and `defineInternalScalar` returns an `InternalScalar`. Both carry the resolved declaration, the wire definition, and the binding.
- `coercion.ts` builds GraphQL coercions, and `scalar-literal.ts` defines the literal grammar that `parseLiteral` reads.
- `catalog.ts` assembles the built-in catalog, extends it with package declarations, and exposes each author factory on `ph` with a `ph.` role. It exposes each internal scalar on `subgraphScalars` with a `subgraphScalars.` role. `emit.ts` turns a catalog into the strings codegen writes.
- `definition-shape.ts` checks the wire definition a package scalar reference carries, for both wire-shape validators.
- `package-scalars.ts` keeps the bindings of the package scalars each compiled model declares, for the GraphQL host.

## Declare a scalar

A declaration needs five fields: `name`, `description`, `representation`, `validator`, and `zodSource`. Every other field has a default.

```ts
export const phidScalar = defineScalar({
  name: "PHID",
  description: "An opaque Powerhouse identifier.",
  representation: "string",
  validator: z.string(),
  zodSource: "z.string()",
  zero: { kind: "value", value: "" },
});
```

`validator` and `zodSource` state one rule twice. The first validates `ph` fields at runtime, and the second is the source text generated packages validate with. Nothing compares the two, so change them together.

## What happens at import

`defineScalar` runs when its declaration file is imported, once per process:

1. `parseScalarDeclaration` copies the object, applies the defaults, and checks every field. A malformed declaration throws `PH-SCALAR-DECLARATION-INVALID` or `PH-SCALAR-ZERO-VALUE-INVALID`.
2. `defineScalar` builds the definition, the binding, and the factory. `defineInternalScalar` builds the same definition and binding, and returns an `InternalScalar` instead of a factory. The definition's digest is part of the catalog digest. Whether a scalar is internal is not part of the definition, so it does not change the digest.

Every field use the factory makes carries the binding. That is how the compiler tells a package scalar from a catalog one without a registry.

## Add a built-in scalar

1. Create `declarations/<name>.ts` and declare the scalar with `defineScalar`. For an internal scalar, use `defineInternalScalar` instead.
2. Append it to `builtInScalars` in `declarations/index.ts`. The order is part of the catalog digest, so a new scalar goes at the end.
3. Add the name to `PowerhouseScalarName` in `packages/shared/document-model/definition-types.ts`. For an internal scalar, add it to `InternalScalarName` instead. A type test in `scalar-catalog.test.ts` fails when a name is in the wrong one.
4. Add the scalar's cases to `SCALAR_CASES` in `test/definition/scalar-cases.ts`. The package does not typecheck until you do.
5. From `packages/document-model`, run `pnpm exec tsx --conditions=source test/definition/regenerate-scalar-inventory.ts` to regenerate the digest golden.
6. Run the tests under `test/definition/` whose names start with `scalar`. The ones that pin the list of names fail until you add the new name to them.

Codegen, attachments, and the GraphQL host read the catalog, so none of them needs a change.

## Internal scalars

An internal scalar is a catalog scalar that only the reactor host declares. A subgraph can reference it through `subgraphScalars`, because the host declares and serves it for every subgraph. A document model cannot reference it, because codegen and attachments have no mapping for it. The catalog declares one with `defineInternalScalar`, and everything that treats it differently reads that marking through the catalog:

- `defineInternalScalar` returns an `InternalScalar`, a frozen record with the declaration, definition, and binding, and no call signature. No package entry point exports `defineInternalScalar`, so only the compiler catalog declares internal scalars. A declaration passed to `defineScalar` that sets `visibility` throws `PH-SCALAR-DECLARATION-INVALID`.
- `subgraphScalars` wraps each internal scalar in a field factory with its catalog binding, as `subgraphScalars.JSONObject()`. `document-model` exports it beside `ph`, and it is not a member of `ph`, so a document model's autocomplete never offers it.
- `scalarCatalog.names` lists every catalog scalar. `scalarCatalog.authorNames` lists the author scalars and `scalarCatalog.internalNames` the internal ones, each in catalog order. `buildScalarCatalog` extends a base with author declarations only, and keeps the base's internal scalars internal.
- `isReferenceableScalarName` accepts the GraphQL built-ins and `authorNames`, and `REFERENCEABLE_SCALAR_NAMES` lists them. `isInternalScalarName` accepts `internalNames`. `isHostScalarName` accepts both. A package scalar cannot take any of these names.
- Every document-model check refuses an internal scalar with the diagnostic `internalScalarDiagnostic` builds: code `PH-SCALAR-INTERNAL`, naming `ph.Unknown()` and `ph.object(...)` as the repair, and `subgraphScalars` for a subgraph. The checks are the `ph` getter, the descriptor walk, the document-model wire-shape validator, the schema-first adapter, and `ph scalar inspect`.
- `ph` has no property for an internal scalar in its type, so `ph.JSONObject()` does not compile. At runtime the property is a non-enumerable getter that throws.
- The descriptor walk takes a policy. The document-model compiler refuses a field that carries an internal scalar's catalog binding, including a `subgraphScalars` field from another copy or release of this package. The subgraph compiler accepts it, lists the scalar in the definition's `scalars` as `powerhouse.catalog#JSONObject`, and the subgraph wire-shape validator accepts that reference. Both still refuse an internal scalar named with no binding. An older copy of this package refuses the subgraph at compile time and in the wire check with `PH-SCALAR-INTERNAL`.
- Codegen maps `authorNames` only, so a schema that references `JSONObject` fails to generate. Attachments declares `authorNames` only, so stored schema-first SDL that declares `scalar JSONObject` still parses for attachments. The schema-first adapter refuses it, declared or not.
- The reactor host declares every name. `hostScalarResolvers` binds each name in `internalNames` to its own coercion, except a pinned one: `JSONObject` keeps `GraphQLJSONObject`. A subgraph's own `scalar JSONObject` is dropped at assembly, so the host's declaration and coercion serve it.

## Package scalars

A package scalar is any scalar `defineScalar` compiled that the catalog does not hold. A package declares it in its own source and uses the factory in its models and subgraphs:

```ts
export const HexColor = defineScalar({
  name: "HexColor",
  description: "A six-digit hexadecimal color, such as #1a2b3c.",
  representation: "string",
  validator: z.string().regex(/^#[0-9a-f]{6}$/i),
  zodSource: "z.string().regex(/^#[0-9a-f]{6}$/i)",
});

const Label = ph.object("Label", { fields: { color: HexColor() } });
```

- `DescriptorWalk` in `structured.ts` reads the binding off each scalar field use. A binding some copy of the catalog declared (`isCatalogBinding`) is a catalog scalar, even when that copy is another release. Any other binding is a package scalar, unless its name is a catalog scalar, a GraphQL built-in, or a named type, which is an error.
- The specification lists each package scalar after the catalog ones, by name, as `{ name, implementation: "package#<name>", coercionProfile, definition }`. A typed subgraph lists it the same way with `graphQLProfile: "declared-coercion-v1"`.
- `materialize.ts` records the package scalar bindings of every version in the model's definition with `recordPackageScalars`. The GraphQL host reads them with `packageScalarsOf`, declares each scalar with its description under the model's prefix (`Todo_HexColor`), as it serves the model's types, and binds it to its own coercion. A typed subgraph's package scalar keeps its name.
- `checkDefinitions` accepts an exported package scalar as a `scalar` definition and refuses two different package scalars under one name in one package.

Two copies of one declaration, such as the same module bundled into a model and into a subgraph, produce two bindings with one definition and one `zodSource`. `sameScalar` treats them as one scalar. It cannot compare validators, so two declarations that differ only there are one scalar to the compiler.

## Change an existing scalar

Editing a declaration changes its definition digest, and a validator change also changes which stored operations replay without error. The inventory test fails until you regenerate the golden. Treat the edit as a change to stored-document validation, not a refactor.

## Tests

The cases each scalar is tested with live in `test/definition/scalar-cases.ts`, as an `accepts` and a `rejects` list per scalar. `test/definition/scalar-declarations.test.ts` runs every case through the validator, `parseValue`, `parseLiteral`, and `serialize`. It also checks that an accepted JSON value parses to the same JSON, and that a persistable scalar accepts no non-JSON value.

Eleven built-ins reproduce a document-engineering 1.40 behavior where a path disagrees with the case's group. For example, five amount scalars parse only float literals even though their validators accept integers. Such a case lists each of those paths in `recordedDifferences`, with the id of the entry in `test/definition/scalar-recorded-differences.ts` that records why. The test fails when a path disagrees and `recordedDifferences` does not list it, or when it lists a path that agrees.
