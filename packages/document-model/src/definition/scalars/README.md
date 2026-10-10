# Scalar catalog

This directory holds the 21 catalog scalars, such as `PHID`, `Amount_Money`, and `DateTime`, and the `defineScalar` that declares them. Each catalog scalar is declared once, in `declarations/`. `defineScalar` is also part of the author API: a package declares its own scalars with it, and a code-first model or subgraph references one through the factory it returns. See [Package scalars](#package-scalars).

## Where each part lives

- `declarations/` has one file per built-in scalar. `declarations/index.ts` lists them in catalog order, and `declarations/amounts.ts` holds what several amount scalars share.
- `declaration.ts` defines `ScalarDeclaration`, the object a declaration file writes. The TSDoc on each field states what it means and its default. `withDefaults` fills every default except `coercion`. When a declaration omits `coercion`, `defineScalar` derives one with `deriveCoercion` from `coercion.ts`.
- `define-scalar.ts` compiles one declaration into its field factory. The factory carries the resolved declaration, the wire definition, and the binding.
- `coercion.ts` builds GraphQL coercions, and `scalar-literal.ts` defines the literal grammar that `parseLiteral` reads.
- `catalog.ts` assembles the built-in catalog, extends it with package declarations, and exposes each catalog factory on `ph` with a `ph.` role. `emit.ts` turns a catalog into the strings codegen writes.
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
2. `defineScalar` builds the definition, the binding, and the factory. The definition's digest is part of the catalog digest.

Every field use the factory makes carries the binding. That is how the compiler tells a package scalar from a catalog one without a registry.

## Add a built-in scalar

1. Create `declarations/<name>.ts` and declare the scalar with `defineScalar`.
2. Append it to `builtInScalars` in `declarations/index.ts`. The order is part of the catalog digest, so a new scalar goes at the end.
3. Add the name to `PowerhouseScalarName` in `packages/shared/document-model/definition-types.ts`.
4. Add the scalar's cases to `SCALAR_CASES` in `test/definition/scalar-cases.ts`. The package does not typecheck until you do.
5. From `packages/document-model`, run `pnpm exec tsx --conditions=source test/definition/regenerate-scalar-inventory.ts` to regenerate the digest golden.
6. Run the tests under `test/definition/` whose names start with `scalar`. The ones that pin the list of names fail until you add the new name to them.

Codegen and the GraphQL host read the catalog, so neither needs a change.

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
- The specification lists each package scalar after the catalog ones, by name, as `{ name, implementation: "package#<name>", coercionProfile, definition }`. A code-first subgraph lists it the same way with `graphQLProfile: "declared-coercion-v1"`.
- `materialize.ts` records the package scalar bindings of every version in the model's definition with `recordPackageScalars`. The GraphQL host reads them with `packageScalarsOf`, declares each scalar with its description under the model's prefix (`Todo_HexColor`), as it serves the model's types, and binds it to its own coercion. A code-first subgraph's package scalar keeps its name.
- `checkDefinitions` accepts an exported package scalar as a `scalar` definition and refuses two different package scalars under one name in one package.

Two copies of one declaration, such as the same module bundled into a model and into a subgraph, produce two bindings with one definition and one `zodSource`. `sameScalar` treats them as one scalar. It cannot compare validators, so two declarations that differ only there are one scalar to the compiler.

## Change an existing scalar

Editing a declaration changes its definition digest, and a validator change also changes which stored operations replay without error. The inventory test fails until you regenerate the golden. Treat the edit as a change to stored-document validation, not a refactor.

## Tests

The cases each scalar is tested with live in `test/definition/scalar-cases.ts`, as an `accepts` and a `rejects` list per scalar. `test/definition/scalar-declarations.test.ts` runs every case through the validator, `parseValue`, `parseLiteral`, and `serialize`. It also checks that an accepted JSON value parses to the same JSON, and that a persistable scalar accepts no non-JSON value.

Eleven built-ins reproduce a document-engineering 1.40 behavior where a path disagrees with the case's group. For example, five amount scalars parse only float literals even though their validators accept integers. Such a case lists each of those paths in `recordedDifferences`, with the id of the entry in `test/definition/scalar-recorded-differences.ts` that records why. The test fails when a path disagrees and `recordedDifferences` does not list it, or when it lists a path that agrees.
