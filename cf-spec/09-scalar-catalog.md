# The compiler-owned scalar catalog

The declaration Interface, conformance contract, and registration path are fixed. Scalar authoring is
internal to the framework, and author-declared scalars are `DEFERRED` with a rejection rule. Delivery
statements below describe the pre-implementation baseline; current catalog evidence is recorded in
[the delivery tracker](./10-delivery-tracker.md).

Chapter 01 fixes which scalars exist and how a field uses one. This chapter fixes how the compiler
owns scalar metadata: one declaration Interface for built-in scalars, immutable validation and
GraphQL profiles, and a conformance contract that measures current behavior before any stricter
profile can ship.

## Current behavior has two independent scalar paths

The current tree declares scalars in one place and implements them in another, and nothing owns the
correspondence.

`buildSubgraphSchemaModule` registers `JSONObject` and nothing else
(`packages/reactor-api/src/utils/create-schema.ts:86-99`), while the document-model subgraph SDL
splices in all 17 package typedefs and a separate `AttachmentRef` declaration
(`packages/reactor-api/src/utils/create-schema.ts:224-227`). All 17 package scalars and
`AttachmentRef` therefore use graphql-js default identity coercion in the current host. The package's
exported resolver record cannot be spread to repair that without changing behavior. Six resolver keys
also disagree with their SDL names because the underscore amount scalars use module-style keys such as
`AmountMoney` instead of `Amount_Money`
(`packages/codegen/node_modules/@powerhousedao/document-engineering/dist/src/scalars/graphql/scalars.js:46-65`).

Four consumers derive scalar facts independently. The GraphQL host reads `typeDefs`
(`packages/reactor-api/src/utils/create-schema.ts:6`), codegen reads `generatorTypeDefs` and
`validationSchema` and declares four local properties
(`packages/codegen/src/codegen/graphql.ts:60-79`), the attachment compiler hand-duplicates those same
four names (`packages/reactor-attachments/src/reference-index/attachment-schema-compiler.ts:30-36`),
and the model editor seeds a schema from the typedef list
(`packages/powerhouse-vetra-packages/editors/document-model-editor/constants/documents.ts:1-14`). One
scalar fact is maintained in five places under three key conventions.

Only three of the four codegen names are additional catalog names: `Unknown`, `Address`, and
`AttachmentRef`. The package spread overwrites codegen's local `DateTime` property, so the installed
`DateTime` entry is canonical. Together with the 17 package names and `JSONObject`, the current unique
inventory has 21 names.

Two consumers depend on a member that no module implements. `BasePHScalar.getDefaultValue` is
optional and unimplemented across all 17 modules, yet the migration planner
(`packages/codegen/src/file-builders/document-model/upgrade-migration.ts:195-203`) and the model
editor (`packages/powerhouse-vetra-packages/editors/document-model-editor/utils/helpers.ts:409`) both
call it. Adding a scalar-typed field in a new model version therefore produces a manual migration plan
for every scalar.

Name loss is silent in both directions. A subgraph that declares a scalar has that declaration
stripped (`packages/reactor-api/src/utils/create-schema.ts:296`) while its resolver still reaches the
schema module through the spread at `packages/reactor-api/src/utils/create-schema.ts:91-93`, so the
type ends up registered and undeclared. A repeated scalar name is dropped keep-first
(`packages/reactor-api/src/utils/create-schema.ts:66-84`). Neither path reports a diagnostic.

The current validation path and the current GraphQL path are different behaviors. Generated model
validation uses the installed Zod schemas and codegen mappings. GraphQL uses default identity coercion
for the names above. The first catalog must preserve both. Activating the installed GraphQL coercers or
tightening model validation belongs to a later scalar release.

These facts point to one missing Module: nothing owns a scalar name together with its validation and
host-binding profiles. The catalog below is that Module.

## The declaration Interface

`defineScalar` declares one scalar. It is compiler-internal and is deliberately absent from the
author Interface in [08-implementation-plan.md](./08-implementation-plan.md).

```ts
type ScalarRepresentation =
  | "string"
  | "number"
  | "boolean"
  | "json-object"
  | "json"
  | "opaque";

type ScalarZero =
  | { readonly kind: "value"; readonly value: JsonValue }
  | { readonly kind: "none"; readonly reason: string };

type ScalarValidationProfile = "document-engineering-1.40" | "catalog-v1";

type ScalarGraphQLProfile = "legacy-graphql-default-v1" | "catalog-v1";

type ScalarVectorValue =
  | { readonly kind: "json"; readonly value: JsonValue }
  | { readonly kind: "non-json"; readonly tag: "undefined" }
  | {
      readonly kind: "non-json";
      readonly tag: "bigint";
      readonly decimal: string;
    }
  | { readonly kind: "non-json"; readonly tag: "date"; readonly iso: string }
  | {
      readonly kind: "non-json";
      readonly tag: "map";
      readonly entries: readonly (readonly [JsonValue, JsonValue])[];
    }
  | {
      readonly kind: "non-json";
      readonly tag: "upload";
      readonly fixtureId: string;
    };

type ScalarVectorCase = {
  readonly id: string;
  readonly input: ScalarVectorValue;
};

type ScalarLiteralNode =
  | { readonly kind: "string"; readonly value: string }
  | { readonly kind: "int"; readonly value: string }
  | { readonly kind: "float"; readonly value: string }
  | { readonly kind: "boolean"; readonly value: boolean }
  | { readonly kind: "null" }
  | { readonly kind: "enum"; readonly value: string }
  | { readonly kind: "list"; readonly values: readonly ScalarLiteralNode[] }
  | {
      readonly kind: "object";
      readonly fields: readonly {
        readonly name: string;
        readonly value: ScalarLiteralNode;
      }[];
    }
  | { readonly kind: "variable"; readonly name: string };

type ScalarCoercion<TBase> = {
  readonly parseValue: (input: unknown) => TBase;
  readonly parseLiteral: (node: ScalarLiteralNode) => TBase;
  readonly serialize: (value: unknown) => unknown;
};

type ScalarDeclaration<TName extends string, TBase> = {
  readonly name: TName;
  readonly coercionProfile: ScalarValidationProfile;
  readonly representation: ScalarRepresentation;
  readonly persistable: boolean;
  readonly description: string;
  readonly validator: z.ZodType<TBase, TBase>;
  readonly coercion: ScalarCoercion<TBase> | "derive";
  readonly zero: ScalarZero;
  readonly accepts: readonly [ScalarVectorCase, ...ScalarVectorCase[]];
  readonly rejects: readonly [ScalarVectorCase, ...ScalarVectorCase[]];
};

type ScalarValidationOptions = {
  readonly required?: boolean;
};

type ScalarFactory<TName extends string, TBase> = {
  (options?: ScalarValidationOptions): FieldDescriptor<TBase, TBase>;
  readonly role: `field-use factory; call it, as ${TName}({ required: true })`;
  readonly kind: "scalar-factory";
  readonly declaration: ScalarDefinition;
};

declare function defineScalar<const TName extends string, TBase>(
  declaration: ScalarDeclaration<TName, TBase>,
): ScalarFactory<TName, TBase>;
```

`parseLiteral` receives `ScalarLiteralNode` rather than a `graphql-js` `ValueNode`. A declaration
travels into model packages, and those packages must not need `graphql-js`
([chapter 01](./01-field-builder.md)). The literal grammar is closed and mirrors the GraphQL literal kinds
the catalog supports, so the host Adapter converts once per literal without the declaration importing
a GraphQL type. A `variable` node reaching `parseLiteral` is always a rejection: GraphQL resolves
variables before literal coercion, and an accepted nested variable is how a literal path silently
diverges from a variable path.

`ScalarValidationOptions` has one member. Every scalar factory accepts the same `required` option,
and no representation adds its own validation attributes. `FieldDescriptor` is the field-use type
chapter 01 defines.

`description` is required. A scalar has no field structure to explain it, so the description is the
entire contract an introspecting agent reads.

`accepts` and `rejects` are required and nonempty. Each case has a stable ID and a tagged input. JSON
inputs carry their value directly. Each non-JSON variant has enough data for one closed runner
constructor. The runner creates `BigInt(decimal)`, `new Date(iso)`, `new Map(entries)`, or the named
upload fixture; `undefined` needs no data. The runner rejects an unknown tag or extra property. This
avoids implementation-defined prose summaries and lets the compatibility profile record the current
`Unknown` and `Upload` behavior.

### The factory result

`defineScalar` returns a field-use factory, so a catalog scalar reads exactly as chapter 01 already
specifies in [chapter 01](./01-field-builder.md):

```ts
issuerId: ph.OID({ required: true }),
description: ph.String({ required: true }),
```

The factory carries the same member set as a `FieldDescriptor` with a distinct instructional `role`
literal, following the type-versus-field-use device in [chapter 01](./01-field-builder.md). A bare factory token in a field slot
is a function and is already unassignable, but a missing-property error carries no repair. The `role`
literal makes the primary `tsc` error name the fix:

```text
Type '"field-use factory; call it, as ph.OID({ required: true })"'
  is not assignable to type '"field use"'.
```

The runtime twin is `PH-SCALAR-FACTORY-AS-FIELD`, parallel to `PH-DEF-TYPE-AS-FIELD`.

### Derived coercion

`coercion: "derive"` builds `parseValue`, `parseLiteral`, and `serialize` from `representation` and
`validator`. A compatibility declaration may use it only when the derived functions reproduce the
recorded installed outcomes, as `OID` does in the review fixture. Other compatibility members use
explicit validation bindings from codegen and `@powerhousedao/document-engineering`. GraphQL still
binds through `legacy-graphql-default-v1`; `derive` never activates a stricter live GraphQL coercer.
New derived behavior belongs to the strict `catalog-v1` follow-up.

## Conformance

The compatibility and strict profiles have different pass conditions. Combining them would make the
first catalog repair behavior while claiming to preserve it.

For `document-engineering-1.40`, conformance checks each locked vector against the recorded outcome of
the current codegen validator and installed package module. A known difference between paths is an
exemption with stable case IDs and a digest. The declaration fails if a path changes from its recorded
outcome, if an unrecorded difference appears, or if a recorded difference disappears without the
separate X-scalar review. Agreement is not required because current behavior does not agree.

For `legacy-graphql-default-v1`, the GraphQL Adapter leaves ordinary package scalar names absent from
the resolver map, so the current graphql-js default behavior remains authoritative. It preserves
authored resolver entries and then installs the real `JSONObject` resolver in the current last-write
position. It synthesizes no package description, `specifiedByURL`, or package coercer. This is the
only GraphQL profile in the compatibility release.

The strict `catalog-v1` profile is a follow-up. When reopened, every strict declaration runs five
checks over the union of `accepts` and `rejects`:

1. Four-path agreement. `validator.safeParse`, `parseValue`, `parseLiteral`, and `serialize` agree on
   acceptance and on the canonical returned value. A literal case is built from the accepted value's
   representation.
2. Non-normalization. For every accepted value, `parseValue(x)` is canonically deep-equal to `x`.
   Both reducer validation passes discard the parsed copy ([chapter 02](./02-document-models.md)), so a
   normalizing coercion divides what was validated from what was stored.
3. JSON safety. Every accepted value of a `persistable` scalar is exact JSON under DEF-02. A
   violation is `PH-SCALAR-VALUE-NOT-JSON`.
4. Determinism. Two coercions of one value agree. With authored functions this is sampled over the
   declared vector, never proved. The chapter claims no more than that.
5. Absence rejection. `undefined` and `null` reject, so nullability stays a property of the field use
   and cannot leak into the scalar.

A failing strict check rejects the declaration with the matching `PH-SCALAR-*` code from
[08-implementation-plan.md](./08-implementation-plan.md). Compatibility-profile drift uses the
existing `PH-SCALAR-CONFORMANCE-FAILED` code and names the profile, path, and case ID. Conformance runs
once per process at catalog construction, not per request.

The limit is worth stating plainly: five checks over a declared vector prove behavior on that vector,
not on every value. The vector is authored by the same person as the coercion, so it is a
self-consistency proof, not an independent one. It catches the disagreement class that this repository
actually contains, which is a coercion path that was written once and never compared against its
siblings.

## Recorded compatibility differences

The initial exemption list records the complete measured differences relevant to validation and
coercion:

| Scalars                                                     | Current difference                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Amount`                                                    | Its exported TypeScript source says `value` is optional while Zod requires a finite number. Its installed literal parser accepts only `FloatValue` for `value`, while validation and variable input accept integer-valued numbers.                                                                     |
| `Amount_Fiat`                                               | Its installed literal parser accepts only `FloatValue` for `value`, while validation and variable input accept integer-valued numbers.                                                                                                                                                                 |
| `Amount_Money`, `Amount_Percentage`, `Amount_Tokens`        | Their installed literal parsers accept only `FloatValue`, while validation and variable input accept integer-valued numbers.                                                                                                                                                                           |
| `Amount_Crypto`, `Amount_Currency`                          | Zod and variable input accept any string `value`; the installed literal parsers accept only numeric strings.                                                                                                                                                                                           |
| `Amount`, `Amount_Fiat`, `Amount_Crypto`, `Amount_Currency` | Their installed variable and serialization functions return Zod's parsed object, which strips unknown keys, while reducer validation discards the parsed copy and retains the raw object.                                                                                                              |
| `Unknown`                                                   | Codegen maps it to TypeScript `unknown` and `z.unknown()`, so validation accepts `undefined`, `BigInt`, `Date`, `Map`, custom objects, and ordinary JSON values.                                                                                                                                       |
| `Upload`                                                    | The installed module exports no runtime Zod schema and supplies `stringSchema = "z.any()"`; current codegen can place it in model SDL even though its GraphQL runtime value is not JSON. The current host does not install `GraphQLUpload`, so the declared scalar still has default GraphQL coercion. |

The installed evidence is `Amount.js:3-45`, `AmountFiat.js:3-45`, `AmountMoney.js:3-32`,
`AmountPercentage.js:3-30`, `AmountTokens.js:3-30`, `AmountCrypto.js:4-52`,
`AmountCurrency.js:4-52`, and `File.js:1-10` under
`packages/codegen/node_modules/@powerhousedao/document-engineering/dist/src/scalars/graphql/`.
Codegen's `Unknown` and local scalar mappings are at `packages/codegen/src/codegen/graphql.ts:60-75`.

The six underscore amount resolver-key mismatches are registration metadata differences. The
SDL-keyed catalog normalizes those keys without installing their coercers in the compatibility
release.

An exemption names the scalar, profile, disagreeing paths, and stable vector case IDs. Its digest is
SHA-256 over the canonical encoding of
`{ name, profile, paths, caseIds }`, using those exact property names. The conformance run reproduces
the recorded outcomes instead of skipping the cases.

Three rules keep the list from becoming an escape hatch:

- Only the compiler-owned catalog may carry an exemption. A declaration reaching the catalog through
  any other package identity cannot have one.
- A new declaration may never add an entry. The list is closed at the complete inventory above when
  the compatibility catalog first ships.
- X-scalar retires entries one at a time, against the chapter 01 X-scalar traffic report
  contract. Retiring the last entry deletes the list.

The list is versioned review data with a digest, so shrinking it is a visible compatibility event and
growing it is a specification change rather than a code change.

## Structured definition contract

A declaration produces versioned data. Coercion functions never enter it, because functions cannot
enter the canonical encoding ([chapter 01](./01-field-builder.md)). What the definition records is
observable identity: enough to digest, to store in a model specification, and to compare across
releases.

```ts
type ScalarDefinition = {
  kind: "powerhouse.scalar";
  formatVersion: 1;
  name: string;
  representation: ScalarRepresentation;
  persistable: boolean;
  description: string;
  zero: ScalarZero;
  coercion: {
    source: "derived" | "explicit";
    exemption: {
      profile: "document-engineering-1.40";
      paths: readonly string[];
      caseIds: readonly string[];
      digest: `sha256:${string}`;
    } | null;
  };
  vector: {
    accepts: readonly ScalarVectorCase[];
    rejects: readonly ScalarVectorCase[];
    acceptanceDigest: `sha256:${string}`;
  };
  coercionProfile: ScalarValidationProfile;
};
```

The shape is closed by a V1 JSON Schema that must reject unknown properties before B14 evidence can
pass; no such schema exists in the pinned tree yet. Digests use the
canonical encoder in [01-field-builder.md](./01-field-builder.md#deterministic-output-without-generated-artifacts).
A declaration carries no digest of itself; the catalog digests each definition and the set, as every
other versioned definition in this specification does. `acceptanceDigest` is not self-referential. It
is SHA-256 over the canonical encoding of `{ accepts, rejects }` exactly as stored, so it changes when
the partition, case ID, tag, or value changes and not when a description is corrected. Tagged
non-JSON cases have one portable wire shape and one runner constructor; prose summaries never enter a
digest.

The normative review vector is [`fixtures/v1/scalar-definition.json`](./fixtures/v1/scalar-definition.json).
It holds two declarations rather than one, because a catalog is a set and one instance cannot show
both coercion sources: `OID` is derived and unexempt, while `Amount_Crypto` is explicit and carries one
recorded compatibility difference. The fixture also contains a tagged `undefined` rejection so the
non-JSON wire form is reviewable. The format is immutable once published. A later data format uses a
new `formatVersion` and Adapter.

## Positions and persistence

`persistable` describes the strict follow-up position rule. It does not retroactively narrow a
migrated `document-engineering-1.40` definition.

A `persistable` scalar is legal in document state, action input, and every subgraph position. A
non-`persistable` scalar is legal only in subgraph argument and output positions; reaching one from
state or action input is `PH-SCALAR-POSITION-UNSUPPORTED`.

`Upload` is the only non-`persistable` member. New strict-profile definitions may use it only in
subgraph argument and output positions. The current codegen mapping is `File` with `z.any()` source,
and existing schemas can place it in state or action input. A migrated compatibility definition keeps
that position and validation behavior until X-scalar supplies usage evidence and a versioned
migration. The catalog must diagnose the legacy position in its report, but it must not reject or
rewrite the historical module.

Under `document-engineering-1.40`, `Unknown` remains TypeScript `unknown` with `z.unknown()`. The
recursive-JSON meaning and JSON-safety check belong to the strict `catalog-v1` follow-up. A migrated
historical module must retain the wider validator even when later serialization or hashing cannot
represent a value it accepted.

The five GraphQL specification built-ins are outside the catalog. `ID`, `String`, `Boolean`, `Int`,
and `Float` are part of the type grammar rather than declarations, so they have no `ScalarDefinition`
and cannot be exempted, redeclared, or shadowed.

## Accepted-set evolution

A change to a registered scalar's accepted set is a breaking framework change. It is released under a
major version and recorded in the catalog changelog with the scalar name and the direction of the
change. The catalog digest makes the change detectable from artifacts rather than from release notes.

A version number communicates a break. It does not repair one. P2 compares operation outcome and
error text at every prefix, and R3 makes successful and failed validation persisted behavior.
Narrowing can turn a historical success into a failure. Widening can turn a historical validation
failure into a success because remote or synchronized invalid operations remain in history and the
reducer validates them again. Both directions can change replay.

Every finalized historical model module therefore pins its scalar binding by name and validation
profile. A catalog update cannot replace that binding in place. Changing an accepted set requires a
new profile, a document-model version and upgrade path where stored state needs conversion, and cold
replay that includes successful and rejected operations. X-scalar traffic evidence may justify a
transition, but a major framework version alone does not discharge it.

`representation`, `persistable`, and `zero` are immutable for a registered name and profile. A
published upgrade plan's output must stay reproducible, so a zero value cannot change under a profile
that models already reference.

Detection needs no new artifact. The `accepts` and `rejects` vectors every declaration already carries
are the accepted-set sample, and `acceptanceDigest` changes exactly when their partition does.

## Host registration

The catalog is a Module. Its Interface is small and mentions no GraphQL type:

```ts
type ScalarBinding = {
  readonly definition: ScalarDefinition;
  readonly validationProfile: ScalarValidationProfile;
  readonly validator: z.ZodType;
  readonly coercion: ScalarCoercion<unknown>;
  readonly typescriptType: string;
  readonly zodSource: string;
  readonly typedef: `scalar ${string}`;
};

interface ScalarCatalogInterface {
  resolve(
    name: string,
    validationProfile: ScalarValidationProfile,
  ): ScalarBinding | undefined;
  readonly names: readonly string[];
  readonly validationProfiles: readonly ScalarValidationProfile[];
  readonly digest: `sha256:${string}`;
}

type ScalarCatalogReport = {
  kind: "powerhouse.scalar-catalog";
  formatVersion: 1;
  catalogDigest: `sha256:${string}`;
  entries: readonly {
    name: string;
    validationProfile: ScalarValidationProfile;
    definitionDigest: `sha256:${string}`;
    coercionSource: "derived" | "explicit";
    exempted: boolean;
  }[];
  diagnostics: readonly DefinitionDiagnostic[];
};

declare function buildScalarCatalog(
  declarations: readonly ScalarDeclaration<string, unknown>[],
): { catalog?: ScalarCatalogInterface; report: ScalarCatalogReport };
```

Materializing `GraphQLScalarType` values is a separate step,
`bindGraphQLScalars(catalog, graphQLProfile)`, which runs only in a GraphQL host. The compatibility
release passes `legacy-graphql-default-v1`; `catalog-v1` is unavailable until the X-scalar follow-up.
Keeping GraphQL binding out of the catalog Interface lets a browser build the same validation catalog
for editor field rendering and migration zero values without pulling `graphql-js` into its bundle,
which K2 requires and the chapter 01 rule on `graphql-js` motivates.

`ScalarCatalogReport` is returned whether or not a catalog is produced, so a rejected candidate
still reports which declaration failed and why. It is a report envelope under the usual conventions; a
later shape uses a new `formatVersion` and Adapter.

`names` is the fixed SDL-name order that chapter 01 already promises for compiler-owned scalar
declarations. `validationProfiles` is a fixed compatibility order. Resolution is `O(1)` per
name-and-profile pair after construction, and construction is `O(S · V)` in declarations and vector
size, once per process.

The catalog indexes validation bindings by `(name, validationProfile)`. Two declarations for the same
pair are `PH-SCALAR-DUPLICATE-NAME`. The same SDL name may have several immutable validation profiles
only when its typedef and representation metadata agree. `names` contains that SDL name once. This is
how historical modules retain an old validator while a later release adds a new profile. GraphQL
assembly still permits only one scalar declaration and one selected GraphQL profile per schema.

### Depth

Behind four members sit the 17 installed names keyed by their actual SDL name, the private
`document-engineering-1.40` validation profile, the three additional codegen names, `JSONObject`, the
legacy GraphQL binding, the zero-value table, the exemption list, conformance, deterministic
declaration order, and the digest.

The Depth is measurable as eliminated key conventions. One scalar fact currently lives in five places
under three conventions. One name-and-profile lookup keeps historical validation local to the catalog
without pretending the current paths agree.

### The Seam and its Adapters

The Seam is `ScalarDeclaration` into `ScalarBinding`. It has two Adapters when the catalog first
ships, which is what distinguishes a real Seam from a hypothetical one:

1. `DocumentEngineeringScalarAdapter` normalizes the installed package, whose modules carry a
   `GraphQLScalarTypeConfig`, a Zod schema, a TypeScript type as a string, and a Zod source as a
   string, under three key conventions.
2. `CompilerScalarDeclarationAdapter` takes declarations written directly against this chapter.

The second exists so a new built-in scalar does not have to be routed through the installed package to
be registered. Both are live when the catalog ships.

Node and browser are not a third Adapter. Each host already supplies a package-import Adapter and both
feed one normalizer, matching the pattern in
[08-implementation-plan.md](./08-implementation-plan.md#definition-source-normalization-and-later-logical-selectors).
Counting deployment targets as implementations is how a hypothetical Seam gets built.

### The current host Adapter

`buildSubgraphSchemaModule` (`packages/reactor-api/src/utils/create-schema.ts:86-99`) remains the only
place in the current tree that registers a scalar implementation. In core v1 its host Adapter
reproduces the current assembly exactly:

- the resolver map is `{ ...authoredResolvers, JSONObject: GraphQLJSONObject }`; package scalar
  coercers are not installed, authored scalar resolvers keep their current effect, and the real
  `JSONObject` resolver keeps its current last-write position
- the SDL splice retains the current `JSONObject`, `AttachmentRef`, and 17 package typedef sequence;
  catalog metadata may verify that inventory but cannot reorder it
- `stripScalarDefinitions` keeps removing every authored scalar declaration before assembly
- `dedupeTypeDefinitions` keeps its current keep-first behavior for all six definition kinds,
  including scalars

`bindGraphQLScalars(catalog, "legacy-graphql-default-v1")` therefore materializes only the binding
needed to reproduce this Adapter. For ordinary custom scalars, omission from the resolver map is the
binding because graphql-js supplies the current default coercion. `PH-SCALAR-UNREGISTERED` and
`PH-SCALAR-RESOLVER-SHADOWED` may appear as report-only diagnostics, but they cannot remove a key,
change spread order, reject a legacy-equivalent schema, or change the assembled resolver value. The
strict catalog may own scalar declarations, resolver keys, and deduplication only in X-scalar.

### Lifecycle

The compiler builds catalog metadata once for a checked package artifact. The GraphQL host consumes
the selected profile through its current construction and registration lifecycle. Core v1 adds no
prepare stage, active-generation pointer, eviction rule, or health-report field. A host may record the
catalog digest in diagnostics, but that record cannot participate in acceptance or replacement until
the later host lifecycle exists. A catalog update cannot replace an historical model's validation
profile in place.

## Why authoring stays internal

The public authoring Interface does not accept scalar declarations. A scalar's validator sits on the
reducer path before authored code because remote, archived, and synchronized actions bypass the
creator ([chapter 02](./02-document-models.md)). Any accepted-set change can therefore change replay,
including a widening that makes a historical rejected operation succeed. Keeping that compatible
across independently released third-party packages needs a compatibility owner per scalar, which core
v1 does not have.

The reusable constructs cover the schema shapes authors use today:

| Need                            | Construct                                           |
| ------------------------------- | --------------------------------------------------- |
| A string or number              | `ph.String`, `ph.Int`, or `ph.Float`                |
| A closed value set              | `ph.enum`                                           |
| A structured value              | `ph.object` and `ph.input`, reached with `ph.ref`   |
| A domain-named structured value | `ph.object`, which prints its own GraphQL type name |
| A domain validation rule        | Reducer or resolver implementation                  |

Core v1 has no author construct for an IBAN-shaped string, a length-limited string, or a bounded
number. Adding one would put new validation on the replay path. Authors use `String` and enforce the
business rule in reducer or resolver implementation, matching current document-model behavior. A
later version may reopen declarative validation with its own replay and migration contract.

An author-declared scalar root is refused with
`PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED`. The definition checker raises it when a
`DefinitionSource` resolves to a scalar declaration from a package identity other than the
compiler-owned catalog. Ordinary subgraph resolver keys retain their current assembly behavior.
A resolver key or stripped legacy scalar that the catalog does not own may produce a report-only
diagnostic; changing its host outcome belongs to X-scalar.

The reopening condition is recorded in [07-risks.md](./07-risks.md#deferred-extension-commitments). A
wider validator alone is not sufficient, and neither is a request for a nicer type name.

## Definition-time guarantees

The compatibility catalog reports stable diagnostics for:

- a declaration from a package identity that does not own the catalog
- a duplicate name-and-validation-profile binding, or incompatible metadata across profiles of one
  SDL name
- a reachable scalar name with no registered declaration
- a subgraph resolver key that introduces an unregistered scalar name
- an authored resolver key that shadows a registered name
- compatibility-profile drift from a recorded path outcome
- a missing or stale compatibility exemption
- a missing zero value, or a `kind: "value"` zero its own coercion rejects, both
  `PH-SCALAR-ZERO-VALUE-INVALID`
- an exemption on a declaration that may not carry one
- a new strict-profile use of a non-`persistable` scalar in state or action input

The strict `catalog-v1` follow-up additionally reports the five agreement failures, non-JSON accepted
values on a `persistable` declaration, normalizing coercion, and absence acceptance. Those diagnostics
must not reject a historical `document-engineering-1.40` binding whose recorded behavior contains the
same case.

Every code, its meaning, and its append-only rule live in the non-authorization catalog in
[08-implementation-plan.md](./08-implementation-plan.md).

## Performance contract

- Catalog construction is `O(S · V)` in declarations and declared vector size, once per process.
- Conformance never runs per request.
- `resolve` is `O(1)` by name and validation profile; `names` and `validationProfiles` are precomputed
  in fixed order.
- Coercion allocates no per-request profile cache.
- Reachability collection over a definition stays `O(V + E)` under C2.1 and is cached only for the
  current definition digest.
- Catalog metadata is built once per compiler process or input digest, never per request, subgraph,
  or document-model instance. Hosts consume it through their current lifecycle.

## Compatibility release and X-scalar

The first catalog release adds ownership and diagnostics without changing either current path.
`document-engineering-1.40` preserves generated-model validation, including `Unknown: z.unknown()`,
the current `Upload` position, object normalization inside installed coercers, and every recorded
literal disagreement. `legacy-graphql-default-v1` preserves live GraphQL default coercion and does not
activate the installed resolver map.

Historical modules resolve validation by name and profile. GraphQL hosts bind a separate GraphQL
profile. This split is necessary because today's validator behavior and today's live GraphQL behavior
come from different implementations.

`catalog-v1` is the strict follow-up. It may introduce recursive-JSON `Unknown`, confine `Upload`,
require four-path agreement and non-normalization, or install strict GraphQL coercers only through
X-scalar. That release needs scalar-by-scalar traffic evidence, a new immutable profile, historical
success-and-failure replay, and model upgrades where stored state needs conversion. B14 passing for the
compatibility catalog does not satisfy any part of X-scalar or authorize a definition to select the
strict profile.
