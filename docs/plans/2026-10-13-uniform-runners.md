# Plan: uniform-runners

One package type; every Powerhouse application — Connect, Switchboard, Vetra,
desktop shells, agent APIs, agent CLIs — defined as a **host** in the project's
`hosts/` folder and started by a **runner** via `ph run <host> [verb]`.

Status: in progress on `main`, dark behind `FEATURE_UNIFORM_RUNNERS_ENABLED`
(ph-cli-side env toggle, hand-rolled predicate — no OpenFeature in the CLI).
Entry point: `ph init --uniform-runners` (or the env flag) scaffolds `hosts/`.
Superseded code is marked `// LEGACY(uniform-runners): …` — that grep is the
cleanup inventory for flag removal.

## The model

A project opts in structurally: a **valid** `hosts/` folder switches it to the
new boot path (empty/invalid → loud warning + legacy; no hosts/ → legacy,
byte-for-byte). Each host is a `host.js` — plain ESM default-exporting a
static, JSON-round-trippable **projection** of `powerhouse.config.json`
(shared/machine-written values referenced, host-specific values literal; only
that JSON may be imported):

```js
export default {
  name,      // display identity — never seeds storage identity
  runner,    // { module, ...process options (port, https, plugins, defaultVerb, …) }
  config,    // handed to the runner's RUNTIME whole (emission boundary)
  profile,   // optional app-store listing { appId, name, description, icon }
  reactor,   // reactor runners only: { backends: {<n>: descriptor}, placement?,
             //   workflows, protocol } — multi-reactor is a 2nd backend, not a flag
  children,  // compound runners only: the member map (wrapper = append plugins,
             //   override same-name sections) — reactor XOR children
};
```

`ph run <name> [verb]` imports the host, imports `runner.module` (resolved from
the project's dependency tree), validates against the runner's exported
`hostSchema`, and calls the verb (`run` required; `dev`/`build`/`serve`
optional; unsupported verb lists what exists). **No type→runner registry** —
what `ph vetra` does is written in `hosts/vetra/host.js`. `reactor.protocol`
single-sources the replay/admission rules (enforcement flags, signature
policy, stored-docs policy) so client/server divergence is unwritable.

## Phases (each lands dark; suites green in both flag states)

| Phase | Delivers |
|---|---|
| 0 | Flag; `ph run` dispatch + host loader; `ph init` hosts/ scaffold; **bridge runners** wrapping today's services (`runConnectStudio`, `startSwitchboard`, `startVetra`); equivalence gate: `ph run vetra` ≡ `ph vetra` |
| 1 | `packages/host-core` (private until end of phase): generic compound runner (supervision, instance-fact projection, `.ph/run/<host>.json` records, per-storage-root locks, `defaultVerb` forwarding); vetra becomes configuration |
| 2 | `reactor`/`profile`/`children` schemas (zod + emitted JSON schemas); projection of `reactor` onto today's options/env; protocol conflict guard (contradicting `REACTOR_*` env fails boot); legacy-ignored-value warnings |
| 3 | Verb completion: connect `serve` (static + config projection + CSP sync, deduping preview/Docker-entrypoint/desktop forks); compound verb forwarding; desktop runner extraction |
| R | (parallel) backends → reactor-monitor `provision()` / reactor-router routing inside the reserved `createReactorClients` step |
| 4–5 | (separate plan) plugin pipeline inside host runtimes; ph-clint convergence (cli-runner/agent-runner split, agents manager) |

Full working documents (specs, WBS, worked host examples, decisions log) are
maintained in the feature owner's `uniform-runners-plan/` workspace folder;
this file is the in-repo summary of record.
