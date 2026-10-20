# Plan: typed-host-configs

Make `hosts/*/host.js` strongly typed and checked in CI, able to express every
host permutation we ship, and able to consume any value another host's
creation produces ("the URL of the drive the switchboard actually serves") as
plain data.

Status: **proposal**. Nothing implemented. Builds on `uniform-runners`
(phases 0–3, R) and `workflow-plugins` (drive references). Paths are relative
to the repo root; `HC` = `packages/host-core/src`.

**Gated, with one consumer, so breaking changes are free.** The hosts system
is off unless `FEATURE_UNIFORM_RUNNERS_ENABLED` is `1`/`true`
(`packages/shared/clis/feature-flags.ts`, `isUniformRunnersEnabled`). Flag off,
`ph run` is not registered (`clis/ph-cli/src/commands/ph-cli-commands.ts:43-47`),
host-name sugar is skipped (`clis/ph-cli/src/cli.ts:46`), `ph-cmd` does not
forward `run` (`clis/ph-cmd/src/cli.ts:103-110`) and `ph init` scaffolds no
`hosts/` (`clis/ph-cli/src/services/init.ts:117`). On top of the flag the
opt-in is structural: `loadHost` refuses an absent or empty `hosts/`
(`HC/host-loader.ts:36-50,195-215`). Sektar is the only project that sets the
flag (its `README.md:41-62`). So this plan has no deprecation, no rewrite
layer and no compatibility bookkeeping. Every stage changes Sektar and the
scaffold templates in the same unit of work as the system. The only release
ceremony is what CI runs mechanically (`check-commit.yml`:
`pnpm check-ts-references`, `pnpm build`, `pnpm typecheck`, oxlint on the
diff); the repo has no `.changeset/`.

Scope is **host config only**. reactor-monitor will later consume host
definitions to spin up configurations; this plan only guarantees the host
types, schemas and resolver are consumable from Node and the browser (see
"Consumability"). Monitor work is out of scope.

## Goals

| # | Goal | One-line answer |
|---|---|---|
| G1 | Strong typing | zod is the single source; every host type is `z.input`/`z.output` of a runner's schema; host files are checked by `tsc` through a type-level specifier→host map (no runtime registry). |
| G2 | Permutation coverage | Invariants move into types + `superRefine`; fixture hosts cover every topology cell, tested without launching processes. |
| G3 | Lazy values | Runners declare typed **outputs**. Host files consume them through plain-JSON **output tokens** (`$output`, `$concat`, `$map`, `$env`), resolved by one host-core resolver, standalone and in a compound. The old cross-host forms are removed. |

## Current state (what we are replacing)

**Types are hand-written and loose.**
- `HostDefinition` (`HC/host-loader.ts:156-163`) types `config`, `reactor`, `children` and `profile` as `Record<string, unknown>`. Every runner casts.
- `ReactorConfig` (`HC/reactor-config.ts:50-58`) has drifted from `reactorSchema` (`HC/host-schemas.ts:106-139`). It is missing `renown`, `packages`, `namespace`, `auth` and `drives`.
- `CompoundMember` (`HC/compound.ts:52-58`) diverges from `childrenSchema` (`HC/host-schemas.ts:157-168`).
- These are unvalidated: `CompoundWiring` (`compound.ts:60-72`, cast at :221), `RunnerHandle` (`compound.ts:37-50`, cast at :302) and `RunRecord` (`HC/run-record.ts:44-46`, read back with `as`).

**Validation is split and partly discarded.**
- `validateHost` throws away parsed output (`HC/runner-resolver.ts:123`), so verbs never see defaults.
- `HostSchemaLike` erases the schema type (`runner-resolver.ts:33-38`).
- Runner modules re-declare looseObject schemas instead of extending the base (`clis/ph-cli/src/runners/connect.ts:47-61`, `switchboard.ts:36-50`). They also read options they never declared: `strictPort`, `outDir`, `driveSlug`, `dev`, `cspRegistrySync`, desktop `shell`, clint `workdir`/`agents`.

**Runtime-only invariants.**
- `reactor` XOR `children` is checked only at runtime (`host-loader.ts:189-193`).
- `kind` is exported by every runner and never read (`runner-resolver.ts:83`).
- An unknown `startOrder` name is silently ignored (`compound.ts:92-97`).
- Member behaviour is keyed on folder names (`isConnectMember`/`isReactorFactMember`, `compound.ts:194-199`).

**Seven ways to express a cross-host value:**

| Mechanism | Where | Source of truth |
|---|---|---|
| Sibling import + template literal (`` `http://127.0.0.1:${serverPort}/d/${slug}` ``) | sektar `hosts/cli/host.js:40-51`, `desktop/host.js:93-101`; codegen `templates/boilerplate/hosts.ts` | Declared port; blind to overrides and the bound port |
| Hardcoded URL | sektar `hosts/connect/host.js:35` (workflows drive) | None |
| `"${userData}"` | `HC/placeholders.ts:21-42` | env/projectRoot; **not applied by standalone ph-cli runners** |
| `{ from, slug }` drive ref | `HC/plugins.ts:59-78`, `compound.ts:144-186` | Started member's `driveUrls`; top-level plugin config keys only; rejected standalone |
| `remote: { host }` | `packages/clint/src/runners/mastra-runner.ts:61-94` | Sibling's declared port, `localhost` hardcoded; ignored by `backendToDescriptor` |
| clint `agents.<x>.host`, proxy `routes.<p>.member` | `clint-runner.ts:116-126`, `proxy-plugin.ts:62-77` | Declared port / `MemberEndpoints` |
| `config.projectDrivesIntoConnect` | `compound.ts:262-279` | Folder literally named `switchboard` → folder `connect` |

**Not browser-safe.**
- The host-core root barrel pulls in `node:fs`/`path`/`module`/`crypto`. Only `./plugins` is browser-safe.
- `host-schemas.ts:2` imports `drives.ts`, and `drives.ts` imports `node:crypto` and `shared/connect/image-ref` (node:fs).
- **Verified:** the schema half of `drives.ts` (lines 26-45) needs only zod, so a split makes `host-schemas.ts` browser-safe.

**Verified:** `lintHostImports` rejects JSDoc import types. The `/\bimport\s*\(/` test at `HC/host-loader.ts:88` runs over raw source, comments included, so `/** @type {import("…").ConnectHost} */` fails to load today. Its sibling rule (`SIBLING_IMPORT`, `host-loader.ts:58`) allows only `../<name>/host.js`. It does not look at `process.env`, which Sektar's assistant reads (`hosts/assistant/host.js:44`).

## G1: Strong typing

### 1.1 Zod is the single source

- Every block type is `z.infer`/`z.input`/`z.output` of a schema. Delete the hand-written mirrors in `reactor-config.ts` (`ReactorConfig`, `ReactorBackend`, `ReactorProtocol`, …). The projection functions stay and take the inferred types.
- Unify `CompoundMember` with `childrenSchema` into one `ChildWrapper` type.
  - Decide `plugins` explicitly. The type has it; the strict schema does not.
- New schemas:
  - `compoundWiringSchema`, with a `superRefine` that checks `startOrder ⊆ keys(children)`.
  - `runRecordSchema` (v2 only, see 3.6).
  - `runnerHandleSchema` (outputs only; `ready` and `shutdown` stay TS fields).
- `profileSchema` drops its baked-in `.optional()`, so it can be reused as required.
- `HostSchemaLike` becomes `{ safeParse(v): {success:true, data:O} | {success:false, error} }`.
  - `validateHost` returns `data`.
  - `RunnerVerb<O>` receives the **parsed output**, so defaults and transforms reach verbs.

### 1.2 HostDefinition becomes a discriminated union

```ts
type ReactorHostInput  = z.input<typeof reactorHostSchema>;  // reactor?: …; children?: never
type CompoundHostInput = z.input<typeof compoundHostSchema>; // children: …; reactor?: never
type HostDefinition    = ReactorHostInput | CompoundHostInput;
```

- At runtime, `validateHost` **consumes `kind`**:
  - a `kind: "reactor"` runner rejects `children`;
  - a `kind: "compound"` runner rejects `reactor`.
- Top-level host schemas go from `looseObject` to `strictObject`, so `reactr` fails.
- `config` stays runner-defined, but each runner now declares it.

### 1.3 Runner schemas extend the base

Each runner module exports:

```ts
export const kind = "reactor";
export const hostSchema = reactorHostSchema.extend({
  runner: runnerBaseSchema.extend({ strictPort: z.boolean().optional(), outDir: z.string().optional(), … }).strict(),
  config: connectConfigSchema,        // see 1.6
});
export type ConnectHost = z.input<typeof hostSchema>;   // what host.js authors write
export const outputsSchema = …;                          // G3: what creating it produces
export type ConnectOutputs = z.infer<typeof outputsSchema>;
```

- Every option a runner reads today is declared.
- `defaultVerb` and plugin `verbs` are validated against the runner's exported verb names. The resolver already knows them (`listVerbs`, `runner-resolver.ts:91-99`).
- Emit JSON Schema **per runner** (extending `emittedHostSchemas()`) and keep the drift test.

### 1.4 Typing host.js without a runtime registry

- Keep the recorded decision of **no type→runner registry at runtime** (`clis/ph-cli/src/services/run/start-run.ts:18-19`). Add a **type-level** map through global interface augmentation. Runner and plugin packages augment it; nothing reads it at runtime:

  ```ts
  // @powerhousedao/host-core/schema (declares)
  declare global {
    interface PHHostRunners {}      // specifier -> { host: input type; outputs: outputs type }
    interface PHPluginConfigs {}    // plugin specifier -> config input type
  }
  export type PHHost = { [M in keyof PHHostRunners]: PHHostRunners[M]["host"] & { runner: { module: M } } }[keyof PHHostRunners];

  // @powerhousedao/ph-cli/runners/connect (augments)
  declare global { interface PHHostRunners { "@powerhousedao/ph-cli/runners/connect": { host: ConnectHost; outputs: ConnectOutputs } } }
  ```

- `PHHost` is discriminated by `runner.module`, so one annotation types any host file:

  ```js
  // @ts-check
  /** @satisfies {PHHost} */
  export default { name: "sektar-connect", runner: { module: "@powerhousedao/ph-cli/runners/connect", … }, … };
  ```

- Use `@satisfies` rather than `@type`. It keeps the narrow inferred type, so sibling reads (`switchboard.reactor.drives`) stay precise and a typo like `reactor.drive` is a compile error.
- No `import(` appears in the host file. The augmenting packages are pulled into the program by a generated `hosts/types.d.ts`. `.d.ts` files are not linted by the host loader.
- `lintHostImports` should still strip comments before its regex tests (`host-loader.ts:88`). That bug bites anyone who writes a JSDoc import type.
- Plugin entries get typed the same way:

  ```ts
  type PluginEntry = { [M in keyof PHPluginConfigs]: M | { module: M; config?: PHPluginConfigs[M]; verbs?: string[] } }[keyof PHPluginConfigs]
  ```

  - This tells apart the two different `workflows` configs:
    - switchboard: `drive: {slug,name} | false` (`apps/switchboard/src/plugins/workflows.mts:74-77`);
    - connect: `drive: ref(z.url())` (`apps/connect/src/plugins/workflows.ts:34-41`).
  - Any specifier may be named bare or as `{ module, enabled?, verbs? }` with **no config** (decided in T3). A third-party plugin that takes config must augment `PHPluginConfigs`; a loose `config?: Record<string, unknown>` fallback would also accept a typo'd config on a known specifier.
  - `PHHost` overrides `runner.plugins` with `PluginEntry[]`, so every runner's plugin list is typed the same way.
- Considered: a per-file `@type {ConnectHost}`. Rejected because every host file would need an `import(` type and would name its runner's type twice.

### 1.5 Getting tsc to actually check host files

- Today `npm run tsc` never sees `hosts/*.js`: there is no `allowJs`/`checkJs`.
- The codegen scaffold emits:
  - `hosts/tsconfig.json`: extends root; `allowJs`, `checkJs`, `noEmit`, `resolveJsonModule`, **`exactOptionalPropertyTypes: true`**; includes `hosts/**/*.js`, `hosts/**/outputs.d.ts` and `hosts/types.d.ts`.
  - `hosts/types.d.ts`: `import type {} from "…"` for each runner/plugin package in the project's dependencies.
  - `powerhouse.config.d.json.ts` (+ `allowArbitraryExtensions`): types `import config from "../../powerhouse.config.json"` as shared's `PowerhouseConfig`, so enum-typed values from the JSON pass `@satisfies {PHHost}` (decided in T3).
  - a `tsc` script: `tsc && tsc -p hosts`.
  - `ph generate hosts` rewrites `types.d.ts`, `powerhouse.config.d.json.ts` and every `outputs.js`; `ph generate all` runs it when `hosts/` exists. cmd-ts has no bare `ph generate`, so messages say `ph generate hosts`.
- `exactOptionalPropertyTypes` makes the loader's "no `undefined`" rule (`host-loader.ts:135-136`) a compile error. It would have caught the Sektar assistant bug (see "Sektar and scaffold changes by stage").

### 1.6 Connect `config`

- Today there are three representations: the TS `PHConnectRuntimeConfig` (`packages/shared/clis/types.ts:419-440`), the Ajv JSON Schema (`phConnectRuntimeConfigSchema`, `shared/connect/schema-fragments.ts:324`), and `looseObject({})` in the runner.
- Lands in **T1** (lane B, in `shared` only); the connect runner adopts it in T2. Port the Ajv schema to a zod `connectConfigSchema` in `shared` (browser-safe). The connect runner's `config` uses it, and `PHConnectRuntimeConfig` becomes its inferred type.
- Zod is the single source. The hand-written `phConnectRuntimeConfigSchema` is replaced by the fragment emitted from zod (`z.toJSONSchema`). The Ajv composer (`shared/clis/source-config-schema.ts`, and through it `ph connect config`) imports the emitted fragment, so the Ajv path stays but has no schema of its own. A drift test pins the emitted fragment.
- Plugin-owned slices (`drives.*` owned by the generic plugin) are typed by the plugin's `configSchema`. A slice whose plugin is absent becomes a validation **warning** ("dead config"), for example Sektar's `connect.drives.allowAddDrive`.

## G2: Permutation coverage

### 2.1 Invariants the types and schemas own

| Invariant | Today | Enforced by |
|---|---|---|
| reactor XOR children | runtime assert | union type + `kind`-aware `validateHost` |
| unknown top-level/runner keys | accepted (loose) | `strictObject` per runner |
| `startOrder ⊆ children`, consistent with output dependencies | silently ignored | `compoundWiringSchema.superRefine` + resolver plan (3.5) |
| `defaultVerb`, `verbs[]` ⊆ runner verbs | boot-time failure | `validateHost` against `listVerbs` |
| remote backend needs `url` | `backendToDescriptor` throws (`HC/backend-projection.ts:76-84`) | schema: `remote.url: ref(z.url())`, required |
| no `undefined` values | JSON gate | `exactOptionalPropertyTypes` + gate |
| token producer exists, path valid against its `outputsSchema`, no cycle | runtime | declared-form validation (3.5) + `ph run --explain outputs` |
| generated `outputs.js` matches its producer | — | schema hash; load fails with "run `ph generate`" (3.2) |
| no `process.env` in host files | allowed | `lintHostImports` rejects `process.`; environment values go through `$env` (3.2) |
| no old cross-host forms | accepted | schemas reject `{ from, slug }`, `remote.host`, clint `agents.*.host`, proxy `routes.*.member`; the error names the token form (3.7) |
| backend `kind` present | defaults to in-process silently (desktop-switchboard) | required in schema |
| member roles | folder-name literals | runner `kind` + explicit tokens; delete `isConnectMember`/`isReactorFactMember` |

`projectDrivesIntoConnect` and `drivesPublicBase` are deleted. Output tokens replace them, and no Sektar host uses either.

Each stage tests the invariants it introduces. T4 adds the fixture matrix below as the capstone.

### 2.2 Fixture hosts

Topology cells the scaffold plus Sektar cover today, and the gaps:

| Axis | Values |
|---|---|
| runner kind | reactor (connect, switchboard, mastra), compound (host-core compound, desktop) |
| client mode | in-process (connect, desktop-connect), remote (cli-connect, assistant), worker and router (**not covered by Sektar**) |
| storage | default, `path` + `${userData}`; idb/memory/postgres uncovered |
| drives | local, remote-by-URL, `projectHash: true/"id"`, plugin-contributed |
| verb | dev, run, serve |
| mode | standalone, compound member |

- Static fixtures in `packages/host-core/test/fixtures/hosts/` fill the uncovered cells (worker, router, idb, postgres-rejected) next to copies of the scaffold hosts.
- One table-driven test loads every fixture through the full pipeline (lint → static → declared validation → resolve against canned outputs → resolved validation) and asserts a small serializable expectation per fixture: `{ clientMode, drives: { slug, kind }[], dependsOn: host[] }`, computed by a pure `expectHost` from `reactorClientMode`, `isStructuralMultiReactor` and the drive plan.
- Negative fixtures, one per invariant in 2.1, assert the exact error path.
- No processes are launched. The expectation type is JSON-only, so a future consumer can reuse it.

## G3: Lazy values (outputs + output tokens)

The model is Pulumi's: creating a resource produces **outputs**, and other
resources take those outputs as inputs. The difference is that host files stay
**plain JSON**. An output reference is a data token, not an `Output<T>` object.

### 3.1 Outputs: what a host's creation produces

- Each runner exports `outputsSchema` (zod) and `XOutputs = z.infer<…>`. Outputs are **any** derived value: origins, endpoints, drive ids (including `projectHash` ids), drive URLs, generated ids, keys, DIDs.
- Server verbs return `RunnerHandle<O> = { outputs: O; ready: Promise<void>; shutdown(): Promise<void> }`. One-shot verbs (`build`) return `void`. `driveUrls` (an untyped display-order array, `compound.ts:41-42`) goes away in T3, together with `{ from, slug }`, its only reader.
- Outputs are published to the compound (in memory) and to the run record (`.ph/run/<host>.json`, 3.6) for standalone consumers.
- Example, switchboard:

  ```ts
  export const outputsSchema = z.object({
    origin: z.url(),
    endpoints: z.object({ graphql: z.url(), mcp: z.url() }),
    drives: z.record(z.string(), z.object({ id: z.string(), url: z.url() })), // keyed by DECLARED slug,
  });                                                                          // incl. plugin-created drives
  ```

- Drive outputs are keyed by the declared slug. A `projectHash: true` drive (`HC/drives.ts:72-77`) carries its hashed id and URL under its plain slug, so `vetra` is referenceable. Today it cannot be spelled.
- Outputs carry what the server actually bound (host and port), so the `localhost`/`127.0.0.1` mix is no longer an authoring concern.

### 3.2 Tokens

All tokens are plain JSON. An object whose **sole key** is one of `$output`, `$concat`, `$map`, `$item`, `$key`, `$env` is an operator. `$$` escapes a literal `$`-prefixed sole key.

| Token | Shape | Resolves to |
|---|---|---|
| `$output` | `{ $output: { host: string; member?: string; path: (string\|number)[] } }` | the value at `path` in that host's outputs |
| `$concat` | `{ $concat: (string \| number \| Token)[] }` | string; every part must resolve to string or number |
| `$map` | see 3.3 | array, or record with `into: "record"` |
| `$item` / `$key` | see 3.3 | the current `$map` element / key |
| `$env` | `{ $env: string \| { name: string; optional: true } }` | an environment value (rules below) |

- **Addressing.** `host` is the producer's folder name. In a compound it resolves to the unique member whose `host` matches, and `member` disambiguates when two members share a host. Standalone, it resolves to the sibling host's outputs. The same `connect/host.js` therefore works alone and as a member; Sektar hardcodes the workflows URL today because it has no way to do this.
- **The operator set is closed.** v1 is exactly `$output`, `$concat`, `$map` (with its `$item`/`$key` bindings) and `$env`. There is no arbitrary code, so a declared host is still inspectable and schema-validated before anything runs. `$filter`, `$pick` and `$default` are future candidates, not v1.
- **`$env`.**
  - `userData` and `projectRoot` are built-ins and always resolve. `"${userData}"` and `"${projectRoot}"` inside strings stay as sugar for them; no other name has string sugar.
  - Any other name reads the process environment of the resolving process. It is the only way a host file reads the environment, because `lintHostImports` bans `process.` (T3, landing with `$env` so the ban and its replacement arrive together).
  - An unset variable fails resolution, naming the variable and the host path.
  - `{ $env: { name, optional: true } }` omits its enclosing property when the variable is unset. It is legal only as the direct value of an object property. Inside `$concat`, an array or the top of a `$map` template, declared validation rejects it. (The object form keeps the sole-key rule.)
- **Authoring sugar: generated `outputs.js`.** `ph generate` writes `hosts/<name>/outputs.js` + `outputs.d.ts` from the runner's `outputsSchema` plus the host's declared drives (`reactor.drives` and plugin-declared drives such as switchboard workflows' `drive: { slug }`). Every leaf is a plain `$output` token, and the `.d.ts` brands each as `OutputToken<T>`. Record- and array-valued outputs also get an `$item` tree for use inside `$map`.
  - The header carries a hash of both inputs: the producer runner's `outputsSchema` and the host's declared drives. When a consumer imports an `outputs.js` whose hash no longer matches, **the load fails** with "`hosts/<name>/outputs.js` is stale; run `ph generate hosts`". There is no warn-and-continue.

  ```js
  // hosts/switchboard/outputs.js (GENERATED; plain data, header carries a schema hash)
  export const outputs = {
    origin: { $output: { host: "switchboard", path: ["origin"] } },
    endpoints: { graphql: { $output: { host: "switchboard", path: ["endpoints", "graphql"] } }, … },
    drives: {
      sektar:    { url: { $output: { host: "switchboard", path: ["drives", "sektar", "url"] } }, id: … },
      workflows: { url: { $output: { host: "switchboard", path: ["drives", "workflows", "url"] } }, id: … },
      $item:     { url: { $item: ["url"] }, id: { $item: ["id"] } },   // element tree for $map
    },
  };
  ```

  - `lintHostImports` gains `../<host>/outputs.js` next to `../<host>/host.js`. `outputs.js` is itself linted: no imports, data only.
  - Literal tokens remain valid; `outputs.js` is a typed shortcut, not a requirement.
  - Drives that exist only at runtime (plugin-created, undeclared) have no generated key; reach them with `$map` over `drives`.

### 3.3 `$map`

```ts
type MapToken = {
  $map: {
    over: OutputToken | ItemToken;   // must resolve to an array or a record
    as?: string;                     // binding name; needed only to reach an outer map from a nested one
    to: Template;                    // any JSON; may contain tokens, $item, $key, nested $map
    into?: "record";                 // default: array
  };
};
type ItemToken = { $item: (string | number)[] | { as: string; path: (string | number)[] } };
type KeyToken  = { $key: true | string };   // true = innermost map; string = named binding
```

- **Semantics.** Resolve `over`. For an array, visit elements in order. For a record, visit entries in **key-sorted order**, which keeps resolution deterministic. Render `to` once per element.
- **Result shape.** By default the result is an array, in visit order. With `into: "record"` it is a record that keeps each input key and maps it to the rendered `to`. `into: "record"` requires a record `over`. With an array `over` it is rejected at declared validation (or at resolve time, if the value is not a record), because the input has no keys to keep. Re-keying is out of scope for v1.
- **Binding.** `$item: [path]` and `$key: true` refer to the innermost enclosing `$map`. `{ $item: { as, path } }` and `$key: "<as>"` refer to a named outer one. `$item: []` is the whole element. `$key` on an array map yields the index.
- **Nesting.** `to` may contain `$concat`, `$output` and nested `$map`. A nested `over` may be an `$item` (map over a field of the outer element).
- **Typing.**
  - tsc: `ref(schema)` for an array-typed field accepts `T[] | OutputToken<T[]> | MapToken`, and for a record-typed field it accepts `Record<string, T> | OutputToken<Record<string, T>> | MapToken & { $map: { into: "record" } }`. The template is checked against the field's element (or value) type with tokens allowed in any `ref()` position. The generated `$item` tree is branded (`ItemToken<string>`), so `outputs.drives.$item.url` is accepted only where a string is.
  - Loader: declared-form validation resolves the element schema from the producer's `outputsSchema` (record value or array element) and checks every `$item` path against it. This is the same check as `$output` paths. tsc cannot check hand-written literal `$item` paths; the loader does.
- **Errors** (all at declared validation unless marked):
  - `$item`/`$key` outside any `$map`, or naming an unknown binding;
  - `over` whose schema is not an array or record;
  - `into: "record"` with an `over` whose schema is an array;
  - an `$item` path absent from the element schema;
  - (resolve time) `over` resolved to a non-collection (or to a non-record under `into: "record"`), or an element missing a path the schema marked optional;
  - (resolved validation) a rendered element failing the target schema. The error names the host path and the element key.
  - An empty collection renders `[]` (or `{}` under `into: "record"`), which is valid.

### 3.4 The Sektar examples

```js
// hosts/connect/host.js: works standalone (run record) AND as a vetra/desktop/cli member (live outputs)
import { outputs as switchboard } from "../switchboard/outputs.js";

plugins: [{ module: "@powerhousedao/connect/plugins/workflows",
            config: { drive: switchboard.drives.workflows.url } }],
// literal form: { $output: { host: "switchboard", path: ["drives", "workflows", "url"] } }
```

```js
// hosts/cli/host.js: cli-connect follows the switchboard's real endpoint and
// attaches every drive it ends up serving, including plugin-created ones
import connect from "../connect/host.js";
import { outputs as switchboard } from "../switchboard/outputs.js";

"cli-connect": {
  host: "connect",
  reactor: {
    protocol: connect.reactor.protocol,                  // restores what the full-statement override drops today
    backends: { sb: { kind: "remote", remote: { url: switchboard.endpoints.graphql } } },
    drives: {
      $map: {
        over: { $output: { host: "switchboard", path: ["drives"] } },
        to: { slug: { $key: true }, remote: { url: switchboard.drives.$item.url } },
      },
    },
  },
},
```

### 3.5 Loader pipeline (one resolver: `resolveHostOutputs(host, sources)`)

| Step | When | What |
|---|---|---|
| 1 import | `import(host.js)` | sibling `host.js` and `outputs.js` imports allowed; a stale `outputs.js` fails here (3.2) |
| 2 static check | after import | JSON round trip, unchanged. Tokens are plain data, so they pass |
| 3 declared validation | load time, editor, tsc | `makeHostSchemas({ tokens: "allow" })`: every `ref()` field is `T \| token`; token paths checked against the producer's `outputsSchema`; `$env` shape and `optional` placement checked (values are not read yet) |
| 4 plan | load time | dependency graph from tokens → compound start order (topological). `startOrder` becomes optional; if given it must agree. Cycles fail. `ph run --explain outputs` prints the graph |
| 5 resolve | at start | `$output` from started members' `RunnerHandle.outputs` (compound) or the producer's live run record (standalone); `$env` from the resolving process's environment. An output whose producer is not running **fails** (below) |
| 6 resolved validation | before the verb | `makeHostSchemas({ tokens: "forbid" })`; verbs receive `z.output` with no tokens |

- **Unknown outputs fail.** As in Pulumi, outputs exist only once their producer has been created. When a standalone host consumes an output and the producer has no live run record (missing, dead or foreign), resolution fails: `connect needs outputs from host "switchboard", which is not running. Start it first: ph run switchboard (or run a compound that includes it).` There is no fallback derived from the producer's declared config, no waiting and no auto-start.
- `ref(schema)` lives in `./schema`. Host-core uses it in `reactor.backends.*.remote.url`, `reactor.drives[].remote.url`, `reactor.drives` (whole array, for `$map`), `storage.dataDir` (`$env` only), clint agent/proxy targets and Connect `drives.defaultDrives[].url` plus `renown.switchboardUrl` (the tokens live in `@powerhousedao/shared/host-tokens`, which host-core re-exports, so `connectConfigSchemaWith(s.tokenable)` in shared builds the connect host's declared `config`; `connectConfigSchema` itself stays token-free). Plugin `configSchema`s use it for their own fields; the connect workflows plugin's `drive` becomes `ref(z.url())`, which replaces `driveReferenceSchema`.
- The resolver is pure and browser-safe. It takes an `OutputSource` interface and an environment map. The compound-handle and run-record sources, and the `process.env` map, are node adapters.
- `$env` resolution also applies to standalone ph-cli runners, fixing the literal `${userData}` mkdir at `clis/ph-cli/src/runners/reactor-env.ts:31-34`.
- It **replaces clint's `remote.host` logic**: `mastra-runner.ts:61-94` and `clint-runner.ts:116-126` delete their resolvers.

**Considered: Pulumi-style `Output<T>` objects with `.apply()`.** Rejected because they make host files programs that can't be serialized, inspected or fully validated before running. `$map` covers the main `.apply` use case.

### 3.6 Live outputs: run record v2 and runner handles

- **Run record v2** (zod, validated on read). A v1 record reads as "not running"; records are per-process and rewritten on the next start.

  ```ts
  { version: 2; host; kind; verb; pid; startedAt;
    outputs?: …;                                                      // standalone
    members?: { [key]: { host; runnerModule; kind; verb; outputs } } } // compound
  ```

- Standalone `ph run` writes a record too. Today only the compound does (`clis/ph-cli/src/services/run/start-run.ts`).
- Connect `dev`/`serve` return a `RunnerHandle` with `outputs: { origin, endpoints: { connect } }` and `ready` set when Vite or the static server is listening.
- Switchboard's handle gains `shutdown()`, closing HTTP and stopping the reactor. Today it has none (`clis/ph-cli/src/runners/switchboard.ts:316-321`), so compound teardown leaks it.
- `RunnerContext`: `ctx.verb` becomes the member's **own effective** verb, and `ctx.parent?: { host, verb }` is added for members of a compound. This fixes desktop-connect `serve()` seeing `run` and filtering plugins by it (`connect.ts:287`).

### 3.7 Removal of the old mechanisms

Removed in **T3**, when the resolver that replaces them lands. The removed forms fail schema validation with an error that names the token form, for example `drive: { from, slug } was removed; use switchboard.drives.workflows.url from ../switchboard/outputs.js, or { $output: { host: "switchboard", path: ["drives", "workflows", "url"] } }`.

| Old | New | Stage |
|---|---|---|
| `{ from, slug }` (`HC/plugins.ts:59-78`, `compound.ts:144-186`; scaffold `hosts.ts:225,324,435`), and `driveUrls` with it | `$output` on `drives.<slug>.url` (`member: from` when two members share a host) | T3 |
| `remote: { host }` | `remote: { url: <switchboard.endpoints.graphql> }` | T3 |
| clint `agents.<x>.host`, proxy `routes.<p>.member` | `$output` | T3 |
| `projectDrivesIntoConnect`, `drivesPublicBase`, `isConnectMember`, `isReactorFactMember` | tokens + `kind` | T3 |
| template-literal sibling URLs, hardcoded URLs | `$output` / `$map` (not a detectable form; rewritten in the scaffold and Sektar) | T3 (connect, assistant), T4 (cli, desktop) |
| `"${userData}"` | `$env` (string form kept as sugar) | unchanged |

## Consumability (future monitor)

reactor-monitor is expected to consume host definitions later, in **both Node
and the browser**, and spin up configurations from them. Switchboard members
will be real processes there, not emulated. This plan only guarantees the
following:

| Subpath | Contents | Platform |
|---|---|---|
| `./schema` (new) | zod schemas + inferred types, `ref()`, `makeHostSchemas`, token types, `drive-schema.ts` (split from `drives.ts:26-45`), pure `$env` substitution (split from `placeholders.ts`), `PHHost`/`PHHostRunners`/`PHPluginConfigs` | neutral |
| `./projection` (new) | `reactor-config.ts` projections, `backend-projection.ts`, `connect-projection.ts`, `resolveHostOutputs` + `OutputSource`, `expectHost`, `runRecordSchema` | neutral |
| `./plugins` | unchanged | neutral |
| `.` | everything node: loader, runner resolution, `drives.ts` seeding/`projectDriveId`, run-record I/O, output-source adapters | node |

- Build the neutral entries with tsdown `platform: "neutral"`, plus a build assertion (like `apps/reactor-monitor/scripts/assert-worker-chunk.mjs`) that fails if a neutral entry's output contains `node:`.
- `projectDriveId` needs `node:crypto`. Its pure counterpart in `./projection` takes a hasher (or uses `crypto.subtle`).
- Both the declared form (tokens) and the resolved form are JSON, so a host can be sent to another process and resolved there against a run record.

## Stages

A stage is one wave of parallel work units (see Delivery), integrated on
`feat/host-icons` together with its scaffold and Sektar edits. It is done when
the monorepo suites and the Sektar checks in its row are green. Stage
boundaries are real dependencies only: each stage compiles against types the
previous one exports.

| Stage | Delivers | Acceptance | Needs |
|---|---|---|---|
| T1 schema spine | **Lane A (host-core):** `drive-schema.ts` split and pure `$env` substitution; `./schema` + `./projection` neutral entries with the no-`node:` assertion; zod single source (inferred `ReactorConfig` & co, `ChildWrapper`, `compoundWiringSchema`, `runRecordSchema` v2, `runnerHandleSchema`); `HostSchemaLike` returns data, verbs get output; `HostDefinition` union, strict top level, `kind`-aware XOR, verb/`defaultVerb` validation, required backend `kind`; `RunnerHandle<O>`, `RunnerContext` (`ctx.verb` own, `ctx.parent`), compound teardown through `shutdown()` and v2 records; token types in `HC/tokens.ts`, `ref()`, `makeHostSchemas` (defined, not yet applied to fields; `validateHost` uses `tokens: "forbid"` until T3); `PHHostRunners`/`PHPluginConfigs`/`PHHost`/`PluginEntry` declarations; per-runner JSON Schema emission helper; `lintHostImports` strips comments; casts removed in ph-cli, clint, desktop. **Lane B (shared):** zod `connectConfigSchema`, emitted Ajv fragment (1.6) | existing tests pass; `pnpm typecheck` with casts removed; schema-drift test; unknown-`startOrder`, `reactr`, reactor-with-children and compound-with-reactor each rejected; neutral build assertion green; JSDoc `import(` in a comment loads; stub compound: teardown calls every member's `shutdown`, a `serve` member sees `ctx.verb === "serve"` and `ctx.parent.verb`; Connect config drift test pinned and `ph connect config` validates through it. Sektar: T1 rows; every host loads | — |
| T2 runner contracts | per runner: `hostSchema` extends the base and declares every option it reads, `kind`, `outputsSchema`/`XOutputs`, server verbs return `RunnerHandle<O>`, `PHHostRunners` augmentation, emitted JSON Schema + drift test. **Lane A (ph-cli):** connect (`config: connectConfigSchema`, handles), switchboard (outputs incl. plugin-created drives, `shutdown()`), standalone `ph run` writes a v2 record. **Lane B:** clint (mastra, clint, proxy) and desktop. **Lane C:** connect and switchboard plugin `configSchema`s, `PHPluginConfigs` augmentation, plugin-owned slices and the dead-config warning | per runner: an unknown runner key and a `defaultVerb` typo are rejected; compound teardown frees the switchboard port; a standalone switchboard writes a v2 record whose outputs validate and include `drives.workflows`; dead-config warning for `connect.drives.allowAddDrive`. Sektar: T2 rows; every host loads; `ph run switchboard` record lists `sektar` and `workflows` | T1 |
| T3 tokens, resolver, authoring | **Lane A (resolver):** `ref()` applied to the host-core fields in 3.5, `remote.url` required and `remote.host` gone; declared validation (`tokens: "allow"`) of token paths, `$env` shape and `optional` placement; dependency plan and start order; `resolveHostOutputs` with compound and run-record sources; fail-fast on unknown outputs; resolved validation; `--explain outputs`; standalone `$env` (fixes `reactor-env.ts`); `{ from, slug }`, `driveUrls`, `projectDrivesIntoConnect`, `drivesPublicBase`, `isConnectMember`/`isReactorFactMember` deleted. **Lane B (cutover):** clint agent and proxy targets as `ref()`, clint resolvers deleted (mastra reads the resolved `remote.url`), mastra `apiKey` (`ref()`) passed to the provider; connect workflows `drive: ref(z.url())`; each removed form rejected naming the token form. **Lane C (authoring):** `lintHostImports` allows `../<host>/outputs.js`, lints it as data, **rejects `process.`**; `ph generate` emits `outputs.js` + `outputs.d.ts` (`$item` trees, hash); stale hash fails the load; scaffold emits `hosts/tsconfig.json`, `hosts/types.d.ts` and the `tsc -p hosts` script | resolver unit tests over canned outputs; standalone connect resolves the workflows drive from a live switchboard record, and fails naming `switchboard` and `ph run switchboard` without one; `$env` unset fails, `optional` omits, misplaced `optional` rejected; `process.env` rejected pointing at `$env`, `process` in a comment is not; each removed form rejected with the token form; `generated-hosts.test.ts` runs `tsc -p hosts` (a typo and a wrong token path fail) and snapshots `outputs.js`; a stale hash fails with "run `ph generate`". Sektar: T3 rows; `npm run tsc` incl. `tsc -p hosts`; `ph run assistant` fails naming `OPENROUTER_API_KEY` without it | T2 |
| T4 `$map` + fixtures | **Lane A:** `$map`/`$item`/`$key`, `into: "record"`, named bindings, nesting, element-schema path checks, 3.3 errors, `MapToken` typing in `ref()` positions. **Lane B:** G2 fixture hosts, `expectHost`, table-driven test, one negative fixture per 2.1 invariant | one test per 3.3 error case (incl. `into: "record"` over an array); the cli fixture renders every switchboard drive incl. a plugin-created one; key-sorted order; `into: "record"` keeps keys; `tsc -p hosts` accepts `$item` only in string positions; fixture table green. Sektar: T4 rows; `ph run cli` attaches `sektar` and `workflows`; `ph run desktop`; `ph run vetra` | T3 |

Critical path: T1-A → T2-A → T3-A → T4-A, with the integration step after
each wave.

### Sektar and scaffold changes by stage

Applied by the integrator after the stage's lanes merge (see Delivery).
Sektar paths are under `hosts/`. Each Sektar file is rewritten once where the
stages allow it. The scaffold (`packages/codegen/src/templates/boilerplate/hosts.ts`)
gets the same change as the matching Sektar host in the same stage, and
`generated-hosts.test.ts` snapshots are updated with it.

| Stage | File | Change |
|---|---|---|
| setup | `package.json` | repoint the 12 `link:../powerhouse/…` deps to the host-icons worktree (Delivery, "Sektar pickup") |
| T1 | `desktop/host.js` | add `kind` to `backends.main` (:65-80), now required; same for any scaffold backend without one |
| T1 | all | fix whatever the strict top level and `kind`-aware XOR reject |
| T2 | all | fix whatever the strict runner schemas reject |
| T2 | `switchboard/host.js` | annotate only. `auth` stays in `powerhouse.config.json`: the switchboard runner does not read `reactor.auth` (no `auth` in `switchboard.ts`) |
| T3 | all, scaffold | `/** @satisfies {PHHost} */`; add `hosts/tsconfig.json` + `types.d.ts`; `tsc` script covers `tsc -p hosts`; run `ph generate` for `outputs.js` |
| T3 | `assistant/host.js` (model) | **bug:** `config.model` is `undefined` without `OPENROUTER_API_KEY` (:44-46), so the host fails the static gate, and it reads `process.env`, which T3 bans. Use a literal model plus `apiKey: { $env: "OPENROUTER_API_KEY" }` (required, not `optional`): without the key the host fails at resolve, naming `OPENROUTER_API_KEY` |
| T3 | `assistant/host.js` (remote) | `remote: { host }` (:30-35) → `remote: { url: switchboard.endpoints.graphql }` |
| T3 | `assistant/host.js` (port) | port 4910 → `powerhouse.config.json` |
| T3 | `connect/host.js` | workflows plugin `drive` → `switchboard.drives.workflows.url`, replacing the hardcoded `localhost:${config.reactor?.port ?? 4001}` URL (:35); `sektar` drive declaration → read from `switchboard.reactor.drives` (sibling import), not a copy (:66-71) |
| T3 | scaffold vetra, desktop, cli | connect member's workflows `drive: { from, slug }` (`hosts.ts:225,324,435`) → `switchboard.drives.workflows.url` |
| T3 | `vetra/host.js` | annotate. Confirm whether vetra-switchboard dropping the `sektar` drive (:33-43) is intended |
| T4 | `cli/host.js`, scaffold | delete `serverPort`/`serverDrives` (:14-15); backend URL → `switchboard.endpoints.graphql`; drives → `$map` (3.4); **restore `protocol`**, which the full-statement override currently drops (:40-51) |
| T4 | `desktop/host.js`, scaffold | delete `serverPort`/`serverDrives` (:17-25); desktop-connect drives (:93-101) → `$map` over switchboard `drives` (as cli); drop redundant restatements (:64, :88) |
| T4 | `hosts/README.md`, root `README.md` | fix drift: sibling imports and `outputs.js` are legal; `process.env` is not (use `$env`); connect is `in-process`, not `worker`; desktop is in-process + remote drives, not router |
| follow-up | — | UI constants duplicating host data (`routes/-shared/products.ts:41-45,64`, `editors/sektar/kit/data.ts:48`) and the assistant instructions' hardcoded tool and drive names; `profile` vs `app.json` duplication in desktop |

## Delivery

### Dependency graph and chokepoints

```
T1-A spine ──┬─> T2-A ph-cli runners ──┐
T1-B connect │   T2-B clint, desktop ──┼─> T3-A resolver ──> T4-A $map
  config ────┘   T2-C plugin configs ──┘   T3-B cutover        T4-B fixtures
                                           T3-C authoring
```

Every wave needs the whole previous wave integrated: T2 lanes extend T1's base
schemas and handle types; T3's resolver reads T2's `outputsSchema`s and T3-C
generates from them; T4 extends T3's resolver walk and its fixtures load
through the whole pipeline.

Serial chokepoints, each with a single owner:

- **Schema spine** (`HC/host-schemas.ts`, `reactor-config.ts`, `runner-resolver.ts`, `run-record.ts`, `compound.ts`, `host-loader.ts`, `drives.ts`, `placeholders.ts`, the barrels and `tsdown.config.ts`). Everything extends it, so T1-A is one agent and nothing else runs on host-core in wave 1.
- **Resolver pipeline** (`HC/compound.ts`, `runner-resolver.ts`, `plugins.ts`, the new resolver module, `clis/ph-cli/src/services/run/start-run.ts` and `explain.ts`). One owner per wave (T1-A, T2-A for `start-run.ts`, T3-A, T4-A), because load → validate → resolve is one call chain. `HC/host-loader.ts` stays import, lint and static check (pipeline steps 1–2); declared validation, plan and resolve (steps 3–6) are invoked through `validateHost` and the resolver module from `start-run.ts`, `compound.ts` and `explain.ts`. That split is what lets T3-C own `host-loader.ts` while T3-A owns the rest.
- **Host content** (scaffold `templates/boilerplate/hosts.ts`, `generated-hosts.test.ts` snapshots, Sektar `hosts/*` and READMEs). The integrator owns it in every wave: the scaffold and Sektar must change identically, and Sektar is only checkable against the integrated branch.

Shared files lanes may touch by **appending only**: `HC/index.ts`, the
`./schema` and `./projection` entry files, `packages/host-core/package.json`
`exports`, and the `tsdown.config.ts` `entry` list. The integrator unions
them on merge. Any other conflict is a scope violation.

### Parallel lanes

| Wave | Lane A | Lane B | Lane C | Integrator |
|---|---|---|---|---|
| 0 | | | | create lane worktrees for wave 1; Sektar pickup |
| 1 | T1-A spine | T1-B connect config | | merge; T1 host content |
| 2 | T2-A ph-cli runners | T2-B clint, desktop | T2-C plugin configs | merge; T2 host content |
| 3 | T3-A resolver | T3-B cutover | T3-C authoring | merge; T3 host content |
| 4 | T4-A `$map` | T4-B fixtures | | merge; T4 host content |

### Work units

Write sets are exclusive within a wave. Every unit may read the whole
monorepo. Each unit's input is the previous wave integrated on
`feat/host-icons`. Verification is the unit's own; the stage's acceptance is
run by the integrator.

| Unit | Owns (write set) | Deliverables | Verify |
|---|---|---|---|
| T1-A | `packages/host-core/**` (incl. `test/`, `package.json`, `tsdown.config.ts`); cast sites in `clis/ph-cli/src/runners/*`, `packages/clint/src/runners/*`, `packages/desktop/src/runner.ts` (casts only) | T1 lane A | host-core `test`, `tsc`, `lint`, `build` (neutral assertion); ph-cli, clint, desktop `tsc` + `test`; `pnpm typecheck` |
| T1-B | `packages/shared/clis/types.ts`, `shared/connect/schema-fragments.ts`, `shared/clis/source-config-schema.ts`, new `shared/connect/connect-config-schema.ts`, their tests | T1 lane B | shared `test`, `build`; ph-cli `test` (connect config) |
| T2-A | `clis/ph-cli/src/runners/{connect,switchboard,reactor-env,compound}.ts`, `clis/ph-cli/src/services/run/start-run.ts`, ph-cli runner tests | T2 lane A | ph-cli `test`, `tsc`, `lint` |
| T2-B | `packages/clint/src/runners/*`, `packages/desktop/src/runner.ts`, their tests | T2 lane B | clint and desktop `test`, `tsc`, `lint` |
| T2-C | `apps/connect/src/plugins/*`, `apps/switchboard/src/plugins/*`, `HC/plugins-resolve.ts`, their tests | T2 lane C | connect, switchboard, host-core `test`, `tsc`, `lint` |
| T3-A | `HC/{host-schemas,compound,runner-resolver,plugins,run-record}.ts`, new `HC/resolve/**`, `clis/ph-cli/src/services/run/{start-run,explain}.ts`, `clis/ph-cli/src/runners/{reactor-env,compound}.ts`, their tests | T3 lane A | host-core and ph-cli `test`, `tsc`, `lint` |
| T3-B | `packages/clint/src/runners/*`, `apps/connect/src/plugins/workflows.ts`, `packages/desktop/src/runner.ts` if it reads a removed form, their tests | T3 lane B | clint, connect, desktop `test`, `tsc`, `lint` |
| T3-C | `HC/host-loader.ts`, `packages/codegen/**` except `templates/boilerplate/hosts.ts`, ph-cli `generate` wiring if needed, their tests | T3 lane C | codegen and host-core `test`, `tsc`, `lint` |
| T4-A | `HC/resolve/**`, `HC/tokens.ts`, their tests | T4 lane A | host-core `test`, `tsc`, `lint` |
| T4-B | `packages/host-core/test/fixtures/hosts/**`, new `HC/expect-host.ts`, the fixture test | T4 lane B | host-core `test` (the `$map` fixtures go green after T4-A merges) |

Verify commands are `pnpm --filter @powerhousedao/<pkg> <script>`. Add
`pnpm check-ts-references` whenever a unit changes a package dependency.

### Execution model

- **Integrator.** One agent, never concurrent with itself: the main session or a coordinator subagent it spawns. It works in the host-icons worktree on `feat/host-icons` and in the Sektar checkout on `main`. It owns host content, merges, the dist rebuild and the Sektar checks. It works from scratchpad files: `rules.md` (the setup rules below), `tracker.md` (unit, branch, worktree, base SHA, status) and `reports/<unit>.md`, and keeps no state that is not in them.
- **Implementers.** One subagent per unit, at most 3 at once. Each works in its own worktree, `~/.worktrees/powerhouse/host-icons-<unit>` on branch `feat/host-icons-<unit>`, created off `feat/host-icons` at the wave's start. The user asked for these branches for this plan; nobody creates others. Implementers commit at each logical step and write outcome, deviations, and the commands they ran with exit codes to `reports/<unit>.md`.
- **Brief.** Every implementer brief contains:
  - scope: the unit's deliverables from Stages, and the base SHA;
  - owned files (the write set above) and the append-only shared files;
  - acceptance: the unit's tests and its Verify commands, each expected to exit 0;
  - don't touch: other units' write sets, `templates/boilerplate/hosts.ts`, `generated-hosts.test.ts` snapshots (T3-C may change the test's logic), the Sektar repo, `.mcp.json`;
  - stop and escalate when: a change is needed outside the write set; a T1 spine type has to change after wave 1; a test passes only by loosening a schema, skipping a test or disabling a lint rule; the design in this plan looks wrong.

### Per-stage loop

1. Implementers run in parallel, then `/code-review` their own diff; confirmed findings are fixed as separate commits.
2. The integrator merges lanes into `feat/host-icons` in lane order (A, B, C) with `git merge --no-ff`, and runs the merged lane's Verify commands after each merge. Append-only conflicts are unioned; any other conflict stops the stage and is escalated.
3. The integrator applies the stage's host content (scaffold and Sektar rows), updates `generated-hosts.test.ts` snapshots and, from T4, refreshes the scaffold copies among the fixture hosts.
4. Verification: `pnpm check-ts-references`, `pnpm typecheck`, tests of every touched package, codegen `test`; dist rebuild (`shared` first, then `host-core`, `codegen`, `ph-cli`, `clint`, `desktop`, `connect`, `switchboard`); in Sektar: `npm run tsc`, `FEATURE_UNIFORM_RUNNERS_ENABLED=true ph run <host> --explain drives` for every host (from T3 also `--explain outputs`), then the stage's live `ph run` checks.
5. Commit host content in both repos. Create the next wave's worktrees off the new `feat/host-icons` head.

Nobody pushes, opens a PR or merges to `main`; those wait for the user.
Merged lane branches and worktrees stay in place for the user to remove.

### Sektar pickup

Sektar's `package.json` links `@powerhousedao/*` and `document-model` to
`../powerhouse/…`, the main checkout on `main`. `feat/host-icons` is already
checked out in the host-icons worktree, so the main checkout cannot follow it.
In wave 0 the integrator repoints the 12 links to
`link:../../../.worktrees/powerhouse/host-icons/…`, runs `pnpm install`, and
commits that as one Sektar commit. Reverting it is the last step once
`feat/host-icons` reaches `main`. Sektar consumes `dist` (its tsconfig has no
`customConditions`), hence the dist rebuild in step 4. Lane worktrees never see
Sektar.

### Agent setup rules

- In a fresh worktree, run `pnpm install`, then `pnpm --filter @powerhousedao/shared build`, then build the dists of the packages under test, before any test run. Rebuild stale dists after merging.
- Any `ph run` needs `FEATURE_UNIFORM_RUNNERS_ENABLED=true`.
- Tests that start a switchboard bind an ephemeral port, so lanes never collide.
- No `git stash`, no history rewrites (rebase, reset, amend), no push, no PR, no branch deletion.

### Escalation

The integrator escalates to the user any deviation from the design in this
plan, any change of scope, and any Sektar check that fails for a reason the
stage's rows do not cover. It stops that stage until it gets an answer.
Everything else is decided in the lane and recorded in its report.

## Decisions

All decisions are made.

1. **Output reference form.** DECIDED: plain-JSON tokens plus `$map`, with generated `outputs.js` sugar. Host files stay serializable and inspectable; Pulumi-style `Output` objects rejected (3.5).
2. **Unknown outputs.** DECIDED: fail with an error naming the producer and how to start it (3.5). As in Pulumi, outputs exist only after creation; a guessed fallback would hide a misconfigured topology.
3. **Typing host.js.** DECIDED: global type map (`PHHostRunners`/`PHPluginConfigs`) augmented by runner/plugin packages, one `@satisfies {PHHost}` per file (1.4). Type-level only, so the runtime stays registry-free.
4. **`$map` result.** DECIDED: array by default; `into: "record"` keeps input keys and requires a record `over` (3.3). That is the simplest rule with no invented keys.
5. **Extra operators.** DECIDED: none in v1. The set is `$output`, `$concat`, `$map` (+ `$item`/`$key`), `$env`; `$filter`/`$pick`/`$default` are future. Nothing in Sektar or the scaffold needs more.
6. **`ctx.verb`.** DECIDED: the member's own effective verb, plus `ctx.parent?: { host, verb }` (3.6). Runners reason about their own verb; the compound context is still available.
7. **Old cross-host forms.** DECIDED: removed in T3 with no rewrite layer; the scaffold and Sektar change in the same stage (3.7). The system is flag-gated and Sektar is its only consumer, so there is nothing to deprecate.
8. **Connect config → zod.** DECIDED: in T1; zod is the single source and the Ajv path consumes the emitted JSON Schema fragment (1.6). One schema cannot drift from itself.
9. **`process.env` in host files.** DECIDED: banned by `lintHostImports` in T3, together with `$env`; environment values go through `$env` (3.2). This keeps host files data and removes the Sektar assistant bug class.
10. **`$map` record order.** DECIDED: key-sorted (3.3), for deterministic resolution independent of publication order.
11. **Stale `outputs.js`.** DECIDED: fail the load with "run `ph generate`" (3.2). A stale token tree points at outputs that may not exist.
12. **`$env` when unset.** DECIDED: unset fails, naming the variable; `{ $env: { name, optional: true } }` omits its enclosing property and is legal only as a direct property value (3.2).
13. **When `$env` resolves.** DECIDED: step 5 (resolve), in the resolving process; step 3 checks shape only, so declared hosts stay environment-free and portable.
14. **Sektar assistant model.** DECIDED: literal model plus a required `apiKey: { $env: "OPENROUTER_API_KEY" }`; a missing key is a resolve-time failure naming the variable, not a demo-agent fallback.
15. **Run records.** DECIDED: v2 only; a v1 record reads as "not running" (3.6).
16. **Sektar pickup.** DECIDED: repoint Sektar's links to the host-icons worktree for the duration, as one revertable commit (Delivery).
17. **Host content owner.** DECIDED: the integrator applies every scaffold and Sektar host edit, after the stage's lanes merge, so both copies change identically and are checked against the integrated branch.
18. **Integration.** DECIDED: local `--no-ff` merges of lane branches into `feat/host-icons`; no push or PR without the user.

Decided during T3 (user, 2026-10-20):

19. **Two schemas, one definition.** Every runner exports `declaredHostSchema` (tokens allowed; `PHHostRunners[…].host` is its `z.input`) and `hostSchema` (resolved; `validateHost` before the verb), both from `defineHostSchemas((s) => …)`. Host-core's exported base blocks are the resolved form; a runner's own token-able field uses `s.tokenable` / `s.envTokenable`; refinements go inside the builder, last.
20. **Token input types.** `tokenSchema` is `z.ZodType<Token, Token>` (and `$concat` likewise), so a `ref()` field's input is `T | Token`, not `unknown`.
21. **Deferred self-references.** A compound's own fields that read its own members' outputs (clint `config.agents.*.url`, proxy `upstream`) resolve after those members start: `resolveHostOutputs(host, sources, { deferSelf: { members } })` resolves the rest now and returns `finish(outputSource)` for the deferred tokens.
22. **Compound Ctrl-C.** The compound owns the exit: members inside a compound install no exiting signal handlers; the first SIGINT/SIGTERM shuts members down in reverse plan order (consumers before producers) and exits once. Standalone hosts keep their handlers.
23. **Switchboard stop order.** Reactor first (`kill` → shutdown hooks incl. the HTTP drain → database), the same order as the signal path. Programmatic shutdown is the reactor module's idempotent `shutdown()` (extra unit RS).
24. **Third-party plugin config.** Requires `PHPluginConfigs` registration; the fallback entry form is config-less (1.4).
25. **Sektar dead Connect config.** `connect.drives.allowAddDrive` and `drives.sections` are deleted, not moved into a generic plugin entry.

Decided during T4 (user, 2026-10-20):

26. **Assistant port.** `PowerhouseConfig` and the source config JSON Schema gain `assistant: { port }`; the assistant host reads `config.assistant?.port ?? 4910` (Sektar and scaffold), the scaffold writes `assistant: { port: 4910 }` (fixed, not name-derived), and the mastra runner default stays 4910.
27. **vetra serves the project drives.** vetra-switchboard's drives are the switchboard host's drives followed by `vetra` and `vetra-preview` (Sektar and scaffold), so `ph run vetra` serves the project drive too.
28. **Remote backend without a block.** `{ kind: "remote" }` with no `remote` block fails host validation (a backend-schema refinement naming `remote.url` and the token form), closing the 2.1 gap the G2 fixtures found.

## Out of scope / future

- reactor-monitor integration: consuming host definitions to spin up configurations (Node and browser), a permutation harness, results UI.
- An `--overrides` layer for moving ports per run (tokens already make overrides propagate once one exists).
- Further token operators (`$filter`, `$pick`, `$default`) once a real host needs one.
- Moving the `ProjectedDescriptor ⇄ ReactorDescriptor` type pin from host-core's tests into reactor-monitor, which breaks the devDependency cycle once the monitor depends on host-core.
- De-duplicating UI constants and agent instructions against host data.
- Switchboard `reactor.auth`: the runner does not read it, so Sektar's `auth` stays in `powerhouse.config.json`.

## Risks

- **Type-checking cost.** Large inferred zod v4 unions over a `PHHost` discriminated union, plus `MapToken` templates, can slow `checkJs`. Measure in T3 (typed scaffold) and T4 (`$map` templates). If the union is slow, annotate per file with `@type {PHHostRunners["<module>"]["host"]}` (still the global map).
- **`$map` typing is partly loader-only.** tsc checks templates against the target element type and the generated `$item` trees, but not hand-written literal `$item` paths. The loader's declared validation is the backstop; its error messages must name the host path and binding.
- **Generated `outputs.js` drift.** A runner upgrade or a declared-drive change makes every consumer's `outputs.js` stale. That is a hard load failure until `ph generate` runs. It is cheap and the message says so, and `tsc -p hosts` catches removed paths before load.
- **Dual declared/resolved schemas.** `makeHostSchemas` keeps a single definition, but every new token-able field must use `ref()` or it can't take a token. Mitigate with a test that walks every fixture for unresolved tokens after step 6.
- **Reserved `$` keys.** A user config object whose sole key is `$output`/`$map`/… is now an operator. `$$` escapes it; the static check should flag unknown `$`-prefixed sole keys.
- **Cross-lane gaps surface at integration.** Lanes verify only their own packages; a stage's end-to-end and Sektar checks run after the merge. Mitigated by fixing the spine's types in wave 1, one owner per pipeline file, and stopping the stage on any non-append conflict.
- **Standalone resolution depends on run records.** A stale or foreign record could feed wrong outputs. v2 records carry `pid` and `startedAt`, and the existing live/foreign probe (`HC/run-record.ts`) runs before outputs are read. A record that fails the probe counts as "not running" and fails like a missing one.
