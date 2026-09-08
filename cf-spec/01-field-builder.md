# The `ph` field algebra

The field Interface and dependency contract are fixed. The scalar inventory and delivery statements
below describe the locked pre-implementation workspace. Current compiler evidence is recorded in
[the delivery tracker](./10-delivery-tracker.md).

One field declaration must carry enough information to produce:

- its input, output, and resolver-backing TypeScript types
- its Zod validator
- its GraphQL type reference and supported directives
- a structured definition used by model and subgraph compilers

The descriptor is the source of truth. Zod and SDL are outputs.

## Built-in scalar catalog inventory

The installed `@powerhousedao/document-engineering` 1.40.5 package contains 17 GraphQL scalar
modules. Its scalar files are byte-identical to the 1.40.1 copies. The table below records what each
module actually does and fixes the membership of the compiler-owned catalog.
[Chapter 09](./09-scalar-catalog.md) fixes how a member is declared and registered; this table fixes
which members exist. `Representation` records the current TypeScript and GraphQL value shape.
`Document fields` records whether the current generator accepts the scalar in document state and
action inputs. Core v1 does not add a JSON-safety restriction that the current generator lacks.

| Builder                                   | GraphQL name                                         | Representation | Document fields | Locked Zod behavior                                     |
| ----------------------------------------- | ---------------------------------------------------- | -------------- | --------------- | ------------------------------------------------------- |
| `PHID`, `OID`, `OLabel`, `Currency`       | same                                                 | `string`       | yes             | `z.string()`                                            |
| `EmailAddress`                            | `EmailAddress`                                       | `string`       | yes             | `z.email()`                                             |
| `EthereumAddress`                         | `EthereumAddress`                                    | `string`       | yes             | hexadecimal address regex                               |
| `URL`                                     | `URL`                                                | `string`       | yes             | `z.url()`                                               |
| `Date`, `DateTime`                        | same                                                 | `string`       | yes             | `z.iso.datetime()`                                      |
| `Money`, `Percentage`, `Tokens`           | `Amount_Money`, `Amount_Percentage`, `Amount_Tokens` | `number`       | yes             | `z.number()`                                            |
| `Amount`                                  | `Amount`                                             | `json-object`  | yes             | object with required finite `value` and optional `unit` |
| `AmountFiat`                              | `Amount_Fiat`                                        | `json-object`  | yes             | numeric value plus string unit                          |
| `AmountCrypto`, `AmountCurrency`          | underscore names                                     | `json-object`  | yes             | string value plus string unit                           |
| `Upload`                                  | `Upload`                                             | `opaque`       | yes             | codegen consumes its exported `z.any()` source string   |
| `Address`, `AttachmentRef`                | same                                                 | `string`       | yes             | codegen-owned mappings, not package scalar modules      |
| `Unknown`                                 | `Unknown`                                            | `unknown`      | yes             | codegen-owned `z.unknown()` mapping                     |
| `JSONObject`                              | same                                                 | `json-object`  | yes             | `graphql-type-json`, no package module                  |
| `ID`, `String`, `Boolean`, `Int`, `Float` | built-ins                                            | not applicable | not applicable  | GraphQL grammar, outside the catalog                    |

The table exposes defects that this project must not copy silently:

- The `Amount` exported TypeScript type makes `value` optional, while its Zod schema requires it.
- `AmountCrypto` and `AmountCurrency` accept arbitrary value strings in Zod, but their GraphQL
  literal parsers require a numeric string.
- The package resolver map uses non-SDL keys for underscore scalars, such as `AmountMoney` instead
  of `Amount_Money`.
- `Upload` does not provide the same runtime exports as the other scalar modules.

The catalog makes those facts inspectable but does not repair them. Core v1 routes every code-first
and migrated model through the `document-engineering-1.40` validation profile. That profile adapts
the installed Zod validators and current codegen-owned mappings without changing their TypeScript or
validation behavior. It records `parseValue`, `parseLiteral`, and serialization outcomes as evidence,
but the GraphQL host does not install those package coercers. Authors cannot select another profile.

For `Amount`, the exported TypeScript string remains
`{ unit?: string, value?: number }`, while Zod still requires a finite `value`. In the installed package
coercer, `parseValue` and `serialize` return the ordinary Zod object's parsed copy, including its
current unknown-key stripping. Its installed `parseLiteral` requires `value` to be a `FloatValue` and
constructs a `unit` property whose value may be `undefined`. The current GraphQL host does not install
that coercer. Document action validation still ignores Zod's parsed copy, so the reducer receives the
raw shallow-cloned input instead. These disagreements are compatibility facts, not behavior for the
catalog to normalize.

`Unknown` remains `z.unknown()`. `Upload` remains available in every document position accepted by
the current generator and keeps its `z.any()` validation source. The underscore scalar registration
keys also retain their current host behavior. A future scalar-coercion RFC may repair these defects,
but this declaration RFC does not define that release or its evidence gate.

The catalog's descriptor identity uses the actual SDL name and is closed to authors. Its GraphQL
Adapter preserves the current authored resolver map followed by the real `JSONObject` resolver; it
does not install the package resolver map. The six underscore-key mismatches remain recorded evidence
rather than active bindings. The codegen-owned mappings and `JSONObject` have no package scalar
module, so the catalog declares their metadata directly. The five GraphQL specification built-ins are
part of the type grammar rather than catalog declarations.

## Why descriptors own identity

Zod metadata is bound to a schema instance. A scratch test against Zod 4.3.6 produced this result:

| Operation applied after `.meta()`                                                                          | Metadata |
| ---------------------------------------------------------------------------------------------------------- | -------- |
| `optional`, `nullable`, `nullish`, `default`, `catch`, `array`, `partial`, `pipe`, `transform`, `readonly` | lost     |
| `brand`, `describe`, `min`, `max`, `regex`, `refine`, `superRefine`, `overwrite`                           | retained |

Refinement chaining keeps metadata on the locked version. The architecture still must not depend on
Zod metadata, because common wrappers and object `partial()` drop it.

A descriptor keeps identity in a plain immutable node:

```ts
type DescriptorNode<TInput, TOutput, TSource = TOutput> = {
  readonly kind:
    | "scalar"
    | "enum"
    | "object"
    | "input"
    | "interface"
    | "union"
    | "list"
    | "ref";
  readonly identity: GraphQLIdentity;
  readonly validator: z.ZodType<TOutput, TInput>;
  readonly __types?: {
    readonly input: TInput;
    readonly output: TOutput;
    readonly source: TSource;
  };
};
```

`identity` records the named token, position, nullability, description, and child descriptors. The
compiler never guesses `PHID` from a regex, reads Zod internals, or recovers a type name from
metadata.

Named types and field uses are separate types over this shape. [Type definitions and field
uses](#type-definitions-and-field-uses) declares both.

## Closed grammar

GraphQL has a small type grammar. `ph` supports only constructs it can preserve exactly:

- built-in and cataloged custom scalars
- enums
- input objects and output objects
- output interfaces and object `implements` relations
- references and lazy references
- recursive lists
- output unions with an explicit resolver binding in a subgraph
- computed output fields in a subgraph

Arbitrary Zod schemas are not accepted as GraphQL fields. Scalars are closed to authors: a new scalar
is a compiler-owned declaration under [09-scalar-catalog.md](./09-scalar-catalog.md), and an author
declaration is rejected with `PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED` rather than partially
supported. Keeping third-party coercion compatible against stored documents needs a compatibility
owner per scalar that core v1 does not have; [07-risks.md](./07-risks.md) records the reopening
condition.

The reusable constructs remain. `ph.String`, `ph.Int`, and `ph.Float` use the validation already owned
by their installed scalar or GraphQL built-in. A closed value set is `ph.enum`; a structured value is
`ph.object` or `ph.input` reached through `ph.ref`. Length limits, numeric ranges, regular expressions,
and list-size rules stay in reducer or resolver implementation. They do not enter the descriptor
Interface. This matches current generated document models and avoids adding replay-sensitive
validation behavior during migration.

## Field syntax

Options objects are used throughout. There is no mutation and no chaining.

```ts
const LineItem = ph.object("InvoiceLineItem", {
  description: "One priced invoice line.",
  fields: {
    id: ph.OID({ required: true }),
    description: ph.String({ required: true }),
    quantity: ph.Int({ required: true }),
    unitPrice: ph.Money({ required: true }),
    tags: ph.list(ph.String({ required: true }), { required: true }),
  },
});
```

Field validation options have one member:

```ts
type FieldValidationOptions = {
  readonly required?: boolean;
};
```

`ph.String()` prints `String`. `required: true` prints `String!`. An omitted or false value prints the
nullable form. Scalars, `ph.list`, and `ph.ref` all use this same small validation Interface. Standard
GraphQL metadata remains position-specific and does not add validation behavior. Lists are recursive
descriptors:

```ts
ph.list(ph.String()); // [String]
ph.list(ph.String({ required: true })); // [String!]
ph.list(ph.String(), { required: true }); // [String]!
ph.list(ph.String({ required: true }), { required: true }); // [String!]!
ph.list(ph.list(ph.Int({ required: true }))); // [[Int!]]
```

Nesting and item nullability are expressed only by recursion. A flat `list` flag paired with a
separate item-nullability flag cannot express `[[Int!]]`, so the algebra has no such flag.

Object fields remain under `fields:` because model states can legitimately contain keys named
`description`, `required`, or `deprecated`.

Existing GraphQL metadata remains legal where GraphQL already permits it. This includes descriptions
on named types, fields, arguments, input fields, enum values, operations, modules, and the model.
`deprecated` remains limited to GraphQL field definitions, argument definitions, input fields, and
enum values. These are schema metadata, not scalar validation options.

`defaultValue` is accepted only for GraphQL arguments and subgraph input fields. The structured form
uses property presence so an absent default and an authored `null` default cannot collapse into the
same value:

```ts
type DefaultValueDefinition = {
  readonly defaultValue?: JsonValue;
};
```

An authored default must be accepted by the field descriptor. New document state and action input
fields omit `defaultValue`; adding one there would change behavior. The Migration Adapter records an
existing document-input SDL default by including the property and preserving its original text.
Existing GraphQL coercion may apply that default, while direct action creation and replay retain their
current raw-input path and continue to ignore Zod's returned copy.

## Named and derived input types

Reusable definitions are named explicitly:

```ts
const PagingInput = ph.input("PagingInput", {
  fields: { cursor: ph.String(), limit: ph.Int() },
});
```

An operation's common one-use input is anonymous and gets its name from the operation:

```ts
input: ph.input({
  fields: { id: ph.OID({ required: true }) },
});
```

For `addLineItem`, the compiler names that input `AddLineItemInput`. An explicit name or action-type
override exists only for reuse and migration compatibility. This removes a common source of repeated
names without hiding naming rules.

References use descriptor tokens, not strings. `ph.ref(Type)` handles normal references and
`ph.ref(() => Type)` handles cycles. A truly recursive TypeScript initializer still needs an
explicit annotation at the cycle, just as `z.lazy()` does.

## Type definitions and field uses

A named type and a field that uses it are different things. `ph.enum`, `ph.object`, `ph.input`,
`ph.interface`, and `ph.union` return a named type. The catalog scalar factories, `ph.list`, and
`ph.ref` return a field use.
The author Interface keeps them apart:

```ts
type TypeDescriptor<TInput, TOutput, TSource = TOutput> = DescriptorNode<
  TInput,
  TOutput,
  TSource
> & {
  readonly role: "named type; wrap it with ph.ref(Type) to use it as a field";
  readonly kind: "enum" | "object" | "input" | "interface" | "union";
};

type StateRootDescriptor<TInput, TOutput, TSource = TOutput> = TypeDescriptor<
  TInput,
  TOutput,
  TSource
> & {
  readonly kind: "object";
};

type FieldDescriptor<TInput, TOutput, TSource = TOutput> = DescriptorNode<
  TInput,
  TOutput,
  TSource
> & {
  readonly role: "field use";
  readonly kind: "scalar" | "list" | "ref";
};
```

A `fields` record takes field uses. `ph.union` members and the `ph.ref` argument take named types.
`ph.list` wraps a field use and returns one.

`StateRootDescriptor` is the document-model seam's narrower view of a named type. A nonempty global or
local state root accepts only the descriptor returned by `ph.object`. It is not a new descriptor kind
or a new `ph` builder. Chapter 02 walks that root and any explicitly declared auxiliary types to
materialize the complete SDL. This keeps GraphQL type grammar in this algebra and state rules in the
document-model compiler.

Nullability belongs to the use. `InvoiceStatus` carries none of its own.
`ph.ref(InvoiceStatus, { required: true })` prints `InvoiceStatus!`, and `ph.ref(InvoiceStatus)`
prints `InvoiceStatus`.

### Why one descriptor type is not enough

A single descriptor type makes a named type structurally assignable to a field position. A scratch
test against TypeScript 6.0.3 compiled all four of these without an error:

| Declaration                                    | What it actually is            |
| ---------------------------------------------- | ------------------------------ |
| `fields: { status: InvoiceStatus }`            | a named type in a field slot   |
| `ph.union("Node", { members: [ph.String()] })` | a scalar use as a union member |
| `ph.ref(ph.ref(LineItem))`                     | a reference to a reference     |
| `ph.list(LineItem)`                            | a named type as a list item    |

The first row is the one that ships. `ph.enum("InvoiceStatus", ...)` gives `TOutput` the value
`"DRAFT" | "ISSUED" | "PAID"`, so a bare token in a field slot infers a non-null TypeScript type.
That field declares no `required`, so the printer emits `InvoiceStatus`. The declared type and the
printed schema disagree and nothing reports it. Reference fields are 80 percent non-null in the
audited corpus, 24 of 30, so an author reaching for `InvoiceStatus!` lands on exactly this case.

The split rejects all four at `tsc`. Correct declarations still compile: `ph.ref(Type, options)`,
`ph.ref(() => Type)`, `ph.list(ph.ref(Type))`, and `ph.union` over named types.

The split is close to free. Measured at 300 fields containing reference and list fields, and holding
type-parameter arity equal, it costs 3 declaration bytes, 28,823 against 28,826, and saves 24 type
instantiations, 3,695 against 3,719.

`role` holds a string rather than a symbol, so its literal appears in the compiler error:

```text
Type '"named type; wrap it with ph.ref(Type) to use it as a field"'
  is not assignable to type '"field use"'.
```

The repair travels with the failure. A reader does not need this chapter to act on it.

Runtime validation applies the same four rules, because a JavaScript caller has no compiler to apply
them. A named type in a field position is `PH-DEF-TYPE-AS-FIELD`.

## Field validation options

`required` is the only public field validation option in core v1. The compiler rejects
`minLength`, `maxLength`, `pattern`, `format`, `min`, `max`, `exclusiveMin`, `exclusiveMax`,
`multipleOf`, `minItems`, `maxItems`, and any other unknown field option with
`PH-DEF-FIELD-OPTION-UNSUPPORTED`. It never ignores one or turns it into a directive.

This keeps the author Interface aligned with current generated models. Scalar factories retain their
installed coercion, and object, input, enum, list, reference, and nullability rules still come from
the closed descriptor grammar. Business rules remain authored reducer or resolver behavior and need
their own tests. Moving one of those rules into automatic input validation would change when an
operation fails during replay, so it requires a later versioned feature rather than an extra option in
core v1.

### Unknown object keys

Document state and action input objects preserve undeclared keys at every nested object depth. This
is the only core-v1 document mode. Generated creators make the same shallow enumerable-property copy
as the current templates, and both action validation passes ignore Zod's parsed copy. Raw and replayed
actions keep their persisted input object. The compiler does not add recursive JSON-safety validation
or strip values that the current path retains. Persistence keeps the platform's existing
`JSON.stringify` behavior for `undefined` and other non-JSON values.

GraphQL input coercion continues to reject undeclared fields before a subgraph resolver. Extra
properties on an output backing object remain legal because GraphQL reads only selected fields.

Zod enforces requiredness and the scalar's existing validation at action creation, again before
reducer dispatch during replay, and before any authored subgraph resolver built by the compiler. It
also validates declared initial state. The platform does not validate the state a reducer mutates
after every operation, so domain invariant tests remain required. MCP action validation continues to
invoke the typed action creator.

If compilation goes through a `GraphQLSchema`, `printSchema()` is insufficient because it drops
directive uses. `printSchemaWithDirectives()` preserves them. A direct descriptor-to-AST compiler can
use `graphql.print`, which also preserves them.

## Canonical ordering

Ordering is part of the stored specification and SDL contract:

- fields, arguments, directive uses, enum values, union members, modules, operations, errors, and
  examples preserve their authored order
- new code-first family versions are emitted in ascending version order after the explicit tuple is
  validated; the Legacy Adapter preserves stored order
- model traversal starts at global state, local state, auxiliary types in authored order, then each
  module and operation in the finalized module tuple; subgraph traversal starts at entries in callback
  return order, then explicit `expose(...)` calls in authored order
- named types are emitted on first encounter during that traversal; a token is marked before its
  children are visited so a cycle does not change the result
- compiler-owned scalar and directive declarations use a fixed catalog order, which is the order of
  `names` on the catalog Module and is stable across hosts

Author-supplied directive uses and their arguments preserve explicit array order. Compiler-derived
directive uses and arguments follow the fixed catalog order. SDL always uses LF line endings and
ends with exactly one newline. The compiler does not lexically sort authored schema sequences; only
family versions and diagnostics use their specified sorting rules.

The compiler snapshots order when each descriptor is created. It rejects symbol keys and does not
derive order from directory scans, locale comparison, object hashes, or external map iteration. A
migrated compatibility block may retain an exact legacy string, but the compiler must parse it and
prove that it describes the same structured node before publication.

Structured-definition digests use a versioned canonical JSON encoder. Arrays retain the order above;
object member names are sorted by JavaScript UTF-16 code-unit order; strings and finite numbers use
the ECMAScript `JSON.stringify` encoding; and no whitespace is emitted. SHA-256 hashes the UTF-8
bytes of that encoding and is written as lowercase hex prefixed with `sha256:`. Functions, symbols,
`undefined`, and non-finite numbers cannot enter the encoded definition. The digest is a cache and
activation identity, not evidence that reducer or resolver closures behave equivalently.

## Deterministic output without generated artifacts

The descriptor grammar is closed, so document models do not need `graphql-js` to print their stored
SDL. A small pure printer walks descriptors and emits canonical text at module evaluation. The same
walk produces the structured definition and Zod objects. No emitted `.graphql`, `.json`, `.ts`, or
model-specific `.d.ts` file is part of correctness. Normal TypeScript package compilation may still
emit JavaScript and declarations for consumers.

Subgraph packages can carry descriptors to the host. The host converts them to a `DocumentNode`,
binds the generated `BaseSubgraph` instance, and runs the installed subgraph validator and composer
once at registration. This
keeps GraphQL dependencies out of independently bundled model packages without adding a hidden
authoring step.

Descriptor and SDL traversal must be `O(V + E)` in descriptor nodes and references and `O(V)` in
compiler-owned memory. Canonical JSON encoding may sort object members and is `O(N log N)` in the
worst case. Neither pass runs per request. TypeScript, editor, runtime, bundle, and cache budgets are
fixed in [08-implementation-plan.md](./08-implementation-plan.md); their measurements remain
implementation gates, not claims.

## Diagnostics

Definition errors use the single versioned `DefinitionDiagnostic` wire type in
[chapter 08](./08-implementation-plan.md#interface-decision). Chapter 08 owns its phase union, source
requiredness, related locations, ordering, and report envelope. Other chapters reference that type
and do not define competing copies.

At minimum the compiler diagnoses duplicate GraphQL names, duplicate action types, unresolved
references, input/output position mistakes, a named type used directly as a field, a scalar field-use
factory used without being called, an unsupported field option, empty or duplicate enum values,
invalid union members, missing computed resolvers, an initial state for which the current
`JSON.stringify` path produces no stored string, invalid compatibility IDs,
an author-declared scalar, a reachable scalar name the catalog does not own, and an initial value
rejected by its own validator.

Diagnostics are ordered by source, definition, version, authored descriptor path, then code using a
fixed code-unit comparator. A collision uses `related` to identify both declarations. Every
diagnostic includes a concrete repair; source lines are not promised because runtime builders do not
retain a TypeScript AST. `ph model check --json` returns the same objects that registration uses in
the versioned report from chapter 08. This is more useful to a developer or agent than a generic
exception, absolute build path, composition stack, or TypeScript instantiation trace.
