# Plan: workflow plugins — the drive, the editor and the link between them

Status: implemented on `feat/workflow-plugins` (2026-10-19). Follows
[uniform-runners](./2026-10-13-uniform-runners.md) (hosts, runners, plugins —
"presence is activation") and the R2 note that `reactor.workflows` dies when
workflows become a listed plugin.

## The problem

Enabling workflows for a hosts project took three unrelated switches, and
nothing in `hosts/` showed how they relate:

1. The switchboard's workflows plugin was listed in `hosts/switchboard/host.js`
   — but the **Workflows drive** it serves was a side effect of the ph-cli
   runner (`seedWorkflowsDrive`), not a declaration. `--explain drives` did not
   list it; the connect host had no way to know it existed, so a project
   declared a second, local "workflows" drive (Sektar did).
2. **Workflow Studio** (the drive's `preferredEditor`, `workflow-studio`) only
   exists in Connect when `connect.app.workflowsEnabled` is on — a config flag
   with three spellings (`workflows.enabled`, `connect.app.workflowsEnabled`,
   host `reactor.workflows`). Off, Connect silently rendered the generic drive
   explorer for a drive that names an editor it does not have.
3. Workflow Studio derives its **runtime URL** from the selected drive's
   switchboard (`resolveDriveSwitchboard`), so the drive must be attached in
   Connect as a REMOTE of the switchboard that runs the workflow runtime. A
   local copy renders the studio but points it at `localhost:4001`. Nothing
   near a drive declaration said so.

## The model

One link, declared where each half lives, so the config shows it:

```js
// hosts/switchboard/host.js — the server half: it serves the drive
plugins: [
  { module: "@powerhousedao/switchboard/plugins/workflows",
    config: { drive: { slug: "workflows", name: "Workflows" } } },
]

// hosts/connect/host.js (or a compound member) — the browser half
plugins: [
  { module: "@powerhousedao/connect/plugins/workflows",
    config: { drive: "http://localhost:4001/d/workflows" } },
]

// inside a compound: derive the link from the sibling instead of a URL
{ module: "@powerhousedao/connect/plugins/workflows",
  config: { drive: { from: "vetra-switchboard", slug: "workflows" } } }
```

- **Switchboard plugin = a factory with config.** `drive` names the drive it
  seeds (defaults: slug `workflows`, name `Workflows`, `projectHash: true` so
  today's ids are kept, `preferredEditor: "workflow-studio"`); `drive: false`
  serves the runtime without seeding a drive. The drive is a **contribution**
  (`contributions.drives`), merged into the host's plan by the switchboard
  runner (host declarations win on a slug clash) and printed by
  `ph run <host> --explain drives` with the plugin as provenance. The runner's
  implicit `seedWorkflowsDrive` is gone from the composed path; the classic
  `ph vetra` path and the deprecated `reactor.workflows` boolean keep it.
- **Connect plugin = presence is activation.** `@powerhousedao/connect/plugins/
workflows` is a built-in browser plugin: present, it sets
  `app.workflowsEnabled` (the workflow package loads, Workflow Studio exists)
  and attaches `drive` as a remote default drive; absent from a declared
  composition, `app.workflowsEnabled` is zeroed like the other owned slices.
  The editor binding stays on the drive document (`header.meta.
preferredEditor`), so Connect never needs the editor id.
- **Compound derivation.** A plugin entry config value of the shape
  `{ from: "<member>", slug: "<drive>" }` is a drive reference. The generic
  compound runner substitutes it with the URL that member's runner handle
  reported (`driveUrls`), before the member host is validated and started.
  Unknown member, member started later than the referrer, or a slug the
  member does not serve all fail boot naming the choices. Outside a compound
  (`ph run connect`) a reference is a boot error: references resolve only
  where the sibling exists.
- **Two guards.** Connect warns (once per drive) when a drive names a
  preferred editor no installed package provides and the generic explorer
  renders instead. Workflow Studio warns (once per drive) when the selected
  drive has no switchboard behind it and the runtime URL falls back to the
  default.

## Changes

| area                                                      | change                                                                                                                                                                                         |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/switchboard/src/plugins/workflows.mts`              | `createWorkflowsPlugin(config)` factory + `workflowsPluginConfigSchema`; `contributions.drives` from `config.drive`; `workflowsPlugin` stays the default-config instance for the built-in list |
| `clis/ph-cli/src/runners/switchboard.ts`                  | merge plugin-contributed drives (`mergeDrivePlan`) into seeding, `remoteDrives` and the handle's `driveUrls`; `seedWorkflowsDrive` only on the un-composed (classic/`reactor.workflows`) path  |
| `clis/ph-cli/src/services/run/explain.ts`                 | `--explain drives` resolves the composition's contributions (lenient: browser-only specifiers are listed, not resolved)                                                                        |
| `packages/host-core/src/plugins.ts`                       | `driveReferenceSchema` / `isDriveReference` (`{ from, slug }`) — browser-safe                                                                                                                  |
| `packages/host-core/src/plugins-resolve.ts`               | `resolvePluginContributions` (lenient resolution for explain)                                                                                                                                  |
| `packages/host-core/src/compound.ts`                      | `resolveDriveReferences`: substitutes references in member plugin configs from started members' `driveUrls`                                                                                    |
| `clis/ph-cli/src/runners/connect.ts`                      | rejects an unresolved drive reference in the composition with a hint                                                                                                                           |
| `apps/connect/src/plugins/workflows.ts`, `plugin-host.ts` | the built-in Connect plugin; registry entry; zeroing when absent                                                                                                                               |
| `apps/connect/src/components/app-container.tsx`           | unknown-preferred-editor warning                                                                                                                                                               |
| `packages/workflow/ai/runtime-url.ts`                     | no-switchboard warning                                                                                                                                                                         |
| `packages/codegen/src/templates/boilerplate/hosts.ts`     | the scaffold's vetra/desktop/cli connect members carry the Connect plugin with a `from` reference                                                                                              |
| academy `00-HostsRunnersAndPlugins.md`                    | the two plugins and the reference, documented                                                                                                                                                  |

## Not in this change

- `reactor.drives[*].remote: { from, slug }` — the same reference for drive
  declarations (the desktop/cli scaffolds still hoist the server's drive list
  by hand). Same substitution point; a strict-schema change on
  `driveDeclarationSchema`.
- A server-resolvable identity module for `@powerhousedao/connect/plugins/
workflows` (like `@powerhousedao/vetra-studio/connect`), which would let
  `--explain drives` show the Connect-side attachment and `ph run` validate
  the config before the browser does.
- Retiring `reactor.workflows` and `workflows.enabled`: still parsed and
  projected, now redundant where the plugins are listed.
