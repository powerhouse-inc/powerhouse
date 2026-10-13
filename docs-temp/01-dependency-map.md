# Powerhouse monorepo — dependency map

Generated from every `package.json` in the workspace (`pnpm-workspace.yaml` globs:
`apps/*`, `clis/*`, `packages/*`, `packages/analytics-engine/*`, `test/*`, `scripts/*`).
51 workspace projects in total.

Only `workspace:*` edges are drawn — these are the intra-repo dependencies that
determine build order, TypeScript project references, and the blast radius of a change.

---

## 1. The 30-second version

The repo builds one product line in four bands:

| Band | Projects | What it is |
|---|---|---|
| **Foundation** | `@powerhousedao/shared`, `document-model`, `@powerhousedao/config`, `@powerhousedao/pglite-fs` | Types, constants, the event-sourced document primitive, config loading, a PGlite filesystem. No upward dependencies. |
| **Engine** | `@powerhousedao/reactor` plus `reactor-drive`, `reactor-attachments`, `reactor-hypercore`, `reactor-group`, `reactor-mcp`, `opentelemetry-instrumentation-reactor` | The document store: job queue, executor, operation store, read models, sync. |
| **Surfaces** | `reactor-api` (GraphQL/HTTP), `reactor-browser` (React hooks + client), `design-system`, `common`, `switchboard-gui` | How humans and machines reach the engine. |
| **Products and tooling** | `apps/connect`, `apps/switchboard`, `apps/academy`, `clis/ph-cli`, `clis/ph-cmd`, `packages/vetra`, `codegen`, `builder-tools`, `registry`, `renown` | The shipped apps, the builder platform, the CLIs, the package registry, identity. |

Plus a self-contained sub-repo, `packages/analytics-engine/*` (a time-series query
engine with pluggable stores), and a large `test/*` tree of e2e and load harnesses.

---

## 2. Full package graph (runtime `dependencies`)

```mermaid
graph TD
    classDef found fill:#1f4e5f,stroke:#0d2b35,color:#fff
    classDef engine fill:#4a3c8c,stroke:#2b2154,color:#fff
    classDef surface fill:#7a3b6e,stroke:#4a2342,color:#fff
    classDef product fill:#8c5a2b,stroke:#54361a,color:#fff
    classDef analytics fill:#2f6b3f,stroke:#1a3d24,color:#fff

    shared["@powerhousedao/shared"]:::found
    dm["document-model"]:::found
    config["@powerhousedao/config"]:::found
    pglitefs["@powerhousedao/pglite-fs"]:::found
    renown["@renown/sdk"]:::found

    reactor["@powerhousedao/reactor"]:::engine
    rdrive["reactor-drive"]:::engine
    ratt["reactor-attachments"]:::engine
    rhyper["reactor-hypercore"]:::engine
    rgroup["reactor-group"]:::engine
    rmcp["reactor-mcp"]:::engine
    otel["otel-instrumentation-reactor"]:::engine

    rapi["reactor-api"]:::surface
    rbrowser["reactor-browser"]:::surface
    ds["design-system"]:::surface
    common["@powerhousedao/common"]:::surface
    sbgui["switchboard-gui"]:::surface

    aecore["analytics-engine-core"]:::analytics
    aeknex["analytics-engine-knex"]:::analytics
    aepg["analytics-engine-pg"]:::analytics
    aebrowser["analytics-engine-browser"]:::analytics
    aegql["analytics-engine-graphql"]:::analytics

    codegen["@powerhousedao/codegen"]:::product
    builder["@powerhousedao/builder-tools"]:::product
    vetra["@powerhousedao/vetra"]:::product
    registry["@powerhousedao/registry"]:::product

    connect["apps/connect"]:::product
    switchboard["apps/switchboard"]:::product
    phcli["clis/ph-cli"]:::product
    phcmd["clis/ph-cmd"]:::product
    phvp["powerhouse-vetra-packages"]:::product

    dm --> shared
    config --> shared
    renown --> shared
    registry --> shared
    registry --> renown

    aecore --> shared
    aeknex --> aecore
    aepg --> aecore
    aepg --> aeknex
    aebrowser --> aecore
    aegql --> aecore

    reactor --> shared
    reactor --> dm

    rdrive --> reactor
    rdrive --> shared
    rdrive --> dm
    ratt --> reactor
    ratt --> shared
    rhyper --> shared
    otel -.peer.-> reactor

    rmcp --> reactor
    rmcp --> rdrive
    rmcp --> rgroup
    rmcp --> shared
    rmcp --> dm

    rbrowser --> reactor
    rbrowser --> ratt
    rbrowser --> rdrive
    rbrowser --> shared
    rbrowser --> dm
    rbrowser --> renown
    rbrowser --> aecore
    rbrowser --> aebrowser

    rgroup --> rbrowser
    rgroup --> shared
    rgroup --> dm

    rapi --> reactor
    rapi --> ratt
    rapi --> rdrive
    rapi --> rgroup
    rapi --> rmcp
    rapi --> config
    rapi --> pglitefs
    rapi --> shared
    rapi --> dm
    rapi --> renown
    rapi --> aecore
    rapi --> aegql
    rapi --> aepg

    ds --> rbrowser
    ds --> shared
    common --> shared
    common --> rbrowser
    common --> aecore
    sbgui --> ds

    codegen --> shared
    codegen --> dm
    builder --> config
    builder --> shared
    builder --> dm

    vetra --> codegen
    vetra --> config
    vetra --> ds
    vetra --> rbrowser
    vetra --> shared
    vetra --> dm

    connect --> config
    connect --> ds
    connect --> phvp
    connect --> reactor
    connect --> ratt
    connect --> rbrowser
    connect --> rmcp
    connect --> shared
    connect --> vetra
    connect --> renown
    connect --> dm

    switchboard --> config
    switchboard --> otel
    switchboard --> reactor
    switchboard --> rapi
    switchboard --> ratt
    switchboard --> rdrive
    switchboard --> rgroup
    switchboard --> pglitefs
    switchboard --> shared
    switchboard --> vetra
    switchboard --> renown
    switchboard --> dm

    phcli --> builder
    phcli --> codegen
    phcli --> common
    phcli --> config
    phcli --> reactor
    phcli --> shared
    phcli --> switchboard
    phcli --> vetra
    phcli --> renown
    phcli --> dm

    phcmd --> shared
```

> `powerhouse-vetra-packages` depends on `design-system`, `reactor-browser`,
> `reactor-drive`, `reactor-group`, `shared` and `document-model` as **devDependencies**
> only — it bundles them at build time rather than importing them at runtime, so
> those edges are left out of the graph above.

---

## 3. Layer view — the shape that actually matters

```mermaid
graph BT
    subgraph L0["Layer 0 — foundation, no intra-repo deps"]
        shared["shared"]
        pglitefs["pglite-fs"]
    end
    subgraph L1["Layer 1 — primitives"]
        dm["document-model"]
        config["config"]
        renown["@renown/sdk"]
        aecore["analytics-engine-core"]
    end
    subgraph L2["Layer 2 — engine"]
        reactor["reactor"]
    end
    subgraph L3["Layer 3 — engine extensions"]
        rdrive["reactor-drive"]
        ratt["reactor-attachments"]
        rhyper["reactor-hypercore"]
    end
    subgraph L4["Layer 4 — client surface"]
        rbrowser["reactor-browser"]
    end
    subgraph L5["Layer 5 — UI and platform models"]
        ds["design-system"]
        common["common"]
        rgroup["reactor-group"]
        rmcp["reactor-mcp"]
    end
    subgraph L6["Layer 6 — server surface and builder"]
        rapi["reactor-api"]
        vetra["vetra"]
    end
    subgraph L7["Layer 7 — products"]
        connect["apps/connect"]
        switchboard["apps/switchboard"]
        phcli["ph-cli"]
    end

    L0 --> L1 --> L2 --> L3 --> L4 --> L5 --> L6 --> L7
```

**Two edges worth memorising, because they surprise people:**

1. `reactor-group` → `reactor-browser`. `reactor-group` is a *document model
   package* (it ships the `ReactorGroup` model referenced by `{ group }` principals
   in the auth scope) but it also ships editor UI, so it depends on the browser
   hooks. Consequence: `reactor-api` → `reactor-group` → `reactor-browser`, i.e. the
   **server-side GraphQL package transitively pulls in the React client package.**
2. `ph-cli` → `apps/switchboard`. The CLI embeds the Switchboard server so that
   `ph switchboard` and `ph reactor` can boot a local backend. The CLI therefore sits
   *above* the app in build order, not beside it.

---

## 4. Build order

`pnpm build` in the root `package.json` hard-codes a `--filter` list in dependency
order. Condensed:

```mermaid
graph LR
    A["config, @renown/sdk, common"] --> B["builder-tools, codegen"]
    B --> C["document-model, design-system,<br/>powerhouse-vetra-packages, pglite-fs"]
    C --> D["reactor-api, reactor-attachments, reactor-browser,<br/>reactor, reactor-drive, reactor-group,<br/>reactor-hypercore, reactor-mcp, otel-instrumentation"]
    D --> E["registry, shared, switchboard-gui, vetra"]
    E --> F["analytics-engine: browser, core,<br/>graphql, knex, pg"]
    F --> G["apps/connect, apps/switchboard"]
    G --> H["ph-cli, ph-cmd"]
    H --> I["load-test-client, load-test-connect, e2e-utils"]
```

Notes:

- Most packages build with **tsdown**. `shared`, `document-model` and
  `powerhouse-vetra-packages` use hand-written `tsx` build scripts; `switchboard-gui`
  and `test/test-fusion` use Vite/Next directly; `apps/academy` uses Docusaurus.
- `ph-cli`, `ph-cmd` and `registry` have `postbuild` steps that **shell out to `bun`**,
  so `pnpm build` cannot complete without bun installed.
- TypeScript project references are kept in sync by `update-ts-references`
  (`pnpm check-ts-references` in CI, and on `postinstall`).
- Package `exports` maps carry a `source` condition pointing at the `.ts` entry.
  `tsconfig.options.json` sets `customConditions: ["source"]`, and the Vitest/Vite
  configs mirror it — which is why tests can run against workspace source without a
  prior `dist/` build.

---

## 5. Applications and what they wire together

```mermaid
graph TD
    subgraph Browser
        connect["Connect<br/>Electron + web SPA"]
        sbgui["switchboard-gui<br/>explorer SPA"]
    end
    subgraph Server
        switchboard["Switchboard<br/>Node GraphQL server"]
        lb["switchboard-lb<br/>OpenResty/Lua LB, no package.json"]
        registry["ph-registry<br/>Verdaccio + CDN"]
    end
    subgraph Local
        phcmd["ph (ph-cmd)"] --> phcli["ph-cli"]
    end

    connect -- "GraphQL / SSE / WS" --> switchboard
    connect -- "dynamic import() of<br/>package bundles" --> registry
    sbgui --> switchboard
    lb -- "sticky routing by drive" --> switchboard
    phcli -- "boots in-process" --> switchboard
    phcli -- "publishes / installs" --> registry
    switchboard -- "loads Vetra packages" --> registry
```

- **Connect** is the editor and contributor app. It runs a reactor *in the browser*
  (PGlite-backed, optionally in a Web Worker: `apps/connect/src/reactor.worker.ts`)
  and syncs to a Switchboard.
- **Switchboard** is the server. It composes `reactor` and `reactor-api` into an
  Apollo Federation supergraph, with PostgreSQL or PGlite storage, plus OpenTelemetry,
  Sentry and Pyroscope wiring.
- **switchboard-lb** has no `package.json`; it is an OpenResty/Lua load balancer
  (`apps/switchboard-lb/lua`, `conf`, `observability`) fronting a Switchboard fleet.
- **ph-cmd** is the globally installed binary (`ph`); it resolves the project's local
  `ph-cli` and forwards to it.

---

## 6. Analytics engine sub-graph

```mermaid
graph TD
    core["analytics-engine-core<br/>query engine, AnalyticsPath,<br/>time slicing, subscriptions"]
    knex["analytics-engine-knex<br/>KnexAnalyticsStore"]
    pg["analytics-engine-pg<br/>PostgresAnalyticsStore"]
    browser["analytics-engine-browser<br/>PGlite store"]
    gql["analytics-engine-graphql<br/>schema + resolvers"]
    bench["benchmarks (private)"]
    compat["compat (private)"]

    core --> shared["@powerhousedao/shared"]
    knex --> core
    pg --> core
    pg --> knex
    browser --> core
    gql --> core
    bench --> core
    bench --> knex
    bench --> pg
    bench --> browser
    compat --> core
    compat --> knex
    compat --> pg
    compat --> browser

    rapi["reactor-api"] --> core
    rapi --> gql
    rapi --> pg
    rbrowser["reactor-browser"] --> core
    rbrowser --> browser
    commonpkg["common"] --> core
```

This sub-tree was vendored in from a separate repository
(`powerhouse-inc/analytics-engine`) and keeps its own README and conventions.

---

## 7. Test and harness projects

None of these ship as product code; they exercise it.

```mermaid
graph TD
    subgraph harness["test/*"]
        codegenT["test/codegen<br/>bun test: generates projects, typechecks"]
        pkgE2E["test/package-e2e<br/>playwright + docker registry"]
        vetraE2E["test/vetra-e2e<br/>playwright, full Vetra studio"]
        recipes["test/recipes-e2e<br/>academy recipe scripts"]
        sbT["test/switchboard<br/>vitest against a live switchboard"]
        fusion["test/test-fusion<br/>Next.js host, playwright"]
        loadC["test/test-client<br/>GraphQL load generator"]
        loadCo["test/test-connect<br/>Connect-sync load generator"]
        lb["test/lb-loadtest<br/>LB pinning and consistency"]
        syncq["test/test-sync-queue<br/>sync and queue stall probe"]
        consumer["test/test-consumer-project<br/>typecheck:consumers target"]
        vdocs["test/versioned-documents<br/>fixture package: Todo v1/v2"]
        e2eutils["test/e2e-utils<br/>shared playwright helpers"]
    end

    vdocs --> fusion
    vdocs --> vetraE2E
    e2eutils --> pkgE2E
    e2eutils --> vetraE2E
    loadC --> loadCo
    loadC --> lb
```

Root scripts that drive them: `pnpm test:ci`, `test:codegen`, `test:e2e:vetra`,
`test:e2e:package`, `test:e2e:recipes`, `test:e2e:switchboard`, `test:reactor`,
`test:integration`, `test:browser`, `test:pg`, `test:integration:analytics`.

---

## 8. Reverse index — "if I change X, what breaks?"

| Change here | Rebuild and retest these |
|---|---|
| `shared` | **everything** — it is the one package allowed no intra-repo dependencies, and nearly everything depends on it |
| `document-model` | reactor, reactor-drive, reactor-browser, reactor-api, reactor-mcp, reactor-group, codegen, builder-tools, vetra, both apps, ph-cli, most of `test/*` |
| `reactor` | reactor-drive, reactor-attachments, reactor-browser, reactor-mcp, reactor-api, connect, switchboard, ph-cli, otel-instrumentation |
| `reactor-browser` | design-system, common, reactor-group (therefore reactor-api), vetra, connect, powerhouse-vetra-packages |
| `reactor-api` | switchboard, therefore ph-cli; `test/switchboard`, `test/test-sync-queue` |
| `design-system` | switchboard-gui, vetra, connect, powerhouse-vetra-packages |
| `config` | builder-tools, reactor-api, vetra, connect, switchboard, ph-cli |
| `@renown/sdk` | registry, reactor-browser, reactor-api, connect, switchboard, ph-cli |
| `analytics-engine-core` | knex, pg, browser, graphql, reactor-api, reactor-browser, common |
| `codegen` | vetra, ph-cli, ph-cmd (dev) |
| `vetra` | connect, switchboard, ph-cli |
| `apps/switchboard` | ph-cli, which embeds it |

---

## 9. Per-package documents

| Area | Files |
|---|---|
| Foundation | [shared](packages/shared.md) · [document-model](packages/document-model.md) · [config](packages/config.md) · [pglite-fs](packages/pglite-fs.md) |
| Engine | [reactor](packages/reactor.md) · [reactor-drive](packages/reactor-drive.md) · [reactor-attachments](packages/reactor-attachments.md) · [reactor-hypercore](packages/reactor-hypercore.md) · [reactor-group](packages/reactor-group.md) · [reactor-mcp](packages/reactor-mcp.md) · [otel-instrumentation](packages/opentelemetry-instrumentation-reactor.md) |
| Surfaces | [reactor-api](packages/reactor-api.md) · [reactor-browser](packages/reactor-browser.md) · [design-system](packages/design-system.md) · [common](packages/common.md) · [switchboard-gui](packages/switchboard-gui.md) |
| Builder | [vetra](packages/vetra.md) · [powerhouse-vetra-packages](packages/powerhouse-vetra-packages.md) · [codegen](packages/codegen.md) · [builder-tools](packages/builder-tools.md) |
| Platform | [registry](packages/registry.md) · [renown](packages/renown.md) |
| Analytics | [overview](packages/analytics-engine.md) · [core](packages/analytics-engine-core.md) · [knex](packages/analytics-engine-knex.md) · [pg](packages/analytics-engine-pg.md) · [browser](packages/analytics-engine-browser.md) · [graphql](packages/analytics-engine-graphql.md) |
| Apps | [connect](apps/connect.md) · [switchboard](apps/switchboard.md) · [switchboard-lb](apps/switchboard-lb.md) · [academy](apps/academy.md) |
| CLIs | [ph-cli](clis/ph-cli.md) · [ph-cmd](clis/ph-cmd.md) |
| Test harness | [index](test-harness/README.md) — 13 workspace projects plus [ph-lora](test-harness/ph-lora.md) |
| Tooling | [index](tooling/README.md) |

Start at [00-README.md](00-README.md) for the full table of contents, and
[02-conventions.md](02-conventions.md) for the build/test conventions these pages
assume.
