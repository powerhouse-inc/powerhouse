# @powerhousedao/workflow

The half of Powerhouse workflows that a browser loads: two document models,
the editors that author them, the Connect assistant's workflow tools, and the
reactor piece that lets a workflow read and write documents.

## What is in here

- **Document models.** `powerhouse/workflow` (steps, edges, trigger, variables,
  policy, runtime) and `powerhouse/connection` (a credential a workflow step
  authenticates with). Both under `document-models/`, with their upgrade
  manifests.
- **Editors.** The Workflow Editor (a React Flow canvas over the workflow
  document), the Connection Editor, and **Workflow Studio**, a drive-level app
  that lists workflows, connections and runs.
- **AI tools.** `aiTools` — read-only descriptors the Connect assistant
  discovers: the piece catalog, connection documents and connection health,
  plus the workflow-authoring tools.
- **The reactor piece.** `pieces/reactor` — six actions (create, dispatch, get,
  find, schema, types) and three triggers (document event, created, deleted)
  over the reactor a workflow runs in.

## The three packages

| Package                                                  | What it is                                                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [`@powerhousedao/pieces-framework`](../pieces-framework) | The piece authoring API (Activepieces', vendored).                                                             |
| `@powerhousedao/workflow` (this one)                     | Models, editors, assistant tools and the reactor piece. Loaded by Connect; its models are loaded by a reactor. |
| `@powerhousedao/reactor-workflow`                        | The engine that runs a workflow: scheduler, executor, piece host, and the GraphQL surface. Arrives next.       |

This package deliberately depends on neither the engine nor
`@powerhousedao/reactor-api`, so Connect can load it without pulling a server
in, and a reactor can load its models without a cycle.

## Enabling workflows on a reactor

Turn them on in `powerhouse.config.json`:

```json
{ "workflows": { "enabled": true } }
```

or with `PH_WORKFLOWS_ENABLED=true`, which wins over the config file. With the
flag on, the reactor registers this package's two document models, so
workflows and connections can be created and synced. Running them is the
engine's job and follows in `@powerhousedao/reactor-workflow`.

What that engine reads from the environment is declared under `config` in
[`powerhouse.manifest.json`](./powerhouse.manifest.json) — every entry prefixed
`PH_WORKFLOWS_`, each with its type, default and what it sets. The table in
[`@powerhousedao/reactor-workflow`'s README](../reactor-workflow/README.md#configuration)
explains them, including which ones a deployment should not leave unset.

## Developing

```sh
pnpm --filter @powerhousedao/workflow test        # vitest
pnpm --filter @powerhousedao/workflow lint        # eslint, root config
pnpm --filter @powerhousedao/workflow tsc         # types
pnpm --filter @powerhousedao/workflow build       # browser + node + types + css + pieces
```

`build` runs tsdown twice (browser to `dist/browser`, node to `dist/node`),
emits declarations with `tsc --build`, compiles `style.css` with Tailwind, and
then asserts every declared piece actually came out of the build. Connect
loads an external package through `dist/browser/index.js`, `dist/style.css`
and `package.json`, which is why the root entry must stay browser-safe.

### UI screenshots

`ui:shots` renders the editors in Connect against a live switchboard and saves
one PNG per scene to `.ui-shots/` (gitignored):

```sh
pnpm --filter @powerhousedao/workflow ui:serve    # servers plus a browser window on a seeded demo drive
pnpm --filter @powerhousedao/workflow ui:shots    # every scene
pnpm --filter @powerhousedao/workflow ui:shots workflow-editor-step --theme dark
pnpm --filter @powerhousedao/workflow ui:shots --list
```

It starts whichever of switchboard (`:4001`, in-memory, workflows on) and
Connect's Vite dev server (`:3100`) is not already running, and stops the ones
it started. Each run creates a new remote drive, seeds workflows and a
connection through Connect's reactor, and fires two manual workflows (one
succeeds, one fails) so the runs views have data. Flags: `--width`,
`--height`, `--out`; `UI_SHOTS_VERBOSE=1` prints the server logs.

Connect dev serves the editors from source, so every run picks up the latest
edits. `style.css` is recompiled into `dist/style.css` before each run so new
Tailwind classes show up too. The switchboard runs from `apps/switchboard/dist`,
so a change to the runtime side needs a rebuild of that package first. Scenes
live in `SCENES` in `scripts/ui-shots.ts`.

### UI tests

`test:ui` runs the Playwright specs in `test/ui/` against the same stack, one
fresh seeded drive per test:

```sh
pnpm --filter @powerhousedao/workflow test:ui
```

Both commands share `scripts/ui-stack.ts`, which starts the servers and seeds
the documents.

## Shipping a piece from a package

This package is the worked example an external reactor package copies. A piece
lives in `pieces/<name>/index.ts`, is listed in `pieces/index.ts` as a
`PackagePiece` pointing at its built module:

```ts
import type { PackagePiece } from "@powerhousedao/pieces-framework";

export const pieces: PackagePiece[] = [
  {
    name: "@powerhousedao/piece-reactor",
    version: "1.0.0",
    entry: "dist/node/pieces/reactor/index.mjs",
  },
];
```

and is named again in `powerhouse.manifest.json` under `"pieces"`, which is
what a host reads without executing package code:

```json
"pieces": [{ "id": "@powerhousedao/piece-reactor", "name": "Powerhouse Reactor" }]
```

The node build inlines the framework into the piece bundle, so the host loads
one self-contained module. See the
[pieces-framework README](../pieces-framework/README.md) for the authoring API.

## License

AGPL-3.0-only, under the repository's root LICENSE.
