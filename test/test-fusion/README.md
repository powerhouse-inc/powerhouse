# test-fusion

A Next.js test app inside the Powerhouse monorepo. It is a workspace package
(dependencies resolve from the monorepo root, shared versions via the pnpm
`catalog:`), used for manual testing/experiments.

## Scripts

```bash
pnpm --filter test-fusion dev     # start the dev server
pnpm --filter test-fusion build   # production build
pnpm --filter test-fusion lint    # eslint
```

Run `pnpm install` from the monorepo root to install dependencies.
