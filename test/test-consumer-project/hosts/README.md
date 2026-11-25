# hosts/

Each subfolder defines one host: an application this project can run via
`ph run <host-name> [verb]`. A host.js is a static projection of
powerhouse.config.json — plain data, default-exported:

```js
export default {
  name,     // display identity (never seeds storage identity — renaming is safe)
  runner,   // { module, ...process options } — ph run imports and calls runner.module
  config,   // handed to the runner's runtime whole
  reactor,  // reactor runners only (projection arrives in a later phase)
  children, // compound runners only — reactor XOR children
};
```

Rules: a host.js may import the project's powerhouse.config.json and its
sibling hosts' `../<host>/host.js` and generated `../<host>/outputs.js`,
nothing else; `process.` is banned (read the environment with
`{ $env: "NAME" }`); the export must survive a JSON round trip (no
functions); `ph <host-name>` is sugar for `ph run <host-name>` (built-in
commands win name collisions).

Another host's outputs (its URLs, drive ids, …) are read with output tokens,
e.g. `{ $output: { host: "switchboard", path: ["drives", "powerhouse", "url"] } }`,
resolved when the host starts (the producer must be running, or a member of
the same compound). `{ $map: { over, to } }` renders a list from a
collection output — e.g. one remote drive per drive the switchboard serves,
with `{ $key: true }` and `{ $item: ["url"] }` naming each element.
`ph generate hosts` writes each producer's
`outputs.js` (typed shortcuts: `switchboard.drives.powerhouse.url`) and
`types.d.ts`; `/** @satisfies {PHHost} */` plus `tsc -p hosts` type-check
every host file.

Scaffolded hosts: `connect` (studio dev server), `switchboard` (API/reactor
server), `vetra` (compound: both, dev mode — what `ph dev` runs),
`desktop` (production switchboard + built Connect on the generic compound),
`assistant` (headless agent API on the project switchboard) and `cli`
(switchboard + Connect together, Connect as a remote client).

### Reactor-client topologies (what runs the reactor, and where)

The `reactor.backends` of a Connect host select which of four clients it
runs — one field, derived from the backend topology:

| host | backends | reactorClient | reactor + storage |
|---|---|---|---|
| `connect` (standalone) | one `worker` | `worker` | the tab's own reactor in a SharedWorker (PGlite in-worker) |
| `cli`, `vetra` → connect member | one `remote` | `remote` | NO local reactor — a pure client to the switchboard over GraphQL (no PGlite) |
| `desktop` → connect member | one `worker` + `$map` remote drives | `worker` | the tab's reactor PLUS SYNCHRONIZED remote drives (local replica, keeps PGlite) |

The lesson the `cli` vs `desktop` split teaches: a **remote client** proxies
to the switchboard and stores nothing locally (no PGlite); a **synchronized
remote drive** keeps a local replica and therefore needs PGlite by design.
The `in-process` mode (main-thread reactor) is the fourth option — set one
`in-process` backend instead of `worker`.

A `remote` backend links to a switchboard by the address of one of its
drives, `<switchboard>/d/<slug>` (`switchboard.drives.powerhouse.url`), never
by its GraphQL endpoint. One switchboard is one remote backend; list its other
drives under `reactor.drives`.

Whichever client a host runs, it comes in two halves: reads go through
`read` and writes through `write`, whose writes hand back a handle to wait
on (`window.ph.reactor` in the browser, `module.read` / `module.write` on
a host, `ctx.clients` in a subgraph resolver). The single client object
(`window.ph.reactorClient`, `module.client`) is the facade over both, kept
for code that has not moved.

The single project drive (`powerhouse`) is OWNED by the switchboard; standalone
Connect has its own local copy; the `cli`/`desktop` compounds re-point Connect
at the switchboard's — every drive it serves, plugin-created ones (Workflows)
included, by `$map` over its `drives` output.
