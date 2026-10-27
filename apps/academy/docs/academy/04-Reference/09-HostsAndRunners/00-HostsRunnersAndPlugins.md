# Hosts, Runners & Plugins

:::info
This reference covers the **uniform runners** system, currently behind the
`FEATURE_UNIFORM_RUNNERS_ENABLED=1` flag. With the flag set, `ph run <host>`
starts any host your project declares. Classic commands (`ph switchboard`,
`ph connect`, `ph vetra`) are unaffected.
:::

A Powerhouse project describes every way it can run in its `hosts/` folder.
Each subfolder holds one **host file** — plain JavaScript, checked in, no
build step:

```
hosts/
  connect/host.js        ph run connect
  switchboard/host.js    ph run switchboard
  vetra/host.js          ph run vetra
  desktop/host.js        ph run desktop
```

`ph run <host> [verb]` loads the host file, validates it against the runner's
schema, and calls the runner's verb (`run` is the default; `dev`, `serve`,
`build` are common others).

## The host file

A host file default-exports an object with a **restricted top level** — five
keys, in this order:

```js
// @ts-check
import config from "../../powerhouse.config.json" with { type: "json" };

export default {
  // 1. Identity of the host (required, unique within the project)
  name: "my-switchboard",

  // 2. Presentation: how the host introduces itself (optional)
  profile: {
    appId: "com.acme.switchboard",
    name: "Acme API",
    description: "Acme's document API",
    icon: "./icon.svg",
  },

  // 3. WHO runs it and HOW — module, port, and the plugin composition
  runner: {
    module: "@powerhousedao/ph-cli/runners/switchboard",
    port: config.reactor?.port ?? 4001,
    host: "127.0.0.1",
    plugins: [
      "@powerhousedao/switchboard/plugins/mcp",
      "@powerhousedao/switchboard/plugins/attachments",
      "@powerhousedao/switchboard/plugins/workflows",
    ],
  },

  // 4. Runner-defined settings (a switchboard reads `config.switchboard`)
  config: {},

  // 5. EITHER a reactor block (single-reactor host) ...
  reactor: {
    protocol: config.connect?.reactor ?? {},
    drives: [
      { slug: "orders", name: "Orders", preferredEditor: "orders-app" },
    ],
  },
  // ... OR a children block (compound host) — never both. See "Compound hosts".
};
```

Two design rules follow from this shape:

- **Reference, don't duplicate.** Values that several hosts must agree on
  (ports, the replay protocol) live in `powerhouse.config.json` and are
  *referenced* from host files, so client and server cannot drift.
- **Everything is visible.** There are no hidden defaults layered behind the
  file: the composition you read is the composition that runs.

## Plugin entries: presence is activation

The `runner.plugins` array is the host's **composition**. An entry is either
a module specifier string or an object:

```ts
type PluginEntry =
  | string
  | {
      module: string;            // the identity — duplicates fail boot
      enabled?: boolean;         // default true
      verbs?: "*" | string[];    // default "*": active for every verb
      config?: object;           // validated against the plugin's configSchema
    };
```

The rules:

- **Presence is activation.** A listed plugin is on; an absent plugin is off.
  There are no enable/disable flags elsewhere — deleting the line is the off
  switch. (A curated API host deletes `mcp` and simply has no `/mcp`.)
- **Verb scoping** makes one host serve two moods. The canonical example is
  Vetra Studio, which is listed `verbs: ["dev"]` — `ph run vetra dev` is the
  studio; `ph run vetra` is the same stack headless.
- **Entry config** is data for *that plugin instance*, validated against the
  schema the plugin declares. A plugin that declares no schema accepts no
  config — passing one is a boot error, not a silent ignore.

```js
plugins: [
  "@powerhousedao/switchboard/plugins/attachments",
  { module: "@powerhousedao/vetra-studio/switchboard", verbs: ["dev"] },
  {
    module: "@acme/audit-plugin/switchboard",
    config: { sink: "https://audit.acme.com", batchSize: 50 },
  },
],
```

### Composing across hosts: sibling imports, full inclusion

Host files import each other by folder name and build their lists with plain
JavaScript — spread, filter, concat. There is no merge DSL and no override
grammar; a derived host *fully includes* what it wants and adds the rest:

```js
import switchboard from "../switchboard/host.js";

// vetra's switchboard member = the project's switchboard + the studio plugin
plugins: [
  ...switchboard.runner.plugins,
  { module: "@powerhousedao/vetra-studio/switchboard", verbs: ["dev"] },
],
```

Anything expressible over arrays is expressible here —
`switchboard.runner.plugins.filter(...)`, reordering, insertion — and the
result is always readable in place. Import cycles between host files fail at
load with both names.

A host file may import exactly three things: the project's
`powerhouse.config.json`, a sibling's `../<host>/host.js`, and a sibling's
generated `../<host>/outputs.js` (`ph generate hosts`). `process.` is banned —
read the environment with `{ $env: "NAME" }` (or
`{ $env: { name: "NAME", optional: true } }` to omit the property when unset),
resolved when the host starts.

## Core reactor config (not plugins)

Some things every reactor has; they are **core config**, not plugins:

```js
reactor: {
  // Fleet-consensus replay/admission settings — validated STRICTLY
  // (a typo'd key fails boot, it does not silently not-apply):
  protocol: config.connect?.reactor ?? {},

  // Declared drives. "Can't have a reactor without drives."
  drives: [
    {
      slug: "orders",             // the seeding key (idempotent across boots)
      name: "Orders",
      preferredEditor: "orders-app",  // which app opens documents in it
      // id: "explicit-id",       // or derive it from the project path:
      // projectHash: true,       // same ids classic `ph vetra` produces
      // remote: { url: "http://127.0.0.1:4001/d/orders" },  // attach, don't own
      // icon, sharingType: "public" | "private" | "shared", availableOffline
    },
  ],

  // Storage/read-model backends, renown identity, namespace — see the
  // generated hosts in a fresh `ph init` project for worked examples.
},
```

Drives declared here are **seeded idempotently** by slug on every boot, and
plugins may *contribute* additional drives. To see the merged result with
provenance before running anything:

```bash
ph run switchboard --explain drives
```

## Switchboard settings (`config.switchboard`)

A switchboard host sets the rest of its server config, such as auth,
inspection and workers, under `config.switchboard`. It takes the keys of
`@powerhousedao/switchboard/config`, except the ones the host file already
sets elsewhere: storage, protocol and dynamic packages in `reactor`, and
`runner.port`, the `dev` verb, `reactor.drives` and `runner.plugins`:

```js
config: {
  switchboard: {
    auth: { admins: ["0x…"], defaultProtection: true },
    inspection: { enabled: false },
    workers: { executor: { count: 2 } },
  },
},
```

Each switchboard gets its own config, so two switchboards in one compound can
use different stores, ports and settings. A key set in both `reactor` and
`config.switchboard` fails validation.

An environment variable the operator sets still wins over both blocks, for
example `PH_REACTOR_DATABASE_URL` over the reactor's storage. A
`DATABASE_URL` does not override `reactor.backends.*.readModel.url`. An
environment variable that contradicts `reactor.protocol` fails the boot.

A backend with a `readModel.url` and no `storage` still keeps its reactor
store on that url when no environment variable names one. This is
deprecated, and the switchboard warns at boot: set `storage` explicitly.

## The plugin shape

A plugin module default-exports either a `HostPlugin` object or — when it
accepts config — a **factory** `(config) => HostPlugin`:

```ts
import type { HostPlugin } from "@powerhousedao/host-core";

interface HostPlugin<THooks, TConfig> {
  name: string;              // stable id: ordering, dependsOn, diagnostics
  appliesTo?: string;        // host-type requirement; default "reactor"
  enforce?: "pre" | "post";  // coarse ordering bucket (Vite-style)
  dependsOn?: string[];      // hard deps on OTHER PLUGINS (never the host)
  configSchema?: z.ZodType<TConfig>;  // no schema = no config accepted
  hooks?: Partial<THooks>;   // the behavior
  contributions?: {          // declarative, mergeable data
    drives?: DriveDeclaration[];
    packages?: string[];
    configDeclarations?: { name: string; type?: string; description?: string }[];
  };
}
```

**`appliesTo` and the host-type hierarchy.** Compatibility walks a parent
chain: `connect`, `switchboard`, and `mastra` all extend `reactor`, while
`compound` is its own branch (plugins over a *member set*, like a proxy). A
plugin with `appliesTo: "reactor"` composes onto any reactor host; one with
`appliesTo: "switchboard"` is rejected elsewhere — at boot, with both names
in the error.

**Hook kinds.** Host runtimes define a hook *vocabulary*; plugins implement
subsets of it. Three kinds exist:

| kind | shape | semantics |
| --- | --- | --- |
| provide | `(ctx) => T` | one winner — two providers of the same hook fail boot |
| transform | `(value, ctx) => T` | chained in plugin order, each sees the last's output |
| observe | `(ctx) => void` | lifecycle notification; teardown moments run sequentially in order |

**Ordering** is `enforce: "pre"` → normal → `"post"`, then `dependsOn`
topo-sorted within each bucket. Cycles and missing dependencies fail boot
naming both sides.

### Hook vocabularies are owned by the host runtime

Each runtime publishes the moments plugins can join. The switchboard's
vocabulary (the built-in `mcp` / `attachments` / `privacy` / `workflows`
plugins are ordinary consumers of it):

```
transformServerOptions    shape the server options before boot
onReadModelsRegistering   contribute read models
onHttpMounting            mount routes on the HTTP app
onSubgraphsRegistering    contribute GraphQL subgraphs
onReactorReady            the reactor is up
onDrivesReady             declared drives are seeded
onShutdown                teardown — sequential, in plugin order
```

Connect's browser-side pipeline currently resolves **built-in** plugins from
its own registry (`generic`, `sentry`, `openpanel`, `assistant`,
`vetra-studio/connect`); loading arbitrary third-party plugin modules in the
browser is on the roadmap. Server-side (switchboard, compound) compositions
resolve real modules from your project's `node_modules` today.

:::caution What removing the Connect generic plugin does today
The generic plugin owns the drive-chrome toggles: `allowAddDrive` and
`sections.{remote,local}.{enabled,allowAdd,allowDelete}` (configure them
through its entry `config`, not top-level `connect.drives`). When a host
declares a plugin list without `@powerhousedao/connect/plugins/generic`, those
toggles turn OFF and Connect hides the generic chrome: the sidebar and the
drive-list home screen. Drive and document views under `/d/` still render.
With no declared plugin list, every plugin reads as present, so classic Connect
is unchanged. (`branding` is NOT the generic plugin's concern. It reaches past
the chrome, for example into the document title, so it stays a top-level
`connect.branding` value that survives the plugin's absence. The switchboard
side behaves the same way: removing `mcp` removes `/mcp`.)
:::

### Workflows: one link, two plugins

Workflows have a server half and a browser half, and the two are declared so
the link between them is visible in `hosts/`:

```js
// hosts/switchboard/host.js — serves the workflow runtime AND the drive
plugins: [
  {
    module: "@powerhousedao/switchboard/plugins/workflows",
    // the Workflows drive this plugin seeds; `drive: false` = runtime only
    config: { drive: { slug: "workflows", name: "Workflows" } },
  },
],

// hosts/connect/host.js — loads Workflow Studio, attaches that drive
plugins: [
  {
    module: "@powerhousedao/connect/plugins/workflows",
    config: { drive: "http://localhost:4001/d/workflows" },
  },
],
```

- The **switchboard plugin** contributes its drive to the host's drive plan
  (`contributions.drives`): `ph run switchboard --explain drives` lists it
  with the plugin as the source, a host declaration with the same slug wins,
  and the drive opens in Workflow Studio (`preferredEditor: "workflow-studio"`
  on the drive document). Defaults: slug `workflows`, name `Workflows`, a
  project-hashed id (the id classic `ph vetra` gave it).
- The **Connect plugin** is presence-is-activation like the other built-ins:
  listed, Connect loads the workflow package (Workflow Studio exists) and
  attaches `drive` as a remote default drive; absent from a declared
  composition, `app.workflowsEnabled` is zeroed. The drive must be the
  switchboard's — Workflow Studio reaches the workflow runtime through the
  selected drive's switchboard, so a local copy of the drive would point the
  studio at the wrong endpoint. Connect warns when a drive names a drive app
  that no installed package provides, and Workflow Studio warns when its
  drive has no switchboard behind it.

**Read the link from the switchboard's outputs instead of spelling the
URL.** `drive` takes an output token: `switchboard.drives.workflows.url` from
the generated `../switchboard/outputs.js` (`ph generate hosts`), or the literal
form below:

```js
"vetra-studio": {
  host: "connect",
  runner: {
    plugins: [
      ...connect.runner.plugins,
      {
        module: "@powerhousedao/connect/plugins/workflows",
        config: {
          drive: { $output: { host: "switchboard", path: ["drives", "workflows", "url"] } },
        },
      },
    ],
  },
},
```

Inside a compound the token reads the switchboard member's live outputs, so
the compound starts that member first. Standalone `ph run connect` reads the
running switchboard's run record, and fails naming `ph run switchboard` when
none is running. The removed `{ from, slug }` form fails validation, naming
the token form. (The classic switches,
`workflows.enabled` / `connect.app.workflowsEnabled` / the host's
`reactor.workflows`, still parse; with the plugins listed they are redundant.)

## Writing your own plugin

A complete switchboard plugin with config, in one file:

```ts
// src/plugins/audit.ts  (built to dist/, exported as ./plugins/audit)
import { z } from "zod";
import type { HostPlugin } from "@powerhousedao/host-core";

const configSchema = z.strictObject({
  sink: z.string().url(),
  batchSize: z.number().int().positive().default(20),
});
type AuditConfig = z.infer<typeof configSchema>;

export function createAuditPlugin(config: AuditConfig): HostPlugin<{
  onReactorReady: (ctx: { read: unknown }) => Promise<void>;
  onShutdown: () => Promise<void>;
}> {
  let flush: (() => Promise<void>) | undefined;
  return {
    name: "acme-audit",
    appliesTo: "switchboard",
    configSchema,
    hooks: {
      onReactorReady: async (ctx) => {
        flush = startAuditPipeline(ctx.read, config.sink, config.batchSize);
      },
      onShutdown: async () => {
        await flush?.();
      },
    },
    contributions: {
      // declarative data merges with host-declared drives (visible in
      // `--explain drives` with this plugin named as the source):
      drives: [{ slug: "audit-log", name: "Audit Log" }],
    },
  };
}

export default createAuditPlugin; // factory: entry config is passed here
```

Publish it under a subpath (`"./plugins/audit"` in your package's `exports`),
then list it:

```js
plugins: [
  { module: "@acme/my-package/plugins/audit",
    config: { sink: "https://audit.acme.com" } },
],
```

Checklist:

1. **One default export** — the plugin object, or a factory if it takes
   config. The `module` specifier is the identity; listing it twice fails.
2. **Declare `configSchema`** if you accept config. Unknown keys and missing
   required keys fail at boot with the entry named.
3. **Pick the narrowest `appliesTo`** that is honest. `"reactor"` composes
   everywhere; `"switchboard"` only there.
4. **Prefer `contributions` over hooks** for anything declarative (drives,
   packages) — contributions merge, carry provenance, and show up in
   `--explain`.
5. **Clean up in `onShutdown`.** Teardown runs sequentially in plugin order.

## Writing your own runner

A runner is a module the host file names in `runner.module`. Its contract is
a handful of exports:

```ts
import { reactorHostSchema } from "@powerhousedao/host-core";
import type { HostDefinition, RunnerContext } from "@powerhousedao/host-core";

export const kind = "reactor";          // or "compound"
export const hostSchema = reactorHostSchema;  // extend with .extend(...) for
                                              // runner-specific runner.* keys

export async function run(host: HostDefinition, ctx: RunnerContext) {
  // boot your runtime from the validated host definition
}
export const serve = run;               // additional verbs are just exports
export async function dev(host: HostDefinition, ctx: RunnerContext) { /* … */ }
export async function build(host: HostDefinition, ctx: RunnerContext) { /* … */ }
```

- `ph run <host> <verb>` calls the export named `<verb>`; `run` is the
  default (a `runner.defaultVerb` in the host file can change it).
- `hostSchema` validates the host file before your code sees it. Start from
  `reactorHostSchema` / `compoundHostSchema` and extend.
- A runner that composes plugins resolves them with `resolveHostPlugins`
  (from `@powerhousedao/host-core`) and defines its own hook vocabulary — the
  moments above are the switchboard's, not a global list.
- Most custom hosts do **not** need a custom runner: the generic compound
  (`@powerhousedao/host-core/runners/compound`) plus plugins covers the
  common cases.

## Compound hosts

A compound host supervises *members* instead of owning a reactor. `children`
replaces `reactor`; each member wraps a sibling host by folder name:

```js
import connect from "../connect/host.js";
import { outputs as server } from "../switchboard/outputs.js";

/** @satisfies {PHHost} */
export default {
  name: "desktop",
  runner: { module: "@powerhousedao/desktop/runner" },
  children: {
    server: { host: "switchboard" },            // the sibling folder, as is
    app: {
      host: "connect",
      runner: { defaultVerb: "serve", port: 3000 },
      // Every drive the server member serves (declared and plugin-created,
      // e.g. Workflows), attached as a remote by the URL it reports.
      reactor: {
        ...connect.reactor,
        drives: {
          $map: {
            over: { $output: { host: "switchboard", path: ["drives"] } },
            to: { slug: { $key: true }, remote: { url: server.drives.$item.url } },
          },
        },
      },
    },
  },
};
```

Wrapper semantics are **full-statement** for `config` and `reactor`: a
section present on the wrapper replaces the member's section wholesale
(spread the member's own section in, as above, when you mean "theirs plus
mine"). `runner` is the exception: it key-merges over the member's own, so
`port` or `defaultVerb` alone keeps the member's plugins.

**Start order comes from the tokens.** The `app` member reads the `server`
member's outputs, so the compound starts `server` first and resolves `app`'s
tokens from its live outputs; `config.startOrder` is optional (it must agree
with the tokens). `ph run desktop --explain outputs` prints the order and,
while a producer runs, each token's value.

**`$map`** renders a list (or, with `into: "record"`, a record) from a
collection output: `over` is an `$output` (or, nested, an `$item`), `to` is
the template rendered once per element. Inside `to`, `{ $key: true }` is the
element's key (the index for an array) and `{ $item: ["url"] }` — or the
typed `server.drives.$item.url` from `outputs.js` — reads a path of the
element. Records are visited in key-sorted order, so the result is
deterministic. A nested map names outer bindings with `as` and
`{ $item: { as, path } }` / `{ $key: "<as>" }`. Compound-level plugins
(`appliesTo: "compound"`) act on the member set — the clint proxy is the
reference example: one front port, routes declared per member, resolved from
each child's `runner.{host, port}`.

## Debugging

| symptom | tool |
| --- | --- |
| which drives will exist, and why | `ph run <host> --explain drives` |
| which outputs a host reads, start order, current values | `ph run <host> --explain outputs` |
| plugin rejected on this host | the error names the plugin, its `appliesTo`, and the host type |
| two plugins provide one hook | boot error naming both — provide hooks have one winner |
| entry config rejected | boot error naming the entry and the schema failure |
| duplicate module in a composition | boot error — the specifier is the identity |
| sibling import cycle | load error naming the cycle |
