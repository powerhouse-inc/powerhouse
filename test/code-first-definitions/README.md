# Code-first definition evidence

This workspace owns the deterministic gate fixtures and reports for code-first document models and
subgraphs. A gate remains blocked until its implementation, fixture manifest, assertions, and
declared artifacts all pass at one locked repository revision.

Run one gate with the workspace CLI:

```sh
pnpm --filter @powerhousedao/code-first-definitions evidence \
  --gate B9 \
  --manifest fixtures/reproductions/v1/failure-propagation/manifest.json \
  --out .evidence/B9 \
  --json
```

The runner never infers cases by scanning a directory. It reads only the selected manifest.
