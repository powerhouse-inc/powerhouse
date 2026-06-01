## 6.1.0-dev.12 (2026-06-01)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.11 (2026-05-31)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.10 (2026-05-30)

### 🩹 Fixes

- fix issue from refactor ([d6c728c95](https://github.com/powerhouse-inc/powerhouse/commit/d6c728c95))
- **ci:** bump playwright to 1.60.0 to fix install hang on node 24.16+ ([#2669](https://github.com/powerhouse-inc/powerhouse/pull/2669))
- added a failing test for the set_name issue, which exposed the document-drive tests weren't running at all ([8221e66b9](https://github.com/powerhouse-inc/powerhouse/commit/8221e66b9))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente Sandoval @gpuente

## 6.1.0-dev.9 (2026-05-29)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.8 (2026-05-28)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.7 (2026-05-28)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.6 (2026-05-28)

### 🚀 Features

- mount OpenPanel with consent gating and user identification ([aa7c77b07](https://github.com/powerhouse-inc/powerhouse/commit/aa7c77b07))
- feat(openpanel): add event mappings, validation, and naming helpers ([556688064](https://github.com/powerhouse-inc/powerhouse/commit/556688064))
- **connect:** add OpenPanel Analytics configuration ([b39d072b2](https://github.com/powerhouse-inc/powerhouse/commit/b39d072b2))

### 🩹 Fixes

- **connect:** resolve @powerhousedao/connect/* aliases in vitest ([f7de787c6](https://github.com/powerhouse-inc/powerhouse/commit/f7de787c6))
- pnpm-lock file ([d5019827c](https://github.com/powerhouse-inc/powerhouse/commit/d5019827c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 4.7

## 6.1.0-dev.5 (2026-05-27)

### 🚀 Features

- **reactor:** benchmark for workers ([8ff51da2f](https://github.com/powerhouse-inc/powerhouse/commit/8ff51da2f))
- **reactor:** multi-worker integration test -- eep ([b8b9566cf](https://github.com/powerhouse-inc/powerhouse/commit/b8b9566cf))
- **reactor:** added workerhandle, parent-side ipc wrapper ([b1955e3a6](https://github.com/powerhouse-inc/powerhouse/commit/b1955e3a6))
- **reactor:** worker protocol ([c1bb0bd30](https://github.com/powerhouse-inc/powerhouse/commit/c1bb0bd30))

### 🩹 Fixes

- ci needs to run integration tests serially, not in parallel ([d97b73622](https://github.com/powerhouse-inc/powerhouse/commit/d97b73622))
- do not double run hub-spoke and make sure postgres is running in integration tests ([6a26a7377](https://github.com/powerhouse-inc/powerhouse/commit/6a26a7377))
- swap never bundle for reactor-api so that subgraphs are properly detected ([7ee0fdb5b](https://github.com/powerhouse-inc/powerhouse/commit/7ee0fdb5b))
- **reactor:** fix linting issues ([7e0a4af8d](https://github.com/powerhouse-inc/powerhouse/commit/7e0a4af8d))
- add hub-spoke test in test:integration ([5ab8c0b36](https://github.com/powerhouse-inc/powerhouse/commit/5ab8c0b36))
- **reactor:** a number of linter and import errors needed fixed due to node imports ([060babc30](https://github.com/powerhouse-inc/powerhouse/commit/060babc30))
- **reactor:** grr path resolution fixes, tailwind fixes, linter fixes ([0eb6ad89f](https://github.com/powerhouse-inc/powerhouse/commit/0eb6ad89f))

### ❤️ Thank You

- Benjamin Jordan

## 6.1.0-dev.4 (2026-05-26)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.3 (2026-05-25)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.2 (2026-05-24)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.1 (2026-05-23)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.1.0-dev.0 (2026-05-22)

### 🩹 Fixes

- **shared,ph-cli:** made rolldown an optional peer dependency ([13db8e511](https://github.com/powerhouse-inc/powerhouse/commit/13db8e511))
- **reactor-api:** moved fastify and mercurius to be optional peer dependencies ([f02aeec8c](https://github.com/powerhouse-inc/powerhouse/commit/f02aeec8c))
- **ph-cli,ph-cmd,shared:** make sentry/core an optional peer dependency of shared ([fc8446e18](https://github.com/powerhouse-inc/powerhouse/commit/fc8446e18))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.258 (2026-05-22)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.0.0-dev.257 (2026-05-21)

### 🚀 Features

- **vetra:** moved schema projection to ph-rupert-cli ([49f627e7b](https://github.com/powerhouse-inc/powerhouse/commit/49f627e7b))
- **vetra,ph-cli:** add @powerhousedao/vetra/codegen subexport for agent-driven codegen ([9689be87e](https://github.com/powerhouse-inc/powerhouse/commit/9689be87e))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.256 (2026-05-21)

### 🩹 Fixes

- add @tokens to logger calls across packages ([b70070ae2](https://github.com/powerhouse-inc/powerhouse/commit/b70070ae2))
- **reactor-api:** pass args to logger.error calls in reactor subgraph ([b34dcf7dc](https://github.com/powerhouse-inc/powerhouse/commit/b34dcf7dc))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.255 (2026-05-20)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.0.0-dev.254 (2026-05-19)

### 🚀 Features

- **reactor-api:** main integration tests now run on both reactor-drive and document-drive, includes reshuffle fix ([4f370a63f](https://github.com/powerhouse-inc/powerhouse/commit/4f370a63f))
- add dark mode script ([#2619](https://github.com/powerhouse-inc/powerhouse/pull/2619))
- single-document contention integration tests are switchable between document-drive and reactor-drive ([68b59b492](https://github.com/powerhouse-inc/powerhouse/commit/68b59b492))
- **reactor-drive:** initial commit ([d6b7c4f8c](https://github.com/powerhouse-inc/powerhouse/commit/d6b7c4f8c))

### 🩹 Fixes

- wiring up reactor-drive dependency ([8c22b1658](https://github.com/powerhouse-inc/powerhouse/commit/8c22b1658))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.253 (2026-05-18)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.0.0-dev.252 (2026-05-17)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.0.0-dev.251 (2026-05-16)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.0.0-dev.250 (2026-05-15)

This was a version bump only for @powerhousedao/pglite-fs to align it with other projects, there were no code changes.

## 6.0.0-dev.249 (2026-05-15)

### 🚀 Features

- added release script ([20454f119](https://github.com/powerhouse-inc/powerhouse/commit/20454f119))
- add tailwind eslint plugin ([#2612](https://github.com/powerhouse-inc/powerhouse/pull/2612))

### 🩹 Fixes

- sync integration test should not use atomicfs ([75d0a1785](https://github.com/powerhouse-inc/powerhouse/commit/75d0a1785))
- **codegen:** install dependencies during migrate before regeneration ([ff107e29f](https://github.com/powerhouse-inc/powerhouse/commit/ff107e29f))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.248 (2026-05-14)

### 🚀 Features

- **shared:** replace jszip with fflate for tree-shakeable zip handling ([9a417aa98](https://github.com/powerhouse-inc/powerhouse/commit/9a417aa98))

### 🩹 Fixes

- declare graphql/graphql-tag as peerDependencies to prevent dup instances ([4fec9d5b6](https://github.com/powerhouse-inc/powerhouse/commit/4fec9d5b6))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.247 (2026-05-14)

### 🚀 Features

- **pglite-fs:** adding crash tests, also adding permutations of reactor tests with new backend ([4747ba737](https://github.com/powerhouse-inc/powerhouse/commit/4747ba737))
- **pglite-fs:** implemented a fs-backed pglite backend with in-memory WAL ([736ae675b](https://github.com/powerhouse-inc/powerhouse/commit/736ae675b))
- **ph-lora:** release-notes skill + v6.0.0 release notes ([22aa1e682](https://github.com/powerhouse-inc/powerhouse/commit/22aa1e682))
- **ph-lora:** doc-status and doc-clarity command ([1087fadb9](https://github.com/powerhouse-inc/powerhouse/commit/1087fadb9))
- **ph-lora:** doc-fix command ([87c6ab98d](https://github.com/powerhouse-inc/powerhouse/commit/87c6ab98d))
- **ph-lora:** tier 2 CI, mapping validator, file-level sourceFiles, authorization gap report ([76ce10b41](https://github.com/powerhouse-inc/powerhouse/commit/76ce10b41))
- **ph-lora:** tier 1 doc checker, mapping, gap report for react hooks ([47c6fc620](https://github.com/powerhouse-inc/powerhouse/commit/47c6fc620))

### ❤️ Thank You

- Benjamin Jordan
- CallmeT-ty @CallmeT-ty
- Claude Sonnet 4.6