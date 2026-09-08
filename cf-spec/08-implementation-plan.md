# Implementation and evidence plan

The milestones, accountable roles, evidence artifacts, and budgets in this chapter are normative.
The status text in this chapter records the pre-implementation baseline. Current results live in
[the delivery tracker](./10-delivery-tracker.md).

This chapter defines the implementation order and the evidence contract. Runtime work remains an
`IMPLEMENTATION GATE`; deliberately excluded work is `DEFERRED` with a reopening condition. Neither
status means "almost supported."

## Interface decision

Three independent designs were compared against the same constraints: exact legacy replay and stored
specifications, no model-specific generated source, deterministic identities and SDL, portable
declarations, `BaseSubgraph` loader compatibility, agent-readable failures, and useful behavior at
300 fields.

| Design                    | Smallest useful Interface                                                                        | Benefit                                                                           | Cost                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Minimal staged context    | `ph`, `defineDocumentModel`, and `defineSubgraph`; family composition hangs from a model context | Very little to learn; high Depth                                                  | Family composition is asymmetric, and an import-time failure cannot be passed as a value to a public checker |
| Capability-token compiler | declarations produce opaque tokens; `compiler.compile` and `compiler.check` materialize them     | A versioned anchor for later auth, relationship, scope, and Federation extensions | Adds a public Interface and extension vocabulary before a second implementation or extension exists          |
| State-token common path   | `define.model`, `define.module({ on })`, `define.family`, and `define.subgraph`                  | Extracted modules carry scope typing without importing a model context            | The `on` token and cross-file inference have not passed the declaration and 300-field prototype              |

Core v1 keeps the staged Interface in chapters 02 and 04:

```ts
export { ph, defineDocumentModel, defineDocumentModelFamily, defineSubgraph };
```

That list is complete. `defineScalar` in [chapter 09](./09-scalar-catalog.md) is compiler-internal and
is deliberately absent from it; adding it would make scalar authoring a public capability that no
compatibility owner has accepted.

`context.module`, `context.version`, and single-version `context.finalize` preserve contextual typing
across files. `defineDocumentModelFamily` stays a top-level composition root because it combines
version contexts. Public context, module, operation, version, and family types are opaque; reducer
and resolver callbacks never appear in their emitted declarations.

The tooling Module has a separate Interface. It accepts configured source entries, imports each root
independently, and returns data even when a definition fails during module evaluation:

```ts
type DefinitionSource = {
  specifier: `./${string}`;
  exportPath?: readonly string[];
};

type DefinitionSourcesConfig = {
  formatVersion: 1;
} & (
  | {
      mode: "code-first";
      entries: readonly [DefinitionSource, ...DefinitionSource[]];
    }
  | { mode: "legacy"; entries?: never }
);

type DefinitionCheckRequest = {
  formatVersion: 1;
  profile: "edit" | "release";
  warningsAsErrors?: boolean;
} & (
  | {
      sourceMode: "code-first";
      sourceOrigin: "config" | "cli" | "request";
      sources: readonly [DefinitionSource, ...DefinitionSource[]];
    }
  | {
      sourceMode: "legacy";
      sourceOrigin: "config";
      sources?: never;
    }
);

type DefinitionCheckReport = {
  kind: "powerhouse.definition-check";
  formatVersion: 1;
  sourceSet: {
    mode: "code-first" | "legacy";
    origin: "config" | "cli" | "request";
    digest: `sha256:${string}`;
    sources: readonly DefinitionSource[];
  };
  definitions: readonly {
    kind: "document-model" | "subgraph" | "scalar" | "package";
    key: string;
    version?: number;
    digest?: `sha256:${string}`;
    source: DefinitionSource;
  }[];
  diagnostics: readonly DefinitionDiagnostic[];
  summary: { errors: number; warnings: number };
} & (
  | {
      status: "ok" | "invalid" | "failed";
      skipReason?: never;
    }
  | {
      status: "skipped";
      skipReason: "explicit-legacy-mode";
    }
);

type DefinitionDiagnostic = {
  code: `PH-${string}`;
  severity: "error" | "warning";
  phase:
    | "configuration"
    | "import"
    | "definition"
    | "composition"
    | "authorization"
    | "typecheck"
    | "package"
    | "replay";
  source?: DefinitionSource;
  definition?: {
    kind: "document-model" | "subgraph" | "scalar" | "package";
    key: string;
    version?: number;
  };
  path: readonly (string | number)[];
  message: string;
  expected?: string;
  received?: string;
  repair: string;
  related?: readonly {
    source: DefinitionSource;
    path: readonly (string | number)[];
    message: string;
  }[];
};

declare function checkDefinitions(
  request: DefinitionCheckRequest,
): Promise<DefinitionCheckReport>;
```

`DefinitionSource[]` comes only from the explicit selection rule below. The package's
`powerhouse.config.json` contains the versioned `definitionSources` field:

```json
{
  "definitionSources": {
    "formatVersion": 1,
    "mode": "code-first",
    "entries": [
      {
        "specifier": "./src/document-models/invoice.ts",
        "exportPath": ["invoiceFamily"]
      },
      {
        "specifier": "./src/subgraphs/billing.ts",
        "exportPath": ["billingSubgraph"]
      }
    ]
  }
}
```

Core v1 must add `definitionSources` to `PowerhouseConfig` and its closed JSON Schema. It must also
add a common `--config-file <path>` option to check, inspect, build, watch, prepack, and publish.
Neither exists in the pinned implementation. The selected config directory is the package root;
without the option, each command reads exactly `./powerhouse.config.json` from its working directory.
It does not walk parent directories. Each specifier is a POSIX package-relative path beginning with
`./`. It may not be absolute, escape the package root after normalization, or resolve through a
symlink outside that root. `exportPath` is an array of exact property keys from the imported module
namespace; an omitted or empty path selects the namespace root.

Repeatable CLI entries use `--source '<specifier>#<json-pointer>'`; the complete `#` fragment may be
omitted to select the namespace root. When present, the RFC 6901 pointer is empty or begins with `/`,
as in `--source './src/models.ts#/invoiceFamily'`. `~0` and `~1` encode `~` and `/` inside a property
key. Shell quoting is required. If at least one `--source` appears, the ordered CLI entries replace
the config entries in full. They are never appended. With no CLI entry, the config entries are used.
The config file itself must exist and parse because its directory defines the package root. A CLI
list replaces only `definitionSources`; the loader does not validate that ignored field. Without a
CLI list, a missing field, unsupported `formatVersion`, or empty `code-first` list is a configuration
failure with exit `2`. There is no conventional default and no source-tree scan. Build, inspect,
watch, prepack, and publish use this same resolution rule.

A scalar declaration is an ordinary entry under this rule and needs no parallel source field. It is
additionally subject to the package-identity gate in [chapter 09](./09-scalar-catalog.md): a resolved
scalar declaration whose package root is not the compiler-owned catalog is
`PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED`, reported like any other definition failure rather than
ignored.

An existing package that intentionally has no code-first roots must declare
`{"definitionSources":{"formatVersion":1,"mode":"legacy"}}`. With no CLI override, the tooling
Module imports nothing and returns `status: "skipped"` with
`skipReason: "explicit-legacy-mode"`. This is a machine-readable compatibility state, not release
approval. A repeatable `--source` list remains authoritative and selects `code-first` mode even when
the config says `legacy`.

`DefinitionSourceLoader` is the shared deep Module. It owns config and CLI resolution, package-root
containment, real-path identity, export traversal, ordering, revision caching, and diagnostic
locality. It depends on one narrow local-substitutable dependency:

```ts
interface TypeScriptSourceImportInterface {
  importModule(request: {
    packageRoot: string;
    specifier: `./${string}`;
    packageRevision: `sha256:${string}`;
    signal?: AbortSignal;
  }): Promise<Readonly<Record<string, unknown>>>;
}
```

The Interface imports one package-relative module for one package revision and returns its namespace.
Interactive check, inspect, and watch commands use `ViteTypeScriptSourceImportAdapter` and reuse one
Vite environment per package revision. Build, prepack, and publish supply an Adapter backed by their
already-created TypeScript or build graph; they must not boot a second Vite environment merely to
cross this Seam. Both Adapters run the same loader contract fixtures and return the same namespace
semantics.

The loader forms source identity from the resolved package-relative real path plus the exact export
path. Two entries with the same identity fail with `PH-CONFIG-DUPLICATE-SOURCE` and both config or CLI
positions. Different export paths from one module are valid; the selected Adapter imports that module
once per package revision. Sources are evaluated and reported by normalized package-relative
specifier and export path using the fixed code-unit comparator. Config order, CLI order, Adapter, and
machine root therefore cannot change the result. Distinct sources that return the same logical
definition remain a `PH-PKG-LOGICAL-COLLISION`; the loader never silently deduplicates them.

CLI, inspect, watch, build, prepack, and publish resolve this list before calling
`checkDefinitions`. A direct library test may construct the list only with `sourceMode: "code-first"`
and `sourceOrigin: "request"`; production commands may not use that escape hatch. The report returns
the selected mode, normalized list, and canonical JSON digest in `sourceSet`, which makes source
precedence inspectable without exposing a machine path.

The report schema permits `status: "skipped"` if and only if `sourceSet.mode` is `legacy`, its source
list is empty, its origin is `config`, and `skipReason` is present. It forbids `skipReason` for every
other status. A skipped report has no definitions or diagnostics and zero errors and warnings; its
source-set digest still binds the explicit legacy selection.

`checkDefinitions(request)` is a tooling export used by the CLI, build, and focused tests. Runtime
hosts validate normalized package values through the compiler's internal validator; they do not
re-import TypeScript authoring roots. This is not another authoring step. Expected definition failures
return `status: "invalid"`; import, configuration, or compiler failures return `status: "failed"`.
Diagnostics without a source sort as
`<config>`; the rest sort by source specifier, definition kind and key, version, path, then code using
the fixed code-unit comparator. JSON output contains no stack, timestamp, absolute path,
package-manager path, or nondeterministic duration.

`ph model check --json` reserves stdout for one report. Human logs go to stderr. Exit `0` means `ok`
or explicitly `skipped`, `1` means `invalid`, and `2` means `failed`. Callers must inspect `status`;
only `ok` can approve a release check. `--warnings-as-errors` changes the reported status and exit
code, not the underlying diagnostic severity.

Source specifiers in output are the normalized package-relative spellings; the import Adapter's
machine-specific canonical ID is never exposed. `expected` and `received` are deterministic summaries
capped at 512 Unicode code points; they never contain a raw production operation or state. `repair`
is one imperative action, not a link to generic documentation. Authorization diagnostics use this
shape with phase `authorization`, but their stable catalog is owned exclusively by
[chapter 03](./03-authorization.md#agent-readable-diagnostic-contract). The non-authorization
definition-check catalog introduced here includes:

| Code                                       | Meaning                                                                              |
| ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `PH-CONFIG-SOURCES-MISSING`                | No nonempty V1 definition-source list was selected                                   |
| `PH-CONFIG-VERSION-UNSUPPORTED`            | `definitionSources.formatVersion` is absent from the supported set                   |
| `PH-CONFIG-SOURCE-INVALID`                 | A source spelling or export pointer is malformed                                     |
| `PH-CONFIG-SOURCE-OUTSIDE-PACKAGE`         | A normalized path or symlink target leaves the selected package root                 |
| `PH-CONFIG-DUPLICATE-SOURCE`               | Two configured entries resolve to the same module ID and export path                 |
| `PH-IMPORT-FAILED`                         | One configured source could not be imported; independent roots were still checked    |
| `PH-DEF-FIELD-OPTION-UNSUPPORTED`          | A field use contains a validation option other than `required`                       |
| `PH-DEF-TYPE-AS-FIELD`                     | A named type is used as a field without `ph.ref`                                     |
| `PH-DM-DUPLICATE-ACTION`                   | Two operations derive the same persisted action type                                 |
| `PH-DM-IDENTITY-INVALID`                   | An identity segment, compatibility ID, or derived UUID violates the V1 contract      |
| `PH-DM-STATE-ROOT-INVALID`                 | A required state root is absent, is not an object, or has the wrong canonical name   |
| `PH-DM-SCOPE-UNSUPPORTED`                  | A definition requests a scope outside `global` or `local`                            |
| `PH-GQL-COORDINATE-OWNED`                  | Report-only: two subgraphs own one coordinate under the later `PH-COMP-1` policy     |
| `PH-GQL-SHARED-DEFINITION-MISMATCH`        | Report-only: repeated shared definitions differ under that later policy              |
| `PH-GQL-FEDERATION-UNSUPPORTED`            | A core-v1 code-first subgraph requests Federation 2 authoring semantics              |
| `PH-SCALAR-AUTHOR-DECLARATION-UNSUPPORTED` | A public definition source attempts to declare a scalar outside the compiler catalog |
| `PH-SCALAR-DUPLICATE-NAME`                 | Compiler catalog entries duplicate a `(name, validationProfile)` binding             |
| `PH-SCALAR-UNREGISTERED`                   | Report-only: current SDL reaches a scalar absent from catalog metadata               |
| `PH-SCALAR-RESOLVER-SHADOWED`              | Report-only: an authored resolver uses a catalog scalar name                         |
| `PH-SCALAR-CONFORMANCE-FAILED`             | A compatibility outcome drifts, or an X-scalar declaration fails strict conformance  |
| `PH-SCALAR-COERCION-NORMALIZES`            | X-scalar: a strict coercion returns a value different from its accepted input        |
| `PH-SCALAR-VALUE-NOT-JSON`                 | X-scalar: a strict persistable declaration accepts a non-JSON value                  |
| `PH-SCALAR-ZERO-VALUE-INVALID`             | A zero value is absent, or a declared value its own coercion rejects                 |
| `PH-SCALAR-EXEMPTION-UNAUTHORIZED`         | A declaration carries a divergence exemption it may not hold                         |
| `PH-SCALAR-POSITION-UNSUPPORTED`           | X-scalar: a later profile rejects a scalar from a persisted position                 |
| `PH-SCALAR-FACTORY-AS-FIELD`               | A scalar field-use factory is used as a field without being called                   |
| `PH-PKG-LOGICAL-COLLISION`                 | Distinct package values have the same model, manifest, or subgraph logical key       |
| `PH-REPLAY-DIVERGENCE`                     | Legacy and code-first results differ at a named history coordinate                   |

Rows marked report-only or X-scalar are warnings in core v1 and cannot reject an equivalent
definition. Codes are append-only within report format V1. A more specific new code may replace a generic
internal code only in the next report format; tests and agents can therefore branch on them safely.

The `phase` union needs no new member for scalars. A declaration failure is `definition`, a
registration or identity failure is `package`, and a schema-assembly failure is `composition`. That
union stays closed.

## Developer and agent loop

The ordinary loop has no generate, sync, or naming step:

```text
edit TypeScript -> incremental tsc -> ph model check --json -> focused tests
```

The `edit` profile runs import, definition, identity, family, standalone schema, house-policy, and
collision checks and reuses unchanged digests. The `release` profile additionally runs typecheck,
packed-consumer, and exact-composition checks, then verifies the commit, toolchain, package, family,
and fixture digests of the approved replay, migration, agent, and performance artifacts selected by
the package. CI produces those expensive artifacts; build and publication do not rerun an agent study.
`ph model check` defaults to `edit`; `ph model check --release`, build, prepack, and publish use
`release`. A successful edit profile is never reported as release approval.
A skipped legacy package is never counted as release evidence for B9 or any dependent gate.

`ph model inspect <documentType>@<version> --json`,
`ph subgraph inspect <name> --json`, and `ph scalar inspect <name> --json` print the exact structured
definition, digest, compatibility and Federation profile, source export, and compiler version. They
write nothing. `ph scalar inspect` additionally prints the declared vector, `acceptanceDigest`,
coercion source, and any recorded divergence exemption, so an accepted-set change is comparable
between releases without reading the catalog implementation. Inspect output uses a
versioned envelope and the same canonical JSON data as the golden fixture, so an agent can compare
facts without scraping SDL or a formatted exception.

Watch mode invokes the same tooling Module and cancels a superseded run with `AbortSignal`. Every
request promise settles. It caches pure work by digest, but it rebinds closures after a changed import
and emits one complete report for the newest package revision. Editors consume the in-process result;
CLI watch mode renders human output to stderr and newline-delimited versioned reports only when
`--json-lines` is explicit.

There is no automatic `--fix` in v1. Identity, compatibility, reducer, access, and migration repairs
can change persisted behavior; a deterministic repair instruction is safer than an unreviewed edit.
Tooling may later offer a patch only for a code whose catalog entry defines one semantics-preserving
transformation.

## Module and Adapter placement

The definition compiler is the deep Module. Naming, identity, descriptor validation, Zod creation,
raw-input validation, action construction, reducer dispatch, complete family materialization, direct
GraphQL AST construction, resolver assembly, canonical printing, diagnostics, and digest caching
stay behind its Interface.

The normalized structured definition is a real Seam because it has two Adapters:

- `LegacyDocumentModelModuleAdapter`
- `CodeFirstDocumentModelSourceAdapter`

The subgraph implementation uses a direct descriptor-to-`DocumentNode` walk. Pothos is not retained
as a `SubgraphCompiler` Adapter: there is one selected implementation, so that would be a
hypothetical Seam. A second live implementation can justify an internal Interface later.

TypeScript, packed-package checks, composition, and replay are local-substitutable dependencies.
Evidence runs the real locked tools against controlled fixtures. They do not appear in the author
Interface.

Package import remains behind each current host Adapter. Core v1 adds no common runtime package
normalizer or activation Interface. Definition checking uses `DefinitionSourceLoader`; it does not own
editors, apps, processors, stylesheets, routes, subscriptions, or runtime cache replacement.

Release CI still records the packed artifact digest used by migration evidence. Deployment uses each
host's current process and registration lifecycle. A pilot may require a fresh process or worker
generation. If old and new artifacts can serve together, the exact ordered pair needs mixed-revision
evidence. Otherwise orchestration drains traffic.

A package-wide prepare and compare-and-swap Interface is follow-up host work. It needs two real
Adapters, pure construction, post-swap activation, disposal, and a complete package shape before it
can claim atomic replacement.

## Milestones and accountable roles

An accountable role is binding for planning; the delivery tracker must replace it with one repository
handle before work enters `IN PROGRESS`.

| Milestone             | Exit condition                                                                                                                                           | Accountable role            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| M0: tooling baseline  | The current build propagates type and definition failures; config and source options are implemented; baseline fixtures and budgets are committed        | Build tooling lead          |
| M1: compiler proof    | Descriptor compiler, model family, subgraph compiler, stable identity, diagnostics, profiled scalar metadata, and golden definitions pass isolated tests | Definition compiler lead    |
| M2: host integration  | Current loader shapes, named worker exports, GraphQL augmentation, resolver bindings, and host-specific registration behavior pass parity fixtures       | Package platform lead       |
| M3: pilot migration   | One complete family passes parity, cold replay, packed consumer, production canary, rollback, and agent evaluation                                       | Migration lead              |
| M4: default authoring | Approved performance and DX budgets pass for real packages; code-first is the default new-model path                                                     | Developer experience lead   |
| M5: legacy retirement | Every selected family has completed its canary and hash-bound retirement plan; legacy GUI ownership is reviewed separately                               | Product and migration leads |
| X: later extensions   | Each extension meets its explicit reopening conditions and ships under a new feature or definition version                                               | Named extension owner       |

Milestones are capability checkpoints, not calendar releases. A release identifier and named handle
must be added to the implementation tracker before M0 begins.

The scalar catalog has no milestone of its own. Name and profile metadata are compiler work under M1.
Current GraphQL binding parity is host evidence under M2. Activating package scalar coercers belongs
to X-scalar.

## Evidence workspace

A conforming implementation adds one workspace package at `test/code-first-definitions`. Its
committed layout is the contract below; CI result files are uploaded under the repository commit and
toolchain digest.

```text
test/code-first-definitions/
  budgets/
    author-loop-v1.json
    runtime-v1.json
    typescript-v1.json
  fixtures/
    agent-eval/v1/
    author-loop/v1/
    authorization/v1/
    definitions/v1/document-model/
    definitions/v1/subgraph/
    histories/v1/
    migrations/v1/
    model-sdl/v1/
    packed-consumers/browser-worker/
    packed-consumers/node/
    packages/v1/
    protocol/v1/
    reproductions/v1/
    retirement/v1/
    scalars/v1/
    subgraphs/v1/
    subscriptions/v1/
    typescript/20/
    typescript/100/
    typescript/300/
  schemas/
    agent-evaluation-protocol-v1.schema.json
    authorization-prerequisites-v1.schema.json
    definition-check-report-v1.schema.json
    document-model-definition-v1.schema.json
    equivalence-report-v1.schema.json
    gate-evidence-report-v1.schema.json
    gate-fixture-manifest-v1.schema.json
    retirement-plan-v1.schema.json
    scalar-definition-v1.schema.json
    subgraph-definition-v1.schema.json
  scripts/
    measure-language-service.mts
    measure-production.mts
    measure-typescript.mts
    run-gate-evidence.mts
  tests/
    agent-evaluation.test.ts
    authorization-prerequisites.test.ts
    author-loop.test.ts
    failure-propagation.test.ts
    gate-evidence-report.test.ts
    migration-lifecycle.test.ts
    model-sdl.test.ts
    model-parity.test.ts
    package-normalizer.test.ts
    packed-declarations.test.ts
    prefix-replay.test.ts
    production-budgets.test.ts
    protocol-matrix.test.ts
    scalar-catalog.test.ts
    subgraph-contract.test.ts
    typescript-budgets.test.ts
```

The reproduction fixture covers the locked scalar inventory, Zod metadata behavior, direct printing,
Apollo composition including the Federation negative case, browser and Node bundle resolution, and
the TypeScript declaration prototype. It replaces ephemeral `/tmp` scripts as the durable source of
those claims.

Golden definition fixtures contain only JSON-safe structured data. They include every union variant,
nullability form, recursive list, compatibility mode, model metadata field, state and operation
example, error, computed field, union resolver, resolver-owned authorization marker, subscription binding,
compatibility-AST directive node, and scalar reference. The matching JSON Schema rejects unknown properties. A published V1
fixture never changes; a format change adds a new directory and Adapter.

The specification review vectors are checked in at
[`fixtures/v1/document-model-definition.json`](./fixtures/v1/document-model-definition.json),
[`fixtures/v1/subgraph-definition.json`](./fixtures/v1/subgraph-definition.json), and
[`fixtures/v1/scalar-definition.json`](./fixtures/v1/scalar-definition.json). The evidence package
copies their bytes into its golden set and adds the exhaustive variants; it does not reinterpret them.
Revising a V1 review vector before publication is not a format break: no V1 fixture has been published
under the immutability rule above, and no implementation reads one yet.

### Separate X-auth and X-scalar evidence

`fixtures/authorization/v1/manifest.json`, executed by
`tests/authorization-prerequisites.test.ts`, is the durable `X-auth` evidence coordinate. Its contract
is the acceptance matrix in [chapter 03](./03-authorization.md#acceptance-matrices), covering C0.3 and
C1.1 through C1.5. The manifest retains each C ID and the policy, feature-mode, verdict, diagnostic,
state, allocation, cleanup, and replay fields required there. X-auth owns credential leases and the
new subscription lifecycle. B7 owns only parity with current subscription and transport behavior.

`X-scalar` is a separate extension evidence track on the same terms. B14 measures that the catalog
records the installed scalar metadata and reproduces current host binding; it does not promote `Amount`, retire
`document-engineering-1.40`, or discharge any part of X-scalar. A recorded divergence exemption leaves
C2.3 deferred, and only X-scalar retires one.

`X-auth` is a separate extension evidence track, not a `GateId`; it cannot satisfy a B-gate dependency or
emit a core gate pass. Its contract status is `spec-complete` and its implementation evidence is
`not-established`. Model-declared authorization remains deferred even after the X-auth extension evidence
eventually passes.

## TypeScript and editor budgets

All measurements use the locked TypeScript version, a clean process, the same compiler options, and
an otherwise identical baseline fixture. CI records CPU, memory, operating system, Node version,
TypeScript version, five warm-up runs, and twenty measured runs. The committed budget file stores the
approved reference machine and baseline digest.

B4 sorts the twenty measured values as exact integers in the metric's base unit and uses the
one-based nearest-rank rule: percentile fraction `p` is element `ceil(p * 20)`. Thus p50 is rank 10
and p95 is rank 19. It rounds only for display and compares the unrounded integer to the budget. The
maximum is rank 20. Warm-ups never enter a percentile or baseline ratio.

|    Fixture | Marginal type instantiations | Public declaration | Isolated check p95 | Declaration emit p95 |
| ---------: | ---------------------------: | -----------------: | -----------------: | -------------------: |
|  20 fields |                     `<= 750` |         `<= 2 KiB` |        `<= 0.50 s` |          `<= 0.10 s` |
| 100 fields |                   `<= 2,500` |         `<= 6 KiB` |        `<= 0.75 s` |          `<= 0.15 s` |
| 300 fields |                   `<= 5,000` |        `<= 12 KiB` |        `<= 1.00 s` |          `<= 0.25 s` |

Repository `tsc --build --extendedDiagnostics` may add at most 10% to check time, peak memory, and
instantiations relative to the committed baseline. A budget cannot be raised in the implementation
change that exceeds it; that requires a separate reviewed baseline change with the raw report.

For the 300-field editor fixture, warm p95 latency is `<= 250 ms` for completion, `<= 500 ms` for
semantic diagnostics, and `<= 750 ms` for hover and rename. Each metric must also be no worse than
1.20 times the legacy baseline. One TypeScript process checks a package; the implementation may not
spawn one compiler per definition.

## Runtime and scalability budgets

Compiler-owned descriptor traversal is `O(V + E)` time and `O(V)` memory. Canonical object-member
sorting is `O(N log N)` in the encoded member count. Apollo composition is measured separately; the
specification does not assign its external algorithm a false linear bound.

`measure-production.mts` records raw and gzip bytes, fresh-process import p50/p95, model
materialization, standalone subgraph construction, and composition at 20, 100, and 300 fields and at
1, 5, and 20 subgraphs. Core v1 must satisfy both conditions:

- the shared compiler adds no more than 35 KiB gzip to a consumer that uses both models and
  subgraphs, and each real code-first family is no larger gzip than its legacy generated family;
- 300-field model materialization is `<= 25 ms` p95, standalone subgraph construction is `<= 100 ms`
  p95, and the exact production subgraph set composes in no more than 1.20 times its legacy baseline.

These are cold reference-machine gates, not per-request promises. No compiler, validation,
standalone-schema, or composition pass runs per request. Pure structured work may be cached by
definition format, explicit compatibility modes, compiler version, locked GraphQL/Apollo set, and
definition digest. Compiler cache measurements must stay bounded for one check or materialization
run. Runtime hosts retain their current cache and replacement behavior; core v1 does not add
generation ownership or eviction.

Every B12 timing and heap cell runs five unreported warm-ups and twenty measured samples,
sequentially, with one fresh locked-Node process per sample and a fixed environment allowlist. The
runner executes no other performance cell concurrently. It uses the B4 nearest-rank rule on integer
nanoseconds or bytes and converts units only for display. A cold sample begins before the first
package import; no module, compiler, schema, composition, or digest cache survives from another
sample. Size is computed once from immutable bytes and verified by digest before every process run.

The manifest enumerates every emitted bundle file by package-relative path. Raw bytes are the sum of
their exact lengths in fixed code-unit path order. Each file is compressed independently with locked
Node zlib, no filename, `mtime: 0`, level 9, `Z_DEFAULT_STRATEGY`, `windowBits: 15`, and `memLevel: 8`;
gzip bytes are the sum of those lengths. The report records Node and zlib versions plus each compressed
digest. A runner with different compression settings is blocked, not compared to the budget.

The 100-registration retained-memory case starts Node with `--expose-gc`. It records a baseline after
three `global.gc()` calls, each followed by one awaited `setImmediate`, then sends equivalent legacy
and code-first inputs through the same current host lifecycle in separate processes. After the host
settles, it repeats the three-cycle collection and records `heapUsed` and the observable cache
inventory. Code-first passes when its retained heap and cache growth meet the budget and match the
legacy run. The test does not require disposal acknowledgements, a prepare phase, or removal of cache
entries that the current host retains. A forced-GC failure blocks the measurement rather than
producing a pass. Cache parity is an all-samples assertion; it is not reduced to a percentile.

## Definition-source normalization and later logical selectors

Core v1 keeps named top-level version exports. `DefinitionSourceLoader` normalizes only the entries
selected for definition checking and reports collisions within that explicit set. Runtime hosts keep
their current namespace traversal, predicates, split subpaths, duplicate outcomes, and named worker
references. B8 compares each host with its own legacy fixture; it does not require one runtime
package shape.

A later X-loader release may make all hosts consume a complete package normalizer. Only after that
rollout may worker protocol V2 select a normalized logical key instead of an export spelling:

```ts
type LogicalModuleRef = {
  formatVersion: 2;
  source:
    | { packageName: string; filePath?: never }
    | { filePath: string; packageName?: never };
  selector: {
    kind: "document-model";
    documentType: string;
    version: number;
  };
};
```

In that later release, the worker accepts V1 named-export references and V2 logical references during coexistence. It
resolves both through the normalizer and records the logical key in diagnostics. Aggregate-only
exports remain unavailable until no deployed caller emits V1. This protocol migration cannot satisfy
or fail a core-v1 gate. The worker does not execute subgraphs, so the proposed protocol does not gain
a hypothetical subgraph selector; a future GraphQL host design can select normalized subgraphs by
name after it has a second real Adapter.

## Migration corpus and privacy

The replay gate has two corpora:

- checked-in synthetic raw histories cover every protocol outcome, scope, supported version,
  upgrade edge, error branch, and retirement failure;
- production-derived histories run only inside an access-controlled, read-only, ephemeral verifier.

The production sample is stratified by family/version, history-length band, action type, global and
local activity, validation/domain/deny outcome, undo/redo/prune, and upgrade path. Raw operations,
states, identifiers, and signatures never leave that environment. The verifier retains only a
scrubbed manifest, compiler and family digests, coverage counts, diagnostic codes, and equivalence
summary. It uses keyed digests for stable within-run grouping, destroys the key and raw workspace at
the end, and records privacy/security approval. Any divergence retains only its fixture coordinate;
an authorized engineer investigates the raw value in place.

Cold replay streams both implementations from the same initial state and compares after every
operation. It is `O(n)` reducer applications for an `n`-operation history, not `O(n^2)` restarts for
every prefix. "Every prefix" means every successive state produced by that stream. Incoming hashes
are blanked, recorded errors are cleared, shortcuts are disabled, and hashes are recomputed directly
for every scope.

## Agent evaluation

The V1 task set covers: add a state field and operation; add a local operation; rename with a
compatibility identity; add a subgraph query and computed field; add a subscription with resolver-owned authorization;
repair a duplicate GraphQL name; remove an unsupported field option; add a version and upgrade;
diagnose a loader collision; and interpret a replay mismatch.

The pairing unit is one `(taskId, trialIndex)` row with a legacy arm and a code-first arm. The protocol
assigns stable task IDs, a `trialsPerTask` of at least ten, and a 64-character lowercase hexadecimal
`rootSeed`. `trialId` is `<taskId>:<trialIndex padded to four digits>`. Both arms start from byte-equal
fresh worktrees and receive the same task text, acceptance-test digest, agent and model version, tool
set, network policy, context budget, and timeout. They run sequentially in separate agent sessions;
only the authoring Interface differs.

For each pair, derive `pairSeed` as SHA-256 over the UTF-8 bytes of
`B11-pair-v1\0<rootSeed>\0<protocolDigest>\0<trialId>`. First byte modulo two `0` means legacy first;
`1` means code-first first. Order pairs by the fixed code-unit order of SHA-256 over
`B11-schedule-v1\0<pairSeed>`, breaking an equal hash by `trialId`. This fixes both randomization
steps without a runtime PRNG or mutable global seed. The protocol digest, seeds, schedule, and
acceptance criteria are committed before any arm runs.

An authored failure, agent error, tool error caused by the authored change, or timeout is a completed
arm with success `0`. A timeout records the configured limit as elapsed time and retains tokens
reported before cancellation. It is never excluded. Runner loss, an unreadable base fixture, or a
missing provider usage record is an infrastructure failure. It invalidates the entire pair, retains
both arm attempts, and blocks B11 until the same `trialId` is rerun from a fresh worktree. There are no
post-result exclusions, replacement task IDs, or successful-arm-only denominators. A task whose
legacy arm cannot complete remains in the statistic as a failure.

The protocol enumerates the infrastructure codes and authored-failure codes before execution. The
runner may not reclassify a result from message text or add a code after observing an arm. A rerun
increments `attemptIndex`; the result table uses the first attempt in which both arms are complete and
retains every earlier attempt in `infrastructure-attempts`.

After each agent turn that changes an authoring file, the harness records the tree digest. After the
arm ends, it evaluates each distinct digest with the locked typecheck, definition check, and focused
acceptance precheck without showing those results to the agent. A digest that fails any precheck is
one invalid intermediate. A repair turn is a later agent turn that changes an authoring file after
the first invalid intermediate. Setup and offline evaluation time are excluded from elapsed time;
the clock starts when the task is delivered and ends at the terminal answer, terminal error, or
timeout.

Token counts come only from the provider usage object attached to each model response. The harness
records provider, usage-schema version, input tokens, cached-input tokens when present, output tokens,
and reasoning tokens when separately exposed. The committed protocol pins a field mapping for that
usage-schema version. Normalized input is the provider's total-input field, or uncached plus cached
input when no total exists. Normalized output is the provider's total-output field, or visible plus
reasoning output when no total exists. `totalTokens` is normalized input plus normalized output; no
field is counted twice. The arm total is the sum across responses. An unrecognized usage schema
blocks the pair, and the harness never estimates tokens from text.

The success statistic is the macro-average of the ten task-level means of the paired difference
`codeFirstSuccess - legacySuccess`. Its interval is a stratified paired percentile bootstrap with
10,000 resamples. Within every resample and task, sample that task's complete pair rows with
replacement. Draw index `j` for resample `r` from the first unsigned 64-bit big-endian word of
SHA-256 over `B11-bootstrap-v1\0<protocolDigest>\0<resultTableDigest>\0<r>\0<taskId>\0<j>`, modulo the
task's pair count. `resultTableDigest` is canonical JSON over complete rows sorted by task ID and
trial index; `r` and `j` are zero-based unpadded decimal ASCII. Sort the 10,000 macro-averages and use
one-based nearest ranks 250 and 9,750 as the two-sided 95% interval.

Code-first passes the statistical checks when the interval's lower bound is at least `-0.05`; repair
turns and invalid intermediates per scheduled arm are each at most 75% of legacy; and median elapsed
time and median `totalTokens`, across all completed arms including failures and timeouts, are no worse
than 1.10 times legacy. When a legacy repair or invalid-intermediate total is zero, the code-first
total must also be zero. Any task with fewer than `trialsPerTask` complete pairs blocks the gate.
Each arm median uses the same one-based nearest-rank p50 rule as B4 over its sorted integer values;
it does not average the two center values.

## X-auth subscription fixtures and core retirement fixtures

The subscription fixtures below belong to X-auth. They do not gate core v1. They prove denial before
source allocation, successful delivery, permission
allow-to-revoke transition, rejected authorization lookup, changed event target, all-documents
policy, credential expiry, credential revocation, client disconnect, source error, and exactly-once
cleanup. Each fixture asserts that a denied payload never reaches the authored resolver. Required
credentials close the WebSocket with `4401` at expiry or revocation; the transport Adapter disposes
all sources once.

Retirement fixtures cover a changed repository commit, report digest, family digest, root, normalized
path, content hash, symlink, missing path, extra path, untracked path, live import, failed masked
typecheck, failed packed load, failed replay, failed rollback, and post-stage failure. Every mismatch
leaves the complete legacy tree recoverable and exits nonzero.

## Gate evidence Module

Everything in this section is normative design. Present-tense verbs state what a conforming
implementation must do; they are not claims about artifacts or runs that exist today.

The evidence runner is a deep Module with one Interface for all fourteen gates. A caller selects a
gate and a committed fixture manifest. The Module owns fixture validation, dependency checks,
process isolation, sharding, cancellation, stable report ordering, artifact hashing, and exit codes.
Gate implementations stay behind internal seams. Tests inject failure Adapters at those seams;
release evidence uses the locked production tools.

```ts
type GateId =
  | "B1"
  | "B2"
  | "B3"
  | "B4"
  | "B5"
  | "B6"
  | "B7"
  | "B8"
  | "B9"
  | "B10"
  | "B11"
  | "B12"
  | "B13"
  | "B14";

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

type GateEvidenceRequest = {
  formatVersion: 1;
  gate: GateId;
  repositoryRoot: string;
  fixtureManifest: string;
  artifactDirectory: string;
  dependencyReports: readonly string[];
  shard?: { index: number; count: number };
  signal?: AbortSignal;
};

type GateEvidenceReport = {
  kind: "powerhouse.gate-evidence";
  formatVersion: 1;
  gate: GateId;
  contract: {
    status: "spec-complete";
    revision: `sha256:${string}`;
  };
  evidence: {
    outcome: "pass" | "fail" | "blocked" | "cancelled";
    reasonCode?: `PH-${string}`;
  };
  repository: {
    commit: string;
    baseTreeDigest: `sha256:${string}`;
    baseDirty: false;
    appliedPatchDigest?: `sha256:${string}`;
  };
  toolchain: {
    lockfileDigest: `sha256:${string}`;
    runnerVersion: string;
    node: string;
    packageManager: string;
    platform: string;
    tools: Readonly<Record<string, string>>;
  };
  fixture: {
    manifest: string;
    fixtureVersion: string;
    manifestDigest: `sha256:${string}`;
    schemaDigest: `sha256:${string}`;
    caseCount: number;
  };
  dependencies: readonly {
    gate: GateId;
    outcome: "pass";
    contractRevision: `sha256:${string}`;
    fixtureManifestDigest: `sha256:${string}`;
    reportDigest: `sha256:${string}`;
  }[];
  command: {
    name: "gate-evidence";
    args: readonly string[];
    cwd: "<repository>";
  };
  assertions: readonly {
    id: string;
    outcome: "pass" | "fail" | "blocked" | "cancelled";
    expected: string;
    received: string;
    artifactRefs: readonly string[];
  }[];
  measurements: readonly {
    name: string;
    unit: string;
    samples: number;
    warmups: number;
    p50: number;
    p95: number;
    maximum: number;
    limit: number;
    baselineRatio?: number;
    outcome: "pass" | "fail";
  }[];
  artifacts: readonly {
    name: string;
    path: string;
    mediaType: string;
    bytes: number;
    digest: `sha256:${string}`;
    retention: "committed" | "ci-immutable" | "restricted";
  }[];
  results: Readonly<Record<string, JsonValue>>;
  summary: {
    passed: number;
    failed: number;
    blocked: number;
    cancelled: number;
  };
};

declare function runGateEvidence(
  request: GateEvidenceRequest,
): Promise<GateEvidenceReport>;
```

The CLI invokes the same Interface:

```sh
pnpm --filter @powerhousedao/code-first-definitions evidence \
  --gate B1 \
  --manifest fixtures/definitions/v1/manifest.json \
  --out .evidence/B1 \
  --json
```

Stdout contains one report. Progress goes to stderr. Exit `0` means `pass`, `1` means `fail`, `2`
means `blocked`, and `130` means `cancelled`. The runner writes into a staging directory and renames
the complete artifact set only after every declared file has a digest. A failed or blocked run still
retains its report and diagnostics. A cancelled run settles every child process and promise before it
returns, emits one report with the cancellation reason, and removes its staging directory. It never
publishes a partial artifact set.

Every fixture manifest has `formatVersion`, `gate`, `fixtureVersion`, an ordered `cases` array, an
explicit seed where randomness is used, expected outcomes, required tool versions, schema digest, and
a `directDependencies` array matching the dependency table below. Each dependency entry pins its gate,
contract revision, and fixture-manifest digest. Directory scanning never selects cases. A manifest
change creates a new digest and invalidates older approval. A gate cannot raise its budget in the same
change that exceeds it.

`gate-evidence-report-v1.schema.json` uses a closed `oneOf` branch for each gate. The branch makes
that gate's fields listed under "The report retains" below required and rejects unknown result fields.
`baseDirty` describes the checkout before fixture setup; a gate such as B13 records its controlled edit
in `appliedPatchDigest` without turning the base checkout into an untracked input.

Reports use package-relative paths and fixed code-unit ordering. They contain no access token, raw
production operation, raw state, signature, absolute path, or unrestricted environment dump. The
runner records monotonic durations and sequence numbers, not wall-clock timestamps. The
runner rejects a report with an undeclared artifact, missing digest, unknown assertion ID, incomplete
shard set, or dependency report from another commit or lockfile. It also rejects a dependency whose
gate, contract revision, fixture-manifest digest, or report digest does not match the current manifest
and supplied file. `--verify-report <path>` checks these rules without rerunning the gate.

Shards must use the same repository, toolchain, manifest, and contract digests. Their case IDs must be
disjoint and cover the manifest exactly. The merger sorts by case ID and recomputes the summary. Cold
import, memory, cancellation, reload, and agent trials never reuse cached measurements. Pure canonical
encoding may reuse a digest cache; the report records every cache hit.

Committed fixtures and schemas live under `test/code-first-definitions`. CI retains reports and large
artifacts under
`<commit>/<lockfile-digest>/<gate>/<contract-revision>/<manifest-digest>/`. `restricted` artifacts
remain inside the approved verifier and contribute only a scrubbed digest and summary to the ordinary
report. Retention is at least two supported release lines and never less than 180 days.

## Gate order and evidence status

Dependency order controls acceptance, not diagnosis. An engineer or agent may run any gate to inspect
a failure. The runner can emit `pass` only when every direct dependency has a conforming pass report
for the same commit and lockfile. CI schedules gates by the layer below and may run gates in the same
layer in parallel.

The machine value `spec-complete` renders as ledger status `SPEC COMPLETE`; `not-established` renders
as `NOT ESTABLISHED`. They are the same concepts, not a second status vocabulary.

| Layer | Gate | Owner                     | Target | Direct dependencies | Contract status | Implementation evidence |
| ----: | ---- | ------------------------- | ------ | ------------------- | --------------- | ----------------------- |
|     0 | B9   | Build tooling lead        | M0     | none                | `spec-complete` | `not-established`       |
|     1 | B1   | Definition compiler lead  | M1     | B9                  | `spec-complete` | `not-established`       |
|     2 | B3   | Platform runtime lead     | M1     | B1, B9              | `spec-complete` | `not-established`       |
|     2 | B4   | Developer experience lead | M1     | B1, B9              | `spec-complete` | `not-established`       |
|     2 | B6   | GraphQL compiler lead     | M1     | B1, B9              | `spec-complete` | `not-established`       |
|     3 | B2   | Migration lead            | M3     | B1, B3, B9          | `spec-complete` | `not-established`       |
|     3 | B7   | GraphQL runtime lead      | M2     | B6, B9              | `spec-complete` | `not-established`       |
|     3 | B8   | Package platform lead     | M2     | B1, B9              | `spec-complete` | `not-established`       |
|     4 | B5   | Package platform lead     | M2     | B4, B8, B9          | `spec-complete` | `not-established`       |
|     3 | B14  | Scalar catalog lead       | M1     | B1, B6, B9          | `spec-complete` | `not-established`       |
|     5 | B10  | Migration lead            | M3     | B2, B3, B5, B8, B9  | `spec-complete` | `not-established`       |
|     5 | B12  | Performance lead          | M4     | B4, B5, B7, B8, B9  | `spec-complete` | `not-established`       |
|     6 | B11  | Developer experience lead | M3     | B1, B6, B7, B10     | `spec-complete` | `not-established`       |
|     6 | B13  | Developer experience lead | M4     | B4, B5, B8, B9, B12 | `spec-complete` | `not-established`       |

`not-established` is deliberate. Existing tests, scratch measurements, local runs, and partial
fixtures can guide implementation, but they cannot populate a pass report until the fixture and
runner contracts below exist and execute at the locked commit.

## Executable gate contracts

### B1: model parity

The fixture is `fixtures/definitions/v1/manifest.json`. It lists the exact chapter 00 corpus:
document-drive, reactor-group, the five Vetra models, package-e2e Todo, and versioned Todo. These nine
roots contain ten specification versions. Each case names the legacy source, code-first source,
expected structured JSON, JSON Schema, expected stored `DocumentModelPHState`, and expected identity
vector. Embedded schema, reducer, template, example, and error strings are fixture bytes, not
normalized prose. Negative cases pass each rejected field validation option from chapter 01 through a
JavaScript definition source and expect `PH-DEF-FIELD-OPTION-UNSUPPORTED`. State-root negative cases
cover an absent global root, input, enum, and union roots, a field use, and incorrectly named global
and local object roots; each expects `PH-DM-STATE-ROOT-INVALID`. A positive empty-local case uses
`schema: null` with `initialValue: {}` and asserts the canonical empty materialization.

The cases include an unreachable descriptor-supported type and a legacy AST with a schema definition,
directive definition and use, and type extension. They assert that descriptor projection retains the
former, GraphQL compatibility projection retains the complete latter AST in source order, and neither
path adds or removes a definition. State and operation examples assert `{ id, key, value }` in the
structured definition and `{ id, value }` in stored state. Migration cases assert the exact
`legacy-id:${legacyId}` key for every unique legacy example and require a semantic compatibility key
for duplicate IDs.

The error cases include a stored `code` that differs from `name`, null and empty-string metadata, and
one generated class key used by two operations with different descriptions. They assert the ordered
per-operation error arrays and IDs independently; a shared runtime class cannot merge stored
occurrences.

The runner executes `model-parity.test.ts` in fresh processes and emits assertion IDs `B1.schema`,
`B1.structured`, `B1.stored-state`, `B1.identity`, `B1.order`, `B1.field-options`, `B1.state-root`, and
`B1.repeat-import`. B1 passes only when every valid source validates, every negative source returns
its expected diagnostic, both implementations are canonically deep-equal to the golden data, every
string and array order is exact, every ID matches its vector, and two cold imports produce the same
digest. Missing cases and unexpected definitions fail the gate.

`results.cases[]` requires `caseId`, `documentType`, `version`, `legacySource`, `codeFirstSource`,
`structuredDigest`, `storedStateDigest`, `identityVectorDigest`, `coldImportDigests`, `schemaOutcome`,
and nullable `firstDifference`. Required `committed` artifact names are `fixture-manifest`,
`definition-schemas`, `definition-goldens`, and `identity-vectors`.

### B2: raw replay

The fixture is `fixtures/histories/v1/manifest.json`. It names every synthetic raw history, initial
state, document type and version, operation count, covered action types, scopes, outcomes, upgrade
edges, and expected prefix artifact. It also names the approved production stratum manifest by digest;
the raw production corpus is a `restricted` artifact.

The runner streams each history once through legacy and code-first reducers with incoming hashes
blanked, recorded errors cleared, and replay shortcuts disabled. It emits `B2.state`, `B2.initial`,
`B2.scope-hash`, `B2.error`, `B2.denial`, `B2.index`, `B2.skip`, `B2.revision`, and `B2.dispatches` for
every prefix. B2 passes only when every assertion matches at every prefix, all manifest strata have a
nonzero case count, and the production verifier returns no divergence.

`results` requires `corpusDigest`, `familyDigests`, `strata[]`, `operationCount`, `prefixCount`,
`assertionCounts`, `hashAlgorithmVersion`, `peakHeapBytes`, `elapsedMs`, and `divergences[]`; each
divergence has only `caseId`, `prefixIndex`, `scope`, and `coordinate`. Required artifact names are
`synthetic-prefixes`, `production-privacy-approval`, `production-verifier`, and
`production-scrubbed-summary`. The latter three are `restricted`; the ordinary report never retains
raw production input or state.

### B3: protocol and family behavior

The fixture is `fixtures/protocol/v1/matrix.json`. Every row has a stable case ID, route, document
version, action scope, raw input, compatibility mode, expected state and hash delta, expected errors,
expected dispatches, and expected outcome. The matrix includes invalid input, extra keys, wrong and
unknown runtime scopes, the current absence of no-input creators, unknown actions, domain errors,
denial, load, duplicate-index undo, redo, current prune behavior, stored version `0 -> 1`, current
context/ordinal timing, version selection, and every upgrade edge.

The runner executes every row against the legacy and code-first family through the public document
Interface. It emits `B3.validation`, `B3.scope`, `B3.state`, `B3.hash`, `B3.error`, `B3.dispatch`,
`B3.version`, and `B3.upgrade`. B3 passes only when each implementation matches the row and each other,
including the documented incoming-scope compatibility behavior. Domain-error rows cover the default
message and an explicit message and compare the reducer-facing `errorCode` separately from the stored
specification `code`. No route may disappear from coverage.

`results` requires `matrixDigest` and `rows[]`; every row has `rowId`, `route`, `version`, `scope`,
`outcomeCode`, `stateDigest`, `hashDigest`, `errorCode`, `dispatchDigest`, `selectedModuleVersion`,
`upgradePath`, and nullable `firstMismatch`. Raw fixture values remain in the `protocol-matrix`
`committed` artifact and are referenced only by `rowId`.

### B4: repository TypeScript

The fixture manifest is `fixtures/typescript/manifest-v1.json`. It selects exact entry files and
goldens under `fixtures/typescript/20`, `100`, and `300`, plus a repository baseline at the same
commit. `budgets/typescript-v1.json` records compiler options, reference machine, baseline digest,
field counts, warm-up and sample counts, and an absolute and relative ceiling for every metric named
in this chapter. No glob adds a TypeScript case.

The runner uses one locked TypeScript process per package shape. It executes isolated check,
declaration emit, repository `tsc --build --extendedDiagnostics`, completion, semantic diagnostics,
hover, and rename. It emits `B4.types`, `B4.declaration`, `B4.repository`, and `B4.language-service`.
B4 passes only when every absolute ceiling and legacy ratio passes, public declarations contain no
reducer or resolver callback implementation, and repeated runs use the declared sample count.

`results.fixtures[]` requires `fixtureId`, `fieldCount`, `rawSamples`, `p50`, `p95`, `maximum`,
`instantiations`, `peakHeapBytes`, `checkMs`, `declarationBytes`, `declarationDigest`,
`languageServiceLatencies`, `compilerOptionsDigest`, `processCount`, and `baselineRatios`. Required
`ci-immutable` artifact names are `compiler-output` and `compiler-diagnostics-json`; the
manifest, source fixtures, and budget are `committed` artifacts.

### B5: packed declarations

The fixture manifest is `fixtures/packed-consumers/manifest-v1.json`. It selects exact cases under
`fixtures/packed-consumers/node` and `fixtures/packed-consumers/browser-worker` and pins a packed
package tarball digest, consumer source, lockfile, export paths, runtime conditions, and expected
logical definitions for each case. It forbids workspace links, source conditions, undeclared path
aliases, and network access after the tarball is built.

The runner installs each tarball into a fresh directory, records the resolved files, typechecks the
consumer, imports every public entry under its target conditions, and starts the browser worker. It
emits `B5.pack`, `B5.node-types`, `B5.browser-types`, `B5.node-import`, `B5.worker-import`, and
`B5.portability`. B5 passes only when both consumers use packed files exclusively, declarations stay
within the B4 budgets, and model keys, versions, specifications, actions, and SDL match B1.

`results.consumers[]` requires `caseId`, `tarballDigest`, `lockfileDigest`, `packedFileManifestDigest`,
`dependencyTreeDigest`, `resolverTraceDigest`, `declarationEntry`, `declarationBytes`, `checkMetrics`,
`importedLogicalKeys`, `workerHandshake`, and `escapedPaths`. Required artifact names are
`packed-tarball`, `packed-file-manifest`, `dependency-tree`, and `resolver-trace`; any nonempty
`escapedPaths` fails the gate.

### B6: model SDL projection

The fixture is `fixtures/model-sdl/v1/manifest.json`. Each case names one structured model definition,
expected canonical SDL, expected parsed AST, scalar inventory, and legacy comparison. Cases cover all
field variants, nullability combinations, nested lists, operations, errors, versions, unreachable
auxiliary types, and a complete legacy compatibility AST with type-system nodes outside the V1
descriptor grammar.

The runner projects SDL only from the structured definition. It walks descriptors when
`graphQLCompatibility` is null and uses the recorded location-free AST when it is present. It parses
the result with the locked GraphQL parser, prints it canonically, and instruments the legacy regex
Adapter. It emits `B6.parse`, `B6.ast`,
`B6.print`, `B6.scalar`, and `B6.no-regex`. B6 passes only when AST and printed bytes match their
goldens, scalar names match the SDL-keyed catalog, and the regex Adapter call count is zero on every
structured case.

`results.cases[]` requires `caseId`, `definitionDigest`, `sdlDigest`, `astDigest`,
`scalarCatalogDigest`, `parserVersionDigest`, `parseMs`, `printMs`, `regexAdapterCallCount`,
`regexAdapterCallSites`, `coveredVariants`, and nullable `firstDifference`. Required `committed`
artifact names are `model-sdl-manifest`, `sdl-goldens`, `ast-goldens`, and `scalar-inventory-digest`.

`B6.scalar` compares printed scalar names against the committed `scalar-inventory-digest`, not against
a live catalog. B14 depends on B6 and asserts that the constructed catalog reproduces that same digest.
Pointing `B6.scalar` at the catalog instead would make B6 depend on B14 while B14 depends on B6, so the
committed digest is what keeps the two acyclic.

### B7: subgraph contract

The fixture manifests are `fixtures/subgraphs/v1/manifest.json` and
`fixtures/subscriptions/v1/manifest.json`. They record the current loader result, author AST order,
host augmentation, resolver map, service arguments, request context, `GraphQLResolveInfo`, manual
authorization ordering, Apollo composition, route identity, `hasSubscriptions`, source allocation,
delivery, cleanup behavior, and hot-reload outcome.

The runner executes legacy and code-first classes through the current production host. B7 passes when
their observable schema, requests, resolver calls, routes, transports, failures, and replacement
outcomes match. `PH-COMP-1`, required-by-default failure, credential leases, pre-allocation access,
and exact-once disposal are report-only follow-up cases and cannot fail core v1.

`results.cases[]` records `caseId`, author and augmented AST digests, resolver-call digest,
supergraph digest, Apollo diagnostics, route, composition name, transport flags, allocation count,
cleanup observations, delivery digest, and first mismatch. Required committed artifacts are
`subgraph-manifest`, `subscription-manifest`, `composition-goldens`, and `event-goldens`.

### B8: definition-source and loader compatibility

The fixture is `fixtures/packages/v1/manifest.json`. It defines explicit sources for
`DefinitionSourceLoader` and separate current namespace fixtures for Node/server, browser/static,
browser worker, Vite/local source, HTTP/CDN, GraphQL, MCP, Connect worker, and reactor workers.

The definition loader must normalize configured code-first sources consistently. Runtime host cases
must preserve their current named, nested, callable, and split-subpath behavior. B8 does not require a
shared runtime predicate, logical worker protocol V2, subgraph removal, or atomic replacement.

`results.hosts[]` records each host's imported namespace, accepted exports, selected named worker
reference, diagnostics, registration outcome, and first mismatch against its legacy fixture. Required
artifacts are `package-manifest`, `definition-source-results`, and `host-namespaces`.

### B9: failure propagation

The fixture is `fixtures/reproductions/v1/failure-propagation/manifest.json`. It defines a valid control
package and independent injections for TypeScript, source import, definition finalization,
configuration, definition warning, prepack, and registry publication. Configuration cases cover a
missing, empty, and unsupported `definitionSources` field; a duplicate canonical source; root escape;
external symlink; config-only selection; repeatable `--source` replacement over missing and
unsupported fields; and explicit `legacy` mode. A decoy source tree proves that no scan adds an entry.
Every case includes a byte manifest of the prior output tree and a registry Adapter whose request count
starts at zero.

The runner executes `ph model check` in edit and release profiles with and without
`--warnings-as-errors`; the one `ph build` implementation that emits browser and Node bundles;
`npm` and `pnpm` pack hooks; raw package-manager
publish in dry-run mode; and `ph publish` against the recording Adapter. It emits `B9.exit`, `B9.report`,
`B9.warning-policy`, `B9.build-order`, `B9.prepack`, `B9.publish`, `B9.registry-zero`,
`B9.output-unchanged`, and `B9.source-selection`. B9 passes only when expected
definition errors exit `1`, tooling or import failures exit `2`, duplicate diagnostics name both
positions, CLI sources replace the config list exactly, and the selected source set is stable across
check, inspect, build, prepack, and publish. A warning must retain severity `warning`, exit `0` without
the flag, and make the report `invalid` with exit `1` under `--warnings-as-errors`. Explicit legacy
mode must return the closed `skipped` report and continue the legacy build without contributing
release evidence. Every failing build must stop before bundle output, pack and publish must stop before
a tarball or request, the code-first control path must succeed, and the prior output manifest must be
byte-identical.

For `ph build`, `B9.build-order` requires the exact phase relation: a TypeScript failure prevents
definition checking; after `tsc:ok`, definition checking completes before the first
bundle write; `invalid` or `failed` prevents that write; `ok` permits it; and explicit `skipped`
permits only the legacy path while recording `contributesReleaseEvidence: false`. Prepack and publish
must consume the same retained release report rather than run a weaker check.

`results.injections[]` requires `injectionId`, `command`, `warningsAsErrors`, `exitCode`,
`reportStatus`, `diagnosticCodes`, `hookOrder`, `typecheckCompleted`, `definitionCheckCompleted`,
`bundleWriteCount`, `tarballWriteCount`, `registryRequestCount`, `sourceOrigin`,
`normalizedSourceKeys`, `sourceSetDigest`, `duplicateSourcePositions`, `skipReason`,
`contributesReleaseEvidence`, `decoyImportCount`, `beforeTreeDigest`, and `afterTreeDigest`. Required
artifact names are `failure-manifest`, `recording-registry-journal`, and `output-tree-manifests`. This
gate has no dependency and runs first.

### B10: migration lifecycle

The fixtures are `fixtures/migrations/v1/manifest.json` and
`fixtures/retirement/v1/manifest.json`. The migration manifest selects one full version family and
records legacy and code-first roots, source hashes, family digest, history corpus, report schema,
immutable artifact digest, current host deployment steps, mixed-revision contract, canary checks,
rollback target, and injected failures.

The runner executes report, beside-write, isolated verification, artifact validation, a read-only
canary, deployment through each current host lifecycle, mixed-revision load when allowed, fresh-process
rollback, and hash-bound retirement. It does not require prepare, desired-revision reporting, local
compare-and-swap, or convergence fields that the current hosts do not implement.

Old and new hosts may overlap only when evidence passes for that exact pair. Otherwise the fixture
requires drained deployment and zero cross-revision traffic. Retirement remains blocked until the
deployed artifact passes host checks and every hash and live-import check.

`results` records the phase journal, artifact and family digests, source and output tree digests,
verification reports, canary counts, mixed-revision outcomes, deployment outcomes, rollback result,
retirement decision, and recoverable legacy root. Required artifacts are `migration-report`,
`phase-journal`, `canary-summary`, `source-tree-manifest`, `output-tree-manifest`, and
`retirement-report`.

### B11: agent evaluation

The fixture is `fixtures/agent-eval/v1/protocol.json`. It freezes the ten task families in this
chapter, stable task IDs, acceptance-test digests, repository commit, tool and network policy, context
limit, timeout, agent and model version, `trialsPerTask`, `rootSeed`, and the exact statistical method
before trials run. Its schema requires every field used by the seed derivation and rejects an edited
protocol after the first retained arm attempt.

The runner creates the paired trial IDs, seeds, and schedule exactly as specified in "Agent
evaluation," isolates every arm worktree and agent session, instruments intermediate tree digests,
and treats failure and timeout as completed outcomes. It emits `B11.protocol`, `B11.schedule`,
`B11.pairing`, `B11.acceptance`, `B11.infrastructure`, `B11.success`, `B11.repairs`,
`B11.intermediates`, `B11.elapsed`, and `B11.tokens`. B11 passes only when every task has the declared
number of complete pairs, no infrastructure-invalid pair remains, the paired bootstrap and
zero-denominator rules hold, and every ratio remains within budget.

`results.attempts[]` requires `protocolDigest`, `acceptanceTestDigest`, `taskId`, `trialIndex`,
`trialId`, `attemptIndex`, `pairSeed`, `scheduleKey`, `arm`, `armOrder`, `initialWorktreeDigest`,
`intermediateTrees`, `finalTreeDigest`, `terminalOutcome`, `acceptanceResults`, `failureCode`,
`invalidIntermediateCount`, `repairTurns`, `elapsedMs`, `toolCallSummary`, `agentVersion`,
`modelVersion`, `provider`, `usageSchemaVersion`, `responseUsage`, and `totalTokens`. Aggregate
`results` also requires `resultTableDigest`, `pairCountsByTask`, `bootstrapDerivation`,
`bootstrapResamples`, `intervalRanks`, `intervalEndpoints`, `taskSuccessDifferences`,
`macroSuccessDifference`, `armMedians`, `armTotals`, `ratios`, and `zeroDenominatorDecisions`.
Required artifact names are `agent-protocol`, `result-table`, `bootstrap-statistics`, and
`infrastructure-attempts`. The report retains no prompt beyond its committed task reference, model
chain of thought, credential, or post-result exclusion field.

### B12: production bundle and runtime

The fixture is `fixtures/packages/v1/production-manifest.json` and contains real packed model and
subgraph packages at 20, 100, and 300 fields and at 1, 5, and 20 subgraphs. `budgets/runtime-v1.json`
must provide an absolute ceiling and legacy ratio for raw bytes, gzip bytes, cold import, model
materialization, registration, standalone subgraph construction, composition, peak heap, retained heap
after replacement, and cache entries for every measured cell. Its timing protocol is fixed at
`warmups: 5` and `samples: 20`; any other value fails schema validation. A missing ceiling or gzip,
process, GC, or cache-inventory setting also fails before measurement.

The runner starts a fresh process for each cold sample, records the warm-up and sample counts from the
budget, enforces the fixed gzip and process settings above, and runs the specified 100-registration
sequence through each host's current replacement lifecycle for cache and retained-memory comparison.
It emits `B12.size`, `B12.import`,
`B12.materialize`, `B12.register`, `B12.standalone`, `B12.compose`,
`B12.heap`, and `B12.cache`. B12 passes only when every absolute and relative ceiling passes, the
shared compiler stays within the 35 KiB gzip limit, every family is no larger than its legacy family,
and code-first cache and retained-memory observations match the corresponding legacy host. Core v1
does not require eviction or generation ownership that the current host lacks.

`results.cells[]` requires `cellId`, `packedFileDigests`, `dependencyDigests`, `rawBytes`, `gzipBytes`,
`gzipDigests`, `timingSamplesNs`, `p50Ns`, `p95Ns`, `maximumNs`, `fieldCount`, `subgraphCount`,
`registrationCount`, `supergraphDigest`, `peakHeapSamplesBytes`, `retainedHeapSamplesBytes`,
`peakHeapP95Bytes`, `retainedHeapP95Bytes`, `cacheHits`, `cacheMisses`, `cacheInventories`, and
`baselineRatios`. Aggregate `results` requires
`gcProtocol`, `legacyActiveCacheEntries`, `codeFirstActiveCacheEntries`,
`legacyRetiredCacheEntryCount`, `codeFirstRetiredCacheEntryCount`,
`cpuIdentity`, `memoryIdentity`, `nodeVersion`, `zlibVersion`, and `budgetDigest`. Required artifact
names are `packed-file-manifests`, `raw-samples`, `cache-inventory`, and `heap-report`.

### B13: author and agent loop

The fixture is `fixtures/author-loop/v1/manifest.json`. It names a real source package and expected
packed artifact, the initial commit, its `powerhouse.config.json` and source-set digest, an authored
TypeScript edit, expected incremental diagnostics, expected structured inspection, focused test
selector, a 50-edit cancellation burst, a closure-changing reload, and the forbidden generated-source
paths. `budgets/author-loop-v1.json` supplies absolute p95 limits and legacy ratios for incremental
typecheck, edit-profile check, inspect, focused test, cancellation settlement, and reload. Every
latency case uses five warm-ups, twenty measured runs, and the B4 nearest-rank rule; the 50-edit burst
is repeated from a fresh base for each run.

The runner applies the edit through the ordinary filesystem Interface, then invokes incremental
TypeScript, `ph model check`, `ph model inspect`, the focused test, cancellation, and host reload. It
emits `B13.no-generate`, `B13.typecheck`, `B13.check`, `B13.inspect`, `B13.test`, `B13.cancel`,
`B13.reload`, `B13.fresh-closure`, `B13.naming`, and `B13.sources`. B13 passes only when check and
inspect select the manifest's configured source set, no generate or manual naming step occurs, every
superseded tooling request settles, only the newest complete report is published, and a fresh worker
or server generation executes the changed closure through its current lifecycle. Every time budget
must pass, and no forbidden source may appear. Exact disposal belongs to the later host lifecycle.

`results` requires `sourcePatchDigest`, `commandTimeline`, `subprocessCount`, `checkDigest`,
`inspectionDigest`, `sourceOrigin`, `normalizedSources`, `sourceSetDigest`, `focusedTestIds`,
`cancellationRequestCount`, `cancellationSettlementCount`, `maximumUnsettledMs`, `generationIds`,
`oldClosureResultDigest`, `newClosureResultDigest`, `reloadEvents`,
`generatedPathManifestDigest`, `namingDerivationChecks`, `timingSamples`, and `baselineRatios`.
Required artifact names are `authoring-patch`, `command-journal`, `inspection-json`,
`cancellation-journal`, `reload-journal`, and `generated-path-manifest`.

### B14: scalar catalog conformance

The fixture is `fixtures/scalars/v1/manifest.json`. Each case names an SDL scalar and its immutable
profiles. Core cases cover `document-engineering-1.40` validation and
`legacy-graphql-default-v1` host behavior. The vectors include `Unknown` non-JSON values, current
`Upload` positions, integer and `IntValue` Amount differences, ordinary authored scalar resolver
entries, and the host-owned last-write `JSONObject` resolver.

The runner validates document creators, reducer replay, GraphQL variable/literal/serialize behavior,
and browser/Node metadata in fresh processes. It includes historically failed operations because an
accepted-set widening can change replay. Core v1 passes only when current behavior matches. Strict
`catalog-v1` coercion and position rules are X-scalar cases and cannot satisfy or fail B14.

`results.cases[]` records `caseId`, `scalarName`, `profile`, validation and GraphQL outcome digests,
`catalogDigest`, known differences, construction time, and first mismatch. Required committed
artifacts are `scalar-manifest`, `scalar-definitions`, `current-coercion-goldens`, and
`difference-list`.

No gate in this chapter's baseline is marked passed. An implementation may change `not-established`
only by attaching a schema-valid report and every referenced artifact from the locked runner, then
recording that result in the delivery tracker. Design review alone cannot change an
`IMPLEMENTATION GATE` to `PASSED`.
