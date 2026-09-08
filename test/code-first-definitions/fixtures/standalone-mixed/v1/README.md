# Mixed code-first and legacy package

This repo was created by the Powerhouse code-first definition reproducer. It
mixes a generated legacy todo model, an authored code-first V1/V2 family, a
generated subgraph, a `defineSubgraph` subgraph, and an editor for the
code-first family.

The reproducer creates the organized code-first skeleton through the public
CLI before applying these fixture implementations:

```sh
ph generate document-model --code-first --name "Code First Todo" \
  --id test/code-first-todo --extension code-first-todo
ph generate document-model --code-first --name "Code First Todo" \
  --id test/code-first-todo --extension code-first-todo --version 2
ph generate subgraph --code-first --name code-first-status
```

Each model version has a `model.ts`, `reducers.ts`, and
`tests/model.test.ts`. The root `index.ts` assembles the family and exports its
derived upgrade manifest, while `upgrades/` contains transitions and their
tests. The code-first subgraph keeps its runtime code in `index.ts`, with an
adjacent `index.test.ts`. Re-running either generator preserves authored files.

Run the deterministic checks with:

```sh
pnpm tsc
pnpm test
pnpm exec ph-cli model check --json
pnpm build
pnpm exec ph-cli model check --release --retained --json
```

For Switchboard, start `pnpm exec ph-cli switchboard --port 4101`, then run
`pnpm smoke:switchboard` in another terminal.

For Connect, start `pnpm exec ph-cli connect --port 3100`. Create one local
drive and run this in the browser console:

```js
await import("/scripts/connect-worker-smoke.browser.mjs").then((module) =>
  module.runConnectWorkerSmoke(),
);
```

The browser script requires `reactorKind: "worker"`, mutates both model kinds,
and verifies an actual code-first V1 to V2 upgrade.

## Test the code-first editor

Start Vetra and open the Connect URL printed by the command:

```sh
pnpm vetra
```

Create a local drive, create a `Code First Todo` document, and open it. The
registered editor lets you rename the list, add todos, and toggle their
completion state. Reload the document to confirm that the worker reactor
persisted each operation.
