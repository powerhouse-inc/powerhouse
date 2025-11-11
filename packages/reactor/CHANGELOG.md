## 5.0.1-staging.11 (2025-11-11)

### 🚀 Features

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
- migrating to mutateBatch API for addFile ([75ffe94e9](https://github.com/powerhouse-inc/powerhouse/commit/75ffe94e9))
- first pass batch job implementation ([227305ec8](https://github.com/powerhouse-inc/powerhouse/commit/227305ec8))
- first pass implementation with unit tests ([5bc7416ef](https://github.com/powerhouse-inc/powerhouse/commit/5bc7416ef))
- reactor and job executor have a separate path for relationships ([b1cabb7f5](https://github.com/powerhouse-inc/powerhouse/commit/b1cabb7f5))
- initial types for relationship indexer ([151502633](https://github.com/powerhouse-inc/powerhouse/commit/151502633))
- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### 🩹 Fixes

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
- added a v1 addfile integration test ([47fae0474](https://github.com/powerhouse-inc/powerhouse/commit/47fae0474))
- linter issues ([bc1d2a569](https://github.com/powerhouse-inc/powerhouse/commit/bc1d2a569))
- add/remove children need special revision handling ([52b8bbd72](https://github.com/powerhouse-inc/powerhouse/commit/52b8bbd72))
- type fixes in the document indexer ([98cd03b92](https://github.com/powerhouse-inc/powerhouse/commit/98cd03b92))
- fixing unit test build and adding a couple comments ([d24d46b2d](https://github.com/powerhouse-inc/powerhouse/commit/d24d46b2d))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.0.1-staging.10 (2025-11-11)

### 🚀 Features

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
- migrating to mutateBatch API for addFile ([75ffe94e9](https://github.com/powerhouse-inc/powerhouse/commit/75ffe94e9))
- first pass batch job implementation ([227305ec8](https://github.com/powerhouse-inc/powerhouse/commit/227305ec8))
- first pass implementation with unit tests ([5bc7416ef](https://github.com/powerhouse-inc/powerhouse/commit/5bc7416ef))
- reactor and job executor have a separate path for relationships ([b1cabb7f5](https://github.com/powerhouse-inc/powerhouse/commit/b1cabb7f5))
- initial types for relationship indexer ([151502633](https://github.com/powerhouse-inc/powerhouse/commit/151502633))
- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### 🩹 Fixes

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
- added a v1 addfile integration test ([47fae0474](https://github.com/powerhouse-inc/powerhouse/commit/47fae0474))
- linter issues ([bc1d2a569](https://github.com/powerhouse-inc/powerhouse/commit/bc1d2a569))
- add/remove children need special revision handling ([52b8bbd72](https://github.com/powerhouse-inc/powerhouse/commit/52b8bbd72))
- type fixes in the document indexer ([98cd03b92](https://github.com/powerhouse-inc/powerhouse/commit/98cd03b92))
- fixing unit test build and adding a couple comments ([d24d46b2d](https://github.com/powerhouse-inc/powerhouse/commit/d24d46b2d))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.0.1-staging.9 (2025-11-05)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.1-staging.8 (2025-11-04)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.1-staging.7 (2025-11-04)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.0.1-staging.6 (2025-10-30)

### 🚀 Features

- first swing at a project to import these recorded operations ([41b139237](https://github.com/powerhouse-inc/powerhouse/commit/41b139237))

### 🩹 Fixes

- package link issues ([3415df513](https://github.com/powerhouse-inc/powerhouse/commit/3415df513))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.92 (2025-10-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.91 (2025-10-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.90 (2025-10-27)

### 🚀 Features

- **reactor-api:** updated apollo server to v5 ([66dffda7b](https://github.com/powerhouse-inc/powerhouse/commit/66dffda7b))

### ❤️ Thank You

- acaldas

## 4.1.0-dev.89 (2025-10-24)

### 🩹 Fixes

- used fixed versions for codemirror dep ([183e487db](https://github.com/powerhouse-inc/powerhouse/commit/183e487db))

### ❤️ Thank You

- Guillermo Puente

## 4.1.0-dev.88 (2025-10-24)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.87 (2025-10-24)

### 🩹 Fixes

- read tests had a type bug ([b0f21cddc](https://github.com/powerhouse-inc/powerhouse/commit/b0f21cddc))
- let revision errors bubble up to jobs ([13e82cec9](https://github.com/powerhouse-inc/powerhouse/commit/13e82cec9))
- fixing a deep issue where operations were being used to calculate index instead of revisions ([a6611501d](https://github.com/powerhouse-inc/powerhouse/commit/a6611501d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.86 (2025-10-23)

### 🚀 Features

- initial write cache bench, but incomplete ([a9cbcf20e](https://github.com/powerhouse-inc/powerhouse/commit/a9cbcf20e))

### 🩹 Fixes

- **vetra:** added codegen debounce test and reduced logging ([bc360b8e0](https://github.com/powerhouse-inc/powerhouse/commit/bc360b8e0))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.85 (2025-10-22)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.84 (2025-10-22)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.83 (2025-10-22)

### 🚀 Features

- write cache integration test updates and explicit error handling ([9f4d0a5b8](https://github.com/powerhouse-inc/powerhouse/commit/9f4d0a5b8))
- full write cache integration tests using document-drive ([cd22c881b](https://github.com/powerhouse-inc/powerhouse/commit/cd22c881b))
- proof of cache ([53ceae009](https://github.com/powerhouse-inc/powerhouse/commit/53ceae009))
- testing ring buffers directly on the implementation ([bc46076fe](https://github.com/powerhouse-inc/powerhouse/commit/bc46076fe))
- write cache and ring buffer tightening, removing some bad test cases ([f0915abbf](https://github.com/powerhouse-inc/powerhouse/commit/f0915abbf))
- introducing the keyframe store ([fee0e7d2f](https://github.com/powerhouse-inc/powerhouse/commit/fee0e7d2f))
- compatibility fixes ([34bc595c8](https://github.com/powerhouse-inc/powerhouse/commit/34bc595c8))
- easy path -- cache hit ([2804e447f](https://github.com/powerhouse-inc/powerhouse/commit/2804e447f))
- phase 4 of write cache plan ([ac339ff1a](https://github.com/powerhouse-inc/powerhouse/commit/ac339ff1a))
- added a simple lru ([5651ecd17](https://github.com/powerhouse-inc/powerhouse/commit/5651ecd17))
- added simple ring-buffer ([9b73aac39](https://github.com/powerhouse-inc/powerhouse/commit/9b73aac39))
- created necessary interfaces ([f4c1bc9cf](https://github.com/powerhouse-inc/powerhouse/commit/f4c1bc9cf))
- kv-store implementation ([25aa8cfd2](https://github.com/powerhouse-inc/powerhouse/commit/25aa8cfd2))
- add automated tests for vetra features ([#1962](https://github.com/powerhouse-inc/powerhouse/pull/1962))

### 🩹 Fixes

- the last writecache unit test ([999f286a2](https://github.com/powerhouse-inc/powerhouse/commit/999f286a2))
- all of the write cache tests should prove they are using snapshots correctly ([4badb3729](https://github.com/powerhouse-inc/powerhouse/commit/4badb3729))
- offering yet more proof of correctness in base revision usage ([94370ca90](https://github.com/powerhouse-inc/powerhouse/commit/94370ca90))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.82 (2025-10-21)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.81 (2025-10-21)

### 🚀 Features

- **reactor-browser:** remove catch all wildcard ([f09931a88](https://github.com/powerhouse-inc/powerhouse/commit/f09931a88))
- **reactor-browser,connect:** use new window function factory ([7886c284f](https://github.com/powerhouse-inc/powerhouse/commit/7886c284f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.80 (2025-10-21)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.79 (2025-10-20)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.78 (2025-10-20)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.77 (2025-10-20)

### 🩹 Fixes

- add missing @openfeature/core peer dependency ([2c4a904b0](https://github.com/powerhouse-inc/powerhouse/commit/2c4a904b0))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.76 (2025-10-18)

### 🚀 Features

- document-view parity fixes ([0d6dd53fa](https://github.com/powerhouse-inc/powerhouse/commit/0d6dd53fa))

### 🩹 Fixes

- filesystem needs to calculate revisions better ([96654825a](https://github.com/powerhouse-inc/powerhouse/commit/96654825a))
- fixes to how revisions are calculated ([c2b0c2227](https://github.com/powerhouse-inc/powerhouse/commit/c2b0c2227))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.75 (2025-10-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.74 (2025-10-15)

### 🚀 Features

- document-view stiching changes ([fd875ca0a](https://github.com/powerhouse-inc/powerhouse/commit/fd875ca0a))
- document-view optimizations ([d4251ce98](https://github.com/powerhouse-inc/powerhouse/commit/d4251ce98))
- document-view reconstruction fixes ([97a66e3fd](https://github.com/powerhouse-inc/powerhouse/commit/97a66e3fd))
- introduced a read model coordinator ([ae5e765a9](https://github.com/powerhouse-inc/powerhouse/commit/ae5e765a9))
- implemented job tracking ([370447337](https://github.com/powerhouse-inc/powerhouse/commit/370447337))
- deletion state checks ([9fc3798cd](https://github.com/powerhouse-inc/powerhouse/commit/9fc3798cd))
- dual write ([cd1fad2fb](https://github.com/powerhouse-inc/powerhouse/commit/cd1fad2fb))

### 🩹 Fixes

- **codegen:** update graphql dependency in package.json ([257f368ac](https://github.com/powerhouse-inc/powerhouse/commit/257f368ac))
- merge fixes ([e5eda5985](https://github.com/powerhouse-inc/powerhouse/commit/e5eda5985))
- error thrown on shutdown ([b52cdb6fe](https://github.com/powerhouse-inc/powerhouse/commit/b52cdb6fe))
- document-drive-model tests should use updated job status system and proper lifecycle methods of coordinator ([4217e3292](https://github.com/powerhouse-inc/powerhouse/commit/4217e3292))
- now we need an actual job executor to make tests pass ([c869f1f34](https://github.com/powerhouse-inc/powerhouse/commit/c869f1f34))
- jobs can have many operations, fixing create/update in new flow ([ffcf6b468](https://github.com/powerhouse-inc/powerhouse/commit/ffcf6b468))
- adding all header parameters to create action input ([67ac63f05](https://github.com/powerhouse-inc/powerhouse/commit/67ac63f05))
- fixing issue where create, update, delete were applied with incorrect scope ([59c7a981e](https://github.com/powerhouse-inc/powerhouse/commit/59c7a981e))
- incremental fix wit hack ([5f4a7e2cd](https://github.com/powerhouse-inc/powerhouse/commit/5f4a7e2cd))
- date issue in op store ([4c2fb3ae6](https://github.com/powerhouse-inc/powerhouse/commit/4c2fb3ae6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.73 (2025-10-15)

### 🚀 Features

- **renown:** added login button ([f109c7305](https://github.com/powerhouse-inc/powerhouse/commit/f109c7305))

### ❤️ Thank You

- Frank

## 4.1.0-dev.72 (2025-10-15)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.71 (2025-10-15)

### 🩹 Fixes

- **codegen:** update analytics processor imports to use in processor templates ([#1954](https://github.com/powerhouse-inc/powerhouse/pull/1954))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.70 (2025-10-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.69 (2025-10-11)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.68 (2025-10-11)

### 🚀 Features

- **vetra:** added read model to fetch vetra packages ([abb6d3742](https://github.com/powerhouse-inc/powerhouse/commit/abb6d3742))

### ❤️ Thank You

- Frank

## 4.1.0-dev.67 (2025-10-10)

### 🚀 Features

- **vetra:** add open button to Package Information section ([#1930](https://github.com/powerhouse-inc/powerhouse/pull/1930))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.66 (2025-10-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.65 (2025-10-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.64 (2025-10-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.63 (2025-10-09)

### 🚀 Features

- update @electric-sql/pglite version ([fa3529328](https://github.com/powerhouse-inc/powerhouse/commit/fa3529328))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.62 (2025-10-08)

### 🚀 Features

- wip delete document action ([5f753cea0](https://github.com/powerhouse-inc/powerhouse/commit/5f753cea0))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.61 (2025-10-08)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.60 (2025-10-08)

### 🚀 Features

- **vetra:** added read model to fetch vetra packages ([23c55364d](https://github.com/powerhouse-inc/powerhouse/commit/23c55364d))
- added hashing options to the document scope ([af2ef40c0](https://github.com/powerhouse-inc/powerhouse/commit/af2ef40c0))
- using types instead of dynamic objects for create and upgrade input ([2a0e80974](https://github.com/powerhouse-inc/powerhouse/commit/2a0e80974))
- operation store now uses updated create / update actions ([180702e6c](https://github.com/powerhouse-inc/powerhouse/commit/180702e6c))
- **monorepo:** use latest versions of react related deps ([#1905](https://github.com/powerhouse-inc/powerhouse/pull/1905))
- **monorepo:** remove global storybook installs ([#1903](https://github.com/powerhouse-inc/powerhouse/pull/1903))
- **monorepo:** update to react 19 ([#1902](https://github.com/powerhouse-inc/powerhouse/pull/1902))
- **vetra:** enabled HMR in dev mode ([8cf19757e](https://github.com/powerhouse-inc/powerhouse/commit/8cf19757e))
- **vetra:** new connect build setup on vetra ([8dd11a849](https://github.com/powerhouse-inc/powerhouse/commit/8dd11a849))
- **monorepo:** revert package versions ([8a1a02628](https://github.com/powerhouse-inc/powerhouse/commit/8a1a02628))
- **monorepo:** update eslint config ([ac97af97d](https://github.com/powerhouse-inc/powerhouse/commit/ac97af97d))
- adding feature flags to reactor-mcp ([fe4f2f683](https://github.com/powerhouse-inc/powerhouse/commit/fe4f2f683))
- stubbing out feature flag + reactor setup in connect and deleting unused code in reactor-browser ([793bbd7af](https://github.com/powerhouse-inc/powerhouse/commit/793bbd7af))
- syncing feature flag behavior between switchboard and reactor-local ([e45dc2bf7](https://github.com/powerhouse-inc/powerhouse/commit/e45dc2bf7))
- added getMany to document view ([f89a1c46c](https://github.com/powerhouse-inc/powerhouse/commit/f89a1c46c))
- initial document view methods + tests ([af8a9a0e7](https://github.com/powerhouse-inc/powerhouse/commit/af8a9a0e7))
- add remaining methods ([2d1bd201e](https://github.com/powerhouse-inc/powerhouse/commit/2d1bd201e))
- added initial pieces of the kysely operation store implementation ([3fbece162](https://github.com/powerhouse-inc/powerhouse/commit/3fbece162))
- **connect,builder-tools:** build rework ([#1871](https://github.com/powerhouse-inc/powerhouse/pull/1871))
- **codegen:** updated editor boilerplate with document state and example setName dispatch ([3e7c51cc3](https://github.com/powerhouse-inc/powerhouse/commit/3e7c51cc3))
- restructure document model to avoid circular imports ([#1874](https://github.com/powerhouse-inc/powerhouse/pull/1874))

### 🩹 Fixes

- flakey test fix using fake timers ([4c7be58f3](https://github.com/powerhouse-inc/powerhouse/commit/4c7be58f3))
- linting queue and awaiter now ([39b0f07ae](https://github.com/powerhouse-inc/powerhouse/commit/39b0f07ae))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.59 (2025-09-24)

### 🚀 Features

- **reactor:** fix lint error ([53777e154](https://github.com/powerhouse-inc/powerhouse/commit/53777e154))
- **monorepo:** rename tsc to tsc:build ([c1385418b](https://github.com/powerhouse-inc/powerhouse/commit/c1385418b))

### 🩹 Fixes

- **builder-tools:** declare @storybook/preview-api dependency ([705ac8da1](https://github.com/powerhouse-inc/powerhouse/commit/705ac8da1))
- more type fixes ([16c562ae1](https://github.com/powerhouse-inc/powerhouse/commit/16c562ae1))
- lots of type fixes for modules ([8f4cf02fe](https://github.com/powerhouse-inc/powerhouse/commit/8f4cf02fe))
- reverting bad merge changes and getting reactor to build again ([eb687de4c](https://github.com/powerhouse-inc/powerhouse/commit/eb687de4c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.55 (2025-09-16)

### 🚀 Features

- enable supported document types for drag and drop feature ([#1860](https://github.com/powerhouse-inc/powerhouse/pull/1860))

### 🩹 Fixes

- add default, passthrough signer ([d9e2c4f1d](https://github.com/powerhouse-inc/powerhouse/commit/d9e2c4f1d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.54 (2025-09-16)

### 🚀 Features

- adding reactor client to subgraph args ([d0a8011e6](https://github.com/powerhouse-inc/powerhouse/commit/d0a8011e6))
- updating docs with error handler ([4e28b0573](https://github.com/powerhouse-inc/powerhouse/commit/4e28b0573))
- subscriptions now have guaranteed delivery and output errors through a centralized error handler ([d9b0c4326](https://github.com/powerhouse-inc/powerhouse/commit/d9b0c4326))
- naive implementation of subscriptions ([5ae6dd83c](https://github.com/powerhouse-inc/powerhouse/commit/5ae6dd83c))
- reactor client builder ([d93875bcd](https://github.com/powerhouse-inc/powerhouse/commit/d93875bcd))

### 🩹 Fixes

- linter feedback ([5219f6322](https://github.com/powerhouse-inc/powerhouse/commit/5219f6322))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.53 (2025-09-13)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.52 (2025-09-12)

### 🚀 Features

- more test fixes ([12a0acd1d](https://github.com/powerhouse-inc/powerhouse/commit/12a0acd1d))
- pulled job awaiter out of reactor client ([bd4c206a9](https://github.com/powerhouse-inc/powerhouse/commit/bd4c206a9))
- implemented the easy, passthrough functions ([ceb692cd1](https://github.com/powerhouse-inc/powerhouse/commit/ceb692cd1))
- add a bunch of failing tests for the reactor-client ([8276565a8](https://github.com/powerhouse-inc/powerhouse/commit/8276565a8))

### 🩹 Fixes

- linting issues ([ba85245b4](https://github.com/powerhouse-inc/powerhouse/commit/ba85245b4))
- **connect-e2e:** fix failing tests ([88c3bea94](https://github.com/powerhouse-inc/powerhouse/commit/88c3bea94))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.51 (2025-09-11)

### 🚀 Features

- **reactor-api:** generate sdk ([ec107015c](https://github.com/powerhouse-inc/powerhouse/commit/ec107015c))
- **reactor-api:** initial gql codegen ([3db9e9778](https://github.com/powerhouse-inc/powerhouse/commit/3db9e9778))
- **monorepo:** make format consistent across ignores ([98469560f](https://github.com/powerhouse-inc/powerhouse/commit/98469560f))
- **monorepo:** use consistent separate type imports ([6fd4ac0f4](https://github.com/powerhouse-inc/powerhouse/commit/6fd4ac0f4))

### 🩹 Fixes

- annoyingly, you have to add ignores to the root eslint ([bb6d993bd](https://github.com/powerhouse-inc/powerhouse/commit/bb6d993bd))
- **docs:** improve document hooks documentation ([d05fcb835](https://github.com/powerhouse-inc/powerhouse/commit/d05fcb835))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.50 (2025-09-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.49 (2025-09-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.48 (2025-09-09)

### 🚀 Features

- update queue to use job handles ([acbe50ee1](https://github.com/powerhouse-inc/powerhouse/commit/acbe50ee1))
- tests for job execution handle ([5af69c190](https://github.com/powerhouse-inc/powerhouse/commit/5af69c190))
- moving to job execution handles ([f91c3a759](https://github.com/powerhouse-inc/powerhouse/commit/f91c3a759))
- drain, block, unblock on queue ([77ad8f9bc](https://github.com/powerhouse-inc/powerhouse/commit/77ad8f9bc))
- added job execution handle ([4fadd6638](https://github.com/powerhouse-inc/powerhouse/commit/4fadd6638))

### 🩹 Fixes

- more linting issues ([5dd874517](https://github.com/powerhouse-inc/powerhouse/commit/5dd874517))
- tons of linting fixes ([38c7981e3](https://github.com/powerhouse-inc/powerhouse/commit/38c7981e3))
- automated linting fixes ([d9c123692](https://github.com/powerhouse-inc/powerhouse/commit/d9c123692))
- fix eventbus benchmarks, remove old benchmark ([5a85f498e](https://github.com/powerhouse-inc/powerhouse/commit/5a85f498e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.47 (2025-09-06)

### 🩹 Fixes

- **docs:** added zip redundancy to release notes ([3acfe1027](https://github.com/powerhouse-inc/powerhouse/commit/3acfe1027))

### ❤️ Thank You

- Callme-T

## 4.1.0-dev.46 (2025-09-05)

### 🚀 Features

- plug in persistence ([5af292734](https://github.com/powerhouse-inc/powerhouse/commit/5af292734))
- added robust dependency system to queue ([4aca91494](https://github.com/powerhouse-inc/powerhouse/commit/4aca91494))
- wip dependency graph ([939e41076](https://github.com/powerhouse-inc/powerhouse/commit/939e41076))
- queue now queues by doc id ([afc03e437](https://github.com/powerhouse-inc/powerhouse/commit/afc03e437))

### 🩹 Fixes

- **docs:** added zip redundancy to release notes ([3acfe1027](https://github.com/powerhouse-inc/powerhouse/commit/3acfe1027))
- build errors ([97b4853a3](https://github.com/powerhouse-inc/powerhouse/commit/97b4853a3))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T

## 5.0.0-staging.1 (2025-09-04)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.44 (2025-09-04)

### 🚀 Features

- **switchboard:** updated readme ([9659cf035](https://github.com/powerhouse-inc/powerhouse/commit/9659cf035))

### ❤️ Thank You

- Frank

## 4.1.0-dev.43 (2025-09-02)

### 🚀 Features

- first mutation queued... ([a678882a3](https://github.com/powerhouse-inc/powerhouse/commit/a678882a3))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.42 (2025-09-02)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.41 (2025-09-02)

### 🩹 Fixes

- **document-drive:** install openssl ([89f21529e](https://github.com/powerhouse-inc/powerhouse/commit/89f21529e))
- **document-drive:** prisma build ([7884368a2](https://github.com/powerhouse-inc/powerhouse/commit/7884368a2))
- **switchboard, connect:** fetch proper tag ([79a0bc967](https://github.com/powerhouse-inc/powerhouse/commit/79a0bc967))

### ❤️ Thank You

- Frank

## 4.1.0-dev.40 (2025-09-02)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.39 (2025-09-02)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.38 (2025-08-30)

### 🚀 Features

- **reactor:** update mutate on facade ([aab0d7553](https://github.com/powerhouse-inc/powerhouse/commit/aab0d7553))
- gql-gen spec ([5bf2c7226](https://github.com/powerhouse-inc/powerhouse/commit/5bf2c7226))
- reactor find fixes ([9560ccb0f](https://github.com/powerhouse-inc/powerhouse/commit/9560ccb0f))
- implementing find facade on IReactor ([eed25fdae](https://github.com/powerhouse-inc/powerhouse/commit/eed25fdae))
- **reactor:** we have a reactor facade ([7a61e68ab](https://github.com/powerhouse-inc/powerhouse/commit/7a61e68ab))
- **reactor:** impstubbing out initial interface and types ([b74b194f9](https://github.com/powerhouse-inc/powerhouse/commit/b74b194f9))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.37 (2025-08-29)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.36 (2025-08-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.35 (2025-08-27)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.34 (2025-08-26)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.33 (2025-08-21)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.32 (2025-08-21)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.31 (2025-08-20)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.30 (2025-08-20)

### 🩹 Fixes

- add additional tags ([4f0cf8658](https://github.com/powerhouse-inc/powerhouse/commit/4f0cf8658))

### ❤️ Thank You

- Frank

## 4.1.0-dev.29 (2025-08-20)

### 🩹 Fixes

- fetch tags :-) ([df0b7beba](https://github.com/powerhouse-inc/powerhouse/commit/df0b7beba))

### ❤️ Thank You

- Frank

## 4.1.0-dev.28 (2025-08-20)

### 🩹 Fixes

- removed metadata extraction from commit ([637960021](https://github.com/powerhouse-inc/powerhouse/commit/637960021))

### ❤️ Thank You

- Frank

## 4.1.0-dev.27 (2025-08-20)

### 🩹 Fixes

- extract metadata tags and labels for docker ([bb9c81ce7](https://github.com/powerhouse-inc/powerhouse/commit/bb9c81ce7))
- use github tag properly ([95ccff4b8](https://github.com/powerhouse-inc/powerhouse/commit/95ccff4b8))
- proper tag for docker images ([e73e10617](https://github.com/powerhouse-inc/powerhouse/commit/e73e10617))
- use patname secret instead of github token ([db9dfd5cd](https://github.com/powerhouse-inc/powerhouse/commit/db9dfd5cd))

### ❤️ Thank You

- Frank

## 4.1.0-dev.26 (2025-08-20)

### 🩹 Fixes

- docker deploy alternative approach ([2a5522cdc](https://github.com/powerhouse-inc/powerhouse/commit/2a5522cdc))

### ❤️ Thank You

- Frank

## 4.1.0-dev.25 (2025-08-20)

### 🩹 Fixes

- docker deploy ([b057a7cce](https://github.com/powerhouse-inc/powerhouse/commit/b057a7cce))

### ❤️ Thank You

- Frank

## 4.1.0-dev.24 (2025-08-20)

### 🚀 Features

- **codegen:** add drive explorer template ([9c27219dc](https://github.com/powerhouse-inc/powerhouse/commit/9c27219dc))
- **connect,reactor-browser:** remove more old electron garbage ([5cd255568](https://github.com/powerhouse-inc/powerhouse/commit/5cd255568))
- **connect:** remove broken electron code ([3f28d6a46](https://github.com/powerhouse-inc/powerhouse/commit/3f28d6a46))
- **reactor-browser,connect,vetra:** move state hooks into reactor browser and eliminate redundant and dead code ([30fa16f1f](https://github.com/powerhouse-inc/powerhouse/commit/30fa16f1f))
- **connect,state,renown:** add state hook for renown ([5beb1252b](https://github.com/powerhouse-inc/powerhouse/commit/5beb1252b))
- **connect:** remove unused dep ([ef492bc7a](https://github.com/powerhouse-inc/powerhouse/commit/ef492bc7a))
- **connect,state,reactor-browser:** eliminate jotai ([53b1ab759](https://github.com/powerhouse-inc/powerhouse/commit/53b1ab759))
- **state:** rename to vetra packages ([c415b7dc2](https://github.com/powerhouse-inc/powerhouse/commit/c415b7dc2))
- **state:** use ph packages atoms ([6421fbeea](https://github.com/powerhouse-inc/powerhouse/commit/6421fbeea))

### 🩹 Fixes

- today claude taught me I could mock a package to fix circular references ([dcb83174c](https://github.com/powerhouse-inc/powerhouse/commit/dcb83174c))
- **monorepo:** numerous build issues ([04349dd25](https://github.com/powerhouse-inc/powerhouse/commit/04349dd25))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.23 (2025-08-19)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.22 (2025-08-15)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.21 (2025-08-15)

### 🚀 Features

- **vetra:** update manifest when new module is added ([#1766](https://github.com/powerhouse-inc/powerhouse/pull/1766))

### 🩹 Fixes

- fixed debug launch configuration now that source maps are in the proper locations ([c75d793ed](https://github.com/powerhouse-inc/powerhouse/commit/c75d793ed))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.20 (2025-08-15)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.19 (2025-08-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.18 (2025-08-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.17 (2025-08-12)

### 🚀 Features

- refactor vetra command and remove vetra deps in connect and reactor ([#1753](https://github.com/powerhouse-inc/powerhouse/pull/1753))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.16 (2025-08-12)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.15 (2025-08-12)

### 🚀 Features

- **reactor-mcp,reactor-api,reactor-local,switchboard,ph-cli:** run mcp on express app ([d51fa590e](https://github.com/powerhouse-inc/powerhouse/commit/d51fa590e))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.14 (2025-08-11)

### 🚀 Features

- update document engineering dep ([54dcee90d](https://github.com/powerhouse-inc/powerhouse/commit/54dcee90d))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.13 (2025-08-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.12 (2025-08-08)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.11 (2025-08-07)

### 🚀 Features

- **switchboard,reactor-local,reactor-api:** moved vite loader to reactor-api package ([c84f0a2a3](https://github.com/powerhouse-inc/powerhouse/commit/c84f0a2a3))
- vetra package documents and app integration ([0e4053302](https://github.com/powerhouse-inc/powerhouse/commit/0e4053302))
- **vetra:** added vetra drive editor ([4ebafd143](https://github.com/powerhouse-inc/powerhouse/commit/4ebafd143))
- integrate package documents into reactor system ([939fe8e80](https://github.com/powerhouse-inc/powerhouse/commit/939fe8e80))
- **connect:** integrate Vetra package documents and editors ([2ecb9bd15](https://github.com/powerhouse-inc/powerhouse/commit/2ecb9bd15))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.10 (2025-08-07)

### 🚀 Features

- **builder-tools,codegen,design-system,reactor-api:** updated document-engineering version ([e74068b43](https://github.com/powerhouse-inc/powerhouse/commit/e74068b43))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.9 (2025-08-07)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.8 (2025-08-06)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.7 (2025-08-06)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.5 (2025-08-05)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.4 (2025-08-02)

### 🚀 Features

- ts morph integration ([#1729](https://github.com/powerhouse-inc/powerhouse/pull/1729))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.3 (2025-08-01)

### 🚀 Features

- **reactor-mcp:** setup of modular reactor tools ([ceab98b08](https://github.com/powerhouse-inc/powerhouse/commit/ceab98b08))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.2 (2025-07-31)

### 🚀 Features

- **reactor-mcp,document/model:** initial implementation of reactor mcp ([4eaab9ab0](https://github.com/powerhouse-inc/powerhouse/commit/4eaab9ab0))

### 🩹 Fixes

- linter issues ([e55a16456](https://github.com/powerhouse-inc/powerhouse/commit/e55a16456))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.1 (2025-07-29)

### 🚀 Features

- added vetra command and vetra project ([#1713](https://github.com/powerhouse-inc/powerhouse/pull/1713))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.0.0-staging.8 (2025-07-29)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.0.0-staging.7 (2025-07-26)

### 🚀 Features

- **state:** make all atom states derivative ([68a4bfece](https://github.com/powerhouse-inc/powerhouse/commit/68a4bfece))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.0.0-staging.6 (2025-07-25)

### 🚀 Features

- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.19 (2025-07-25)

### 🚀 Features

- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.18 (2025-07-24)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.17 (2025-07-23)

### 🩹 Fixes

- **codegen:** revert changes to resolvers template ([b96a7b899](https://github.com/powerhouse-inc/powerhouse/commit/b96a7b899))
- update release notes ([f1b6a8e71](https://github.com/powerhouse-inc/powerhouse/commit/f1b6a8e71))
- add release notes on correct branch ([a2d60a537](https://github.com/powerhouse-inc/powerhouse/commit/a2d60a537))

### ❤️ Thank You

- acaldas
- Callme-T

## 3.3.0-dev.16 (2025-07-22)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.15 (2025-07-17)

### 🩹 Fixes

- **codegen:** updated subgraph template to deal with undefined return on getDocument ([7b2862a91](https://github.com/powerhouse-inc/powerhouse/commit/7b2862a91))

### ❤️ Thank You

- acaldas

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
