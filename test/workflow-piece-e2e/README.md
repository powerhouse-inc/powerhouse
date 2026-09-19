# test-workflow-piece-e2e

End-to-end proof that a piece shipped inside a reactor package is loaded and run
by the workflow runtime — built, published, installed and executed, with nothing
stubbed in between.

## The chain

1. The real `ph init` generates the fixture reactor package against the local
   registry — nothing of the boilerplate is checked in, so nothing of it can
   drift. `fixture-piece/` supplies the one thing a generated project has no
   template for: the piece, one action, no auth, no network, no third-party
   dependency. Its `@powerhousedao/pieces-framework` devDependency is added from
   the registry too, and the real `ph build` bundles the piece whole and writes
   `descriptor.json` and a dependency-free `package.json` beside it under
   `dist/node/pieces/greeter/`.
2. `ph publish` pushes it to the local verdaccio the e2e harness runs.
3. A consumer project outside the workspace installs `@powerhousedao/switchboard`
   and then the fixture package from that registry (`ph install --local`), which
   also writes it into the project's `powerhouse.config.json`.
4. Switchboard starts in that project with `PH_WORKFLOWS_ENABLED=1`. Its piece
   registry reads the config's `packages`, resolves each by node resolution and
   imports `dist/node/pieces/index.mjs` from the installed copy.
5. The suite drives the workflow subgraphs over HTTP: the piece is in
   `pieceCatalog`, `searchBlocks` finds its action, and a workflow whose one step
   names `test-workflow-piece-package#greet` fires and is journalled as
   `SUCCEEDED` with the action's output.

## Why not the workspace

The piece's action stamps its own `import.meta.url` into its output, so the run
record itself says which copy of the code the reactor loaded. The suite asserts
that path is inside the consumer project's `node_modules`, and that the fixture
package exists nowhere in the monorepo's — a catalogue assertion alone would
pass against a workspace link.

## Why no docker

The consumer project is an ordinary directory outside the repo, and everything
in it comes from the local registry, so a container adds isolation the test does
not need. It also keeps the whole run in one process tree, where a failure is a
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
| `PH_WORKFLOW_E2E_WORKDIR`        | `/tmp/ph-workflow-piece-e2e` | Where the generated fixture package and the consumer project are built.          |
| `PH_WORKFLOW_E2E_PORT`           | `4021`                       | Switchboard's port.                                                              |
| `PH_WORKFLOW_E2E_REUSE_REGISTRY` | unset                        | `1` skips starting and seeding the registry, for re-runs against one already up. |
| `PH_TAG`                         | `dev`                        | Dist-tag the workspace packages are published under.                             |
