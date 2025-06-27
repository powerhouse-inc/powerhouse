## 3.2.0-dev.6 (2025-06-27)

### 🚀 Features

- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))
- updating signing interfaces to connect document-model and connect packages ([e9b64ae77](https://github.com/powerhouse-inc/powerhouse/commit/e9b64ae77))
- on load, discard key pairs that do not match the updated algorithm ([845728953](https://github.com/powerhouse-inc/powerhouse/commit/845728953))
- **common:** add doc comments ([f167e3f1b](https://github.com/powerhouse-inc/powerhouse/commit/f167e3f1b))
- **common:** add readme ([4c97e550d](https://github.com/powerhouse-inc/powerhouse/commit/4c97e550d))
- **common:** add reference links ([915b1ee4a](https://github.com/powerhouse-inc/powerhouse/commit/915b1ee4a))
- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))

### 🩹 Fixes

- fixing lots of unit tests ([91c1d4acf](https://github.com/powerhouse-inc/powerhouse/commit/91c1d4acf))
- header should be same format as all operation timestamps ([554ab41c2](https://github.com/powerhouse-inc/powerhouse/commit/554ab41c2))
- fixing issue with header not being applied to read file ([2e55c2ec2](https://github.com/powerhouse-inc/powerhouse/commit/2e55c2ec2))
- fixing some tests that need to compare state, fixing documentType on empty header creation ([7c6669a12](https://github.com/powerhouse-inc/powerhouse/commit/7c6669a12))
- lots of refactoring for moving header and making id a signature ([5651159e6](https://github.com/powerhouse-inc/powerhouse/commit/5651159e6))
- fix issue where we were creating bad headers ([6c1f7cbd7](https://github.com/powerhouse-inc/powerhouse/commit/6c1f7cbd7))
- baseReducer function needs updated to change header ([2568ea1ce](https://github.com/powerhouse-inc/powerhouse/commit/2568ea1ce))
- fixing document-drive tests, round 1 ([5316e4717](https://github.com/powerhouse-inc/powerhouse/commit/5316e4717))
- fix issue where state should have been compared rather than revisions ([bf33f2c49](https://github.com/powerhouse-inc/powerhouse/commit/bf33f2c49))
- adding some backward compat fixes for document model and document drive ([73d08a5b0](https://github.com/powerhouse-inc/powerhouse/commit/73d08a5b0))
- moving graphql transformations into a shared function so unit tests can reuse them ([68a380eba](https://github.com/powerhouse-inc/powerhouse/commit/68a380eba))
- export issues with header ([8f984d558](https://github.com/powerhouse-inc/powerhouse/commit/8f984d558))
- refactor storage layer to save header appropriately ([eafd9b2b6](https://github.com/powerhouse-inc/powerhouse/commit/eafd9b2b6))
- compile errors in reactor-api ([6274b8b77](https://github.com/powerhouse-inc/powerhouse/commit/6274b8b77))
- compile errors in reactor-browser ([1223c495a](https://github.com/powerhouse-inc/powerhouse/commit/1223c495a))
- compile errors in common package ([9c3e4faa4](https://github.com/powerhouse-inc/powerhouse/commit/9c3e4faa4))
- fixing issue with header rebuilding ([5ac7b91d3](https://github.com/powerhouse-inc/powerhouse/commit/5ac7b91d3))
- prisma had an issue with creation date ([c3e53354a](https://github.com/powerhouse-inc/powerhouse/commit/c3e53354a))
- a few more fixes for unit tests and making storage engines return the same stuff ([224535d66](https://github.com/powerhouse-inc/powerhouse/commit/224535d66))
- massive type bug in core base-server where header and document were conflated ([1960e1b01](https://github.com/powerhouse-inc/powerhouse/commit/1960e1b01))
- test all storage adapters with drive operations ([ceb4e8288](https://github.com/powerhouse-inc/powerhouse/commit/ceb4e8288))
- prisma should use update instead of updateMany for operations ([de2e17992](https://github.com/powerhouse-inc/powerhouse/commit/de2e17992))
- revert some bad changes to the core reducer ([d01050a73](https://github.com/powerhouse-inc/powerhouse/commit/d01050a73))
- conflict resolution should be tested on all storage layers since this is an integration test ([b58142dd7](https://github.com/powerhouse-inc/powerhouse/commit/b58142dd7))
- fix issues with signature migration tests ([5477f0388](https://github.com/powerhouse-inc/powerhouse/commit/5477f0388))
- graphql test fix now that id is on header ([6ccadb6c2](https://github.com/powerhouse-inc/powerhouse/commit/6ccadb6c2))
- backward compat fix ([3e31c429f](https://github.com/powerhouse-inc/powerhouse/commit/3e31c429f))
- goodby documentheader and thanks for all the fish ([214c6ba6c](https://github.com/powerhouse-inc/powerhouse/commit/214c6ba6c))
- did parsing is different with Ed25519 keys ([2f581ca35](https://github.com/powerhouse-inc/powerhouse/commit/2f581ca35))
- renaming parseDid to generateDid ([8bbc28ddd](https://github.com/powerhouse-inc/powerhouse/commit/8bbc28ddd))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))
- linting issues ([e7bd4117d](https://github.com/powerhouse-inc/powerhouse/commit/e7bd4117d))
- vitest issue with timers ([0fe5a125d](https://github.com/powerhouse-inc/powerhouse/commit/0fe5a125d))
- linter fixes ([197079a9a](https://github.com/powerhouse-inc/powerhouse/commit/197079a9a))
- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- **common:** fixing build and linter issues ([ef05830a4](https://github.com/powerhouse-inc/powerhouse/commit/ef05830a4))
- **connect:** added feature flag for diffs analytics ([161a3203b](https://github.com/powerhouse-inc/powerhouse/commit/161a3203b))
- **reactor-browser:** do not subscribe to query dimensions and debounce refetches triggered by subscriptions ([f6497eb30](https://github.com/powerhouse-inc/powerhouse/commit/f6497eb30))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente
- Guillermo Puente Sandoval
- ryanwolhuter

## 3.2.0-dev.5 (2025-06-26)

### 🚀 Features

- added document analytics processor ([2178e302d](https://github.com/powerhouse-inc/powerhouse/commit/2178e302d))
- **common:** add atoms library ([dbc8e8b44](https://github.com/powerhouse-inc/powerhouse/commit/dbc8e8b44))

### 🩹 Fixes

- adding id/slug resolution to document storage ([0c611fb1b](https://github.com/powerhouse-inc/powerhouse/commit/0c611fb1b))
- added new events for operations added ([7d89701b8](https://github.com/powerhouse-inc/powerhouse/commit/7d89701b8))
- **codegen:** update snapshot ([f77a6c03c](https://github.com/powerhouse-inc/powerhouse/commit/f77a6c03c))
- **common,design-system,reactor-browser:** fix drag and drop on generic drive explorer ([9b5113e74](https://github.com/powerhouse-inc/powerhouse/commit/9b5113e74))
- **connect,codegen,common,reactor-browser:** fix analytics query subscription ([6e9729739](https://github.com/powerhouse-inc/powerhouse/commit/6e9729739))
- **document-drive:** safer check for document.slug ([15883aa34](https://github.com/powerhouse-inc/powerhouse/commit/15883aa34))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente
- ryanwolhuter

## 3.2.0-dev.4 (2025-06-25)

### 🚀 Features

- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 3.2.0-dev.3 (2025-06-24)

### 🩹 Fixes

- moving prisma copy to prebuild so that build failure doesn't cause more build failure ([11df37b55](https://github.com/powerhouse-inc/powerhouse/commit/11df37b55))
- **connect, builder-tools:** disable external packages in dev mode ([e13243874](https://github.com/powerhouse-inc/powerhouse/commit/e13243874))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 3.2.0-dev.2 (2025-06-20)

### 🩹 Fixes

- **connect,builder-tools:** serve files at the root on nginx and enforce trailing slash on <base href> ([3c53390f6](https://github.com/powerhouse-inc/powerhouse/commit/3c53390f6))

### ❤️ Thank You

- acaldas @acaldas

## 3.2.0-dev.1 (2025-06-19)

### 🩹 Fixes

- **connect,builder-tools:** support base paths without ending slash ([1ee6d9d9f](https://github.com/powerhouse-inc/powerhouse/commit/1ee6d9d9f))

### ❤️ Thank You

- acaldas @acaldas

## 3.2.0-dev.0 (2025-06-18)

### 🚀 Features

- use document model subgraph when clicking on switchboard url button ([24cf6ad94](https://github.com/powerhouse-inc/powerhouse/commit/24cf6ad94))

### 🩹 Fixes

- (wip) remove reactor dependency from useSwitchboard ([88efbf957](https://github.com/powerhouse-inc/powerhouse/commit/88efbf957))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.41 (2025-06-18)

### 🩹 Fixes

- **builder-tools:** add base tag to the start of the head element in the connect prod html ([c84dcd458](https://github.com/powerhouse-inc/powerhouse/commit/c84dcd458))
- **connect:** remove redirect ([d1605708b](https://github.com/powerhouse-inc/powerhouse/commit/d1605708b))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 2.5.0-dev.40 (2025-06-18)

### 🩹 Fixes

- **connect:** nginx config ([db59bb69c](https://github.com/powerhouse-inc/powerhouse/commit/db59bb69c))

### ❤️ Thank You

- Frank

## 2.5.0-dev.39 (2025-06-18)

### 🩹 Fixes

- **connect:** redirect ([6729ec934](https://github.com/powerhouse-inc/powerhouse/commit/6729ec934))

### ❤️ Thank You

- Frank

## 2.5.0-dev.38 (2025-06-18)

### 🩹 Fixes

- **connect:** redirect to trailing slash ([b3df4e795](https://github.com/powerhouse-inc/powerhouse/commit/b3df4e795))

### ❤️ Thank You

- Frank

## 2.5.0-dev.37 (2025-06-18)

### 🚀 Features

- **connect:** redirect to proper base path ([9a24e5311](https://github.com/powerhouse-inc/powerhouse/commit/9a24e5311))
- **connect:** added cache control header ([ec9397e57](https://github.com/powerhouse-inc/powerhouse/commit/ec9397e57))

### ❤️ Thank You

- Frank

## 2.5.0-dev.36 (2025-06-18)

### 🩹 Fixes

- **connect:** assets not found ([92ec79305](https://github.com/powerhouse-inc/powerhouse/commit/92ec79305))

### ❤️ Thank You

- Frank

## 2.5.0-dev.35 (2025-06-18)

### 🩹 Fixes

- **builder-tools:** use relative path for external-packages.css ([e41a46b94](https://github.com/powerhouse-inc/powerhouse/commit/e41a46b94))
- **codegen:** removed stray import ([539cd017d](https://github.com/powerhouse-inc/powerhouse/commit/539cd017d))
- **connect:** nginx base path ([42428c4ae](https://github.com/powerhouse-inc/powerhouse/commit/42428c4ae))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 2.5.0-dev.34 (2025-06-18)

### 🚀 Features

- **connect:** added base path for nginx ([fd809c593](https://github.com/powerhouse-inc/powerhouse/commit/fd809c593))

### ❤️ Thank You

- Frank

## 2.5.0-dev.33 (2025-06-18)

### 🚀 Features

- **reactor:** added repository url to package.json ([662c90e89](https://github.com/powerhouse-inc/powerhouse/commit/662c90e89))

### 🩹 Fixes

- deploy powerhouse to available environments ([a45859a22](https://github.com/powerhouse-inc/powerhouse/commit/a45859a22))
- deploy not on push to main ([63eef7020](https://github.com/powerhouse-inc/powerhouse/commit/63eef7020))

### ❤️ Thank You

- Frank

## 2.5.0-dev.32 (2025-06-18)

### 🚀 Features

- **connect:** added support for basepath ([1d5d3580f](https://github.com/powerhouse-inc/powerhouse/commit/1d5d3580f))

### ❤️ Thank You

- Frank

## 2.5.0-dev.31 (2025-06-18)

### 🚀 Features

- **connect:** use relative imports and rely on <base href> ([fa9eba139](https://github.com/powerhouse-inc/powerhouse/commit/fa9eba139))
- **connect,builder-tools,ph-cli:** added support for path argument on ph connect build and preview ([fe049aae8](https://github.com/powerhouse-inc/powerhouse/commit/fe049aae8))
- **reactor:** initial event-bus implementation with tests and benchmarks ([ef5b3c42e](https://github.com/powerhouse-inc/powerhouse/commit/ef5b3c42e))
- **reactor:** job executor and queue implementations and tests ([c74bbc712](https://github.com/powerhouse-inc/powerhouse/commit/c74bbc712))
- **reactor:** proof-of-concept benchmarks for queue->event->job execution flow ([c297618b9](https://github.com/powerhouse-inc/powerhouse/commit/c297618b9))

### 🩹 Fixes

- **builder-tools:** enforce trailing slash on base path and read BASE_PATH env variable correctly ([93beeb00c](https://github.com/powerhouse-inc/powerhouse/commit/93beeb00c))
- **connect:** remove trailing slash from basepath when setting analytics database name ([7901889e2](https://github.com/powerhouse-inc/powerhouse/commit/7901889e2))
- **connect, design-system:** each list entry should have key field ([bf218c74c](https://github.com/powerhouse-inc/powerhouse/commit/bf218c74c))
- **ph-cli:** install and uninstall packages with and without version tag ([c2a4ad13f](https://github.com/powerhouse-inc/powerhouse/commit/c2a4ad13f))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank

## 2.5.0-dev.30 (2025-06-17)

### 🩹 Fixes

- **codegen:** remove unnecessary docId from subgraph resolvers ([7217cd2d9](https://github.com/powerhouse-inc/powerhouse/commit/7217cd2d9))
- **connect:** set proper tag on docker build ([598c1b3fb](https://github.com/powerhouse-inc/powerhouse/commit/598c1b3fb))

### ❤️ Thank You

- Frank

## 2.5.0-dev.29 (2025-06-17)

### 🚀 Features

- removed scalars components ([#1574](https://github.com/powerhouse-inc/powerhouse/pull/1574))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 2.5.0-dev.28 (2025-06-16)

### 🚀 Features

- add app skeleton to html at build time ([1882bb820](https://github.com/powerhouse-inc/powerhouse/commit/1882bb820))

### 🩹 Fixes

- **document-drive:** ensure valid slug assignment in BrowserStorage ([891df972a](https://github.com/powerhouse-inc/powerhouse/commit/891df972a))

### 🔥 Performance

- bundle and accessibility improvements ([94ef22345](https://github.com/powerhouse-inc/powerhouse/commit/94ef22345))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 2.5.0-dev.27 (2025-06-16)

### 🚀 Features

- **connect:** eol ([42db87eb0](https://github.com/powerhouse-inc/powerhouse/commit/42db87eb0))

### ❤️ Thank You

- Frank

## 2.5.0-dev.26 (2025-06-16)

### 🚀 Features

- **connect:** updated readme ([0c34d6cc6](https://github.com/powerhouse-inc/powerhouse/commit/0c34d6cc6))

### ❤️ Thank You

- Frank

## 2.5.0-dev.25 (2025-06-13)

### 🚀 Features

- start dependent services with switchboard ([188c82c6a](https://github.com/powerhouse-inc/powerhouse/commit/188c82c6a))

### 🩹 Fixes

- **docker:** request write permissions ([29d4d3fd7](https://github.com/powerhouse-inc/powerhouse/commit/29d4d3fd7))

### ❤️ Thank You

- Frank

## 2.5.0-dev.24 (2025-06-13)

### 🚀 Features

- added hostnames in docker compose ([a590eea17](https://github.com/powerhouse-inc/powerhouse/commit/a590eea17))
- **ci:** build and publish docker images on newly created tags ([ee930c4a4](https://github.com/powerhouse-inc/powerhouse/commit/ee930c4a4))
- **docker-compose:** work with published images ([9f31b70fb](https://github.com/powerhouse-inc/powerhouse/commit/9f31b70fb))

### 🩹 Fixes

- **switchboard:** entrypoint script ([a50e5eb06](https://github.com/powerhouse-inc/powerhouse/commit/a50e5eb06))

### ❤️ Thank You

- Frank

## 2.5.0-dev.23 (2025-06-13)

### 🩹 Fixes

- **switchboard:** added semicolons ([ce23c47f0](https://github.com/powerhouse-inc/powerhouse/commit/ce23c47f0))

### ❤️ Thank You

- Frank

## 2.5.0-dev.22 (2025-06-13)

### 🩹 Fixes

- **ci:** connect deployment ([8ac8e423b](https://github.com/powerhouse-inc/powerhouse/commit/8ac8e423b))
- **ci:** set proper tags for docker images ([3cab91969](https://github.com/powerhouse-inc/powerhouse/commit/3cab91969))

### ❤️ Thank You

- Frank

## 2.5.0-dev.21 (2025-06-12)

### 🩹 Fixes

- **builder-tools:** add function to find vite-plugin-node-polyfills directory ([9cba2bf41](https://github.com/powerhouse-inc/powerhouse/commit/9cba2bf41))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 2.5.0-dev.20 (2025-06-12)

### 🚀 Features

- **codegen:** updated editor template ([e2d654238](https://github.com/powerhouse-inc/powerhouse/commit/e2d654238))

### 🩹 Fixes

- --tag option definition on ph init ([2c8ec8823](https://github.com/powerhouse-inc/powerhouse/commit/2c8ec8823))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 2.5.0-dev.19 (2025-06-12)

### 🚀 Features

- **ph-cmd:** support --tag on ph init ([7912ab760](https://github.com/powerhouse-inc/powerhouse/commit/7912ab760))

### 🩹 Fixes

- ph connect build tweaks ([64058dbb6](https://github.com/powerhouse-inc/powerhouse/commit/64058dbb6))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.18 (2025-06-12)

### 🚀 Features

- added docker publish workflow ([adf65ef8a](https://github.com/powerhouse-inc/powerhouse/commit/adf65ef8a))
- **connect:** dockerfile based on ph-cmd install ([548e3228d](https://github.com/powerhouse-inc/powerhouse/commit/548e3228d))

### ❤️ Thank You

- Frank

## 2.5.0-dev.17 (2025-06-12)

### 🚀 Features

- use fixed versions of react to make use of caching ([26d8ebf72](https://github.com/powerhouse-inc/powerhouse/commit/26d8ebf72))
- show app skeleton while loading and accessibility fixes ([4f96e2472](https://github.com/powerhouse-inc/powerhouse/commit/4f96e2472))
- show cookie banner while loading app ([48ad9a8ad](https://github.com/powerhouse-inc/powerhouse/commit/48ad9a8ad))
- **connect:** update react version ([37c5beb43](https://github.com/powerhouse-inc/powerhouse/commit/37c5beb43))

### 🩹 Fixes

- sync localStorage based hooks with useSyncExternalStore ([be05d434a](https://github.com/powerhouse-inc/powerhouse/commit/be05d434a))
- **connect:** fix reactor not loaded error ([13e80e4bc](https://github.com/powerhouse-inc/powerhouse/commit/13e80e4bc))

### 🔥 Performance

- **connect:** added compressed avif for background image ([1c31889dd](https://github.com/powerhouse-inc/powerhouse/commit/1c31889dd))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.16 (2025-06-11)

### 🩹 Fixes

- **ph-cli:** remove connect build dir before building new one ([0b2ef09ee](https://github.com/powerhouse-inc/powerhouse/commit/0b2ef09ee))

### ❤️ Thank You

- Frank

## 2.5.0-dev.15 (2025-06-11)

### 🩹 Fixes

- **builder-tools:** polyfill process on connect build ([3b1079fe2](https://github.com/powerhouse-inc/powerhouse/commit/3b1079fe2))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.14 (2025-06-10)

### 🚀 Features

- improved analytics frontend integration ([269aed50c](https://github.com/powerhouse-inc/powerhouse/commit/269aed50c))

### 🩹 Fixes

- **builder-tools:** added node polyfills to studio build ([1d0fe1949](https://github.com/powerhouse-inc/powerhouse/commit/1d0fe1949))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.13 (2025-06-10)

### 🩹 Fixes

- **ph-cli:** proxy pass to proper switchboard instance ([0cd8a2be0](https://github.com/powerhouse-inc/powerhouse/commit/0cd8a2be0))

### ❤️ Thank You

- Frank

## 2.5.0-dev.12 (2025-06-10)

### 🩹 Fixes

- **document-drive:** queue strands to be transmitted to internal transmitters to avoid concurrency issues ([685e84483](https://github.com/powerhouse-inc/powerhouse/commit/685e84483))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.11 (2025-06-07)

### 🚀 Features

- **connect:** updated diff-analyzer processor ([ce5d1219f](https://github.com/powerhouse-inc/powerhouse/commit/ce5d1219f))

### 🩹 Fixes

- connect page load improvements ([addbb82d1](https://github.com/powerhouse-inc/powerhouse/commit/addbb82d1))
- analytics bundling ([5cca0d3bf](https://github.com/powerhouse-inc/powerhouse/commit/5cca0d3bf))
- **connect:** fixed waitForRenown timeout ([9bd3c4246](https://github.com/powerhouse-inc/powerhouse/commit/9bd3c4246))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.10 (2025-06-06)

### 🚀 Features

- run analytics db on web worker ([ecf79575f](https://github.com/powerhouse-inc/powerhouse/commit/ecf79575f))

### 🩹 Fixes

- **document-drive:** build internal transmitter updates without blocking the event loop ([01ec364b7](https://github.com/powerhouse-inc/powerhouse/commit/01ec364b7))
- **ph-cli:** duplicate gzip ([f74631ca8](https://github.com/powerhouse-inc/powerhouse/commit/f74631ca8))
- **ph-cli:** broken ci? ([bff9ca494](https://github.com/powerhouse-inc/powerhouse/commit/bff9ca494))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 2.5.0-dev.9 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** compression with multiple server blocks ([32728ad03](https://github.com/powerhouse-inc/powerhouse/commit/32728ad03))

### ❤️ Thank You

- Frank

## 2.5.0-dev.8 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** brotli compression on 2nd project ([9fde76a1c](https://github.com/powerhouse-inc/powerhouse/commit/9fde76a1c))

### ❤️ Thank You

- Frank

## 2.5.0-dev.7 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** added acme challenge ([38a20179d](https://github.com/powerhouse-inc/powerhouse/commit/38a20179d))

### ❤️ Thank You

- Frank

## 2.5.0-dev.6 (2025-06-05)

### 🩹 Fixes

- set node 22 in release branch workflow ([b33681938](https://github.com/powerhouse-inc/powerhouse/commit/b33681938))
- **ph-cli:** ssl in nginx ([5079d5479](https://github.com/powerhouse-inc/powerhouse/commit/5079d5479))

### ❤️ Thank You

- Frank

## 2.5.0-dev.5 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** duplicate brotli configurations ([32865bf99](https://github.com/powerhouse-inc/powerhouse/commit/32865bf99))

### ❤️ Thank You

- Frank

## 2.5.0-dev.4 (2025-06-05)

### 🩹 Fixes

- **builder-tools:** move esbuild dev dep to deps ([baa22be6f](https://github.com/powerhouse-inc/powerhouse/commit/baa22be6f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.3 (2025-06-05)

### 🚀 Features

- **builder-tools:** add node polyfills esbuild plugin for connect build ([43dd16b4d](https://github.com/powerhouse-inc/powerhouse/commit/43dd16b4d))

### 🩹 Fixes

- **ph-cli:** gzip compression ([d0d56f851](https://github.com/powerhouse-inc/powerhouse/commit/d0d56f851))

### ❤️ Thank You

- Frank
- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.2 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** brotli packages ([ede2fe16d](https://github.com/powerhouse-inc/powerhouse/commit/ede2fe16d))

### ❤️ Thank You

- Frank

## 2.5.0-dev.1 (2025-06-05)

### 🚀 Features

- **ph-cli:** added brotli and gzip compression to nginx ([f631747d3](https://github.com/powerhouse-inc/powerhouse/commit/f631747d3))

### ❤️ Thank You

- Frank

## 2.5.0-dev.0 (2025-06-04)

### 🚀 Features

- added sky-atlas-staging ([ac1658ce9](https://github.com/powerhouse-inc/powerhouse/commit/ac1658ce9))
- improved help commands and information for clis ([755a18f9e](https://github.com/powerhouse-inc/powerhouse/commit/755a18f9e))
- add version generation script and update CLI version handling ([66c4d98c0](https://github.com/powerhouse-inc/powerhouse/commit/66c4d98c0))
- add getDocumentModelModule and getEditor props to drive explorer ([a40f5e6a2](https://github.com/powerhouse-inc/powerhouse/commit/a40f5e6a2))
- added setup environment tutorial ([2b3e80642](https://github.com/powerhouse-inc/powerhouse/commit/2b3e80642))
- removed scalars dependencies ([596aedbd5](https://github.com/powerhouse-inc/powerhouse/commit/596aedbd5))
- enabled switchboard command ([5a9c467bf](https://github.com/powerhouse-inc/powerhouse/commit/5a9c467bf))
- add switchboard command documentation ([41f3542e5](https://github.com/powerhouse-inc/powerhouse/commit/41f3542e5))
- removed scalars package ([d6f7059a7](https://github.com/powerhouse-inc/powerhouse/commit/d6f7059a7))
- remove JWT handler on logout ([9c6c32015](https://github.com/powerhouse-inc/powerhouse/commit/9c6c32015))
- set JWT handlers in useLogin ([30a25a4c0](https://github.com/powerhouse-inc/powerhouse/commit/30a25a4c0))
- enforce conventional commits ([faa49da40](https://github.com/powerhouse-inc/powerhouse/commit/faa49da40))
- **academy:** added authorization docs ([470231bfd](https://github.com/powerhouse-inc/powerhouse/commit/470231bfd))
- **academy:** centralize husky & auto-update cli docs ([8c92e0bb1](https://github.com/powerhouse-inc/powerhouse/commit/8c92e0bb1))
- **builder-tools:** fix wrong value used for field id ([a6c6142e0](https://github.com/powerhouse-inc/powerhouse/commit/a6c6142e0))
- **builder-tools:** remove redundant helpers ([0f82c2d1f](https://github.com/powerhouse-inc/powerhouse/commit/0f82c2d1f))
- **builder-tools:** handle recursive objects in initial state generator ([c9eedcc43](https://github.com/powerhouse-inc/powerhouse/commit/c9eedcc43))
- **builder-tools:** added readme ([e5ffe3139](https://github.com/powerhouse-inc/powerhouse/commit/e5ffe3139))
- **builder-tools:** make external packages file live in connect build dir ([6014ded73](https://github.com/powerhouse-inc/powerhouse/commit/6014ded73))
- **config:** added switchboard auth ([3437c4835](https://github.com/powerhouse-inc/powerhouse/commit/3437c4835))
- **config:** added new switchboard params ([80cd1e43a](https://github.com/powerhouse-inc/powerhouse/commit/80cd1e43a))
- **connect:** send authorization token with each request ([fee2916e6](https://github.com/powerhouse-inc/powerhouse/commit/fee2916e6))
- **connect:** wait for renown initialization before start the reactor ([a301acb15](https://github.com/powerhouse-inc/powerhouse/commit/a301acb15))
- **connect:** remove file node document and ui nodes context from hook ([ecaa84fe5](https://github.com/powerhouse-inc/powerhouse/commit/ecaa84fe5))
- **connect:** remove user permissions and selected document drive from hook ([c1c85e947](https://github.com/powerhouse-inc/powerhouse/commit/c1c85e947))
- **connect:** remove node options and document models from hook ([877094c8e](https://github.com/powerhouse-inc/powerhouse/commit/877094c8e))
- **connect:** remove drive nodes by sharing type from hook ([3f12bd2a4](https://github.com/powerhouse-inc/powerhouse/commit/3f12bd2a4))
- **connect:** remove modal and debug handlers from hook ([9c6d26ef9](https://github.com/powerhouse-inc/powerhouse/commit/9c6d26ef9))
- **connect:** use explicit props for ui nodes values ([ad1a40806](https://github.com/powerhouse-inc/powerhouse/commit/ad1a40806))
- **connect:** added PH_CONNECT_DISABLE_ADD_DRIVE env var ([7445ebe1d](https://github.com/powerhouse-inc/powerhouse/commit/7445ebe1d))
- **connect:** use of new switchboard hook ([4dc99b453](https://github.com/powerhouse-inc/powerhouse/commit/4dc99b453))
- **design-system:** remove new folder default dropdown option ([6b61d5efa](https://github.com/powerhouse-inc/powerhouse/commit/6b61d5efa))
- **document-drive:** regenerated document drive model ([9819d8481](https://github.com/powerhouse-inc/powerhouse/commit/9819d8481))
- **document-drive:** use bearer token if handler is set ([dbdf025a8](https://github.com/powerhouse-inc/powerhouse/commit/dbdf025a8))
- **document-drive:** made defaultDrives optional on reactor options ([566791c56](https://github.com/powerhouse-inc/powerhouse/commit/566791c56))
- **monorepo:** regenerate lockfile ([a6c390b4e](https://github.com/powerhouse-inc/powerhouse/commit/a6c390b4e))
- **monorepo:** handle updating monorepo build deps ([db2ac2316](https://github.com/powerhouse-inc/powerhouse/commit/db2ac2316))
- **monorepo:** bump graphql lib ([ba9d5d338](https://github.com/powerhouse-inc/powerhouse/commit/ba9d5d338))
- **ph-cli:** add --base-path option for API endpoint configuration ([efc533a97](https://github.com/powerhouse-inc/powerhouse/commit/efc533a97))
- **ph-cli:** improved readme ([85eb76808](https://github.com/powerhouse-inc/powerhouse/commit/85eb76808))
- **ph-cli:** added setup-service command ([dfa082aa6](https://github.com/powerhouse-inc/powerhouse/commit/dfa082aa6))
- **ph-cli:** improved setup environment script with checks and features ([bf60911af](https://github.com/powerhouse-inc/powerhouse/commit/bf60911af))
- **ph-cli:** added manage environment script ([2f70b27cb](https://github.com/powerhouse-inc/powerhouse/commit/2f70b27cb))
- **ph-cli:** improved service status output ([ca31a0d78](https://github.com/powerhouse-inc/powerhouse/commit/ca31a0d78))
- **ph-cmd:** added staging env and --force option ([ef5a9695c](https://github.com/powerhouse-inc/powerhouse/commit/ef5a9695c))
- **ph-cmd:** update version command help text ([ffe8ff397](https://github.com/powerhouse-inc/powerhouse/commit/ffe8ff397))
- **ph-cmd:** fix version command for global projects ([8792434b1](https://github.com/powerhouse-inc/powerhouse/commit/8792434b1))
- **ph-cmd:** add "switchboard" to the PACKAGES list in use command ([ab98cec4f](https://github.com/powerhouse-inc/powerhouse/commit/ab98cec4f))
- **ph-cmd:** improved readme ([fbc325779](https://github.com/powerhouse-inc/powerhouse/commit/fbc325779))
- **ph-cmd:** added version command ([2c7145eba](https://github.com/powerhouse-inc/powerhouse/commit/2c7145eba))
- **reactor:** added auth headers for pull responder and switchboard push ([89ad3b111](https://github.com/powerhouse-inc/powerhouse/commit/89ad3b111))
- **reactor:** added optional headers param to requestPublicDrive ([24f2aeab2](https://github.com/powerhouse-inc/powerhouse/commit/24f2aeab2))
- **reactor-api:** removed auth subgraph and added new auth implementation part1 ([55e54aa10](https://github.com/powerhouse-inc/powerhouse/commit/55e54aa10))
- **reactor-api,reactor-local:** updated analytics dependencies ([cbeace573](https://github.com/powerhouse-inc/powerhouse/commit/cbeace573))
- **reactor-api,reactor-local,switchboard:** wait initial timeout before start listening to requests ([409f1e316](https://github.com/powerhouse-inc/powerhouse/commit/409f1e316))
- **reactor-browser:** handle duplicate node where parent is drive ([bedf4818a](https://github.com/powerhouse-inc/powerhouse/commit/bedf4818a))
- **reactor-browser:** added useSwitchboard hook ([eeab8e9b2](https://github.com/powerhouse-inc/powerhouse/commit/eeab8e9b2))
- **renown:** added create and verify Bearer token functions ([d5e404084](https://github.com/powerhouse-inc/powerhouse/commit/d5e404084))
- **renown:** output js build ([d93a3111a](https://github.com/powerhouse-inc/powerhouse/commit/d93a3111a))
- **renown:** added getIssuer helper ([f1eaf9376](https://github.com/powerhouse-inc/powerhouse/commit/f1eaf9376))
- **scripts:** updated setup scripts ([9f7fa7644](https://github.com/powerhouse-inc/powerhouse/commit/9f7fa7644))
- **switchboard:** added authenticated user and role check to graphql context ([8c5699998](https://github.com/powerhouse-inc/powerhouse/commit/8c5699998))
- **switchboard:** added authentication middleware ([7cab35e96](https://github.com/powerhouse-inc/powerhouse/commit/7cab35e96))
- **switchboard:** added auth params from powerhouse config ([5ad2becdd](https://github.com/powerhouse-inc/powerhouse/commit/5ad2becdd))
- **switchboard:** new dockerfile based on ph-cmd ([fafff7143](https://github.com/powerhouse-inc/powerhouse/commit/fafff7143))
- **switchboard:** deploy with new dockerfile ([54f65af17](https://github.com/powerhouse-inc/powerhouse/commit/54f65af17))
- **switchboard, connect:** auth list with eth addresses ([c61a36108](https://github.com/powerhouse-inc/powerhouse/commit/c61a36108))

### 🩹 Fixes

- remove filter ([842a93a75](https://github.com/powerhouse-inc/powerhouse/commit/842a93a75))
- made ph packages env var ([df93611b7](https://github.com/powerhouse-inc/powerhouse/commit/df93611b7))
- remove .env and add to .gitignore ([0d2d48684](https://github.com/powerhouse-inc/powerhouse/commit/0d2d48684))
- docker build with PH_PACKAGES ([856ac1187](https://github.com/powerhouse-inc/powerhouse/commit/856ac1187))
- added missing dep to academy ([4ec6c8278](https://github.com/powerhouse-inc/powerhouse/commit/4ec6c8278))
- **academy:** deployment ([36e5f194d](https://github.com/powerhouse-inc/powerhouse/commit/36e5f194d))
- **academy:** clean up husky script ([e18e26cd8](https://github.com/powerhouse-inc/powerhouse/commit/e18e26cd8))
- **academy:** fix frozen lockfile issue ([bfc3dcd21](https://github.com/powerhouse-inc/powerhouse/commit/bfc3dcd21))
- **academy:** fix frozen lockfile issue' ([80f18ec73](https://github.com/powerhouse-inc/powerhouse/commit/80f18ec73))
- **academy:** lockfile issue second time' ([6208fe614](https://github.com/powerhouse-inc/powerhouse/commit/6208fe614))
- **academy:** docker build ([58e83be09](https://github.com/powerhouse-inc/powerhouse/commit/58e83be09))
- **auth:** some error handling ([1b3d6a38d](https://github.com/powerhouse-inc/powerhouse/commit/1b3d6a38d))
- **builder-tools:** replace usages of isDocumentString graphql tool ([3e12cfc93](https://github.com/powerhouse-inc/powerhouse/commit/3e12cfc93))
- **builder-tools,design-system:** removed ts references to scalars ([48af32702](https://github.com/powerhouse-inc/powerhouse/commit/48af32702))
- **codegen:** use with instead of assert ([b1685d492](https://github.com/powerhouse-inc/powerhouse/commit/b1685d492))
- **codegen:** subgraphs export type ([fa8eb8810](https://github.com/powerhouse-inc/powerhouse/commit/fa8eb8810))
- **codegen:** subgraph resolvers type ([1054400fa](https://github.com/powerhouse-inc/powerhouse/commit/1054400fa))
- **connect:** update default atlas switchboard url ([8cc09a8f9](https://github.com/powerhouse-inc/powerhouse/commit/8cc09a8f9))
- **connect:** correct atlas switchboard url ([7a76ba1e7](https://github.com/powerhouse-inc/powerhouse/commit/7a76ba1e7))
- **connect:** use static entry point for external-packages.js so it can be overriden by studio ([36c9557eb](https://github.com/powerhouse-inc/powerhouse/commit/36c9557eb))
- **connect:** navigate to home screen and reload after clearing storage ([1714782d7](https://github.com/powerhouse-inc/powerhouse/commit/1714782d7))
- **connect:** wait for local drive to be created on initial setup ([3935179b2](https://github.com/powerhouse-inc/powerhouse/commit/3935179b2))
- **connect:** redirect to homepage if drive doesn't exist ([958313f32](https://github.com/powerhouse-inc/powerhouse/commit/958313f32))
- **connect:** useAsyncReactor was not getting the reactor value ([933e343ee](https://github.com/powerhouse-inc/powerhouse/commit/933e343ee))
- **connect:** build issues ([3d3aafbad](https://github.com/powerhouse-inc/powerhouse/commit/3d3aafbad))
- **connect:** disable add drive flag ([4cc0cac3c](https://github.com/powerhouse-inc/powerhouse/commit/4cc0cac3c))
- **connect, switchboard:** signing and verification issues ([3aa76e9e6](https://github.com/powerhouse-inc/powerhouse/commit/3aa76e9e6))
- **document-drive:** delete drive slug when drive is deleted ([fa1a05509](https://github.com/powerhouse-inc/powerhouse/commit/fa1a05509))
- **document-drive:** fix type issue on browser storage ([240a78b41](https://github.com/powerhouse-inc/powerhouse/commit/240a78b41))
- **document-drive:** do not use read mode if no access level is set ([f8a3c0dcf](https://github.com/powerhouse-inc/powerhouse/commit/f8a3c0dcf))
- **document-drive:** fixed fetchDocument graphql query ([b3fc988e8](https://github.com/powerhouse-inc/powerhouse/commit/b3fc988e8))
- **ph-cli:** ph add does not remove installed packages ([aedfbf56e](https://github.com/powerhouse-inc/powerhouse/commit/aedfbf56e))
- **ph-cli:** fixed merge conflict ([d1a666d6e](https://github.com/powerhouse-inc/powerhouse/commit/d1a666d6e))
- **ph-cli:** optimize ph init, build connect after installing packages and do not install switchboard ([2cf986320](https://github.com/powerhouse-inc/powerhouse/commit/2cf986320))
- **ph-cli:** setup-environment fixes on windows script ([314b4c241](https://github.com/powerhouse-inc/powerhouse/commit/314b4c241))
- **ph-cli:** improved service command ([fe740599f](https://github.com/powerhouse-inc/powerhouse/commit/fe740599f))
- **ph-cli:** script paths ([041030185](https://github.com/powerhouse-inc/powerhouse/commit/041030185))
- **ph-cli:** remove project init from service setup ([110f141ab](https://github.com/powerhouse-inc/powerhouse/commit/110f141ab))
- **ph-cli:** manage environment arguments ([2d76c9659](https://github.com/powerhouse-inc/powerhouse/commit/2d76c9659))
- **ph-cli:** check for database configuration ([db07a8f68](https://github.com/powerhouse-inc/powerhouse/commit/db07a8f68))
- **ph-cli:** check setup issues with project dir ([e4ab93798](https://github.com/powerhouse-inc/powerhouse/commit/e4ab93798))
- **ph-cli:** projectpath in nginx location ([b570973f3](https://github.com/powerhouse-inc/powerhouse/commit/b570973f3))
- **ph-cli:** added restart to allowed service actions ([c4e299a2d](https://github.com/powerhouse-inc/powerhouse/commit/c4e299a2d))
- **ph-cli:** permissions for nginx to access connect build ([3d6918b23](https://github.com/powerhouse-inc/powerhouse/commit/3d6918b23))
- **ph-cli:** nginx permission denied ([40bfbe75f](https://github.com/powerhouse-inc/powerhouse/commit/40bfbe75f))
- **ph-cli:** mem and uptime stats for connect ([72859691f](https://github.com/powerhouse-inc/powerhouse/commit/72859691f))
- **ph-cli:** hyphens not allowed in db name ([9948a2063](https://github.com/powerhouse-inc/powerhouse/commit/9948a2063))
- **ph-cli:** db name generation ([e885e108a](https://github.com/powerhouse-inc/powerhouse/commit/e885e108a))
- **ph-cli:** db name when projectname starts with a dot ([3da84dce2](https://github.com/powerhouse-inc/powerhouse/commit/3da84dce2))
- **ph-cmd:** fixed options check ([ddd206e90](https://github.com/powerhouse-inc/powerhouse/commit/ddd206e90))
- **ph-cmd:** update mocked test return values for getProjectInfo ([31793d503](https://github.com/powerhouse-inc/powerhouse/commit/31793d503))
- **ph-cmd:** postinstall script ([8197db5ee](https://github.com/powerhouse-inc/powerhouse/commit/8197db5ee))
- **ph-cmd:** handle help command when no global project is available ([62d64e06a](https://github.com/powerhouse-inc/powerhouse/commit/62d64e06a))
- **ph-cmd:** update ph-cmd description ([17ece8bb3](https://github.com/powerhouse-inc/powerhouse/commit/17ece8bb3))
- **ph-cmd:** simplify command handling with help utilities ([97aa888cd](https://github.com/powerhouse-inc/powerhouse/commit/97aa888cd))
- **ph-cmd:** enhance project initialization by defaulting package manager used in global installation ([d6de20249](https://github.com/powerhouse-inc/powerhouse/commit/d6de20249))
- **ph-cmd:** improve error handling for version command and output ([5f3cc44b8](https://github.com/powerhouse-inc/powerhouse/commit/5f3cc44b8))
- **ph-cmd:** use tag as versions in project package.json ([c543a9d55](https://github.com/powerhouse-inc/powerhouse/commit/c543a9d55))
- **pre-commit:** use bash syntax and shebang ([da00ff581](https://github.com/powerhouse-inc/powerhouse/commit/da00ff581))
- **reactor:** sync should loop pulls while there is more data available ([ee016a3b5](https://github.com/powerhouse-inc/powerhouse/commit/ee016a3b5))
- **reactor:** all storage implementations should throw the same errors on document not found ([1c07564fc](https://github.com/powerhouse-inc/powerhouse/commit/1c07564fc))
- **reactor:** do not let processor creation kill the application ([72420113d](https://github.com/powerhouse-inc/powerhouse/commit/72420113d))
- **reactor-api:** added resolver for DocumentDrive_Node ([68913cd8d](https://github.com/powerhouse-inc/powerhouse/commit/68913cd8d))
- **reactor-api:** proper resolution of prefixed file and foldertypes ([2b4297655](https://github.com/powerhouse-inc/powerhouse/commit/2b4297655))
- **reactor-api:** use getDrive instead of getDocument when driveId is requested ([bd0d1bfa3](https://github.com/powerhouse-inc/powerhouse/commit/bd0d1bfa3))
- **reactor-api:** enable introspection on supergraph ([eb6af4c55](https://github.com/powerhouse-inc/powerhouse/commit/eb6af4c55))
- **reactor-api:** wrong graphql type ([ee7813b7f](https://github.com/powerhouse-inc/powerhouse/commit/ee7813b7f))
- **reactor-api:** optional isAdmin on context ([12ff7a87c](https://github.com/powerhouse-inc/powerhouse/commit/12ff7a87c))
- **reactor-api:** permission helper not available ([4e42a0598](https://github.com/powerhouse-inc/powerhouse/commit/4e42a0598))
- **reactor-api:** isAuth helper ([a478ad6c4](https://github.com/powerhouse-inc/powerhouse/commit/a478ad6c4))
- **reactor-api:** removed protection for option requests ([ba37db4d4](https://github.com/powerhouse-inc/powerhouse/commit/ba37db4d4))
- **reactor-api:** allow unauthorized GET requests if auth is enabled ([b0ca34491](https://github.com/powerhouse-inc/powerhouse/commit/b0ca34491))
- **reactor-api:** add preferredEditor argument to addDrive method ([dbd425fa2](https://github.com/powerhouse-inc/powerhouse/commit/dbd425fa2))
- **reactor-api,reactor-local,document-drive:** import processors from packages ([2c6054850](https://github.com/powerhouse-inc/powerhouse/commit/2c6054850))
- **reactor-local,reactor-api:** update router after loading local subgraphs ([9cf1b2130](https://github.com/powerhouse-inc/powerhouse/commit/9cf1b2130))
- **scripts:** merged install tools and setup environment into one script ([2a7bd3c97](https://github.com/powerhouse-inc/powerhouse/commit/2a7bd3c97))
- **setup-environment:** updated install tools ([d91e08137](https://github.com/powerhouse-inc/powerhouse/commit/d91e08137))
- **switchboard:** use config ([28b994a9e](https://github.com/powerhouse-inc/powerhouse/commit/28b994a9e))
- **switchboard:** docker build ([7052e39e1](https://github.com/powerhouse-inc/powerhouse/commit/7052e39e1))
- **switchboard:** improved dockerfile ([130fc5535](https://github.com/powerhouse-inc/powerhouse/commit/130fc5535))
- **switchboard:** damn heroku ([fb95e9adc](https://github.com/powerhouse-inc/powerhouse/commit/fb95e9adc))
- **switchboard:** entrypoint ([472d6fa11](https://github.com/powerhouse-inc/powerhouse/commit/472d6fa11))
- **switchboard:** set port in entrypoint ([c09677ec9](https://github.com/powerhouse-inc/powerhouse/commit/c09677ec9))
- **switchboard,reactor-local:** latest version of sky atlas was not being installed ([72bf72fd4](https://github.com/powerhouse-inc/powerhouse/commit/72bf72fd4))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Callme-T
- Frank
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter