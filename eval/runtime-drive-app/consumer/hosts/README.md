# hosts/

Each subfolder defines one host: an application this project can run via
`ph run <host-name> [verb]`. A host.js is a static projection of
powerhouse.config.json — plain data, default-exported:

```js
export default {
  name, // display identity (never seeds storage identity — renaming is safe)
  runner, // { module, ...process options } — ph run imports and calls runner.module
  config, // handed to the runner's runtime whole
  reactor, // reactor runners only (projection arrives in a later phase)
  children, // compound runners only — reactor XOR children
};
```

Rules: the only legal import is the project's powerhouse.config.json; the
export must survive a JSON round trip (no functions); `ph <host-name>` is
sugar for `ph run <host-name>` (built-in commands win name collisions).

Scaffolded hosts: `connect` (studio dev server), `switchboard` (API/reactor
server), `vetra` (compound: both, dev mode — what `ph vetra` runs),
`desktop` (production switchboard + built Connect on the generic compound),
`assistant` (headless agent API on the project switchboard) and `cli`
(switchboard + Connect together, Connect as a remote client).

### Reactor-client topologies (what runs the reactor, and where)

The `reactor.backends` of a Connect host select which of four clients it
runs — one field, derived from the backend topology:

| host                       | backends                      | reactorClient | reactor + storage                                                                |
| -------------------------- | ----------------------------- | ------------- | -------------------------------------------------------------------------------- |
| `connect` (standalone)     | one `worker`                  | `worker`      | the tab's own reactor in a SharedWorker (PGlite in-worker)                       |
| `cli` → connect member     | one `remote`                  | `remote`      | NO local reactor — a pure client to the switchboard over GraphQL (no PGlite)     |
| `desktop` → connect member | — (serverDrives remote drive) | router/local  | the tab's reactor PLUS a SYNCHRONIZED remote drive (local replica, keeps PGlite) |

The lesson the `cli` vs `desktop` split teaches: a **remote client** proxies
to the switchboard and stores nothing locally (no PGlite); a **synchronized
remote drive** keeps a local replica and therefore needs PGlite by design.
The `in-process` mode (main-thread reactor) is the fourth option — set one
`in-process` backend instead of `worker`.

The single project drive (`powerhouse`) is OWNED by the switchboard; standalone
Connect has its own local copy; the `cli`/`desktop` compounds re-point Connect
at the switchboard's.
