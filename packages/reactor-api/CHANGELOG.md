## 5.3.0-staging.8 (2026-01-20)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.3.0-staging.7 (2026-01-20)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.3.0-staging.6 (2026-01-20)

### 🩹 Fixes

- update hasValidSchema type to accept Maybe<string> (string | null | undefined) ([6d5a7a0f6](https://github.com/powerhouse-inc/powerhouse/commit/6d5a7a0f6))
- skip document models without valid operation schemas in subgraph generation ([90b382e86](https://github.com/powerhouse-inc/powerhouse/commit/90b382e86))

### ❤️ Thank You

- Frank

## 5.3.0-staging.5 (2026-01-19)

### 🩹 Fixes

- include input type definitions from state schema in generated subgraphs ([c12b2e7d8](https://github.com/powerhouse-inc/powerhouse/commit/c12b2e7d8))

### ❤️ Thank You

- Frank

## 5.3.0-staging.4 (2026-01-19)

### 🚀 Features

- new cicd flows ([0f52d237b](https://github.com/powerhouse-inc/powerhouse/commit/0f52d237b))
- **ci:** deploy staging tenant from release/staging/* branches ([3bce3ce41](https://github.com/powerhouse-inc/powerhouse/commit/3bce3ce41))
- **ci:** add Harbor registry to docker image publishing ([bb100a302](https://github.com/powerhouse-inc/powerhouse/commit/bb100a302))

### 🩹 Fixes

- **monorepo:** exclude root package from recursive build to prevent infinite loop ([bf8ecc244](https://github.com/powerhouse-inc/powerhouse/commit/bf8ecc244))
- workflow permissions ([6ea8e6b0e](https://github.com/powerhouse-inc/powerhouse/commit/6ea8e6b0e))

### ❤️ Thank You

- Frank

## 5.3.0-staging.3 (2026-01-19)

### 🩹 Fixes

- **ph-cmd:** bundle ph cmd ([#2226](https://github.com/powerhouse-inc/powerhouse/pull/2226))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.3.0-staging.2 (2026-01-16)

### 🚀 Features

- **design-system:** default styles tweaks and DocumentStateViewer ([18e4482e1](https://github.com/powerhouse-inc/powerhouse/commit/18e4482e1))

### ❤️ Thank You

- acaldas @acaldas

## 5.3.0-staging.1 (2026-01-14)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.43 (2026-01-14)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.42 (2026-01-14)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.41 (2026-01-13)

### 🩹 Fixes

- less strict document models array type on reactor builder ([1548ddec7](https://github.com/powerhouse-inc/powerhouse/commit/1548ddec7))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.40 (2026-01-10)

### 🚀 Features

- **builder-tools:** improved validation on doc model editor and unit tests ([336f5d575](https://github.com/powerhouse-inc/powerhouse/commit/336f5d575))
- **codegen:** add validation to package json test ([03d06ef57](https://github.com/powerhouse-inc/powerhouse/commit/03d06ef57))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.39 (2026-01-09)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.38 (2026-01-09)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.37 (2026-01-09)

### 🚀 Features

- **codegen,ph-cmd:** use templates for project boilerplate creation ([#2190](https://github.com/powerhouse-inc/powerhouse/pull/2190))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.36 (2026-01-09)

### 🩹 Fixes

- gql should create a channel if there isn't one, also fix issue with ADD_RELATIONSHIP needing the target ([3bda61732](https://github.com/powerhouse-inc/powerhouse/commit/3bda61732))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.35 (2026-01-08)

### 🩹 Fixes

- linting and build fixes, plus a three-reactor setup test ([87cdde785](https://github.com/powerhouse-inc/powerhouse/commit/87cdde785))
- ordinal issue ([bcc284ce1](https://github.com/powerhouse-inc/powerhouse/commit/bcc284ce1))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.34 (2026-01-07)

### 🚀 Features

- **ph-cli:** add index.html migration to migrate command ([#2186](https://github.com/powerhouse-inc/powerhouse/pull/2186))

### 🩹 Fixes

- **reactor-api:** return operation index on addAction mutation ([cb10efcfd](https://github.com/powerhouse-inc/powerhouse/commit/cb10efcfd))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.33 (2026-01-06)

### 🚀 Features

- passing logger through to sync-manager ([91af0bbfe](https://github.com/powerhouse-inc/powerhouse/commit/91af0bbfe))
- adding an explicit createdocumentindrive function ([7ed396977](https://github.com/powerhouse-inc/powerhouse/commit/7ed396977))

### 🩹 Fixes

- linting ([f79a19aa0](https://github.com/powerhouse-inc/powerhouse/commit/f79a19aa0))
- added configuration to debug switchboard, and cleaned up some of the subgraph code ([9ce04c899](https://github.com/powerhouse-inc/powerhouse/commit/9ce04c899))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.32 (2026-01-02)

### 🚀 Features

- **tracing:** migrate from Datadog to OpenTelemetry with Tempo service graphs ([6b4eb9c82](https://github.com/powerhouse-inc/powerhouse/commit/6b4eb9c82))

### 🩹 Fixes

- **tracing:** add IncomingMessage import and improve type cast ([83c85ff2c](https://github.com/powerhouse-inc/powerhouse/commit/83c85ff2c))

### ❤️ Thank You

- Frank

## 5.1.0-dev.31 (2026-01-02)

### 🚀 Features

- **switchboard:** added tracing ([c978736b7](https://github.com/powerhouse-inc/powerhouse/commit/c978736b7))

### ❤️ Thank You

- Frank

## 5.1.0-dev.30 (2026-01-01)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.29 (2025-12-30)

### 🩹 Fixes

- **connect,builder-tools,vetra:** avoid page reload on vite HMR ([1c3f5d1dd](https://github.com/powerhouse-inc/powerhouse/commit/1c3f5d1dd))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.28 (2025-12-30)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.27 (2025-12-24)

### 🚀 Features

- **reactor-api:** datadog integration ([3c433c686](https://github.com/powerhouse-inc/powerhouse/commit/3c433c686))
- **reactor-browser:** improved document retrieval hooks ([4fed49391](https://github.com/powerhouse-inc/powerhouse/commit/4fed49391))

### 🩹 Fixes

- **reactor-api:** linting issues ([9c674a847](https://github.com/powerhouse-inc/powerhouse/commit/9c674a847))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 5.1.0-dev.26 (2025-12-20)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.25 (2025-12-19)

### 🩹 Fixes

- signature resolvers ([4513d9dda](https://github.com/powerhouse-inc/powerhouse/commit/4513d9dda))
- passing meta through job system to avoid race conditions ([8b65bb42d](https://github.com/powerhouse-inc/powerhouse/commit/8b65bb42d))
- **reactor-api:** fix gql tests ([15294d00a](https://github.com/powerhouse-inc/powerhouse/commit/15294d00a))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.24 (2025-12-18)

### 🩹 Fixes

- switchboard's new reactor signs everything ([b7fafb7fa](https://github.com/powerhouse-inc/powerhouse/commit/b7fafb7fa))
- **reactor:** document model core types need to be numerical versions, also fixed a gql bug ([6495a88e2](https://github.com/powerhouse-inc/powerhouse/commit/6495a88e2))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.23 (2025-12-17)

### 🩹 Fixes

- **reactor-api, reactor-local:** pass dynamically loaded modules to the new reactor ([c038e058c](https://github.com/powerhouse-inc/powerhouse/commit/c038e058c))
- **reactor-api:** remove circular import ([9076b5257](https://github.com/powerhouse-inc/powerhouse/commit/9076b5257))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.22 (2025-12-16)

### 🚀 Features

- added support for runtime document model subgraphs ([dc8248ec6](https://github.com/powerhouse-inc/powerhouse/commit/dc8248ec6))

### 🩹 Fixes

- linter ([fcbd30919](https://github.com/powerhouse-inc/powerhouse/commit/fcbd30919))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.21 (2025-12-13)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.20 (2025-12-12)

### 🚀 Features

- **reactor-browsers:** added onErrors callback to dispatch method ([4824a0a10](https://github.com/powerhouse-inc/powerhouse/commit/4824a0a10))

### 🩹 Fixes

- **reactor-api:** added operation check ([4f22a6688](https://github.com/powerhouse-inc/powerhouse/commit/4f22a6688))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 5.1.0-dev.19 (2025-12-12)

### 🩹 Fixes

- **reactor-api:** removed isUserAllowedCheck and added flag to skip renown verification ([e59814cfd](https://github.com/powerhouse-inc/powerhouse/commit/e59814cfd))

### ❤️ Thank You

- Frank

## 5.1.0-dev.18 (2025-12-11)

### 🚀 Features

- **codegen:** add versioned document model generation ([#2130](https://github.com/powerhouse-inc/powerhouse/pull/2130))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.17 (2025-12-11)

### 🩹 Fixes

- **ph-cli:** auth with access-token ([df48be6e9](https://github.com/powerhouse-inc/powerhouse/commit/df48be6e9))

### ❤️ Thank You

- Frank

## 5.1.0-dev.16 (2025-12-11)

### 🚀 Features

- **ph-cli:** added access-token command ([e48181df6](https://github.com/powerhouse-inc/powerhouse/commit/e48181df6))
- **codegen:** update zod schema generation library ([#2129](https://github.com/powerhouse-inc/powerhouse/pull/2129))
- integrate visibility tools for remotes and pglite instance ([#2122](https://github.com/powerhouse-inc/powerhouse/pull/2122))
- **reactor-api:** added migration scripts ([b45782a31](https://github.com/powerhouse-inc/powerhouse/commit/b45782a31))
- **reactor-api:** added feature flag for document permission service ([89770d177](https://github.com/powerhouse-inc/powerhouse/commit/89770d177))
- **reactor-api:** added document group permissions ([769a04532](https://github.com/powerhouse-inc/powerhouse/commit/769a04532))
- **reactor-api:** added operation permissions ([8b1730456](https://github.com/powerhouse-inc/powerhouse/commit/8b1730456))
- **reactor-api:** document permission service ([e95ae2618](https://github.com/powerhouse-inc/powerhouse/commit/e95ae2618))

### 🩹 Fixes

- syncenvelope shape was incorrect ([cc6226be9](https://github.com/powerhouse-inc/powerhouse/commit/cc6226be9))
- gql fixes, like making channels :) ([ee71e2229](https://github.com/powerhouse-inc/powerhouse/commit/ee71e2229))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.15 (2025-12-09)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.14 (2025-12-08)

### 🚀 Features

- **connect, switchboard:** added healthcheck route ([9a0671113](https://github.com/powerhouse-inc/powerhouse/commit/9a0671113))
- **academy:** added docker build and publish workflow ([b17562994](https://github.com/powerhouse-inc/powerhouse/commit/b17562994))

### ❤️ Thank You

- Frank

## 5.1.0-dev.13 (2025-12-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.12 (2025-12-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.11 (2025-12-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.10 (2025-12-06)

### 🚀 Features

- **design-system:** added remotes inspector and channel inspector components ([093896ebf](https://github.com/powerhouse-inc/powerhouse/commit/093896ebf))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 5.1.0-dev.9 (2025-12-05)

### 🩹 Fixes

- **renown:** small ui fixes and made connectcrypto and renown id available in hooks ([c06e17226](https://github.com/powerhouse-inc/powerhouse/commit/c06e17226))

### ❤️ Thank You

- Frank

## 5.1.0-dev.8 (2025-12-05)

### 🩹 Fixes

- linter ([b28b4bf43](https://github.com/powerhouse-inc/powerhouse/commit/b28b4bf43))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.7 (2025-12-04)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.6 (2025-12-04)

### 🩹 Fixes

- **renown:** build issues ([1893c35a0](https://github.com/powerhouse-inc/powerhouse/commit/1893c35a0))

### ❤️ Thank You

- Frank

## 5.1.0-dev.5 (2025-12-04)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.4 (2025-12-03)

### 🚀 Features

- **codegen,ph-cli:** add tsx code generator ([#2116](https://github.com/powerhouse-inc/powerhouse/pull/2116))

### 🩹 Fixes

- linting ([7985e91d5](https://github.com/powerhouse-inc/powerhouse/commit/7985e91d5))
- updated reactor api ([3476e8367](https://github.com/powerhouse-inc/powerhouse/commit/3476e8367))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.3 (2025-12-02)

### 🚀 Features

- **renown:** login component ([#2117](https://github.com/powerhouse-inc/powerhouse/pull/2117))

### ❤️ Thank You

- Frank @froid1911

## 5.1.0-dev.2 (2025-12-02)

### 🚀 Features

- added integration tests for gql sync ([554280dbc](https://github.com/powerhouse-inc/powerhouse/commit/554280dbc))
- push/pull channel integration in gqp api ([722f7e844](https://github.com/powerhouse-inc/powerhouse/commit/722f7e844))

### 🩹 Fixes

- build fix with reactor builder module change ([d07c4c7fa](https://github.com/powerhouse-inc/powerhouse/commit/d07c4c7fa))
- linting fixes ([2d4993b86](https://github.com/powerhouse-inc/powerhouse/commit/2d4993b86))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.1 (2025-11-26)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.1.0-dev.0 (2025-11-20)

### 🚀 Features

- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- mutation resolver implementation ([569697f58](https://github.com/powerhouse-inc/powerhouse/commit/569697f58))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))
- mutation resolver implementation ([4734cd186](https://github.com/powerhouse-inc/powerhouse/commit/4734cd186))
- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))
- **ph-cli:** ph migrate command ([#2099](https://github.com/powerhouse-inc/powerhouse/pull/2099))
- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))
- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- **reactor-api:** added driveDocument and driveDocuments route ([a30d78e84](https://github.com/powerhouse-inc/powerhouse/commit/a30d78e84))
- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))
- **reactor-api:** fix circular imports ([0eed9b3f9](https://github.com/powerhouse-inc/powerhouse/commit/0eed9b3f9))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))
- **connect:** remove circular imports ([a1632d41e](https://github.com/powerhouse-inc/powerhouse/commit/a1632d41e))
- switching to tinybench for benchmarks ([5b915e025](https://github.com/powerhouse-inc/powerhouse/commit/5b915e025))
- **reactor-api:** added free entry flag which allows unauthenticated users to reach guest level ([d2d17ab44](https://github.com/powerhouse-inc/powerhouse/commit/d2d17ab44))
- **codegen, vetra:** update codegen templates ([#2056](https://github.com/powerhouse-inc/powerhouse/pull/2056))
- pre-load local packages when building driveServer ([#2064](https://github.com/powerhouse-inc/powerhouse/pull/2064))
- create default vetra package document when ph vetra is started for a remote drive ([#2066](https://github.com/powerhouse-inc/powerhouse/pull/2066))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))
- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### 🩹 Fixes

- free entry for register pull responder listener ([f69688fd0](https://github.com/powerhouse-inc/powerhouse/commit/f69688fd0))
- **reactor-api:** type issue on ws server ([12a9901f6](https://github.com/powerhouse-inc/powerhouse/commit/12a9901f6))
- **reactor-api:** fixed graphql-ws import ([22e2d862e](https://github.com/powerhouse-inc/powerhouse/commit/22e2d862e))
- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))
- **reactor-api:** re-added reactor-api debounce on loadDocumentModels ([fc9e7d47e](https://github.com/powerhouse-inc/powerhouse/commit/fc9e7d47e))
- **ph-cli:** added missing runtime dependencies ([da1b66e73](https://github.com/powerhouse-inc/powerhouse/commit/da1b66e73))
- **builder-tools:** use alias for self-reference import on ts instead of loading from dist ([b23b772c0](https://github.com/powerhouse-inc/powerhouse/commit/b23b772c0))
- **reactor-api,switchboard:** load local package by default and resolve self reference import on ts files ([2b2d29ba6](https://github.com/powerhouse-inc/powerhouse/commit/2b2d29ba6))
- **connect,reactor-api:** fix merge conflict ([8786cdae4](https://github.com/powerhouse-inc/powerhouse/commit/8786cdae4))
- linter fixes ([39a187eca](https://github.com/powerhouse-inc/powerhouse/commit/39a187eca))
- **codegen:** move read-pkg to runtime dependency ([939f01045](https://github.com/powerhouse-inc/powerhouse/commit/939f01045))
- **codegen:** run prettier programmatically ([23f948c4d](https://github.com/powerhouse-inc/powerhouse/commit/23f948c4d))
- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- broke the build, fixing with reactorbuilder ([2c4ade4e6](https://github.com/powerhouse-inc/powerhouse/commit/2c4ade4e6))
- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))
- update atlas packages ([fa174d00e](https://github.com/powerhouse-inc/powerhouse/commit/fa174d00e))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.128 (2025-11-20)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.127 (2025-11-19)

### 🩹 Fixes

- free entry for register pull responder listener ([f69688fd0](https://github.com/powerhouse-inc/powerhouse/commit/f69688fd0))

### ❤️ Thank You

- Frank

## 4.1.0-dev.126 (2025-11-19)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.125 (2025-11-19)

### 🩹 Fixes

- **reactor-api:** type issue on ws server ([12a9901f6](https://github.com/powerhouse-inc/powerhouse/commit/12a9901f6))
- **reactor-api:** fixed graphql-ws import ([22e2d862e](https://github.com/powerhouse-inc/powerhouse/commit/22e2d862e))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.124 (2025-11-18)

### 🚀 Features

- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- mutation resolver implementation ([569697f58](https://github.com/powerhouse-inc/powerhouse/commit/569697f58))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))
- mutation resolver implementation ([4734cd186](https://github.com/powerhouse-inc/powerhouse/commit/4734cd186))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.123 (2025-11-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.122 (2025-11-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.121 (2025-11-17)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.120 (2025-11-17)

### 🩹 Fixes

- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.119 (2025-11-15)

### 🚀 Features

- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.118 (2025-11-14)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.117 (2025-11-13)

### 🩹 Fixes

- **reactor-api:** re-added reactor-api debounce on loadDocumentModels ([fc9e7d47e](https://github.com/powerhouse-inc/powerhouse/commit/fc9e7d47e))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.116 (2025-11-13)

### 🩹 Fixes

- **ph-cli:** added missing runtime dependencies ([da1b66e73](https://github.com/powerhouse-inc/powerhouse/commit/da1b66e73))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.115 (2025-11-13)

### 🚀 Features

- **ph-cli:** ph migrate command ([#2099](https://github.com/powerhouse-inc/powerhouse/pull/2099))

### 🩹 Fixes

- **builder-tools:** use alias for self-reference import on ts instead of loading from dist ([b23b772c0](https://github.com/powerhouse-inc/powerhouse/commit/b23b772c0))
- **reactor-api,switchboard:** load local package by default and resolve self reference import on ts files ([2b2d29ba6](https://github.com/powerhouse-inc/powerhouse/commit/2b2d29ba6))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.114 (2025-11-13)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.113 (2025-11-12)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.112 (2025-11-12)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.111 (2025-11-12)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.110 (2025-11-11)

### 🚀 Features

- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.109 (2025-11-10)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.108 (2025-11-10)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.107 (2025-11-10)

### 🚀 Features

- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- **reactor-api:** fix circular imports ([0eed9b3f9](https://github.com/powerhouse-inc/powerhouse/commit/0eed9b3f9))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))

### 🩹 Fixes

- **connect,reactor-api:** fix merge conflict ([8786cdae4](https://github.com/powerhouse-inc/powerhouse/commit/8786cdae4))
- publish docker prod workflow ([d701f8dc0](https://github.com/powerhouse-inc/powerhouse/commit/d701f8dc0))

### ❤️ Thank You

- Frank
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.106 (2025-11-10)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.105 (2025-11-08)

### 🚀 Features

- **reactor-api:** added driveDocument and driveDocuments route ([a30d78e84](https://github.com/powerhouse-inc/powerhouse/commit/a30d78e84))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.104 (2025-11-07)

### 🚀 Features

- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))

### 🩹 Fixes

- linter fixes ([39a187eca](https://github.com/powerhouse-inc/powerhouse/commit/39a187eca))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.103 (2025-11-06)

### 🚀 Features

- **connect:** remove circular imports ([a1632d41e](https://github.com/powerhouse-inc/powerhouse/commit/a1632d41e))

### 🩹 Fixes

- **codegen:** move read-pkg to runtime dependency ([939f01045](https://github.com/powerhouse-inc/powerhouse/commit/939f01045))
- **codegen:** run prettier programmatically ([23f948c4d](https://github.com/powerhouse-inc/powerhouse/commit/23f948c4d))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.102 (2025-11-06)

### 🚀 Features

- switching to tinybench for benchmarks ([5b915e025](https://github.com/powerhouse-inc/powerhouse/commit/5b915e025))
- **reactor-api:** added free entry flag which allows unauthenticated users to reach guest level ([d2d17ab44](https://github.com/powerhouse-inc/powerhouse/commit/d2d17ab44))

### 🩹 Fixes

- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- broke the build, fixing with reactorbuilder ([2c4ade4e6](https://github.com/powerhouse-inc/powerhouse/commit/2c4ade4e6))
- update atlas packages ([fa174d00e](https://github.com/powerhouse-inc/powerhouse/commit/fa174d00e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 4.1.0-dev.101 (2025-11-05)

### 🚀 Features

- **codegen, vetra:** update codegen templates ([#2056](https://github.com/powerhouse-inc/powerhouse/pull/2056))
- pre-load local packages when building driveServer ([#2064](https://github.com/powerhouse-inc/powerhouse/pull/2064))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.100 (2025-11-04)

### 🚀 Features

- create default vetra package document when ph vetra is started for a remote drive ([#2066](https://github.com/powerhouse-inc/powerhouse/pull/2066))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))

### 🩹 Fixes

- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.99 (2025-10-31)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.98 (2025-10-31)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.97 (2025-10-30)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.96 (2025-10-30)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.95 (2025-10-30)

### 🚀 Features

- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.94 (2025-10-29)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.93 (2025-10-29)

### 🚀 Features

- first swing at a project to import these recorded operations ([41b139237](https://github.com/powerhouse-inc/powerhouse/commit/41b139237))

### 🩹 Fixes

- compatibility updates ([687ac4075](https://github.com/powerhouse-inc/powerhouse/commit/687ac4075))
- package link issues ([3415df513](https://github.com/powerhouse-inc/powerhouse/commit/3415df513))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.92 (2025-10-28)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.91 (2025-10-28)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.90 (2025-10-27)

### 🚀 Features

- **reactor-api:** updated apollo server to v5 ([66dffda7b](https://github.com/powerhouse-inc/powerhouse/commit/66dffda7b))

### 🩹 Fixes

- **switchboard:** fallback to filesystem storage if postgres db is unavailable ([97e40bbf5](https://github.com/powerhouse-inc/powerhouse/commit/97e40bbf5))
- **reactor-api:** avoid MaxListenersWarning on startup ([b43efdc83](https://github.com/powerhouse-inc/powerhouse/commit/b43efdc83))
- **reactor-api:** add prefix to interfaces on document model schemas ([e85855ce4](https://github.com/powerhouse-inc/powerhouse/commit/e85855ce4))

### ❤️ Thank You

- acaldas

## 4.1.0-dev.89 (2025-10-24)

### 🩹 Fixes

- used fixed versions for codemirror dep ([183e487db](https://github.com/powerhouse-inc/powerhouse/commit/183e487db))

### ❤️ Thank You

- Guillermo Puente

## 4.1.0-dev.88 (2025-10-24)

### 🩹 Fixes

- **builder-tools, reactor-api:** optimized vite watch ([4d241c8c6](https://github.com/powerhouse-inc/powerhouse/commit/4d241c8c6))
- **document-drive:** enforce drive icon value to default to null ([64f4452b8](https://github.com/powerhouse-inc/powerhouse/commit/64f4452b8))
- **reactor-api:** debounce local package updates and reduced logging ([96735b11a](https://github.com/powerhouse-inc/powerhouse/commit/96735b11a))
- **reactor-api:** prevent subgraph errors from crashing the reactor api ([27e3605e1](https://github.com/powerhouse-inc/powerhouse/commit/27e3605e1))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.87 (2025-10-24)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.86 (2025-10-23)

### 🩹 Fixes

- **vetra:** added codegen debounce test and reduced logging ([bc360b8e0](https://github.com/powerhouse-inc/powerhouse/commit/bc360b8e0))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.85 (2025-10-22)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.84 (2025-10-22)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.83 (2025-10-22)

### 🚀 Features

- add automated tests for vetra features ([#1962](https://github.com/powerhouse-inc/powerhouse/pull/1962))

### 🩹 Fixes

- **reactor-api:** either use provided Loader or default to ImportLoader ([da10246a7](https://github.com/powerhouse-inc/powerhouse/commit/da10246a7))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.82 (2025-10-21)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.81 (2025-10-21)

### 🚀 Features

- **reactor-browser:** remove catch all wildcard ([f09931a88](https://github.com/powerhouse-inc/powerhouse/commit/f09931a88))
- **connect:** move config call to after other value setters ([3e8c26e81](https://github.com/powerhouse-inc/powerhouse/commit/3e8c26e81))
- **reactor-browser,connect:** use new window function factory ([7886c284f](https://github.com/powerhouse-inc/powerhouse/commit/7886c284f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.80 (2025-10-21)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.79 (2025-10-20)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.78 (2025-10-20)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.77 (2025-10-20)

### 🩹 Fixes

- add missing @openfeature/core peer dependency ([2c4a904b0](https://github.com/powerhouse-inc/powerhouse/commit/2c4a904b0))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.76 (2025-10-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.75 (2025-10-17)

### 🩹 Fixes

- **reactor-api:** avoids use of path.matchGlob which logs a error message ([9a88cf095](https://github.com/powerhouse-inc/powerhouse/commit/9a88cf095))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.74 (2025-10-15)

### 🩹 Fixes

- **codegen:** update graphql dependency in package.json ([257f368ac](https://github.com/powerhouse-inc/powerhouse/commit/257f368ac))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.73 (2025-10-15)

### 🚀 Features

- **renown:** added login button ([f109c7305](https://github.com/powerhouse-inc/powerhouse/commit/f109c7305))

### ❤️ Thank You

- Frank

## 4.1.0-dev.72 (2025-10-15)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.71 (2025-10-15)

### 🚀 Features

- **reactor-api:** add operation type and id resolvers to DriveSubgraph ([#1955](https://github.com/powerhouse-inc/powerhouse/pull/1955))

### 🩹 Fixes

- **codegen:** update analytics processor imports to use in processor templates ([#1954](https://github.com/powerhouse-inc/powerhouse/pull/1954))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.70 (2025-10-14)

### 🩹 Fixes

- **reactor-api:** bandaid a deeper issue where some document model types have their own name separate from header information, and headers aren't generally synced ([bbf5c94d8](https://github.com/powerhouse-inc/powerhouse/commit/bbf5c94d8))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.69 (2025-10-11)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.68 (2025-10-11)

### 🚀 Features

- **vetra:** added read model to fetch vetra packages ([abb6d3742](https://github.com/powerhouse-inc/powerhouse/commit/abb6d3742))

### 🩹 Fixes

- **reactor-api:** added auth export ([a38df7fde](https://github.com/powerhouse-inc/powerhouse/commit/a38df7fde))

### ❤️ Thank You

- Frank

## 4.1.0-dev.67 (2025-10-10)

### 🚀 Features

- **vetra:** add open button to Package Information section ([#1930](https://github.com/powerhouse-inc/powerhouse/pull/1930))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.66 (2025-10-09)

### 🩹 Fixes

- **ph-reactor:** remove test files from root index ([2a217e8e6](https://github.com/powerhouse-inc/powerhouse/commit/2a217e8e6))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.65 (2025-10-09)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.64 (2025-10-09)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.63 (2025-10-09)

### 🚀 Features

- update @electric-sql/pglite version ([fa3529328](https://github.com/powerhouse-inc/powerhouse/commit/fa3529328))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.62 (2025-10-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.61 (2025-10-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.60 (2025-10-08)

### 🚀 Features

- **vetra:** added read model to fetch vetra packages ([23c55364d](https://github.com/powerhouse-inc/powerhouse/commit/23c55364d))
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
- added initial pieces of the kysely operation store implementation ([3fbece162](https://github.com/powerhouse-inc/powerhouse/commit/3fbece162))
- **connect,builder-tools:** build rework ([#1871](https://github.com/powerhouse-inc/powerhouse/pull/1871))
- **codegen:** updated editor boilerplate with document state and example setName dispatch ([3e7c51cc3](https://github.com/powerhouse-inc/powerhouse/commit/3e7c51cc3))
- restructure document model to avoid circular imports ([#1874](https://github.com/powerhouse-inc/powerhouse/pull/1874))

### 🩹 Fixes

- multiple fixes for ph vetra ([#1906](https://github.com/powerhouse-inc/powerhouse/pull/1906))
- **reactor-api:** rolling back some changes that break subgraph injection ([29fd974e1](https://github.com/powerhouse-inc/powerhouse/commit/29fd974e1))
- **reactor-api:** added auth export ([d3a13f128](https://github.com/powerhouse-inc/powerhouse/commit/d3a13f128))
- **reactor-api:** catch subgraph setup errors to avoid breaking the server ([2237ff6b4](https://github.com/powerhouse-inc/powerhouse/commit/2237ff6b4))
- **reactor-api:** rename timestamp fields to follow ISO format ([86813d154](https://github.com/powerhouse-inc/powerhouse/commit/86813d154))
- **reactor-api:** skip document model with duplicated name instead of breaking ([d0bc1ff58](https://github.com/powerhouse-inc/powerhouse/commit/d0bc1ff58))
- **reactor-api:** catch errors when loading packages to avoid breaking the process ([87adac5f2](https://github.com/powerhouse-inc/powerhouse/commit/87adac5f2))
- **reactor-api:** do not use multiple loaders ([93ca742ae](https://github.com/powerhouse-inc/powerhouse/commit/93ca742ae))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.59 (2025-09-24)

### 🚀 Features

- **monorepo:** rename tsc to tsc:build ([c1385418b](https://github.com/powerhouse-inc/powerhouse/commit/c1385418b))

### 🩹 Fixes

- **builder-tools:** declare @storybook/preview-api dependency ([705ac8da1](https://github.com/powerhouse-inc/powerhouse/commit/705ac8da1))
- fix remaining tests ([60bf7b767](https://github.com/powerhouse-inc/powerhouse/commit/60bf7b767))
- more type fixes ([16c562ae1](https://github.com/powerhouse-inc/powerhouse/commit/16c562ae1))
- part 2 of build fixes for module changes ([3000a13c3](https://github.com/powerhouse-inc/powerhouse/commit/3000a13c3))
- lots of type fixes for modules ([8f4cf02fe](https://github.com/powerhouse-inc/powerhouse/commit/8f4cf02fe))
- codegen broke, fixing for reactor gql types ([86fe61c84](https://github.com/powerhouse-inc/powerhouse/commit/86fe61c84))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.58 (2025-09-18)

### 🚀 Features

- adding feature flag to switchboard for controlling reactorv2 api ([4486c8a8d](https://github.com/powerhouse-inc/powerhouse/commit/4486c8a8d))

### 🩹 Fixes

- test fix for document-drive package ([40f4b6416](https://github.com/powerhouse-inc/powerhouse/commit/40f4b6416))
- document type was wrong ([ae3ffb9ee](https://github.com/powerhouse-inc/powerhouse/commit/ae3ffb9ee))
- fixing issue with local state not being persisted ([fc6735e6c](https://github.com/powerhouse-inc/powerhouse/commit/fc6735e6c))
- build fixes ([fe2cd6699](https://github.com/powerhouse-inc/powerhouse/commit/fe2cd6699))
- fixing the utc times ([15b06d2e2](https://github.com/powerhouse-inc/powerhouse/commit/15b06d2e2))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.57 (2025-09-17)

### 🚀 Features

- **monorepo:** empty commit to satisfy naming ([5aa18f417](https://github.com/powerhouse-inc/powerhouse/commit/5aa18f417))
- **monorepo:** merge main ([79f6472b1](https://github.com/powerhouse-inc/powerhouse/commit/79f6472b1))
- **monorepo:** update release branch workflow ([e9c221ab5](https://github.com/powerhouse-inc/powerhouse/commit/e9c221ab5))
- add processor configuration support to switchboard and Vetra integration ([#1859](https://github.com/powerhouse-inc/powerhouse/pull/1859))

### 🩹 Fixes

- **monorepo:** re-add nx js plugin ([d477a49d7](https://github.com/powerhouse-inc/powerhouse/commit/d477a49d7))
- **monorepo:** regenerate lockfile ([7811171ff](https://github.com/powerhouse-inc/powerhouse/commit/7811171ff))
- **reactor-api:** moved delete drive to mutations resolvers ([888f37a3e](https://github.com/powerhouse-inc/powerhouse/commit/888f37a3e))
- **monorepo:** linting and type checking ([#1776](https://github.com/powerhouse-inc/powerhouse/pull/1776))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.56 (2025-09-17)

### 🚀 Features

- resolvers and full tests ([134dce888](https://github.com/powerhouse-inc/powerhouse/commit/134dce888))
- making the reactor subgraph much more descriptive in failure ([190b27e82](https://github.com/powerhouse-inc/powerhouse/commit/190b27e82))
- first pass implementing some of the query resolvers with client ([aa76a8fea](https://github.com/powerhouse-inc/powerhouse/commit/aa76a8fea))

### 🩹 Fixes

- switching back to checks ([9dacd70fe](https://github.com/powerhouse-inc/powerhouse/commit/9dacd70fe))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.55 (2025-09-16)

### 🚀 Features

- enable supported document types for drag and drop feature ([#1860](https://github.com/powerhouse-inc/powerhouse/pull/1860))
- add processor configuration support to switchboard and Vetra integration ([#1859](https://github.com/powerhouse-inc/powerhouse/pull/1859))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.54 (2025-09-16)

### 🚀 Features

- adding reactor client to subgraph args ([d0a8011e6](https://github.com/powerhouse-inc/powerhouse/commit/d0a8011e6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.53 (2025-09-13)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.52 (2025-09-12)

### 🩹 Fixes

- fixes before merge ([b6bfba102](https://github.com/powerhouse-inc/powerhouse/commit/b6bfba102))
- **connect-e2e:** fix failing tests ([88c3bea94](https://github.com/powerhouse-inc/powerhouse/commit/88c3bea94))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.51 (2025-09-11)

### 🚀 Features

- **reactor-api:** tests for each level of the reactor gql sdk ([1e52b761e](https://github.com/powerhouse-inc/powerhouse/commit/1e52b761e))
- **reactor-api:** creating an sdk factory ([34151d5d2](https://github.com/powerhouse-inc/powerhouse/commit/34151d5d2))
- **reactor-api:** generate sdk ([ec107015c](https://github.com/powerhouse-inc/powerhouse/commit/ec107015c))
- **reactor-api:** initial gql codegen ([3db9e9778](https://github.com/powerhouse-inc/powerhouse/commit/3db9e9778))
- **monorepo:** make format consistent across ignores ([98469560f](https://github.com/powerhouse-inc/powerhouse/commit/98469560f))
- **monorepo:** use consistent separate type imports ([6fd4ac0f4](https://github.com/powerhouse-inc/powerhouse/commit/6fd4ac0f4))

### 🩹 Fixes

- whoops, adding generated code ([ffb6ca373](https://github.com/powerhouse-inc/powerhouse/commit/ffb6ca373))
- linting fixes ([27fe7d397](https://github.com/powerhouse-inc/powerhouse/commit/27fe7d397))
- annoyingly, you have to add ignores to the root eslint ([bb6d993bd](https://github.com/powerhouse-inc/powerhouse/commit/bb6d993bd))
- **reactor-api:** fixing more linter issues ([aeb093426](https://github.com/powerhouse-inc/powerhouse/commit/aeb093426))
- **reactor-api:** fixing linter issues ([5c0f1a074](https://github.com/powerhouse-inc/powerhouse/commit/5c0f1a074))
- **reactor-api:** adding a tools tsconfig that doesn't emit so we can support codegen.ts ([5898dc822](https://github.com/powerhouse-inc/powerhouse/commit/5898dc822))
- **reactor-api:** fix import issue in generated gql ([bad71a0cc](https://github.com/powerhouse-inc/powerhouse/commit/bad71a0cc))
- **reactor-api:** pass generated code through prettier and eslint ([1624548c0](https://github.com/powerhouse-inc/powerhouse/commit/1624548c0))
- **docs:** improve document hooks documentation ([d05fcb835](https://github.com/powerhouse-inc/powerhouse/commit/d05fcb835))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T
- ryanwolhuter @ryanwolhuter

## 5.0.0-staging.9 (2025-09-09)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.0.0-staging.8 (2025-09-09)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.0.0-staging.7 (2025-09-09)

### 🩹 Fixes

- **reactor-api:** delete drive mutation not working ([84cdf6c5a](https://github.com/powerhouse-inc/powerhouse/commit/84cdf6c5a))
- **reactor-api,reactor/browser:** update open in switchboard url ([f42897b29](https://github.com/powerhouse-inc/powerhouse/commit/f42897b29))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 5.0.0-staging.6 (2025-09-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.0.0-staging.5 (2025-09-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.0.0-staging.4 (2025-09-08)

### 🩹 Fixes

- **reactor-api,reactor/browser:** update open in switchboard url ([f42897b29](https://github.com/powerhouse-inc/powerhouse/commit/f42897b29))

### ❤️ Thank You

- acaldas @acaldas

## 5.0.0-staging.3 (2025-09-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 5.0.0-staging.2 (2025-09-05)

### 🚀 Features

- **reactor-api:** added nodeName to document query ([3d303c7e2](https://github.com/powerhouse-inc/powerhouse/commit/3d303c7e2))

### 🩹 Fixes

- **reactor-api:** error logging on package load ([b56cf77c6](https://github.com/powerhouse-inc/powerhouse/commit/b56cf77c6))
- **docs:** added zip redundancy to release notes ([3acfe1027](https://github.com/powerhouse-inc/powerhouse/commit/3acfe1027))
- **reactor-api:** node not found ([6c5a24a4e](https://github.com/powerhouse-inc/powerhouse/commit/6c5a24a4e))

### ❤️ Thank You

- Callme-T
- Frank

## 5.0.0-staging.1 (2025-09-04)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.44 (2025-09-04)

### 🚀 Features

- **switchboard:** updated readme ([9659cf035](https://github.com/powerhouse-inc/powerhouse/commit/9659cf035))

### 🩹 Fixes

- **reactor-api:** auth enabled false ([ff9ddfc58](https://github.com/powerhouse-inc/powerhouse/commit/ff9ddfc58))
- **reactor-api:** disable cache ([7fa75b69f](https://github.com/powerhouse-inc/powerhouse/commit/7fa75b69f))
- **reactor-api:** auth flow ([bbda4f2a1](https://github.com/powerhouse-inc/powerhouse/commit/bbda4f2a1))

### ❤️ Thank You

- Frank

## 4.1.0-dev.43 (2025-09-02)

### 🚀 Features

- **reactor-api:** added renown credential auth check ([af266ae5b](https://github.com/powerhouse-inc/powerhouse/commit/af266ae5b))

### ❤️ Thank You

- Frank

## 4.1.0-dev.42 (2025-09-02)

### 🩹 Fixes

- **reactor-api:** use issuer field ([495a93337](https://github.com/powerhouse-inc/powerhouse/commit/495a93337))
- **reactor-api:** use proper issuer field ([a1e36efe0](https://github.com/powerhouse-inc/powerhouse/commit/a1e36efe0))

### ❤️ Thank You

- Frank

## 4.1.0-dev.41 (2025-09-02)

### 🚀 Features

- **reactor-api:** added auth service ([a0863f6e3](https://github.com/powerhouse-inc/powerhouse/commit/a0863f6e3))

### 🩹 Fixes

- **document-drive:** install openssl ([89f21529e](https://github.com/powerhouse-inc/powerhouse/commit/89f21529e))
- **document-drive:** prisma build ([7884368a2](https://github.com/powerhouse-inc/powerhouse/commit/7884368a2))
- **switchboard, connect:** fetch proper tag ([79a0bc967](https://github.com/powerhouse-inc/powerhouse/commit/79a0bc967))

### ❤️ Thank You

- Frank

## 4.1.0-dev.40 (2025-09-02)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.39 (2025-09-02)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.38 (2025-08-30)

### 🚀 Features

- gql-gen spec ([5bf2c7226](https://github.com/powerhouse-inc/powerhouse/commit/5bf2c7226))
- **reactor:** we have a reactor facade ([7a61e68ab](https://github.com/powerhouse-inc/powerhouse/commit/7a61e68ab))
- **reactor:** impstubbing out initial interface and types ([b74b194f9](https://github.com/powerhouse-inc/powerhouse/commit/b74b194f9))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.37 (2025-08-29)

### 🩹 Fixes

- fixing synchronization post-refactor ([a4ad046e0](https://github.com/powerhouse-inc/powerhouse/commit/a4ad046e0))
- **reactor-api:** loading local modules ([26e3e30a6](https://github.com/powerhouse-inc/powerhouse/commit/26e3e30a6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 4.1.0-dev.36 (2025-08-28)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.35 (2025-08-27)

### 🩹 Fixes

- fixing push/pull tests ([fa3c8f8e7](https://github.com/powerhouse-inc/powerhouse/commit/fa3c8f8e7))
- **reactor-api:** updates for type shuffle ([44da3c0c2](https://github.com/powerhouse-inc/powerhouse/commit/44da3c0c2))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.34 (2025-08-26)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.33 (2025-08-21)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.32 (2025-08-21)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.31 (2025-08-20)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

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

### 🩹 Fixes

- fix downstream consequences of getting rid of extended state ([2177d6e41](https://github.com/powerhouse-inc/powerhouse/commit/2177d6e41))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.22 (2025-08-15)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.21 (2025-08-15)

### 🚀 Features

- **vetra:** update manifest when new module is added ([#1766](https://github.com/powerhouse-inc/powerhouse/pull/1766))

### 🩹 Fixes

- fixed debug launch configuration now that source maps are in the proper locations ([c75d793ed](https://github.com/powerhouse-inc/powerhouse/commit/c75d793ed))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.20 (2025-08-15)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.19 (2025-08-14)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.18 (2025-08-14)

### 🩹 Fixes

- **reactor-api:** add missing actionId field to GraphQL operation types ([12060376c](https://github.com/powerhouse-inc/powerhouse/commit/12060376c))
- **reactor-api:** forward auth token from gateway to subgraphs ([e2986955c](https://github.com/powerhouse-inc/powerhouse/commit/e2986955c))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente

## 4.1.0-dev.17 (2025-08-12)

### 🚀 Features

- refactor vetra command and remove vetra deps in connect and reactor ([#1753](https://github.com/powerhouse-inc/powerhouse/pull/1753))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.16 (2025-08-12)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.12 (2025-08-08)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.8 (2025-08-06)

### 🚀 Features

- **reactor-api:** add delete drive mutation on system subgraph ([97640da41](https://github.com/powerhouse-inc/powerhouse/commit/97640da41))
- **switchboard,config,reactor-api:** handle auth in reactor-api ([f33c921ee](https://github.com/powerhouse-inc/powerhouse/commit/f33c921ee))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.7 (2025-08-06)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))

### 🩹 Fixes

- **reactor-api:** debounce updateRouter calls and improved logging ([d3ab9978c](https://github.com/powerhouse-inc/powerhouse/commit/d3ab9978c))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.5 (2025-08-05)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 4.0.0-staging.7 (2025-07-26)

### 🚀 Features

- **reactor-api:** load auth config ([e1c90c4bd](https://github.com/powerhouse-inc/powerhouse/commit/e1c90c4bd))
- **state:** make all atom states derivative ([68a4bfece](https://github.com/powerhouse-inc/powerhouse/commit/68a4bfece))

### 🩹 Fixes

- **reactor-api:** register pullresponder as guest ([abc323cc1](https://github.com/powerhouse-inc/powerhouse/commit/abc323cc1))
- **reactor-api:** add user to graphql context ([b20c94d03](https://github.com/powerhouse-inc/powerhouse/commit/b20c94d03))

### ❤️ Thank You

- Frank
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
- **document-drive:** added fallbacks with deprecation warnings on legacy reactor methods ([0e10883cc](https://github.com/powerhouse-inc/powerhouse/commit/0e10883cc))
- updated remaining packages with new reactor api and bug fixes ([f8045faa1](https://github.com/powerhouse-inc/powerhouse/commit/f8045faa1))
- sync new documents and push+pull api tests ([b81096640](https://github.com/powerhouse-inc/powerhouse/commit/b81096640))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))
- **document-drive,connect,common,reactor-api:** test fixes and interface improvements ([981b638bf](https://github.com/powerhouse-inc/powerhouse/commit/981b638bf))
- **document-drive:** fixed listener revisions handling ([84a13171b](https://github.com/powerhouse-inc/powerhouse/commit/84a13171b))

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
- **document-drive:** added fallbacks with deprecation warnings on legacy reactor methods ([0e10883cc](https://github.com/powerhouse-inc/powerhouse/commit/0e10883cc))
- updated remaining packages with new reactor api and bug fixes ([f8045faa1](https://github.com/powerhouse-inc/powerhouse/commit/f8045faa1))
- sync new documents and push+pull api tests ([b81096640](https://github.com/powerhouse-inc/powerhouse/commit/b81096640))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))
- **document-drive,connect,common,reactor-api:** test fixes and interface improvements ([981b638bf](https://github.com/powerhouse-inc/powerhouse/commit/981b638bf))
- **document-drive:** fixed listener revisions handling ([84a13171b](https://github.com/powerhouse-inc/powerhouse/commit/84a13171b))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.18 (2025-07-24)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 3.3.0-dev.17 (2025-07-23)

### 🩹 Fixes

- update release notes ([f1b6a8e71](https://github.com/powerhouse-inc/powerhouse/commit/f1b6a8e71))
- add release notes on correct branch ([a2d60a537](https://github.com/powerhouse-inc/powerhouse/commit/a2d60a537))

### ❤️ Thank You

- Callme-T

## 3.3.0-dev.16 (2025-07-22)

### 🩹 Fixes

- **reactor-api:** remove body-parser depecration warning ([4098ffedd](https://github.com/powerhouse-inc/powerhouse/commit/4098ffedd))
- **common,document-drive,reactor-api,reactor-browser:** revert undefined return on getDocument methods ([fc145a82a](https://github.com/powerhouse-inc/powerhouse/commit/fc145a82a))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.15 (2025-07-17)

### 🩹 Fixes

- **codegen:** updated subgraph template to deal with undefined return on getDocument ([7b2862a91](https://github.com/powerhouse-inc/powerhouse/commit/7b2862a91))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.14 (2025-07-17)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 3.3.0-dev.13 (2025-07-17)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 3.3.0-dev.12 (2025-07-17)

### 🚀 Features

- **reactor-api,reactor-browser,document-drive,codegen,connect:** operation to relationalDb renaming, relational db type improvements, added namespace methods to IRelationalDb ([fd35c3500](https://github.com/powerhouse-inc/powerhouse/commit/fd35c3500))

### 🩹 Fixes

- **document-drive:** use lowercase letters when hashing relational processor namespace ([87c7944d3](https://github.com/powerhouse-inc/powerhouse/commit/87c7944d3))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.11 (2025-07-16)

### 🚀 Features

- **codegen,document-drive,reactor-api:** use namespaces per drive and operational processor ([9f2280929](https://github.com/powerhouse-inc/powerhouse/commit/9f2280929))
- **document-drive:** anticipate undefined return values for documents and drives ([9bd1bba7b](https://github.com/powerhouse-inc/powerhouse/commit/9bd1bba7b))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.10 (2025-07-15)

### 🩹 Fixes

- **codegen:** remove sucrase dependency and update schema gen ([9d3efd2ec](https://github.com/powerhouse-inc/powerhouse/commit/9d3efd2ec))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.3.0-dev.9 (2025-07-10)

### 🩹 Fixes

- force release ([8185a3b37](https://github.com/powerhouse-inc/powerhouse/commit/8185a3b37))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.3.0-dev.8 (2025-07-10)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 3.3.0-dev.7 (2025-07-10)

### 🩹 Fixes

- **reactor-api:** update document exopect revision ([#1680](https://github.com/powerhouse-inc/powerhouse/pull/1680))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 3.3.0-dev.6 (2025-07-10)

### 🚀 Features

- **codegen:** support loading migration typescript file ([d3cc1957b](https://github.com/powerhouse-inc/powerhouse/commit/d3cc1957b))

### 🩹 Fixes

- **codegen,ph-cli:** make schema-file optional and updated generate help text ([adad303a8](https://github.com/powerhouse-inc/powerhouse/commit/adad303a8))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.5 (2025-07-09)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 3.3.0-dev.1 (2025-07-04)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

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
- backward compat fix ([3e31c429f](https://github.com/powerhouse-inc/powerhouse/commit/3e31c429f))
- compile errors in reactor-api ([6274b8b77](https://github.com/powerhouse-inc/powerhouse/commit/6274b8b77))
- moving graphql transformations into a shared function so unit tests can reuse them ([68a380eba](https://github.com/powerhouse-inc/powerhouse/commit/68a380eba))

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

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 3.2.0-dev.7 (2025-06-28)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 3.2.0-dev.6 (2025-06-27)

### 🚀 Features

- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))
- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### 🩹 Fixes

- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))
- backward compat fix ([3e31c429f](https://github.com/powerhouse-inc/powerhouse/commit/3e31c429f))
- compile errors in reactor-api ([6274b8b77](https://github.com/powerhouse-inc/powerhouse/commit/6274b8b77))
- moving graphql transformations into a shared function so unit tests can reuse them ([68a380eba](https://github.com/powerhouse-inc/powerhouse/commit/68a380eba))

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

- Guillermo Puente Sandoval @gpuente

## 3.2.0-dev.3 (2025-06-24)

### 🩹 Fixes

- **connect, builder-tools:** disable external packages in dev mode ([e13243874](https://github.com/powerhouse-inc/powerhouse/commit/e13243874))

### ❤️ Thank You

- acaldas

## 3.2.0-dev.2 (2025-06-20)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.40 (2025-06-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.39 (2025-06-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.38 (2025-06-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.37 (2025-06-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.36 (2025-06-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.35 (2025-06-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.34 (2025-06-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.33 (2025-06-18)

### 🩹 Fixes

- deploy not on push to main ([63eef7020](https://github.com/powerhouse-inc/powerhouse/commit/63eef7020))
- deploy powerhouse to available environments ([a45859a22](https://github.com/powerhouse-inc/powerhouse/commit/a45859a22))

### ❤️ Thank You

- Frank

## 2.5.0-dev.32 (2025-06-18)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.31 (2025-06-18)

### 🚀 Features

- **reactor:** initial event-bus implementation with tests and benchmarks ([ef5b3c42e](https://github.com/powerhouse-inc/powerhouse/commit/ef5b3c42e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 2.5.0-dev.30 (2025-06-17)

### 🩹 Fixes

- **connect:** set proper tag on docker build ([598c1b3fb](https://github.com/powerhouse-inc/powerhouse/commit/598c1b3fb))

### ❤️ Thank You

- Frank

## 2.5.0-dev.29 (2025-06-17)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.28 (2025-06-16)

### 🚀 Features

- add app skeleton to html at build time ([1882bb820](https://github.com/powerhouse-inc/powerhouse/commit/1882bb820))

### ❤️ Thank You

- acaldas

## 2.5.0-dev.27 (2025-06-16)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.26 (2025-06-16)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

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
- **docker-compose:** work with published images ([9f31b70fb](https://github.com/powerhouse-inc/powerhouse/commit/9f31b70fb))
- **ci:** build and publish docker images on newly created tags ([ee930c4a4](https://github.com/powerhouse-inc/powerhouse/commit/ee930c4a4))

### ❤️ Thank You

- Frank

## 2.5.0-dev.23 (2025-06-13)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.22 (2025-06-13)

### 🩹 Fixes

- **ci:** set proper tags for docker images ([3cab91969](https://github.com/powerhouse-inc/powerhouse/commit/3cab91969))
- **ci:** connect deployment ([8ac8e423b](https://github.com/powerhouse-inc/powerhouse/commit/8ac8e423b))

### ❤️ Thank You

- Frank

## 2.5.0-dev.21 (2025-06-12)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.20 (2025-06-12)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.19 (2025-06-12)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.18 (2025-06-12)

### 🚀 Features

- added docker publish workflow ([adf65ef8a](https://github.com/powerhouse-inc/powerhouse/commit/adf65ef8a))

### ❤️ Thank You

- Frank

## 2.5.0-dev.17 (2025-06-12)

### 🚀 Features

- show app skeleton while loading and accessibility fixes ([4f96e2472](https://github.com/powerhouse-inc/powerhouse/commit/4f96e2472))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.16 (2025-06-11)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.15 (2025-06-11)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.14 (2025-06-10)

### 🚀 Features

- improved analytics frontend integration ([269aed50c](https://github.com/powerhouse-inc/powerhouse/commit/269aed50c))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.13 (2025-06-10)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.12 (2025-06-10)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.11 (2025-06-07)

### 🚀 Features

- **connect:** updated diff-analyzer processor ([ce5d1219f](https://github.com/powerhouse-inc/powerhouse/commit/ce5d1219f))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.10 (2025-06-06)

### 🚀 Features

- run analytics db on web worker ([ecf79575f](https://github.com/powerhouse-inc/powerhouse/commit/ecf79575f))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.9 (2025-06-05)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.8 (2025-06-05)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.7 (2025-06-05)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.6 (2025-06-05)

### 🩹 Fixes

- set node 22 in release branch workflow ([b33681938](https://github.com/powerhouse-inc/powerhouse/commit/b33681938))

### ❤️ Thank You

- Frank

## 2.5.0-dev.5 (2025-06-05)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.4 (2025-06-05)

### 🩹 Fixes

- **builder-tools:** move esbuild dev dep to deps ([baa22be6f](https://github.com/powerhouse-inc/powerhouse/commit/baa22be6f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.3 (2025-06-05)

### 🚀 Features

- **builder-tools:** add node polyfills esbuild plugin for connect build ([43dd16b4d](https://github.com/powerhouse-inc/powerhouse/commit/43dd16b4d))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.2 (2025-06-05)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.1 (2025-06-05)

This was a version bump only for @powerhousedao/reactor-api to align it with other projects, there were no code changes.

## 2.5.0-dev.0 (2025-06-04)

### 🚀 Features

- **academy:** centralize husky & auto-update cli docs ([8c92e0bb1](https://github.com/powerhouse-inc/powerhouse/commit/8c92e0bb1))
- **ph-cli:** added setup-service command ([dfa082aa6](https://github.com/powerhouse-inc/powerhouse/commit/dfa082aa6))
- **scripts:** updated setup scripts ([9f7fa7644](https://github.com/powerhouse-inc/powerhouse/commit/9f7fa7644))
- enforce conventional commits ([faa49da40](https://github.com/powerhouse-inc/powerhouse/commit/faa49da40))
- **switchboard:** added authentication middleware ([7cab35e96](https://github.com/powerhouse-inc/powerhouse/commit/7cab35e96))
- **switchboard:** added authenticated user and role check to graphql context ([8c5699998](https://github.com/powerhouse-inc/powerhouse/commit/8c5699998))
- removed scalars package ([d6f7059a7](https://github.com/powerhouse-inc/powerhouse/commit/d6f7059a7))
- enabled switchboard command ([5a9c467bf](https://github.com/powerhouse-inc/powerhouse/commit/5a9c467bf))
- **renown:** output js build ([d93a3111a](https://github.com/powerhouse-inc/powerhouse/commit/d93a3111a))
- **reactor-api:** removed auth subgraph and added new auth implementation part1 ([55e54aa10](https://github.com/powerhouse-inc/powerhouse/commit/55e54aa10))
- removed scalars dependencies ([596aedbd5](https://github.com/powerhouse-inc/powerhouse/commit/596aedbd5))
- **builder-tools:** handle recursive objects in initial state generator ([c9eedcc43](https://github.com/powerhouse-inc/powerhouse/commit/c9eedcc43))
- **monorepo:** bump graphql lib ([ba9d5d338](https://github.com/powerhouse-inc/powerhouse/commit/ba9d5d338))
- **monorepo:** handle updating monorepo build deps ([db2ac2316](https://github.com/powerhouse-inc/powerhouse/commit/db2ac2316))
- **monorepo:** regenerate lockfile ([a6c390b4e](https://github.com/powerhouse-inc/powerhouse/commit/a6c390b4e))
- **builder-tools:** fix wrong value used for field id ([a6c6142e0](https://github.com/powerhouse-inc/powerhouse/commit/a6c6142e0))
- **reactor-api,reactor-local:** updated analytics dependencies ([cbeace573](https://github.com/powerhouse-inc/powerhouse/commit/cbeace573))
- **reactor-api,reactor-local,switchboard:** wait initial timeout before start listening to requests ([409f1e316](https://github.com/powerhouse-inc/powerhouse/commit/409f1e316))

### 🩹 Fixes

- **academy:** lockfile issue second time' ([6208fe614](https://github.com/powerhouse-inc/powerhouse/commit/6208fe614))
- **academy:** fix frozen lockfile issue' ([80f18ec73](https://github.com/powerhouse-inc/powerhouse/commit/80f18ec73))
- **pre-commit:** use bash syntax and shebang ([da00ff581](https://github.com/powerhouse-inc/powerhouse/commit/da00ff581))
- added missing dep to academy ([4ec6c8278](https://github.com/powerhouse-inc/powerhouse/commit/4ec6c8278))
- **academy:** clean up husky script ([e18e26cd8](https://github.com/powerhouse-inc/powerhouse/commit/e18e26cd8))
- **reactor-api:** add preferredEditor argument to addDrive method ([dbd425fa2](https://github.com/powerhouse-inc/powerhouse/commit/dbd425fa2))
- **switchboard:** docker build ([7052e39e1](https://github.com/powerhouse-inc/powerhouse/commit/7052e39e1))
- **reactor-api:** allow unauthorized GET requests if auth is enabled ([b0ca34491](https://github.com/powerhouse-inc/powerhouse/commit/b0ca34491))
- docker build with PH_PACKAGES ([856ac1187](https://github.com/powerhouse-inc/powerhouse/commit/856ac1187))
- **reactor-api:** removed protection for option requests ([ba37db4d4](https://github.com/powerhouse-inc/powerhouse/commit/ba37db4d4))
- **reactor-api:** isAuth helper ([a478ad6c4](https://github.com/powerhouse-inc/powerhouse/commit/a478ad6c4))
- **connect, switchboard:** signing and verification issues ([3aa76e9e6](https://github.com/powerhouse-inc/powerhouse/commit/3aa76e9e6))
- **reactor-api:** permission helper not available ([4e42a0598](https://github.com/powerhouse-inc/powerhouse/commit/4e42a0598))
- **reactor-api:** optional isAdmin on context ([12ff7a87c](https://github.com/powerhouse-inc/powerhouse/commit/12ff7a87c))
- **reactor-api:** wrong graphql type ([ee7813b7f](https://github.com/powerhouse-inc/powerhouse/commit/ee7813b7f))
- **document-drive:** fix type issue on browser storage ([240a78b41](https://github.com/powerhouse-inc/powerhouse/commit/240a78b41))
- **reactor-api:** enable introspection on supergraph ([eb6af4c55](https://github.com/powerhouse-inc/powerhouse/commit/eb6af4c55))
- **reactor-api,reactor-local,document-drive:** import processors from packages ([2c6054850](https://github.com/powerhouse-inc/powerhouse/commit/2c6054850))
- **ph-cli:** ph add does not remove installed packages ([aedfbf56e](https://github.com/powerhouse-inc/powerhouse/commit/aedfbf56e))
- **reactor:** do not let processor creation kill the application ([72420113d](https://github.com/powerhouse-inc/powerhouse/commit/72420113d))
- remove .env and add to .gitignore ([0d2d48684](https://github.com/powerhouse-inc/powerhouse/commit/0d2d48684))
- **switchboard,reactor-local:** latest version of sky atlas was not being installed ([72bf72fd4](https://github.com/powerhouse-inc/powerhouse/commit/72bf72fd4))
- **reactor-api:** use getDrive instead of getDocument when driveId is requested ([bd0d1bfa3](https://github.com/powerhouse-inc/powerhouse/commit/bd0d1bfa3))
- **reactor-api:** proper resolution of prefixed file and foldertypes ([2b4297655](https://github.com/powerhouse-inc/powerhouse/commit/2b4297655))
- **reactor-api:** added resolver for DocumentDrive_Node ([68913cd8d](https://github.com/powerhouse-inc/powerhouse/commit/68913cd8d))
- **reactor-local,reactor-api:** update router after loading local subgraphs ([9cf1b2130](https://github.com/powerhouse-inc/powerhouse/commit/9cf1b2130))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Callme-T
- Frank
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter

## 1.2.0 (2024-10-29)

### 🚀 Features

- **reactor-api:** added access public ([0481de9e](https://github.com/powerhouse-inc/powerhouse/commit/0481de9e))
- **reactor-api:** init project ([#388](https://github.com/powerhouse-inc/powerhouse/pull/388))

### ❤️  Thank You

- acaldas
- Guillermo Puente @gpuente

## 1.1.0 (2024-10-29)

### 🚀 Features

- **reactor-api:** init project ([#388](https://github.com/powerhouse-inc/powerhouse/pull/388))

### ❤️  Thank You

- acaldas