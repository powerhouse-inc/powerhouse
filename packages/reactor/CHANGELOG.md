## 5.0.10 (2025-11-19)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.9 (2025-11-19)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.8 (2025-11-19)

### 🚀 Features

- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- reactor-client handles deletion propagation ([58b5e6646](https://github.com/powerhouse-inc/powerhouse/commit/58b5e6646))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))
- reactor-client handles deletion propagation ([a28706734](https://github.com/powerhouse-inc/powerhouse/commit/a28706734))
- added new get by id or slug so that reactor-client -> reactor can use it ([189294fac](https://github.com/powerhouse-inc/powerhouse/commit/189294fac))
- initial implementation of reactor-client missing methods ([b9a0d5c18](https://github.com/powerhouse-inc/powerhouse/commit/b9a0d5c18))
- updating the reactor find() method to use the new document indexer ([e2f5de1b7](https://github.com/powerhouse-inc/powerhouse/commit/e2f5de1b7))
- reshuffle tests ([e4bac1d84](https://github.com/powerhouse-inc/powerhouse/commit/e4bac1d84))
- excessive reshuffles ([17d551321](https://github.com/powerhouse-inc/powerhouse/commit/17d551321))
- initial tla spec ([ced4140e0](https://github.com/powerhouse-inc/powerhouse/commit/ced4140e0))
- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))
- add conflict resolution test for concurrent modifications ([d938cbfd5](https://github.com/powerhouse-inc/powerhouse/commit/d938cbfd5))
- added big test where lots of docs are synced ([9b856ce93](https://github.com/powerhouse-inc/powerhouse/commit/9b856ce93))
- opearations_ready flow for waiting for sync ([f8d96b1e1](https://github.com/powerhouse-inc/powerhouse/commit/f8d96b1e1))
- major rename to avoid issues -- syncoperation rather than job handle ([28a1a5c54](https://github.com/powerhouse-inc/powerhouse/commit/28a1a5c54))
- initial dual reactor sync test ([51414e67d](https://github.com/powerhouse-inc/powerhouse/commit/51414e67d))
- sync-builder ([a422dd23d](https://github.com/powerhouse-inc/powerhouse/commit/a422dd23d))
- initial sync-manager implementation ([00c693e4b](https://github.com/powerhouse-inc/powerhouse/commit/00c693e4b))
- internalchannel implementation and types ([644ef1695](https://github.com/powerhouse-inc/powerhouse/commit/644ef1695))
- getting types in place for implementation ([bbc146227](https://github.com/powerhouse-inc/powerhouse/commit/bbc146227))
- initial implementations of cursor and remotes storage for sync ([1e7fadcf4](https://github.com/powerhouse-inc/powerhouse/commit/1e7fadcf4))
- plan and implementation for kysely sync storage ([7ccc7ae67](https://github.com/powerhouse-inc/powerhouse/commit/7ccc7ae67))
- first pass implementation of job-handle and mailbox ([b86e87803](https://github.com/powerhouse-inc/powerhouse/commit/b86e87803))
- **ph-cli:** ph migrate command ([#2099](https://github.com/powerhouse-inc/powerhouse/pull/2099))
- implementation of the new join on ordinal in the index ([ad621af7a](https://github.com/powerhouse-inc/powerhouse/commit/ad621af7a))
- adding operation index to executor integration tests ([63b51b84f](https://github.com/powerhouse-inc/powerhouse/commit/63b51b84f))
- first pass operation-index integration ([4e5b1e191](https://github.com/powerhouse-inc/powerhouse/commit/4e5b1e191))
- splitting job integration tests into legacy and current ([413ead70c](https://github.com/powerhouse-inc/powerhouse/commit/413ead70c))
- initial implementation of operation index ([906588091](https://github.com/powerhouse-inc/powerhouse/commit/906588091))
- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))
- wip load-reshuffle test ([fa05f1666](https://github.com/powerhouse-inc/powerhouse/commit/fa05f1666))
- first pass load impl on write side ([85ef79df9](https://github.com/powerhouse-inc/powerhouse/commit/85ef79df9))
- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- migration scripts for all storage ([804f5838c](https://github.com/powerhouse-inc/powerhouse/commit/804f5838c))
- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))
- **connect:** remove circular imports ([a1632d41e](https://github.com/powerhouse-inc/powerhouse/commit/a1632d41e))
- switching to tinybench for benchmarks ([5b915e025](https://github.com/powerhouse-inc/powerhouse/commit/5b915e025))
- integration tests for consistency token ([030744ec2](https://github.com/powerhouse-inc/powerhouse/commit/030744ec2))
- **codegen, vetra:** update codegen templates ([#2056](https://github.com/powerhouse-inc/powerhouse/pull/2056))
- starting to migrate reactor to use the legacy storage feature flag ([c24a9829e](https://github.com/powerhouse-inc/powerhouse/commit/c24a9829e))
- adding consistency tracking to the document indexer ([a2a0b4e9c](https://github.com/powerhouse-inc/powerhouse/commit/a2a0b4e9c))
- adding consistency tracking to the document indexer ([3e4b694e6](https://github.com/powerhouse-inc/powerhouse/commit/3e4b694e6))
- updated read model specs with consistency token ([3a7d6f91a](https://github.com/powerhouse-inc/powerhouse/commit/3a7d6f91a))
- added consistency token to the job interface ([f5077680c](https://github.com/powerhouse-inc/powerhouse/commit/f5077680c))
- consistency tracker implementation ([73449ab68](https://github.com/powerhouse-inc/powerhouse/commit/73449ab68))
- working out how consistency guarantees are provided through consistency tokens ([18737020e](https://github.com/powerhouse-inc/powerhouse/commit/18737020e))
- create default vetra package document when ph vetra is started for a remote drive ([#2066](https://github.com/powerhouse-inc/powerhouse/pull/2066))
- feature flag to toggle write to legacy storage ([151e40d76](https://github.com/powerhouse-inc/powerhouse/commit/151e40d76))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))
- first pass batch job implementation ([227305ec8](https://github.com/powerhouse-inc/powerhouse/commit/227305ec8))
- first pass implementation with unit tests ([5bc7416ef](https://github.com/powerhouse-inc/powerhouse/commit/5bc7416ef))
- reactor and job executor have a separate path for relationships ([b1cabb7f5](https://github.com/powerhouse-inc/powerhouse/commit/b1cabb7f5))
- initial types for relationship indexer ([151502633](https://github.com/powerhouse-inc/powerhouse/commit/151502633))
- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### 🩹 Fixes

- **reactor-api:** missing ws types ([fb5e0d964](https://github.com/powerhouse-inc/powerhouse/commit/fb5e0d964))
- build and lint fixes ([ddbb423c6](https://github.com/powerhouse-inc/powerhouse/commit/ddbb423c6))
- reactor document-model filtering was busted ([98bb94668](https://github.com/powerhouse-inc/powerhouse/commit/98bb94668))
- slug mappings were not being inserted properly ([1ddc6f349](https://github.com/powerhouse-inc/powerhouse/commit/1ddc6f349))
- build and lint fixes ([efeece878](https://github.com/powerhouse-inc/powerhouse/commit/efeece878))
- reactor document-model filtering was busted ([4700ad9f3](https://github.com/powerhouse-inc/powerhouse/commit/4700ad9f3))
- slug mappings were not being inserted properly ([d1864769a](https://github.com/powerhouse-inc/powerhouse/commit/d1864769a))
- pull readmodel coordinator init back into reactor ([bf3a4261b](https://github.com/powerhouse-inc/powerhouse/commit/bf3a4261b))
- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))
- unskipping skipped tests and fixing ([f28bd79f2](https://github.com/powerhouse-inc/powerhouse/commit/f28bd79f2))
- use real operation store ([97fac3d7f](https://github.com/powerhouse-inc/powerhouse/commit/97fac3d7f))
- added missing dependencies ([ffda3cfcc](https://github.com/powerhouse-inc/powerhouse/commit/ffda3cfcc))
- updated lockfile ([73f7c8503](https://github.com/powerhouse-inc/powerhouse/commit/73f7c8503))
- **ph-cli:** added missing runtime dependencies ([da1b66e73](https://github.com/powerhouse-inc/powerhouse/commit/da1b66e73))
- **builder-tools:** use alias for self-reference import on ts instead of loading from dist ([b23b772c0](https://github.com/powerhouse-inc/powerhouse/commit/b23b772c0))
- **reactor-api,switchboard:** load local package by default and resolve self reference import on ts files ([2b2d29ba6](https://github.com/powerhouse-inc/powerhouse/commit/2b2d29ba6))
- linter fixes ([d0b6e63d7](https://github.com/powerhouse-inc/powerhouse/commit/d0b6e63d7))
- fixing lint issues ([3afde3ebd](https://github.com/powerhouse-inc/powerhouse/commit/3afde3ebd))
- fix issue with resuffling ([7bcb931b7](https://github.com/powerhouse-inc/powerhouse/commit/7bcb931b7))
- reshuffles work a bit differently ([0cf39c12d](https://github.com/powerhouse-inc/powerhouse/commit/0cf39c12d))
- require job executor config, and fix mock data in unit tests ([7c7362325](https://github.com/powerhouse-inc/powerhouse/commit/7c7362325))
- linting warnings ([5f79fcf98](https://github.com/powerhouse-inc/powerhouse/commit/5f79fcf98))
- removing race condition from test ([251531bf4](https://github.com/powerhouse-inc/powerhouse/commit/251531bf4))
- linting fixes ([2ab0f01ed](https://github.com/powerhouse-inc/powerhouse/commit/2ab0f01ed))
- **codegen:** move read-pkg to runtime dependency ([939f01045](https://github.com/powerhouse-inc/powerhouse/commit/939f01045))
- **codegen:** run prettier programmatically ([23f948c4d](https://github.com/powerhouse-inc/powerhouse/commit/23f948c4d))
- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- broke the build, fixing with reactorbuilder ([2c4ade4e6](https://github.com/powerhouse-inc/powerhouse/commit/2c4ade4e6))
- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))
- update atlas packages ([fa174d00e](https://github.com/powerhouse-inc/powerhouse/commit/fa174d00e))
- commenting out test that exports broke ([75cfba9b5](https://github.com/powerhouse-inc/powerhouse/commit/75cfba9b5))
- linter issues ([bc1d2a569](https://github.com/powerhouse-inc/powerhouse/commit/bc1d2a569))
- add/remove children need special revision handling ([52b8bbd72](https://github.com/powerhouse-inc/powerhouse/commit/52b8bbd72))
- type fixes in the document indexer ([98cd03b92](https://github.com/powerhouse-inc/powerhouse/commit/98cd03b92))
- fixing unit test build and adding a couple comments ([d24d46b2d](https://github.com/powerhouse-inc/powerhouse/commit/d24d46b2d))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.0.7 (2025-11-19)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.6 (2025-11-19)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.5 (2025-11-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.4 (2025-11-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.3 (2025-11-13)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.2 (2025-11-05)

### 🩹 Fixes

- publish docker prod workflow ([d701f8dc0](https://github.com/powerhouse-inc/powerhouse/commit/d701f8dc0))

### ❤️ Thank You

- Frank

## 5.0.1 (2025-11-03)

### 🩹 Fixes

- publish docker prod workflow ([d701f8dc0](https://github.com/powerhouse-inc/powerhouse/commit/d701f8dc0))

### ❤️ Thank You

- Frank

# 5.0.0 (2025-10-31)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.6 (2025-08-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.5 (2025-08-13)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.4 (2025-07-31)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.3 (2025-07-31)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.2 (2025-07-31)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.1 (2025-07-25)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

# 4.0.0 (2025-07-24)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.0-staging.5 (2025-07-23)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.0-staging.4 (2025-07-22)

### 🩹 Fixes

- **codegen:** revert changes to resolvers template ([b96a7b899](https://github.com/powerhouse-inc/powerhouse/commit/b96a7b899))
- update release notes ([f1b6a8e71](https://github.com/powerhouse-inc/powerhouse/commit/f1b6a8e71))
- add release notes on correct branch ([a2d60a537](https://github.com/powerhouse-inc/powerhouse/commit/a2d60a537))

### ❤️ Thank You

- acaldas @acaldas
- Callme-T

## 4.0.0-staging.3 (2025-07-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.0-staging.2 (2025-07-17)

### 🩹 Fixes

- **codegen:** updated subgraph template to deal with undefined return on getDocument ([7b2862a91](https://github.com/powerhouse-inc/powerhouse/commit/7b2862a91))

### ❤️ Thank You

- acaldas @acaldas

## 4.0.0-staging.1 (2025-07-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.14 (2025-07-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.13 (2025-07-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.12 (2025-07-17)

### 🩹 Fixes

- **document-drive:** use lowercase letters when hashing relational processor namespace ([87c7944d3](https://github.com/powerhouse-inc/powerhouse/commit/87c7944d3))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.11 (2025-07-16)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.10 (2025-07-15)

### 🩹 Fixes

- **codegen:** remove sucrase dependency and update schema gen ([9d3efd2ec](https://github.com/powerhouse-inc/powerhouse/commit/9d3efd2ec))

### ❤️ Thank You

- Guillermo Puente

## 3.3.0-dev.9 (2025-07-10)

### 🩹 Fixes

- force release ([8185a3b37](https://github.com/powerhouse-inc/powerhouse/commit/8185a3b37))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.3.0-dev.8 (2025-07-10)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.7 (2025-07-10)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.6 (2025-07-10)

### 🚀 Features

- **codegen:** support loading migration typescript file ([d3cc1957b](https://github.com/powerhouse-inc/powerhouse/commit/d3cc1957b))

### 🩹 Fixes

- **codegen,ph-cli:** make schema-file optional and updated generate help text ([adad303a8](https://github.com/powerhouse-inc/powerhouse/commit/adad303a8))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.5 (2025-07-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.4 (2025-07-09)

### 🚀 Features

- **codegen,ph-cli:** added generate schema command ([9a5e921fb](https://github.com/powerhouse-inc/powerhouse/commit/9a5e921fb))
- **document-drive:** initial work on BaseOperationalProcessor ([40fe0ec2f](https://github.com/powerhouse-inc/powerhouse/commit/40fe0ec2f))

### 🩹 Fixes

- **reactor-api, reactor-local:** build issues ([927192aff](https://github.com/powerhouse-inc/powerhouse/commit/927192aff))

### ❤️ Thank You

- acaldas
- Frank

## 3.3.0-dev.3 (2025-07-08)

### 🚀 Features

- added operational hooks and utils in reactor-browser ([216f7d03d](https://github.com/powerhouse-inc/powerhouse/commit/216f7d03d))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.2 (2025-07-05)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.1 (2025-07-04)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.0 (2025-07-02)

### 🚀 Features

- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))
- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### 🩹 Fixes

- fix build ([c0cd6988d](https://github.com/powerhouse-inc/powerhouse/commit/c0cd6988d))
- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))
- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 3.2.0-dev.9 (2025-07-02)

### 🩹 Fixes

- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 3.2.0-dev.8 (2025-07-01)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.2.0-dev.7 (2025-06-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.2.0-dev.6 (2025-06-27)

### 🚀 Features

- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))
- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### 🩹 Fixes

- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente
- Guillermo Puente Sandoval
- ryanwolhuter

## 3.2.0-dev.5 (2025-06-26)

### 🚀 Features

- **common:** add atoms library ([dbc8e8b44](https://github.com/powerhouse-inc/powerhouse/commit/dbc8e8b44))

### 🩹 Fixes

- **connect,codegen,common,reactor-browser:** fix analytics query subscription ([6e9729739](https://github.com/powerhouse-inc/powerhouse/commit/6e9729739))
- adding id/slug resolution to document storage ([0c611fb1b](https://github.com/powerhouse-inc/powerhouse/commit/0c611fb1b))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter

## 3.2.0-dev.4 (2025-06-25)

### 🚀 Features

- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### ❤️ Thank You

- Guillermo Puente Sandoval

## 3.2.0-dev.3 (2025-06-24)

### 🩹 Fixes

- **connect, builder-tools:** disable external packages in dev mode ([e13243874](https://github.com/powerhouse-inc/powerhouse/commit/e13243874))

### ❤️ Thank You

- acaldas

## 3.2.0-dev.2 (2025-06-20)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.2.0-dev.1 (2025-06-19)

### 🩹 Fixes

- **connect,builder-tools:** support base paths without ending slash ([1ee6d9d9f](https://github.com/powerhouse-inc/powerhouse/commit/1ee6d9d9f))

### ❤️ Thank You

- acaldas @acaldas

## 3.2.0-dev.0 (2025-06-18)

### 🚀 Features

- use document model subgraph when clicking on switchboard url button ([24cf6ad94](https://github.com/powerhouse-inc/powerhouse/commit/24cf6ad94))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.41 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.40 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.39 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.38 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.37 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.36 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.35 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.34 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.33 (2025-06-18)

### 🚀 Features

- **reactor:** added repository url to package.json ([662c90e89](https://github.com/powerhouse-inc/powerhouse/commit/662c90e89))

### 🩹 Fixes

- deploy not on push to main ([63eef7020](https://github.com/powerhouse-inc/powerhouse/commit/63eef7020))
- deploy powerhouse to available environments ([a45859a22](https://github.com/powerhouse-inc/powerhouse/commit/a45859a22))

### ❤️ Thank You

- Frank

## 2.5.0-dev.32 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.31 (2025-06-18)

### 🚀 Features

- **reactor:** proof-of-concept benchmarks for queue->event->job execution flow ([c297618b9](https://github.com/powerhouse-inc/powerhouse/commit/c297618b9))
- **reactor:** job executor and queue implementations and tests ([c74bbc712](https://github.com/powerhouse-inc/powerhouse/commit/c74bbc712))
- **reactor:** initial event-bus implementation with tests and benchmarks ([ef5b3c42e](https://github.com/powerhouse-inc/powerhouse/commit/ef5b3c42e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)