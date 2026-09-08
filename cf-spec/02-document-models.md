# Code-first document models

The Interface, compatibility rules, migration contract, and replay evidence protocol are fixed.
Delivery statements below describe the pre-implementation baseline; current evidence is recorded in
[the delivery tracker](./10-delivery-tracker.md).

A finalized code-first model is an ordinary `DocumentModelModule` with one additive structured
property. Existing consumers continue to use `reducer`, `actions`, `utils`, and `documentModel`.
Structured consumers can use `definition` and avoid reparsing SDL.

```ts
type CodeFirstDocumentModelModule<
  TState extends PHBaseState,
  TActions extends Actions,
> = Omit<DocumentModelModule<TState>, "actions" | "version"> & {
  readonly version: number;
  readonly actions: TActions;
  readonly definition: DocumentModelDefinition;
};
```

The definition compiler is a deep Module. It owns validation, identity, naming, actions, reducer
dispatch, Zod schemas, SDL, the complete stored specification, and diagnostics. The author Interface
has three normal steps: create a typed context, declare modules, and finalize one value.

## Worked Interface

### Context and state specifications

```ts
// definition.ts
import { defineDocumentModel, ph } from "@powerhousedao/document-model";

export const InvoiceStatus = ph.enum("InvoiceStatus", {
  values: ["DRAFT", "ISSUED", "PAID", "VOID"],
});

export const InvoiceLineItem = ph.object("InvoiceLineItem", {
  fields: {
    id: ph.OID({ required: true }),
    description: ph.String({ required: true }),
    quantity: ph.Int({ required: true }),
    unitPrice: ph.Money({ required: true }),
  },
});

export const invoice = defineDocumentModel({
  id: "powerhouse/invoice",
  name: "Invoice",
  description: "An invoice issued to a counterparty.",
  extension: ".phinv",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  changeLog: [],

  specifications: {
    global: {
      schema: ph.object("InvoiceState", {
        fields: {
          issuer: ph.PHID({ required: true }),
          number: ph.String({ required: true }),
          status: ph.ref(InvoiceStatus, { required: true }),
          currency: ph.Currency({ required: true }),
          lineItems: ph.list(ph.ref(InvoiceLineItem, { required: true }), {
            required: true,
          }),
          issuedAt: ph.DateTime(),
          total: ph.Money({ required: true }),
        },
      }),
      initialValue: {
        issuer: "",
        number: "",
        status: "DRAFT",
        currency: "USD",
        lineItems: [],
        issuedAt: null,
        total: 0,
      },
      examples: [
        {
          key: "empty",
          value:
            '{"issuer":"","number":"","status":"DRAFT","currency":"USD","lineItems":[],"issuedAt":null,"total":0}',
        },
      ],
    },
    local: {
      schema: ph.object("InvoiceLocalState", {
        fields: { draftNote: ph.String() },
      }),
      initialValue: { draftNote: null },
      examples: [],
    },
  },
});
```

Each nonempty scope keeps its schema and initial value together. The sibling `schema` contextually
types `initialValue` as its inferred state shape. A missing required field or a value that does not
match the field descriptor fails TypeScript. Structural extra properties remain possible, as they are
with current generated state types.

The compiler materializes `initialValue` with the platform's current `JSON.stringify` behavior, then
validates the parsed value with the generated schema while ignoring Zod's returned copy. This keeps
the schema-first path's handling of `undefined`, non-finite numbers, `toJSON`, and enumerable
properties. It does not add an exact round-trip or prototype check. A value that cannot produce a
stored JSON string is a definition error.

The author-facing `specifications` object is the single-version shorthand for scoped state
specifications. The compiler materializes it into the existing
`documentModel.global.specifications` array at the declared `version`. The stored
`DocumentSpecification.state.global` and `DocumentSpecification.state.local` entries retain their
current JSON shape, including their materialized `schema` and `initialValue` strings. This mapping
keeps legacy consumers compatible while the authoring Interface groups each schema with the value it
validates.

#### Schema field and root descriptor

`schema` intentionally keeps the current property name, but its code-first value is a
`StateRootDescriptor` rather than an SDL string. `ph.object` is the correct builder because the
authored entry point is the root state object. `ph.ref` edges discover supporting objects, enums, and
unions. The optional `specifications.auxiliaryTypes` tuple retains descriptor-supported definitions
that the roots and operation inputs do not reach. The compiler rejects duplicate tokens across roots,
reachable nodes, and auxiliary types.

```ts
type StripGraphQLLocations<T> = T extends readonly (infer U)[]
  ? readonly StripGraphQLLocations<U>[]
  : T extends object
    ? { readonly [K in Exclude<keyof T, "loc">]: StripGraphQLLocations<T[K]> }
    : T;

type LocationFreeDocumentNode = StripGraphQLLocations<DocumentNode>;

type LegacyGraphQLDocumentCompatibility = {
  readonly kind: "graphql-ast-v1";
  readonly document: LocationFreeDocumentNode;
  readonly preserveDefinitionOrder: true;
};

type CodeFirstSpecificationsDeclaration = {
  readonly auxiliaryTypes?: readonly TypeDescriptor[];
  readonly graphQLCompatibility?: LegacyGraphQLDocumentCompatibility;
  readonly global: ScopeDeclaration;
  readonly local: ScopeDeclaration | EmptyLocalScopeDeclaration;
};
```

`auxiliaryTypes` is an inventory, not a second ownership graph. References still use the same tokens,
and each named token may occur only once in the materialized `types` array.

Current state and operation SDL can also contain schema definitions, directive definitions and uses,
type extensions, and other type-system nodes outside the V1 descriptor grammar. The public
`legacyGraphQLDocument` compatibility helper parses the stored state and operation schema segments in
their current concatenation order and returns the location-free AST above. The Migration Adapter uses
that helper, and an author may use it when manually converting an equivalent legacy declaration. It is
never inferred for a new declaration.

When `graphQLCompatibility` is present, its AST is the authoritative input to the model GraphQL
Adapter. The Adapter does not print only the reachable descriptor graph and then append leftover text.
It passes every definition and extension through in the recorded order. The compiler still checks that
all descriptor-representable roots, fields, inputs, defaults, and named types agree with the AST. It
rejects a mismatch. Extra nodes are legal only when V1 has no lossless descriptor representation.
Compiler-owned scalar declarations remain outside this author AST and retain their current assembly
position. The structured definition stores plain JSON AST data, so finalized model packages do not
load `graphql-js` at runtime.

This distinction matches the current implementation. `State.schema` is a string
(`packages/shared/document-model/types.ts:23-27`), codegen parses or concatenates the complete string
(`packages/codegen/src/codegen/graphql.ts:105-148,224-235`), and current state-name validation only
requires the document to contain the expected root `type`
(`packages/shared/document-model/validation.ts:144-183`). Existing schemas can and do contain several
object, enum, and union definitions. The shared `schema` name keeps the compatibility mapping
recognizable; the type distinguishes the authored root descriptor from the stored SDL string.

The author Interface accepts a narrower `StateRootDescriptor`, whose `kind` is exactly `"object"`.
The compiler derives `graphQLName` as `pascalCase(name)` with the repository's current `change-case`
implementation. Authors do not supply a second normal name. The global root name is
`${graphQLName}State`; the local root name is
`${graphQLName}LocalState`. `ph.input`, `ph.enum`, `ph.union`, field uses, a wrong object name, and a
missing global root fail definition checking with `PH-DM-STATE-ROOT-INVALID`. TypeScript rejects the
wrong descriptor role or kind earlier when it can. Runtime checking remains mandatory for JavaScript
and untyped inputs.

The current model format permits an absent local schema and treats an empty local initial-value string
as `{}` during code generation (`packages/codegen/src/utils/unsafe-utils.ts:4-29`). Code-first makes
that case explicit while still keeping the initial value in the local specification:

```ts
local: {
  schema: null,
  initialValue: {},
}
```

Only `local.schema` may be `null`. Its initial value must be an exact empty plain JSON object. A new
definition materializes that pair as `schema: ""` and `initialValue: "{}"`; a migrated definition may
retain the legacy empty `initialValue: ""` only through its checked serialization override. No empty
GraphQL object type or synthetic placeholder field is emitted.

The context imports no module fragments. Module files import the context, so the definition graph is
acyclic. References between schema types use descriptor tokens or lazy token thunks, never barrel
imports introduced only for type lookup.

The public declaration of `invoice` is an opaque
`DocumentModelContext<InvoiceState, InvoiceLocalState>`. It does not expose the full configuration
object, Zod implementation, or reducer callbacks. Internal module files are part of declaration emit
even when the package root does not re-export the context.

### A module

```ts
// modules/line-items.ts
import { ph } from "@powerhousedao/document-model";
import { invoice } from "../definition.js";

export const lineItems = invoice.module("lineItems", {
  description: "Add and remove invoice line items.",
  operations: ({ global }) => ({
    addLineItem: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          description: ph.String({ required: true }),
          quantity: ph.Int({ required: true }),
          unitPrice: ph.Money({ required: true }),
        },
      }),
      errors: {
        InvoiceAlreadyIssued: {
          code: "INVOICE_ALREADY_ISSUED",
          description: "The invoice has left DRAFT and cannot be edited.",
          template: "",
        },
      },
      examples: [
        {
          key: "item",
          value:
            '{"id":"item-1","description":"Consulting","quantity":1,"unitPrice":100}',
        },
      ],
      template: null,
      reducerTemplate: null,
      reduce(state, input, ctx) {
        if (state.status !== "DRAFT") {
          throw new ctx.errors.InvoiceAlreadyIssued(
            `Invoice ${state.number} has already been issued`,
          );
        }
        state.lineItems.push(input);
        state.total = state.lineItems.reduce(
          (sum, item) => sum + item.quantity * item.unitPrice,
          0,
        );
      },
    }),
  }),
});
```

The `operations` callback receives only `global` and `local`. Calling one of them selects the stored
scope and narrows `state` before the reducer is authored. Authors never repeat a free-form scope
string. For example, a local reducer is declared as `setDraftNote: local({ ... })`. These builders
exist only inside `context.module`; they are not another top-level authoring Interface.

The operation input name above is derived as `AddLineItemInput`; a named
`ph.input("PagingInput", ...)` is reserved for reuse or compatibility.

Errors are declared by the operation that can throw them. This matches the existing
`DocumentSpecification.modules[].operations[].errors[]` ownership. There is no model-level error
registry and no separate reference step for an author to keep synchronized.

State and operation `examples` accept `{ key: string, value: string }` declarations. The compiler
derives their IDs and materializes the existing `{ id, value }` stored shape; the compiler-only key
never enters `documentModel`. `changeLog`, operation `template`, and `reducerTemplate` map to the
corresponding stored metadata. They default to `[]`, `null`, and `null`. The Migration Adapter supplies
exact legacy IDs and strings, including null versus an empty string. This keeps metadata at the Interface that owns
it and lets finalization build a complete `DocumentModelPHState` without a second patch step.

The operation error Interface is:

```ts
type OperationErrorDeclaration = {
  code?: string;
  name?: string;
  description?: string;
  template?: string;
};
```

The object key is the reducer-facing error key. For a new definition, the compiler derives the
per-operation `id` from the model, module, operation, and error keys. Omitted `name` and `code` default
to the key. Omitted `description` and `template` materialize as `null`; an authored empty string stays
an empty string. The compiler preserves declaration order when it materializes
`OperationSpecification.errors`.

The Migration Adapter preserves each legacy error occurrence independently. It retains `id`, `code`,
`name`, `description`, and `template` exactly, including null versus empty string. Two operations may
use the same generated class name while carrying different IDs, descriptions, or templates. The
Adapter must not collapse those occurrences into one stored error.

The creator always writes the declared scope. The current generated reducer nevertheless selects
state with the persisted `action.scope`, and it does not check that the action type declares that
scope (`packages/codegen/src/templates/document-model/gen/reducer.ts:95-97`). The decision has two
stages: core v1 preserves that dispatch for replay parity, while a later shared protocol version
rejects `action.scope !== declaredScope` before state selection in both legacy and code-first
reducers. Neither stage silently reroutes a wrong-scope archived action. The protocol gate covers
creator, GraphQL, raw-action, and archived-replay routes separately.

The reducer receives `Draft<StateOfScope>` or an equivalent compiler-owned mutable projection.
Readonly properties inferred from descriptor literals do not leak into authored reducer code.

`ctx.errors` contains only classes declared by that operation. Each class uses the reducer-facing key
for its `errorCode` and default message and accepts an explicit message. This preserves the current
generator behavior, which derives both values from the Pascal-cased error `name`, not from the stored
`OperationErrorSpecification.code`. The stored `code` remains independent metadata and may differ.
For migration, the Adapter uses the exact class key produced by the current generator and preserves
the stored `code` separately. A missing legacy `name` blocks migration because the current generator
cannot produce its error class without one.

Within one module, the compiler reuses one runtime class for equal reducer-facing keys, matching the
current generator's module-wide class deduplication. The structured and stored definitions still keep
one complete error occurrence under every operation. The exact thrown message is persisted on a
failed operation (`packages/shared/document-model/reducer.ts:587-606`), so reducers must produce it
deterministically.

`ctx.action` exposes the complete persisted action and `ctx.dispatch` exposes the current optional
dispatch callback. Existing generated handlers receive both
(`packages/codegen/src/templates/document-model/gen/modules/operations.ts:52-63`), so migration cannot
discard them even when the common reducer uses only `state` and `input`.

### Platform operation context stays in the runtime

The declaration compiler does not allocate or validate platform ordering data. The existing runtime
continues to construct the stored `OperationContext`
(`packages/shared/document-model/operations.ts:337-346`):

```ts
type OperationContext = {
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  resultingState?: string;
  ordinal: number;
};
```

For a new write, evaluation uses the current `ordinal: 0` placeholder. The operation-index Adapter
allocates the committed ordinal during database insertion, after reduction succeeds, and the executor
patches that value into the emitted context
(`packages/reactor/src/executor/simple-job-executor.ts:451-459,1042-1056`,
`packages/reactor/src/cache/kysely-operation-index.ts:246-252`). Replay and upgrade keep their current
stored-context paths. Core v1 does not reserve an ordinal before reduction, introduce a shared
context constructor, or add pre-reducer context validation. Those changes belong to the runtime
protocol and transaction model, outside this declaration RFC.

Validation preserves the raw input object. Current action and reducer validators call Zod `parse`
but deliberately ignore its returned value (`packages/shared/document-model/actions.ts:280-297`,
`packages/codegen/src/templates/document-model/gen/reducer.ts:60-68`,
`packages/codegen/src/templates/document-model/gen/reducer.ts:95-110`). Passing Zod's parsed value to
`reduce` could strip unknown keys or apply a transform. The descriptor algebra therefore forbids
defaults, catch values, preprocessing, coercions, and transforms, and passes the same shallow-cloned
input used by current generated creators. Raw and replayed actions retain their persisted input object.
Both paths preserve unknown keys and keep the platform's current serialization behavior.

Normal code-first operations require an `input` descriptor. An empty input uses
`ph.input({ fields: {} })`, which follows the current non-null-schema creator path. A migrated
operation whose stored schema is null keeps the current asymmetry: the actions map has no creator,
while raw or replayed actions reach the reducer's `Object.keys(action.input)` empty-input check
(`packages/codegen/src/templates/document-model/gen/modules/creators.ts:66-73`,
`packages/codegen/src/templates/document-model/gen/reducer.ts:60-68`). Core v1 does not add a creator
for that legacy case.

### Finalization

```ts
// model.ts
import type {
  ActionOf,
  DocumentOf,
  GlobalStateOf,
  LocalStateOf,
} from "@powerhousedao/document-model";
import { invoice } from "./definition.js";
import { lifecycle } from "./modules/lifecycle.js";
import { lineItems } from "./modules/line-items.js";
import { notes } from "./modules/notes.js";

export const InvoiceV1 = invoice.finalize({
  modules: [lineItems, lifecycle, notes],
});

export type InvoiceGlobalState = GlobalStateOf<typeof InvoiceV1>;
export type InvoiceLocalState = LocalStateOf<typeof InvoiceV1>;
export type InvoiceDocument = DocumentOf<typeof InvoiceV1>;
export type InvoiceAction = ActionOf<typeof InvoiceV1>;

export const { reducer, actions, utils, documentModel } = InvoiceV1;
```

`finalize` is the single-version convenience. It runs the same one-version family compiler and
returns one ordinary runtime value. It does not freeze the module or its public properties and does
not write files. Definition errors for that model are
collected, sorted by path, and thrown as one `DocumentModelDefinitionError`; the same diagnostics are
available through the check command.

The public type of a finalized module and operation token must hide reducer callback internals. A
scratch prototype against TypeScript 6.0.3 found that exposing those callbacks repeated each field
three times in declarations. Opaque operation tokens reduced the 300-field declaration from 30,995
bytes to 8,173 bytes. This is an Interface rule, not an implementation detail.

## Supported scopes

The author Interface offers `global` and `local` builders because `ScopeState` and
`DocumentSpecification.state` describe exactly those two model scopes. This restriction applies to
new declarations only.

Runtime action, operation, and context scopes remain strings. Core v1 does not add a membership
validator to action creation, raw-action intake, history loading, replay, dispatch, upgrade, or
operation-context construction (`packages/shared/document-model/types.ts:52-75`,
`packages/shared/document-model/schemas.ts:87-89`). The reducer continues to select state from the persisted
`action.scope`, including when it differs from the operation's declared scope. An unknown string keeps
the current state-selection, history, and error behavior. The declaration compiler must not reroute,
reject earlier, or normalize an archived action.

`auth`, `document`, and `header` remain platform concerns. They are unavailable from the model module
builder because the stored model specification cannot declare their state, but this RFC does not close
the runtime string set. A future protocol RFC may add a shared scope registry and validation once all
write, replay, synchronization, and storage paths adopt it together.

Current generated state types use required keys whose value type is `T | null | undefined`. Input
types use optional keys with the same union. Core v1 preserves those types and their runtime behavior.
It does not add an `undefined` rejection step. Persistence continues to use `JSON.stringify`, which
omits undefined object properties and serializes undefined array entries as `null`. `Unknown` remains
`z.unknown()`, and `Upload` remains `z.any()` in every document position accepted by current codegen
(`packages/reactor/src/storage/txn.ts:19-37`, `packages/codegen/src/codegen/graphql.ts:60-76`).

## What finalization produces

Code-first declarations require a positive safe-integer `version`. This narrows the author Interface,
but the finalized value always carries the same numeric lookup value used by the registry. The Legacy
Adapter retains the registry's current default of version 1 when an existing module omits the optional
property.

| Property        | Purpose                                                                                           |
| --------------- | ------------------------------------------------------------------------------------------------- |
| `version`       | Registry and replay version lookup. Required for code-first modules.                              |
| `reducer`       | Write path and replay.                                                                            |
| `actions`       | Current base actions followed by typed model action creators.                                     |
| `utils`         | Current state/document creation, versioned loading, file I/O, and guards.                         |
| `documentModel` | Complete existing `DocumentModelPHState`, including deterministic SDL and specification metadata. |
| `definition`    | Structured code-first representation used by checks and GraphQL projection.                       |

`upgradeManifest` is not a `DocumentModelModule` property today and is not added here. Version-family
composition produces it separately.

The compiler builds `actions` with the current `{ ...baseActions, ...moduleActions }` order. It keeps
base actions visible to controllers and preserves the current later-spread collision behavior
(`packages/codegen/src/templates/document-model/actions.ts:42-57`).
`utils.createState`, `createDocument`, file handling, and guards delegate to the same shared helpers as
generated modules. `utils.loadFromInput` remains version-aware and closes over prior reducers and the
family upgrade manifest
(`packages/codegen/src/templates/document-model/gen/utils.ts:45-81`). The compiler may hide that
wiring inside the deep Module, but the finalized Interface and behavior stay unchanged.

Both validation points remain. An action creator rejects invalid local input before an operation
exists. The reducer parses again because remote, archived, and synchronized actions can bypass the
creator.

The reducer implementation is a table keyed by derived action type. It preserves the current
document-action guard, empty-input branch, scope dispatch, parse order, error recording, and unknown
action behavior. Finalization rejects duplicate derived action types because the generated switch is
first-match-wins while an object table would otherwise be last-write-wins.

## Structured definition contract

`definition` is versioned data, not an opaque copy of builder internals. V1 has the following closed
top-level and specification shape. Its JSON Schema must reject unknown properties before B1 evidence
can pass; no such schema exists in the pinned tree yet.

```ts
type DocumentModelDefinition = {
  kind: "powerhouse.document-model";
  formatVersion: 1;
  compatibility: {
    identity: "derived-v1" | "explicit-legacy";
    scalarCoercion: "document-engineering-1.40";
    serialization: "canonical-v1" | "explicit-legacy";
  };
  model: {
    documentType: string;
    graphQLName: string;
    name: string;
    description: string;
    extension: string;
    author: { name: string; website: string | null };
  };
  specifications: readonly {
    version: number;
    types: readonly NamedGraphQLTypeDefinition[];
    scalars: readonly ScalarReferenceDefinition[];
    graphQLCompatibility: LegacyGraphQLDocumentCompatibility | null;
    state: {
      global: NonEmptyStateDefinition;
      local: StateDefinition;
    };
    modules: readonly {
      id: string;
      key: string;
      name: string;
      description: string | null;
      operations: readonly {
        id: string;
        key: string;
        name: string | null;
        description: string | null;
        actionType: string;
        creatorKey: string;
        scope: "global" | "local";
        input: InputDefinition | null;
        errors: readonly CompiledErrorDefinition[];
        examples: readonly { id: string; key: string; value: string }[];
        template: string | null;
        reducer: string | null;
      }[];
    }[];
    changeLog: readonly string[];
  }[];
};

type MaterializedStateDefinition = {
  schema: string;
  initialValue: string;
  examples: readonly { id: string; value: string }[];
};

type NonEmptyStateDefinition = {
  root: NamedTypeReferenceDefinition;
  initialValue: JsonValue;
  examples: readonly { id: string; key: string; value: string }[];
  unknownKeys: "preserve";
  materialized: MaterializedStateDefinition;
};

type EmptyLocalStateDefinition = {
  root: null;
  initialValue: Readonly<Record<string, never>>;
  examples: readonly { id: string; key: string; value: string }[];
  unknownKeys: "preserve";
  materialized: MaterializedStateDefinition & { schema: "" };
};

type StateDefinition = NonEmptyStateDefinition | EmptyLocalStateDefinition;

type CompiledErrorDefinition = {
  id: string;
  key: string; // ctx.errors key, runtime errorCode, and default message
  code: string | null;
  name: string | null;
  description: string | null;
  template: string | null;
};
```

Named type nodes retain kind, name, ordered fields, recursive type references, nullability,
descriptions, property-presence defaults, directives, enum values, interface implementation relations, union
members, and union discrimination metadata.
Each field type reference records `required`; V1 field nodes have no constraint collection. Domain
validation stays in reducer implementation and therefore remains outside the structured definition.
The `types` array contains state roots, reachable supporting definitions, reusable named inputs, and
`auxiliaryTypes`. Anonymous derived operation inputs remain on their operation node. These locations
form the complete descriptor-supported named-type inventory. If `graphQLCompatibility` is non-null,
its AST is the complete GraphQL projection and may also contain definitions and extensions that V1
cannot represent without loss.
Scalars are not named type nodes: a version's `scalars` array records every catalog member its state
and action input reach, as `ScalarReferenceDefinition` values. It records the reference, never a copy
of the member's coercion contract. Copying representation, zero value, or an acceptance digest into
each model would churn every model definition digest whenever a catalog description changed, and a
definition digest is a cache and activation identity rather than behavioral evidence. The array is per
version so that a catalog change is attributable to the versions that reference the name. A nonempty
state node carries its root type reference and exact JSON initial value. An empty local state carries
a null root and an exact empty object; a global state never does. Operation and error nodes carry both logical
keys and compatibility identity. An error node preserves the five fields of
`OperationErrorSpecification`; its `key` records reducer-facing behavior and does not replace the
stored `code` or `name`. Persisted document object nodes record `unknownKeys: "preserve"` so checks
and both reducer validation paths cannot disagree. State and operation examples in `definition`
retain their compiler identity key. State `materialized.examples` and the final stored operation
projection remove that key and emit the existing `{ id, value }` shape.

New `materialized.schema` output references scalars without declaring them. The Migration Adapter may
retain a legacy scalar declaration in an exact schema override; current host stripping and keep-first
deduplication then remain authoritative. Core v1 may report that legacy anomaly but cannot reject or
reorder it.

Compatibility modes are independent. An exact serialization override does not enable explicit IDs or
the GraphQL AST path. Every core-v1 definition uses the installed `document-engineering-1.40` scalar
behavior and preserves unknown document keys. Public compatibility helpers can select explicit
identity, serialization, or GraphQL projection for an equivalent legacy declaration. The Migration
Adapter emits those helpers automatically. The check report lists each selected mode and authored path.

This is enough for GraphQL projection, capability inspection, and migration checks without parsing
the embedded SDL. The GraphQL Seam accepts the whole module: code-first modules project from
`module.definition`; legacy modules use a dedicated SDL Adapter. The published format contract is
versioned. A later representation uses a new `formatVersion` and Adapter. The normative review vector
is [`fixtures/v1/document-model-definition.json`](./fixtures/v1/document-model-definition.json); the
implementation evidence package expands it to every discriminated-union case and validates it with
the closed V1 JSON Schema.

## Naming and identity

Naming uses one compiler-owned implementation of the repository's current `change-case` rules.

| Artifact                   | Rule                                          |
| -------------------------- | --------------------------------------------- |
| GraphQL model name         | `pascalCase(model name)`                      |
| Global state root          | `graphQLName + "State"`                       |
| Local state root           | `graphQLName + "LocalState"`                  |
| Stored module name         | `pascalCase(moduleKey)`                       |
| Stored operation name      | `pascalCase(operationKey)`                    |
| Action type                | `constantCase(operationKey)`                  |
| Input type                 | `pascalCase(operationKey) + "Input"`          |
| Actions map key            | `camelCase(constantCase(operationKey))`       |
| Module operation interface | model name plus module name plus `Operations` |
| Reducer-facing error key   | Authored error property key                   |
| Stored error name          | Authored `name`, otherwise the error key      |
| Stored error code          | Authored `code`, otherwise the error key      |
| Document type              | authored model `id`, unchanged                |

Compatibility overrides exist for migrated names that do not follow those rules. They are not the
normal authoring path. In particular, the Migration Adapter derives current action and creator names
from the stored `operation.name` and records the results in `actionType` and `creatorKey`. It never
renames an existing operation from a newly inferred key. It preserves stored module and operation
names exactly, including null or an empty string. If such a value never produced a usable current
runtime symbol, conversion is blocked and the legacy family remains active; the Adapter does not
invent a replacement. The structured `model.graphQLName` records the derived value; it is not another
normal author input.

The existing specification also requires opaque IDs for modules, operations, errors, and examples
(`packages/shared/document-model/types.ts:39-69`). IDs are observed by the editor across releases, so
random IDs at import or build are forbidden.

For a new model, the compiler derives UUIDv5 values with this frozen namespace:

```text
f80a5a40-200a-5996-b2af-2c0996a4135e
```

That value is `UUIDv5(DNS, "powerhouse.inc/document-model-identity")`. The UUID name is the UTF-8
encoding of the chapter 01 canonical JSON representation of one of these arrays:

```text
["powerhouse.document-model.identity",1,<documentType>,"module",<moduleKey>]
["powerhouse.document-model.identity",1,<documentType>,"operation",<moduleKey>,<operationKey>]
["powerhouse.document-model.identity",1,<documentType>,"error",<moduleKey>,<operationKey>,<errorKey>]
["powerhouse.document-model.identity",1,<documentType>,"state-example",<scope>,<exampleKey>]
["powerhouse.document-model.identity",1,<documentType>,"operation-example",<moduleKey>,<operationKey>,<exampleKey>]
```

Identity segments must already be Unicode NFC; the compiler rejects rather than silently normalizes a
different form. JSON tuples avoid delimiter ambiguity. Model version is deliberately absent so one
logical item retains identity across a family. These vectors lock the byte-level contract:

```text
4c323bb9-fd39-5600-9af2-bc0c28489e37
  ["powerhouse.document-model.identity",1,"powerhouse/invoice","module","lineItems"]
f9ba524d-2a61-53f3-bbd9-452ed03b7523
  ["powerhouse.document-model.identity",1,"powerhouse/invoice","operation","lineItems","addLineItem"]
```

The namespace, tuple grammar, normalization rule, and vectors are a versioned compatibility contract.
Examples require a stable authored key; array position is not identity. For a migrated state or
operation example with a unique legacy ID, the Migration Adapter uses the exact key
`legacy-id:${legacyId}` and retains the legacy ID as an explicit identity override. Duplicate legacy
IDs require an author-supplied semantic key for each example in the compatibility map. The Adapter
never derives a key from the example's array position. A logical rename uses an explicit old-ID
override. Migrating an existing model uses an explicit root compatibility map so stored IDs remain
exact without putting UUIDs beside every normal declaration:

```ts
export const InvoiceV1 = invoice.finalize({
  modules: [lineItems, lifecycle, notes],
  compatibility: legacySpecification({
    ids: {
      "module/lineItems": "...",
      "operation/lineItems/addLineItem": "...",
      "error/lineItems/addLineItem/InvoiceAlreadyIssued": "...",
    },
  }),
});
```

The migration tool emits this map. It also preserves any legacy examples, templates, change log, and
other non-derived specification metadata. A missing or reused identity override is a definition error.
Duplicate legacy example IDs remain representable only after the author supplies distinct semantic
keys; the legacy family stays active until then.

If canonical printing cannot reproduce an existing embedded SDL or initial JSON string byte for byte,
the public legacy compatibility block may retain that exact string as a serialization override. The
compiler parses it and requires semantic equality with the matching structured value. If the SDL also
contains a type-system form outside the V1 descriptor grammar, `graphQLCompatibility` supplies the
complete AST used by GraphQL projection. The helper is available for manual conversion as well as
Migration Adapter output. A declaration with no equivalent legacy source cannot select either mode.

## Version families are explicit

Directory discovery must not become a hidden generator. A stable composition root lists versions and
transitions:

```ts
const InvoiceV1Definition = invoiceV1.version({ modules: v1Modules });
const InvoiceV2Definition = invoiceV2.version({ modules: v2Modules });

const InvoiceFamily = defineDocumentModelFamily({
  versions: [InvoiceV1Definition, InvoiceV2Definition],
  upgrades: [upgradeInvoiceToV2],
});

export const InvoiceV1 = InvoiceFamily.at(1);
export const InvoiceV2 = InvoiceFamily.at(2);
export const documentModels = InvoiceFamily.modules;
export const upgradeManifests = [InvoiceFamily.upgradeManifest];
```

The family compiler requires one document type, unique positive safe-integer versions, a contiguous
sequence, and one transition for every gap. Upgrade reducers remain hand-written because they must
rewrite both current state and `initialState` according to domain intent.

The family compiler requires new code-first versions in ascending authored order and materializes
that same order, so the last entry remains the latest. This is a declaration check, not a replacement
for current consumer selection.

Existing consumers continue to read `specifications[specifications.length - 1]` or `.at(-1)`. The
Migration Adapter copies a legacy specification array in its existing order and does not sort it,
choose the greatest version, or reject history that current loading accepts. Registry selection of a
module version also keeps its current implementation. A shared strict selector may be proposed only
with a separate migration for every consumer that currently relies on last-entry behavior
(`packages/codegen/src/name-builders/get-variable-names.ts:36-40`,
`packages/reactor-api/src/utils/create-schema.ts:142-145`).

Each value in `InvoiceFamily.modules` carries its version-specific reducer and actions, but its
`documentModel.global.specifications` contains the same complete ordered specification list. The
current Todo v1 and v2 generated document-model values are byte-identical in that property. A family
cannot publish one version with a partial view of the specification history.

Finalized modules remain ordinary mutable runtime objects. The compiler does not freeze a
specification or introduce cross-version object sharing that would make a mutation through one module
appear in another. Serialized content and version-specific behavior remain the compatibility contract; object
identity does not.

`version()` returns an opaque `DocumentModelVersionDefinition`, not a registrable module. Named
top-level version exports must come from the family result, never from version definitions.
This keeps worker-pool loading compatible and prevents one loader from seeing a partial specification
history while another sees the complete family.

## Execution and packaging

Finalization runs when the package module is imported. The closed descriptor printer is part of the
small code-first runtime and does not import `graphql-js`. No model-specific intermediate artifact can
become stale independently of the package build.

`tsc` alone cannot execute definition-time checks. `ph model check` passes the package's explicit
document-model and subgraph source entries to the tooling `checkDefinitions` Interface in chapter 08.
The tooling Module imports independent roots separately, normalizes named exports and collections,
validates definitions and families, materializes legacy state, parses printed SDL, and checks
duplicate IDs and action types. It does not scan version directories. An ESM import that throws is a
source-specific `import` diagnostic rather than a reason to lose reports from independent roots.

`--json` writes one `DefinitionCheckReport` to stdout. Exit `0` means `status: "ok"`, `1` means
`"invalid"`, and `2` means `"failed"`. Warnings exit `0` unless `--warnings-as-errors` is present.
The human view renders the same diagnostics and repair text; neither view invents source locations
that the runtime descriptor graph does not possess.

Package build and publication run the same definition check after a successful TypeScript check and
before producing publishable bundles. The current `ph build` is one implementation that emits its
browser and Node bundles, then catches a failing `tsc --build`
(`clis/ph-cli/src/services/build.ts:53-84`). The generated legacy package script already propagates
its typecheck failure. B9 changes the `ph build` order and failure propagation and adds the definition
check to release entry points.

Closures are compatible with the browser worker. Packages are dynamically imported inside the
worker and passed to `ReactorBuilder` by function call. Only serializable RPC method calls cross
`postMessage`. `DocumentModelModule` already contains reducer, action, and utility functions
(`packages/shared/document-model/types.ts:1680-1701`).

Reducers must be deterministic over prior state, validated raw input, and deterministic operation context.
The type system cannot prevent `Date.now()`, randomness, network reads, or mutable module globals.
Lint rules and cold replay tests enforce that rule in proportion to the risk.
