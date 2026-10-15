# Powerhouse monorepo — documentation set

For current source ownership and testing prerequisites, start with the maintained
[source map](../docs/development/source-map.md) and
[contributor guide](../CONTRIBUTING.md#testing). These pages describe the snapshot
identified under Provenance and are not the current execution contract.

A temporary, generated guide to this repository: what every package is for, what it
does, how it is tested, and how it connects to everything else.

**Start here:** [01-dependency-map.md](01-dependency-map.md) — the dependency graph
and the shape of the repo, with Mermaid diagrams.
Then: [02-conventions.md](02-conventions.md) — the build, test and tooling
conventions that are shared across packages, so the per-package pages do not repeat
them.

---

## Contents

### Cross-cutting

| File | What it covers |
|---|---|
| [01-dependency-map.md](01-dependency-map.md) | All 51 workspace projects, the full `workspace:*` graph, layer view, build order, app topology, analytics sub-graph, test tree, and a "if I change X, what breaks" index |
| [02-conventions.md](02-conventions.md) | Build tooling, the `source` export condition, Vitest patterns, timeouts, CI workflows, release flow |

### Packages — foundation

| Package | Page |
|---|---|
| `@powerhousedao/shared` | [shared](packages/shared.md) |
| `document-model` | [document-model](packages/document-model.md) |
| `@powerhousedao/config` | [config](packages/config.md) |
| `@powerhousedao/pglite-fs` | [pglite-fs](packages/pglite-fs.md) |

### Packages — engine

| Package | Page |
|---|---|
| `@powerhousedao/reactor` | [reactor](packages/reactor.md) |
| `@powerhousedao/reactor-drive` | [reactor-drive](packages/reactor-drive.md) |
| `@powerhousedao/reactor-attachments` | [reactor-attachments](packages/reactor-attachments.md) |
| `@powerhousedao/reactor-hypercore` | [reactor-hypercore](packages/reactor-hypercore.md) |
| `@powerhousedao/reactor-group` | [reactor-group](packages/reactor-group.md) |
| `@powerhousedao/reactor-mcp` | [reactor-mcp](packages/reactor-mcp.md) |
| `@powerhousedao/opentelemetry-instrumentation-reactor` | [otel-instrumentation](packages/opentelemetry-instrumentation-reactor.md) |

### Packages — surfaces

| Package | Page |
|---|---|
| `@powerhousedao/reactor-api` | [reactor-api](packages/reactor-api.md) |
| `@powerhousedao/reactor-browser` | [reactor-browser](packages/reactor-browser.md) |
| `@powerhousedao/design-system` | [design-system](packages/design-system.md) |
| `@powerhousedao/common` | [common](packages/common.md) |
| `@powerhousedao/switchboard-gui` | [switchboard-gui](packages/switchboard-gui.md) |

### Packages — builder and platform

| Package | Page |
|---|---|
| `@powerhousedao/vetra` | [vetra](packages/vetra.md) |
| `@powerhousedao/powerhouse-vetra-packages` | [powerhouse-vetra-packages](packages/powerhouse-vetra-packages.md) |
| `@powerhousedao/codegen` | [codegen](packages/codegen.md) |
| `@powerhousedao/builder-tools` | [builder-tools](packages/builder-tools.md) |
| `@powerhousedao/registry` | [registry](packages/registry.md) |
| `@renown/sdk` | [renown](packages/renown.md) |

### Packages — analytics engine

| Package | Page |
|---|---|
| overview (+ `benchmarks`, `compat`) | [analytics-engine](packages/analytics-engine.md) |
| `@powerhousedao/analytics-engine-core` | [core](packages/analytics-engine-core.md) |
| `@powerhousedao/analytics-engine-knex` | [knex](packages/analytics-engine-knex.md) |
| `@powerhousedao/analytics-engine-pg` | [pg](packages/analytics-engine-pg.md) |
| `@powerhousedao/analytics-engine-browser` | [browser](packages/analytics-engine-browser.md) |
| `@powerhousedao/analytics-engine-graphql` | [graphql](packages/analytics-engine-graphql.md) |

### Apps

| App | Page |
|---|---|
| `apps/connect` | [connect](apps/connect.md) |
| `apps/switchboard` | [switchboard](apps/switchboard.md) |
| `apps/switchboard-lb` | [switchboard-lb](apps/switchboard-lb.md) |
| `apps/academy` | [academy](apps/academy.md) |

### CLIs

| CLI | Page |
|---|---|
| `@powerhousedao/ph-cli` | [ph-cli](clis/ph-cli.md) |
| `ph-cmd` (the `ph` binary) | [ph-cmd](clis/ph-cmd.md) |

### Test harness

[Index](test-harness/README.md) · [codegen](test-harness/codegen.md) ·
[package-e2e](test-harness/package-e2e.md) · [vetra-e2e](test-harness/vetra-e2e.md) ·
[recipes-e2e](test-harness/recipes-e2e.md) · [switchboard](test-harness/switchboard.md) ·
[test-fusion](test-harness/test-fusion.md) · [test-client](test-harness/test-client.md) ·
[test-connect](test-harness/test-connect.md) · [lb-loadtest](test-harness/lb-loadtest.md) ·
[test-sync-queue](test-harness/test-sync-queue.md) ·
[versioned-documents](test-harness/versioned-documents.md) ·
[test-consumer-project](test-harness/test-consumer-project.md) ·
[e2e-utils](test-harness/e2e-utils.md) · [ph-lora](test-harness/ph-lora.md)

### Tooling

[Index](tooling/README.md) — `tools/registry-audit`, `tools/stale-bot`,
`tools/scripts`, `scripts/emit-schemas.ts`, `scripts/dark-mode`,
`scripts/profiling`, `scripts/release`

---

## Suggested reading order

**To understand the product:**
[dependency map §1–3](01-dependency-map.md) → [reactor](packages/reactor.md) →
[reactor-api](packages/reactor-api.md) → [reactor-browser](packages/reactor-browser.md)
→ [connect](apps/connect.md) → [switchboard](apps/switchboard.md).

**To understand how users build on it:**
[vetra](packages/vetra.md) → [codegen](packages/codegen.md) →
[ph-cli](clis/ph-cli.md) → [registry](packages/registry.md) →
[versioned-documents](test-harness/versioned-documents.md) as a worked example.

**To make a change safely:**
[conventions](02-conventions.md) → the page for the package you are changing →
[dependency map §8](01-dependency-map.md) for the blast radius →
[test-harness index](test-harness/README.md) for what to run.

---

## Provenance

Everything here was derived from the repository itself as of commit `9cade568e` on
`main`: every `package.json`, every `vitest.config.ts`, the in-tree `README.md` /
`CLAUDE.md` / `ARCHITECTURE.md` files, `docs/adr/`, `docs/specs/`,
`.github/workflows/`, and the source trees. Quoted text is quoted from those files.

This is a **temporary folder** — delete `docs-temp/` when you no longer need it.
Treat its source and tooling claims as historical unless confirmed in the maintained guides.
