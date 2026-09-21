# test-workflow-piece-e2e

End-to-end proof that a piece shipped inside a reactor package is loaded and run
by the workflow runtime — built, published, and then reached in both of the ways
a reactor can reach it, with nothing stubbed in between.

## What is shared

1. The real `ph init` generates the fixture reactor package against the local
   registry — nothing of the boilerplate is checked in, so nothing of it can
   drift. `fixture-piece/` supplies the one thing a generated project has no
   template for: the piece, one action, no auth, no network, no third-party
   dependency. Its `@powerhousedao/pieces-framework` devDependency is added from
   the registry too, and the real `ph build` bundles the piece whole and writes
   `descriptor.json` and a dependency-free `package.json` beside it under
   `dist/node/pieces/greeter/`.
2. `ph publish` pushes it to the local verdaccio the e2e harness runs.

Three reactors then run against that one published package. All three are the
same `@powerhousedao/switchboard` binary, installed from the registry into the
consumer project, started with `PH_WORKFLOWS_ENABLED=1`.

## Chain one: installed (steps 4–6)

3. A consumer project outside the workspace installs `@powerhousedao/switchboard`
   and then the fixture package from that registry (`ph install --local`), which
   also writes it into the project's `powerhouse.config.json`.
4. Switchboard's piece registry reads the config's `packages`, resolves each by
   node resolution and imports `dist/node/pieces/index.mjs` from the installed
   copy.
5. The suite drives the workflow subgraphs over HTTP: the piece is in
   `pieceCatalog`, `searchBlocks` finds its action, and a workflow whose one step
   names `test-workflow-piece-package#greet` fires and is journalled as
   `SUCCEEDED` with the action's output.

Step 7 repeats the same checks against a reactor pointed at the fixture package
itself, which is how a package's author runs their own piece.

## Chain two: downloaded from the registry (step 8)

6. A second project outside the workspace installs _nothing_ — no
   `node_modules`, and no packages in its `powerhouse.config.json`. Switchboard
   Its config names the local registry as `packageRegistryUrl` — the same key
   any project uses for the registry it installs from — and switchboard runs
   there with nothing else set.
7. The registry indexes the piece out of the published package and serves it on
   its own: `GET /pieces` (the catalog, in cloud.activepieces.com's list shape)
   and `GET /-/pieces/bundled/<piece>-<version>.tgz` (the piece directory as a
   tarball, named the way their CDN names one).
8. The runtime merges that listing into `pieceCatalog` and into the block-search
   index ahead of the Activepieces catalog, so the piece and its action are
   offered without anything being installed. The block type is pinned:
   `test-workflow-piece-package@1.0.0#greet`.
9. Running it makes the engine fetch the bundle from the registry, cache it under
   `.ph/ap-bundles/` and load it in the piece worker — the same path an
   Activepieces bundle takes, with a third source ahead of their CDN and npm.

## Why not the workspace

The piece's action stamps its own `import.meta.url` into its output, so the run
record itself says which copy of the code the reactor loaded. Chain one asserts
that path is inside the consumer project's `node_modules`; chain two asserts it
is inside the downloading reactor's bundle cache and inside no `node_modules` at
all. Both assert the fixture package exists nowhere in the monorepo's — a
catalogue assertion alone would pass against a workspace link.

## Why no docker

The projects are ordinary directories outside the repo, and everything in them
comes from the local registry, so a container adds isolation the test does not
need. It also keeps the whole run in one process tree, where a failure is a
stack trace rather than a container log.

## Run

From this directory:

```bash
pnpm test
```

Or from the repo root:

```bash
pnpm test:e2e:workflow-piece
```

Runs in CI as the `Run Workflow Piece E2E Tests` job in
`.github/workflows/e2e-tests.yml`.

### Environment

| Variable                         | Default                      | Meaning                                                                          |
| -------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `PH_WORKFLOW_E2E_WORKDIR`        | `/tmp/ph-workflow-piece-e2e` | Where the generated fixture package and the two projects are built.              |
| `PH_WORKFLOW_E2E_PORT`           | `4021`                       | Switchboard's port; the other two reactors take the next two.                    |
| `PH_WORKFLOW_E2E_REUSE_REGISTRY` | unset                        | `1` skips starting and seeding the registry, for re-runs against one already up. |
| `PH_TAG`                         | `dev`                        | Dist-tag the workspace packages are published under.                             |

The reactor of chain two needs no extra settings: its `packageRegistryUrl` is
the registry, and pieces come from the same place packages would.
