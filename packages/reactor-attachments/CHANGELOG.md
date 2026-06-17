## 6.2.0-dev.21 (2026-06-17)

### 🚀 Features

- use shadcn type theming class names ([#2720](https://github.com/powerhouse-inc/powerhouse/pull/2720))

### 🔥 Performance

- **connect:** serve Connect + heavy deps from a prebuilt vendor in dev (opt-in) ([8c530ad4a](https://github.com/powerhouse-inc/powerhouse/commit/8c530ad4a))

### ❤️ Thank You

- acaldas
- Ryan Wolhuter @ryanwolhuter

## 6.2.0-dev.20 (2026-06-17)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.19 (2026-06-16)

### 🩹 Fixes

- allow UPPER_SNAKE_CASE ([5cd154fb7](https://github.com/powerhouse-inc/powerhouse/commit/5cd154fb7))

### ❤️ Thank You

- Benjamin Jordan

## 6.2.0-dev.18 (2026-06-16)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.17 (2026-06-16)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.16 (2026-06-15)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.15 (2026-06-15)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.14 (2026-06-14)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.13 (2026-06-13)

### 🩹 Fixes

- very simple ttl cache on renown credentials inside the reactor-api, full fix is grpc s2s call and/or shared cache ([dbf3d698c](https://github.com/powerhouse-inc/powerhouse/commit/dbf3d698c))

### ❤️ Thank You

- Benjamin Jordan

## 6.2.0-dev.12 (2026-06-12)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.11 (2026-06-12)

### 🚀 Features

- **connect:** move theme toggle into settings nav ([7622718a7](https://github.com/powerhouse-inc/powerhouse/commit/7622718a7))

### 🩹 Fixes

- build fix because of vite incompatibility ([4dc94747e](https://github.com/powerhouse-inc/powerhouse/commit/4dc94747e))
- kysely types were getting embedded in type defs and not matching later on because typescript is a broken and terrible language ([b5947709f](https://github.com/powerhouse-inc/powerhouse/commit/b5947709f))

### ❤️ Thank You

- Benjamin Jordan
- CallmeT-ty @CallmeT-ty
- Claude Sonnet 4.6

## 6.2.0-dev.10 (2026-06-11)

### 🩹 Fixes

- **connect:** make PH_CONNECT_CONFIG_JSON overrides win over baked runtime-config defaults ([145a3d423](https://github.com/powerhouse-inc/powerhouse/commit/145a3d423))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.2.0-dev.9 (2026-06-11)

### 🩹 Fixes

- **connect:** stop nginx root-file regex from hijacking /assets at default base path ([f72fe2fe5](https://github.com/powerhouse-inc/powerhouse/commit/f72fe2fe5))
- **switchboard:** stop tracing background DB polls + align @sentry versions ([c5b307333](https://github.com/powerhouse-inc/powerhouse/commit/c5b307333))

### ❤️ Thank You

- Frank Pfeift
- Guillermo Puente @gpuente

## 6.2.0-dev.8 (2026-06-11)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.7 (2026-06-11)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.6 (2026-06-10)

### 🚀 Features

- **connect:** runtime-dynamic deploy base for Connect builds ([2f4c6441f](https://github.com/powerhouse-inc/powerhouse/commit/2f4c6441f))

### ❤️ Thank You

- acaldas

## 6.2.0-dev.5 (2026-06-10)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.4 (2026-06-09)

### 🚀 Features

- added a readiness probe to switchboard to fix tests and for best practices ([b8966f5a2](https://github.com/powerhouse-inc/powerhouse/commit/b8966f5a2))
- added a new audit pass that creates documents and then queries them ([cde281f1e](https://github.com/powerhouse-inc/powerhouse/commit/cde281f1e))
- more steps -- typecheck fixes and a new load function that loads it into switchboard ([0cf7649b1](https://github.com/powerhouse-inc/powerhouse/commit/0cf7649b1))
- setting up registry audit tool ([9aa531d0b](https://github.com/powerhouse-inc/powerhouse/commit/9aa531d0b))

### 🩹 Fixes

- needs to hit verdaccio ([f75a67aea](https://github.com/powerhouse-inc/powerhouse/commit/f75a67aea))

### ❤️ Thank You

- Benjamin Jordan

## 6.2.0-dev.3 (2026-06-08)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.2 (2026-06-07)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.1 (2026-06-06)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.2.0-dev.0 (2026-06-05)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.21 (2026-06-05)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.20 (2026-06-05)

### 🩹 Fixes

- **reactor-attachments:** tsdown config bug where shared types were exported twice, breaking instanceof ([5e5d0206f](https://github.com/powerhouse-inc/powerhouse/commit/5e5d0206f))

### ❤️ Thank You

- Benjamin Jordan

## 6.1.0-dev.19 (2026-06-04)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.18 (2026-06-04)

### 🚀 Features

- **reactor-attachment:** added attachment client and refactored types so they do not pollute shared ([415dd9875](https://github.com/powerhouse-inc/powerhouse/commit/415dd9875))
- **reactor-attachments:** hash-first refs — client-supplied hash at reserve, pending status, and submit-before-upload support ([6a45c5de5](https://github.com/powerhouse-inc/powerhouse/commit/6a45c5de5))

### ❤️ Thank You

- Benjamin Jordan

## 6.1.0-dev.17 (2026-06-03)

### 🩹 Fixes

- **connect:** preserve deep link until remote drives load ([e1ac2ef02](https://github.com/powerhouse-inc/powerhouse/commit/e1ac2ef02))

### ❤️ Thank You

- acaldas

## 6.1.0-dev.16 (2026-06-03)

### 🚀 Features

- **connect:** migrate runtime configuration to powerhouse.config.json ([#2624](https://github.com/powerhouse-inc/powerhouse/pull/2624))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 6.1.0-dev.15 (2026-06-02)

### 🚀 Features

- **renown:** add EIP-712 credential signing and signature verification ([069417a20](https://github.com/powerhouse-inc/powerhouse/commit/069417a20))

### ❤️ Thank You

- acaldas

## 6.1.0-dev.14 (2026-06-02)

### 🚀 Features

- add dark mode classes ([#2629](https://github.com/powerhouse-inc/powerhouse/pull/2629))

### ❤️ Thank You

- CallmeT-ty @CallmeT-ty
- Claude Sonnet 4.6
- Ryan Wolhuter @ryanwolhuter

## 6.1.0-dev.13 (2026-06-01)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.12 (2026-06-01)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.11 (2026-05-31)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.10 (2026-05-30)

### 🩹 Fixes

- fix issue from refactor ([d6c728c95](https://github.com/powerhouse-inc/powerhouse/commit/d6c728c95))
- **ci:** bump playwright to 1.60.0 to fix install hang on node 24.16+ ([#2669](https://github.com/powerhouse-inc/powerhouse/pull/2669))
- added a failing test for the set_name issue, which exposed the document-drive tests weren't running at all ([8221e66b9](https://github.com/powerhouse-inc/powerhouse/commit/8221e66b9))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente Sandoval @gpuente

## 6.1.0-dev.9 (2026-05-29)

### 🩹 Fixes

- **reactor-attachments:** unfortunately because browsers suck we have to buffer the upload blob ([13ca172c4](https://github.com/powerhouse-inc/powerhouse/commit/13ca172c4))
- **switchboard:** fix fetch bindings ([0021b39a9](https://github.com/powerhouse-inc/powerhouse/commit/0021b39a9))

### ❤️ Thank You

- Benjamin Jordan

## 6.1.0-dev.8 (2026-05-28)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.7 (2026-05-28)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.6 (2026-05-28)

### 🚀 Features

- mount OpenPanel with consent gating and user identification ([aa7c77b07](https://github.com/powerhouse-inc/powerhouse/commit/aa7c77b07))
- feat(openpanel): add event mappings, validation, and naming helpers ([556688064](https://github.com/powerhouse-inc/powerhouse/commit/556688064))
- **connect:** add OpenPanel Analytics configuration ([b39d072b2](https://github.com/powerhouse-inc/powerhouse/commit/b39d072b2))

### 🩹 Fixes

- **connect:** resolve @powerhousedao/connect/\* aliases in vitest ([f7de787c6](https://github.com/powerhouse-inc/powerhouse/commit/f7de787c6))
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

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.3 (2026-05-25)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.2 (2026-05-24)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.1 (2026-05-23)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.1.0-dev.0 (2026-05-22)

### 🩹 Fixes

- **shared,ph-cli:** made rolldown an optional peer dependency ([13db8e511](https://github.com/powerhouse-inc/powerhouse/commit/13db8e511))
- **reactor-api:** moved fastify and mercurius to be optional peer dependencies ([f02aeec8c](https://github.com/powerhouse-inc/powerhouse/commit/f02aeec8c))
- **ph-cli,ph-cmd,shared:** make sentry/core an optional peer dependency of shared ([fc8446e18](https://github.com/powerhouse-inc/powerhouse/commit/fc8446e18))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.258 (2026-05-22)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.252 (2026-05-17)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.251 (2026-05-16)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.250 (2026-05-15)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.249 (2026-05-15)

### 🚀 Features

- added release script ([20454f119](https://github.com/powerhouse-inc/powerhouse/commit/20454f119))
- add tailwind eslint plugin ([#2612](https://github.com/powerhouse-inc/powerhouse/pull/2612))

### 🩹 Fixes

- **codegen:** install dependencies during migrate before regeneration ([ff107e29f](https://github.com/powerhouse-inc/powerhouse/commit/ff107e29f))

### ❤️ Thank You

- acaldas
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

## 6.0.0-dev.246 (2026-05-13)

### 🚀 Features

- improve document toolbar ([#2602](https://github.com/powerhouse-inc/powerhouse/pull/2602))

### 🩹 Fixes

- mark json files with correct permissions so nginx can serve them ([c2008bb1c](https://github.com/powerhouse-inc/powerhouse/commit/c2008bb1c))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.245 (2026-05-13)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.244 (2026-05-13)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.243 (2026-05-12)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.242 (2026-05-12)

### 🩹 Fixes

- **release:** pass explicit from-ref to releaseChangelog ([5af1ce209](https://github.com/powerhouse-inc/powerhouse/commit/5af1ce209))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.241 (2026-05-12)

### 🚀 Features

- **connect:** surface missing-model failures and move registry URL to ph-packages.json ([bcb8bbdb0](https://github.com/powerhouse-inc/powerhouse/commit/bcb8bbdb0))

### 🩹 Fixes

- **release:** pass explicit from-ref to releaseChangelog ([5af1ce209](https://github.com/powerhouse-inc/powerhouse/commit/5af1ce209))
- **switchboard:** move @pyroscope/nodejs to dependencies ([c71e0b3de](https://github.com/powerhouse-inc/powerhouse/commit/c71e0b3de))
- **sentry:** inject debug-ids before publish + drop dead dirs ([444c677a2](https://github.com/powerhouse-inc/powerhouse/commit/444c677a2))
- switching postgres versions ([353951582](https://github.com/powerhouse-inc/powerhouse/commit/353951582))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.240 (2026-05-11)

### 🩹 Fixes

- **reactor-api:** exclude hub/spoke test by default, added specific job to test it ([8e8474929](https://github.com/powerhouse-inc/powerhouse/commit/8e8474929))
- **release:** pass the just-published tag from release -> publish-ph-binaries ([dd19a9b20](https://github.com/powerhouse-inc/powerhouse/commit/dd19a9b20))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.239 (2026-05-11)

### 🚀 Features

- **ph-cmd:** added scripts to install dev and staging ph-cmd binary ([492555423](https://github.com/powerhouse-inc/powerhouse/commit/492555423))
- **switchboard:** bridge OpenTelemetry spans to Sentry ([c1f2fc28b](https://github.com/powerhouse-inc/powerhouse/commit/c1f2fc28b))
- **ph-cli,ph-cmd,shared:** use lightweight sentry sdk ([248c6b2f6](https://github.com/powerhouse-inc/powerhouse/commit/248c6b2f6))

### 🩹 Fixes

- update dockerfiles for pnpm 11 bin path ([d33db03ce](https://github.com/powerhouse-inc/powerhouse/commit/d33db03ce))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.238 (2026-05-11)

### 🚀 Features

- **switchboard:** bridge OpenTelemetry spans to Sentry ([c1f2fc28b](https://github.com/powerhouse-inc/powerhouse/commit/c1f2fc28b))
- **ph-cli,ph-cmd,shared:** use lightweight sentry sdk ([248c6b2f6](https://github.com/powerhouse-inc/powerhouse/commit/248c6b2f6))

### 🩹 Fixes

- update dockerfiles for pnpm 11 bin path ([d33db03ce](https://github.com/powerhouse-inc/powerhouse/commit/d33db03ce))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.237 (2026-05-10)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.236 (2026-05-09)

### 🚀 Features

- add download button ([#2586](https://github.com/powerhouse-inc/powerhouse/pull/2586))
- new test-sync-queue cli app that detects sync drift for large drives ([771352e08](https://github.com/powerhouse-inc/powerhouse/commit/771352e08))
- new test-sync-queue cli app that detects sync drift for large drives ([ddcd53f1e](https://github.com/powerhouse-inc/powerhouse/commit/ddcd53f1e))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.235 (2026-05-08)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.234 (2026-05-08)

### 🩹 Fixes

- **ci:** pnpm 11 reads PNPM*CONFIG*_ not NPM*CONFIG*_ ([b6c05fb23](https://github.com/powerhouse-inc/powerhouse/commit/b6c05fb23))
- **ci, docker:** pnpm 11 uses pnpm-workspace.yaml for allowBuilds; env var for min-release-age ([37c04c28a](https://github.com/powerhouse-inc/powerhouse/commit/37c04c28a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.233 (2026-05-08)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.232 (2026-05-07)

### 🩹 Fixes

- opt out of pnpm 11 minimum-release-age; fix docker/boilerplate strict-dep-builds ([75d31f3c6](https://github.com/powerhouse-inc/powerhouse/commit/75d31f3c6))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.231 (2026-05-07)

### 🩹 Fixes

- add pnpm workspace to boilerplate ([1b3a6e78c](https://github.com/powerhouse-inc/powerhouse/commit/1b3a6e78c))
- **ci:** pnpm v11 docker init + global bin path ([9d93dc20a](https://github.com/powerhouse-inc/powerhouse/commit/9d93dc20a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.230 (2026-05-07)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.229 (2026-05-07)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.228 (2026-05-07)

### 🚀 Features

- **connect,reactor-api:** set git hash at build time and display with url ([99b5233c7](https://github.com/powerhouse-inc/powerhouse/commit/99b5233c7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.227 (2026-05-07)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.226 (2026-05-06)

### 🚀 Features

- various mixed load scenarios for the lb ([6ef3a76bf](https://github.com/powerhouse-inc/powerhouse/commit/6ef3a76bf))

### 🩹 Fixes

- bump document-engineering to 1.40.3 and align zod pin ([d50e7e42c](https://github.com/powerhouse-inc/powerhouse/commit/d50e7e42c))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.225 (2026-05-06)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.224 (2026-05-06)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.223 (2026-05-06)

### 🚀 Features

- add json viewer for operations tooltip ([#2569](https://github.com/powerhouse-inc/powerhouse/pull/2569))

### 🩹 Fixes

- **release:** drop concurrency from publish-docker-images.yml ([#2572](https://github.com/powerhouse-inc/powerhouse/issues/2572))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.222 (2026-05-06)

### 🩹 Fixes

- **release:** retry git push with rebase + add workflow concurrency ([#2572](https://github.com/powerhouse-inc/powerhouse/pull/2572))

### ❤️ Thank You

- Frank @froid1911

## 6.0.0-dev.220 (2026-05-06)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.219 (2026-05-06)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.218 (2026-05-06)

### 🚀 Features

- **registry:** renown JWT auth in front of verdaccio ([e5bbf93f1](https://github.com/powerhouse-inc/powerhouse/commit/e5bbf93f1))

### ❤️ Thank You

- Frank

## 6.0.0-dev.217 (2026-05-06)

### 🚀 Features

- **switchboard-lb:** rewrite to use simpler drive-id header ([a442207d1](https://github.com/powerhouse-inc/powerhouse/commit/a442207d1))
- **reactor-attachments:** implementing HEAD, implementing soft-delete and fixing some indexing issues ([f1430bca4](https://github.com/powerhouse-inc/powerhouse/commit/f1430bca4))

### 🩹 Fixes

- **reactor-attachments:** switch to Attachment-Metadata instead of the X- prefix ([7ea3f120a](https://github.com/powerhouse-inc/powerhouse/commit/7ea3f120a))
- **reactor-attachments:** code-review feedback ([18cd49ab6](https://github.com/powerhouse-inc/powerhouse/commit/18cd49ab6))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.216 (2026-05-05)

### 🩹 Fixes

- **codegen,ph-cli,shared:** build package types with tsc ([a1a47e932](https://github.com/powerhouse-inc/powerhouse/commit/a1a47e932))
- **codegen,ph-cli,shared:** build package types with tsc ([f3658dddc](https://github.com/powerhouse-inc/powerhouse/commit/f3658dddc))

### ❤️ Thank You

- acaldas
- Copilot

## 6.0.0-dev.215 (2026-05-05)

### 🚀 Features

- make document cache usable with graphql client ([#2557](https://github.com/powerhouse-inc/powerhouse/pull/2557))

### 🩹 Fixes

- **ci:** pick docker tag matching branch channel ([1f6c5ba7c](https://github.com/powerhouse-inc/powerhouse/commit/1f6c5ba7c))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.214 (2026-05-05)

### 🚀 Features

- **switchboard:** adding pglite migration flag ([952075b11](https://github.com/powerhouse-inc/powerhouse/commit/952075b11))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.213 (2026-05-04)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.212 (2026-05-03)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.211 (2026-05-02)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.210 (2026-05-01)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.209 (2026-04-30)

### 🚀 Features

- **reactor-api:** added system subgraph which returns version and hash information ([248fc1e92](https://github.com/powerhouse-inc/powerhouse/commit/248fc1e92))
- **reactor-attachments:** switchboard implementation fixes ([3b320d01c](https://github.com/powerhouse-inc/powerhouse/commit/3b320d01c))
- initial switchboard endpoints and implementation ([01b20cede](https://github.com/powerhouse-inc/powerhouse/commit/01b20cede))

### 🩹 Fixes

- so much linting that it kills my computer ([d6b6ff143](https://github.com/powerhouse-inc/powerhouse/commit/d6b6ff143))
- **reactor-attachments:** force octet-stream content-type for remote uploads ([fc45afccb](https://github.com/powerhouse-inc/powerhouse/commit/fc45afccb))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.208 (2026-04-29)

### 🚀 Features

- first swing at a load test ([f7e0f4456](https://github.com/powerhouse-inc/powerhouse/commit/f7e0f4456))
- added observability profile ([957af0925](https://github.com/powerhouse-inc/powerhouse/commit/957af0925))
- metrics integration ([1ce0b5fdf](https://github.com/powerhouse-inc/powerhouse/commit/1ce0b5fdf))
- switchboard-lb M3 ([cc49638e0](https://github.com/powerhouse-inc/powerhouse/commit/cc49638e0))
- **reactor-api:** added attachment service creation to reactor-api ([f96e9806b](https://github.com/powerhouse-inc/powerhouse/commit/f96e9806b))
- **reactor-attachments:** added builder ([2f5b10c4b](https://github.com/powerhouse-inc/powerhouse/commit/2f5b10c4b))
- **reactor-attachments:** initial direct upload and switchboard transport implementations ([624579adc](https://github.com/powerhouse-inc/powerhouse/commit/624579adc))
- **reactor-attachments:** reservations ([f13680db1](https://github.com/powerhouse-inc/powerhouse/commit/f13680db1))
- **reactor-attachments:** initial storage implementation ([b82e0fc8c](https://github.com/powerhouse-inc/powerhouse/commit/b82e0fc8c))
- **reactor-attachments:** initial setup of package ([ac5bac96a](https://github.com/powerhouse-inc/powerhouse/commit/ac5bac96a))

### 🩹 Fixes

- **reactor-attachments:** fix the tsdown config ([8485b54be](https://github.com/powerhouse-inc/powerhouse/commit/8485b54be))

### ❤️ Thank You

- Benjamin Jordan
