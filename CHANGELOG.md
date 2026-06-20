## 6.2.0-dev.25 (2026-06-20)

### 🚀 Features

- doc-capture skill for ph-lora( ([446d854b4](https://github.com/powerhouse-inc/powerhouse/commit/446d854b4))

### 🩹 Fixes

- retry touchChannel if a channel is not found on push ([12d4367f7](https://github.com/powerhouse-inc/powerhouse/commit/12d4367f7))
- retry touchChannel if a channel is not found on push ([#2751](https://github.com/powerhouse-inc/powerhouse/pull/2751))
- academy agents ([4630e22d9](https://github.com/powerhouse-inc/powerhouse/commit/4630e22d9))
- updated vetra studio ([240c144b0](https://github.com/powerhouse-inc/powerhouse/commit/240c144b0))
- cleanup article ([adfbb2abd](https://github.com/powerhouse-inc/powerhouse/commit/adfbb2abd))

### ❤️ Thank You

- Benjamin Jordan
- CallmeT-ty @CallmeT-ty

## 6.2.0-dev.24 (2026-06-19)

### 🩹 Fixes

- release unblocker & clean up ([56090fd53](https://github.com/powerhouse-inc/powerhouse/commit/56090fd53))

### ❤️ Thank You

- CallmeT-ty @CallmeT-ty

## 6.2.0-dev.23 (2026-06-18)

### 🚀 Features

- **connect:** self-host React + base-aware externalize-vendor ([2ce1cbdc1](https://github.com/powerhouse-inc/powerhouse/commit/2ce1cbdc1))

### 🩹 Fixes

- **academy:** point cli-docs generator at relocated CLITooling path ([1dadb16e3](https://github.com/powerhouse-inc/powerhouse/commit/1dadb16e3))
- **builder-tools:** force-exit React self-host worker + type pkg exports ([828bb3129](https://github.com/powerhouse-inc/powerhouse/commit/828bb3129))

### ❤️ Thank You

- acaldas

## 6.2.0-dev.21 (2026-06-17)

### 🚀 Features

- use shadcn type theming class names ([#2720](https://github.com/powerhouse-inc/powerhouse/pull/2720))

### 🩹 Fixes

- **codegen:** read reducer method names from the operations interface AST ([9d9480608](https://github.com/powerhouse-inc/powerhouse/commit/9d9480608))
- **codegen:** preserve existing modules when rebuilding aggregates ([5091fbabd](https://github.com/powerhouse-inc/powerhouse/commit/5091fbabd))

### 🔥 Performance

- **codegen:** lighten ts-morph Project + restore previous-version source-file lookup ([7c826d202](https://github.com/powerhouse-inc/powerhouse/commit/7c826d202))
- **connect:** serve Connect + heavy deps from a prebuilt vendor in dev (opt-in) ([8c530ad4a](https://github.com/powerhouse-inc/powerhouse/commit/8c530ad4a))

### ❤️ Thank You

- acaldas
- Ryan Wolhuter @ryanwolhuter

## 6.2.0-dev.20 (2026-06-17)

This was a version bump only, there were no code changes.

## 6.2.0-dev.19 (2026-06-16)

### 🚀 Features

- **connect:** prompt login for auth-protected drives ([#2727](https://github.com/powerhouse-inc/powerhouse/pull/2727))

### 🩹 Fixes

- subscriptions now sit behind auth ([82ac20cef](https://github.com/powerhouse-inc/powerhouse/commit/82ac20cef))
- allow UPPER_SNAKE_CASE ([5cd154fb7](https://github.com/powerhouse-inc/powerhouse/commit/5cd154fb7))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente Sandoval @gpuente

## 6.2.0-dev.18 (2026-06-16)

### 🩹 Fixes

- **switchboard:** load reactor-api vite loader lazily ([05c966791](https://github.com/powerhouse-inc/powerhouse/commit/05c966791))

### ❤️ Thank You

- acaldas

## 6.2.0-dev.17 (2026-06-16)

### 🩹 Fixes

- mcp and gql channel sync were not both behind auth ([3d145309d](https://github.com/powerhouse-inc/powerhouse/commit/3d145309d))
- auth issue where slug operations skipped all auth ([6e8500bca](https://github.com/powerhouse-inc/powerhouse/commit/6e8500bca))
- fixed a performance regression and consolidated some sloppy code ([3b9eecf3b](https://github.com/powerhouse-inc/powerhouse/commit/3b9eecf3b))
- biuld fix ([aeeff5db9](https://github.com/powerhouse-inc/powerhouse/commit/aeeff5db9))
- adding missing lint scripts ([c1d40c3f7](https://github.com/powerhouse-inc/powerhouse/commit/c1d40c3f7))

### ❤️ Thank You

- Benjamin Jordan

## 6.2.0-dev.16 (2026-06-15)

### 🩹 Fixes

- **codegen:** resolve graphql-codegen plugins from this package ([3d9482993](https://github.com/powerhouse-inc/powerhouse/commit/3d9482993))

### ❤️ Thank You

- acaldas

## 6.2.0-dev.15 (2026-06-15)

This was a version bump only, there were no code changes.

## 6.2.0-dev.14 (2026-06-14)

This was a version bump only, there were no code changes.

## 6.2.0-dev.13 (2026-06-13)

### 🩹 Fixes

- very simple ttl cache on renown credentials inside the reactor-api, full fix is grpc s2s call and/or shared cache ([dbf3d698c](https://github.com/powerhouse-inc/powerhouse/commit/dbf3d698c))
- this test flaked 2% of the time because of an unpinned random() ([95dcf1fdc](https://github.com/powerhouse-inc/powerhouse/commit/95dcf1fdc))
- **renown:** handle credential api response without eip712 domain on login ([96238fcd2](https://github.com/powerhouse-inc/powerhouse/commit/96238fcd2))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.2.0-dev.12 (2026-06-12)

This was a version bump only, there were no code changes.

## 6.2.0-dev.11 (2026-06-12)

### 🚀 Features

- **connect:** move theme toggle into settings nav ([7622718a7](https://github.com/powerhouse-inc/powerhouse/commit/7622718a7))

### 🩹 Fixes

- kysely types were getting embedded in type defs and not matching later on because typescript is a broken and terrible language ([b5947709f](https://github.com/powerhouse-inc/powerhouse/commit/b5947709f))
- linting bug in script ([9217377fc](https://github.com/powerhouse-inc/powerhouse/commit/9217377fc))
- typecheck fix with updates ([97d363c57](https://github.com/powerhouse-inc/powerhouse/commit/97d363c57))
- build fix because of vite incompatibility ([4dc94747e](https://github.com/powerhouse-inc/powerhouse/commit/4dc94747e))
- **reactor, shared, codegen:** deep core issue where replays were not respecting version upgrades which broke load, caches, and snapshots ([f3cf03754](https://github.com/powerhouse-inc/powerhouse/commit/f3cf03754))
- **registry,connect:** slim package manifests so oversized publishes can't break the package manager ([#2718](https://github.com/powerhouse-inc/powerhouse/pull/2718))

### ❤️ Thank You

- Benjamin Jordan
- CallmeT-ty @CallmeT-ty
- Claude Sonnet 4.6
- Guillermo Puente Sandoval @gpuente

## 6.2.0-dev.10 (2026-06-11)

### 🩹 Fixes

- escape angle brackets as HTML entities and wrap bare URLs in generated CLI docs to unbreak academy MDX build ([aba516ba0](https://github.com/powerhouse-inc/powerhouse/commit/aba516ba0))
- **connect:** make PH_CONNECT_CONFIG_JSON overrides win over baked runtime-config defaults ([145a3d423](https://github.com/powerhouse-inc/powerhouse/commit/145a3d423))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.2.0-dev.9 (2026-06-11)

### 🚀 Features

- **switchboard:** add errors-only sentry mode via env gate ([c29bb21ee](https://github.com/powerhouse-inc/powerhouse/commit/c29bb21ee))

### 🩹 Fixes

- **connect:** stop nginx root-file regex from hijacking /assets at default base path ([f72fe2fe5](https://github.com/powerhouse-inc/powerhouse/commit/f72fe2fe5))
- **switchboard:** stop tracing background DB polls + align @sentry versions ([c5b307333](https://github.com/powerhouse-inc/powerhouse/commit/c5b307333))

### ❤️ Thank You

- Frank Pfeift
- Guillermo Puente @gpuente

## 6.2.0-dev.8 (2026-06-11)

### 🚀 Features

- **ph-cli:** add --drives-public-base to ph vetra ([48005ada9](https://github.com/powerhouse-inc/powerhouse/commit/48005ada9))

### ❤️ Thank You

- acaldas

## 6.2.0-dev.7 (2026-06-11)

This was a version bump only, there were no code changes.

## 6.2.0-dev.6 (2026-06-10)

### 🚀 Features

- **connect:** runtime-dynamic deploy base for Connect builds ([2f4c6441f](https://github.com/powerhouse-inc/powerhouse/commit/2f4c6441f))

### ❤️ Thank You

- acaldas

## 6.2.0-dev.5 (2026-06-10)

### 🩹 Fixes

- tons of edge cases when these vars diverge -- instead, fail fast ([26bf5963c](https://github.com/powerhouse-inc/powerhouse/commit/26bf5963c))

### ❤️ Thank You

- Benjamin Jordan

## 6.2.0-dev.4 (2026-06-09)

### 🚀 Features

- setting up registry audit tool ([9aa531d0b](https://github.com/powerhouse-inc/powerhouse/commit/9aa531d0b))
- more steps -- typecheck fixes and a new load function that loads it into switchboard ([0cf7649b1](https://github.com/powerhouse-inc/powerhouse/commit/0cf7649b1))
- added a new audit pass that creates documents and then queries them ([cde281f1e](https://github.com/powerhouse-inc/powerhouse/commit/cde281f1e))
- added a readiness probe to switchboard to fix tests and for best practices ([b8966f5a2](https://github.com/powerhouse-inc/powerhouse/commit/b8966f5a2))

### 🩹 Fixes

- needs to hit verdaccio ([f75a67aea](https://github.com/powerhouse-inc/powerhouse/commit/f75a67aea))
- **codegen:** satisfy require-await in ReducerGenerator test stub ([ba02dbc18](https://github.com/powerhouse-inc/powerhouse/commit/ba02dbc18))
- **connect:** don't block startup on default drive sync ([d1604d8ea](https://github.com/powerhouse-inc/powerhouse/commit/d1604d8ea))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 4.8

## 6.2.0-dev.3 (2026-06-08)

This was a version bump only, there were no code changes.

## 6.2.0-dev.2 (2026-06-07)

This was a version bump only, there were no code changes.

## 6.2.0-dev.1 (2026-06-06)

This was a version bump only, there were no code changes.

## 6.2.0-dev.0 (2026-06-05)

This was a version bump only, there were no code changes.

## 6.1.0-dev.21 (2026-06-05)

### 🚀 Features

- **connect:** make packages live-reload SSE channel opt-in ([66c8936cd](https://github.com/powerhouse-inc/powerhouse/commit/66c8936cd))

### 🩹 Fixes

- **registry:** increate jwt expiry to 90 days ([55ce1f00c](https://github.com/powerhouse-inc/powerhouse/commit/55ce1f00c))
- **vetra:** only load tsmorph project for vetra drives ([6763ba87a](https://github.com/powerhouse-inc/powerhouse/commit/6763ba87a))

### ❤️ Thank You

- acaldas

## 6.1.0-dev.20 (2026-06-05)

### 🩹 Fixes

- **reactor-attachments:** tsdown config bug where shared types were exported twice, breaking instanceof ([5e5d0206f](https://github.com/powerhouse-inc/powerhouse/commit/5e5d0206f))

### ❤️ Thank You

- Benjamin Jordan

## 6.1.0-dev.19 (2026-06-04)

### 🩹 Fixes

- **academy:** escape angle brackets in generated CLI docs for MDX 3 ([b23de77c0](https://github.com/powerhouse-inc/powerhouse/commit/b23de77c0))
- **academy:** drop unused 'async' on generateCombinedCliDocs (eslint require-await) ([c9024bf00](https://github.com/powerhouse-inc/powerhouse/commit/c9024bf00))
- **registry:** make verdaccio uplink maxage configurable, default to 2m ([e3f4942a8](https://github.com/powerhouse-inc/powerhouse/commit/e3f4942a8))

### ❤️ Thank You

- Frank Pfeift

## 6.1.0-dev.18 (2026-06-04)

### 🚀 Features

- **reactor-attachment:** added attachment client and refactored types so they do not pollute shared ([415dd9875](https://github.com/powerhouse-inc/powerhouse/commit/415dd9875))
- **reactor-attachments:** hash-first refs — client-supplied hash at reserve, pending status, and submit-before-upload support ([6a45c5de5](https://github.com/powerhouse-inc/powerhouse/commit/6a45c5de5))

### 🩹 Fixes

- merge fix ([2ac75f90c](https://github.com/powerhouse-inc/powerhouse/commit/2ac75f90c))
- **reactor:** fixing reactor tests now that create/update is in document model ([cb566c200](https://github.com/powerhouse-inc/powerhouse/commit/cb566c200))

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

### 🩹 Fixes

- fixing linter issues and removing some useless comments ([36e1858a5](https://github.com/powerhouse-inc/powerhouse/commit/36e1858a5))
- **builder-tools:** make dev vite plugin URLs base-path-aware ([#2679](https://github.com/powerhouse-inc/powerhouse/pull/2679))
- **connect:** namespace reactor storage by base path ([223c39b59](https://github.com/powerhouse-inc/powerhouse/commit/223c39b59))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Guillermo Puente Sandoval @gpuente

## 6.1.0-dev.15 (2026-06-02)

### 🚀 Features

- **registry:** cache headers on CDN responses, 503 on upstream error, leaner warm-up ([e5ed36354](https://github.com/powerhouse-inc/powerhouse/commit/e5ed36354))
- **renown:** add EIP-712 credential signing and signature verification ([069417a20](https://github.com/powerhouse-inc/powerhouse/commit/069417a20))

### 🩹 Fixes

- **builder-tools:** pass PH_CONNECT_BASE_PATH to vite base so connect serves under a path prefix ([b9452ab58](https://github.com/powerhouse-inc/powerhouse/commit/b9452ab58))
- **registry:** address remaining CDN review feedback ([21268c0d9](https://github.com/powerhouse-inc/powerhouse/commit/21268c0d9))
- **renown:** export credential module from node entrypoint ([d1ec4a847](https://github.com/powerhouse-inc/powerhouse/commit/d1ec4a847))

### ❤️ Thank You

- acaldas

## 6.1.0-dev.14 (2026-06-02)

### 🚀 Features

- add dark mode classes ([#2629](https://github.com/powerhouse-inc/powerhouse/pull/2629))

### 🩹 Fixes

- looks like a bad import ([82988fd2a](https://github.com/powerhouse-inc/powerhouse/commit/82988fd2a))
- **reactor-browser:** fix issue causing renown spam and breaking login ([2cdf76338](https://github.com/powerhouse-inc/powerhouse/commit/2cdf76338))

### ❤️ Thank You

- Benjamin Jordan
- CallmeT-ty @CallmeT-ty
- Claude Sonnet 4.6
- Ryan Wolhuter @ryanwolhuter

## 6.1.0-dev.13 (2026-06-01)

### 🩹 Fixes

- **document-model:** seed document-scope operations on create ([5fe967b8b](https://github.com/powerhouse-inc/powerhouse/commit/5fe967b8b))

### ❤️ Thank You

- acaldas

## 6.1.0-dev.12 (2026-06-01)

This was a version bump only, there were no code changes.

## 6.1.0-dev.11 (2026-05-31)

This was a version bump only, there were no code changes.

## 6.1.0-dev.10 (2026-05-30)

### 🩹 Fixes

- added a failing test for the set_name issue, which exposed the document-drive tests weren't running at all ([8221e66b9](https://github.com/powerhouse-inc/powerhouse/commit/8221e66b9))
- fix issue from refactor ([d6c728c95](https://github.com/powerhouse-inc/powerhouse/commit/d6c728c95))
- merge duplicate resolve keys in shared vitest config ([f65e56f08](https://github.com/powerhouse-inc/powerhouse/commit/f65e56f08))
- re-adding emitted linter ignore -- ew ([cd37736cb](https://github.com/powerhouse-inc/powerhouse/commit/cd37736cb))
- **ci:** bump playwright to 1.60.0 to fix install hang on node 24.16+ ([#2669](https://github.com/powerhouse-inc/powerhouse/pull/2669))
- **document-drive:** document drive needs to more appropriately handle unicode and control characters ([38d3fefee](https://github.com/powerhouse-inc/powerhouse/commit/38d3fefee))
- **reactor:** fix issue where delete could fail on orphaned docs ([e6ec50907](https://github.com/powerhouse-inc/powerhouse/commit/e6ec50907))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 4.8
- Guillermo Puente Sandoval @gpuente

## 6.1.0-dev.9 (2026-05-29)

### 🩹 Fixes

- **reactor-attachments:** unfortunately because browsers suck we have to buffer the upload blob ([13ca172c4](https://github.com/powerhouse-inc/powerhouse/commit/13ca172c4))
- **switchboard:** fix fetch bindings ([0021b39a9](https://github.com/powerhouse-inc/powerhouse/commit/0021b39a9))

### ❤️ Thank You

- Benjamin Jordan

## 6.1.0-dev.8 (2026-05-28)

### 🚀 Features

- **ph-cli:** support `--clone` with --npm; reject yarn/bun; throw on errors ([7aebc80f3](https://github.com/powerhouse-inc/powerhouse/commit/7aebc80f3))

### 🩹 Fixes

- **reactor-api:** correctly load subgraphs from registry packages and surface real load failures ([e3b84ee12](https://github.com/powerhouse-inc/powerhouse/commit/e3b84ee12))

### ❤️ Thank You

- acaldas

## 6.1.0-dev.7 (2026-05-28)

### 🚀 Features

- **ph-cli:** add `ph init --template <path>` fast path ([ea9c646c9](https://github.com/powerhouse-inc/powerhouse/commit/ea9c646c9))

### 🩹 Fixes

- **codegen:** dedup react/date-fns/vite/rolldown in generated projects ([dc94b0934](https://github.com/powerhouse-inc/powerhouse/commit/dc94b0934))
- **document-model:** throw on missing target id in reducers ([f58102b98](https://github.com/powerhouse-inc/powerhouse/commit/f58102b98))
- **document-model:** fail on duplicate ids in error/example/move reducers ([dfd2f02f5](https://github.com/powerhouse-inc/powerhouse/commit/dfd2f02f5))
- **document-model:** let delete recover duplicates, validate move first ([56e28e55d](https://github.com/powerhouse-inc/powerhouse/commit/56e28e55d))
- **switchboard,reactor-bench,profiling:** migrate Sentry 9->10 and OpenTelemetry v1->v2 ([5e5c1ef9e](https://github.com/powerhouse-inc/powerhouse/commit/5e5c1ef9e))

### ❤️ Thank You

- acaldas

## 6.1.0-dev.6 (2026-05-28)

### 🚀 Features

- add OpenPanel client singleton and types ([a05cbc19d](https://github.com/powerhouse-inc/powerhouse/commit/a05cbc19d))
- feat(openpanel): add event mappings, validation, and naming helpers ([556688064](https://github.com/powerhouse-inc/powerhouse/commit/556688064))
- feat(openpanel): implement processor and factory for event tracking ([837a91df2](https://github.com/powerhouse-inc/powerhouse/commit/837a91df2))
- mount OpenPanel with consent gating and user identification ([aa7c77b07](https://github.com/powerhouse-inc/powerhouse/commit/aa7c77b07))
- fix type errors in processor.test.ts that break typecheck ([9a5dd1973](https://github.com/powerhouse-inc/powerhouse/commit/9a5dd1973))
- adding attachment service to the switchboard options ([a88e4cdc6](https://github.com/powerhouse-inc/powerhouse/commit/a88e4cdc6))
- **connect:** add OpenPanel Analytics configuration ([b39d072b2](https://github.com/powerhouse-inc/powerhouse/commit/b39d072b2))
- **openpanel:** add useOpenPanel hook with pre-init event buffering ([292fb376f](https://github.com/powerhouse-inc/powerhouse/commit/292fb376f))

### 🩹 Fixes

- pnpm-lock file ([d5019827c](https://github.com/powerhouse-inc/powerhouse/commit/d5019827c))
- linter should not lint too deep ([1f0e29003](https://github.com/powerhouse-inc/powerhouse/commit/1f0e29003))
- **builder-tools:** allow blob worker-src in Connect CSP to unblock document download ([f0b31a3f6](https://github.com/powerhouse-inc/powerhouse/commit/f0b31a3f6))
- **connect:** clarify trackUiEvents dormancy and remove invalid tsconfigPaths config ([83bcc3a76](https://github.com/powerhouse-inc/powerhouse/commit/83bcc3a76))
- **connect:** resolve @powerhousedao/connect/\* aliases in vitest ([f7de787c6](https://github.com/powerhouse-inc/powerhouse/commit/f7de787c6))
- **openpanel:** catch synchronous track errors in forward() ([36361c996](https://github.com/powerhouse-inc/powerhouse/commit/36361c996))
- **openpanel:** resolve eslint failures in static checks ([9bbefa737](https://github.com/powerhouse-inc/powerhouse/commit/9bbefa737))
- **useOpenPanel:** catch async errors from client.track in forward() ([c16887eb0](https://github.com/powerhouse-inc/powerhouse/commit/c16887eb0))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 4.7
- Guillermo Puente @gpuente

## 6.1.0-dev.5 (2026-05-27)

### 🚀 Features

- **otel:** added new gauge to measure chain length ([7770339aa](https://github.com/powerhouse-inc/powerhouse/commit/7770339aa))
- **reactor:** worker protocol ([c1bb0bd30](https://github.com/powerhouse-inc/powerhouse/commit/c1bb0bd30))
- **reactor:** added workerhandle, parent-side ipc wrapper ([b1955e3a6](https://github.com/powerhouse-inc/powerhouse/commit/b1955e3a6))
- **reactor:** worker entry skeleton and forwarding logs ([00eedf6c4](https://github.com/powerhouse-inc/powerhouse/commit/00eedf6c4))
- **reactor:** added withDocumentModelSpecs api ([eebdb01d9](https://github.com/powerhouse-inc/powerhouse/commit/eebdb01d9))
- **reactor:** pulling job execution results into a shared object ([b25f81776](https://github.com/powerhouse-inc/powerhouse/commit/b25f81776))
- **reactor:** make execution idempotent on opId ([f1eb86885](https://github.com/powerhouse-inc/powerhouse/commit/f1eb86885))
- **reactor:** dequeueNextMatching API ([89367e8c4](https://github.com/powerhouse-inc/powerhouse/commit/89367e8c4))
- **reactor:** workerpooljobexecutormanager + sticky router + parent-side ready enrichment ([e012f9248](https://github.com/powerhouse-inc/powerhouse/commit/e012f9248))
- **reactor:** reactor-builder integration ([32f49eecd](https://github.com/powerhouse-inc/powerhouse/commit/32f49eecd))
- **reactor:** worker pool integration test v1 ([925794dea](https://github.com/powerhouse-inc/powerhouse/commit/925794dea))
- **reactor:** multi-worker integration test -- eep ([b8b9566cf](https://github.com/powerhouse-inc/powerhouse/commit/b8b9566cf))
- **reactor:** wiring up the dynamic model loading ([e35a2408d](https://github.com/powerhouse-inc/powerhouse/commit/e35a2408d))
- **reactor:** benchmark for workers ([8ff51da2f](https://github.com/powerhouse-inc/powerhouse/commit/8ff51da2f))
- **reactor:** more fine-grained metrics to figure out read bottleneck ([6e9aa4d06](https://github.com/powerhouse-inc/powerhouse/commit/6e9aa4d06))
- **reactor:** blech, more instrumentation to track down db contention issues in benchmarks ([70faf4fbd](https://github.com/powerhouse-inc/powerhouse/commit/70faf4fbd))
- **reactor:** initial projection workers ([6a2651936](https://github.com/powerhouse-inc/powerhouse/commit/6a2651936))
- **reactor, otel:** event loop instrumentation ([83099da05](https://github.com/powerhouse-inc/powerhouse/commit/83099da05))

### 🩹 Fixes

- add hub-spoke test in test:integration ([5ab8c0b36](https://github.com/powerhouse-inc/powerhouse/commit/5ab8c0b36))
- swap never bundle for reactor-api so that subgraphs are properly detected ([7ee0fdb5b](https://github.com/powerhouse-inc/powerhouse/commit/7ee0fdb5b))
- do not double run hub-spoke and make sure postgres is running in integration tests ([6a26a7377](https://github.com/powerhouse-inc/powerhouse/commit/6a26a7377))
- ci needs to run integration tests serially, not in parallel ([d97b73622](https://github.com/powerhouse-inc/powerhouse/commit/d97b73622))
- **reactor:** grr path resolution fixes, tailwind fixes, linter fixes ([0eb6ad89f](https://github.com/powerhouse-inc/powerhouse/commit/0eb6ad89f))
- **reactor:** replace dead workers ([22280e7df](https://github.com/powerhouse-inc/powerhouse/commit/22280e7df))
- **reactor:** a number of linter and import errors needed fixed due to node imports ([060babc30](https://github.com/powerhouse-inc/powerhouse/commit/060babc30))
- **reactor:** bumping some timers for heavy contention in tests ([6abeab767](https://github.com/powerhouse-inc/powerhouse/commit/6abeab767))
- **reactor:** fix linting issues ([7e0a4af8d](https://github.com/powerhouse-inc/powerhouse/commit/7e0a4af8d))

### ❤️ Thank You

- Benjamin Jordan

## 6.1.0-dev.4 (2026-05-26)

### 🚀 Features

- **connect:** wait for remote drive sync before selecting via URL ([8693d7652](https://github.com/powerhouse-inc/powerhouse/commit/8693d7652))
- **connect:** suppress chrome when rendered inside an embed ([ab6ada257](https://github.com/powerhouse-inc/powerhouse/commit/ab6ada257))
- **document-model:** validate operation name format in reducer ([e917b20e6](https://github.com/powerhouse-inc/powerhouse/commit/e917b20e6))
- **reactor-browser:** await initial sync option for addRemoteDrive ([b255cdb75](https://github.com/powerhouse-inc/powerhouse/commit/b255cdb75))

### 🩹 Fixes

- **builder-tools:** include @powerhousedao/connect in connect-utils linkedRoots ([2865fa07f](https://github.com/powerhouse-inc/powerhouse/commit/2865fa07f))
- **connect:** materialize default drives before URL slug resolution ([516618fc7](https://github.com/powerhouse-inc/powerhouse/commit/516618fc7))

### ❤️ Thank You

- acaldas

## 6.1.0-dev.3 (2026-05-25)

This was a version bump only, there were no code changes.

## 6.1.0-dev.2 (2026-05-24)

This was a version bump only, there were no code changes.

## 6.1.0-dev.1 (2026-05-23)

This was a version bump only, there were no code changes.

## 6.1.0-dev.0 (2026-05-22)

### 🩹 Fixes

- **codegen:** fix drive editor typo on codegen boilerplate ([5548db528](https://github.com/powerhouse-inc/powerhouse/commit/5548db528))
- **ph-cli,ph-cmd,shared:** make sentry/core an optional peer dependency of shared ([fc8446e18](https://github.com/powerhouse-inc/powerhouse/commit/fc8446e18))
- **reactor-api:** moved fastify and mercurius to be optional peer dependencies ([f02aeec8c](https://github.com/powerhouse-inc/powerhouse/commit/f02aeec8c))
- **shared,ph-cli:** made rolldown an optional peer dependency ([13db8e511](https://github.com/powerhouse-inc/powerhouse/commit/13db8e511))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.258 (2026-05-22)

### 🩹 Fixes

- **reactor-api:** resolve linked packages via dist/node/<sub>/index.mjs ([b543e9a90](https://github.com/powerhouse-inc/powerhouse/commit/b543e9a90))
- **reactor-api:** lazily import gateway adapter ([c8a9a06f8](https://github.com/powerhouse-inc/powerhouse/commit/c8a9a06f8))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.257 (2026-05-21)

### 🚀 Features

- **connect:** subscribe to /\_\_packages SSE for live package updates ([5cb41a7e4](https://github.com/powerhouse-inc/powerhouse/commit/5cb41a7e4))
- **connect:** remount editor on package version bump ([4fe72d93f](https://github.com/powerhouse-inc/powerhouse/commit/4fe72d93f))
- **registry:** default to anonymous publish/unpublish ([5ca697fb7](https://github.com/powerhouse-inc/powerhouse/commit/5ca697fb7))
- **spec:** reject invalid actions atomically in addActions ([c12a4d6c5](https://github.com/powerhouse-inc/powerhouse/commit/c12a4d6c5))
- **switchboard:** accept caller-provided reactor + expose shutdown ([1e0958656](https://github.com/powerhouse-inc/powerhouse/commit/1e0958656))
- **vetra:** moved schema projection to ph-rupert-cli ([49f627e7b](https://github.com/powerhouse-inc/powerhouse/commit/49f627e7b))
- **vetra,ph-cli:** add @powerhousedao/vetra/codegen subexport for agent-driven codegen ([9689be87e](https://github.com/powerhouse-inc/powerhouse/commit/9689be87e))

### 🩹 Fixes

- address PR review for connect package-manager + vetra specPath doc ([4f330f16e](https://github.com/powerhouse-inc/powerhouse/commit/4f330f16e))
- **connect:** version-aware /\_\_packages diff with toasts and refetch ([36f2e641d](https://github.com/powerhouse-inc/powerhouse/commit/36f2e641d))
- **package-e2e:** use renamed --document flag for ph generate doc ([e3bbd1b49](https://github.com/powerhouse-inc/powerhouse/commit/e3bbd1b49))
- **vetra:** update codegen imports to v1 document-model layout ([ecdc2b23e](https://github.com/powerhouse-inc/powerhouse/commit/ecdc2b23e))
- **vetra:** repo-wide typecheck — keep ts-morph external + use existing types ([10f0a8488](https://github.com/powerhouse-inc/powerhouse/commit/10f0a8488))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.256 (2026-05-21)

### 🚀 Features

- **reactor-browser:** add useEditorFileDrop hook and DropZone opt-out ([8c6ebf73a](https://github.com/powerhouse-inc/powerhouse/commit/8c6ebf73a))

### 🩹 Fixes

- add @tokens to logger calls across packages ([b70070ae2](https://github.com/powerhouse-inc/powerhouse/commit/b70070ae2))
- prettier wrap + properly type vi.spyOn mocks in logger tests ([363795fc3](https://github.com/powerhouse-inc/powerhouse/commit/363795fc3))
- **document-model:** surface Error values in logger output ([310a45398](https://github.com/powerhouse-inc/powerhouse/commit/310a45398))
- **ph-cli:** whoops, missed a refactor ([f43138c68](https://github.com/powerhouse-inc/powerhouse/commit/f43138c68))
- **reactor-api:** pass args to logger.error calls in reactor subgraph ([b34dcf7dc](https://github.com/powerhouse-inc/powerhouse/commit/b34dcf7dc))
- **reactor-api:** share one DB client per connection string ([8a8030ee0](https://github.com/powerhouse-inc/powerhouse/commit/8a8030ee0))
- **reactor-browser:** hide DropZone overlay over editor opt-out regions ([725d185fd](https://github.com/powerhouse-inc/powerhouse/commit/725d185fd))
- **reactor-browser:** stop sync before deleting drive document ([9fec21bf5](https://github.com/powerhouse-inc/powerhouse/commit/9fec21bf5))
- **switchboard:** give users a one-shot recovery path out of broken switchboard DB state ([5fecb0fe8](https://github.com/powerhouse-inc/powerhouse/commit/5fecb0fe8))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.255 (2026-05-20)

### 🩹 Fixes

- **ph-cli:** whoops, missed a refactor ([f43138c68](https://github.com/powerhouse-inc/powerhouse/commit/f43138c68))
- **reactor-browser:** hide DropZone overlay over editor opt-out regions ([725d185fd](https://github.com/powerhouse-inc/powerhouse/commit/725d185fd))
- **reactor-browser:** stop sync before deleting drive document ([9fec21bf5](https://github.com/powerhouse-inc/powerhouse/commit/9fec21bf5))
- **switchboard:** give users a one-shot recovery path out of broken switchboard DB state ([5fecb0fe8](https://github.com/powerhouse-inc/powerhouse/commit/5fecb0fe8))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.254 (2026-05-19)

### 🚀 Features

- single-document contention integration tests are switchable between document-drive and reactor-drive ([68b59b492](https://github.com/powerhouse-inc/powerhouse/commit/68b59b492))
- prepping hub-spoke integration test ([497e70408](https://github.com/powerhouse-inc/powerhouse/commit/497e70408))
- add dark mode script ([#2619](https://github.com/powerhouse-inc/powerhouse/pull/2619))
- **e2e-utils:** share local-registry helper across e2e tests ([c3821fccd](https://github.com/powerhouse-inc/powerhouse/commit/c3821fccd))
- **reactor-api:** main integration tests now run on both reactor-drive and document-drive, includes reshuffle fix ([4f370a63f](https://github.com/powerhouse-inc/powerhouse/commit/4f370a63f))
- **reactor-drive:** initial commit ([d6b7c4f8c](https://github.com/powerhouse-inc/powerhouse/commit/d6b7c4f8c))
- **registry:** --local-packages flag to bypass npmjs uplink ([f295ab989](https://github.com/powerhouse-inc/powerhouse/commit/f295ab989))
- **vetra:** allow passing db-path through vetra command ([39c62d961](https://github.com/powerhouse-inc/powerhouse/commit/39c62d961))

### 🩹 Fixes

- add missing bg and text styles ([#2620](https://github.com/powerhouse-inc/powerhouse/pull/2620))
- wiring up reactor-drive dependency ([8c22b1658](https://github.com/powerhouse-inc/powerhouse/commit/8c22b1658))
- whoops, node-processor was not filtering properly ([6be70a29f](https://github.com/powerhouse-inc/powerhouse/commit/6be70a29f))
- update to the latest knowledge-note dump and package ([eaf7ea34a](https://github.com/powerhouse-inc/powerhouse/commit/eaf7ea34a))
- **builder-tools:** we have to expose pglite in a special way to use ph vetra with use-local ([fa323dc8b](https://github.com/powerhouse-inc/powerhouse/commit/fa323dc8b))
- **package-e2e:** unblock strict quality gates and harden cleanup ([db9b91d78](https://github.com/powerhouse-inc/powerhouse/commit/db9b91d78))
- **package-e2e:** address PR review feedback ([0ac1bcaed](https://github.com/powerhouse-inc/powerhouse/commit/0ac1bcaed))
- **package-e2e:** add host-gateway to parallel scaffold build ([de3a54fe5](https://github.com/powerhouse-inc/powerhouse/commit/de3a54fe5))
- **powerhouse-vetra-packages:** emit dts via tsc --build ([065c592ae](https://github.com/powerhouse-inc/powerhouse/commit/065c592ae))
- **reactor-drive:** fix cursor issue ([6ae17779f](https://github.com/powerhouse-inc/powerhouse/commit/6ae17779f))
- **reactor-drive:** since ADD_RELATIONSHIP and CREATE_DOCUMENT are allowed top race, the documentType should be on the relationship action ([9795cd755](https://github.com/powerhouse-inc/powerhouse/commit/9795cd755))
- **reactor-drive:** remove unused consistency token field from subgraph ([301503c38](https://github.com/powerhouse-inc/powerhouse/commit/301503c38))
- **reactor-drive:** delete is now handled by the node processor ([60d0b6404](https://github.com/powerhouse-inc/powerhouse/commit/60d0b6404))
- **reactor-drive:** fix issue where reshuffle could make paging change ([5f19f68f6](https://github.com/powerhouse-inc/powerhouse/commit/5f19f68f6))
- **reactor-drive:** do not guard against enpty folder names, throw ([582827331](https://github.com/powerhouse-inc/powerhouse/commit/582827331))

### 🔥 Performance

- **package-e2e:** parallelize docker scaffold build with publish-package ([71ac1d884](https://github.com/powerhouse-inc/powerhouse/commit/71ac1d884))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.253 (2026-05-18)

This was a version bump only, there were no code changes.

## 6.0.0-dev.252 (2026-05-17)

This was a version bump only, there were no code changes.

## 6.0.0-dev.251 (2026-05-16)

### 🩹 Fixes

- surface and fix imports broken by missing source resolution ([50022703b](https://github.com/powerhouse-inc/powerhouse/commit/50022703b))
- **codegen:** guard FolderTree template against undefined selected drive ([026a74ad9](https://github.com/powerhouse-inc/powerhouse/commit/026a74ad9))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.250 (2026-05-15)

### 🚀 Features

- **codegen:** prune stale manifest entries on generate all ([1cb8b6c3d](https://github.com/powerhouse-inc/powerhouse/commit/1cb8b6c3d))
- **vetra:** give each document model a unique extension and add spec docs ([ce35255f6](https://github.com/powerhouse-inc/powerhouse/commit/ce35255f6))

### 🩹 Fixes

- **codegen:** skip drive-app scaffold when editor.tsx is customized ([9bac87284](https://github.com/powerhouse-inc/powerhouse/commit/9bac87284))
- **codegen:** render document-types list in editor module docstring ([2012c6df1](https://github.com/powerhouse-inc/powerhouse/commit/2012c6df1))
- **codegen:** skip processor scaffold when dir uses legacy index.ts layout ([293b60e52](https://github.com/powerhouse-inc/powerhouse/commit/293b60e52))
- **codegen:** warn when skipping a processor scaffold due to legacy layout ([df2875241](https://github.com/powerhouse-inc/powerhouse/commit/df2875241))
- **codegen:** prettier formatting on processor scaffold guard ([368a5463c](https://github.com/powerhouse-inc/powerhouse/commit/368a5463c))
- **connect:** widen DocumentModelLib usage in BrowserPackageManager ([ac2b17d14](https://github.com/powerhouse-inc/powerhouse/commit/ac2b17d14))
- **vetra:** normalize processor-module input schema indentation ([215133db5](https://github.com/powerhouse-inc/powerhouse/commit/215133db5))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.249 (2026-05-15)

### 🚀 Features

- add tailwind eslint plugin ([#2612](https://github.com/powerhouse-inc/powerhouse/pull/2612))
- added release script ([20454f119](https://github.com/powerhouse-inc/powerhouse/commit/20454f119))
- added release script ([#2606](https://github.com/powerhouse-inc/powerhouse/pull/2606))

### 🩹 Fixes

- reactor tests are timing out on CI, we need less parallelization and higher timeouts ([7dc3580e2](https://github.com/powerhouse-inc/powerhouse/commit/7dc3580e2))
- sync integration test should not use atomicfs ([75d0a1785](https://github.com/powerhouse-inc/powerhouse/commit/75d0a1785))
- break circular import between exec.ts and ui.ts ([fe17e90ec](https://github.com/powerhouse-inc/powerhouse/commit/fe17e90ec))
- pin the integration test package ([a2085a260](https://github.com/powerhouse-inc/powerhouse/commit/a2085a260))
- **codegen:** install dependencies during migrate before regeneration ([ff107e29f](https://github.com/powerhouse-inc/powerhouse/commit/ff107e29f))
- **codegen:** stop reordering document-model keys and fix generateMock import ([cd86c9b51](https://github.com/powerhouse-inc/powerhouse/commit/cd86c9b51))
- **ph-cmd:** pass --allow-build to pnpm dlx during ph init ([d1ea8548c](https://github.com/powerhouse-inc/powerhouse/commit/d1ea8548c))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.248 (2026-05-14)

### 🚀 Features

- **codegen,ph-cli:** ensure correct codegen version before migrate ([da1d40c1a](https://github.com/powerhouse-inc/powerhouse/commit/da1d40c1a))
- **codegen,ph-cli:** sync feature peer deps on generate-processor / generate-subgraph ([b3a571d14](https://github.com/powerhouse-inc/powerhouse/commit/b3a571d14))
- **shared:** replace jszip with fflate for tree-shakeable zip handling ([9a417aa98](https://github.com/powerhouse-inc/powerhouse/commit/9a417aa98))

### 🩹 Fixes

- declare graphql/graphql-tag as peerDependencies to prevent dup instances ([4fec9d5b6](https://github.com/powerhouse-inc/powerhouse/commit/4fec9d5b6))
- **codegen:** preserve workspace:/catalog: version refs during migrate ([81657f46d](https://github.com/powerhouse-inc/powerhouse/commit/81657f46d))
- **codegen:** format editor module.ts with prettier on generation ([f66bac8ba](https://github.com/powerhouse-inc/powerhouse/commit/f66bac8ba))
- **codegen:** trim leading newlines from AI config templates ([252421976](https://github.com/powerhouse-inc/powerhouse/commit/252421976))
- **codegen:** pin graphql-tag dev to exact version ([5f20fd406](https://github.com/powerhouse-inc/powerhouse/commit/5f20fd406))
- **codegen:** detect analytics processors during migrate ([438ce9259](https://github.com/powerhouse-inc/powerhouse/commit/438ce9259))
- **shared:** auto-detect base64 vs binary strings in toUint8Array ([1eca8c5b1](https://github.com/powerhouse-inc/powerhouse/commit/1eca8c5b1))
- **use-local:** handle peer deps + use link: for transitive workspace refs ([4146d0df0](https://github.com/powerhouse-inc/powerhouse/commit/4146d0df0))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.247 (2026-05-14)

### 🚀 Features

- **academy:** tier 3 approach with gap reports ([e23cddbce](https://github.com/powerhouse-inc/powerhouse/commit/e23cddbce))
- **pglite-fs:** implemented a fs-backed pglite backend with in-memory WAL ([736ae675b](https://github.com/powerhouse-inc/powerhouse/commit/736ae675b))
- **pglite-fs:** adding crash tests, also adding permutations of reactor tests with new backend ([4747ba737](https://github.com/powerhouse-inc/powerhouse/commit/4747ba737))
- **ph-lora:** tier 1 doc checker, mapping, gap report for react hooks ([47c6fc620](https://github.com/powerhouse-inc/powerhouse/commit/47c6fc620))
- **ph-lora:** tier 2 CI, mapping validator, file-level sourceFiles, authorization gap report ([76ce10b41](https://github.com/powerhouse-inc/powerhouse/commit/76ce10b41))
- **ph-lora:** claude commands ([d5950812a](https://github.com/powerhouse-inc/powerhouse/commit/d5950812a))
- **ph-lora:** doc-fix command ([87c6ab98d](https://github.com/powerhouse-inc/powerhouse/commit/87c6ab98d))
- **ph-lora:** doc-status and doc-clarity command ([1087fadb9](https://github.com/powerhouse-inc/powerhouse/commit/1087fadb9))
- **ph-lora:** release-notes skill + v6.0.0 release notes ([22aa1e682](https://github.com/powerhouse-inc/powerhouse/commit/22aa1e682))
- **ph-lora:** Claude Code doc-review skill suite + release-notes generator ([#2596](https://github.com/powerhouse-inc/powerhouse/pull/2596))

### ❤️ Thank You

- Benjamin Jordan
- CallmeT-ty @CallmeT-ty
- Claude Sonnet 4.6

## 6.0.0-dev.246 (2026-05-13)

### 🚀 Features

- improve document toolbar ([#2602](https://github.com/powerhouse-inc/powerhouse/pull/2602))

### 🩹 Fixes

- update import paths in generated tests ([#2603](https://github.com/powerhouse-inc/powerhouse/pull/2603))
- mark json files with correct permissions so nginx can serve them ([c2008bb1c](https://github.com/powerhouse-inc/powerhouse/commit/c2008bb1c))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.245 (2026-05-13)

This was a version bump only, there were no code changes.

## 6.0.0-dev.244 (2026-05-13)

### 🚀 Features

- **document-model, reactor-api, reactor:** added SET_PREFERRED_EDITOR as a header operation ([1b798614e](https://github.com/powerhouse-inc/powerhouse/commit/1b798614e))

### 🩹 Fixes

- **codegen:** workspace template syntax ([9e9c489fd](https://github.com/powerhouse-inc/powerhouse/commit/9e9c489fd))
- **connect:** cache usePendingInstallations snapshot to prevent infinite re-render ([13afdd208](https://github.com/powerhouse-inc/powerhouse/commit/13afdd208))
- **connect:** cache usePendingInstallations snapshot to prevent infinite re-render ([#2600](https://github.com/powerhouse-inc/powerhouse/pull/2600))
- **reactor:** sync batch system needs no split envelopes across operations that share a timestamp ([b829016ef](https://github.com/powerhouse-inc/powerhouse/commit/b829016ef))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 4.7 (1M context)
- liberuum

## 6.0.0-dev.243 (2026-05-12)

### 🩹 Fixes

- **codegen:** add @datadog/pprof to allowed builds ([c7929c192](https://github.com/powerhouse-inc/powerhouse/commit/c7929c192))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.242 (2026-05-12)

### 🩹 Fixes

- **release:** pass explicit from-ref to releaseChangelog ([5af1ce209](https://github.com/powerhouse-inc/powerhouse/commit/5af1ce209))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.241 (2026-05-12)

### 🚀 Features

- attach invocation context and tags to sentry events ([815c458bd](https://github.com/powerhouse-inc/powerhouse/commit/815c458bd))
- **connect:** surface missing-model failures and move registry URL to ph-packages.json ([bcb8bbdb0](https://github.com/powerhouse-inc/powerhouse/commit/bcb8bbdb0))

### 🩹 Fixes

- switching postgres versions ([353951582](https://github.com/powerhouse-inc/powerhouse/commit/353951582))
- do not realExit when there are duplicate signals ([94f2750e7](https://github.com/powerhouse-inc/powerhouse/commit/94f2750e7))
- **reactor:** fixed issue with cascading reshuffles ([36087940d](https://github.com/powerhouse-inc/powerhouse/commit/36087940d))
- **release:** pass explicit from-ref to releaseChangelog ([5af1ce209](https://github.com/powerhouse-inc/powerhouse/commit/5af1ce209))
- **sentry:** inject debug-ids before publish + drop dead dirs ([444c677a2](https://github.com/powerhouse-inc/powerhouse/commit/444c677a2))
- **switchboard:** move @pyroscope/nodejs to dependencies ([c71e0b3de](https://github.com/powerhouse-inc/powerhouse/commit/c71e0b3de))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.240 (2026-05-11)

### 🚀 Features

- gigantic hub and spoke catchup integration test ([4283fead6](https://github.com/powerhouse-inc/powerhouse/commit/4283fead6))

### 🩹 Fixes

- **reactor-api:** exclude hub/spoke test by default, added specific job to test it ([8e8474929](https://github.com/powerhouse-inc/powerhouse/commit/8e8474929))
- **release:** pass the just-published tag from release -> publish-ph-binaries ([dd19a9b20](https://github.com/powerhouse-inc/powerhouse/commit/dd19a9b20))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.239 (2026-05-11)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** use lightweight sentry sdk ([248c6b2f6](https://github.com/powerhouse-inc/powerhouse/commit/248c6b2f6))
- **ph-cmd:** added scripts to install dev and staging ph-cmd binary ([492555423](https://github.com/powerhouse-inc/powerhouse/commit/492555423))
- **reactor-browser:** useDocumentSafe hook to get current state of document including error and loading states ([8ecf03a20](https://github.com/powerhouse-inc/powerhouse/commit/8ecf03a20))
- **switchboard:** bridge OpenTelemetry spans to Sentry ([c1f2fc28b](https://github.com/powerhouse-inc/powerhouse/commit/c1f2fc28b))

### 🩹 Fixes

- update dockerfiles for pnpm 11 bin path ([d33db03ce](https://github.com/powerhouse-inc/powerhouse/commit/d33db03ce))
- **reactor-browser:** do not throw when fetching multiple documents ([edec7c66d](https://github.com/powerhouse-inc/powerhouse/commit/edec7c66d))
- **shared:** rename build-config.ts -> build-config.mts ([e636e7d38](https://github.com/powerhouse-inc/powerhouse/commit/e636e7d38))
- **switchboard:** only enable tracing if a destination is configured ([8abff8020](https://github.com/powerhouse-inc/powerhouse/commit/8abff8020))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.238 (2026-05-11)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** use lightweight sentry sdk ([248c6b2f6](https://github.com/powerhouse-inc/powerhouse/commit/248c6b2f6))
- **switchboard:** bridge OpenTelemetry spans to Sentry ([c1f2fc28b](https://github.com/powerhouse-inc/powerhouse/commit/c1f2fc28b))

### 🩹 Fixes

- update dockerfiles for pnpm 11 bin path ([d33db03ce](https://github.com/powerhouse-inc/powerhouse/commit/d33db03ce))
- **shared:** rename build-config.ts -> build-config.mts ([e636e7d38](https://github.com/powerhouse-inc/powerhouse/commit/e636e7d38))
- **switchboard:** only enable tracing if a destination is configured ([8abff8020](https://github.com/powerhouse-inc/powerhouse/commit/8abff8020))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.237 (2026-05-10)

This was a version bump only, there were no code changes.

## 6.0.0-dev.236 (2026-05-09)

### 🚀 Features

- new test-sync-queue cli app that detects sync drift for large drives ([ddcd53f1e](https://github.com/powerhouse-inc/powerhouse/commit/ddcd53f1e))
- fix drag and drop ([#2580](https://github.com/powerhouse-inc/powerhouse/pull/2580))
- new test-sync-queue cli app that detects sync drift for large drives ([771352e08](https://github.com/powerhouse-inc/powerhouse/commit/771352e08))
- add download button ([#2586](https://github.com/powerhouse-inc/powerhouse/pull/2586))

### 🩹 Fixes

- switchboard migrate command did not honor proper env vars ([2fc850209](https://github.com/powerhouse-inc/powerhouse/commit/2fc850209))
- switchboard itself was not using proper env vars ([50a3b842f](https://github.com/powerhouse-inc/powerhouse/commit/50a3b842f))
- switchboard migrate command did not honor proper env vars ([97f8c4781](https://github.com/powerhouse-inc/powerhouse/commit/97f8c4781))
- switchboard itself was not using proper env vars ([a18a78f05](https://github.com/powerhouse-inc/powerhouse/commit/a18a78f05))
- adding a log on catch and fixing a unit test ([ff3e2d71e](https://github.com/powerhouse-inc/powerhouse/commit/ff3e2d71e))
- **ph-cmd:** check package.json (not the dir) for global project bootstrap ([839d5949d](https://github.com/powerhouse-inc/powerhouse/commit/839d5949d))
- **reactor:** experimental fix for orphan reshuffle and cross-batch FIFO bugs in sync ([e192b7d17](https://github.com/powerhouse-inc/powerhouse/commit/e192b7d17))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.235 (2026-05-08)

### 🚀 Features

- **ph-cli:** support --allow-build on ph install and ph uninstall fix ([19586d46c](https://github.com/powerhouse-inc/powerhouse/commit/19586d46c))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.234 (2026-05-08)

### 🩹 Fixes

- **ci:** pnpm 11 reads PNPM*CONFIG*_ not NPM*CONFIG*_ ([b6c05fb23](https://github.com/powerhouse-inc/powerhouse/commit/b6c05fb23))
- **ci, docker:** pnpm 11 uses pnpm-workspace.yaml for allowBuilds; env var for min-release-age ([37c04c28a](https://github.com/powerhouse-inc/powerhouse/commit/37c04c28a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.233 (2026-05-08)

This was a version bump only, there were no code changes.

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

This was a version bump only, there were no code changes.

## 6.0.0-dev.229 (2026-05-07)

This was a version bump only, there were no code changes.

## 6.0.0-dev.228 (2026-05-07)

### 🚀 Features

- **connect,reactor-api:** set git hash at build time and display with url ([99b5233c7](https://github.com/powerhouse-inc/powerhouse/commit/99b5233c7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.227 (2026-05-07)

### 🚀 Features

- adding the ability to add remotes through the inspector that do not auto-poll ([adae501de](https://github.com/powerhouse-inc/powerhouse/commit/adae501de))

### 🩹 Fixes

- **reactor:** do not sort by timestamp in sync batches, only by ordinal ([7ccc6045c](https://github.com/powerhouse-inc/powerhouse/commit/7ccc6045c))
- **reactor-api:** paging needs to be operation-dependent, no envelope-- our batching is too good ([e6ab2f853](https://github.com/powerhouse-inc/powerhouse/commit/e6ab2f853))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.226 (2026-05-06)

### 🚀 Features

- various mixed load scenarios for the lb ([6ef3a76bf](https://github.com/powerhouse-inc/powerhouse/commit/6ef3a76bf))
- **ph-cli:** accept ip value for host on connect and preview ([63269c832](https://github.com/powerhouse-inc/powerhouse/commit/63269c832))

### 🩹 Fixes

- bump document-engineering to 1.40.3 and align zod pin ([d50e7e42c](https://github.com/powerhouse-inc/powerhouse/commit/d50e7e42c))
- **ph-cmd:** guard ph-cli forwarding when no project is detected ([07343964c](https://github.com/powerhouse-inc/powerhouse/commit/07343964c))
- **reactor-api:** remove debug field on drive endpoint ([904630a71](https://github.com/powerhouse-inc/powerhouse/commit/904630a71))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.225 (2026-05-06)

### 🩹 Fixes

- **reactor-api:** added support for x-forwarded-prefix ([40544feb2](https://github.com/powerhouse-inc/powerhouse/commit/40544feb2))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.224 (2026-05-06)

### 🚀 Features

- **ph-cli:** run migrate with target codegen version ([14bed84ed](https://github.com/powerhouse-inc/powerhouse/commit/14bed84ed))
- **ph-cli:** added --force flag to migrate and debug logs ([d30fb8f3f](https://github.com/powerhouse-inc/powerhouse/commit/d30fb8f3f))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.223 (2026-05-06)

### 🚀 Features

- add json viewer for operations tooltip ([#2569](https://github.com/powerhouse-inc/powerhouse/pull/2569))

### 🩹 Fixes

- **release:** drop concurrency from publish-docker-images.yml ([#2572](https://github.com/powerhouse-inc/powerhouse/issues/2572))
- **renown,registry:** pass audience to verifyAuthBearerToken ([#2574](https://github.com/powerhouse-inc/powerhouse/pull/2574))

### ❤️ Thank You

- Frank @froid1911
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.222 (2026-05-06)

### 🩹 Fixes

- **codegen:** dedupe test cases ([ac110c571](https://github.com/powerhouse-inc/powerhouse/commit/ac110c571))
- **codegen:** fix drive editor metadata check ([48f3de5a5](https://github.com/powerhouse-inc/powerhouse/commit/48f3de5a5))
- **codegen:** fix types export paths and documentModels type safety ([92c08ecad](https://github.com/powerhouse-inc/powerhouse/commit/92c08ecad))
- **codegen:** safer test name check ([58132df1b](https://github.com/powerhouse-inc/powerhouse/commit/58132df1b))
- **codegen,connect,shared:** exclude main.tsx from types and removed vite dependency ([fc9e541d6](https://github.com/powerhouse-inc/powerhouse/commit/fc9e541d6))
- **registry:** make extractTarball idempotent + throttle /packages warm-up ([#2571](https://github.com/powerhouse-inc/powerhouse/pull/2571))
- **release:** retry git push with rebase + add workflow concurrency ([#2572](https://github.com/powerhouse-inc/powerhouse/pull/2572))

### ❤️ Thank You

- acaldas
- Frank @froid1911

## 6.0.0-dev.220 (2026-05-06)

### 🩹 Fixes

- **registry:** make /packages non-blocking, warm cdn-cache in background ([#2568](https://github.com/powerhouse-inc/powerhouse/pull/2568))

### ❤️ Thank You

- Frank @froid1911

## 6.0.0-dev.219 (2026-05-06)

### 🩹 Fixes

- **registry:** source /packages from verdaccio's authoritative list ([44521252d](https://github.com/powerhouse-inc/powerhouse/commit/44521252d))

### ❤️ Thank You

- Frank

## 6.0.0-dev.218 (2026-05-06)

### 🚀 Features

- **registry:** renown JWT auth in front of verdaccio ([e5bbf93f1](https://github.com/powerhouse-inc/powerhouse/commit/e5bbf93f1))

### 🩹 Fixes

- add document drive header fallback for name field ([#2562](https://github.com/powerhouse-inc/powerhouse/pull/2562))
- **reactor-api:** support forward headers on drive url ([a780f2345](https://github.com/powerhouse-inc/powerhouse/commit/a780f2345))
- **registry:** satisfy eslint no-unsafe-assignment in renown middleware test ([e4eda6156](https://github.com/powerhouse-inc/powerhouse/commit/e4eda6156))

### ❤️ Thank You

- acaldas
- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.217 (2026-05-06)

### 🚀 Features

- add cursor-pointer class to breadcrumb ([#2561](https://github.com/powerhouse-inc/powerhouse/pull/2561))
- add editor drag-and-drop guidance to AGENTS.md template ([f9dc73d71](https://github.com/powerhouse-inc/powerhouse/commit/f9dc73d71))
- add editor drag-and-drop guidance to AGENTS.md template ([#2564](https://github.com/powerhouse-inc/powerhouse/pull/2564))
- **codegen:** scaffold vitest coverage with reducer threshold ([94f62106c](https://github.com/powerhouse-inc/powerhouse/commit/94f62106c))
- **codegen:** scaffold vitest coverage with reducer threshold ([#2563](https://github.com/powerhouse-inc/powerhouse/pull/2563))
- **codegen:** document playbook for reaching 100% reducer coverage ([d2421f461](https://github.com/powerhouse-inc/powerhouse/commit/d2421f461))
- **reactor-attachments:** implementing HEAD, implementing soft-delete and fixing some indexing issues ([f1430bca4](https://github.com/powerhouse-inc/powerhouse/commit/f1430bca4))
- **switchboard-lb:** rewrite to use simpler drive-id header ([a442207d1](https://github.com/powerhouse-inc/powerhouse/commit/a442207d1))

### 🩹 Fixes

- **codegen:** correct hook import paths and inline shadcn editor guide ([20d06c5c3](https://github.com/powerhouse-inc/powerhouse/commit/20d06c5c3))
- **ph-cmd:** fail fast when ph-cli tag resolves below 6.x for init ([0ba8e5f9b](https://github.com/powerhouse-inc/powerhouse/commit/0ba8e5f9b))
- **ph-cmd:** exit instead of throw on init version-floor failure ([7ab327a77](https://github.com/powerhouse-inc/powerhouse/commit/7ab327a77))
- **reactor:** documents with out of order ADD_RELATIONSHIP now correctly gets backfilled in sync query ([2b2730126](https://github.com/powerhouse-inc/powerhouse/commit/2b2730126))
- **reactor-api, switchboard:** partial-delete index, reservation validation, fastify param routing, case-insensitive hashes ([f0b5b0620](https://github.com/powerhouse-inc/powerhouse/commit/f0b5b0620))
- **reactor-attachments:** code-review feedback ([18cd49ab6](https://github.com/powerhouse-inc/powerhouse/commit/18cd49ab6))
- **reactor-attachments:** switch to Attachment-Metadata instead of the X- prefix ([7ea3f120a](https://github.com/powerhouse-inc/powerhouse/commit/7ea3f120a))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.216 (2026-05-05)

### 🚀 Features

- **codegen:** use satisfies DocumentModelModule instead of type cast ([348663a7a](https://github.com/powerhouse-inc/powerhouse/commit/348663a7a))

### 🩹 Fixes

- **codegen,ph-cli,shared:** build package types with tsc ([f3658dddc](https://github.com/powerhouse-inc/powerhouse/commit/f3658dddc))
- **codegen,ph-cli,shared:** build package types with tsc ([a1a47e932](https://github.com/powerhouse-inc/powerhouse/commit/a1a47e932))
- **ph-cli:** write tsmorph changes on generate commands ([b9a8a413b](https://github.com/powerhouse-inc/powerhouse/commit/b9a8a413b))

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

- use generated get document with operations query in switchboard link ([#2556](https://github.com/powerhouse-inc/powerhouse/pull/2556))
- added drive info to settings menu ([9217c1b76](https://github.com/powerhouse-inc/powerhouse/commit/9217c1b76))
- **switchboard:** adding pglite migration flag ([952075b11](https://github.com/powerhouse-inc/powerhouse/commit/952075b11))
- **switchboard:** env var to force a specific pg version when using pglite ([5cdd35ca1](https://github.com/powerhouse-inc/powerhouse/commit/5cdd35ca1))

### 🩹 Fixes

- **reactor-api:** a number of hacks to get around the way vite works, and pre-empt sigterm and sigkill ([36bf0918c](https://github.com/powerhouse-inc/powerhouse/commit/36bf0918c))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.213 (2026-05-04)

This was a version bump only, there were no code changes.

## 6.0.0-dev.212 (2026-05-03)

This was a version bump only, there were no code changes.

## 6.0.0-dev.211 (2026-05-02)

This was a version bump only, there were no code changes.

## 6.0.0-dev.210 (2026-05-01)

### 🚀 Features

- created a drive-client that is specific to working with drives ([718b6b1de](https://github.com/powerhouse-inc/powerhouse/commit/718b6b1de))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.209 (2026-04-30)

### 🚀 Features

- initial switchboard endpoints and implementation ([01b20cede](https://github.com/powerhouse-inc/powerhouse/commit/01b20cede))
- **reactor-api:** added system subgraph which returns version and hash information ([248fc1e92](https://github.com/powerhouse-inc/powerhouse/commit/248fc1e92))
- **reactor-attachments:** switchboard implementation fixes ([3b320d01c](https://github.com/powerhouse-inc/powerhouse/commit/3b320d01c))

### 🩹 Fixes

- so much linting that it kills my computer ([d6b6ff143](https://github.com/powerhouse-inc/powerhouse/commit/d6b6ff143))
- **connect, design-system:** fallback drive name to header.name when state name is empty ([d3266842e](https://github.com/powerhouse-inc/powerhouse/commit/d3266842e))
- **reactor-attachments:** force octet-stream content-type for remote uploads ([fc45afccb](https://github.com/powerhouse-inc/powerhouse/commit/fc45afccb))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.208 (2026-04-29)

### 🚀 Features

- switchboard-lb M3 ([cc49638e0](https://github.com/powerhouse-inc/powerhouse/commit/cc49638e0))
- metrics integration ([1ce0b5fdf](https://github.com/powerhouse-inc/powerhouse/commit/1ce0b5fdf))
- added observability profile ([957af0925](https://github.com/powerhouse-inc/powerhouse/commit/957af0925))
- first swing at a load test ([f7e0f4456](https://github.com/powerhouse-inc/powerhouse/commit/f7e0f4456))
- **reactor-api:** added attachment service creation to reactor-api ([f96e9806b](https://github.com/powerhouse-inc/powerhouse/commit/f96e9806b))
- **reactor-attachments:** initial setup of package ([ac5bac96a](https://github.com/powerhouse-inc/powerhouse/commit/ac5bac96a))
- **reactor-attachments:** initial storage implementation ([b82e0fc8c](https://github.com/powerhouse-inc/powerhouse/commit/b82e0fc8c))
- **reactor-attachments:** reservations ([f13680db1](https://github.com/powerhouse-inc/powerhouse/commit/f13680db1))
- **reactor-attachments:** initial direct upload and switchboard transport implementations ([624579adc](https://github.com/powerhouse-inc/powerhouse/commit/624579adc))
- **reactor-attachments:** added builder ([2f5b10c4b](https://github.com/powerhouse-inc/powerhouse/commit/2f5b10c4b))

### 🩹 Fixes

- **codegen:** migrate packageJson exports and dependencies ([965780cc1](https://github.com/powerhouse-inc/powerhouse/commit/965780cc1))
- **reactor-attachments:** fix the tsdown config ([8485b54be](https://github.com/powerhouse-inc/powerhouse/commit/8485b54be))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Copilot

## 6.0.0-dev.207 (2026-04-29)

This was a version bump only, there were no code changes.

## 6.0.0-dev.206 (2026-04-28)

### 🚀 Features

- add support for custom registry URL in config update during installation ([b5acf164b](https://github.com/powerhouse-inc/powerhouse/commit/b5acf164b))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.205 (2026-04-28)

### 🩹 Fixes

- **codegen:** restore pglite deps in project boilerplate ([9d102c61c](https://github.com/powerhouse-inc/powerhouse/commit/9d102c61c))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.204 (2026-04-28)

### 🩹 Fixes

- **codegen:** pin graphql to 16.12.0 in project boilerplate ([ba3b15a9b](https://github.com/powerhouse-inc/powerhouse/commit/ba3b15a9b))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.203 (2026-04-28)

### 🩹 Fixes

- **ph-cli:** forward processorConfig to switchboard for vetra interactive ([7f8dc486f](https://github.com/powerhouse-inc/powerhouse/commit/7f8dc486f))
- **shared:** include operation example creators in documentModelActions ([71aa740fa](https://github.com/powerhouse-inc/powerhouse/commit/71aa740fa))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.202 (2026-04-28)

### 🩹 Fixes

- **codegen:** use .raw on vitestConfigTemplate ([dbea9094a](https://github.com/powerhouse-inc/powerhouse/commit/dbea9094a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.201 (2026-04-28)

### 🚀 Features

- dispatch set name operation on document when renaming node in drive ([#2513](https://github.com/powerhouse-inc/powerhouse/pull/2513))
- **design-system:** add back to home button in Breadcrumbs component ([1c50e026c](https://github.com/powerhouse-inc/powerhouse/commit/1c50e026c))

### 🩹 Fixes

- fix some delete issues ([0147000ca](https://github.com/powerhouse-inc/powerhouse/commit/0147000ca))
- **codegen:** fix types exports on package ([50b2b2383](https://github.com/powerhouse-inc/powerhouse/commit/50b2b2383))
- **design-system:** show ENS avatar in revision history operations ([cab95c8de](https://github.com/powerhouse-inc/powerhouse/commit/cab95c8de))
- **document-drive:** allow name collision when kinds are different ([1cb1ccbed](https://github.com/powerhouse-inc/powerhouse/commit/1cb1ccbed))
- **ph-cli:** lazy load ph code ([3e1f51d29](https://github.com/powerhouse-inc/powerhouse/commit/3e1f51d29))
- **reactor-browser:** fixes #2504 mode nove ([#2504](https://github.com/powerhouse-inc/powerhouse/issues/2504))
- **reactor-mcp:** create McpServer per /mcp request to fix concurrent transport collision ([3cfeb5b3f](https://github.com/powerhouse-inc/powerhouse/commit/3cfeb5b3f))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Copilot
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.200 (2026-04-27)

This was a version bump only, there were no code changes.

## 6.0.0-dev.199 (2026-04-26)

### 🚀 Features

- **ph-cli:** add ph-clint and mastra dependencies ([a389b5bdd](https://github.com/powerhouse-inc/powerhouse/commit/a389b5bdd))
- **ph-cli:** add cmd-ts to defineCommand adapter and agent harness ([79ca8fa02](https://github.com/powerhouse-inc/powerhouse/commit/79ca8fa02))
- **ph-cli:** wire ph code subcommand ([b05da96be](https://github.com/powerhouse-inc/powerhouse/commit/b05da96be))
- **shared/clis:** add code subcommand definition ([faa77ba04](https://github.com/powerhouse-inc/powerhouse/commit/faa77ba04))

### 🩹 Fixes

- **ph-cli:** satisfy lint rules in ph code harness ([e5bc6f7cd](https://github.com/powerhouse-inc/powerhouse/commit/e5bc6f7cd))
- **shared/clis:** collapse code description to a single line for prettier ([ac5bd403d](https://github.com/powerhouse-inc/powerhouse/commit/ac5bd403d))

### ❤️ Thank You

- Frank

## 6.0.0-dev.198 (2026-04-26)

This was a version bump only, there were no code changes.

## 6.0.0-dev.197 (2026-04-25)

### 🚀 Features

- **ph-cli,registry,shared:** add unpublish command with registry-side cdn purge ([8816644f1](https://github.com/powerhouse-inc/powerhouse/commit/8816644f1))
- **ph-cli,registry,shared:** add unpublish command with registry-side cdn purge ([#2508](https://github.com/powerhouse-inc/powerhouse/pull/2508))

### 🩹 Fixes

- exclude pglite wasm and data files on ph build ([96eee628c](https://github.com/powerhouse-inc/powerhouse/commit/96eee628c))
- **codegen:** fix lint issues on generated code ([1a63ff533](https://github.com/powerhouse-inc/powerhouse/commit/1a63ff533))
- **codegen:** fix editors subexport ([9b7153ba1](https://github.com/powerhouse-inc/powerhouse/commit/9b7153ba1))
- **design-system:** import FC type explicitly in toast.tsx ([d8a64780f](https://github.com/powerhouse-inc/powerhouse/commit/d8a64780f))
- **ph-cli:** prompt for dist-tag when publishing prerelease versions ([99ceb6c29](https://github.com/powerhouse-inc/powerhouse/commit/99ceb6c29))
- **ph-cli:** prompt for dist-tag when publishing prerelease versions ([#2510](https://github.com/powerhouse-inc/powerhouse/pull/2510))
- **shared:** ignore duplicate react external ([48ef681db](https://github.com/powerhouse-inc/powerhouse/commit/48ef681db))
- **switchboard:** fall back to free port on EADDRINUSE and propagate to vetra ([182118e02](https://github.com/powerhouse-inc/powerhouse/commit/182118e02))
- **switchboard:** fall back to free port on EADDRINUSE and propagate to vetra ([#2511](https://github.com/powerhouse-inc/powerhouse/pull/2511))

### 🔥 Performance

- **analytics-engine-browser:** move createFsPglite to test-utils subpath ([d9a66201a](https://github.com/powerhouse-inc/powerhouse/commit/d9a66201a))
- **design-system:** improve DocumentToolbar tree-shaking ([6d3bf98ad](https://github.com/powerhouse-inc/powerhouse/commit/6d3bf98ad))
- **reactor-browser:** drop GqlRequestChannel runtime reference in useGetSwitchboardLink ([85a3c3940](https://github.com/powerhouse-inc/powerhouse/commit/85a3c3940))
- **vetra-packages:** drop validator dependency ([86a78223c](https://github.com/powerhouse-inc/powerhouse/commit/86a78223c))

### ❤️ Thank You

- acaldas
- Copilot
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.196 (2026-04-24)

### 🚀 Features

- separate generate commands ([#2505](https://github.com/powerhouse-inc/powerhouse/pull/2505))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.195 (2026-04-24)

### 🚀 Features

- **codegen:** add sideEffects:false to generated package boilerplate ([844449485](https://github.com/powerhouse-inc/powerhouse/commit/844449485))
- **reactor-browser:** add code splitting and move renown crypto out of reactor ([647c5b282](https://github.com/powerhouse-inc/powerhouse/commit/647c5b282))
- **reactor-browser:** split analytics into store and react hooks ([071f62c45](https://github.com/powerhouse-inc/powerhouse/commit/071f62c45))
- **shared:** isolate generateMock into its own module ([862fcc58b](https://github.com/powerhouse-inc/powerhouse/commit/862fcc58b))
- **tree-shaking:** add sideEffects:false and lazy-load pglite ([92f8e988e](https://github.com/powerhouse-inc/powerhouse/commit/92f8e988e))

### 🩹 Fixes

- outdated pnpm lock ([4a1f21903](https://github.com/powerhouse-inc/powerhouse/commit/4a1f21903))
- **analytics-engine:** lazy-load pglite in browser analytics store ([9ba35e149](https://github.com/powerhouse-inc/powerhouse/commit/9ba35e149))
- **common:** cleanup deps ([8602d77ba](https://github.com/powerhouse-inc/powerhouse/commit/8602d77ba))
- **commong:** update tsconfig ([2c3037dcf](https://github.com/powerhouse-inc/powerhouse/commit/2c3037dcf))
- **design-system:** exclude test and storybook-only files from bundle ([dd9a92c10](https://github.com/powerhouse-inc/powerhouse/commit/dd9a92c10))
- **drive-analytics:** import from reactor-browser/analytics subpath ([f438e09c5](https://github.com/powerhouse-inc/powerhouse/commit/f438e09c5))
- **reactor-browser:** duplicated query key on analytics engine ([2594471ce](https://github.com/powerhouse-inc/powerhouse/commit/2594471ce))
- **registry:** downgrade express to v4 to fix package details page 404 ([40cd8a5d8](https://github.com/powerhouse-inc/powerhouse/commit/40cd8a5d8))
- **registry:** downgrade express to v4 to fix package details page 404 ([#2507](https://github.com/powerhouse-inc/powerhouse/pull/2507))
- **shared:** keep react in browser neverBundle to avoid duplicate instances ([1dd206a09](https://github.com/powerhouse-inc/powerhouse/commit/1dd206a09))
- **shared:** lazy-load jszip to remove it from the eager document model bundle ([fc920a3e9](https://github.com/powerhouse-inc/powerhouse/commit/fc920a3e9))
- **shared:** keep react in browser neverBundle to avoid duplicate instances ([#2495](https://github.com/powerhouse-inc/powerhouse/pull/2495))
- **shared,document-model:** make zip utils async ([72a6447e4](https://github.com/powerhouse-inc/powerhouse/commit/72a6447e4))

### ❤️ Thank You

- acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.194 (2026-04-23)

### 🩹 Fixes

- **codegen:** updated dependencies list ([b4545f389](https://github.com/powerhouse-inc/powerhouse/commit/b4545f389))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.193 (2026-04-23)

### 🚀 Features

- version picker for install, preserve picked version across reloads ([3cf54c3a3](https://github.com/powerhouse-inc/powerhouse/commit/3cf54c3a3))
- version picker for install, preserve picked version across reloads ([#2496](https://github.com/powerhouse-inc/powerhouse/pull/2496))

### 🩹 Fixes

- **connect:** trim trailing slash, upsert npm-fallback, prune stale boot entries ([2e9c8d119](https://github.com/powerhouse-inc/powerhouse/commit/2e9c8d119))
- **connect:** trim trailing slash, upsert npm-fallback, prune stale boot entries ([#2494](https://github.com/powerhouse-inc/powerhouse/pull/2494))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.192 (2026-04-22)

### 🚀 Features

- update migrate command ([#2492](https://github.com/powerhouse-inc/powerhouse/pull/2492))

### 🩹 Fixes

- **reactor-browser:** added hidden methods on graphql client type ([6af8b7f12](https://github.com/powerhouse-inc/powerhouse/commit/6af8b7f12))

### ❤️ Thank You

- acaldas
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.191 (2026-04-22)

### 🩹 Fixes

- **registry:** don't filter /packages to empty when storage metadata can't be read ([e3dd952de](https://github.com/powerhouse-inc/powerhouse/commit/e3dd952de))
- **registry:** don't filter /packages to empty when storage metadata can't be read ([#2493](https://github.com/powerhouse-inc/powerhouse/pull/2493))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.190 (2026-04-22)

### 🚀 Features

- preserve dist-tags end-to-end and streamline package manager UX ([#2490](https://github.com/powerhouse-inc/powerhouse/pull/2490))
- **connect:** filter available packages and accept name@tag in search ([34e34335c](https://github.com/powerhouse-inc/powerhouse/commit/34e34335c))
- **connect:** scope package listing to the custom registry + npm fallback ([faf4d6e88](https://github.com/powerhouse-inc/powerhouse/commit/faf4d6e88))

### 🩹 Fixes

- **builder-tools:** preserve version from powerhouse.config.json ([74c717d27](https://github.com/powerhouse-inc/powerhouse/commit/74c717d27))
- **connect:** only surface npm fallback when no local matches ([fe717d65d](https://github.com/powerhouse-inc/powerhouse/commit/fe717d65d))
- **shared:** preserve dist-tag in powerhouse.config.json from ph install ([8a32d4ce8](https://github.com/powerhouse-inc/powerhouse/commit/8a32d4ce8))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.189 (2026-04-22)

### 🚀 Features

- **connect:** pg migration banner ([8a8662e2f](https://github.com/powerhouse-inc/powerhouse/commit/8a8662e2f))
- **lb:** wip on m1 features ([096384d5c](https://github.com/powerhouse-inc/powerhouse/commit/096384d5c))
- **lb:** the load balancer now pins through milestone 2 ([b928cfe04](https://github.com/powerhouse-inc/powerhouse/commit/b928cfe04))
- **switchboard-lb:** proxy upstream routes via least_conn (M1) ([5e3343b21](https://github.com/powerhouse-inc/powerhouse/commit/5e3343b21))

### 🩹 Fixes

- import now works -- lots of gotchas ([df8594200](https://github.com/powerhouse-inc/powerhouse/commit/df8594200))
- **connect:** dump and import block and quiesce queue before working with the db ([dd0d99cf3](https://github.com/powerhouse-inc/powerhouse/commit/dd0d99cf3))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 4.7

## 6.0.0-dev.188 (2026-04-21)

### 🩹 Fixes

- **connect:** guard bundled-packages import so vite dep scan doesn't fail without the plugin ([89e08e8d4](https://github.com/powerhouse-inc/powerhouse/commit/89e08e8d4))
- **ph-cli:** pin @tsdown/css to match tsdown version ([961675548](https://github.com/powerhouse-inc/powerhouse/commit/961675548))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.187 (2026-04-21)

### 🩹 Fixes

- **ci:** install sentry-cli via official installer ([52a3b3fbd](https://github.com/powerhouse-inc/powerhouse/commit/52a3b3fbd))

### ❤️ Thank You

- Frank

## 6.0.0-dev.186 (2026-04-21)

### 🩹 Fixes

- **ci:** invoke sentry-cli via --package so npx resolves the binary ([21cf95abb](https://github.com/powerhouse-inc/powerhouse/commit/21cf95abb))

### ❤️ Thank You

- Frank

## 6.0.0-dev.185 (2026-04-21)

### 🚀 Features

- **sentry:** upload source maps + tag releases in CI ([46461b97e](https://github.com/powerhouse-inc/powerhouse/commit/46461b97e))

### 🩹 Fixes

- **telemetry:** remove autoSessionTracking (removed in Sentry v8+) ([bd37e0cb7](https://github.com/powerhouse-inc/powerhouse/commit/bd37e0cb7))

### ❤️ Thank You

- Frank

## 6.0.0-dev.184 (2026-04-21)

### 🚀 Features

- **cli:** opt-out Sentry error reporting for ph-cli and ph-cmd ([1f9c3be35](https://github.com/powerhouse-inc/powerhouse/commit/1f9c3be35))

### 🩹 Fixes

- **cli:** use injected CLI_VERSION / getVersion() (src/version.ts is gitignored) ([331aa34a1](https://github.com/powerhouse-inc/powerhouse/commit/331aa34a1))
- **renown:** use appId on credential api fetch ([dfd0cb4c0](https://github.com/powerhouse-inc/powerhouse/commit/dfd0cb4c0))

### ❤️ Thank You

- acaldas
- Frank

## 6.0.0-dev.183 (2026-04-21)

### 🚀 Features

- emit editor assets as hashed files via resolveNewUrlToAsset ([27f0ea69c](https://github.com/powerhouse-inc/powerhouse/commit/27f0ea69c))
- bundle local packages into connect for offline preview ([caa4c85a8](https://github.com/powerhouse-inc/powerhouse/commit/caa4c85a8))
- step 1 of a switchboard load balancer ([618c32bfc](https://github.com/powerhouse-inc/powerhouse/commit/618c32bfc))
- reactor now attempts to migrate dbs from old versions ([92b2fdde9](https://github.com/powerhouse-inc/powerhouse/commit/92b2fdde9))
- add offline preview for installed packages ([#2476](https://github.com/powerhouse-inc/powerhouse/pull/2476))
- **docker:** run connect nginx as non-root (H3) ([3120ba1c4](https://github.com/powerhouse-inc/powerhouse/commit/3120ba1c4))
- **registry:** wire npm uplink for transparent CDN fallback ([74181971f](https://github.com/powerhouse-inc/powerhouse/commit/74181971f))

### 🩹 Fixes

- tsc issues ([c21c84d8e](https://github.com/powerhouse-inc/powerhouse/commit/c21c84d8e))
- resolve virtual bundled-packages module under NodeNext ([a4a0ae5e2](https://github.com/powerhouse-inc/powerhouse/commit/a4a0ae5e2))
- **ph-cli:** prioritize PH_REGISTRY_URL env over config in install ([8463ff18d](https://github.com/powerhouse-inc/powerhouse/commit/8463ff18d))
- **shared:** handle react imports in cjs deps ([78941ed7c](https://github.com/powerhouse-inc/powerhouse/commit/78941ed7c))
- **switchboard:** since each subgraph adds its own listeners, we need to update the maxlisteners ([b14c031de](https://github.com/powerhouse-inc/powerhouse/commit/b14c031de))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.182 (2026-04-20)

This was a version bump only, there were no code changes.

## 6.0.0-dev.181 (2026-04-19)

This was a version bump only, there were no code changes.

## 6.0.0-dev.180 (2026-04-18)

### 🩹 Fixes

- **connect:** surface package install errors instead of reloading ([1aa72df91](https://github.com/powerhouse-inc/powerhouse/commit/1aa72df91))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.179 (2026-04-17)

### 🩹 Fixes

- **reactor-browser:** run auth middleware on batch GraphQL calls ([23acffb0b](https://github.com/powerhouse-inc/powerhouse/commit/23acffb0b))

### ❤️ Thank You

- Frank

## 6.0.0-dev.178 (2026-04-17)

### 🚀 Features

- **codegen:** include config section in manifest template and merge ([5658e6ef7](https://github.com/powerhouse-inc/powerhouse/commit/5658e6ef7))
- **shared:** add config field to package manifest ([f1b3e7ee8](https://github.com/powerhouse-inc/powerhouse/commit/f1b3e7ee8))

### ❤️ Thank You

- Frank

## 6.0.0-dev.177 (2026-04-17)

### 🚀 Features

- **connect:** show package version in settings package manager ([1886fc2fd](https://github.com/powerhouse-inc/powerhouse/commit/1886fc2fd))

### 🩹 Fixes

- **design-system:** give dropdown menu real border and shadow ([6964335ff](https://github.com/powerhouse-inc/powerhouse/commit/6964335ff))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.176 (2026-04-16)

### 🩹 Fixes

- update lockfile ([728604c16](https://github.com/powerhouse-inc/powerhouse/commit/728604c16))
- **reactor-api:** make vite dependency more permissive ([273f1586c](https://github.com/powerhouse-inc/powerhouse/commit/273f1586c))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.175 (2026-04-16)

### 🚀 Features

- **connect:** retry default drives with backoff on startup race ([5c1cfd50f](https://github.com/powerhouse-inc/powerhouse/commit/5c1cfd50f))
- **design-system:** collapsible sections in package manager list ([32b60cefa](https://github.com/powerhouse-inc/powerhouse/commit/32b60cefa))

### 🩹 Fixes

- **builder-tools:** share React with CDN editors in dev ([8d4e23351](https://github.com/powerhouse-inc/powerhouse/commit/8d4e23351))
- **design-system:** show "Installed" in package search for installed packages ([8637db2d2](https://github.com/powerhouse-inc/powerhouse/commit/8637db2d2))
- **design-system:** hide empty manifest fields in package list item ([557fd79e1](https://github.com/powerhouse-inc/powerhouse/commit/557fd79e1))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.174 (2026-04-15)

### 🚀 Features

- **shared,ph-cli:** extract registry helpers, refactor publish/install commands ([f00289f6b](https://github.com/powerhouse-inc/powerhouse/commit/f00289f6b))

### 🩹 Fixes

- **deps:** resolve all critical and high security vulnerabilities ([6a8531af3](https://github.com/powerhouse-inc/powerhouse/commit/6a8531af3))
- **shared,ph-cli:** switch publish to execFileSync, use POWERHOUSE_CONFIG_FILE constant ([eb0d4865c](https://github.com/powerhouse-inc/powerhouse/commit/eb0d4865c))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.173 (2026-04-15)

### 🚀 Features

- **renown,ph-cli:** moved cli login to renown sdk ([09ac65eff](https://github.com/powerhouse-inc/powerhouse/commit/09ac65eff))

### 🩹 Fixes

- **renown:** fix sleep listener leak, fix pre-existing test failures, add test script ([606e9f82e](https://github.com/powerhouse-inc/powerhouse/commit/606e9f82e))
- **renown,ph-cli:** address PR review feedback for login refactor ([d2a0227de](https://github.com/powerhouse-inc/powerhouse/commit/d2a0227de))
- **renown,ph-cli:** address second round of PR review feedback ([d03005eee](https://github.com/powerhouse-inc/powerhouse/commit/d03005eee))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.172 (2026-04-15)

### 🩹 Fixes

- since we have to derive document operations on import, we were discarding the initial state on export ([db8ab6733](https://github.com/powerhouse-inc/powerhouse/commit/db8ab6733))
- **connect:** mark i18n chunk as side-effectful so init() isn't tree-shaken ([98dc33786](https://github.com/powerhouse-inc/powerhouse/commit/98dc33786))
- **design-system:** stretch Operation tooltip bg and add copy button ([13b9afe3e](https://github.com/powerhouse-inc/powerhouse/commit/13b9afe3e))
- **design-system:** render ConnectTooltip above z-10 stacking contexts ([361cb8b60](https://github.com/powerhouse-inc/powerhouse/commit/361cb8b60))
- **shared:** added logout command ([3a428fff9](https://github.com/powerhouse-inc/powerhouse/commit/3a428fff9))
- **switchboard:** support setting dynamic model loading with env var and only enabled https node hooks when needed ([cbb96b940](https://github.com/powerhouse-inc/powerhouse/commit/cbb96b940))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.171 (2026-04-14)

### 🚀 Features

- added yield utility method, and yield with timer in job executor ([d751d2472](https://github.com/powerhouse-inc/powerhouse/commit/d751d2472))
- sync paging ([6d90fe1a4](https://github.com/powerhouse-inc/powerhouse/commit/6d90fe1a4))

### 🩹 Fixes

- backfill in touchchannel should be async so as not to kill switchboard ([a1e8ed3e3](https://github.com/powerhouse-inc/powerhouse/commit/a1e8ed3e3))
- backfill should be async on start too, but we need to make sure to track it and kill on remove ([f994cb8bc](https://github.com/powerhouse-inc/powerhouse/commit/f994cb8bc))
- **connect:** delete pglite idb on clear storage to avoid flush race ([c3a731835](https://github.com/powerhouse-inc/powerhouse/commit/c3a731835))
- **powerhouse-vetra-packages:** resolve duplicate graphql module causing false state validation errors ([38ac1daf5](https://github.com/powerhouse-inc/powerhouse/commit/38ac1daf5))
- **reactor-api:** namespace package subgraph ([cc82e0943](https://github.com/powerhouse-inc/powerhouse/commit/cc82e0943))
- **reactor-api:** uppercase packages namespace and type improvement ([f455ced56](https://github.com/powerhouse-inc/powerhouse/commit/f455ced56))
- **reactor-browser:** export documents as .phd when no extension is set ([494ac0a3a](https://github.com/powerhouse-inc/powerhouse/commit/494ac0a3a))
- **vetra:** generate manifest from global state in package generator ([f5de73f05](https://github.com/powerhouse-inc/powerhouse/commit/f5de73f05))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.170 (2026-04-13)

### 🚀 Features

- **connect:** display error message on load error ([5b9b62068](https://github.com/powerhouse-inc/powerhouse/commit/5b9b62068))

### 🩹 Fixes

- dedupe upgrade manifest and subscribe to package installs ([1adeba37d](https://github.com/powerhouse-inc/powerhouse/commit/1adeba37d))
- declare react as peerDependency and dedupe on vite ([3444dab52](https://github.com/powerhouse-inc/powerhouse/commit/3444dab52))
- **reactor:** make registerModules and registerUpgradeManifests resilient to invalid items ([20b4dd6c6](https://github.com/powerhouse-inc/powerhouse/commit/20b4dd6c6))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.169 (2026-04-13)

This was a version bump only, there were no code changes.

## 6.0.0-dev.168 (2026-04-12)

This was a version bump only, there were no code changes.

## 6.0.0-dev.167 (2026-04-11)

This was a version bump only, there were no code changes.

## 6.0.0-dev.166 (2026-04-10)

### 🩹 Fixes

- **design-system,connect:** cleanup dependencies ([97466944a](https://github.com/powerhouse-inc/powerhouse/commit/97466944a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.165 (2026-04-10)

### 🩹 Fixes

- broken link llm docs ([44efa9d3b](https://github.com/powerhouse-inc/powerhouse/commit/44efa9d3b))

### ❤️ Thank You

- CallmeT-ty @CallmeT-ty

## 6.0.0-dev.164 (2026-04-09)

### 🩹 Fixes

- **reactor-browser:** fixed document import ([b8e6d0aad](https://github.com/powerhouse-inc/powerhouse/commit/b8e6d0aad))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.163 (2026-04-09)

### 🩹 Fixes

- **reactor-api,switchboard:** output https hooks on separate file ([9b05a45e9](https://github.com/powerhouse-inc/powerhouse/commit/9b05a45e9))
- **renown:** removed unused didtools/key-did dependency ([7771007c0](https://github.com/powerhouse-inc/powerhouse/commit/7771007c0))
- **switchboard:** set log level from env var ([eddc863e8](https://github.com/powerhouse-inc/powerhouse/commit/eddc863e8))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.162 (2026-04-09)

### 🚀 Features

- **ph-cmd:** delegate init to versioned ph-cli ([875a4e6f4](https://github.com/powerhouse-inc/powerhouse/commit/875a4e6f4))

### 🩹 Fixes

- set max listeners to 0 on subscription ws server because an arbitrary number of subgraphs may be added, also add a debug log ([59bc97527](https://github.com/powerhouse-inc/powerhouse/commit/59bc97527))
- **builder-tools:** pre optimize common studio deps ([b98326c68](https://github.com/powerhouse-inc/powerhouse/commit/b98326c68))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.161 (2026-04-08)

### 🩹 Fixes

- **builder-tools:** display connect favicon as fallback ([2faa5c152](https://github.com/powerhouse-inc/powerhouse/commit/2faa5c152))
- **connect:** prevent HMR page reloads and support hot module re-injection ([26c8c79b9](https://github.com/powerhouse-inc/powerhouse/commit/26c8c79b9))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.160 (2026-04-08)

### 🩹 Fixes

- **design-system:** fixed build and static assets ([fbcfd28d0](https://github.com/powerhouse-inc/powerhouse/commit/fbcfd28d0))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.159 (2026-04-07)

### 🩹 Fixes

- support both old and new switchboard dist layout in entrypoint ([80bfba241](https://github.com/powerhouse-inc/powerhouse/commit/80bfba241))

### ❤️ Thank You

- Frank

## 6.0.0-dev.158 (2026-04-07)

### 🩹 Fixes

- **design-system:** tsdown changed where icons are ([31a89ff5d](https://github.com/powerhouse-inc/powerhouse/commit/31a89ff5d))
- **reactor:** fix issue where getOperations paging did not work across scopes ([dbe5bb51a](https://github.com/powerhouse-inc/powerhouse/commit/dbe5bb51a))
- **reactor-api:** the gql propagation was not being parsed correctly ([48b6391a1](https://github.com/powerhouse-inc/powerhouse/commit/48b6391a1))
- **reactor-browser:** fix export and import ([e8a9ea306](https://github.com/powerhouse-inc/powerhouse/commit/e8a9ea306))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.157 (2026-04-06)

This was a version bump only, there were no code changes.

## 6.0.0-dev.156 (2026-04-05)

This was a version bump only, there were no code changes.

## 6.0.0-dev.155 (2026-04-04)

### 🩹 Fixes

- **registry:** return 404 for non-existent packages ([a0508c6c7](https://github.com/powerhouse-inc/powerhouse/commit/a0508c6c7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.154 (2026-04-03)

### 🩹 Fixes

- a few fixes on the build workflow ([b6195242c](https://github.com/powerhouse-inc/powerhouse/commit/b6195242c))
- remove outdated script ([2f194d576](https://github.com/powerhouse-inc/powerhouse/commit/2f194d576))
- a few more build fixes ([b8b395f68](https://github.com/powerhouse-inc/powerhouse/commit/b8b395f68))
- simplify vetra-e2e and test-consumer-project build scripts ([1febd0c18](https://github.com/powerhouse-inc/powerhouse/commit/1febd0c18))
- build issue with switchboard ([07a378cec](https://github.com/powerhouse-inc/powerhouse/commit/07a378cec))
- switching versioned-documents test to tsdown ([f9ade0d54](https://github.com/powerhouse-inc/powerhouse/commit/f9ade0d54))
- reactor-api is bundling too much ([df38d1995](https://github.com/powerhouse-inc/powerhouse/commit/df38d1995))
- a couple build settings needed adjusted ([28750c38d](https://github.com/powerhouse-inc/powerhouse/commit/28750c38d))
- lots of feedback, and added tsdown configs for 4 packages ([d847d8748](https://github.com/powerhouse-inc/powerhouse/commit/d847d8748))
- add typecheck to simulate workflow ([76d4e606c](https://github.com/powerhouse-inc/powerhouse/commit/76d4e606c))
- versioned docs need build artifacts ([d20b4db62](https://github.com/powerhouse-inc/powerhouse/commit/d20b4db62))
- mock dependencies in vetra tests ([f787bd19d](https://github.com/powerhouse-inc/powerhouse/commit/f787bd19d))
- link to mts ([7400534e6](https://github.com/powerhouse-inc/powerhouse/commit/7400534e6))
- reactor bounces bad timestamps ([5f087fd9e](https://github.com/powerhouse-inc/powerhouse/commit/5f087fd9e))
- swap from build-bundle to build ([714f1bbff](https://github.com/powerhouse-inc/powerhouse/commit/714f1bbff))
- **codegen:** exclude vitest.config.ts on tsconfig ([414948fe3](https://github.com/powerhouse-inc/powerhouse/commit/414948fe3))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.153 (2026-04-02)

### 🩹 Fixes

- **codegen:** moved tmpl/core to devDeps to avoid jsr install issues ([c322fbe60](https://github.com/powerhouse-inc/powerhouse/commit/c322fbe60))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.152 (2026-04-02)

This was a version bump only, there were no code changes.

## 6.0.0-dev.151 (2026-04-01)

### 🩹 Fixes

- added missing boilerplate dependencies ([4b2d17ef8](https://github.com/powerhouse-inc/powerhouse/commit/4b2d17ef8))
- **codegen:** fixed type on package.json boilerplate ([26e9c5b81](https://github.com/powerhouse-inc/powerhouse/commit/26e9c5b81))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.150 (2026-04-01)

### 🩹 Fixes

- **registry:** use unique names when unpacking packages ([bf539ca55](https://github.com/powerhouse-inc/powerhouse/commit/bf539ca55))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.149 (2026-04-01)

### 🚀 Features

- auto-discover and install packages for unknown document types ([#2401](https://github.com/powerhouse-inc/powerhouse/issues/2401), [#2415](https://github.com/powerhouse-inc/powerhouse/issues/2415))

### 🩹 Fixes

- address PR review feedback ([1a303570b](https://github.com/powerhouse-inc/powerhouse/commit/1a303570b))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.148 (2026-04-01)

### 🩹 Fixes

- **shared:** do not bundle reactor-api on browser ([b915fd353](https://github.com/powerhouse-inc/powerhouse/commit/b915fd353))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.147 (2026-04-01)

### 🚀 Features

- unify package and manifest types ([#2458](https://github.com/powerhouse-inc/powerhouse/pull/2458))

### 🩹 Fixes

- format readme ([01011a461](https://github.com/powerhouse-inc/powerhouse/commit/01011a461))
- **reactor-api:** handle async processor factories ([a354ba37f](https://github.com/powerhouse-inc/powerhouse/commit/a354ba37f))

### ❤️ Thank You

- acaldas
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.146 (2026-04-01)

### 🩹 Fixes

- **docker:** fix switchboard-entrypoint.sh ([18a4013d7](https://github.com/powerhouse-inc/powerhouse/commit/18a4013d7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.145 (2026-04-01)

### 🩹 Fixes

- **registry:** cache and resolve different package versions ([773d021a2](https://github.com/powerhouse-inc/powerhouse/commit/773d021a2))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.144 (2026-04-01)

This was a version bump only, there were no code changes.

## 6.0.0-dev.143 (2026-03-31)

### 🚀 Features

- **switchboard,reactor-api:** implemented httpPackageLoader ([ba53e2298](https://github.com/powerhouse-inc/powerhouse/commit/ba53e2298))

### 🩹 Fixes

- **registry:** increase package size limit ([677dad4d7](https://github.com/powerhouse-inc/powerhouse/commit/677dad4d7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.142 (2026-03-31)

### 🩹 Fixes

- **docker:** use scoped registry for @powerhousedao instead of global override ([33d06b487](https://github.com/powerhouse-inc/powerhouse/commit/33d06b487))

### ❤️ Thank You

- Frank

## 6.0.0-dev.141 (2026-03-31)

### 🩹 Fixes

- **registry:** proxy @powerhousedao packages to npm as fallback ([ea89f5337](https://github.com/powerhouse-inc/powerhouse/commit/ea89f5337))

### ❤️ Thank You

- Frank

## 6.0.0-dev.140 (2026-03-31)

### 🚀 Features

- **registry:** enable npm proxy uplink in Verdaccio ([405733914](https://github.com/powerhouse-inc/powerhouse/commit/405733914))

### 🩹 Fixes

- **docker:** use .npmrc for scoped registry config ([8568e3a20](https://github.com/powerhouse-inc/powerhouse/commit/8568e3a20))

### ❤️ Thank You

- Frank

## 6.0.0-dev.139 (2026-03-31)

### 🩹 Fixes

- **docker:** use scoped registry for @powerhousedao packages ([f7c8ff72c](https://github.com/powerhouse-inc/powerhouse/commit/f7c8ff72c))

### ❤️ Thank You

- Frank

## 6.0.0-dev.138 (2026-03-31)

### 🚀 Features

- **docker:** install PH_PACKAGES at switchboard startup ([fdf33e0aa](https://github.com/powerhouse-inc/powerhouse/commit/fdf33e0aa))
- **docker:** install PH_PACKAGES at switchboard startup ([c510da354](https://github.com/powerhouse-inc/powerhouse/commit/c510da354))

### ❤️ Thank You

- Frank

## 6.0.0-dev.137 (2026-03-31)

### 🩹 Fixes

- **reactor-api:** always include ImportPackageLoader alongside custom loaders ([f33785d1a](https://github.com/powerhouse-inc/powerhouse/commit/f33785d1a))

### ❤️ Thank You

- Frank

## 6.0.0-dev.136 (2026-03-31)

### 🚀 Features

- bulk rename everything with the name drive editor ([#2457](https://github.com/powerhouse-inc/powerhouse/pull/2457))
- **reactor-api,switchboard:** load processors and subgraphs via HTTP registry ([6ebc6e069](https://github.com/powerhouse-inc/powerhouse/commit/6ebc6e069))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.135 (2026-03-31)

This was a version bump only, there were no code changes.

## 6.0.0-dev.134 (2026-03-31)

### 🚀 Features

- remove usage of package name in codegen ([#2455](https://github.com/powerhouse-inc/powerhouse/pull/2455))
- **reactor-api:** support version tags in HTTP package loader ([525c894e8](https://github.com/powerhouse-inc/powerhouse/commit/525c894e8))

### 🩹 Fixes

- **ph-cli:** exclude reactor-api on browser build ([0c50c9fbf](https://github.com/powerhouse-inc/powerhouse/commit/0c50c9fbf))

### ❤️ Thank You

- acaldas
- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.133 (2026-03-31)

This was a version bump only, there were no code changes.

## 6.0.0-dev.132 (2026-03-31)

### 🚀 Features

- **registry:** support version tags in CDN resolver ([59405166b](https://github.com/powerhouse-inc/powerhouse/commit/59405166b))

### ❤️ Thank You

- Frank

## 6.0.0-dev.131 (2026-03-31)

### 🚀 Features

- add separate node and browser processor bundles ([#2451](https://github.com/powerhouse-inc/powerhouse/pull/2451))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.130 (2026-03-31)

This was a version bump only, there were no code changes.

## 6.0.0-dev.129 (2026-03-30)

### 🩹 Fixes

- **registry:** resolve correct package version on CDN and /packages ([ff9dc1a8a](https://github.com/powerhouse-inc/powerhouse/commit/ff9dc1a8a))

### ❤️ Thank You

- acaldas
- Claude Opus 4.6 (1M context)

## 6.0.0-dev.128 (2026-03-30)

### 🩹 Fixes

- **reactor-api,switchboard:** import vite loader from subexport ([1909d0c25](https://github.com/powerhouse-inc/powerhouse/commit/1909d0c25))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.127 (2026-03-30)

### 🩹 Fixes

- **connect,docker:** set connect registry url on build step ([cc96c4ad7](https://github.com/powerhouse-inc/powerhouse/commit/cc96c4ad7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.126 (2026-03-30)

### 🚀 Features

- **connect,docker:** load PH_PACKAGES from runtime JSON instead of build-time define ([701eec6ac](https://github.com/powerhouse-inc/powerhouse/commit/701eec6ac))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.125 (2026-03-30)

### 🚀 Features

- **docker:** install switchboard directly instead of ph-cmd ([66ab86bc1](https://github.com/powerhouse-inc/powerhouse/commit/66ab86bc1))
- **docker:** use switchboard bin directly in entrypoint ([6848e119b](https://github.com/powerhouse-inc/powerhouse/commit/6848e119b))

### 🩹 Fixes

- **connect,builder-tools,design-system:** multiple fixes to dynamic package loading in connect ([fb47de8b3](https://github.com/powerhouse-inc/powerhouse/commit/fb47de8b3))

### ❤️ Thank You

- acaldas
- Frank

## 6.0.0-dev.124 (2026-03-30)

This was a version bump only, there were no code changes.

## 6.0.0-dev.123 (2026-03-29)

### 🚀 Features

- **docker:** redesign Docker strategy with runtime package loading ([08207df3d](https://github.com/powerhouse-inc/powerhouse/commit/08207df3d))

### ❤️ Thank You

- Frank

## 6.0.0-dev.122 (2026-03-29)

### 🚀 Features

- **reactor-api:** expose reactorClient to processors via IProcessorHostModule ([31cb05627](https://github.com/powerhouse-inc/powerhouse/commit/31cb05627))
- **reactor-api:** expose reactorClient to processors via IProcessorHostModule ([32d3dea71](https://github.com/powerhouse-inc/powerhouse/commit/32d3dea71))

### 🩹 Fixes

- **reactor-api:** use typed variable instead of as-cast for module ([b7ad3f575](https://github.com/powerhouse-inc/powerhouse/commit/b7ad3f575))

### ❤️ Thank You

- Frank

## 6.0.0-dev.121 (2026-03-29)

### 🩹 Fixes

- **document-model:** add ./core subpath export for backwards compat ([53b7fe0c9](https://github.com/powerhouse-inc/powerhouse/commit/53b7fe0c9))

### ❤️ Thank You

- Frank

## 6.0.0-dev.120 (2026-03-29)

### 🩹 Fixes

- **codegen:** use valid semver 4.0.0 instead of 4.x in zod version check ([7c26bac23](https://github.com/powerhouse-inc/powerhouse/commit/7c26bac23))

### ❤️ Thank You

- Frank

## 6.0.0-dev.119 (2026-03-29)

This was a version bump only, there were no code changes.

## 6.0.0-dev.118 (2026-03-28)

### 🚀 Features

- **reactor-api:** add opt-in Prometheus metrics exporter ([82d2939b1](https://github.com/powerhouse-inc/powerhouse/commit/82d2939b1))

### ❤️ Thank You

- Frank

## 6.0.0-dev.117 (2026-03-28)

This was a version bump only, there were no code changes.

## 6.0.0-dev.116 (2026-03-27)

### 🚀 Features

- verify signatures on switchboard an consider actions without an app key on signer as unsigned ([c9a45d2e7](https://github.com/powerhouse-inc/powerhouse/commit/c9a45d2e7))

### 🩹 Fixes

- dependency improvements ([a41a67741](https://github.com/powerhouse-inc/powerhouse/commit/a41a67741))
- **document-drive:** exclude self from collision check when renaming nodes ([7dfc73268](https://github.com/powerhouse-inc/powerhouse/commit/7dfc73268))
- **reactor-api:** updated findDocuments search type ([bed034b6a](https://github.com/powerhouse-inc/powerhouse/commit/bed034b6a))
- **reactor-api:** deserialize signatures in pushSyncEnvelopes resolver ([ab5a33eb6](https://github.com/powerhouse-inc/powerhouse/commit/ab5a33eb6))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 6.0.0-dev.115 (2026-03-27)

### 🚀 Features

- **reactor-api:** add FastifyHttpAdapter implementing IHttpAdapter ([94d3d9b48](https://github.com/powerhouse-inc/powerhouse/commit/94d3d9b48))
- **reactor-api:** add FastifyHttpAdapter with dispatch-map design ([969d56af3](https://github.com/powerhouse-inc/powerhouse/commit/969d56af3))
- **reactor-api:** add MercuriusGatewayAdapter implementing IGatewayAdapter ([ea05779a3](https://github.com/powerhouse-inc/powerhouse/commit/ea05779a3))

### ❤️ Thank You

- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.114 (2026-03-27)

### 🚀 Features

- **registry:** simplify Dockerfile to install from npm ([7e2c2fa91](https://github.com/powerhouse-inc/powerhouse/commit/7e2c2fa91))

### 🩹 Fixes

- **profiling:** remove document-drive build steps — package deleted from monorepo ([8aec81b67](https://github.com/powerhouse-inc/powerhouse/commit/8aec81b67))
- **reactor-api:** resolve ESLint unsafe-any errors in mountNodeRoute and Sentry handler ([40777f429](https://github.com/powerhouse-inc/powerhouse/commit/40777f429))
- **reactor-mcp:** inject transport constructor to avoid fragile SDK module mocking ([1316d2d0a](https://github.com/powerhouse-inc/powerhouse/commit/1316d2d0a))
- **reactor-mcp:** use static import and per-test transport mocks for robustness ([7dbd84c8a](https://github.com/powerhouse-inc/powerhouse/commit/7dbd84c8a))
- **reactor-mcp:** use factory function instead of mock constructor to fix CI test failures ([cc1bf8c58](https://github.com/powerhouse-inc/powerhouse/commit/cc1bf8c58))
- **reactor-mcp:** fix TransportFactory return type to satisfy server.connect() ([361d41163](https://github.com/powerhouse-inc/powerhouse/commit/361d41163))

### ❤️ Thank You

- acaldas @acaldas
- Claude Opus 4.6 (1M context)
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.113 (2026-03-27)

### 🚀 Features

- expand codegen tests to cover new cases ([#2432](https://github.com/powerhouse-inc/powerhouse/pull/2432))
- **codegen:** add functions to ensure package exports wildcards and tsconfig paths ([284cebd92](https://github.com/powerhouse-inc/powerhouse/commit/284cebd92))
- **design-system:** add PackageAnimation component and use it for install indicators ([4104f7c46](https://github.com/powerhouse-inc/powerhouse/commit/4104f7c46))

### 🩹 Fixes

- exclude node_modules and dist from test runs ([44b9cd745](https://github.com/powerhouse-inc/powerhouse/commit/44b9cd745))
- **builder-tools:** use official esmExternalRequirePlugin for React externals ([1dab2319b](https://github.com/powerhouse-inc/powerhouse/commit/1dab2319b))
- **codegen:** handle JSONC comments in ensureTsconfigPaths ([ae3cd38fe](https://github.com/powerhouse-inc/powerhouse/commit/ae3cd38fe))
- **codegen:** e2e tests for doc model and subgraph generation -- and a fix for a bug they found ([1c58a34df](https://github.com/powerhouse-inc/powerhouse/commit/1c58a34df))
- **codegen:** tests were referencing the wrong thing ([db5ea60b3](https://github.com/powerhouse-inc/powerhouse/commit/db5ea60b3))
- **codegen:** tsconfig updates on codegen e2e tests ([ffe18c602](https://github.com/powerhouse-inc/powerhouse/commit/ffe18c602))
- **reactor-api:** register dynamic document models into registry on package change ([3611b08df](https://github.com/powerhouse-inc/powerhouse/commit/3611b08df))
- **vetra:** add missing Connect boilerplate files for ph vetra ([bfe64f705](https://github.com/powerhouse-inc/powerhouse/commit/bfe64f705))
- **vetra:** move connect dependency to root and fix CSS import ([1e288a8a9](https://github.com/powerhouse-inc/powerhouse/commit/1e288a8a9))
- **vetra:** exclude connect entry points from tsc --build ([eb139f7b8](https://github.com/powerhouse-inc/powerhouse/commit/eb139f7b8))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.112 (2026-03-26)

### 🚀 Features

- **codegen:** e2e codegen processor tests ([08686abc6](https://github.com/powerhouse-inc/powerhouse/commit/08686abc6))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.111 (2026-03-25)

### 🩹 Fixes

- **registry:** add rootDir to Dockerfile tsconfig to fix TS5011 ([848c98a7b](https://github.com/powerhouse-inc/powerhouse/commit/848c98a7b))

### ❤️ Thank You

- Frank

## 6.0.0-dev.110 (2026-03-25)

### 🩹 Fixes

- **codegen:** whoops, dangling reference to a removed package ([2a662d764](https://github.com/powerhouse-inc/powerhouse/commit/2a662d764))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.109 (2026-03-24)

### 🚀 Features

- **reactor-browser:** use single batch query when pulling operations on remote controller ([2a6e89831](https://github.com/powerhouse-inc/powerhouse/commit/2a6e89831))
- **vetra-e2e:** add editor creation, registry publish, and consumer install e2e tests ([a215a7d7e](https://github.com/powerhouse-inc/powerhouse/commit/a215a7d7e))

### 🩹 Fixes

- lockfile ([292187fae](https://github.com/powerhouse-inc/powerhouse/commit/292187fae))
- updating graphql-manager tests ([f79860625](https://github.com/powerhouse-inc/powerhouse/commit/f79860625))
- **profiling:** update docs-create.ts for namespaced DocumentModel mutations ([d5476da28](https://github.com/powerhouse-inc/powerhouse/commit/d5476da28))
- **profiling:** rebuild document-drive bundle after switchboard tsc ([678e9bf4a](https://github.com/powerhouse-inc/powerhouse/commit/678e9bf4a))
- **profiling:** add vetra build step to switchboard-pyroscope.sh ([654e30d02](https://github.com/powerhouse-inc/powerhouse/commit/654e30d02))
- **reactor:** return cursor when single scope is requested on getOperations ([b7c6a6c33](https://github.com/powerhouse-inc/powerhouse/commit/b7c6a6c33))
- **reactor-api:** fix OOM and routing bugs in gateway/http adapters ([b11f2d8fb](https://github.com/powerhouse-inc/powerhouse/commit/b11f2d8fb))
- **reactor-api:** address code review findings ([4790bdf6f](https://github.com/powerhouse-inc/powerhouse/commit/4790bdf6f))
- **reactor-api:** replace inline import() type annotations with top-level import type ([7f26efab7](https://github.com/powerhouse-inc/powerhouse/commit/7f26efab7))
- **reactor-api:** restore GraphQLSchema import and SSE handler mount post-rebase ([e800547ef](https://github.com/powerhouse-inc/powerhouse/commit/e800547ef))
- **reactor-api:** move ILogger import from document-drive to document-model ([50b9e0130](https://github.com/powerhouse-inc/powerhouse/commit/50b9e0130))
- **reactor-api:** remove custom.d.ts and utils/auth.ts that were incorrectly re-added ([1dbbab89f](https://github.com/powerhouse-inc/powerhouse/commit/1dbbab89f))
- **reactor-local:** cast api.app.handle for Vite middleware mount ([9e9a016f4](https://github.com/powerhouse-inc/powerhouse/commit/9e9a016f4))
- **switchboard:** cast api.app.handle to Express for Vite middleware mount ([87197a864](https://github.com/powerhouse-inc/powerhouse/commit/87197a864))
- **switchboard:** use DATABASE_URL for read model storage instead of PGlite ([fabdf4e96](https://github.com/powerhouse-inc/powerhouse/commit/fabdf4e96))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Frank
- Guillermo Puente @gpuente
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.108 (2026-03-24)

### 🚀 Features

- add tsdown ([276222480](https://github.com/powerhouse-inc/powerhouse/commit/276222480))
- start using tsdown ([b8b03f73a](https://github.com/powerhouse-inc/powerhouse/commit/b8b03f73a))
- remove dependency on knex from analytics engine browser ([e87e0c75a](https://github.com/powerhouse-inc/powerhouse/commit/e87e0c75a))
- add build command ([b8427cbca](https://github.com/powerhouse-inc/powerhouse/commit/b8427cbca))
- re-implement package manager and add start connect function ([1fd9946b4](https://github.com/powerhouse-inc/powerhouse/commit/1fd9946b4))
- differentiate between local install and registry install in package status ([5ef853a1e](https://github.com/powerhouse-inc/powerhouse/commit/5ef853a1e))
- update registry status on registry install ([51350f361](https://github.com/powerhouse-inc/powerhouse/commit/51350f361))
- bundle manifest file as json ([81a43c326](https://github.com/powerhouse-inc/powerhouse/commit/81a43c326))
- add always bundle to build deps ([0cd1977b8](https://github.com/powerhouse-inc/powerhouse/commit/0cd1977b8))
- make vetra a common package in connect ([4b366d892](https://github.com/powerhouse-inc/powerhouse/commit/4b366d892))
- update config for versioned documents test package ([a29d6b9ab](https://github.com/powerhouse-inc/powerhouse/commit/a29d6b9ab))
- add versioned deps as dep of vetra-e2e ([884de81e5](https://github.com/powerhouse-inc/powerhouse/commit/884de81e5))
- dang that's a lot of files ([d7c198c22](https://github.com/powerhouse-inc/powerhouse/commit/d7c198c22))
- add separate node build for document-model ([40655a814](https://github.com/powerhouse-inc/powerhouse/commit/40655a814))
- deal with an absolutely ridiculous amount of wrong exports ([d45e52ab9](https://github.com/powerhouse-inc/powerhouse/commit/d45e52ab9))
- move shared cli types ([437455beb](https://github.com/powerhouse-inc/powerhouse/commit/437455beb))
- bundle cli shared stuff separately ([0f1f1ed8e](https://github.com/powerhouse-inc/powerhouse/commit/0f1f1ed8e))
- add document drive bundle step ([4c5085630](https://github.com/powerhouse-inc/powerhouse/commit/4c5085630))
- update imports for document drive stuff ([0113ea3fc](https://github.com/powerhouse-inc/powerhouse/commit/0113ea3fc))
- update external package dependency handling ([a920a272c](https://github.com/powerhouse-inc/powerhouse/commit/a920a272c))
- do not try to load from node modules when env is prod ([66a4e2c38](https://github.com/powerhouse-inc/powerhouse/commit/66a4e2c38))
- adjust registry url precedence order ([a0f77148a](https://github.com/powerhouse-inc/powerhouse/commit/a0f77148a))
- fix vetra bugs ([#2426](https://github.com/powerhouse-inc/powerhouse/pull/2426))
- register vetra document models and processors in switchboard ([b50da707e](https://github.com/powerhouse-inc/powerhouse/commit/b50da707e))
- **analytics-engine:** use tsdown in analytics engine ([ef8bce39c](https://github.com/powerhouse-inc/powerhouse/commit/ef8bce39c))
- **builder-tools:** use tsdown for builder tools ([076657a43](https://github.com/powerhouse-inc/powerhouse/commit/076657a43))
- **config:** add registry provider type and resolveRegistryConfig helper ([5756e445e](https://github.com/powerhouse-inc/powerhouse/commit/5756e445e))
- **ph-cli:** use tsdown to bundle ph-cli ([b32726fc1](https://github.com/powerhouse-inc/powerhouse/commit/b32726fc1))
- **ph-cli:** add ph publish command for registry publishing ([9d31678be](https://github.com/powerhouse-inc/powerhouse/commit/9d31678be))
- **ph-cli:** use Powerhouse registry by default in ph install ([eaad33e13](https://github.com/powerhouse-inc/powerhouse/commit/eaad33e13))
- **ph-cmd:** use tsdown for ph-cmd ([23ea5bc8d](https://github.com/powerhouse-inc/powerhouse/commit/23ea5bc8d))
- **registry:** use tsdown in registry ([fd3da952b](https://github.com/powerhouse-inc/powerhouse/commit/fd3da952b))
- **registry:** updated registry readme ([05814d2d2](https://github.com/powerhouse-inc/powerhouse/commit/05814d2d2))
- **switchboard:** resolve registry URL from powerhouse.config.json ([a524fa593](https://github.com/powerhouse-inc/powerhouse/commit/a524fa593))
- **switchboard:** add DYNAMIC_MODEL_LOADING feature flag ([50aa9c40e](https://github.com/powerhouse-inc/powerhouse/commit/50aa9c40e))
- **vetra:** do not bundle processors isomorphically ([6f9d380a6](https://github.com/powerhouse-inc/powerhouse/commit/6f9d380a6))

### 🩹 Fixes

- handle both node and browser types ([90f793133](https://github.com/powerhouse-inc/powerhouse/commit/90f793133))
- strange export style in reactor browser which caused circular references ([683e17196](https://github.com/powerhouse-inc/powerhouse/commit/683e17196))
- duplicate fields in design system ([165e9b862](https://github.com/powerhouse-inc/powerhouse/commit/165e9b862))
- type mock weirdness ([74e669c0f](https://github.com/powerhouse-inc/powerhouse/commit/74e669c0f))
- e2e tests ([d1bfe5f08](https://github.com/powerhouse-inc/powerhouse/commit/d1bfe5f08))
- increase wait times even more :') ([276f9c8a8](https://github.com/powerhouse-inc/powerhouse/commit/276f9c8a8))
- so much, too much to even describe ([4aa9ebf54](https://github.com/powerhouse-inc/powerhouse/commit/4aa9ebf54))
- always build css after bundling ([565d11dca](https://github.com/powerhouse-inc/powerhouse/commit/565d11dca))
- always build css after bundle ([36dca2c95](https://github.com/powerhouse-inc/powerhouse/commit/36dca2c95))
- uplink in registry ([94552a93a](https://github.com/powerhouse-inc/powerhouse/commit/94552a93a))
- update package name and description for versioned documents ([87b35eb0f](https://github.com/powerhouse-inc/powerhouse/commit/87b35eb0f))
- stop mixing node and browser code ([9d5513533](https://github.com/powerhouse-inc/powerhouse/commit/9d5513533))
- update config and always bundle document model ([08485e5ea](https://github.com/powerhouse-inc/powerhouse/commit/08485e5ea))
- merge bugs ([9867902b7](https://github.com/powerhouse-inc/powerhouse/commit/9867902b7))
- codegen tests ([b857b8ab6](https://github.com/powerhouse-inc/powerhouse/commit/b857b8ab6))
- long test ([687e70c1e](https://github.com/powerhouse-inc/powerhouse/commit/687e70c1e))
- deps ([cbb8c5da9](https://github.com/powerhouse-inc/powerhouse/commit/cbb8c5da9))
- add retry loop for k8s push race conditions ([31659b5e3](https://github.com/powerhouse-inc/powerhouse/commit/31659b5e3))
- include academy tenant in dev releases ([a459f0edf](https://github.com/powerhouse-inc/powerhouse/commit/a459f0edf))
- **builder-tools:** externalize React in Connect production build to share instance with registry packages ([8eefadf8f](https://github.com/powerhouse-inc/powerhouse/commit/8eefadf8f))
- **codegen:** replace document-model/core imports with document-model in all templates ([70a0a00dc](https://github.com/powerhouse-inc/powerhouse/commit/70a0a00dc))
- **codegen:** align generated file patterns with versioned-documents project ([184da7eff](https://github.com/powerhouse-inc/powerhouse/commit/184da7eff))
- **codegen:** namespace module action exports to prevent duplicate identifier collision with baseActions ([2d4dd5ffd](https://github.com/powerhouse-inc/powerhouse/commit/2d4dd5ffd))
- **codegen:** use startConnect with local package in boilerplate so document models load in Connect ([05c1a6efd](https://github.com/powerhouse-inc/powerhouse/commit/05c1a6efd))
- **codegen:** add editor registration verification step to AGENTS.md template ([8deed647b](https://github.com/powerhouse-inc/powerhouse/commit/8deed647b))
- **codegen:** use document-model instead of @powerhousedao/shared/document-model in template outputs ([1dcf9927b](https://github.com/powerhouse-inc/powerhouse/commit/1dcf9927b))
- **connect:** derive CDN URL from base registry URL and read package config from env vars ([48bb6ec34](https://github.com/powerhouse-inc/powerhouse/commit/48bb6ec34))
- **connect:** use explicit index.js import from registry url ([037ddcdeb](https://github.com/powerhouse-inc/powerhouse/commit/037ddcdeb))
- **connect:** suppress Vite warning for dynamic package imports ([bbb465eb9](https://github.com/powerhouse-inc/powerhouse/commit/bbb465eb9))
- **connect,vetra:** move vite plugin node polyfills to specific packages ([e3b0fa37b](https://github.com/powerhouse-inc/powerhouse/commit/e3b0fa37b))
- **document-drive:** fix tsc build and prisma ESM \_\_dirname error ([f0c252d96](https://github.com/powerhouse-inc/powerhouse/commit/f0c252d96))
- **ph-cli:** allow ph publish to forward extra flags to npm publish ([86e75367d](https://github.com/powerhouse-inc/powerhouse/commit/86e75367d))
- **reactor-api:** resolve relative and bare imports from CDN-loaded modules ([ebbd0aafb](https://github.com/powerhouse-inc/powerhouse/commit/ebbd0aafb))
- **reactor-api:** use only latest specification in GraphQL schema generation ([10d906243](https://github.com/powerhouse-inc/powerhouse/commit/10d906243))
- **reactor-api:** resolve tsconfig path aliases in switchboard's Vite SSR loader ([dd812a933](https://github.com/powerhouse-inc/powerhouse/commit/dd812a933))
- **reactor-browser:** add explicit return types to hooks to prevent tsdown emitting any in declarations ([86cf174a5](https://github.com/powerhouse-inc/powerhouse/commit/86cf174a5))
- **registry:** extract tarball to CDN cache immediately after publish ([997060d7c](https://github.com/powerhouse-inc/powerhouse/commit/997060d7c))
- **registry:** check all fallback paths before extraction and prevent concurrent extractions ([e857b174b](https://github.com/powerhouse-inc/powerhouse/commit/e857b174b))
- **vetra:** extract global state correctly in PackageGenerator ([827a3bfe2](https://github.com/powerhouse-inc/powerhouse/commit/827a3bfe2))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.107 (2026-03-23)

### 🩹 Fixes

- **registry:** use dev tag for workspace deps in Docker build ([c740af183](https://github.com/powerhouse-inc/powerhouse/commit/c740af183))

### ❤️ Thank You

- Frank

## 6.0.0-dev.106 (2026-03-23)

### 🚀 Features

- add ph build command 2 ([#2415](https://github.com/powerhouse-inc/powerhouse/pull/2415))
- **registry:** add publish notifications via SSE and webhooks ([782cc0b85](https://github.com/powerhouse-inc/powerhouse/commit/782cc0b85))

### 🩹 Fixes

- add git pull --rebase before push in k8s update jobs to avoid race conditions ([fa7af726f](https://github.com/powerhouse-inc/powerhouse/commit/fa7af726f))
- **registry:** resolve workspace:\* deps in Dockerfile for standalone install ([a4670f563](https://github.com/powerhouse-inc/powerhouse/commit/a4670f563))
- **release:** remove stale build-connect step, now covered by build-bundle ([e00eed45a](https://github.com/powerhouse-inc/powerhouse/commit/e00eed45a))

### ❤️ Thank You

- acaldas @acaldas
- Claude Opus 4.6 (1M context)
- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.105 (2026-03-23)

This was a version bump only, there were no code changes.

## 6.0.0-dev.104 (2026-03-22)

This was a version bump only, there were no code changes.

## 6.0.0-dev.103 (2026-03-21)

### 🚀 Features

- **reactor-api:** namespace document model queries and mutations ([a0d50a226](https://github.com/powerhouse-inc/powerhouse/commit/a0d50a226))
- **reactor-api:** add SSE subscription transport alongside WebSocket ([40fdeee89](https://github.com/powerhouse-inc/powerhouse/commit/40fdeee89))
- **reactor-api:** add dev script for local development ([ec29e40ee](https://github.com/powerhouse-inc/powerhouse/commit/ec29e40ee))

### 🩹 Fixes

- **reactor:** temporary fix for deleting documents and cleaning up all edges too -- very costly ([8a15a0604](https://github.com/powerhouse-inc/powerhouse/commit/8a15a0604))
- **reactor-api,codegen:** added namespace to custom subgraph and fixed loading of document models with multiple versions ([b68cd8972](https://github.com/powerhouse-inc/powerhouse/commit/b68cd8972))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Claude Opus 4.6 (1M context)

## 6.0.0-dev.102 (2026-03-20)

### 🩹 Fixes

- update workflow to use refname for tag in case it is not annotated, and provide a clear error message when there is no tag ([269758716](https://github.com/powerhouse-inc/powerhouse/commit/269758716))
- **builder-tools,reactor-browser:** bundling fixes ([59dfd75b6](https://github.com/powerhouse-inc/powerhouse/commit/59dfd75b6))
- **reactor:** fix issue where deleted docs were still being returned -- document-view should store isdeleted across all scopes ([709b4917c](https://github.com/powerhouse-inc/powerhouse/commit/709b4917c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan

## 6.0.0-dev.101 (2026-03-20)

### 🚀 Features

- **examples:** add Discord webhook processor example ([fc09a4d66](https://github.com/powerhouse-inc/powerhouse/commit/fc09a4d66))
- **reactor-api:** documents subgraph call ([2efd5e899](https://github.com/powerhouse-inc/powerhouse/commit/2efd5e899))
- **shared:** add full-text search processor for document indexing ([48ffbff4f](https://github.com/powerhouse-inc/powerhouse/commit/48ffbff4f))

### 🩹 Fixes

- **ph-cli:** suppress misleading npm fallback warning when using --pnpm flag ([100603968](https://github.com/powerhouse-inc/powerhouse/commit/100603968))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 4.6
- Guillermo Puente @gpuente

## 6.0.0-dev.100 (2026-03-19)

This was a version bump only, there were no code changes.

## 6.0.0-dev.99 (2026-03-18)

### 🚀 Features

- **test-subscription:** adding a cli test-client for testing reactor api subscriptions ([563a8ac7d](https://github.com/powerhouse-inc/powerhouse/commit/563a8ac7d))

### 🩹 Fixes

- updated pnpm-lock ([c2843dc5b](https://github.com/powerhouse-inc/powerhouse/commit/c2843dc5b))
- **reactor-browser:** added missing dependency declarations ([c8705d324](https://github.com/powerhouse-inc/powerhouse/commit/c8705d324))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.98 (2026-03-18)

### 🩹 Fixes

- **connect:** declare dependencies ([6aa6910d3](https://github.com/powerhouse-inc/powerhouse/commit/6aa6910d3))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.97 (2026-03-18)

### 🚀 Features

- **reactor:** introducing a new quarantine feature -- now instead of blocking an entire remote from updating after sync issues, we only quarantine affected documents ([6df4d4a31](https://github.com/powerhouse-inc/powerhouse/commit/6df4d4a31))
- **reactor:** abort signals should be able to be passed all the way through the job pipeline, which also gives us job timeout ([192ff6111](https://github.com/powerhouse-inc/powerhouse/commit/192ff6111))

### 🩹 Fixes

- **common,connect:** fix ph connect build and missing assets on dev ([667c4ef4e](https://github.com/powerhouse-inc/powerhouse/commit/667c4ef4e))
- **design-system:** removed zod dependency ([fdc7c2ef7](https://github.com/powerhouse-inc/powerhouse/commit/fdc7c2ef7))
- **reactor:** gql channel should not have multiple pushes in-flight at the same time ([bdcd32a01](https://github.com/powerhouse-inc/powerhouse/commit/bdcd32a01))
- **reactor:** removing some dead code ([4aa05f61c](https://github.com/powerhouse-inc/powerhouse/commit/4aa05f61c))
- **reactor:** backfill should stream pages into outbox to get them all, and to prevent in-memory buildup ([fa3acba22](https://github.com/powerhouse-inc/powerhouse/commit/fa3acba22))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan

## 6.0.0-dev.96 (2026-03-17)

### 🚀 Features

- **reactor-api:** added preferred editor to gql subgraph ([48db6bced](https://github.com/powerhouse-inc/powerhouse/commit/48db6bced))

### 🩹 Fixes

- **codegen:** use relative imports instead of barrel imports in codegen ([464aaed78](https://github.com/powerhouse-inc/powerhouse/commit/464aaed78))
- **connect:** add pglite worker to bundle ([2d315aec9](https://github.com/powerhouse-inc/powerhouse/commit/2d315aec9))
- **switchboard:** enforce OTel provider registration ordering via StartServerOptions ([c797fd242](https://github.com/powerhouse-inc/powerhouse/commit/c797fd242))
- **switchboard:** avoid double /v1/metrics suffix in OTLP exporter URL ([c184093c3](https://github.com/powerhouse-inc/powerhouse/commit/c184093c3))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.95 (2026-03-17)

### 🚀 Features

- **switchboard:** add OTel metrics export via OTEL_EXPORTER_OTLP_ENDPOINT ([52f34aa1f](https://github.com/powerhouse-inc/powerhouse/commit/52f34aa1f))

### 🩹 Fixes

- **codegen:** added missing deps to boilerplate ([721dcb581](https://github.com/powerhouse-inc/powerhouse/commit/721dcb581))
- **docs-create:** create AbortSignal per request instead of at construction ([53217dadc](https://github.com/powerhouse-inc/powerhouse/commit/53217dadc))
- **reactor-api:** add missing GetDocumentWithOperations validator ([0c31c223b](https://github.com/powerhouse-inc/powerhouse/commit/0c31c223b))
- **reactor-api:** remove duplicate GetDocumentWithOperations validator ([e9cbcce02](https://github.com/powerhouse-inc/powerhouse/commit/e9cbcce02))
- **switchboard:** address OTel metrics review feedback ([c5ac016fc](https://github.com/powerhouse-inc/powerhouse/commit/c5ac016fc))
- **switchboard:** address further OTel metrics review feedback ([dee185ba8](https://github.com/powerhouse-inc/powerhouse/commit/dee185ba8))
- **switchboard:** set exportTimeoutMillis to stay under shutdown deadline ([341d88d9e](https://github.com/powerhouse-inc/powerhouse/commit/341d88d9e))
- **switchboard:** derive exportTimeoutMillis from exportIntervalMillis ([775a77f3b](https://github.com/powerhouse-inc/powerhouse/commit/775a77f3b))

### ❤️ Thank You

- acaldas @acaldas
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.94 (2026-03-17)

### 🩹 Fixes

- **common:** added missing runtime dependencies ([b0f647f75](https://github.com/powerhouse-inc/powerhouse/commit/b0f647f75))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.93 (2026-03-17)

### 🩹 Fixes

- **ph-cli:** cleaner error message unless debug flag is active ([bc95a455a](https://github.com/powerhouse-inc/powerhouse/commit/bc95a455a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.92 (2026-03-17)

### 🩹 Fixes

- **ph-cmd:** check node version before importing commands ([55717fc06](https://github.com/powerhouse-inc/powerhouse/commit/55717fc06))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.91 (2026-03-17)

### 🚀 Features

- **reactor-api:** typed initial state in create mutation ([987969f0d](https://github.com/powerhouse-inc/powerhouse/commit/987969f0d))

### 🩹 Fixes

- adding build-bundle to simulate-ci-workflow ([ca93d1a2b](https://github.com/powerhouse-inc/powerhouse/commit/ca93d1a2b))
- **reactor:** gql requests should hava abort signal ([2d764968e](https://github.com/powerhouse-inc/powerhouse/commit/2d764968e))
- **reactor, reactor-api:** added multiple sync recovery fixes ([9e7bfa64f](https://github.com/powerhouse-inc/powerhouse/commit/9e7bfa64f))
- **reactor, reactor-api:** added multiple sync recovery fixes ([#2407](https://github.com/powerhouse-inc/powerhouse/pull/2407))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.90 (2026-03-14)

### 🚀 Features

- add OpenTelemetry metrics support to profiling scripts ([8b4687d2b](https://github.com/powerhouse-inc/powerhouse/commit/8b4687d2b))
- add conditional --otel flag to switchboard-pyroscope.sh ([f85c9c63d](https://github.com/powerhouse-inc/powerhouse/commit/f85c9c63d))
- **reactor-browser:** controller fetches resulting state and operations on single query ([7165ea990](https://github.com/powerhouse-inc/powerhouse/commit/7165ea990))

### 🩹 Fixes

- address code review issues in opentelemetry-instrumentation-reactor ([72c751c67](https://github.com/powerhouse-inc/powerhouse/commit/72c751c67))
- address further code review issues in profiling scripts ([8f0bc6bfb](https://github.com/powerhouse-inc/powerhouse/commit/8f0bc6bfb))
- remove hardcoded platform from postgres service in docker-compose ([8d8ce625e](https://github.com/powerhouse-inc/powerhouse/commit/8d8ce625e))
- use exact arg matching for --otel detection in run-reactor-direct.sh ([07ff552aa](https://github.com/powerhouse-inc/powerhouse/commit/07ff552aa))
- align P1 and P99 PromQL window sizes in README ([26adb5068](https://github.com/powerhouse-inc/powerhouse/commit/26adb5068))
- correct --otel argument parsing in profiling shell scripts ([829dd4f4e](https://github.com/powerhouse-inc/powerhouse/commit/829dd4f4e))
- remove remaining non-null assertions in registerObservableGauges ([05a0df1c7](https://github.com/powerhouse-inc/powerhouse/commit/05a0df1c7))
- reverse OTel teardown order to preserve final gauge observations ([16e10c2a8](https://github.com/powerhouse-inc/powerhouse/commit/16e10c2a8))
- properly remove observable gauge callbacks on stop() ([35164b411](https://github.com/powerhouse-inc/powerhouse/commit/35164b411))
- add timeout to async queueDepth observable callback ([c9d505a71](https://github.com/powerhouse-inc/powerhouse/commit/c9d505a71))
- clear stale timeout in queueDepth observable callback ([61a89e9e0](https://github.com/powerhouse-inc/powerhouse/commit/61a89e9e0))
- handle createWriteStream errors in reactor-direct.ts ([18ca236de](https://github.com/powerhouse-inc/powerhouse/commit/18ca236de))
- **reactor-api:** added missing zod validator ([5c8ae345a](https://github.com/powerhouse-inc/powerhouse/commit/5c8ae345a))

### ❤️ Thank You

- acaldas @acaldas
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.89 (2026-03-13)

### 🚀 Features

- **reactor:** add a DocumentIntegrityService with keyframe/snapshot validation and rebuild, a new integrity inspector UI component, and IKeyframeStore.listKeyframes/deleteKeyframes extensions ([7baebff7f](https://github.com/powerhouse-inc/powerhouse/commit/7baebff7f))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.88 (2026-03-12)

### 🚀 Features

- reactor-hypercore example ([d5557973a](https://github.com/powerhouse-inc/powerhouse/commit/d5557973a))
- **reactor:** massive refactor to write model which attempts to unify txns with execution context ([622c009c3](https://github.com/powerhouse-inc/powerhouse/commit/622c009c3))
- **reactor-browser:** replace renown provider with basic component and useInitRenown hook ([09f995b02](https://github.com/powerhouse-inc/powerhouse/commit/09f995b02))

### 🩹 Fixes

- restore missing SWITCHBOARD_PATH in switchboard-pyroscope.sh ([669f19e93](https://github.com/powerhouse-inc/powerhouse/commit/669f19e93))
- resolve high priority issues in profiling scripts ([79b6675e2](https://github.com/powerhouse-inc/powerhouse/commit/79b6675e2))
- **profiling:** fixing build issues ([5fc824143](https://github.com/powerhouse-inc/powerhouse/commit/5fc824143))
- **reactor:** fire event outside of txn ([7616a6f02](https://github.com/powerhouse-inc/powerhouse/commit/7616a6f02))
- **reactor:** fixed a caching issue that could occur if commit failed ([d7fd3661b](https://github.com/powerhouse-inc/powerhouse/commit/d7fd3661b))
- **reactor-hypercore:** a range of fixes for edge cases in hypercore ([8d60c4178](https://github.com/powerhouse-inc/powerhouse/commit/8d60c4178))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.87 (2026-03-12)

### 🩹 Fixes

- **reactor-browser:** changed remote controller mode to optional ([fc692c2ad](https://github.com/powerhouse-inc/powerhouse/commit/fc692c2ad))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.86 (2026-03-12)

### 🚀 Features

- **renown,reactor-browser:** renown integration improvements ([a65731a73](https://github.com/powerhouse-inc/powerhouse/commit/a65731a73))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.85 (2026-03-12)

### 🚀 Features

- auto-discover and install packages for unknown document types ([4e8fa145c](https://github.com/powerhouse-inc/powerhouse/commit/4e8fa145c))
- auto-discover and install packages for unknown document types ([#2401](https://github.com/powerhouse-inc/powerhouse/pull/2401))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.84 (2026-03-11)

### 🚀 Features

- **registry:** add vetra favicon to registry web UI ([fcfb8458e](https://github.com/powerhouse-inc/powerhouse/commit/fcfb8458e))

### ❤️ Thank You

- Frank

## 6.0.0-dev.83 (2026-03-11)

### 🚀 Features

- **registry:** enable dark mode by default and use light logo ([11e7c0085](https://github.com/powerhouse-inc/powerhouse/commit/11e7c0085))

### ❤️ Thank You

- Frank

## 6.0.0-dev.82 (2026-03-11)

### 🚀 Features

- **registry:** add Vetra branding to registry web UI ([8d012ff10](https://github.com/powerhouse-inc/powerhouse/commit/8d012ff10))

### ❤️ Thank You

- Frank

## 6.0.0-dev.81 (2026-03-11)

### 🩹 Fixes

- **registry:** use cli.js as Docker entrypoint instead of run.js ([869e52795](https://github.com/powerhouse-inc/powerhouse/commit/869e52795))

### ❤️ Thank You

- Frank

## 6.0.0-dev.80 (2026-03-11)

### 🩹 Fixes

- **registry:** handle absolute paths for storage and cdn-cache dirs ([da85b2547](https://github.com/powerhouse-inc/powerhouse/commit/da85b2547))

### ❤️ Thank You

- Frank

## 6.0.0-dev.79 (2026-03-11)

### 🚀 Features

- **ci:** add gitops action for registry image updates ([ba91d00dd](https://github.com/powerhouse-inc/powerhouse/commit/ba91d00dd))

### ❤️ Thank You

- Frank

## 6.0.0-dev.78 (2026-03-11)

### 🚀 Features

- replace reactor dropdown with registry selector in package manager ([c8a944a24](https://github.com/powerhouse-inc/powerhouse/commit/c8a944a24))
- replace reactor dropdown with registry selector in package manager ([#2399](https://github.com/powerhouse-inc/powerhouse/pull/2399))
- **connect:** first pass at processor inspector in connect ([a59450bd1](https://github.com/powerhouse-inc/powerhouse/commit/a59450bd1))
- **profiling:** add --async flag to docs-create and auto-migrate in switchboard-pyroscope ([5f17e5d0f](https://github.com/powerhouse-inc/powerhouse/commit/5f17e5d0f))
- **profiling:** two-phase async dispatch with sampled concurrent polling ([caedc847d](https://github.com/powerhouse-inc/powerhouse/commit/caedc847d))
- **profiling:** add per-loop dispatch timing output ([55cae92d7](https://github.com/powerhouse-inc/powerhouse/commit/55cae92d7))
- **reactor:** migrating channel connection status to a state machine, added hooks for this, and an inspector tab ([c64755563](https://github.com/powerhouse-inc/powerhouse/commit/c64755563))

### 🩹 Fixes

- **profiling:** fix jobStatus polling and add missing build step ([f05f614a7](https://github.com/powerhouse-inc/powerhouse/commit/f05f614a7))
- **profiling:** correct terminal job status from READ_MODELS_READY to READ_READY ([2ea29e390](https://github.com/powerhouse-inc/powerhouse/commit/2ea29e390))
- **profiling:** add timeout to pollJobAsync and validate mutation response ([390d54cf0](https://github.com/powerhouse-inc/powerhouse/commit/390d54cf0))
- **profiling:** record timed-out async jobs in output and metrics ([1046858a8](https://github.com/powerhouse-inc/powerhouse/commit/1046858a8))
- **profiling:** address six code review issues in docs-create and README ([e22a39a31](https://github.com/powerhouse-inc/powerhouse/commit/e22a39a31))
- **reactor:** discover existing drives on ProcessorManager restart ([07d22e79d](https://github.com/powerhouse-inc/powerhouse/commit/07d22e79d))
- **reactor:** guard against deleting all cursors, fix redundant backfill issue, guard against cursor killing backfill, use paging ([8303bcf64](https://github.com/powerhouse-inc/powerhouse/commit/8303bcf64))

### ❤️ Thank You

- Benjamin Jordan
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.77 (2026-03-10)

### 🩹 Fixes

- **connect,reactor:** fixed peerDependencies ([d7f0e3623](https://github.com/powerhouse-inc/powerhouse/commit/d7f0e3623))
- **renown:** moved e2e script test to reactor-browser ([3c9b41045](https://github.com/powerhouse-inc/powerhouse/commit/3c9b41045))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.76 (2026-03-10)

### 🩹 Fixes

- **renown:** cleaned up exports ([e103574e2](https://github.com/powerhouse-inc/powerhouse/commit/e103574e2))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.75 (2026-03-10)

### 🩹 Fixes

- **reactor-browser:** improved renown exports ([dbaa24259](https://github.com/powerhouse-inc/powerhouse/commit/dbaa24259))
- **registry:** copy pnpm-workspace.yaml for Docker build catalog resolution ([7407700b1](https://github.com/powerhouse-inc/powerhouse/commit/7407700b1))
- **registry:** resolve catalog references in Dockerfile with sed ([765e8fbdd](https://github.com/powerhouse-inc/powerhouse/commit/765e8fbdd))
- **registry:** add typescript to Docker build stage ([81604b764](https://github.com/powerhouse-inc/powerhouse/commit/81604b764))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 6.0.0-dev.74 (2026-03-10)

### 🚀 Features

- **ci:** add registry Docker image to publish workflow ([17544abad](https://github.com/powerhouse-inc/powerhouse/commit/17544abad))

### ❤️ Thank You

- Frank

## 6.0.0-dev.73 (2026-03-10)

### 🚀 Features

- opentelementry-instrumentation-reactor package ([67d5c31e5](https://github.com/powerhouse-inc/powerhouse/commit/67d5c31e5))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.72 (2026-03-09)

### 🚀 Features

- **renown,reactor-browser,connect:** cleanup renown integration ([fe6112c2c](https://github.com/powerhouse-inc/powerhouse/commit/fe6112c2c))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.71 (2026-03-07)

### 🚀 Features

- **connect,reactor-browser:** add dynamic package loading from HTTP registry ([f92816782](https://github.com/powerhouse-inc/powerhouse/commit/f92816782))
- **connect,reactor-browser:** add dynamic package loading from HTTP registry ([#2395](https://github.com/powerhouse-inc/powerhouse/pull/2395))
- **document-model,reactor-api,reactor-browser:** implemented remote document controller ([6299c21da](https://github.com/powerhouse-inc/powerhouse/commit/6299c21da))

### 🩹 Fixes

- **reactor-browser:** fix lint issue ([303075e19](https://github.com/powerhouse-inc/powerhouse/commit/303075e19))
- **reactor-browser:** removed subexports ([4cda7f44c](https://github.com/powerhouse-inc/powerhouse/commit/4cda7f44c))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.70 (2026-03-06)

### 🚀 Features

- add new bundling for connect ([#2390](https://github.com/powerhouse-inc/powerhouse/pull/2390))
- **codegen:** generate controller.ts for each document model ([326bf660e](https://github.com/powerhouse-inc/powerhouse/commit/326bf660e))
- **switchboard,reactor-api,registry:** add runtime dynamic pacage loading from HTTP registry ([37f91250e](https://github.com/powerhouse-inc/powerhouse/commit/37f91250e))
- **switchboard,reactor-api,registry:** add runtime dynamic pacage loading from HTTP registry ([#2394](https://github.com/powerhouse-inc/powerhouse/pull/2394))

### 🩹 Fixes

- eslint config ([fb20b3726](https://github.com/powerhouse-inc/powerhouse/commit/fb20b3726))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.69 (2026-03-05)

### 🚀 Features

- **document-model:** added controller class for documents ([f17432e68](https://github.com/powerhouse-inc/powerhouse/commit/f17432e68))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.68 (2026-03-04)

### 🚀 Features

- migrate mcp-reactor and subgraph gen to new reactor ([#2387](https://github.com/powerhouse-inc/powerhouse/pull/2387))
- **codegen:** versioned reducers by default ([c8111a1d9](https://github.com/powerhouse-inc/powerhouse/commit/c8111a1d9))

### 🩹 Fixes

- include operation.reducer in codegen ([bd87e2c1a](https://github.com/powerhouse-inc/powerhouse/commit/bd87e2c1a))
- compatibility issues with codegen and vetra ([17723c37f](https://github.com/powerhouse-inc/powerhouse/commit/17723c37f))
- resolve empty name causing silent ADD_FILE failure in drives ([b44ed0c1c](https://github.com/powerhouse-inc/powerhouse/commit/b44ed0c1c))
- **codegen:** correct and expand AGENTS.md template for document model guidance ([37a3f364d](https://github.com/powerhouse-inc/powerhouse/commit/37a3f364d))
- **codegen:** the lookup for file paths did not support both versions ([9edb78394](https://github.com/powerhouse-inc/powerhouse/commit/9edb78394))
- **reactor-api:** remove dead sync exports from index ([efc057075](https://github.com/powerhouse-inc/powerhouse/commit/efc057075))
- **reactor-mcp:** adopt new reactor client interface for MCP server ([1b8e6fb19](https://github.com/powerhouse-inc/powerhouse/commit/1b8e6fb19))
- **reactor-mcp:** resolve zod v3/v4 incompatibility with MCP SDK ([65c9b1399](https://github.com/powerhouse-inc/powerhouse/commit/65c9b1399))
- **vetra:** use childLogger tag support instead of manual color formatting ([195bd4c36](https://github.com/powerhouse-inc/powerhouse/commit/195bd4c36))
- **vetra:** extract global state from full PHDocument in codegen generators ([6e5d851df](https://github.com/powerhouse-inc/powerhouse/commit/6e5d851df))
- **vetra:** remove custom subgraphs from vetra ([3a1e3b9b0](https://github.com/powerhouse-inc/powerhouse/commit/3a1e3b9b0))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.67 (2026-03-03)

### 🩹 Fixes

- **academy:** remove outdated production warning from authorization docs ([137a38d74](https://github.com/powerhouse-inc/powerhouse/commit/137a38d74))

### ❤️ Thank You

- Frank

## 6.0.0-dev.66 (2026-03-03)

### 🚀 Features

- move reactor logic from connect to reactor browser ([#2385](https://github.com/powerhouse-inc/powerhouse/pull/2385))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.65 (2026-03-03)

### 🩹 Fixes

- **analytics-engine:** update repository urls ([96afe4437](https://github.com/powerhouse-inc/powerhouse/commit/96afe4437))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.64 (2026-03-03)

### 🚀 Features

- **codegen:** move analytics engine core to versioned dev dependencies ([a7ebd1ed5](https://github.com/powerhouse-inc/powerhouse/commit/a7ebd1ed5))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.62 (2026-03-03)

### 🚀 Features

- **ci:** push academy to Harbor academy project and update k8s for academy namespace ([efbf8f58d](https://github.com/powerhouse-inc/powerhouse/commit/efbf8f58d))

### 🩹 Fixes

- moving analytics processors to shared and fixing them, fixing other linting errors toos ([0c8f7fe98](https://github.com/powerhouse-inc/powerhouse/commit/0c8f7fe98))
- cherry-picked fixes ([a73630a6a](https://github.com/powerhouse-inc/powerhouse/commit/a73630a6a))
- remove dev auth ([b081263f5](https://github.com/powerhouse-inc/powerhouse/commit/b081263f5))

### ❤️ Thank You

- Benjamin Jordan
- Frank

## 6.0.0-dev.61 (2026-02-27)

### 🚀 Features

- add bundle step for ph cli ([#2375](https://github.com/powerhouse-inc/powerhouse/pull/2375))
- **ci:** update k8s-hosting academy image tag after docker publish ([0b98b73a9](https://github.com/powerhouse-inc/powerhouse/commit/0b98b73a9))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.60 (2026-02-27)

### 🚀 Features

- per-document protection auth model ([2e538ddb8](https://github.com/powerhouse-inc/powerhouse/commit/2e538ddb8))

### 🩹 Fixes

- prettier formatting in document-permission.service.ts ([ea01cd9a7](https://github.com/powerhouse-inc/powerhouse/commit/ea01cd9a7))
- address PR review feedback for auth system ([802ad744c](https://github.com/powerhouse-inc/powerhouse/commit/802ad744c))
- allow anonymous writes on unprotected documents ([52298bf14](https://github.com/powerhouse-inc/powerhouse/commit/52298bf14))

### ❤️ Thank You

- Frank

## 6.0.0-dev.59 (2026-02-26)

### 🚀 Features

- use update-ts-references tool which also removes unused ones ([#2374](https://github.com/powerhouse-inc/powerhouse/pull/2374))

### 🩹 Fixes

- remove artificial paging limit -- reshuffle depth is NOT the same as query depth ([3d3706253](https://github.com/powerhouse-inc/powerhouse/commit/3d3706253))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.58 (2026-02-25)

### 🚀 Features

- add document model versioning documentation ([f32fcff3c](https://github.com/powerhouse-inc/powerhouse/commit/f32fcff3c))
- add document model versioning documentation ([#2345](https://github.com/powerhouse-inc/powerhouse/pull/2345))
- added ability to configure max reshuffle depth in reactor orchestrator ([94f3ae986](https://github.com/powerhouse-inc/powerhouse/commit/94f3ae986))

### 🩹 Fixes

- load jobs should fetch document meta to see if the document has been deleted -- also we should not retry jobs where documents were deleted ([2cab0fcb3](https://github.com/powerhouse-inc/powerhouse/commit/2cab0fcb3))
- when a document is deleted, connect should redirect ([055708699](https://github.com/powerhouse-inc/powerhouse/commit/055708699))
- **executor:** update write cache after delete so double-deletion returns DocumentDeletedError ([06de40d98](https://github.com/powerhouse-inc/powerhouse/commit/06de40d98))
- **write-cache:** address PR review feedback ([a160fe311](https://github.com/powerhouse-inc/powerhouse/commit/a160fe311))

### 🔥 Performance

- **reducer:** pre-allocate operation arrays to avoid resize overhead ([1cf1c0078](https://github.com/powerhouse-inc/powerhouse/commit/1cf1c0078))
- **write-cache:** slice operations to last-per-scope to eliminate O(n²) copies ([ac55a6131](https://github.com/powerhouse-inc/powerhouse/commit/ac55a6131))

### ❤️ Thank You

- Benjamin Jordan
- CallmeT-ty @CallmeT-ty
- Guillermo Puente @gpuente
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.57 (2026-02-24)

### 🚀 Features

- dead letter persistent storage ([c7249bf13](https://github.com/powerhouse-inc/powerhouse/commit/c7249bf13))
- integration test with hub/spoke ([54da03684](https://github.com/powerhouse-inc/powerhouse/commit/54da03684))
- run sync integration test as part of reactor flow ([7dea8bf3e](https://github.com/powerhouse-inc/powerhouse/commit/7dea8bf3e))
- the integration orchestrator should forward switchboard logs ([e0806c66a](https://github.com/powerhouse-inc/powerhouse/commit/e0806c66a))

### 🩹 Fixes

- build step before integration test ([0b6b48f74](https://github.com/powerhouse-inc/powerhouse/commit/0b6b48f74))
- arg, workflow changes should trigger the workflow ([645cca08f](https://github.com/powerhouse-inc/powerhouse/commit/645cca08f))
- switchboard needs build:misc ([916f761b8](https://github.com/powerhouse-inc/powerhouse/commit/916f761b8))
- build fix in document-view tests ([66d7a5483](https://github.com/powerhouse-inc/powerhouse/commit/66d7a5483))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.56 (2026-02-21)

### 🚀 Features

- honing in on the mamth model v experimental data ([db3833e7c](https://github.com/powerhouse-inc/powerhouse/commit/db3833e7c))
- document-model resolution fixes ([41c95c507](https://github.com/powerhouse-inc/powerhouse/commit/41c95c507))
- jobs that fail from document not found errors get deferred and requeued ([5232928f0](https://github.com/powerhouse-inc/powerhouse/commit/5232928f0))

### 🩹 Fixes

- whoops, properly export things for reactor-api ([2a769bda9](https://github.com/powerhouse-inc/powerhouse/commit/2a769bda9))
- reactor-api tests were broken since they did not use the resolver ([169e2b11d](https://github.com/powerhouse-inc/powerhouse/commit/169e2b11d))
- gql rename can timeout ([aacda89f7](https://github.com/powerhouse-inc/powerhouse/commit/aacda89f7))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.55 (2026-02-20)

### 🚀 Features

- added ordinals to the channel inspector ([dd472fab8](https://github.com/powerhouse-inc/powerhouse/commit/dd472fab8))
- test-connect and reactor gql updates to pass along more context ([ae581e8e8](https://github.com/powerhouse-inc/powerhouse/commit/ae581e8e8))

### 🩹 Fixes

- fail job when loader fails ([f32b72a94](https://github.com/powerhouse-inc/powerhouse/commit/f32b72a94))
- fixed deep bug where index count was wrong during reshuffle ([a25ad9f91](https://github.com/powerhouse-inc/powerhouse/commit/a25ad9f91))
- linter and testing issues ([34215801a](https://github.com/powerhouse-inc/powerhouse/commit/34215801a))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.54 (2026-02-19)

### 🚀 Features

- improved logging on vetra, switchboard and connect ([3fb127687](https://github.com/powerhouse-inc/powerhouse/commit/3fb127687))
- added ability to remove a remote through the inspector ([0a06fcdc1](https://github.com/powerhouse-inc/powerhouse/commit/0a06fcdc1))
- add the ability to change the poll interval in the inspector ([0d47c30f9](https://github.com/powerhouse-inc/powerhouse/commit/0d47c30f9))
- wip orchestrator for the test-client ([186d7c015](https://github.com/powerhouse-inc/powerhouse/commit/186d7c015))
- **connect:** build tweaks ([22b6bc7d5](https://github.com/powerhouse-inc/powerhouse/commit/22b6bc7d5))
- **profiling:** add --output option to reactor-direct for saving results to file ([6fb58db6d](https://github.com/powerhouse-inc/powerhouse/commit/6fb58db6d))
- **profiling:** use ISO 8601 timestamps in output file names ([09a74ae49](https://github.com/powerhouse-inc/powerhouse/commit/09a74ae49))
- **profiling:** print command arguments at start of reactor-direct output ([acbdc71f6](https://github.com/powerhouse-inc/powerhouse/commit/acbdc71f6))
- **profiling:** split output into --file (timestamped) and --output (exact path) ([971cc0c88](https://github.com/powerhouse-inc/powerhouse/commit/971cc0c88))

### 🩹 Fixes

- when a dead letter is added to the gql-req-channel, stop polling for goodness sake ([b2ac429bb](https://github.com/powerhouse-inc/powerhouse/commit/b2ac429bb))
- only add default drives once ([c06395d64](https://github.com/powerhouse-inc/powerhouse/commit/c06395d64))
- ackordinal now works again, in addition we send dead letters back in poll ([ba3f39a17](https://github.com/powerhouse-inc/powerhouse/commit/ba3f39a17))
- **ph-cli,switchboard:** create preview drive on new reactor ([1e5ed8794](https://github.com/powerhouse-inc/powerhouse/commit/1e5ed8794))
- **profiling:** simulate terminal carriage return behavior in output file ([2df9d9369](https://github.com/powerhouse-inc/powerhouse/commit/2df9d9369))
- **profiling:** improve output file robustness in reactor-direct ([020c76d7b](https://github.com/powerhouse-inc/powerhouse/commit/020c76d7b))

### 🔥 Performance

- **profiling:** added docker compose memory limits ([f26508a2b](https://github.com/powerhouse-inc/powerhouse/commit/f26508a2b))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.53 (2026-02-18)

### 🩹 Fixes

- fixing reshuffle issue with correct tiebreakers ([7be1adf54](https://github.com/powerhouse-inc/powerhouse/commit/7be1adf54))
- failing test because of timing pressure ([c996aa83e](https://github.com/powerhouse-inc/powerhouse/commit/c996aa83e))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.52 (2026-02-17)

### 🚀 Features

- **reactor-api:** optimize apollo server integration with express ([d6a765917](https://github.com/powerhouse-inc/powerhouse/commit/d6a765917))

### 🩹 Fixes

- **connect:** deduplicate document models by type and version ([564fb61b8](https://github.com/powerhouse-inc/powerhouse/commit/564fb61b8))
- **ph-cli:** fixed vetra preview drive port ([e8144cc4e](https://github.com/powerhouse-inc/powerhouse/commit/e8144cc4e))
- **reactor-api:** improved subgraph path matching and removed name parameter from reactor subgraph ([dcadf7fb3](https://github.com/powerhouse-inc/powerhouse/commit/dcadf7fb3))
- **vetra:** removed deprecated document model subgraphs ([6a4076af6](https://github.com/powerhouse-inc/powerhouse/commit/6a4076af6))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.51 (2026-02-17)

### 🩹 Fixes

- **design-system:** fix static assets relative path ([ae9d936dc](https://github.com/powerhouse-inc/powerhouse/commit/ae9d936dc))
- **reactor-browser,reactor:** improved error instance checks ([c6b8625e7](https://github.com/powerhouse-inc/powerhouse/commit/c6b8625e7))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.50 (2026-02-17)

### 🩹 Fixes

- **reactor-api:** use X-Forwarded-Proto header for correct protocol detection ([34cefd878](https://github.com/powerhouse-inc/powerhouse/commit/34cefd878))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.49 (2026-02-17)

### 🩹 Fixes

- **shared:** add missing repository field in shared package.json ([10283f638](https://github.com/powerhouse-inc/powerhouse/commit/10283f638))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.47 (2026-02-17)

### 🩹 Fixes

- **monorepo:** make shared package publicly available ([#2348](https://github.com/powerhouse-inc/powerhouse/pull/2348))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.46 (2026-02-17)

### 🚀 Features

- added sync status back ([6d8d8e420](https://github.com/powerhouse-inc/powerhouse/commit/6d8d8e420))
- the poll scheduler now considers backpressure when scheduling polls, also fixed some mocking issues ([df40e2502](https://github.com/powerhouse-inc/powerhouse/commit/df40e2502))
- adding exponential backoff and jitter for retries ([bbee985eb](https://github.com/powerhouse-inc/powerhouse/commit/bbee985eb))
- **connect:** re enable processors in connect ([#2342](https://github.com/powerhouse-inc/powerhouse/pull/2342))
- **profiling:** add Pyroscope data extraction and analysis script ([229736d74](https://github.com/powerhouse-inc/powerhouse/commit/229736d74))
- **profiling:** auto-run pyroscope-analyse after reactor-direct profiling ([9c978269f](https://github.com/powerhouse-inc/powerhouse/commit/9c978269f))
- **profiling:** auto-run pyroscope-analyse with flush delay and countdown ([7d3ed04a0](https://github.com/powerhouse-inc/powerhouse/commit/7d3ed04a0))

### 🩹 Fixes

- instead of moving failed outbox messages to deadletter, set for retry and only move unrecoverable errors ([5a6d4cae1](https://github.com/powerhouse-inc/powerhouse/commit/5a6d4cae1))
- **connect:** use correct translation key in ClearStorageModal ([34ba42246](https://github.com/powerhouse-inc/powerhouse/commit/34ba42246))
- **design-system:** fix drive icon and link in settings danger zone ([63392731e](https://github.com/powerhouse-inc/powerhouse/commit/63392731e))
- **profiling:** harden pyroscope-analyse error handling ([1794ed3d3](https://github.com/powerhouse-inc/powerhouse/commit/1794ed3d3))
- **profiling:** improve error handling and fix timestamp padding ([b26d9e788](https://github.com/powerhouse-inc/powerhouse/commit/b26d9e788))

### 🔥 Performance

- strip operations and clipboard from keyframes on persist ([d1cb126c2](https://github.com/powerhouse-inc/powerhouse/commit/d1cb126c2))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.45 (2026-02-16)

### 🚀 Features

- **monorepo:** ensure shared is only in dev deps ([#2341](https://github.com/powerhouse-inc/powerhouse/pull/2341))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.44 (2026-02-15)

### 🚀 Features

- added some more tests to prove consistency ([5d9c4469a](https://github.com/powerhouse-inc/powerhouse/commit/5d9c4469a))
- echo-prevention tests ([fb30d7e80](https://github.com/powerhouse-inc/powerhouse/commit/fb30d7e80))

### 🩹 Fixes

- timestamp comparator was busted ([829784954](https://github.com/powerhouse-inc/powerhouse/commit/829784954))
- build fixes ([f0aab9190](https://github.com/powerhouse-inc/powerhouse/commit/f0aab9190))
- fixing unit tests for channels and fixing persistence bug ([eea411d8b](https://github.com/powerhouse-inc/powerhouse/commit/eea411d8b))
- build fix in reactor-api for resolver changes ([00bddf850](https://github.com/powerhouse-inc/powerhouse/commit/00bddf850))
- fixed a couple edge cases in sync-manager ([873654f12](https://github.com/powerhouse-inc/powerhouse/commit/873654f12))
- fixed an issue with connect-switchboard sync and added more proof tests ([0ff5791c1](https://github.com/powerhouse-inc/powerhouse/commit/0ff5791c1))
- found a sql issue and fixed other failing reactor tests ([9c0b1f745](https://github.com/powerhouse-inc/powerhouse/commit/9c0b1f745))
- build fixes with import changes ([bd8bb613c](https://github.com/powerhouse-inc/powerhouse/commit/bd8bb613c))
- regenerating from schema to fix gql issues ([1ba2c4f09](https://github.com/powerhouse-inc/powerhouse/commit/1ba2c4f09))
- eliminate race condition in connect e2e test ([da56c426c](https://github.com/powerhouse-inc/powerhouse/commit/da56c426c))
- ordinal was not being sent in payload, and fixed gql shape change in tests ([58375cb69](https://github.com/powerhouse-inc/powerhouse/commit/58375cb69))
- log out all dead letters, correctly parse empty dependencies ([672f444d6](https://github.com/powerhouse-inc/powerhouse/commit/672f444d6))
- test was flaky, so we need to wait to setup sync until we are sure to enforce a reshuffle ([bd7b58718](https://github.com/powerhouse-inc/powerhouse/commit/bd7b58718))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.43 (2026-02-14)

### 🚀 Features

- **monorepo:** move more shared stuff to shared ([#2335](https://github.com/powerhouse-inc/powerhouse/pull/2335))

### 🩹 Fixes

- use working renown.id domain and clear user param on logout ([a88f6d6c5](https://github.com/powerhouse-inc/powerhouse/commit/a88f6d6c5))
- **reactor-browser:** do not use react-query for useSyncList hook ([62a82b9ea](https://github.com/powerhouse-inc/powerhouse/commit/62a82b9ea))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.42 (2026-02-13)

### 🚀 Features

- preserve existing signatures and support resulting state hash ([dd6b44675](https://github.com/powerhouse-inc/powerhouse/commit/dd6b44675))
- preserve existing signatures and support resulting state hash ([#2322](https://github.com/powerhouse-inc/powerhouse/pull/2322))

### 🩹 Fixes

- **codegen:** use dynamic document type name in module JSDoc comment ([345ee0678](https://github.com/powerhouse-inc/powerhouse/commit/345ee0678))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.41 (2026-02-12)

### 🚀 Features

- **monorepo:** use catalog for other shared deps ([#2330](https://github.com/powerhouse-inc/powerhouse/pull/2330))
- **vetra:** add processor apps input to vetra ([#2329](https://github.com/powerhouse-inc/powerhouse/pull/2329))

### 🩹 Fixes

- **builder-tools:** use same class-variance-authority as design-systom ([d600feb49](https://github.com/powerhouse-inc/powerhouse/commit/d600feb49))
- **connect:** correctly import lazy components of document model and generic drive editors ([5ca50910b](https://github.com/powerhouse-inc/powerhouse/commit/5ca50910b))
- **design-system:** copy assets to dist folder to enable relative path import ([de5cb5e4e](https://github.com/powerhouse-inc/powerhouse/commit/de5cb5e4e))
- **monorepo:** add build-cli to old release workflow ([a30624bd2](https://github.com/powerhouse-inc/powerhouse/commit/a30624bd2))
- **reactor:** use direct imports from document-drive ([88563000f](https://github.com/powerhouse-inc/powerhouse/commit/88563000f))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.40 (2026-02-12)

### 🚀 Features

- **codegen:** remove redundant run generated tests command ([#2325](https://github.com/powerhouse-inc/powerhouse/pull/2325))
- **monorepo:** add shared package ([#2324](https://github.com/powerhouse-inc/powerhouse/pull/2324))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.39 (2026-02-11)

### 🚀 Features

- use new drive GET REST endpoint ([69be5dc19](https://github.com/powerhouse-inc/powerhouse/commit/69be5dc19))
- enable ADD_LISTENER and ADD_TRIGGER GraphQL mutations with proper input types ([58a911c4f](https://github.com/powerhouse-inc/powerhouse/commit/58a911c4f))
- use addRemoteDrive from reactor-browser ([ad2e1137b](https://github.com/powerhouse-inc/powerhouse/commit/ad2e1137b))
- clean drive subgraphs ([#2302](https://github.com/powerhouse-inc/powerhouse/pull/2302))
- **reactor:** update drive info handling to include graphqlEndpoint in responses and streamline drive URL parsing ([7d40dda03](https://github.com/powerhouse-inc/powerhouse/commit/7d40dda03))
- **reactor,codegen:** handle processor apps in cli ([#2319](https://github.com/powerhouse-inc/powerhouse/pull/2319))
- **reactor-api:** add REST endpoint for drive info retrieval ([81034a7ae](https://github.com/powerhouse-inc/powerhouse/commit/81034a7ae))
- **reactor-api:** generate document-drive subgraph with union resolvers and invalid op filtering ([2998d9500](https://github.com/powerhouse-inc/powerhouse/commit/2998d9500))
- **reactor-api:** remove SystemSubgraph and related tests, update DefaultCoreSubgraphs ([e4412d6f7](https://github.com/powerhouse-inc/powerhouse/commit/e4412d6f7))

### 🩹 Fixes

- build fix for compatibility change ([20e0baf51](https://github.com/powerhouse-inc/powerhouse/commit/20e0baf51))
- **design-system:** fix lint issue ([2ba774546](https://github.com/powerhouse-inc/powerhouse/commit/2ba774546))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.38 (2026-02-10)

### 🩹 Fixes

- **design-system:** import assets with runtime relative paths ([852e94754](https://github.com/powerhouse-inc/powerhouse/commit/852e94754))
- **reactor:** avoid browser breaking # import ([b444b86df](https://github.com/powerhouse-inc/powerhouse/commit/b444b86df))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.37 (2026-02-10)

### 🚀 Features

- **codegen:** update processor generation to use context ([#2308](https://github.com/powerhouse-inc/powerhouse/pull/2308))
- **profiling:** add batch mode to reactor-direct profiling script ([2ad08d222](https://github.com/powerhouse-inc/powerhouse/commit/2ad08d222))
- **profiling:** add post-run verification to reactor-direct script ([b5e4ff840](https://github.com/powerhouse-inc/powerhouse/commit/b5e4ff840))
- **reactor-api:** added nested operations query on phdocument and Graphql client update ([67584e3fc](https://github.com/powerhouse-inc/powerhouse/commit/67584e3fc))

### 🩹 Fixes

- fixing all linter warnings ([0662a0b45](https://github.com/powerhouse-inc/powerhouse/commit/0662a0b45))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.36 (2026-02-06)

### 🚀 Features

- fixing scrolling and adding copy to mailbox and job inspectors ([0d2351f6f](https://github.com/powerhouse-inc/powerhouse/commit/0d2351f6f))
- loadBatch interface ([03bdf8a2a](https://github.com/powerhouse-inc/powerhouse/commit/03bdf8a2a))
- batch ids passed as meta ([30904169a](https://github.com/powerhouse-inc/powerhouse/commit/30904169a))
- **codegen:** use bun for the slowest tests ([#2303](https://github.com/powerhouse-inc/powerhouse/pull/2303))

### 🩹 Fixes

- removing unnecessary null checks ([f8d47b8b4](https://github.com/powerhouse-inc/powerhouse/commit/f8d47b8b4))
- dependencies are passed through poll as well ([8b9534bbd](https://github.com/powerhouse-inc/powerhouse/commit/8b9534bbd))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.35 (2026-02-06)

### 🩹 Fixes

- **document-model:** use string comparison for timestamps in updateHeaderRevision ([3a70e205e](https://github.com/powerhouse-inc/powerhouse/commit/3a70e205e))

### ❤️ Thank You

- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.34 (2026-02-05)

### 🚀 Features

- added a mode in the test-client where we instead query documents instead of creating them ([ba2a14e04](https://github.com/powerhouse-inc/powerhouse/commit/ba2a14e04))
- **codegen:** update processors codegen ([#2293](https://github.com/powerhouse-inc/powerhouse/pull/2293))

### 🩹 Fixes

- **ci:** allow release to continue when academy build fails ([477d9ef71](https://github.com/powerhouse-inc/powerhouse/commit/477d9ef71))
- **document-model:** use Date comparison in updateHeaderRevision to handle mixed timestamp precision ([66f4cd356](https://github.com/powerhouse-inc/powerhouse/commit/66f4cd356))

### 🔥 Performance

- **document-model:** optimize getDocumentLastModified from O(n log n) to O(n) ([bb94ff310](https://github.com/powerhouse-inc/powerhouse/commit/bb94ff310))
- **document-model:** pass timestamp directly to updateHeaderRevision ([86d72e831](https://github.com/powerhouse-inc/powerhouse/commit/86d72e831))
- **document-model:** prevent lastModifiedAtUtcIso from regressing to an earlier timestamp ([f48f6fb39](https://github.com/powerhouse-inc/powerhouse/commit/f48f6fb39))
- **document-model:** use linear scan in getNextRevision to avoid sorted-array assumption ([08a10de16](https://github.com/powerhouse-inc/powerhouse/commit/08a10de16))

### ❤️ Thank You

- Benjamin Jordan
- Frank
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.33 (2026-02-05)

### 🚀 Features

- single doc support on the test-client ([f7fd03afd](https://github.com/powerhouse-inc/powerhouse/commit/f7fd03afd))
- adding inspector for channel polling ([f9ff2d411](https://github.com/powerhouse-inc/powerhouse/commit/f9ff2d411))
- initial implementation of buffered mailbox ([fa91c8996](https://github.com/powerhouse-inc/powerhouse/commit/fa91c8996))
- replacing outbox with buffered outbox ([3a9397c67](https://github.com/powerhouse-inc/powerhouse/commit/3a9397c67))
- fixing pause, resume, flush of mailbox processing inspector ([cd11eeba0](https://github.com/powerhouse-inc/powerhouse/commit/cd11eeba0))
- batching mailbox items ([3b7a5ff7e](https://github.com/powerhouse-inc/powerhouse/commit/3b7a5ff7e))
- new queue inspector ([3c0c2f9cc](https://github.com/powerhouse-inc/powerhouse/commit/3c0c2f9cc))

### 🩹 Fixes

- batches need to keep doc id + scope in mind, dummy ([83de46307](https://github.com/powerhouse-inc/powerhouse/commit/83de46307))
- sync-manager fix that backfills before ADD_RELATIONSHIP ([7662e8109](https://github.com/powerhouse-inc/powerhouse/commit/7662e8109))
- reintroduced echo issue, but fixed along with test-client updates ([66d8e873f](https://github.com/powerhouse-inc/powerhouse/commit/66d8e873f))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.32 (2026-02-04)

### 🩹 Fixes

- remove duplicate trigger-downstream from publish-docker-images ([1f70c8041](https://github.com/powerhouse-inc/powerhouse/commit/1f70c8041))
- **reactor-api:** stop existing server and ws subscription before starting new one for subgraphs ([946f1f0d2](https://github.com/powerhouse-inc/powerhouse/commit/946f1f0d2))
- **reactor-api:** revert changes to subgraph server handling ([4260ec929](https://github.com/powerhouse-inc/powerhouse/commit/4260ec929))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 6.0.0-dev.31 (2026-02-04)

### 🚀 Features

- add new document model subgraph with new reactor API ([a282586c3](https://github.com/powerhouse-inc/powerhouse/commit/a282586c3))
- align document-model-subgraph with ReactorSubgraph patterns ([0c0813ef7](https://github.com/powerhouse-inc/powerhouse/commit/0c0813ef7))
- add new document model subgraph with new reactor API ([#2275](https://github.com/powerhouse-inc/powerhouse/pull/2275))
- trigger powerhouse-demo after release ([f5b63728d](https://github.com/powerhouse-inc/powerhouse/commit/f5b63728d))
- collection membership cache ([6a733e22d](https://github.com/powerhouse-inc/powerhouse/commit/6a733e22d))
- **profiling:** add reactor-direct.ts for direct reactor performance profiling ([806714e27](https://github.com/powerhouse-inc/powerhouse/commit/806714e27))
- **profiling:** add --show-action-types flag to reactor-direct ([e543bd45c](https://github.com/powerhouse-inc/powerhouse/commit/e543bd45c))
- **profiling:** add Pyroscope monitoring to reactor-direct ([2c7779229](https://github.com/powerhouse-inc/powerhouse/commit/2c7779229))

### 🩹 Fixes

- ignore release.ts ([25a40d2a6](https://github.com/powerhouse-inc/powerhouse/commit/25a40d2a6))
- unit test fixes ([014fc07ed](https://github.com/powerhouse-inc/powerhouse/commit/014fc07ed))
- resolve TypeScript errors in reactor-direct profiling script ([5262c3ff5](https://github.com/powerhouse-inc/powerhouse/commit/5262c3ff5))
- temporary fix for bad extensions ([a19df5358](https://github.com/powerhouse-inc/powerhouse/commit/a19df5358))
- refactoring job execution config ([76f9a7ce0](https://github.com/powerhouse-inc/powerhouse/commit/76f9a7ce0))
- more test fixes, and removing bad tests ([7f256071d](https://github.com/powerhouse-inc/powerhouse/commit/7f256071d))
- linting issues ([e1eb2c806](https://github.com/powerhouse-inc/powerhouse/commit/e1eb2c806))
- collection filtering ([f7627857b](https://github.com/powerhouse-inc/powerhouse/commit/f7627857b))
- tests need to use the correct collection id now that they are properly filtered ([65b0fd941](https://github.com/powerhouse-inc/powerhouse/commit/65b0fd941))
- **codegen:** fix prettier command on ph init ([c61a5f35e](https://github.com/powerhouse-inc/powerhouse/commit/c61a5f35e))
- **profiling:** add missing tsconfig references for reactor and document-model ([1e0f45985](https://github.com/powerhouse-inc/powerhouse/commit/1e0f45985))
- **reactor-api:** avoid exception when stopping apollo server before it has started ([4c11eab7d](https://github.com/powerhouse-inc/powerhouse/commit/4c11eab7d))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.30 (2026-02-03)

### 🩹 Fixes

- **release:** ignore errors on git stage ([e0c10d604](https://github.com/powerhouse-inc/powerhouse/commit/e0c10d604))
- **release:** typo in script name ([8e908a2d7](https://github.com/powerhouse-inc/powerhouse/commit/8e908a2d7))
- **releases:** include git side effects check in all booleans ([19c44503d](https://github.com/powerhouse-inc/powerhouse/commit/19c44503d))
- **releases:** remove problematic publish dry run ([8b9b065b9](https://github.com/powerhouse-inc/powerhouse/commit/8b9b065b9))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.29 (2026-02-03)

### 🚀 Features

- **monorepo:** simplified release workflow ([#2276](https://github.com/powerhouse-inc/powerhouse/pull/2276))
- **release:** add doc comments ([3ab9879d4](https://github.com/powerhouse-inc/powerhouse/commit/3ab9879d4))

### 🩹 Fixes

- package.json onlyBuilt ([3b6165267](https://github.com/powerhouse-inc/powerhouse/commit/3b6165267))
- circular ref ([c66f8cf27](https://github.com/powerhouse-inc/powerhouse/commit/c66f8cf27))
- **codegen:** update index.html template used on ph init ([57932e263](https://github.com/powerhouse-inc/powerhouse/commit/57932e263))
- **codegen:** fix type import on custom subgraph template ([b2d4c50a7](https://github.com/powerhouse-inc/powerhouse/commit/b2d4c50a7))
- **codegen:** do not assume prettier is globally installed ([31f6d5b45](https://github.com/powerhouse-inc/powerhouse/commit/31f6d5b45))
- **codegen:** deduplicate module errors by name ([c2ba9a74f](https://github.com/powerhouse-inc/powerhouse/commit/c2ba9a74f))
- **reactor-api:** close apollo server before starting new one ([9a216b924](https://github.com/powerhouse-inc/powerhouse/commit/9a216b924))
- **reactor-api:** provide operations on document query ([fcbb8bd4f](https://github.com/powerhouse-inc/powerhouse/commit/fcbb8bd4f))
- **reactor-api:** missing import ([764ffa4af](https://github.com/powerhouse-inc/powerhouse/commit/764ffa4af))
- **release:** move checkout action ([4ed305d57](https://github.com/powerhouse-inc/powerhouse/commit/4ed305d57))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.28 (2026-01-31)

### 🚀 Features

- added a withSignalHandlers function to the reactor-builder ([666cec6c7](https://github.com/powerhouse-inc/powerhouse/commit/666cec6c7))
- adding signal handlers and removing old feature flags ([f08253a2d](https://github.com/powerhouse-inc/powerhouse/commit/f08253a2d))
- add e2e tests to simulate ([6ba43d19b](https://github.com/powerhouse-inc/powerhouse/commit/6ba43d19b))
- **profiling:** add docs-count script to test totalCount field ([73108b1ad](https://github.com/powerhouse-inc/powerhouse/commit/73108b1ad))
- **reactor:** added totalCount in findDocuments pagination ([7f1118022](https://github.com/powerhouse-inc/powerhouse/commit/7f1118022))

### 🩹 Fixes

- process limitations in browser ([e674f48a6](https://github.com/powerhouse-inc/powerhouse/commit/e674f48a6))
- revert my previous test changes ([16e0a0a5c](https://github.com/powerhouse-inc/powerhouse/commit/16e0a0a5c))
- test fixes due to changed endpoint ([bab3fcaf9](https://github.com/powerhouse-inc/powerhouse/commit/bab3fcaf9))
- **design-system:** prevent file/folder from opening during rename ([0f6bf5875](https://github.com/powerhouse-inc/powerhouse/commit/0f6bf5875))
- **reactor-api:** enable document-model subgraph generation ([#2261](https://github.com/powerhouse-inc/powerhouse/pull/2261))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.27 (2026-01-30)

### 🚀 Features

- renown sdk improvements ([bc1099d94](https://github.com/powerhouse-inc/powerhouse/commit/bc1099d94))
- initial implementation of getMany on document-view ([11fc5f5b4](https://github.com/powerhouse-inc/powerhouse/commit/11fc5f5b4))
- **ph-cmd:** fix forwarding and versioning bug ([#2272](https://github.com/powerhouse-inc/powerhouse/pull/2272))
- **profiling:** add min/max operation timing to docs-create script ([2da048a5e](https://github.com/powerhouse-inc/powerhouse/commit/2da048a5e))
- **profiling:** add --op-loops flag to docs-create for repeated operation sets ([7f5a3eb3a](https://github.com/powerhouse-inc/powerhouse/commit/7f5a3eb3a))
- **profiling:** add --doc-id flag to run operations on existing documents ([fea513d7b](https://github.com/powerhouse-inc/powerhouse/commit/fea513d7b))
- **profiling:** add optional percentile statistics to docs-create ([f09a8efa0](https://github.com/powerhouse-inc/powerhouse/commit/f09a8efa0))

### 🩹 Fixes

- exporting more, removing outdated test ([5acdae784](https://github.com/powerhouse-inc/powerhouse/commit/5acdae784))
- removing unnecessary test ([616819a59](https://github.com/powerhouse-inc/powerhouse/commit/616819a59))
- compatibility fixes ([0cd3e430c](https://github.com/powerhouse-inc/powerhouse/commit/0cd3e430c))
- reactor-browser compatibility fixes ([22eefce08](https://github.com/powerhouse-inc/powerhouse/commit/22eefce08))
- missing unit tests for paging in the document indexer ([6e7d14273](https://github.com/powerhouse-inc/powerhouse/commit/6e7d14273))
- added a useDocumentOperations hook ([b2a98413f](https://github.com/powerhouse-inc/powerhouse/commit/b2a98413f))
- fixes for the new way operation history works ([ebe0e5b76](https://github.com/powerhouse-inc/powerhouse/commit/ebe0e5b76))
- **design-system:** update dropdown icons size and add drive modal position ([a7648b05a](https://github.com/powerhouse-inc/powerhouse/commit/a7648b05a))
- **profiling:** add input validation for numeric args in docs-create ([07b1754be](https://github.com/powerhouse-inc/powerhouse/commit/07b1754be))
- **profiling:** use linear interpolation for accurate percentile calculation ([4c916c473](https://github.com/powerhouse-inc/powerhouse/commit/4c916c473))

### 🔥 Performance

- **profiling:** remove unused timings array to prevent memory bloat ([a55f219cf](https://github.com/powerhouse-inc/powerhouse/commit/a55f219cf))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.26 (2026-01-29)

### 🚀 Features

- update minimum node version to 24 ([7a71107c5](https://github.com/powerhouse-inc/powerhouse/commit/7a71107c5))

### 🩹 Fixes

- nailed down the two-reactor sync tests with fake timers ([d6d5335da](https://github.com/powerhouse-inc/powerhouse/commit/d6d5335da))
- broken test expectation ([03a5014d9](https://github.com/powerhouse-inc/powerhouse/commit/03a5014d9))
- undo my changes to the tsc script ([0a36d0a49](https://github.com/powerhouse-inc/powerhouse/commit/0a36d0a49))
- **monorepo:** typescript versions ([#2265](https://github.com/powerhouse-inc/powerhouse/pull/2265))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.25 (2026-01-28)

### 🩹 Fixes

- fixing some bad tests ([cf8b8649a](https://github.com/powerhouse-inc/powerhouse/commit/cf8b8649a))
- resolve reshuffle race issues when timestamps match ([bb66eeb90](https://github.com/powerhouse-inc/powerhouse/commit/bb66eeb90))
- ci pipeline does not like my build command ([03c70d15e](https://github.com/powerhouse-inc/powerhouse/commit/03c70d15e))
- **design-system:** make package manager list fill available modal he… ([#2260](https://github.com/powerhouse-inc/powerhouse/pull/2260))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.24 (2026-01-27)

### 🚀 Features

- add toast and padding to revision history ([#2259](https://github.com/powerhouse-inc/powerhouse/pull/2259))
- **monorepo:** ensure the same typescript version is used everywhere ([#2258](https://github.com/powerhouse-inc/powerhouse/pull/2258))
- **profiling:** add runtime comparison script for switchboard ([8d9467278](https://github.com/powerhouse-inc/powerhouse/commit/8d9467278))
- **reactor-api:** add permission checks to DocumentModelSubgraphLegacy ([2ce8d2036](https://github.com/powerhouse-inc/powerhouse/commit/2ce8d2036))
- **switchboard:** enhance pyroscope profiler with wall and heap support ([254c0cea9](https://github.com/powerhouse-inc/powerhouse/commit/254c0cea9))
- **vetra:** add permission-utils for subgraph permission checks ([4563bae19](https://github.com/powerhouse-inc/powerhouse/commit/4563bae19))
- **vetra:** add permission checks to all subgraph resolvers ([e8f2f8ea5](https://github.com/powerhouse-inc/powerhouse/commit/e8f2f8ea5))

### 🩹 Fixes

- added many missing tests ([0afe3277f](https://github.com/powerhouse-inc/powerhouse/commit/0afe3277f))
- **ph-cmd:** use binary name instead of package name for pnpm exec ([94985a74a](https://github.com/powerhouse-inc/powerhouse/commit/94985a74a))
- **vetra,reactor-api:** add eslint-disable for permission test files ([9cab4e2b3](https://github.com/powerhouse-inc/powerhouse/commit/9cab4e2b3))
- **vetra,switchboard:** fix TypeScript errors in permission tests and profiler ([7726f95a3](https://github.com/powerhouse-inc/powerhouse/commit/7726f95a3))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.23 (2026-01-27)

### 🚀 Features

- **academy:** added release slides to academy project ([eab5e56fe](https://github.com/powerhouse-inc/powerhouse/commit/eab5e56fe))
- **monorepo:** add diff filter to exclude deleted files in changed files action ([e86961e79](https://github.com/powerhouse-inc/powerhouse/commit/e86961e79))
- **ph-cmd:** fix accidentally left over legacy behavior in init command ([8cadfb1ed](https://github.com/powerhouse-inc/powerhouse/commit/8cadfb1ed))

### 🩹 Fixes

- **academy:** added missing slide break ([4d2adfe41](https://github.com/powerhouse-inc/powerhouse/commit/4d2adfe41))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.22 (2026-01-27)

### 🩹 Fixes

- **monorepo:** inefficient workflows ([#2250](https://github.com/powerhouse-inc/powerhouse/pull/2250))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.21 (2026-01-27)

### 🚀 Features

- step one of operation filtering ([62580c897](https://github.com/powerhouse-inc/powerhouse/commit/62580c897))
- pulling operation filters into the store ([7c88714b4](https://github.com/powerhouse-inc/powerhouse/commit/7c88714b4))
- **profiling:** add --v2/--legacy flags to switchboard-pyroscope.sh ([9310b6343](https://github.com/powerhouse-inc/powerhouse/commit/9310b6343))
- **profiling:** add PostgreSQL database flag to switchboard-pyroscope ([f45092207](https://github.com/powerhouse-inc/powerhouse/commit/f45092207))
- **profiling:** add graceful shutdown handling to switchboard-pyroscope ([762f3915c](https://github.com/powerhouse-inc/powerhouse/commit/762f3915c))
- **profiling:** add docker-compose for PostgreSQL and Pyroscope services ([4d62d75f0](https://github.com/powerhouse-inc/powerhouse/commit/4d62d75f0))

### 🩹 Fixes

- vetra e2e tests ([#2253](https://github.com/powerhouse-inc/powerhouse/pull/2253))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.20 (2026-01-26)

### 🩹 Fixes

- **ph-cmd:** use full package name for ph-cli to fix npx resolution ([d2adc3ccf](https://github.com/powerhouse-inc/powerhouse/commit/d2adc3ccf))

### ❤️ Thank You

- Frank

## 6.0.0-dev.19 (2026-01-26)

### 🩹 Fixes

- **docker:** add ph-cli to global install for connect build ([5e818aa5c](https://github.com/powerhouse-inc/powerhouse/commit/5e818aa5c))
- **docker:** add ph-cli to global install for switchboard ([6cea7f52e](https://github.com/powerhouse-inc/powerhouse/commit/6cea7f52e))

### ❤️ Thank You

- Frank

## 6.0.0-dev.18 (2026-01-26)

### 🚀 Features

- **codegen:** add CI/CD workflow and Docker templates ([d034641cb](https://github.com/powerhouse-inc/powerhouse/commit/d034641cb))
- **codegen:** add DOCKER_PROJECT secret for custom project name ([7c23f9844](https://github.com/powerhouse-inc/powerhouse/commit/7c23f9844))
- **codegen:** skip npm/docker jobs if secrets not configured ([9d7ad8225](https://github.com/powerhouse-inc/powerhouse/commit/9d7ad8225))
- **ph-cli, ph-cmd:** use cmd ts for remaining ph cmd commands ([#2209](https://github.com/powerhouse-inc/powerhouse/pull/2209))

### 🩹 Fixes

- address pre-merge recommendations for CI templates ([c8c5c67ea](https://github.com/powerhouse-inc/powerhouse/commit/c8c5c67ea))
- trailing newline in publish-docker-images workflow ([7d2e30db4](https://github.com/powerhouse-inc/powerhouse/commit/7d2e30db4))
- **ci:** remove deploy-k8s from publish-docker-images workflow ([c5869e82f](https://github.com/powerhouse-inc/powerhouse/commit/c5869e82f))
- **codegen:** remove unnecessary escape characters in Dockerfile template ([1e5b91bca](https://github.com/powerhouse-inc/powerhouse/commit/1e5b91bca))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.17 (2026-01-26)

### 🩹 Fixes

- **academy:** remove reference to excluded DriveAnalyticsHooks doc ([83dc4dcf5](https://github.com/powerhouse-inc/powerhouse/commit/83dc4dcf5))

### ❤️ Thank You

- Frank

## 6.0.0-dev.16 (2026-01-24)

### 🚀 Features

- **codegen:** added testing reducers instructions and deduplicated agents.md and claude.md ([07af9b04f](https://github.com/powerhouse-inc/powerhouse/commit/07af9b04f))

### 🩹 Fixes

- revert import assets with runtime relative paths ([92f21e353](https://github.com/powerhouse-inc/powerhouse/commit/92f21e353))
- reactor backfill now respects timestamp ([6edcdeaeb](https://github.com/powerhouse-inc/powerhouse/commit/6edcdeaeb))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 6.0.0-dev.15 (2026-01-23)

### 🚀 Features

- add document renaming functionality ([#2238](https://github.com/powerhouse-inc/powerhouse/pull/2238))
- fix drive explorer scroll overflow and move default styling to editors and codegen templates ([#2243](https://github.com/powerhouse-inc/powerhouse/pull/2243))

### 🩹 Fixes

- wrap ConnectSidebar in ConnectTooltipProvider and fix vetra drive app bg ([9b6b9b4c1](https://github.com/powerhouse-inc/powerhouse/commit/9b6b9b4c1))
- **academy:** improved making authenticated requests ([079182b75](https://github.com/powerhouse-inc/powerhouse/commit/079182b75))
- **design-system:** remove circular import ([2c7252d38](https://github.com/powerhouse-inc/powerhouse/commit/2c7252d38))
- **reactor-browser:** use document extension when exporting document ([#2244](https://github.com/powerhouse-inc/powerhouse/pull/2244))
- **reactor-browser:** add support for preferred editor in drive document metadata ([2b8f13824](https://github.com/powerhouse-inc/powerhouse/commit/2b8f13824))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.14 (2026-01-22)

### 🚀 Features

- added a switchboard up with pyroscope script ([2821a14b7](https://github.com/powerhouse-inc/powerhouse/commit/2821a14b7))
- added script to create basic documents to switchboard ([56acf69ef](https://github.com/powerhouse-inc/powerhouse/commit/56acf69ef))
- added script to list all basic documents in switchboard ([efd4741b3](https://github.com/powerhouse-inc/powerhouse/commit/efd4741b3))
- added script to delete all basic documents from switchboard ([396667997](https://github.com/powerhouse-inc/powerhouse/commit/396667997))
- **connect:** log level can be set in query param ([3230fd6b9](https://github.com/powerhouse-inc/powerhouse/commit/3230fd6b9))
- **profiling:** optimize document listing and add count-only mode ([7f1f478ad](https://github.com/powerhouse-inc/powerhouse/commit/7f1f478ad))
- **profiling:** add operations support to docs-create script ([6b8ee1717](https://github.com/powerhouse-inc/powerhouse/commit/6b8ee1717))
- **profiling:** improve performance metrics in docs-create script ([4629bae44](https://github.com/powerhouse-inc/powerhouse/commit/4629bae44))
- **profiling:** add memory tracking and verbose mode to docs-create script ([3978df906](https://github.com/powerhouse-inc/powerhouse/commit/3978df906))
- **profiling:** add timing and progress tracking to docs-list script ([0cd802500](https://github.com/powerhouse-inc/powerhouse/commit/0cd802500))

### 🩹 Fixes

- connect e2e fixes, still a couple failing ([c6aa33a0a](https://github.com/powerhouse-inc/powerhouse/commit/c6aa33a0a))
- connect e2e issues ([f33107568](https://github.com/powerhouse-inc/powerhouse/commit/f33107568))
- rename a node is not the same as rename a document ([4b288defd](https://github.com/powerhouse-inc/powerhouse/commit/4b288defd))
- connect e2e test fixes ([a562cd2db](https://github.com/powerhouse-inc/powerhouse/commit/a562cd2db))
- build fixes across the board ([7070406ad](https://github.com/powerhouse-inc/powerhouse/commit/7070406ad))
- reactor now returns state objects ([ea1006e81](https://github.com/powerhouse-inc/powerhouse/commit/ea1006e81))
- do not run profiling tests by default ([a196a19da](https://github.com/powerhouse-inc/powerhouse/commit/a196a19da))
- do not throw an error in profiling test script ([47af4d681](https://github.com/powerhouse-inc/powerhouse/commit/47af4d681))
- pnpm filtering ([3875e271c](https://github.com/powerhouse-inc/powerhouse/commit/3875e271c))
- **design-system:** import assets with runtime relative paths ([8fe099d62](https://github.com/powerhouse-inc/powerhouse/commit/8fe099d62))
- **design-system:** avoid testing-library and reactor imports ([e85ae2fcc](https://github.com/powerhouse-inc/powerhouse/commit/e85ae2fcc))
- **design-system:** declare document-drive and reactor-browser as runtime dependencies ([3db4afa38](https://github.com/powerhouse-inc/powerhouse/commit/3db4afa38))
- **design-system:** linting issues ([c7973fc83](https://github.com/powerhouse-inc/powerhouse/commit/c7973fc83))
- **profiling:** add TypeScript configuration for profiling scripts ([d0ee094c7](https://github.com/powerhouse-inc/powerhouse/commit/d0ee094c7))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.13 (2026-01-21)

### 🚀 Features

- add workflow to trigger downstream package updates ([e8c6cce75](https://github.com/powerhouse-inc/powerhouse/commit/e8c6cce75))
- posttooluse prettier hook ([083e3b823](https://github.com/powerhouse-inc/powerhouse/commit/083e3b823))

### 🩹 Fixes

- properly run migrations and use namespaces in vetra read model ([71e77a4f2](https://github.com/powerhouse-inc/powerhouse/commit/71e77a4f2))
- do not pass default drives to the reactor that is not enabled ([49f339bc3](https://github.com/powerhouse-inc/powerhouse/commit/49f339bc3))
- consolidate default drive functions ([8a4f8fc07](https://github.com/powerhouse-inc/powerhouse/commit/8a4f8fc07))
- issue with reading env vars in the wrong order ([a6dfb866b](https://github.com/powerhouse-inc/powerhouse/commit/a6dfb866b))
- gql port issue and don't add remotes that already exist ([9830c16b2](https://github.com/powerhouse-inc/powerhouse/commit/9830c16b2))
- testing expectations had a race condition ([567174891](https://github.com/powerhouse-inc/powerhouse/commit/567174891))
- better wait for drives to be ready ([9cc837d79](https://github.com/powerhouse-inc/powerhouse/commit/9cc837d79))
- wip on fixing lots of race conditions in e2e vetra tests ([39c9ffe20](https://github.com/powerhouse-inc/powerhouse/commit/39c9ffe20))
- processor filter logic fixes and tests ([3b5b210b7](https://github.com/powerhouse-inc/powerhouse/commit/3b5b210b7))
- vetra test fixes using new structures ([b00ce98b8](https://github.com/powerhouse-inc/powerhouse/commit/b00ce98b8))
- linting fixes ([98c374a82](https://github.com/powerhouse-inc/powerhouse/commit/98c374a82))
- shoot me in the face -- tsc may build differently depending on directory ([a175f86c1](https://github.com/powerhouse-inc/powerhouse/commit/a175f86c1))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 6.0.0-dev.12 (2026-01-20)

### 🩹 Fixes

- **docker:** install prettier globally for ph init project ([7817c65ba](https://github.com/powerhouse-inc/powerhouse/commit/7817c65ba))

### ❤️ Thank You

- Frank

## 6.0.0-dev.11 (2026-01-20)

### 🚀 Features

- **design-system:** improve sidebar UX and add document toolbar story ([#2217](https://github.com/powerhouse-inc/powerhouse/pull/2217))

### 🩹 Fixes

- update addDrive function to set drive name ([#2223](https://github.com/powerhouse-inc/powerhouse/pull/2223))
- improve document model subgraph generation ([9c20b7593](https://github.com/powerhouse-inc/powerhouse/commit/9c20b7593))
- **codegen:** fix failing codegen tests ([#2227](https://github.com/powerhouse-inc/powerhouse/pull/2227))
- **monorepo:** exclude root package from recursive build to prevent infinite loop ([099139393](https://github.com/powerhouse-inc/powerhouse/commit/099139393))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.10 (2026-01-19)

### 🚀 Features

- **ph-cmd:** move dependencies to dev dependencies ([8aa16c346](https://github.com/powerhouse-inc/powerhouse/commit/8aa16c346))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.9 (2026-01-19)

### 🚀 Features

- **ph-cmd:** test build with bun ([#2225](https://github.com/powerhouse-inc/powerhouse/pull/2225))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.8 (2026-01-17)

### 🚀 Features

- **ci:** add Harbor registry to docker image publishing ([f3a2fab69](https://github.com/powerhouse-inc/powerhouse/commit/f3a2fab69))
- **ci:** deploy staging tenant from release/staging/\* branches ([8761579e7](https://github.com/powerhouse-inc/powerhouse/commit/8761579e7))
- **codegen:** updated document editor boilerplate ([141e67a94](https://github.com/powerhouse-inc/powerhouse/commit/141e67a94))
- **design-system:** default styles tweaks and DocumentStateViewer ([c0a66720c](https://github.com/powerhouse-inc/powerhouse/commit/c0a66720c))
- **design-system:** clean up document-state-viewer ([12d7f3645](https://github.com/powerhouse-inc/powerhouse/commit/12d7f3645))
- **design-system:** lazy import json package ([f2a9b15f0](https://github.com/powerhouse-inc/powerhouse/commit/f2a9b15f0))

### 🩹 Fixes

- address code review issues ([7ed9ac697](https://github.com/powerhouse-inc/powerhouse/commit/7ed9ac697))
- **switchboard:** use ph switchboard --migrate for database migrations ([d4ee55a23](https://github.com/powerhouse-inc/powerhouse/commit/d4ee55a23))
- **switchboard:** keep prisma db push before running migrations ([e666de869](https://github.com/powerhouse-inc/powerhouse/commit/e666de869))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 6.0.0-dev.7 (2026-01-16)

### 🩹 Fixes

- **ph-cmd:** do not publish dependencies in cli ([0f5296d02](https://github.com/powerhouse-inc/powerhouse/commit/0f5296d02))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.6 (2026-01-16)

### 🩹 Fixes

- **ph-cmd:** move .npmrc to codegen package dir ([35ef27743](https://github.com/powerhouse-inc/powerhouse/commit/35ef27743))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.5 (2026-01-16)

### 🩹 Fixes

- **switchboard:** regenerate Prisma client for Alpine Linux ([4bc96c72d](https://github.com/powerhouse-inc/powerhouse/commit/4bc96c72d))

### ❤️ Thank You

- Frank

## 6.0.0-dev.4 (2026-01-16)

### 🩹 Fixes

- **switchboard:** add openssl for Prisma compatibility ([fe7235609](https://github.com/powerhouse-inc/powerhouse/commit/fe7235609))

### ❤️ Thank You

- Frank

## 6.0.0-dev.3 (2026-01-16)

### 🚀 Features

- **docker:** optimize images with multi-stage builds ([d51a2df9d](https://github.com/powerhouse-inc/powerhouse/commit/d51a2df9d))

### ❤️ Thank You

- Frank

## 6.0.0-dev.2 (2026-01-15)

### 🚀 Features

- enabled doc version in connect ([#2171](https://github.com/powerhouse-inc/powerhouse/pull/2171))
- new cicd flows ([01310e0d3](https://github.com/powerhouse-inc/powerhouse/commit/01310e0d3))
- first pass on a test client ([977abbe3d](https://github.com/powerhouse-inc/powerhouse/commit/977abbe3d))
- test-client now successfully executes scenarios ([ef9299d90](https://github.com/powerhouse-inc/powerhouse/commit/ef9299d90))
- added profiling scripts to switchboard and listen for sigint ([3a3eab12d](https://github.com/powerhouse-inc/powerhouse/commit/3a3eab12d))
- adding a migration command to switchboard ([155f3da66](https://github.com/powerhouse-inc/powerhouse/commit/155f3da66))

### 🩹 Fixes

- switchboard, by default, writes to .ph directory ([6435defb6](https://github.com/powerhouse-inc/powerhouse/commit/6435defb6))
- copy all should copy all pages in the inspector ([7f6e0b393](https://github.com/powerhouse-inc/powerhouse/commit/7f6e0b393))
- validateActions was querying, also fixing some logging ([3b4420656](https://github.com/powerhouse-inc/powerhouse/commit/3b4420656))
- build fix, zod types ([79921fe63](https://github.com/powerhouse-inc/powerhouse/commit/79921fe63))
- build + linting fixes ([1eb035161](https://github.com/powerhouse-inc/powerhouse/commit/1eb035161))
- workflow permissions ([6e451590d](https://github.com/powerhouse-inc/powerhouse/commit/6e451590d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.1 (2026-01-15)

### 🚀 Features

- dx vetra studio update ([#2206](https://github.com/powerhouse-inc/powerhouse/pull/2206))
- first pass implementation of v2 undo/redo reducer ([d6c3b8084](https://github.com/powerhouse-inc/powerhouse/commit/d6c3b8084))
- adding protocol versions to document headers, populated by the reactor ([d7ceb80aa](https://github.com/powerhouse-inc/powerhouse/commit/d7ceb80aa))
- **academy:** added k8s deployment ([5f7e27162](https://github.com/powerhouse-inc/powerhouse/commit/5f7e27162))
- **academy,codegen:** delete package-lock.json files ([#2214](https://github.com/powerhouse-inc/powerhouse/pull/2214))
- **monorepo:** upgrade document engineering package ([#2215](https://github.com/powerhouse-inc/powerhouse/pull/2215))

### 🩹 Fixes

- allowing reactor to skip index checks for new protocol ([851a6eab1](https://github.com/powerhouse-inc/powerhouse/commit/851a6eab1))
- **academy:** updated search subgraph example ([f06540fe5](https://github.com/powerhouse-inc/powerhouse/commit/f06540fe5))
- **codegen:** removed newline from index files ([6a14459a7](https://github.com/powerhouse-inc/powerhouse/commit/6a14459a7))
- **codegen:** re-add npx specifically for boilerplate tailwind ([4ba289c2e](https://github.com/powerhouse-inc/powerhouse/commit/4ba289c2e))
- **document-drive:** name in responseForDocument ([3d66d90e1](https://github.com/powerhouse-inc/powerhouse/commit/3d66d90e1))
- **reactor-api:** correct cursor pagination in GraphQL adapters ([d43810389](https://github.com/powerhouse-inc/powerhouse/commit/d43810389))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 5.2.0-dev.1 (2026-01-15)

### 🚀 Features

- set out rules for new skip calculation ([a03bce361](https://github.com/powerhouse-inc/powerhouse/commit/a03bce361))
- implemented calculateUndoSkipNumber ([da19c2dab](https://github.com/powerhouse-inc/powerhouse/commit/da19c2dab))
- **codegen:** update document engineering package version in boilerplate ([#2212](https://github.com/powerhouse-inc/powerhouse/pull/2212))
- **monorepo:** use local package execution for tailwind instead of downloading it every time ([ed149558c](https://github.com/powerhouse-inc/powerhouse/commit/ed149558c))
- **monorepo:** upgrade zod and use compatibility layer for errors ([#2210](https://github.com/powerhouse-inc/powerhouse/pull/2210))

### 🩹 Fixes

- clipboard should be loaded from storage ([8825f186a](https://github.com/powerhouse-inc/powerhouse/commit/8825f186a))
- linter ([d28e68ea7](https://github.com/powerhouse-inc/powerhouse/commit/d28e68ea7))
- fix race condition in reactor tests ([6400c1867](https://github.com/powerhouse-inc/powerhouse/commit/6400c1867))
- **codegen:** remove hardcoded comment on editor module ([244aa75d4](https://github.com/powerhouse-inc/powerhouse/commit/244aa75d4))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.42 (2026-01-14)

### 🚀 Features

- basic ordering of fields in operation, temporary ([11711570d](https://github.com/powerhouse-inc/powerhouse/commit/11711570d))
- added new filter-bar in inspector ([8ca500712](https://github.com/powerhouse-inc/powerhouse/commit/8ca500712))

### 🩹 Fixes

- error was written incorrectly for revision mismatch ([4995abbb9](https://github.com/powerhouse-inc/powerhouse/commit/4995abbb9))
- do not overwrite undo/redo skips ([35de3648d](https://github.com/powerhouse-inc/powerhouse/commit/35de3648d))
- **codegen:** project name import not working due to package.json being added to dist folder ([e5311e372](https://github.com/powerhouse-inc/powerhouse/commit/e5311e372))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.41 (2026-01-13)

### 🚀 Features

- **codegen:** relocate generated tests dir ([#2199](https://github.com/powerhouse-inc/powerhouse/pull/2199))
- **reactor-browser:** useSelectedDocument throws error if there is no selected document ([0eb7ce1b2](https://github.com/powerhouse-inc/powerhouse/commit/0eb7ce1b2))

### 🩹 Fixes

- less strict document models array type on reactor builder ([1548ddec7](https://github.com/powerhouse-inc/powerhouse/commit/1548ddec7))
- move ALL operation ids to derived ids ([4ac51f535](https://github.com/powerhouse-inc/powerhouse/commit/4ac51f535))
- testing issue with ids ([8cad05973](https://github.com/powerhouse-inc/powerhouse/commit/8cad05973))
- do not throw on id mismatch, simply overwrite ([fc613e19d](https://github.com/powerhouse-inc/powerhouse/commit/fc613e19d))
- deleting documents now actually deletes the document ([ff731acfa](https://github.com/powerhouse-inc/powerhouse/commit/ff731acfa))
- **reactor-browser:** use correct zod utility to parse document ([22e51c5fe](https://github.com/powerhouse-inc/powerhouse/commit/22e51c5fe))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.40 (2026-01-10)

### 🚀 Features

- moved over the processor-manager for reactor ([c232c55c1](https://github.com/powerhouse-inc/powerhouse/commit/c232c55c1))
- **builder-tools:** improved doc model editor to sync initial state with schema by default or display error messages otherwise ([57370caec](https://github.com/powerhouse-inc/powerhouse/commit/57370caec))
- **builder-tools:** display error for missing optional fields on Initial State ([9192ee889](https://github.com/powerhouse-inc/powerhouse/commit/9192ee889))
- **builder-tools:** improved validation on doc model editor and unit tests ([336f5d575](https://github.com/powerhouse-inc/powerhouse/commit/336f5d575))
- **codegen:** add validation to package json test ([03d06ef57](https://github.com/powerhouse-inc/powerhouse/commit/03d06ef57))

### 🩹 Fixes

- deleted claude.md and unified to just agents.md ([cbf5deab4](https://github.com/powerhouse-inc/powerhouse/commit/cbf5deab4))
- linter fixes ([53cad5707](https://github.com/powerhouse-inc/powerhouse/commit/53cad5707))
- inspector was not schema aware ([ed06ebc74](https://github.com/powerhouse-inc/powerhouse/commit/ed06ebc74))
- **builder-tools:** avoid duplicated SET_INITIAL_STATE and fix connect e2e ([863bc339d](https://github.com/powerhouse-inc/powerhouse/commit/863bc339d))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- CallmeT-ty @CallmeT-ty
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.39 (2026-01-09)

### 🩹 Fixes

- **codegen:** remove training comma from template :') ([9d93ffd87](https://github.com/powerhouse-inc/powerhouse/commit/9d93ffd87))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.38 (2026-01-09)

### 🩹 Fixes

- **monorepo:** use more appropriate peer dependency scheme ([cdb35daa8](https://github.com/powerhouse-inc/powerhouse/commit/cdb35daa8))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.37 (2026-01-09)

### 🚀 Features

- **codegen,ph-cmd:** use templates for project boilerplate creation ([#2190](https://github.com/powerhouse-inc/powerhouse/pull/2190))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.36 (2026-01-09)

### 🩹 Fixes

- remove id and let downstream populate ([5c1d3a429](https://github.com/powerhouse-inc/powerhouse/commit/5c1d3a429))
- as a result of op fix, we need to recompute header revisions in base server ([f351f04d2](https://github.com/powerhouse-inc/powerhouse/commit/f351f04d2))
- linting ([c135690f1](https://github.com/powerhouse-inc/powerhouse/commit/c135690f1))
- oof, index and skip cannot be in the operation id ([4682d8503](https://github.com/powerhouse-inc/powerhouse/commit/4682d8503))
- skips were being calculated incorrectly ([d5ea31e58](https://github.com/powerhouse-inc/powerhouse/commit/d5ea31e58))
- fix some tests ([715696fa2](https://github.com/powerhouse-inc/powerhouse/commit/715696fa2))
- all timestamps throughout the reactor should be stored as iso strings ([d52810df2](https://github.com/powerhouse-inc/powerhouse/commit/d52810df2))
- return gql-channel polling to something sane ([e0baf8006](https://github.com/powerhouse-inc/powerhouse/commit/e0baf8006))
- gql should create a channel if there isn't one, also fix issue with ADD_RELATIONSHIP needing the target ([3bda61732](https://github.com/powerhouse-inc/powerhouse/commit/3bda61732))
- use hoisted node-linker for containerd/k8s compatibility ([5ae9e4abd](https://github.com/powerhouse-inc/powerhouse/commit/5ae9e4abd))
- add relationship should work even if the child doesn't exist or is deleted, also added logging to logger not console ([8776991d4](https://github.com/powerhouse-inc/powerhouse/commit/8776991d4))
- **connect, switchboard:** scope node-linker hoisted to project only ([948cc7bdf](https://github.com/powerhouse-inc/powerhouse/commit/948cc7bdf))
- **connect, switchboard:** create .npmrc with hoisted node-linker before ph init ([4c8cdb1e5](https://github.com/powerhouse-inc/powerhouse/commit/4c8cdb1e5))
- **connect, switchboard:** create .npmrc after ph init and reinstall ([dc78e58f5](https://github.com/powerhouse-inc/powerhouse/commit/dc78e58f5))
- **connect, switchboard:** run pnpm install after ph install in entrypoint ([c4145c07d](https://github.com/powerhouse-inc/powerhouse/commit/c4145c07d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 5.1.0-dev.35 (2026-01-08)

### 🚀 Features

- added reshuffle behavior proof ([e521b74ce](https://github.com/powerhouse-inc/powerhouse/commit/e521b74ce))
- side-by-side reshuffle test ([cd4f879f9](https://github.com/powerhouse-inc/powerhouse/commit/cd4f879f9))

### 🩹 Fixes

- revert to 100 skips ([8409a98a8](https://github.com/powerhouse-inc/powerhouse/commit/8409a98a8))
- ordinal issue ([bcc284ce1](https://github.com/powerhouse-inc/powerhouse/commit/bcc284ce1))
- timestamps and indices were being overwritten -- also lots of logging that is in progress ([b4153193a](https://github.com/powerhouse-inc/powerhouse/commit/b4153193a))
- removing a bunch of logging and making a half fix where we only overwrite _some_ timestamps ([31ce11c55](https://github.com/powerhouse-inc/powerhouse/commit/31ce11c55))
- operation id should be deterministic, not a uuid ([41f50b7f8](https://github.com/powerhouse-inc/powerhouse/commit/41f50b7f8))
- fix the internal-listener tests with new operation ids ([fe7cbbf41](https://github.com/powerhouse-inc/powerhouse/commit/fe7cbbf41))
- document-model replays were incorrectly using a generated header instead of requiring a header ([69f19af8d](https://github.com/powerhouse-inc/powerhouse/commit/69f19af8d))
- reactor was mutating operation indices ([47440d882](https://github.com/powerhouse-inc/powerhouse/commit/47440d882))
- linting and build fixes, plus a three-reactor setup test ([87cdde785](https://github.com/powerhouse-inc/powerhouse/commit/87cdde785))
- update e2e test fixtures for document version type changes ([8f020dadc](https://github.com/powerhouse-inc/powerhouse/commit/8f020dadc))
- update e2e test fixtures for document version type changes ([#2192](https://github.com/powerhouse-inc/powerhouse/pull/2192))

### ❤️ Thank You

- Benjamin Jordan
- Benjamin Jordan (@thegoldenmule)
- CallmeT-ty @CallmeT-ty

## 5.1.0-dev.34 (2026-01-07)

### 🚀 Features

- adding feature flag support for v2 storage ([2f34fff4b](https://github.com/powerhouse-inc/powerhouse/commit/2f34fff4b))
- **codegen,ph-cli:** move templates to top level of codegen ([#2187](https://github.com/powerhouse-inc/powerhouse/pull/2187))
- **document-model:** improve state schema validation ([a517525c6](https://github.com/powerhouse-inc/powerhouse/commit/a517525c6))
- **document-model:** improve state schema validation ([#2174](https://github.com/powerhouse-inc/powerhouse/pull/2174))
- **ph-cli:** add index.html migration to migrate command ([#2186](https://github.com/powerhouse-inc/powerhouse/pull/2186))
- **reactor-browser:** added onSuccess callback to dispatch ([929dd4c69](https://github.com/powerhouse-inc/powerhouse/commit/929dd4c69))

### 🩹 Fixes

- **builder-tools:** prefill default operation schema ([ab486a217](https://github.com/powerhouse-inc/powerhouse/commit/ab486a217))
- **codegen:** use cleaned semver string ([bf4e20795](https://github.com/powerhouse-inc/powerhouse/commit/bf4e20795))
- **reactor-api:** return operation index on addAction mutation ([cb10efcfd](https://github.com/powerhouse-inc/powerhouse/commit/cb10efcfd))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.33 (2026-01-06)

### 🚀 Features

- adding an explicit createdocumentindrive function ([7ed396977](https://github.com/powerhouse-inc/powerhouse/commit/7ed396977))
- passing logger through to sync-manager ([91af0bbfe](https://github.com/powerhouse-inc/powerhouse/commit/91af0bbfe))
- implemented a temp doc cache in reactor-browser for the new reactor ([afda2c2c0](https://github.com/powerhouse-inc/powerhouse/commit/afda2c2c0))
- **codegen:** add ts morph codegen docs ([#2179](https://github.com/powerhouse-inc/powerhouse/pull/2179))

### 🩹 Fixes

- integration test was waiting wrong ([d993f2759](https://github.com/powerhouse-inc/powerhouse/commit/d993f2759))
- reshuffling in load operations was not pulling all operations ([cc77bc8ee](https://github.com/powerhouse-inc/powerhouse/commit/cc77bc8ee))
- collections should not limit by joined ordinal ([5504007a1](https://github.com/powerhouse-inc/powerhouse/commit/5504007a1))
- correctly batch sync ops in sync envelopes ([f7485b5ab](https://github.com/powerhouse-inc/powerhouse/commit/f7485b5ab))
- operation batching must also consider scopes ([591937fa2](https://github.com/powerhouse-inc/powerhouse/commit/591937fa2))
- added configuration to debug switchboard, and cleaned up some of the subgraph code ([9ce04c899](https://github.com/powerhouse-inc/powerhouse/commit/9ce04c899))
- fixing an off by one issue and fixing cache invalidation ([fe7ab6ebd](https://github.com/powerhouse-inc/powerhouse/commit/fe7ab6ebd))
- linting ([f79a19aa0](https://github.com/powerhouse-inc/powerhouse/commit/f79a19aa0))
- **builder-tools:** ignore hmr for files that are only imported by tailwind ([b9d672a6a](https://github.com/powerhouse-inc/powerhouse/commit/b9d672a6a))
- **builder-tools:** added suspense container to lazy loaded components ([2bdbefbb1](https://github.com/powerhouse-inc/powerhouse/commit/2bdbefbb1))
- **vetra:** do not generate document model subgrapgh ([d705e0c5f](https://github.com/powerhouse-inc/powerhouse/commit/d705e0c5f))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter

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

### 🚀 Features

- **builder-tools:** integrate toast notifications for invalid operation names ([c86084d49](https://github.com/powerhouse-inc/powerhouse/commit/c86084d49))
- **connect:** register toast function ([55d0d9b83](https://github.com/powerhouse-inc/powerhouse/commit/55d0d9b83))
- **document-model:** validate operation names ([5b09b1951](https://github.com/powerhouse-inc/powerhouse/commit/5b09b1951))
- **reactor-browser:** add toast event handling functionality ([e37c6fd88](https://github.com/powerhouse-inc/powerhouse/commit/e37c6fd88))

### 🩹 Fixes

- **connect:** created ErrorBoundary component and reload page when outdated chunk is imported ([147570dc4](https://github.com/powerhouse-inc/powerhouse/commit/147570dc4))
- **document-drive:** do not export redis cache from index ([38b647cf9](https://github.com/powerhouse-inc/powerhouse/commit/38b647cf9))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 5.1.0-dev.29 (2025-12-30)

### 🩹 Fixes

- **connect,builder-tools,vetra:** avoid page reload on vite HMR ([1c3f5d1dd](https://github.com/powerhouse-inc/powerhouse/commit/1c3f5d1dd))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.28 (2025-12-30)

### 🚀 Features

- **reactor-browser:** added stale-while-revalidate behavior on document retrieval hooks ([82f170b4f](https://github.com/powerhouse-inc/powerhouse/commit/82f170b4f))

### 🩹 Fixes

- **ph-cmd,codegen:** ph init with fixed version ([0d439c381](https://github.com/powerhouse-inc/powerhouse/commit/0d439c381))
- **reactor-api:** name is null ([190f3b60e](https://github.com/powerhouse-inc/powerhouse/commit/190f3b60e))
- **reactor-browser:** improvements on document cache reactivity and tests ([07991c703](https://github.com/powerhouse-inc/powerhouse/commit/07991c703))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 5.1.0-dev.27 (2025-12-24)

### 🚀 Features

- **reactor-api:** datadog integration ([3c433c686](https://github.com/powerhouse-inc/powerhouse/commit/3c433c686))
- **reactor-browser:** improved document retrieval hooks ([4fed49391](https://github.com/powerhouse-inc/powerhouse/commit/4fed49391))

### 🩹 Fixes

- **reactor-api:** linting issues ([9c674a847](https://github.com/powerhouse-inc/powerhouse/commit/9c674a847))
- **reactor-browser:** update returned documents when they change ([117237e5a](https://github.com/powerhouse-inc/powerhouse/commit/117237e5a))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 5.1.0-dev.26 (2025-12-20)

### 🚀 Features

- integrate doc model versioning in reactor ([#2145](https://github.com/powerhouse-inc/powerhouse/pull/2145))
- **codegen:** restore editor template ([542727e00](https://github.com/powerhouse-inc/powerhouse/commit/542727e00))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 5.1.0-dev.25 (2025-12-19)

### 🚀 Features

- added subscriptions as a read model ([39490cc20](https://github.com/powerhouse-inc/powerhouse/commit/39490cc20))
- add support for operations with no inputs ([#2138](https://github.com/powerhouse-inc/powerhouse/pull/2138))

### 🩹 Fixes

- passing meta through job system to avoid race conditions ([8b65bb42d](https://github.com/powerhouse-inc/powerhouse/commit/8b65bb42d))
- signature resolvers ([4513d9dda](https://github.com/powerhouse-inc/powerhouse/commit/4513d9dda))
- **reactor:** we were echoing back sync envelopes ([0fc679d21](https://github.com/powerhouse-inc/powerhouse/commit/0fc679d21))
- **reactor-api:** fix gql tests ([15294d00a](https://github.com/powerhouse-inc/powerhouse/commit/15294d00a))
- **switchboard, vetra:** fix issue with processors not being added on initial boot ([25432a663](https://github.com/powerhouse-inc/powerhouse/commit/25432a663))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 5.1.0-dev.24 (2025-12-18)

### 🚀 Features

- the gql channel should start poll before waiting ([f569b462b](https://github.com/powerhouse-inc/powerhouse/commit/f569b462b))

### 🩹 Fixes

- addDefaultDrive should not add if the drive already exists ([79352a5f8](https://github.com/powerhouse-inc/powerhouse/commit/79352a5f8))
- don't sign default drive header as that changes the id, and pass along the unsigned header to the signed ([d8cd47c9d](https://github.com/powerhouse-inc/powerhouse/commit/d8cd47c9d))
- switchboard's new reactor signs everything ([b7fafb7fa](https://github.com/powerhouse-inc/powerhouse/commit/b7fafb7fa))
- **builder-tools:** exclude node_modules/.vite from optimisation ([5778f222e](https://github.com/powerhouse-inc/powerhouse/commit/5778f222e))
- **reactor:** document model core types need to be numerical versions, also fixed a gql bug ([6495a88e2](https://github.com/powerhouse-inc/powerhouse/commit/6495a88e2))
- **switchboard:** added skip db migrations flag ([f1597c838](https://github.com/powerhouse-inc/powerhouse/commit/f1597c838))
- **switchboard:** use pglite for new reactor ([b5dece44e](https://github.com/powerhouse-inc/powerhouse/commit/b5dece44e))
- **switchboard:** pglite path ([140422ab6](https://github.com/powerhouse-inc/powerhouse/commit/140422ab6))
- **switchboard:** use pglite inmemory ([f7c926fa9](https://github.com/powerhouse-inc/powerhouse/commit/f7c926fa9))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank

## 5.1.0-dev.23 (2025-12-17)

### 🩹 Fixes

- default state should be 0 ([a19a2ebec](https://github.com/powerhouse-inc/powerhouse/commit/a19a2ebec))
- gql api needs id for operations ([7146bffea](https://github.com/powerhouse-inc/powerhouse/commit/7146bffea))
- **reactor:** integrated the document meta cache ([29565fa5f](https://github.com/powerhouse-inc/powerhouse/commit/29565fa5f))
- **reactor-api:** remove circular import ([9076b5257](https://github.com/powerhouse-inc/powerhouse/commit/9076b5257))
- **reactor-api, reactor-local:** pass dynamically loaded modules to the new reactor ([c038e058c](https://github.com/powerhouse-inc/powerhouse/commit/c038e058c))

### 🔥 Performance

- **queue:** added some helper funcs for additional benches ([4810e1e91](https://github.com/powerhouse-inc/powerhouse/commit/4810e1e91))
- **queue:** added focused queue performance benches ([caa975f99](https://github.com/powerhouse-inc/powerhouse/commit/caa975f99))
- **queue:** added progressively taxing queue hint DAG resolution benchmarks ([3dd42d08b](https://github.com/powerhouse-inc/powerhouse/commit/3dd42d08b))
- **queue:** added in-memory queue performance benchmarks ([e7184d495](https://github.com/powerhouse-inc/powerhouse/commit/e7184d495))
- **queue:** removed any random calls to make benches deterministic ([886874cde](https://github.com/powerhouse-inc/powerhouse/commit/886874cde))
- **queue:** make Reactor queue perf benches reproducible, timed, and invariant-safe ([20c5c4376](https://github.com/powerhouse-inc/powerhouse/commit/20c5c4376))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Samuel Hawksby-Robinson @Samyoul

## 5.1.0-dev.22 (2025-12-16)

### 🚀 Features

- added support for runtime document model subgraphs ([dc8248ec6](https://github.com/powerhouse-inc/powerhouse/commit/dc8248ec6))
- **codegen:** do not generate document model subgraph ([ebdd72668](https://github.com/powerhouse-inc/powerhouse/commit/ebdd72668))

### 🩹 Fixes

- linter ([fcbd30919](https://github.com/powerhouse-inc/powerhouse/commit/fcbd30919))
- **vetra:** regenerated subgraphs ([09f2f212f](https://github.com/powerhouse-inc/powerhouse/commit/09f2f212f))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.21 (2025-12-13)

### 🚀 Features

- **codegen,vetra:** use ts morph codegen by default ([#2135](https://github.com/powerhouse-inc/powerhouse/pull/2135))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

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

- **ph-cli:** lazy load auth methods ([0840cca7a](https://github.com/powerhouse-inc/powerhouse/commit/0840cca7a))
- **reactor-api:** removed isUserAllowedCheck and added flag to skip renown verification ([e59814cfd](https://github.com/powerhouse-inc/powerhouse/commit/e59814cfd))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 5.1.0-dev.18 (2025-12-11)

### 🚀 Features

- **codegen:** add versioned document model generation ([#2130](https://github.com/powerhouse-inc/powerhouse/pull/2130))

### 🩹 Fixes

- preserve query params when navigating in connect ([#2128](https://github.com/powerhouse-inc/powerhouse/pull/2128))
- **connect:** implement explicit transaction for schema drop operation ([#2131](https://github.com/powerhouse-inc/powerhouse/pull/2131))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.17 (2025-12-11)

### 🩹 Fixes

- **ph-cli:** auth with access-token ([df48be6e9](https://github.com/powerhouse-inc/powerhouse/commit/df48be6e9))

### ❤️ Thank You

- Frank

## 5.1.0-dev.16 (2025-12-11)

### 🚀 Features

- adding new storage to delete ([d478af153](https://github.com/powerhouse-inc/powerhouse/commit/d478af153))
- integrate visibility tools for remotes and pglite instance ([#2122](https://github.com/powerhouse-inc/powerhouse/pull/2122))
- **codegen:** add test data files for versioned document model codegen ([6a20c8b19](https://github.com/powerhouse-inc/powerhouse/commit/6a20c8b19))
- **codegen:** update zod schema generation library ([#2129](https://github.com/powerhouse-inc/powerhouse/pull/2129))
- **codegen:** update test data files ([143cb403f](https://github.com/powerhouse-inc/powerhouse/commit/143cb403f))
- **document-model:** add upgrade types ([b64985674](https://github.com/powerhouse-inc/powerhouse/commit/b64985674))
- **ph-cli:** added login command ([3dbccd06a](https://github.com/powerhouse-inc/powerhouse/commit/3dbccd06a))
- **ph-cli:** added access-token command ([e48181df6](https://github.com/powerhouse-inc/powerhouse/commit/e48181df6))
- **reactor-api:** document permission service ([e95ae2618](https://github.com/powerhouse-inc/powerhouse/commit/e95ae2618))
- **reactor-api:** added operation permissions ([8b1730456](https://github.com/powerhouse-inc/powerhouse/commit/8b1730456))
- **reactor-api:** added document group permissions ([769a04532](https://github.com/powerhouse-inc/powerhouse/commit/769a04532))
- **reactor-api:** added feature flag for document permission service ([89770d177](https://github.com/powerhouse-inc/powerhouse/commit/89770d177))
- **reactor-api:** added migration scripts ([b45782a31](https://github.com/powerhouse-inc/powerhouse/commit/b45782a31))
- **switchboard:** use identity ([1be03ddb7](https://github.com/powerhouse-inc/powerhouse/commit/1be03ddb7))

### 🩹 Fixes

- consistency was not guaranteed when using legacy storage -- introduced a wrapper with consistency token ([8e46dcec8](https://github.com/powerhouse-inc/powerhouse/commit/8e46dcec8))
- properly check job info in reactor-client ([0bad3762d](https://github.com/powerhouse-inc/powerhouse/commit/0bad3762d))
- some signature fixes and progress on integrating the reactor client on writes ([a3129a1b9](https://github.com/powerhouse-inc/powerhouse/commit/a3129a1b9))
- gql fixes, like making channels :) ([ee71e2229](https://github.com/powerhouse-inc/powerhouse/commit/ee71e2229))
- syncenvelope shape was incorrect ([cc6226be9](https://github.com/powerhouse-inc/powerhouse/commit/cc6226be9))
- use a unique id for remote name ([37a700848](https://github.com/powerhouse-inc/powerhouse/commit/37a700848))
- backfill tests + create default via new reactor to get create/update ([889d890a3](https://github.com/powerhouse-inc/powerhouse/commit/889d890a3))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.15 (2025-12-09)

### 🚀 Features

- first pass using feature flags across hooks ([ac7083067](https://github.com/powerhouse-inc/powerhouse/commit/ac7083067))

### 🩹 Fixes

- adding powerhouse drive to default options for switchboard when running with pnpm start ([4347307dc](https://github.com/powerhouse-inc/powerhouse/commit/4347307dc))
- fixed legacy read off subscriptions ([7ed98a27c](https://github.com/powerhouse-inc/powerhouse/commit/7ed98a27c))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.14 (2025-12-08)

### 🚀 Features

- **academy:** added docker build and publish workflow ([b17562994](https://github.com/powerhouse-inc/powerhouse/commit/b17562994))
- **connect, switchboard:** added healthcheck route ([9a0671113](https://github.com/powerhouse-inc/powerhouse/commit/9a0671113))

### ❤️ Thank You

- Frank

## 5.1.0-dev.13 (2025-12-08)

### 🩹 Fixes

- **ph-cmd:** setup global project with proper project name ([fdc8e7b6f](https://github.com/powerhouse-inc/powerhouse/commit/fdc8e7b6f))
- **ph-cmd:** linting issues ([dd5acf8e9](https://github.com/powerhouse-inc/powerhouse/commit/dd5acf8e9))

### ❤️ Thank You

- Frank

## 5.1.0-dev.12 (2025-12-08)

### 🩹 Fixes

- **ph-cli:** manage global project environment ([58e589122](https://github.com/powerhouse-inc/powerhouse/commit/58e589122))

### ❤️ Thank You

- Frank

## 5.1.0-dev.11 (2025-12-08)

### 🩹 Fixes

- **ph-cli:** setup service with global project ([186b0e64a](https://github.com/powerhouse-inc/powerhouse/commit/186b0e64a))

### ❤️ Thank You

- Frank

## 5.1.0-dev.10 (2025-12-06)

### 🚀 Features

- added db explorer component ([acbe5a0a5](https://github.com/powerhouse-inc/powerhouse/commit/acbe5a0a5))
- added DBExplorer component ([#2121](https://github.com/powerhouse-inc/powerhouse/pull/2121))
- **design-system:** add async getTables prop and refresh functionality to db-explorer component ([85a9af1c0](https://github.com/powerhouse-inc/powerhouse/commit/85a9af1c0))
- **design-system:** added remotes inspector and channel inspector components ([093896ebf](https://github.com/powerhouse-inc/powerhouse/commit/093896ebf))

### 🩹 Fixes

- add ids to legacy create and update operations ([27c46fe1c](https://github.com/powerhouse-inc/powerhouse/commit/27c46fe1c))
- updating test expectations with multi-op ([51eee2b4c](https://github.com/powerhouse-inc/powerhouse/commit/51eee2b4c))
- circular imports ([bf1a8f219](https://github.com/powerhouse-inc/powerhouse/commit/bf1a8f219))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

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

### 🚀 Features

- stubbing in a logging interface ([06799507d](https://github.com/powerhouse-inc/powerhouse/commit/06799507d))

### 🩹 Fixes

- set jsr as registry in dockerfiles ([291027b16](https://github.com/powerhouse-inc/powerhouse/commit/291027b16))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 5.1.0-dev.6 (2025-12-04)

### 🚀 Features

- adding reactor client and sync to connect store ([95db06a7d](https://github.com/powerhouse-inc/powerhouse/commit/95db06a7d))
- **renown:** improved login component and added playwright e2e tests ([aceada753](https://github.com/powerhouse-inc/powerhouse/commit/aceada753))
- **renown:** improved login component and added playwright e2e tests ([337dd6000](https://github.com/powerhouse-inc/powerhouse/commit/337dd6000))

### 🩹 Fixes

- forgot tslint link ([04024a7f0](https://github.com/powerhouse-inc/powerhouse/commit/04024a7f0))
- **reactor:** pulling some files out of the code coverage analysis ([5dcb7431d](https://github.com/powerhouse-inc/powerhouse/commit/5dcb7431d))
- **renown:** added type declartions for png and other image files ([fd6ee9b8d](https://github.com/powerhouse-inc/powerhouse/commit/fd6ee9b8d))
- **renown:** build issues ([1893c35a0](https://github.com/powerhouse-inc/powerhouse/commit/1893c35a0))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 5.1.0-dev.5 (2025-12-04)

### 🚀 Features

- connect crypto signer and verifier ([918fb1fab](https://github.com/powerhouse-inc/powerhouse/commit/918fb1fab))
- added tests for signing and verification ([f9b7c95a8](https://github.com/powerhouse-inc/powerhouse/commit/f9b7c95a8))

### 🩹 Fixes

- vitest was destroying my computer ([a43c93c4b](https://github.com/powerhouse-inc/powerhouse/commit/a43c93c4b))
- adding testing for document creation signatures ([ae6e33c12](https://github.com/powerhouse-inc/powerhouse/commit/ae6e33c12))
- adding ts reference ([491dd5c8f](https://github.com/powerhouse-inc/powerhouse/commit/491dd5c8f))
- build issues ([4825c1c01](https://github.com/powerhouse-inc/powerhouse/commit/4825c1c01))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.4 (2025-12-03)

### 🚀 Features

- pulling in all the signing work ([6f1361ead](https://github.com/powerhouse-inc/powerhouse/commit/6f1361ead))
- **academy:** add new todo list tutorial content ([b6dc16545](https://github.com/powerhouse-inc/powerhouse/commit/b6dc16545))
- **academy:** Todo list tutorial oz updates ([#2118](https://github.com/powerhouse-inc/powerhouse/pull/2118))
- **codegen,ph-cli:** add tsx code generator ([#2116](https://github.com/powerhouse-inc/powerhouse/pull/2116))

### 🩹 Fixes

- reactor-client signs mutations ([26e20b54e](https://github.com/powerhouse-inc/powerhouse/commit/26e20b54e))
- updating client and reactor interfaces to use branch instead of view filter on writes ([9e1abf004](https://github.com/powerhouse-inc/powerhouse/commit/9e1abf004))
- all actions can now be signed ([12717055b](https://github.com/powerhouse-inc/powerhouse/commit/12717055b))
- updated reactor api ([3476e8367](https://github.com/powerhouse-inc/powerhouse/commit/3476e8367))
- linting ([7985e91d5](https://github.com/powerhouse-inc/powerhouse/commit/7985e91d5))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- CallmeT-ty @CallmeT-ty
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.3 (2025-12-02)

### 🚀 Features

- **renown:** login component ([#2117](https://github.com/powerhouse-inc/powerhouse/pull/2117))

### ❤️ Thank You

- Frank @froid1911

## 5.1.0-dev.2 (2025-12-02)

### 🚀 Features

- building out fuller spec on gql sync ([084f9bbda](https://github.com/powerhouse-inc/powerhouse/commit/084f9bbda))
- large refactor such that ids are only on remotes and not channels ([29a807e08](https://github.com/powerhouse-inc/powerhouse/commit/29a807e08))
- push/pull channel integration in gqp api ([722f7e844](https://github.com/powerhouse-inc/powerhouse/commit/722f7e844))
- added integration tests for gql sync ([554280dbc](https://github.com/powerhouse-inc/powerhouse/commit/554280dbc))

### 🩹 Fixes

- linting fixes ([2d4993b86](https://github.com/powerhouse-inc/powerhouse/commit/2d4993b86))
- build fix with reactor builder module change ([d07c4c7fa](https://github.com/powerhouse-inc/powerhouse/commit/d07c4c7fa))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.1 (2025-11-26)

### 🩹 Fixes

- **design-system:** handle Safari empty dataTransfer.items in drag events ([c9317471c](https://github.com/powerhouse-inc/powerhouse/commit/c9317471c))
- **design-system:** use import types for preview and ReactRenderer ([0d769a72f](https://github.com/powerhouse-inc/powerhouse/commit/0d769a72f))
- **design-system:** handle Safari empty dataTransfer.items in drag events ([#2112](https://github.com/powerhouse-inc/powerhouse/pull/2112))
- **design-system:** use import types for preview and ReactRenderer ([#2113](https://github.com/powerhouse-inc/powerhouse/pull/2113))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 5.1.0-dev.0 (2025-11-20)

### 🚀 Features

- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))
- initial types for relationship indexer ([151502633](https://github.com/powerhouse-inc/powerhouse/commit/151502633))
- reactor and job executor have a separate path for relationships ([b1cabb7f5](https://github.com/powerhouse-inc/powerhouse/commit/b1cabb7f5))
- first pass implementation with unit tests ([5bc7416ef](https://github.com/powerhouse-inc/powerhouse/commit/5bc7416ef))
- first pass batch job implementation ([227305ec8](https://github.com/powerhouse-inc/powerhouse/commit/227305ec8))
- migrating to mutateBatch API for addFile ([75ffe94e9](https://github.com/powerhouse-inc/powerhouse/commit/75ffe94e9))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))
- added atlas import for base server ([9528d2c2c](https://github.com/powerhouse-inc/powerhouse/commit/9528d2c2c))
- the mother of all tests -- base server + reactor deep compare post 1800+ actions ([52eddaeea](https://github.com/powerhouse-inc/powerhouse/commit/52eddaeea))
- finally, a benchmark ([2771c446e](https://github.com/powerhouse-inc/powerhouse/commit/2771c446e))
- feature flag to toggle write to legacy storage ([151e40d76](https://github.com/powerhouse-inc/powerhouse/commit/151e40d76))
- added third piece where we also test the read model ([3c20fc925](https://github.com/powerhouse-inc/powerhouse/commit/3c20fc925))
- create default vetra package document when ph vetra is started for a remote drive ([#2066](https://github.com/powerhouse-inc/powerhouse/pull/2066))
- working out how consistency guarantees are provided through consistency tokens ([18737020e](https://github.com/powerhouse-inc/powerhouse/commit/18737020e))
- consistency tracker implementation ([73449ab68](https://github.com/powerhouse-inc/powerhouse/commit/73449ab68))
- added consistency token to the job interface ([f5077680c](https://github.com/powerhouse-inc/powerhouse/commit/f5077680c))
- updated read model specs with consistency token ([3a7d6f91a](https://github.com/powerhouse-inc/powerhouse/commit/3a7d6f91a))
- adding consistency tracking to the document indexer ([3e4b694e6](https://github.com/powerhouse-inc/powerhouse/commit/3e4b694e6))
- adding consistency tracking to the document indexer ([a2a0b4e9c](https://github.com/powerhouse-inc/powerhouse/commit/a2a0b4e9c))
- starting to migrate reactor to use the legacy storage feature flag ([c24a9829e](https://github.com/powerhouse-inc/powerhouse/commit/c24a9829e))
- pre-load local packages when building driveServer ([#2064](https://github.com/powerhouse-inc/powerhouse/pull/2064))
- integration tests for consistency token ([030744ec2](https://github.com/powerhouse-inc/powerhouse/commit/030744ec2))
- switching to tinybench for benchmarks ([5b915e025](https://github.com/powerhouse-inc/powerhouse/commit/5b915e025))
- implement vetra document backup functionality in generators ([#2077](https://github.com/powerhouse-inc/powerhouse/pull/2077))
- batch insert helper for atlas ([fd60534c6](https://github.com/powerhouse-inc/powerhouse/commit/fd60534c6))
- compare atlas results from batch insert ([10ce147cd](https://github.com/powerhouse-inc/powerhouse/commit/10ce147cd))
- added batch insert as a benchmark option ([09989be49](https://github.com/powerhouse-inc/powerhouse/commit/09989be49))
- test script for profiling ([7abfe885a](https://github.com/powerhouse-inc/powerhouse/commit/7abfe885a))
- updating single mutation script to ignore pglite warmup ([3ad625632](https://github.com/powerhouse-inc/powerhouse/commit/3ad625632))
- migration scripts for all storage ([804f5838c](https://github.com/powerhouse-inc/powerhouse/commit/804f5838c))
- work on getting both benchmarks hitting postgres ([d035c79b9](https://github.com/powerhouse-inc/powerhouse/commit/d035c79b9))
- first pass load impl on write side ([85ef79df9](https://github.com/powerhouse-inc/powerhouse/commit/85ef79df9))
- wip load-reshuffle test ([fa05f1666](https://github.com/powerhouse-inc/powerhouse/commit/fa05f1666))
- initial implementation of operation index ([906588091](https://github.com/powerhouse-inc/powerhouse/commit/906588091))
- splitting job integration tests into legacy and current ([413ead70c](https://github.com/powerhouse-inc/powerhouse/commit/413ead70c))
- first pass operation-index integration ([4e5b1e191](https://github.com/powerhouse-inc/powerhouse/commit/4e5b1e191))
- adding operation index to executor integration tests ([63b51b84f](https://github.com/powerhouse-inc/powerhouse/commit/63b51b84f))
- implementation of the new join on ordinal in the index ([ad621af7a](https://github.com/powerhouse-inc/powerhouse/commit/ad621af7a))
- first pass implementation of job-handle and mailbox ([b86e87803](https://github.com/powerhouse-inc/powerhouse/commit/b86e87803))
- plan and implementation for kysely sync storage ([7ccc7ae67](https://github.com/powerhouse-inc/powerhouse/commit/7ccc7ae67))
- initial implementations of cursor and remotes storage for sync ([1e7fadcf4](https://github.com/powerhouse-inc/powerhouse/commit/1e7fadcf4))
- getting types in place for implementation ([bbc146227](https://github.com/powerhouse-inc/powerhouse/commit/bbc146227))
- internalchannel implementation and types ([644ef1695](https://github.com/powerhouse-inc/powerhouse/commit/644ef1695))
- initial sync-manager implementation ([00c693e4b](https://github.com/powerhouse-inc/powerhouse/commit/00c693e4b))
- sync-builder ([a422dd23d](https://github.com/powerhouse-inc/powerhouse/commit/a422dd23d))
- tests for reactor + sync builder ([429d786f6](https://github.com/powerhouse-inc/powerhouse/commit/429d786f6))
- initial dual reactor sync test ([51414e67d](https://github.com/powerhouse-inc/powerhouse/commit/51414e67d))
- major rename to avoid issues -- syncoperation rather than job handle ([28a1a5c54](https://github.com/powerhouse-inc/powerhouse/commit/28a1a5c54))
- opearations_ready flow for waiting for sync ([f8d96b1e1](https://github.com/powerhouse-inc/powerhouse/commit/f8d96b1e1))
- added big test where lots of docs are synced ([9b856ce93](https://github.com/powerhouse-inc/powerhouse/commit/9b856ce93))
- add conflict resolution test for concurrent modifications ([d938cbfd5](https://github.com/powerhouse-inc/powerhouse/commit/d938cbfd5))
- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))
- initial tla spec ([ced4140e0](https://github.com/powerhouse-inc/powerhouse/commit/ced4140e0))
- excessive reshuffles ([17d551321](https://github.com/powerhouse-inc/powerhouse/commit/17d551321))
- reshuffle tests ([e4bac1d84](https://github.com/powerhouse-inc/powerhouse/commit/e4bac1d84))
- updating the reactor find() method to use the new document indexer ([e2f5de1b7](https://github.com/powerhouse-inc/powerhouse/commit/e2f5de1b7))
- initial implementation of reactor-client missing methods ([b9a0d5c18](https://github.com/powerhouse-inc/powerhouse/commit/b9a0d5c18))
- added new get by id or slug so that reactor-client -> reactor can use it ([189294fac](https://github.com/powerhouse-inc/powerhouse/commit/189294fac))
- mutation resolver implementation ([4734cd186](https://github.com/powerhouse-inc/powerhouse/commit/4734cd186))
- reactor-client handles deletion propagation ([a28706734](https://github.com/powerhouse-inc/powerhouse/commit/a28706734))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- mutation resolver implementation ([569697f58](https://github.com/powerhouse-inc/powerhouse/commit/569697f58))
- reactor-client handles deletion propagation ([58b5e6646](https://github.com/powerhouse-inc/powerhouse/commit/58b5e6646))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- **builder-tools:** fix circular imports ([954a82d18](https://github.com/powerhouse-inc/powerhouse/commit/954a82d18))
- **builder-tools:** warmup local files on ph connect ([03f80d4a4](https://github.com/powerhouse-inc/powerhouse/commit/03f80d4a4))
- **codegen:** add test artifact purge util functions ([#2081](https://github.com/powerhouse-inc/powerhouse/pull/2081))
- **codegen:** fix circular imports ([d9f2f40dc](https://github.com/powerhouse-inc/powerhouse/commit/d9f2f40dc))
- **codegen:** use ts morph for generating module export files ([d61029bc9](https://github.com/powerhouse-inc/powerhouse/commit/d61029bc9))
- **codegen:** add comments ([b43130230](https://github.com/powerhouse-inc/powerhouse/commit/b43130230))
- **codegen:** remove unused var ([c2f03d359](https://github.com/powerhouse-inc/powerhouse/commit/c2f03d359))
- **codegen:** use ts morph to generate subgraphs index file ([#2108](https://github.com/powerhouse-inc/powerhouse/pull/2108))
- **codegen, vetra:** update codegen templates ([#2056](https://github.com/powerhouse-inc/powerhouse/pull/2056))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **common:** fix circular imports ([15e5f27e7](https://github.com/powerhouse-inc/powerhouse/commit/15e5f27e7))
- **connect:** remove circular imports ([a1632d41e](https://github.com/powerhouse-inc/powerhouse/commit/a1632d41e))
- **connect:** show loading animation on drive editor container ([90f554b24](https://github.com/powerhouse-inc/powerhouse/commit/90f554b24))
- **connect:** add import route for components ([e0f629465](https://github.com/powerhouse-inc/powerhouse/commit/e0f629465))
- **connect:** use nice import paths ([1288a57d2](https://github.com/powerhouse-inc/powerhouse/commit/1288a57d2))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect:** remove redundant async logic ([b9784dfd6](https://github.com/powerhouse-inc/powerhouse/commit/b9784dfd6))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))
- **connect,design-system:** fix connect component imports ([22f192c72](https://github.com/powerhouse-inc/powerhouse/commit/22f192c72))
- **design-system:** show all powerhouse dependencies on about modal ([9947a6cbd](https://github.com/powerhouse-inc/powerhouse/commit/9947a6cbd))
- **design-system:** first pass of circular import fixes ([712fda94f](https://github.com/powerhouse-inc/powerhouse/commit/712fda94f))
- **design-system:** fix circular imports with ugly paths for now ([3cab4d756](https://github.com/powerhouse-inc/powerhouse/commit/3cab4d756))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- **design-system:** update powerhouse type imports ([10d8a44cc](https://github.com/powerhouse-inc/powerhouse/commit/10d8a44cc))
- **design-system:** fix icon component type imports ([2541ab67e](https://github.com/powerhouse-inc/powerhouse/commit/2541ab67e))
- **design-system:** fix icon name type imports ([8c49cc8a8](https://github.com/powerhouse-inc/powerhouse/commit/8c49cc8a8))
- **design-system:** fix powerhouse component type imports ([87a81e18c](https://github.com/powerhouse-inc/powerhouse/commit/87a81e18c))
- **design-system:** fix cn util import ([956e94779](https://github.com/powerhouse-inc/powerhouse/commit/956e94779))
- **design-system:** fix rwa exports ([5d4a1fa85](https://github.com/powerhouse-inc/powerhouse/commit/5d4a1fa85))
- **design-system:** fix ui dir package layout ([0204418bc](https://github.com/powerhouse-inc/powerhouse/commit/0204418bc))
- **design-system,connect:** fix connect component imports ([ed5b5a264](https://github.com/powerhouse-inc/powerhouse/commit/ed5b5a264))
- **design-system,connect:** fix ui import paths ([6ef0d35c9](https://github.com/powerhouse-inc/powerhouse/commit/6ef0d35c9))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **document-drive:** fix circular import in prisma ([321a4b934](https://github.com/powerhouse-inc/powerhouse/commit/321a4b934))
- **document-drive:** set drive name on document header ([0019751f0](https://github.com/powerhouse-inc/powerhouse/commit/0019751f0))
- **document-model:** fix circular imports ([e1c9d1305](https://github.com/powerhouse-inc/powerhouse/commit/e1c9d1305))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **monorepo:** fix circular imports ([#2088](https://github.com/powerhouse-inc/powerhouse/pull/2088))
- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))
- **ph-cli:** ph migrate command ([#2099](https://github.com/powerhouse-inc/powerhouse/pull/2099))
- **ph-cmd:** create vetra document on init ([824fed331](https://github.com/powerhouse-inc/powerhouse/commit/824fed331))
- **ph-cmd:** create vetra document on init ([#2101](https://github.com/powerhouse-inc/powerhouse/pull/2101))
- **ph-cmd, codegen:** allow specifying custom boilerplate branch to checkout on init ([cd50f8d38](https://github.com/powerhouse-inc/powerhouse/commit/cd50f8d38))
- **ph-cmd,ph-cli:** fix circular imports ([f193ddf8e](https://github.com/powerhouse-inc/powerhouse/commit/f193ddf8e))
- **reactor-api:** added free entry flag which allows unauthenticated users to reach guest level ([d2d17ab44](https://github.com/powerhouse-inc/powerhouse/commit/d2d17ab44))
- **reactor-api:** fix circular imports ([0eed9b3f9](https://github.com/powerhouse-inc/powerhouse/commit/0eed9b3f9))
- **reactor-api:** added driveDocument and driveDocuments route ([a30d78e84](https://github.com/powerhouse-inc/powerhouse/commit/a30d78e84))
- **reactor-browser:** fix circular imports ([68c94dbda](https://github.com/powerhouse-inc/powerhouse/commit/68c94dbda))
- **reactor-browser:** initial work on suspense compatible document store ([5651ff473](https://github.com/powerhouse-inc/powerhouse/commit/5651ff473))
- **reactor-browser:** re-added dispatchActions export ([6e6d7626e](https://github.com/powerhouse-inc/powerhouse/commit/6e6d7626e))
- **reactor-browser, connect:** use suspense based hooks to load documents ([67eb9831e](https://github.com/powerhouse-inc/powerhouse/commit/67eb9831e))
- **reactor-browser,academy:** update hooks documentation ([#2110](https://github.com/powerhouse-inc/powerhouse/pull/2110))
- **vetra:** fix circular imports ([a513ad28a](https://github.com/powerhouse-inc/powerhouse/commit/a513ad28a))

### 🩹 Fixes

- implement bidirectional sync and local-first architecture for remote drives in vetra ([#2053](https://github.com/powerhouse-inc/powerhouse/pull/2053))
- handle clipboard properly ([8f6f592c8](https://github.com/powerhouse-inc/powerhouse/commit/8f6f592c8))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))
- fixing unit test build and adding a couple comments ([d24d46b2d](https://github.com/powerhouse-inc/powerhouse/commit/d24d46b2d))
- type fixes in the document indexer ([98cd03b92](https://github.com/powerhouse-inc/powerhouse/commit/98cd03b92))
- add/remove children need special revision handling ([52b8bbd72](https://github.com/powerhouse-inc/powerhouse/commit/52b8bbd72))
- linter issues ([bc1d2a569](https://github.com/powerhouse-inc/powerhouse/commit/bc1d2a569))
- added a v1 addfile integration test ([47fae0474](https://github.com/powerhouse-inc/powerhouse/commit/47fae0474))
- the full set of atlas actions applies ([18f08ba1b](https://github.com/powerhouse-inc/powerhouse/commit/18f08ba1b))
- default state on test helper ([560fe7c99](https://github.com/powerhouse-inc/powerhouse/commit/560fe7c99))
- proof of match between drive server and reactor ([f86a38b7e](https://github.com/powerhouse-inc/powerhouse/commit/f86a38b7e))
- commenting out test that exports broke ([75cfba9b5](https://github.com/powerhouse-inc/powerhouse/commit/75cfba9b5))
- update atlas packages ([fa174d00e](https://github.com/powerhouse-inc/powerhouse/commit/fa174d00e))
- prisma openssl not found ([535ace02c](https://github.com/powerhouse-inc/powerhouse/commit/535ace02c))
- make document model extension optional ([#2076](https://github.com/powerhouse-inc/powerhouse/pull/2076))
- broke the build, fixing with reactorbuilder ([2c4ade4e6](https://github.com/powerhouse-inc/powerhouse/commit/2c4ade4e6))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- linting fixes ([2ab0f01ed](https://github.com/powerhouse-inc/powerhouse/commit/2ab0f01ed))
- removing race condition from test ([251531bf4](https://github.com/powerhouse-inc/powerhouse/commit/251531bf4))
- linting warnings ([5f79fcf98](https://github.com/powerhouse-inc/powerhouse/commit/5f79fcf98))
- require job executor config, and fix mock data in unit tests ([7c7362325](https://github.com/powerhouse-inc/powerhouse/commit/7c7362325))
- adding a very basic claude settings file because it keeps getting wiped in clean ([3bfa35222](https://github.com/powerhouse-inc/powerhouse/commit/3bfa35222))
- linter fixes ([39a187eca](https://github.com/powerhouse-inc/powerhouse/commit/39a187eca))
- reshuffles work a bit differently ([0cf39c12d](https://github.com/powerhouse-inc/powerhouse/commit/0cf39c12d))
- fix issue with resuffling ([7bcb931b7](https://github.com/powerhouse-inc/powerhouse/commit/7bcb931b7))
- fixing lint issues ([3afde3ebd](https://github.com/powerhouse-inc/powerhouse/commit/3afde3ebd))
- read data is missing vetra packages ([cc0323cf6](https://github.com/powerhouse-inc/powerhouse/commit/cc0323cf6))
- remove db construction and use migrations instead ([6835d37d4](https://github.com/powerhouse-inc/powerhouse/commit/6835d37d4))
- linter fixes ([d0b6e63d7](https://github.com/powerhouse-inc/powerhouse/commit/d0b6e63d7))
- use real operation store ([97fac3d7f](https://github.com/powerhouse-inc/powerhouse/commit/97fac3d7f))
- unskipping skipped tests and fixing ([f28bd79f2](https://github.com/powerhouse-inc/powerhouse/commit/f28bd79f2))
- rename poorly named function ([4f35a7dee](https://github.com/powerhouse-inc/powerhouse/commit/4f35a7dee))
- more renames in integration tests ([1f4e2969f](https://github.com/powerhouse-inc/powerhouse/commit/1f4e2969f))
- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))
- ensure version.ts is generated before TypeScript compilation in CI ([#2103](https://github.com/powerhouse-inc/powerhouse/pull/2103))
- pull readmodel coordinator init back into reactor ([bf3a4261b](https://github.com/powerhouse-inc/powerhouse/commit/bf3a4261b))
- fixing atlas tests ([1c80d2807](https://github.com/powerhouse-inc/powerhouse/commit/1c80d2807))
- build fix for reactor-local and switchboard ([f99c45b34](https://github.com/powerhouse-inc/powerhouse/commit/f99c45b34))
- slug mappings were not being inserted properly ([d1864769a](https://github.com/powerhouse-inc/powerhouse/commit/d1864769a))
- reactor document-model filtering was busted ([4700ad9f3](https://github.com/powerhouse-inc/powerhouse/commit/4700ad9f3))
- build and lint fixes ([efeece878](https://github.com/powerhouse-inc/powerhouse/commit/efeece878))
- slug mappings were not being inserted properly ([1ddc6f349](https://github.com/powerhouse-inc/powerhouse/commit/1ddc6f349))
- reactor document-model filtering was busted ([98bb94668](https://github.com/powerhouse-inc/powerhouse/commit/98bb94668))
- build and lint fixes ([ddbb423c6](https://github.com/powerhouse-inc/powerhouse/commit/ddbb423c6))
- free entry for register pull responder listener ([f69688fd0](https://github.com/powerhouse-inc/powerhouse/commit/f69688fd0))
- **builder-tools:** improved hmr on Connect ([3de4ebdc6](https://github.com/powerhouse-inc/powerhouse/commit/3de4ebdc6))
- **builder-tools:** removed warmup to avoid hmr issues ([e632d75ad](https://github.com/powerhouse-inc/powerhouse/commit/e632d75ad))
- **builder-tools:** fix hmr on connect ([f72047359](https://github.com/powerhouse-inc/powerhouse/commit/f72047359))
- **builder-tools:** use alias for self-reference import on ts instead of loading from dist ([b23b772c0](https://github.com/powerhouse-inc/powerhouse/commit/b23b772c0))
- **builder-tools:** only alias local package when defined ([ad8f8037c](https://github.com/powerhouse-inc/powerhouse/commit/ad8f8037c))
- **builder-tools:** improved hmr for connect ([adf4f8374](https://github.com/powerhouse-inc/powerhouse/commit/adf4f8374))
- **builder-tools:** load index.ts even if local package is built ([a1c910b04](https://github.com/powerhouse-inc/powerhouse/commit/a1c910b04))
- **builder-tools:** fix style import from external package ([c7b491ada](https://github.com/powerhouse-inc/powerhouse/commit/c7b491ada))
- **builder-tools/vetra:** run tsc watch alongside connect studio and import transpiled files instead of source ([eb33cfe29](https://github.com/powerhouse-inc/powerhouse/commit/eb33cfe29))
- **codegen:** disable custom directories promp by default ([a71a3d15a](https://github.com/powerhouse-inc/powerhouse/commit/a71a3d15a))
- **codegen:** run prettier programmatically ([23f948c4d](https://github.com/powerhouse-inc/powerhouse/commit/23f948c4d))
- **codegen:** move read-pkg to runtime dependency ([939f01045](https://github.com/powerhouse-inc/powerhouse/commit/939f01045))
- **codegen:** include enums and schema types in subgraph schema ([#2092](https://github.com/powerhouse-inc/powerhouse/pull/2092))
- **codegen:** remove shared types and enums from subgraph schema template ([8de6e6429](https://github.com/powerhouse-inc/powerhouse/commit/8de6e6429))
- **connect:** reenable undo redo buttons ([c126ea768](https://github.com/powerhouse-inc/powerhouse/commit/c126ea768))
- **connect:** fixed useCookieBanner filename ([d9e486a3f](https://github.com/powerhouse-inc/powerhouse/commit/d9e486a3f))
- **connect:** fixed app version retrieval from package.json ([7be168b1a](https://github.com/powerhouse-inc/powerhouse/commit/7be168b1a))
- **connect:** fixed some import inconsistencies ([32e83efcb](https://github.com/powerhouse-inc/powerhouse/commit/32e83efcb))
- **connect:** improved hmr plugin ([b65ff940e](https://github.com/powerhouse-inc/powerhouse/commit/b65ff940e))
- **connect:** show error on non existing editor ([ae43a43c4](https://github.com/powerhouse-inc/powerhouse/commit/ae43a43c4))
- **connect:** removed duplicated ModalsContainer ([#2086](https://github.com/powerhouse-inc/powerhouse/pull/2086))
- **connect:** re-added root export for AppLoader ([f810bbd11](https://github.com/powerhouse-inc/powerhouse/commit/f810bbd11))
- **connect:** update sideEffects in package.json to include main.js ([ea9dba718](https://github.com/powerhouse-inc/powerhouse/commit/ea9dba718))
- **connect:** fix main.js import with source condition ([6ed6d07eb](https://github.com/powerhouse-inc/powerhouse/commit/6ed6d07eb))
- **connect,reactor-api:** fix merge conflict ([8786cdae4](https://github.com/powerhouse-inc/powerhouse/commit/8786cdae4))
- **design-system:** implement form submission handling in CreateDocumentModal ([#2085](https://github.com/powerhouse-inc/powerhouse/pull/2085))
- **design-system:** do not show sync status on folders ([60ca2c575](https://github.com/powerhouse-inc/powerhouse/commit/60ca2c575))
- **design-system:** do not show sync status on folders ([#2090](https://github.com/powerhouse-inc/powerhouse/pull/2090))
- **document-drive:** fix helia type import ([7b8a7b850](https://github.com/powerhouse-inc/powerhouse/commit/7b8a7b850))
- **document-model:** export single generateId function ([6c1a7d9a0](https://github.com/powerhouse-inc/powerhouse/commit/6c1a7d9a0))
- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))
- **ph-cli:** adjust sleep durations for better user experience during GitHub URL configuration ([266cea2f3](https://github.com/powerhouse-inc/powerhouse/commit/266cea2f3))
- **ph-cli:** enable preview drive only in watch mode ([af854d2f3](https://github.com/powerhouse-inc/powerhouse/commit/af854d2f3))
- **ph-cli:** added missing runtime dependencies ([da1b66e73](https://github.com/powerhouse-inc/powerhouse/commit/da1b66e73))
- **ph-cli:** update lint:fix command ([8d93a57d9](https://github.com/powerhouse-inc/powerhouse/commit/8d93a57d9))
- **ph-cli,codegen:** lazy load migrate command ([fdeb859fa](https://github.com/powerhouse-inc/powerhouse/commit/fdeb859fa))
- **ph-cmd:** replace checkoutProject with cloneRepository and installDependencies functions ([506bcb6f0](https://github.com/powerhouse-inc/powerhouse/commit/506bcb6f0))
- **ph-cmd:** move console log for vetra package document creation ([dbdbdf99b](https://github.com/powerhouse-inc/powerhouse/commit/dbdbdf99b))
- **ph-cmd, codegen:** always use tag instead of reserver argument --version ([802b0da83](https://github.com/powerhouse-inc/powerhouse/commit/802b0da83))
- **reactor-api:** re-added reactor-api debounce on loadDocumentModels ([fc9e7d47e](https://github.com/powerhouse-inc/powerhouse/commit/fc9e7d47e))
- **reactor-api:** fixed graphql-ws import ([22e2d862e](https://github.com/powerhouse-inc/powerhouse/commit/22e2d862e))
- **reactor-api:** type issue on ws server ([12a9901f6](https://github.com/powerhouse-inc/powerhouse/commit/12a9901f6))
- **reactor-api:** downgraded prisma ([9a8a5cefd](https://github.com/powerhouse-inc/powerhouse/commit/9a8a5cefd))
- **reactor-api,switchboard:** load local package by default and resolve self reference import on ts files ([2b2d29ba6](https://github.com/powerhouse-inc/powerhouse/commit/2b2d29ba6))
- **reactor-browser:** handle node and drive navigation on window popstate event ([#2094](https://github.com/powerhouse-inc/powerhouse/pull/2094))
- **switchboard:** use POSIX-compliant syntax ([ee0f56d1b](https://github.com/powerhouse-inc/powerhouse/commit/ee0f56d1b))
- **switchboard:** removed duplicated document models in client initializer ([30b9dbeb3](https://github.com/powerhouse-inc/powerhouse/commit/30b9dbeb3))
- **switchboard, ph-cli, document-drive:** --skip-generate on prisma db push ([a37f816a4](https://github.com/powerhouse-inc/powerhouse/commit/a37f816a4))
- **vetra:** increased codegen debounce to 3 seconds ([ca880217a](https://github.com/powerhouse-inc/powerhouse/commit/ca880217a))
- **vetra:** added development export ([f4e169fa9](https://github.com/powerhouse-inc/powerhouse/commit/f4e169fa9))
- **vetra:** fix set app name debounce on app editor ([a441013f7](https://github.com/powerhouse-inc/powerhouse/commit/a441013f7))
- **vetra:** fix set app name debounce on app editor ([b776e9a28](https://github.com/powerhouse-inc/powerhouse/commit/b776e9a28))
- **vetra:** update package.json to change export key from 'development' to 'source' ([6193acc85](https://github.com/powerhouse-inc/powerhouse/commit/6193acc85))
- **vetra:** re-added vetra package editor export ([fd8e88d4c](https://github.com/powerhouse-inc/powerhouse/commit/fd8e88d4c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.128 (2025-11-20)

### 🚀 Features

- **ph-cmd:** create vetra document on init ([824fed331](https://github.com/powerhouse-inc/powerhouse/commit/824fed331))
- **ph-cmd:** create vetra document on init ([#2101](https://github.com/powerhouse-inc/powerhouse/pull/2101))

### 🩹 Fixes

- **ph-cmd:** move console log for vetra package document creation ([dbdbdf99b](https://github.com/powerhouse-inc/powerhouse/commit/dbdbdf99b))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.127 (2025-11-19)

### 🚀 Features

- **reactor-browser,academy:** update hooks documentation ([#2110](https://github.com/powerhouse-inc/powerhouse/pull/2110))

### 🩹 Fixes

- free entry for register pull responder listener ([f69688fd0](https://github.com/powerhouse-inc/powerhouse/commit/f69688fd0))
- **reactor-api:** downgraded prisma ([9a8a5cefd](https://github.com/powerhouse-inc/powerhouse/commit/9a8a5cefd))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.126 (2025-11-19)

### 🩹 Fixes

- **ph-cli:** update lint:fix command ([8d93a57d9](https://github.com/powerhouse-inc/powerhouse/commit/8d93a57d9))
- **switchboard, ph-cli, document-drive:** --skip-generate on prisma db push ([a37f816a4](https://github.com/powerhouse-inc/powerhouse/commit/a37f816a4))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.125 (2025-11-19)

### 🩹 Fixes

- **reactor-api:** fixed graphql-ws import ([22e2d862e](https://github.com/powerhouse-inc/powerhouse/commit/22e2d862e))
- **reactor-api:** type issue on ws server ([12a9901f6](https://github.com/powerhouse-inc/powerhouse/commit/12a9901f6))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.124 (2025-11-18)

### 🚀 Features

- mutation resolver implementation ([4734cd186](https://github.com/powerhouse-inc/powerhouse/commit/4734cd186))
- reactor-client handles deletion propagation ([a28706734](https://github.com/powerhouse-inc/powerhouse/commit/a28706734))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- mutation resolver implementation ([569697f58](https://github.com/powerhouse-inc/powerhouse/commit/569697f58))
- reactor-client handles deletion propagation ([58b5e6646](https://github.com/powerhouse-inc/powerhouse/commit/58b5e6646))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- **codegen:** use ts morph to generate subgraphs index file ([#2108](https://github.com/powerhouse-inc/powerhouse/pull/2108))

### 🩹 Fixes

- slug mappings were not being inserted properly ([d1864769a](https://github.com/powerhouse-inc/powerhouse/commit/d1864769a))
- reactor document-model filtering was busted ([4700ad9f3](https://github.com/powerhouse-inc/powerhouse/commit/4700ad9f3))
- build and lint fixes ([efeece878](https://github.com/powerhouse-inc/powerhouse/commit/efeece878))
- slug mappings were not being inserted properly ([1ddc6f349](https://github.com/powerhouse-inc/powerhouse/commit/1ddc6f349))
- reactor document-model filtering was busted ([98bb94668](https://github.com/powerhouse-inc/powerhouse/commit/98bb94668))
- build and lint fixes ([ddbb423c6](https://github.com/powerhouse-inc/powerhouse/commit/ddbb423c6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.123 (2025-11-18)

### 🚀 Features

- **codegen:** use ts morph for generating module export files ([d61029bc9](https://github.com/powerhouse-inc/powerhouse/commit/d61029bc9))
- **codegen:** add comments ([b43130230](https://github.com/powerhouse-inc/powerhouse/commit/b43130230))
- **codegen:** remove unused var ([c2f03d359](https://github.com/powerhouse-inc/powerhouse/commit/c2f03d359))

### ❤️ Thank You

- ryanwolhuter

## 4.1.0-dev.122 (2025-11-18)

### 🚀 Features

- initial implementation of reactor-client missing methods ([b9a0d5c18](https://github.com/powerhouse-inc/powerhouse/commit/b9a0d5c18))
- added new get by id or slug so that reactor-client -> reactor can use it ([189294fac](https://github.com/powerhouse-inc/powerhouse/commit/189294fac))

### 🩹 Fixes

- pull readmodel coordinator init back into reactor ([bf3a4261b](https://github.com/powerhouse-inc/powerhouse/commit/bf3a4261b))
- fixing atlas tests ([1c80d2807](https://github.com/powerhouse-inc/powerhouse/commit/1c80d2807))
- build fix for reactor-local and switchboard ([f99c45b34](https://github.com/powerhouse-inc/powerhouse/commit/f99c45b34))
- **builder-tools:** fix style import from external package ([c7b491ada](https://github.com/powerhouse-inc/powerhouse/commit/c7b491ada))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.121 (2025-11-17)

### 🩹 Fixes

- **builder-tools:** load index.ts even if local package is built ([a1c910b04](https://github.com/powerhouse-inc/powerhouse/commit/a1c910b04))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.120 (2025-11-17)

### 🩹 Fixes

- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))
- ensure version.ts is generated before TypeScript compilation in CI ([#2103](https://github.com/powerhouse-inc/powerhouse/pull/2103))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.119 (2025-11-15)

### 🚀 Features

- first pass implementation of job-handle and mailbox ([b86e87803](https://github.com/powerhouse-inc/powerhouse/commit/b86e87803))
- plan and implementation for kysely sync storage ([7ccc7ae67](https://github.com/powerhouse-inc/powerhouse/commit/7ccc7ae67))
- initial implementations of cursor and remotes storage for sync ([1e7fadcf4](https://github.com/powerhouse-inc/powerhouse/commit/1e7fadcf4))
- getting types in place for implementation ([bbc146227](https://github.com/powerhouse-inc/powerhouse/commit/bbc146227))
- internalchannel implementation and types ([644ef1695](https://github.com/powerhouse-inc/powerhouse/commit/644ef1695))
- initial sync-manager implementation ([00c693e4b](https://github.com/powerhouse-inc/powerhouse/commit/00c693e4b))
- sync-builder ([a422dd23d](https://github.com/powerhouse-inc/powerhouse/commit/a422dd23d))
- tests for reactor + sync builder ([429d786f6](https://github.com/powerhouse-inc/powerhouse/commit/429d786f6))
- initial dual reactor sync test ([51414e67d](https://github.com/powerhouse-inc/powerhouse/commit/51414e67d))
- major rename to avoid issues -- syncoperation rather than job handle ([28a1a5c54](https://github.com/powerhouse-inc/powerhouse/commit/28a1a5c54))
- opearations_ready flow for waiting for sync ([f8d96b1e1](https://github.com/powerhouse-inc/powerhouse/commit/f8d96b1e1))
- added big test where lots of docs are synced ([9b856ce93](https://github.com/powerhouse-inc/powerhouse/commit/9b856ce93))
- add conflict resolution test for concurrent modifications ([d938cbfd5](https://github.com/powerhouse-inc/powerhouse/commit/d938cbfd5))
- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))
- initial tla spec ([ced4140e0](https://github.com/powerhouse-inc/powerhouse/commit/ced4140e0))
- excessive reshuffles ([17d551321](https://github.com/powerhouse-inc/powerhouse/commit/17d551321))
- reshuffle tests ([e4bac1d84](https://github.com/powerhouse-inc/powerhouse/commit/e4bac1d84))
- updating the reactor find() method to use the new document indexer ([e2f5de1b7](https://github.com/powerhouse-inc/powerhouse/commit/e2f5de1b7))

### 🩹 Fixes

- use real operation store ([97fac3d7f](https://github.com/powerhouse-inc/powerhouse/commit/97fac3d7f))
- unskipping skipped tests and fixing ([f28bd79f2](https://github.com/powerhouse-inc/powerhouse/commit/f28bd79f2))
- rename poorly named function ([4f35a7dee](https://github.com/powerhouse-inc/powerhouse/commit/4f35a7dee))
- more renames in integration tests ([1f4e2969f](https://github.com/powerhouse-inc/powerhouse/commit/1f4e2969f))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.118 (2025-11-14)

### 🩹 Fixes

- **builder-tools:** improved hmr for connect ([adf4f8374](https://github.com/powerhouse-inc/powerhouse/commit/adf4f8374))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.117 (2025-11-13)

### 🩹 Fixes

- **reactor-api:** re-added reactor-api debounce on loadDocumentModels ([fc9e7d47e](https://github.com/powerhouse-inc/powerhouse/commit/fc9e7d47e))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.116 (2025-11-13)

### 🩹 Fixes

- **connect:** fix main.js import with source condition ([6ed6d07eb](https://github.com/powerhouse-inc/powerhouse/commit/6ed6d07eb))
- **ph-cli:** added missing runtime dependencies ([da1b66e73](https://github.com/powerhouse-inc/powerhouse/commit/da1b66e73))
- **ph-cli,codegen:** lazy load migrate command ([fdeb859fa](https://github.com/powerhouse-inc/powerhouse/commit/fdeb859fa))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.115 (2025-11-13)

### 🚀 Features

- **ph-cli:** ph migrate command ([#2099](https://github.com/powerhouse-inc/powerhouse/pull/2099))

### 🩹 Fixes

- **builder-tools:** use alias for self-reference import on ts instead of loading from dist ([b23b772c0](https://github.com/powerhouse-inc/powerhouse/commit/b23b772c0))
- **builder-tools:** only alias local package when defined ([ad8f8037c](https://github.com/powerhouse-inc/powerhouse/commit/ad8f8037c))
- **reactor-api,switchboard:** load local package by default and resolve self reference import on ts files ([2b2d29ba6](https://github.com/powerhouse-inc/powerhouse/commit/2b2d29ba6))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.114 (2025-11-13)

### 🚀 Features

- implementation of the new join on ordinal in the index ([ad621af7a](https://github.com/powerhouse-inc/powerhouse/commit/ad621af7a))

### 🩹 Fixes

- linter fixes ([d0b6e63d7](https://github.com/powerhouse-inc/powerhouse/commit/d0b6e63d7))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.113 (2025-11-12)

### 🩹 Fixes

- **builder-tools/vetra:** run tsc watch alongside connect studio and import transpiled files instead of source ([eb33cfe29](https://github.com/powerhouse-inc/powerhouse/commit/eb33cfe29))
- **document-drive:** fix helia type import ([7b8a7b850](https://github.com/powerhouse-inc/powerhouse/commit/7b8a7b850))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.112 (2025-11-12)

### 🩹 Fixes

- **connect:** update sideEffects in package.json to include main.js ([ea9dba718](https://github.com/powerhouse-inc/powerhouse/commit/ea9dba718))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.111 (2025-11-12)

### 🚀 Features

- initial implementation of operation index ([906588091](https://github.com/powerhouse-inc/powerhouse/commit/906588091))
- splitting job integration tests into legacy and current ([413ead70c](https://github.com/powerhouse-inc/powerhouse/commit/413ead70c))
- first pass operation-index integration ([4e5b1e191](https://github.com/powerhouse-inc/powerhouse/commit/4e5b1e191))
- adding operation index to executor integration tests ([63b51b84f](https://github.com/powerhouse-inc/powerhouse/commit/63b51b84f))

### 🩹 Fixes

- remove db construction and use migrations instead ([6835d37d4](https://github.com/powerhouse-inc/powerhouse/commit/6835d37d4))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.110 (2025-11-11)

### 🚀 Features

- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))

### 🩹 Fixes

- read data is missing vetra packages ([cc0323cf6](https://github.com/powerhouse-inc/powerhouse/commit/cc0323cf6))
- **builder-tools:** fix hmr on connect ([f72047359](https://github.com/powerhouse-inc/powerhouse/commit/f72047359))
- **reactor-browser:** handle node and drive navigation on window popstate event ([#2094](https://github.com/powerhouse-inc/powerhouse/pull/2094))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.109 (2025-11-10)

### 🩹 Fixes

- **codegen:** remove shared types and enums from subgraph schema template ([8de6e6429](https://github.com/powerhouse-inc/powerhouse/commit/8de6e6429))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.108 (2025-11-10)

### 🩹 Fixes

- **codegen:** include enums and schema types in subgraph schema ([#2092](https://github.com/powerhouse-inc/powerhouse/pull/2092))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.107 (2025-11-10)

### 🚀 Features

- merge branch 'main' into merge/main-to-5.0.1 ([3b182d161](https://github.com/powerhouse-inc/powerhouse/commit/3b182d161))
- first pass load impl on write side ([85ef79df9](https://github.com/powerhouse-inc/powerhouse/commit/85ef79df9))
- wip load-reshuffle test ([fa05f1666](https://github.com/powerhouse-inc/powerhouse/commit/fa05f1666))
- **builder-tools:** fix circular imports ([954a82d18](https://github.com/powerhouse-inc/powerhouse/commit/954a82d18))
- **codegen:** fix circular imports ([d9f2f40dc](https://github.com/powerhouse-inc/powerhouse/commit/d9f2f40dc))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **common:** fix circular imports ([15e5f27e7](https://github.com/powerhouse-inc/powerhouse/commit/15e5f27e7))
- **connect:** add import route for components ([e0f629465](https://github.com/powerhouse-inc/powerhouse/commit/e0f629465))
- **connect:** use nice import paths ([1288a57d2](https://github.com/powerhouse-inc/powerhouse/commit/1288a57d2))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect:** remove redundant async logic ([b9784dfd6](https://github.com/powerhouse-inc/powerhouse/commit/b9784dfd6))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **connect,design-system:** fix connect component imports ([22f192c72](https://github.com/powerhouse-inc/powerhouse/commit/22f192c72))
- **design-system:** first pass of circular import fixes ([712fda94f](https://github.com/powerhouse-inc/powerhouse/commit/712fda94f))
- **design-system:** fix circular imports with ugly paths for now ([3cab4d756](https://github.com/powerhouse-inc/powerhouse/commit/3cab4d756))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- **design-system:** update powerhouse type imports ([10d8a44cc](https://github.com/powerhouse-inc/powerhouse/commit/10d8a44cc))
- **design-system:** fix icon component type imports ([2541ab67e](https://github.com/powerhouse-inc/powerhouse/commit/2541ab67e))
- **design-system:** fix icon name type imports ([8c49cc8a8](https://github.com/powerhouse-inc/powerhouse/commit/8c49cc8a8))
- **design-system:** fix powerhouse component type imports ([87a81e18c](https://github.com/powerhouse-inc/powerhouse/commit/87a81e18c))
- **design-system:** fix cn util import ([956e94779](https://github.com/powerhouse-inc/powerhouse/commit/956e94779))
- **design-system:** fix rwa exports ([5d4a1fa85](https://github.com/powerhouse-inc/powerhouse/commit/5d4a1fa85))
- **design-system:** fix ui dir package layout ([0204418bc](https://github.com/powerhouse-inc/powerhouse/commit/0204418bc))
- **design-system,connect:** fix connect component imports ([ed5b5a264](https://github.com/powerhouse-inc/powerhouse/commit/ed5b5a264))
- **design-system,connect:** fix ui import paths ([6ef0d35c9](https://github.com/powerhouse-inc/powerhouse/commit/6ef0d35c9))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **document-drive:** fix circular import in prisma ([321a4b934](https://github.com/powerhouse-inc/powerhouse/commit/321a4b934))
- **document-model:** fix circular imports ([e1c9d1305](https://github.com/powerhouse-inc/powerhouse/commit/e1c9d1305))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **monorepo:** fix circular imports ([#2088](https://github.com/powerhouse-inc/powerhouse/pull/2088))
- **ph-cmd,ph-cli:** fix circular imports ([f193ddf8e](https://github.com/powerhouse-inc/powerhouse/commit/f193ddf8e))
- **reactor-api:** fix circular imports ([0eed9b3f9](https://github.com/powerhouse-inc/powerhouse/commit/0eed9b3f9))
- **reactor-browser:** fix circular imports ([68c94dbda](https://github.com/powerhouse-inc/powerhouse/commit/68c94dbda))
- **reactor-browser:** initial work on suspense compatible document store ([5651ff473](https://github.com/powerhouse-inc/powerhouse/commit/5651ff473))
- **reactor-browser:** re-added dispatchActions export ([6e6d7626e](https://github.com/powerhouse-inc/powerhouse/commit/6e6d7626e))
- **reactor-browser, connect:** use suspense based hooks to load documents ([67eb9831e](https://github.com/powerhouse-inc/powerhouse/commit/67eb9831e))
- **vetra:** fix circular imports ([a513ad28a](https://github.com/powerhouse-inc/powerhouse/commit/a513ad28a))

### 🩹 Fixes

- publish docker prod workflow ([d701f8dc0](https://github.com/powerhouse-inc/powerhouse/commit/d701f8dc0))
- prisma openssl not found ([1c9370a93](https://github.com/powerhouse-inc/powerhouse/commit/1c9370a93))
- reshuffles work a bit differently ([0cf39c12d](https://github.com/powerhouse-inc/powerhouse/commit/0cf39c12d))
- fix issue with resuffling ([7bcb931b7](https://github.com/powerhouse-inc/powerhouse/commit/7bcb931b7))
- fixing lint issues ([3afde3ebd](https://github.com/powerhouse-inc/powerhouse/commit/3afde3ebd))
- **builder-tools:** support cjs requires of react and react-dom on external packages ([c1c52a714](https://github.com/powerhouse-inc/powerhouse/commit/c1c52a714))
- **connect:** fixed heroku nginx when base path is "/" ([4b6e08139](https://github.com/powerhouse-inc/powerhouse/commit/4b6e08139))
- **connect:** fix assets location on heroku nginx ([8ae783eda](https://github.com/powerhouse-inc/powerhouse/commit/8ae783eda))
- **connect:** remove redirect on heroku nfgnx ([e781aff1c](https://github.com/powerhouse-inc/powerhouse/commit/e781aff1c))
- **connect:** re-added root export for AppLoader ([f810bbd11](https://github.com/powerhouse-inc/powerhouse/commit/f810bbd11))
- **connect,reactor-api:** fix merge conflict ([8786cdae4](https://github.com/powerhouse-inc/powerhouse/commit/8786cdae4))
- **design-system:** do not show sync status on folders ([60ca2c575](https://github.com/powerhouse-inc/powerhouse/commit/60ca2c575))
- **design-system:** do not show sync status on folders ([#2090](https://github.com/powerhouse-inc/powerhouse/pull/2090))
- **switchboard:** use POSIX-compliant syntax ([09f64bf3b](https://github.com/powerhouse-inc/powerhouse/commit/09f64bf3b))
- **vetra:** fix set app name debounce on app editor ([a441013f7](https://github.com/powerhouse-inc/powerhouse/commit/a441013f7))
- **vetra:** re-added vetra package editor export ([fd8e88d4c](https://github.com/powerhouse-inc/powerhouse/commit/fd8e88d4c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.106 (2025-11-10)

### 🩹 Fixes

- **connect:** removed duplicated ModalsContainer ([#2086](https://github.com/powerhouse-inc/powerhouse/pull/2086))
- **design-system:** implement form submission handling in CreateDocumentModal ([#2085](https://github.com/powerhouse-inc/powerhouse/pull/2085))
- **vetra:** fix set app name debounce on app editor ([b776e9a28](https://github.com/powerhouse-inc/powerhouse/commit/b776e9a28))
- **vetra:** update package.json to change export key from 'development' to 'source' ([6193acc85](https://github.com/powerhouse-inc/powerhouse/commit/6193acc85))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.105 (2025-11-08)

### 🚀 Features

- **document-drive:** set drive name on document header ([0019751f0](https://github.com/powerhouse-inc/powerhouse/commit/0019751f0))
- **reactor-api:** added driveDocument and driveDocuments route ([a30d78e84](https://github.com/powerhouse-inc/powerhouse/commit/a30d78e84))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.104 (2025-11-07)

### 🚀 Features

- migration scripts for all storage ([804f5838c](https://github.com/powerhouse-inc/powerhouse/commit/804f5838c))
- work on getting both benchmarks hitting postgres ([d035c79b9](https://github.com/powerhouse-inc/powerhouse/commit/d035c79b9))
- **connect:** show loading animation on drive editor container ([90f554b24](https://github.com/powerhouse-inc/powerhouse/commit/90f554b24))
- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))

### 🩹 Fixes

- linting fixes ([2ab0f01ed](https://github.com/powerhouse-inc/powerhouse/commit/2ab0f01ed))
- removing race condition from test ([251531bf4](https://github.com/powerhouse-inc/powerhouse/commit/251531bf4))
- linting warnings ([5f79fcf98](https://github.com/powerhouse-inc/powerhouse/commit/5f79fcf98))
- require job executor config, and fix mock data in unit tests ([7c7362325](https://github.com/powerhouse-inc/powerhouse/commit/7c7362325))
- adding a very basic claude settings file because it keeps getting wiped in clean ([3bfa35222](https://github.com/powerhouse-inc/powerhouse/commit/3bfa35222))
- linter fixes ([39a187eca](https://github.com/powerhouse-inc/powerhouse/commit/39a187eca))
- **connect:** show error on non existing editor ([ae43a43c4](https://github.com/powerhouse-inc/powerhouse/commit/ae43a43c4))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.103 (2025-11-06)

### 🚀 Features

- **builder-tools:** warmup local files on ph connect ([03f80d4a4](https://github.com/powerhouse-inc/powerhouse/commit/03f80d4a4))
- **codegen:** add test artifact purge util functions ([#2081](https://github.com/powerhouse-inc/powerhouse/pull/2081))
- **connect:** remove circular imports ([a1632d41e](https://github.com/powerhouse-inc/powerhouse/commit/a1632d41e))
- **design-system:** show all powerhouse dependencies on about modal ([9947a6cbd](https://github.com/powerhouse-inc/powerhouse/commit/9947a6cbd))

### 🩹 Fixes

- **builder-tools:** improved hmr on Connect ([3de4ebdc6](https://github.com/powerhouse-inc/powerhouse/commit/3de4ebdc6))
- **builder-tools:** removed warmup to avoid hmr issues ([e632d75ad](https://github.com/powerhouse-inc/powerhouse/commit/e632d75ad))
- **codegen:** run prettier programmatically ([23f948c4d](https://github.com/powerhouse-inc/powerhouse/commit/23f948c4d))
- **codegen:** move read-pkg to runtime dependency ([939f01045](https://github.com/powerhouse-inc/powerhouse/commit/939f01045))
- **connect:** fixed app version retrieval from package.json ([7be168b1a](https://github.com/powerhouse-inc/powerhouse/commit/7be168b1a))
- **connect:** fixed some import inconsistencies ([32e83efcb](https://github.com/powerhouse-inc/powerhouse/commit/32e83efcb))
- **connect:** improved hmr plugin ([b65ff940e](https://github.com/powerhouse-inc/powerhouse/commit/b65ff940e))
- **document-model:** export single generateId function ([6c1a7d9a0](https://github.com/powerhouse-inc/powerhouse/commit/6c1a7d9a0))
- **vetra:** increased codegen debounce to 3 seconds ([ca880217a](https://github.com/powerhouse-inc/powerhouse/commit/ca880217a))
- **vetra:** added development export ([f4e169fa9](https://github.com/powerhouse-inc/powerhouse/commit/f4e169fa9))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.102 (2025-11-06)

### 🚀 Features

- working out how consistency guarantees are provided through consistency tokens ([18737020e](https://github.com/powerhouse-inc/powerhouse/commit/18737020e))
- consistency tracker implementation ([73449ab68](https://github.com/powerhouse-inc/powerhouse/commit/73449ab68))
- added consistency token to the job interface ([f5077680c](https://github.com/powerhouse-inc/powerhouse/commit/f5077680c))
- updated read model specs with consistency token ([3a7d6f91a](https://github.com/powerhouse-inc/powerhouse/commit/3a7d6f91a))
- adding consistency tracking to the document indexer ([3e4b694e6](https://github.com/powerhouse-inc/powerhouse/commit/3e4b694e6))
- adding consistency tracking to the document indexer ([a2a0b4e9c](https://github.com/powerhouse-inc/powerhouse/commit/a2a0b4e9c))
- starting to migrate reactor to use the legacy storage feature flag ([c24a9829e](https://github.com/powerhouse-inc/powerhouse/commit/c24a9829e))
- integration tests for consistency token ([030744ec2](https://github.com/powerhouse-inc/powerhouse/commit/030744ec2))
- switching to tinybench for benchmarks ([5b915e025](https://github.com/powerhouse-inc/powerhouse/commit/5b915e025))
- implement vetra document backup functionality in generators ([#2077](https://github.com/powerhouse-inc/powerhouse/pull/2077))
- batch insert helper for atlas ([fd60534c6](https://github.com/powerhouse-inc/powerhouse/commit/fd60534c6))
- compare atlas results from batch insert ([10ce147cd](https://github.com/powerhouse-inc/powerhouse/commit/10ce147cd))
- added batch insert as a benchmark option ([09989be49](https://github.com/powerhouse-inc/powerhouse/commit/09989be49))
- test script for profiling ([7abfe885a](https://github.com/powerhouse-inc/powerhouse/commit/7abfe885a))
- updating single mutation script to ignore pglite warmup ([3ad625632](https://github.com/powerhouse-inc/powerhouse/commit/3ad625632))
- **reactor-api:** added free entry flag which allows unauthenticated users to reach guest level ([d2d17ab44](https://github.com/powerhouse-inc/powerhouse/commit/d2d17ab44))

### 🩹 Fixes

- update atlas packages ([fa174d00e](https://github.com/powerhouse-inc/powerhouse/commit/fa174d00e))
- broke the build, fixing with reactorbuilder ([2c4ade4e6](https://github.com/powerhouse-inc/powerhouse/commit/2c4ade4e6))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- **switchboard:** removed duplicated document models in client initializer ([30b9dbeb3](https://github.com/powerhouse-inc/powerhouse/commit/30b9dbeb3))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.101 (2025-11-05)

### 🚀 Features

- pre-load local packages when building driveServer ([#2064](https://github.com/powerhouse-inc/powerhouse/pull/2064))
- **codegen, vetra:** update codegen templates ([#2056](https://github.com/powerhouse-inc/powerhouse/pull/2056))

### 🩹 Fixes

- make document model extension optional ([#2076](https://github.com/powerhouse-inc/powerhouse/pull/2076))
- **switchboard:** use POSIX-compliant syntax ([ee0f56d1b](https://github.com/powerhouse-inc/powerhouse/commit/ee0f56d1b))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.100 (2025-11-04)

### 🚀 Features

- initial types for relationship indexer ([151502633](https://github.com/powerhouse-inc/powerhouse/commit/151502633))
- reactor and job executor have a separate path for relationships ([b1cabb7f5](https://github.com/powerhouse-inc/powerhouse/commit/b1cabb7f5))
- first pass implementation with unit tests ([5bc7416ef](https://github.com/powerhouse-inc/powerhouse/commit/5bc7416ef))
- first pass batch job implementation ([227305ec8](https://github.com/powerhouse-inc/powerhouse/commit/227305ec8))
- migrating to mutateBatch API for addFile ([75ffe94e9](https://github.com/powerhouse-inc/powerhouse/commit/75ffe94e9))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))
- added atlas import for base server ([9528d2c2c](https://github.com/powerhouse-inc/powerhouse/commit/9528d2c2c))
- the mother of all tests -- base server + reactor deep compare post 1800+ actions ([52eddaeea](https://github.com/powerhouse-inc/powerhouse/commit/52eddaeea))
- finally, a benchmark ([2771c446e](https://github.com/powerhouse-inc/powerhouse/commit/2771c446e))
- feature flag to toggle write to legacy storage ([151e40d76](https://github.com/powerhouse-inc/powerhouse/commit/151e40d76))
- added third piece where we also test the read model ([3c20fc925](https://github.com/powerhouse-inc/powerhouse/commit/3c20fc925))
- create default vetra package document when ph vetra is started for a remote drive ([#2066](https://github.com/powerhouse-inc/powerhouse/pull/2066))

### 🩹 Fixes

- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))
- fixing unit test build and adding a couple comments ([d24d46b2d](https://github.com/powerhouse-inc/powerhouse/commit/d24d46b2d))
- type fixes in the document indexer ([98cd03b92](https://github.com/powerhouse-inc/powerhouse/commit/98cd03b92))
- add/remove children need special revision handling ([52b8bbd72](https://github.com/powerhouse-inc/powerhouse/commit/52b8bbd72))
- linter issues ([bc1d2a569](https://github.com/powerhouse-inc/powerhouse/commit/bc1d2a569))
- added a v1 addfile integration test ([47fae0474](https://github.com/powerhouse-inc/powerhouse/commit/47fae0474))
- the full set of atlas actions applies ([18f08ba1b](https://github.com/powerhouse-inc/powerhouse/commit/18f08ba1b))
- default state on test helper ([560fe7c99](https://github.com/powerhouse-inc/powerhouse/commit/560fe7c99))
- proof of match between drive server and reactor ([f86a38b7e](https://github.com/powerhouse-inc/powerhouse/commit/f86a38b7e))
- commenting out test that exports broke ([75cfba9b5](https://github.com/powerhouse-inc/powerhouse/commit/75cfba9b5))
- prisma openssl not found ([535ace02c](https://github.com/powerhouse-inc/powerhouse/commit/535ace02c))
- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.99 (2025-10-31)

### 🚀 Features

- **ph-cmd, codegen:** allow specifying custom boilerplate branch to checkout on init ([cd50f8d38](https://github.com/powerhouse-inc/powerhouse/commit/cd50f8d38))

### 🩹 Fixes

- **codegen:** disable custom directories promp by default ([a71a3d15a](https://github.com/powerhouse-inc/powerhouse/commit/a71a3d15a))
- **connect:** reenable undo redo buttons ([c126ea768](https://github.com/powerhouse-inc/powerhouse/commit/c126ea768))
- **connect:** fixed useCookieBanner filename ([d9e486a3f](https://github.com/powerhouse-inc/powerhouse/commit/d9e486a3f))
- **ph-cmd, codegen:** always use tag instead of reserver argument --version ([802b0da83](https://github.com/powerhouse-inc/powerhouse/commit/802b0da83))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.98 (2025-10-31)

### 🩹 Fixes

- handle clipboard properly ([8f6f592c8](https://github.com/powerhouse-inc/powerhouse/commit/8f6f592c8))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.97 (2025-10-30)

### 🩹 Fixes

- **ph-cli:** enable preview drive only in watch mode ([af854d2f3](https://github.com/powerhouse-inc/powerhouse/commit/af854d2f3))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.96 (2025-10-30)

### 🩹 Fixes

- **ph-cli:** adjust sleep durations for better user experience during GitHub URL configuration ([266cea2f3](https://github.com/powerhouse-inc/powerhouse/commit/266cea2f3))
- **ph-cmd:** replace checkoutProject with cloneRepository and installDependencies functions ([506bcb6f0](https://github.com/powerhouse-inc/powerhouse/commit/506bcb6f0))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.95 (2025-10-30)

### 🚀 Features

- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### 🩹 Fixes

- implement bidirectional sync and local-first architecture for remote drives in vetra ([#2053](https://github.com/powerhouse-inc/powerhouse/pull/2053))
- **reactor-browser:** removed circular import ([9d334701b](https://github.com/powerhouse-inc/powerhouse/commit/9d334701b))
- **reactor-browser:** fix circular import ([4982a5ebe](https://github.com/powerhouse-inc/powerhouse/commit/4982a5ebe))
- **renown:** use globalThis.crypto.subtle instead of conditional import ([f3ef9a139](https://github.com/powerhouse-inc/powerhouse/commit/f3ef9a139))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.94 (2025-10-29)

### 🚀 Features

- re-enable switchboard link on document toolbar ([#2048](https://github.com/powerhouse-inc/powerhouse/pull/2048))
- **ph-cli:** added vetra preview drive ([#2049](https://github.com/powerhouse-inc/powerhouse/pull/2049))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.93 (2025-10-29)

### 🚀 Features

- first swing at a project to import these recorded operations ([41b139237](https://github.com/powerhouse-inc/powerhouse/commit/41b139237))

### 🩹 Fixes

- package link issues ([3415df513](https://github.com/powerhouse-inc/powerhouse/commit/3415df513))
- compatibility updates ([687ac4075](https://github.com/powerhouse-inc/powerhouse/commit/687ac4075))
- disabled bad test for now ([60d2e7682](https://github.com/powerhouse-inc/powerhouse/commit/60d2e7682))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.92 (2025-10-28)

### 🚀 Features

- **reactor-browser:** add folder hooks ([#2050](https://github.com/powerhouse-inc/powerhouse/pull/2050))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.91 (2025-10-28)

### 🚀 Features

- **reactor-browser:** implement collision resolution for target names during node copy ([150284a04](https://github.com/powerhouse-inc/powerhouse/commit/150284a04))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.90 (2025-10-27)

### 🚀 Features

- **reactor-api:** updated apollo server to v5 ([66dffda7b](https://github.com/powerhouse-inc/powerhouse/commit/66dffda7b))

### 🩹 Fixes

- **codegen:** handle empty allowedDocumentTypes with empty array instead of empty string element ([1f34c4984](https://github.com/powerhouse-inc/powerhouse/commit/1f34c4984))
- **codegen:** do not add doc state schema to subgraph ([811265356](https://github.com/powerhouse-inc/powerhouse/commit/811265356))
- **reactor-api:** add prefix to interfaces on document model schemas ([e85855ce4](https://github.com/powerhouse-inc/powerhouse/commit/e85855ce4))
- **reactor-api:** avoid MaxListenersWarning on startup ([b43efdc83](https://github.com/powerhouse-inc/powerhouse/commit/b43efdc83))
- **switchboard:** fallback to filesystem storage if postgres db is unavailable ([97e40bbf5](https://github.com/powerhouse-inc/powerhouse/commit/97e40bbf5))

### ❤️ Thank You

- acaldas
- Guillermo Puente

## 4.1.0-dev.89 (2025-10-24)

### 🚀 Features

- enabled DocumentToolbar in editor template ([e4ded7de6](https://github.com/powerhouse-inc/powerhouse/commit/e4ded7de6))

### 🩹 Fixes

- used fixed versions for codemirror dep ([183e487db](https://github.com/powerhouse-inc/powerhouse/commit/183e487db))

### ❤️ Thank You

- Guillermo Puente

## 4.1.0-dev.88 (2025-10-24)

### 🩹 Fixes

- **builder-tools, reactor-api:** optimized vite watch ([4d241c8c6](https://github.com/powerhouse-inc/powerhouse/commit/4d241c8c6))
- **document-drive:** enforce drive icon value to default to null ([64f4452b8](https://github.com/powerhouse-inc/powerhouse/commit/64f4452b8))
- **reactor-api:** prevent subgraph errors from crashing the reactor api ([27e3605e1](https://github.com/powerhouse-inc/powerhouse/commit/27e3605e1))
- **reactor-api:** debounce local package updates and reduced logging ([96735b11a](https://github.com/powerhouse-inc/powerhouse/commit/96735b11a))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.87 (2025-10-24)

### 🚀 Features

- implement DocumentToolbar component ([#2017](https://github.com/powerhouse-inc/powerhouse/pull/2017))
- **connect:** make external editors enabled false by default ([9e3a68e48](https://github.com/powerhouse-inc/powerhouse/commit/9e3a68e48))

### 🩹 Fixes

- memory store had an edge case where it could throw even after it stored the document ([5383d9f52](https://github.com/powerhouse-inc/powerhouse/commit/5383d9f52))
- fixing a deep issue where operations were being used to calculate index instead of revisions ([a6611501d](https://github.com/powerhouse-inc/powerhouse/commit/a6611501d))
- let revision errors bubble up to jobs ([13e82cec9](https://github.com/powerhouse-inc/powerhouse/commit/13e82cec9))
- read tests had a type bug ([b0f21cddc](https://github.com/powerhouse-inc/powerhouse/commit/b0f21cddc))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.86 (2025-10-23)

### 🚀 Features

- initial write cache bench, but incomplete ([a9cbcf20e](https://github.com/powerhouse-inc/powerhouse/commit/a9cbcf20e))

### 🩹 Fixes

- **vetra:** added codegen debounce test and reduced logging ([bc360b8e0](https://github.com/powerhouse-inc/powerhouse/commit/bc360b8e0))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.85 (2025-10-22)

### 🩹 Fixes

- **connect, design-system:** keep full height on dropzone wrapper ([13f7c0e87](https://github.com/powerhouse-inc/powerhouse/commit/13f7c0e87))
- **connect, reactor-browser:** set selected drive Id instead of slug ([0777280c2](https://github.com/powerhouse-inc/powerhouse/commit/0777280c2))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.84 (2025-10-22)

### 🚀 Features

- **connect,codegen:** move dropzone wrapper component to connect ([#2018](https://github.com/powerhouse-inc/powerhouse/pull/2018))

### 🩹 Fixes

- update form labels to indicate required fields ([1b76136e0](https://github.com/powerhouse-inc/powerhouse/commit/1b76136e0))
- **vetra:** improve logging for validation errors in document model generation ([700854ce0](https://github.com/powerhouse-inc/powerhouse/commit/700854ce0))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.83 (2025-10-22)

### 🚀 Features

- add automated tests for vetra features ([#1962](https://github.com/powerhouse-inc/powerhouse/pull/1962))
- kv-store implementation ([25aa8cfd2](https://github.com/powerhouse-inc/powerhouse/commit/25aa8cfd2))
- created necessary interfaces ([f4c1bc9cf](https://github.com/powerhouse-inc/powerhouse/commit/f4c1bc9cf))
- added simple ring-buffer ([9b73aac39](https://github.com/powerhouse-inc/powerhouse/commit/9b73aac39))
- added a simple lru ([5651ecd17](https://github.com/powerhouse-inc/powerhouse/commit/5651ecd17))
- phase 4 of write cache plan ([ac339ff1a](https://github.com/powerhouse-inc/powerhouse/commit/ac339ff1a))
- easy path -- cache hit ([2804e447f](https://github.com/powerhouse-inc/powerhouse/commit/2804e447f))
- compatibility fixes ([34bc595c8](https://github.com/powerhouse-inc/powerhouse/commit/34bc595c8))
- introducing the keyframe store ([fee0e7d2f](https://github.com/powerhouse-inc/powerhouse/commit/fee0e7d2f))
- write cache and ring buffer tightening, removing some bad test cases ([f0915abbf](https://github.com/powerhouse-inc/powerhouse/commit/f0915abbf))
- testing ring buffers directly on the implementation ([bc46076fe](https://github.com/powerhouse-inc/powerhouse/commit/bc46076fe))
- proof of cache ([53ceae009](https://github.com/powerhouse-inc/powerhouse/commit/53ceae009))
- full write cache integration tests using document-drive ([cd22c881b](https://github.com/powerhouse-inc/powerhouse/commit/cd22c881b))
- write cache integration test updates and explicit error handling ([9f4d0a5b8](https://github.com/powerhouse-inc/powerhouse/commit/9f4d0a5b8))
- **design-system,common:** update breadcrumbs and folder views ([#2011](https://github.com/powerhouse-inc/powerhouse/pull/2011))

### 🩹 Fixes

- offering yet more proof of correctness in base revision usage ([94370ca90](https://github.com/powerhouse-inc/powerhouse/commit/94370ca90))
- all of the write cache tests should prove they are using snapshots correctly ([4badb3729](https://github.com/powerhouse-inc/powerhouse/commit/4badb3729))
- the last writecache unit test ([999f286a2](https://github.com/powerhouse-inc/powerhouse/commit/999f286a2))
- **codegen:** inject processors factory export ([3f43413b1](https://github.com/powerhouse-inc/powerhouse/commit/3f43413b1))
- **codegen:** do not import selected document models on relational db template ([9b1f79152](https://github.com/powerhouse-inc/powerhouse/commit/9b1f79152))
- **codegen:** removed no longer used arguments on generateProcessor ([c2fe33d53](https://github.com/powerhouse-inc/powerhouse/commit/c2fe33d53))
- **codegen:** remove dispatch argument from reducer boilerplate ([047e2b473](https://github.com/powerhouse-inc/powerhouse/commit/047e2b473))
- **reactor-api:** either use provided Loader or default to ImportLoader ([da10246a7](https://github.com/powerhouse-inc/powerhouse/commit/da10246a7))
- **reactor-browser:** type vetra module utils ([c453a6f0d](https://github.com/powerhouse-inc/powerhouse/commit/c453a6f0d))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.82 (2025-10-21)

### 🚀 Features

- **builder-tools:** add HMR support for external packages ([85f94006b](https://github.com/powerhouse-inc/powerhouse/commit/85f94006b))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.81 (2025-10-21)

### 🚀 Features

- **codegen:** add editor name codegen arg ([22334afb4](https://github.com/powerhouse-inc/powerhouse/commit/22334afb4))
- **codegen:** update template ([f6cd6fa93](https://github.com/powerhouse-inc/powerhouse/commit/f6cd6fa93))
- **codegen:** update templates ([2715fccca](https://github.com/powerhouse-inc/powerhouse/commit/2715fccca))
- **codegen:** update editor codegen templates ([6a32eb128](https://github.com/powerhouse-inc/powerhouse/commit/6a32eb128))
- **common,builder-tools:** always call editor config on mount ([7b246306b](https://github.com/powerhouse-inc/powerhouse/commit/7b246306b))
- **connect:** revert object field name ([4922cc47a](https://github.com/powerhouse-inc/powerhouse/commit/4922cc47a))
- **connect:** move config call to after other value setters ([3e8c26e81](https://github.com/powerhouse-inc/powerhouse/commit/3e8c26e81))
- **reactor-browser:** add factory function for ph event functions ([dc5a2952c](https://github.com/powerhouse-inc/powerhouse/commit/dc5a2952c))
- **reactor-browser:** improve generics ([c08b0d79b](https://github.com/powerhouse-inc/powerhouse/commit/c08b0d79b))
- **reactor-browser:** remove redundant types ([8108872e6](https://github.com/powerhouse-inc/powerhouse/commit/8108872e6))
- **reactor-browser:** add config setter hook ([e81e0aa97](https://github.com/powerhouse-inc/powerhouse/commit/e81e0aa97))
- **reactor-browser:** use one object for all event handler register fns ([bd5ebde02](https://github.com/powerhouse-inc/powerhouse/commit/bd5ebde02))
- **reactor-browser:** tidy exports ([4f1adfb0f](https://github.com/powerhouse-inc/powerhouse/commit/4f1adfb0f))
- **reactor-browser:** tidy more exports ([965c66299](https://github.com/powerhouse-inc/powerhouse/commit/965c66299))
- **reactor-browser:** organize and deduplicate state hooks ([e0ad408e7](https://github.com/powerhouse-inc/powerhouse/commit/e0ad408e7))
- **reactor-browser:** finalize config values ([c180f146c](https://github.com/powerhouse-inc/powerhouse/commit/c180f146c))
- **reactor-browser:** add allowed document model modules hook ([d9fea4afc](https://github.com/powerhouse-inc/powerhouse/commit/d9fea4afc))
- **reactor-browser:** remove catch all wildcard ([f09931a88](https://github.com/powerhouse-inc/powerhouse/commit/f09931a88))
- **reactor-browser,connect:** use factory for event functions where possible ([30aa4883d](https://github.com/powerhouse-inc/powerhouse/commit/30aa4883d))
- **reactor-browser,connect:** use new window function factory ([7886c284f](https://github.com/powerhouse-inc/powerhouse/commit/7886c284f))
- **reactor-browser,connect:** add global config setter helpers ([facfd5329](https://github.com/powerhouse-inc/powerhouse/commit/facfd5329))
- **reactor-browser,connect,vetra:** simplify document types workflow ([e665914e9](https://github.com/powerhouse-inc/powerhouse/commit/e665914e9))
- **reactor-browser,connect,vetra:** use hooks for all editor values ([#1931](https://github.com/powerhouse-inc/powerhouse/pull/1931))
- **reactor-browser,vetra,design-system:** use config hooks ([f6a62a099](https://github.com/powerhouse-inc/powerhouse/commit/f6a62a099))
- **vetra:** re-run generate ([71d9c33ba](https://github.com/powerhouse-inc/powerhouse/commit/71d9c33ba))
- **vetra:** add set document types operation/action ([dcb59d1d9](https://github.com/powerhouse-inc/powerhouse/commit/dcb59d1d9))

### 🩹 Fixes

- **connect:** fix runtime code import ([8e5ddf091](https://github.com/powerhouse-inc/powerhouse/commit/8e5ddf091))
- **vetra,builder-tools,common:** revert constants for id and name ([7d5f21c8b](https://github.com/powerhouse-inc/powerhouse/commit/7d5f21c8b))

### ❤️ Thank You

- acaldas
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.80 (2025-10-21)

### 🩹 Fixes

- added recommended type to prisma storage ([d7c9b2f27](https://github.com/powerhouse-inc/powerhouse/commit/d7c9b2f27))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.79 (2025-10-20)

### 🩹 Fixes

- **document-drive:** copy schema.prisma to dist on build ([f510653fd](https://github.com/powerhouse-inc/powerhouse/commit/f510653fd))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.78 (2025-10-20)

### 🩹 Fixes

- **document-drive:** add schema.prisma to bundle ([40eac982f](https://github.com/powerhouse-inc/powerhouse/commit/40eac982f))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.77 (2025-10-20)

### 🚀 Features

- merge branch 'release/staging/5.0.0' ([123e720e6](https://github.com/powerhouse-inc/powerhouse/commit/123e720e6))

### 🩹 Fixes

- add missing @openfeature/core peer dependency ([2c4a904b0](https://github.com/powerhouse-inc/powerhouse/commit/2c4a904b0))
- **design-system:** avoid testing library export ([9a290c7a4](https://github.com/powerhouse-inc/powerhouse/commit/9a290c7a4))
- **document-drive:** consistent getSynchronizationUnitsRevision results for all storage adapters ([eb1d9a2bd](https://github.com/powerhouse-inc/powerhouse/commit/eb1d9a2bd))
- **document-drive:** add initial state to first internal strand update ([120396f57](https://github.com/powerhouse-inc/powerhouse/commit/120396f57))
- **document-model:** improved hash mismatch error message ([20567ea8c](https://github.com/powerhouse-inc/powerhouse/commit/20567ea8c))
- **ph-cli:** allow file names with spaces ([651346930](https://github.com/powerhouse-inc/powerhouse/commit/651346930))
- **reactor-browser:** add debounce to refreshReactorData to avoid spam on indexeddb ([53ceef967](https://github.com/powerhouse-inc/powerhouse/commit/53ceef967))
- **vetra:** package query ([1f8d14d85](https://github.com/powerhouse-inc/powerhouse/commit/1f8d14d85))
- **vetra:** added drive id to read model ([dc9491766](https://github.com/powerhouse-inc/powerhouse/commit/dc9491766))
- **vetra:** added drive id to read model ([dffe520c3](https://github.com/powerhouse-inc/powerhouse/commit/dffe520c3))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Guillermo Puente @gpuente

## 4.1.0-dev.76 (2025-10-18)

### 🚀 Features

- document-view parity fixes ([0d6dd53fa](https://github.com/powerhouse-inc/powerhouse/commit/0d6dd53fa))

### 🩹 Fixes

- fixes to how revisions are calculated ([c2b0c2227](https://github.com/powerhouse-inc/powerhouse/commit/c2b0c2227))
- filesystem needs to calculate revisions better ([96654825a](https://github.com/powerhouse-inc/powerhouse/commit/96654825a))
- **reactor-browser:** add debounce to refreshReactorData to avoid spam on indexeddb ([4c5f3aed7](https://github.com/powerhouse-inc/powerhouse/commit/4c5f3aed7))
- **vetra:** update package.json to include src files ([#1980](https://github.com/powerhouse-inc/powerhouse/pull/1980))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.75 (2025-10-17)

### 🩹 Fixes

- oof, fixed a few deep issues with assumptions about global and local scope ([85d3c9616](https://github.com/powerhouse-inc/powerhouse/commit/85d3c9616))
- **connect:** reload window after clearing storage ([f214391f6](https://github.com/powerhouse-inc/powerhouse/commit/f214391f6))
- **connect:** fixes #1965 build public dir ([#1965](https://github.com/powerhouse-inc/powerhouse/issues/1965))
- **reactor-api:** avoids use of path.matchGlob which logs a error message ([9a88cf095](https://github.com/powerhouse-inc/powerhouse/commit/9a88cf095))
- **reactor-browser:** deal with invalid getDocument ([a38c9cda2](https://github.com/powerhouse-inc/powerhouse/commit/a38c9cda2))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.74 (2025-10-15)

### 🚀 Features

- dual write ([cd1fad2fb](https://github.com/powerhouse-inc/powerhouse/commit/cd1fad2fb))
- deletion state checks ([9fc3798cd](https://github.com/powerhouse-inc/powerhouse/commit/9fc3798cd))
- implemented job tracking ([370447337](https://github.com/powerhouse-inc/powerhouse/commit/370447337))
- introduced a read model coordinator ([ae5e765a9](https://github.com/powerhouse-inc/powerhouse/commit/ae5e765a9))
- document-view reconstruction fixes ([97a66e3fd](https://github.com/powerhouse-inc/powerhouse/commit/97a66e3fd))
- document-view optimizations ([d4251ce98](https://github.com/powerhouse-inc/powerhouse/commit/d4251ce98))
- document-view stiching changes ([fd875ca0a](https://github.com/powerhouse-inc/powerhouse/commit/fd875ca0a))

### 🩹 Fixes

- date issue in op store ([4c2fb3ae6](https://github.com/powerhouse-inc/powerhouse/commit/4c2fb3ae6))
- incremental fix wit hack ([5f4a7e2cd](https://github.com/powerhouse-inc/powerhouse/commit/5f4a7e2cd))
- fixing issue where create, update, delete were applied with incorrect scope ([59c7a981e](https://github.com/powerhouse-inc/powerhouse/commit/59c7a981e))
- adding all header parameters to create action input ([67ac63f05](https://github.com/powerhouse-inc/powerhouse/commit/67ac63f05))
- jobs can have many operations, fixing create/update in new flow ([ffcf6b468](https://github.com/powerhouse-inc/powerhouse/commit/ffcf6b468))
- now we need an actual job executor to make tests pass ([c869f1f34](https://github.com/powerhouse-inc/powerhouse/commit/c869f1f34))
- document-drive-model tests should use updated job status system and proper lifecycle methods of coordinator ([4217e3292](https://github.com/powerhouse-inc/powerhouse/commit/4217e3292))
- error thrown on shutdown ([b52cdb6fe](https://github.com/powerhouse-inc/powerhouse/commit/b52cdb6fe))
- merge fixes ([e5eda5985](https://github.com/powerhouse-inc/powerhouse/commit/e5eda5985))
- **codegen:** update graphql dependency in package.json ([257f368ac](https://github.com/powerhouse-inc/powerhouse/commit/257f368ac))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.73 (2025-10-15)

### 🚀 Features

- **renown:** added login button ([f109c7305](https://github.com/powerhouse-inc/powerhouse/commit/f109c7305))

### 🩹 Fixes

- **ph-cmd:** add overrides for react and react-dom versions ([fe1412c20](https://github.com/powerhouse-inc/powerhouse/commit/fe1412c20))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente

## 4.1.0-dev.72 (2025-10-15)

### 🩹 Fixes

- **connect, builder-tools:** normalize base path to start and end with a slash ([bea7b4673](https://github.com/powerhouse-inc/powerhouse/commit/bea7b4673))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.71 (2025-10-15)

### 🚀 Features

- **reactor-api:** add operation type and id resolvers to DriveSubgraph ([#1955](https://github.com/powerhouse-inc/powerhouse/pull/1955))

### 🩹 Fixes

- **codegen:** update analytics processor imports to use in processor templates ([#1954](https://github.com/powerhouse-inc/powerhouse/pull/1954))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.70 (2025-10-14)

### 🩹 Fixes

- broken templates, drive app styles, local state schema and validation ([#1941](https://github.com/powerhouse-inc/powerhouse/pull/1941))
- revert delete operation change to base-server as the underlying storage doesn't support it ([723345310](https://github.com/powerhouse-inc/powerhouse/commit/723345310))
- **codegen:** generate dm subgraphs ([a7be027f1](https://github.com/powerhouse-inc/powerhouse/commit/a7be027f1))
- **reactor-api:** bandaid a deeper issue where some document model types have their own name separate from header information, and headers aren't generally synced ([bbf5c94d8](https://github.com/powerhouse-inc/powerhouse/commit/bbf5c94d8))
- **vetra:** added drive id to read model ([2e40cc500](https://github.com/powerhouse-inc/powerhouse/commit/2e40cc500))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.69 (2025-10-11)

### 🚀 Features

- **builder-tools, ph-cli, connect:** reimplemented ph connect build and preview ([4f568517b](https://github.com/powerhouse-inc/powerhouse/commit/4f568517b))

### 🩹 Fixes

- **builder-tools:** do not watch if local package is disabled ([335f41a0c](https://github.com/powerhouse-inc/powerhouse/commit/335f41a0c))
- **codegen:** add /index.js to import path on templates ([37bc2e9ef](https://github.com/powerhouse-inc/powerhouse/commit/37bc2e9ef))
- **ph-cmd:** fixed detection of help command ([157249468](https://github.com/powerhouse-inc/powerhouse/commit/157249468))
- **vetra:** added drive id to read model ([cfe16037e](https://github.com/powerhouse-inc/powerhouse/commit/cfe16037e))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 4.1.0-dev.68 (2025-10-11)

### 🚀 Features

- update file extension to .phd for document export ([#1894](https://github.com/powerhouse-inc/powerhouse/pull/1894))
- generate unique vetra drive IDs per project ([#1936](https://github.com/powerhouse-inc/powerhouse/pull/1936))
- **connect:** import document-model editor missing styles ([#1937](https://github.com/powerhouse-inc/powerhouse/pull/1937))
- **vetra:** added read model to fetch vetra packages ([abb6d3742](https://github.com/powerhouse-inc/powerhouse/commit/abb6d3742))
- **vetra:** added documentId in filter option ([01bb92f28](https://github.com/powerhouse-inc/powerhouse/commit/01bb92f28))

### 🩹 Fixes

- enabled supported file ext in drop zone ([#1892](https://github.com/powerhouse-inc/powerhouse/pull/1892))
- **reactor-api:** added auth export ([a38df7fde](https://github.com/powerhouse-inc/powerhouse/commit/a38df7fde))
- **vetra:** added vetra package to processor filter ([5f3eaadf4](https://github.com/powerhouse-inc/powerhouse/commit/5f3eaadf4))
- **vetra:** package query ([36bea7102](https://github.com/powerhouse-inc/powerhouse/commit/36bea7102))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.67 (2025-10-10)

### 🚀 Features

- **vetra:** add delete functionality to vetra drive app documents ([#1927](https://github.com/powerhouse-inc/powerhouse/pull/1927))
- **vetra:** add open button to Package Information section ([#1930](https://github.com/powerhouse-inc/powerhouse/pull/1930))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.66 (2025-10-09)

### 🚀 Features

- **connect, builder-tools, reactor-browser:** support basepath on connect ([0571822ed](https://github.com/powerhouse-inc/powerhouse/commit/0571822ed))

### 🩹 Fixes

- **ph-reactor:** remove test files from root index ([2a217e8e6](https://github.com/powerhouse-inc/powerhouse/commit/2a217e8e6))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.65 (2025-10-09)

### 🩹 Fixes

- **ph-cli:** build version on release ci action ([cb86009c4](https://github.com/powerhouse-inc/powerhouse/commit/cb86009c4))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.64 (2025-10-09)

### 🩹 Fixes

- **ph-cli:** force transpiliation of version.ts ([6b1294745](https://github.com/powerhouse-inc/powerhouse/commit/6b1294745))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.63 (2025-10-09)

### 🚀 Features

- update @electric-sql/pglite version ([fa3529328](https://github.com/powerhouse-inc/powerhouse/commit/fa3529328))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.62 (2025-10-08)

### 🚀 Features

- wip delete document action ([5f753cea0](https://github.com/powerhouse-inc/powerhouse/commit/5f753cea0))

### 🩹 Fixes

- **connect:** fix build issues on external package ([2e46ebdcb](https://github.com/powerhouse-inc/powerhouse/commit/2e46ebdcb))
- **connect:** bad worker path ([66b8cd9a1](https://github.com/powerhouse-inc/powerhouse/commit/66b8cd9a1))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.61 (2025-10-08)

### 🩹 Fixes

- **connect:** fix use default export as fallback ([1569f1342](https://github.com/powerhouse-inc/powerhouse/commit/1569f1342))
- **ph-cli:** missing version.js file on dist ([ae7bc3772](https://github.com/powerhouse-inc/powerhouse/commit/ae7bc3772))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.60 (2025-10-08)

### 🚀 Features

- added watch-packages option to vetra command and disabled dynamic package loading by default ([#1875](https://github.com/powerhouse-inc/powerhouse/pull/1875))
- handle replace and duplicate documents in drag and drop ([#1876](https://github.com/powerhouse-inc/powerhouse/pull/1876))
- remove hardcoded Vetra drive ID from document editors ([#1878](https://github.com/powerhouse-inc/powerhouse/pull/1878))
- refactor drag and drop to use withDropZone HOC ([1737fd4fd](https://github.com/powerhouse-inc/powerhouse/commit/1737fd4fd))
- restructure document model to avoid circular imports ([#1874](https://github.com/powerhouse-inc/powerhouse/pull/1874))
- make EditorProps generic and added codegen tests ([ff5664adc](https://github.com/powerhouse-inc/powerhouse/commit/ff5664adc))
- add document state copy button with toast notification ([#1880](https://github.com/powerhouse-inc/powerhouse/pull/1880))
- pass documentId to editor component and useDocumentOfModule for type safe retrieval ([7f0781ea0](https://github.com/powerhouse-inc/powerhouse/commit/7f0781ea0))
- enhance upload tracking with unsupported document type handling ([bcf784dfc](https://github.com/powerhouse-inc/powerhouse/commit/bcf784dfc))
- document editor update ([ee24e7823](https://github.com/powerhouse-inc/powerhouse/commit/ee24e7823))
- useDocumentOfType hook ([d71661167](https://github.com/powerhouse-inc/powerhouse/commit/d71661167))
- removed props from document editor and updated boilerplate to use hook ([7f49e9070](https://github.com/powerhouse-inc/powerhouse/commit/7f49e9070))
- added initial pieces of the kysely operation store implementation ([3fbece162](https://github.com/powerhouse-inc/powerhouse/commit/3fbece162))
- add remaining methods ([2d1bd201e](https://github.com/powerhouse-inc/powerhouse/commit/2d1bd201e))
- initial document view methods + tests ([af8a9a0e7](https://github.com/powerhouse-inc/powerhouse/commit/af8a9a0e7))
- added getMany to document view ([f89a1c46c](https://github.com/powerhouse-inc/powerhouse/commit/f89a1c46c))
- drive boilerplate update ([aca241a83](https://github.com/powerhouse-inc/powerhouse/commit/aca241a83))
- refactor DriveExplorer and FolderTree components to use unified node structure and Sidebar component ([64c69ce59](https://github.com/powerhouse-inc/powerhouse/commit/64c69ce59))
- for backward compat, only new documents can have dual actions ([7c751bbcc](https://github.com/powerhouse-inc/powerhouse/commit/7c751bbcc))
- for backward compat, only new documents can have dual actions ([df8f38510](https://github.com/powerhouse-inc/powerhouse/commit/df8f38510))
- syncing feature flag behavior between switchboard and reactor-local ([e45dc2bf7](https://github.com/powerhouse-inc/powerhouse/commit/e45dc2bf7))
- stubbing out feature flag + reactor setup in connect and deleting unused code in reactor-browser ([793bbd7af](https://github.com/powerhouse-inc/powerhouse/commit/793bbd7af))
- adding feature flags to reactor-mcp ([fe4f2f683](https://github.com/powerhouse-inc/powerhouse/commit/fe4f2f683))
- added connect feature flag provider implementation that uses query parameters ([748aba57b](https://github.com/powerhouse-inc/powerhouse/commit/748aba57b))
- operation store now uses updated create / update actions ([180702e6c](https://github.com/powerhouse-inc/powerhouse/commit/180702e6c))
- using types instead of dynamic objects for create and upgrade input ([2a0e80974](https://github.com/powerhouse-inc/powerhouse/commit/2a0e80974))
- added hashing options to the document scope ([af2ef40c0](https://github.com/powerhouse-inc/powerhouse/commit/af2ef40c0))
- **codegen:** updated editor boilerplate with document state and example setName dispatch ([3e7c51cc3](https://github.com/powerhouse-inc/powerhouse/commit/3e7c51cc3))
- **codegen:** updated document editor boilerplate ([75cc0b9ff](https://github.com/powerhouse-inc/powerhouse/commit/75cc0b9ff))
- **codegen:** fix some type errors ([0f5eec72a](https://github.com/powerhouse-inc/powerhouse/commit/0f5eec72a))
- **codegen:** fix index file code lost in merge ([ded0c91e5](https://github.com/powerhouse-inc/powerhouse/commit/ded0c91e5))
- **codegen,reactor-browser:** drive boilerplate tweaks ([870180495](https://github.com/powerhouse-inc/powerhouse/commit/870180495))
- **common,vetra,connect:** render document editor as child of drive ([#1882](https://github.com/powerhouse-inc/powerhouse/pull/1882))
- **connect:** open remote drive ([59e6200ac](https://github.com/powerhouse-inc/powerhouse/commit/59e6200ac))
- **connect:** open remote drive ([e0a1c43a6](https://github.com/powerhouse-inc/powerhouse/commit/e0a1c43a6))
- **connect:** load modals on demand ([f61980996](https://github.com/powerhouse-inc/powerhouse/commit/f61980996))
- **connect, builder-tools:** centralized logic to handle env vars ([bf4b569d1](https://github.com/powerhouse-inc/powerhouse/commit/bf4b569d1))
- **connect, ph-cli, builder-tools, vetra:** ph connect rework ([746390687](https://github.com/powerhouse-inc/powerhouse/commit/746390687))
- **connect,builder-tools:** build rework ([#1871](https://github.com/powerhouse-inc/powerhouse/pull/1871))
- **connect,builder-tools,common,document-model,reactor-browser,vetra:** typed editor components with dispatch as prop ([553d38fef](https://github.com/powerhouse-inc/powerhouse/commit/553d38fef))
- **connect,builder-tools,common,document-model,reactor-browser,vetra:** typed editor components with dispatch as prop ([c47d1d5dd](https://github.com/powerhouse-inc/powerhouse/commit/c47d1d5dd))
- **connect,reactor-browser:** reenabled loading screen during initial loading ([ab7cfa580](https://github.com/powerhouse-inc/powerhouse/commit/ab7cfa580))
- **connect,reactor-browser:** remove drive context and use window for modals ([a9539202e](https://github.com/powerhouse-inc/powerhouse/commit/a9539202e))
- **design-system:** moved default ph styles to the design system stylesheet ([5860f6cc3](https://github.com/powerhouse-inc/powerhouse/commit/5860f6cc3))
- **monorepo:** attempt to integrate with main ([b53828c5c](https://github.com/powerhouse-inc/powerhouse/commit/b53828c5c))
- **monorepo:** update eslint config ([ac97af97d](https://github.com/powerhouse-inc/powerhouse/commit/ac97af97d))
- **monorepo:** revert package versions ([8a1a02628](https://github.com/powerhouse-inc/powerhouse/commit/8a1a02628))
- **monorepo:** a humble attempt at integration with main ([#1891](https://github.com/powerhouse-inc/powerhouse/pull/1891))
- **monorepo:** update to react 19 ([#1902](https://github.com/powerhouse-inc/powerhouse/pull/1902))
- **monorepo:** remove global storybook installs ([#1903](https://github.com/powerhouse-inc/powerhouse/pull/1903))
- **monorepo:** use latest versions of react related deps ([#1905](https://github.com/powerhouse-inc/powerhouse/pull/1905))
- **reactor-browser,codegen:** unify new and existing drive hooks ([7ed734b23](https://github.com/powerhouse-inc/powerhouse/commit/7ed734b23))
- **renown:** added connect crypto ([7d7a7bbd3](https://github.com/powerhouse-inc/powerhouse/commit/7d7a7bbd3))
- **vetra:** new connect build setup on vetra ([8dd11a849](https://github.com/powerhouse-inc/powerhouse/commit/8dd11a849))
- **vetra:** enabled HMR in dev mode ([8cf19757e](https://github.com/powerhouse-inc/powerhouse/commit/8cf19757e))
- **vetra:** added read model to fetch vetra packages ([23c55364d](https://github.com/powerhouse-inc/powerhouse/commit/23c55364d))
- **vetra:** added documentId in filter option ([b9c698e9b](https://github.com/powerhouse-inc/powerhouse/commit/b9c698e9b))

### 🩹 Fixes

- fix vite-config loading issue that breaks in vscode ([c40f8f312](https://github.com/powerhouse-inc/powerhouse/commit/c40f8f312))
- whoops, state needs to be undefined so it is rebuilt ([1ba7dc3bf](https://github.com/powerhouse-inc/powerhouse/commit/1ba7dc3bf))
- linting queue and awaiter now ([39b0f07ae](https://github.com/powerhouse-inc/powerhouse/commit/39b0f07ae))
- flakey test fix using fake timers ([4c7be58f3](https://github.com/powerhouse-inc/powerhouse/commit/4c7be58f3))
- regenerate prisma ([adb51a368](https://github.com/powerhouse-inc/powerhouse/commit/adb51a368))
- added more tests to confirm cross compat, and fixed an issue with create/upgrade hash mismatch ([37e39bcde](https://github.com/powerhouse-inc/powerhouse/commit/37e39bcde))
- multiple fixes for ph vetra ([#1906](https://github.com/powerhouse-inc/powerhouse/pull/1906))
- enable ph vetra command ([#1907](https://github.com/powerhouse-inc/powerhouse/pull/1907))
- use documentModelModule when creating document in processDocumentJob ([#1918](https://github.com/powerhouse-inc/powerhouse/pull/1918))
- **builder-tools:** hide @import warning ([4a507ac75](https://github.com/powerhouse-inc/powerhouse/commit/4a507ac75))
- **builder-tools:** dedupe react when linked to the monorepo ([08a6e23bb](https://github.com/powerhouse-inc/powerhouse/commit/08a6e23bb))
- **builder-tools,codegen,reactor-browser,vetra:** better error handling on useSelectedDocumentOfType ([2c2d15e06](https://github.com/powerhouse-inc/powerhouse/commit/2c2d15e06))
- **codegen:** support document-model on typemap ([43be2d482](https://github.com/powerhouse-inc/powerhouse/commit/43be2d482))
- **codegen:** do not overwrite existing subgraphs ([b4b553441](https://github.com/powerhouse-inc/powerhouse/commit/b4b553441))
- **codegen:** do not rely on global installation of prettier ([67076c5a5](https://github.com/powerhouse-inc/powerhouse/commit/67076c5a5))
- **codegen, document-model:** export actions object from document-model ([66c2b2b4b](https://github.com/powerhouse-inc/powerhouse/commit/66c2b2b4b))
- **connect:** added switchboard push listener ([c611ffa9e](https://github.com/powerhouse-inc/powerhouse/commit/c611ffa9e))
- **connect:** added switchboard push listener ([39e8660f5](https://github.com/powerhouse-inc/powerhouse/commit/39e8660f5))
- **connect, design-system, vetra:** import design system tailwind theme separately ([97857800d](https://github.com/powerhouse-inc/powerhouse/commit/97857800d))
- **connect, reactor-browser:** call useSelectedDriveSafe on unsafe contexts ([3a487e6aa](https://github.com/powerhouse-inc/powerhouse/commit/3a487e6aa))
- **connect, vetra:** update package.json and tsconfig ([637e735cd](https://github.com/powerhouse-inc/powerhouse/commit/637e735cd))
- **design-system:** include all font weights for Inter ([cdf04168b](https://github.com/powerhouse-inc/powerhouse/commit/cdf04168b))
- **document-drive:** reduce log verbosity ([29cc6ec9a](https://github.com/powerhouse-inc/powerhouse/commit/29cc6ec9a))
- **ph-cli,builder-tools:** remove ph connect implementation ([f92aa4df5](https://github.com/powerhouse-inc/powerhouse/commit/f92aa4df5))
- **ph-cmd:** ignore scalars package on ph commands ([ea2a28432](https://github.com/powerhouse-inc/powerhouse/commit/ea2a28432))
- **reactor-api:** do not use multiple loaders ([93ca742ae](https://github.com/powerhouse-inc/powerhouse/commit/93ca742ae))
- **reactor-api:** catch errors when loading packages to avoid breaking the process ([87adac5f2](https://github.com/powerhouse-inc/powerhouse/commit/87adac5f2))
- **reactor-api:** skip document model with duplicated name instead of breaking ([d0bc1ff58](https://github.com/powerhouse-inc/powerhouse/commit/d0bc1ff58))
- **reactor-api:** rename timestamp fields to follow ISO format ([86813d154](https://github.com/powerhouse-inc/powerhouse/commit/86813d154))
- **reactor-api:** catch subgraph setup errors to avoid breaking the server ([2237ff6b4](https://github.com/powerhouse-inc/powerhouse/commit/2237ff6b4))
- **reactor-api:** added auth export ([d3a13f128](https://github.com/powerhouse-inc/powerhouse/commit/d3a13f128))
- **reactor-api:** rolling back some changes that break subgraph injection ([29fd974e1](https://github.com/powerhouse-inc/powerhouse/commit/29fd974e1))
- **reactor-browser:** document switchboard query ([ab4633588](https://github.com/powerhouse-inc/powerhouse/commit/ab4633588))
- **reactor-browser:** document switchboard query ([e0929df25](https://github.com/powerhouse-inc/powerhouse/commit/e0929df25))
- **renown:** different export for nodejs ([b3a01161a](https://github.com/powerhouse-inc/powerhouse/commit/b3a01161a))
- **switchboard, ph-cli, ph-cmd, builder-tools:** ensure minimum node version ([e0fb396e7](https://github.com/powerhouse-inc/powerhouse/commit/e0fb396e7))
- **vetra:** activate codegen processor on either driveId or drive slug ([f4600228a](https://github.com/powerhouse-inc/powerhouse/commit/f4600228a))
- **vetra:** make default css styles specific to vetra ([30d598c3e](https://github.com/powerhouse-inc/powerhouse/commit/30d598c3e))
- **vetra:** get vetra package docId from selectedDrive ([4c031f5cb](https://github.com/powerhouse-inc/powerhouse/commit/4c031f5cb))
- **vetra:** added vetra package to processor filter ([0d6ab5a70](https://github.com/powerhouse-inc/powerhouse/commit/0d6ab5a70))
- **vetra:** tsconfig regression ([f669dcf64](https://github.com/powerhouse-inc/powerhouse/commit/f669dcf64))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.59 (2025-09-24)

### 🚀 Features

- **monorepo:** rename tsc to tsc:build ([c1385418b](https://github.com/powerhouse-inc/powerhouse/commit/c1385418b))
- **ph-cmd:** fix wrong mocking that breaks tests ([7a5a19fb9](https://github.com/powerhouse-inc/powerhouse/commit/7a5a19fb9))
- **reactor:** fix lint error ([53777e154](https://github.com/powerhouse-inc/powerhouse/commit/53777e154))

### 🩹 Fixes

- codegen broke, fixing for reactor gql types ([86fe61c84](https://github.com/powerhouse-inc/powerhouse/commit/86fe61c84))
- reverting bad merge changes and getting reactor to build again ([eb687de4c](https://github.com/powerhouse-inc/powerhouse/commit/eb687de4c))
- lots of type fixes for modules ([8f4cf02fe](https://github.com/powerhouse-inc/powerhouse/commit/8f4cf02fe))
- part 2 of build fixes for module changes ([3000a13c3](https://github.com/powerhouse-inc/powerhouse/commit/3000a13c3))
- more type fixes ([16c562ae1](https://github.com/powerhouse-inc/powerhouse/commit/16c562ae1))
- hand-edit document-model generated stuff so as not to have a circular reference ([e9ec89590](https://github.com/powerhouse-inc/powerhouse/commit/e9ec89590))
- generating prisma client ([0a101b476](https://github.com/powerhouse-inc/powerhouse/commit/0a101b476))
- fix remaining tests ([60bf7b767](https://github.com/powerhouse-inc/powerhouse/commit/60bf7b767))
- updating codegen ([5585bd012](https://github.com/powerhouse-inc/powerhouse/commit/5585bd012))
- **builder-tools:** declare @storybook/preview-api dependency ([705ac8da1](https://github.com/powerhouse-inc/powerhouse/commit/705ac8da1))
- **document-drive:** changed default log level from 'debug' to 'info' ([dffeb1d81](https://github.com/powerhouse-inc/powerhouse/commit/dffeb1d81))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.58 (2025-09-18)

### 🚀 Features

- adding feature flag to switchboard for controlling reactorv2 api ([4486c8a8d](https://github.com/powerhouse-inc/powerhouse/commit/4486c8a8d))

### 🩹 Fixes

- fixing the utc times ([15b06d2e2](https://github.com/powerhouse-inc/powerhouse/commit/15b06d2e2))
- build fixes ([fe2cd6699](https://github.com/powerhouse-inc/powerhouse/commit/fe2cd6699))
- fixing issue where icon was breaking ([cd7d0e6ec](https://github.com/powerhouse-inc/powerhouse/commit/cd7d0e6ec))
- fixing issue with local state not being persisted ([fc6735e6c](https://github.com/powerhouse-inc/powerhouse/commit/fc6735e6c))
- document type was wrong ([ae3ffb9ee](https://github.com/powerhouse-inc/powerhouse/commit/ae3ffb9ee))
- test fix for document-drive package ([40f4b6416](https://github.com/powerhouse-inc/powerhouse/commit/40f4b6416))
- codegen package needs to copy before testing ([9115c7968](https://github.com/powerhouse-inc/powerhouse/commit/9115c7968))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.57 (2025-09-17)

### 🚀 Features

- add processor configuration support to switchboard and Vetra integration ([#1859](https://github.com/powerhouse-inc/powerhouse/pull/1859))
- **monorepo:** update release branch workflow ([e9c221ab5](https://github.com/powerhouse-inc/powerhouse/commit/e9c221ab5))
- **monorepo:** merge main ([79f6472b1](https://github.com/powerhouse-inc/powerhouse/commit/79f6472b1))
- **monorepo:** empty commit to satisfy naming ([5aa18f417](https://github.com/powerhouse-inc/powerhouse/commit/5aa18f417))

### 🩹 Fixes

- **config:** set back config field to vetraUrl to avoid breaking change ([487b996a6](https://github.com/powerhouse-inc/powerhouse/commit/487b996a6))
- **monorepo:** linting and type checking ([#1776](https://github.com/powerhouse-inc/powerhouse/pull/1776))
- **monorepo:** regenerate lockfile ([7811171ff](https://github.com/powerhouse-inc/powerhouse/commit/7811171ff))
- **monorepo:** re-add nx js plugin ([d477a49d7](https://github.com/powerhouse-inc/powerhouse/commit/d477a49d7))
- **reactor-api:** moved delete drive to mutations resolvers ([888f37a3e](https://github.com/powerhouse-inc/powerhouse/commit/888f37a3e))
- **vetra:** activate codegen processor on either driveId or drive slug ([024304ed0](https://github.com/powerhouse-inc/powerhouse/commit/024304ed0))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.56 (2025-09-17)

### 🚀 Features

- first pass implementing some of the query resolvers with client ([aa76a8fea](https://github.com/powerhouse-inc/powerhouse/commit/aa76a8fea))
- making the reactor subgraph much more descriptive in failure ([190b27e82](https://github.com/powerhouse-inc/powerhouse/commit/190b27e82))
- resolvers and full tests ([134dce888](https://github.com/powerhouse-inc/powerhouse/commit/134dce888))
- **codegen:** enable localStorage by default in withDropZone hoc ([9b105aae7](https://github.com/powerhouse-inc/powerhouse/commit/9b105aae7))

### 🩹 Fixes

- updating jobinfo type with created, complete, and result ([ebb139d1a](https://github.com/powerhouse-inc/powerhouse/commit/ebb139d1a))
- switching back to checks ([9dacd70fe](https://github.com/powerhouse-inc/powerhouse/commit/9dacd70fe))
- auto-lint fixes ([960719d58](https://github.com/powerhouse-inc/powerhouse/commit/960719d58))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.55 (2025-09-16)

### 🚀 Features

- add processor configuration support to switchboard and Vetra integration ([#1859](https://github.com/powerhouse-inc/powerhouse/pull/1859))
- enable supported document types for drag and drop feature ([#1860](https://github.com/powerhouse-inc/powerhouse/pull/1860))

### 🩹 Fixes

- add default, passthrough signer ([d9e2c4f1d](https://github.com/powerhouse-inc/powerhouse/commit/d9e2c4f1d))
- **connect:** ignore drive node drag when moving it to it's current position ([4aa387814](https://github.com/powerhouse-inc/powerhouse/commit/4aa387814))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.54 (2025-09-16)

### 🚀 Features

- app module drag and drop files ([#1834](https://github.com/powerhouse-inc/powerhouse/pull/1834))
- reactor client builder ([d93875bcd](https://github.com/powerhouse-inc/powerhouse/commit/d93875bcd))
- naive implementation of subscriptions ([5ae6dd83c](https://github.com/powerhouse-inc/powerhouse/commit/5ae6dd83c))
- update app module state to support root documentTypes ([173127a5d](https://github.com/powerhouse-inc/powerhouse/commit/173127a5d))
- subscriptions now have guaranteed delivery and output errors through a centralized error handler ([d9b0c4326](https://github.com/powerhouse-inc/powerhouse/commit/d9b0c4326))
- updating docs with error handler ([4e28b0573](https://github.com/powerhouse-inc/powerhouse/commit/4e28b0573))
- adding reactor client to subgraph args ([d0a8011e6](https://github.com/powerhouse-inc/powerhouse/commit/d0a8011e6))
- add dynamic document type icons to upload progress ([#1857](https://github.com/powerhouse-inc/powerhouse/pull/1857))

### 🩹 Fixes

- linter feedback ([5219f6322](https://github.com/powerhouse-inc/powerhouse/commit/5219f6322))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.53 (2025-09-13)

### 🩹 Fixes

- **connect:** disable search bar by default ([bd05e44aa](https://github.com/powerhouse-inc/powerhouse/commit/bd05e44aa))
- **connect-e2e:** make folder selection more specific ([7800b4696](https://github.com/powerhouse-inc/powerhouse/commit/7800b4696))
- **connect-e2e:** fix flaky tests in CI ([d970bd4d3](https://github.com/powerhouse-inc/powerhouse/commit/d970bd4d3))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.52 (2025-09-12)

### 🚀 Features

- add a bunch of failing tests for the reactor-client ([8276565a8](https://github.com/powerhouse-inc/powerhouse/commit/8276565a8))
- implemented the easy, passthrough functions ([ceb692cd1](https://github.com/powerhouse-inc/powerhouse/commit/ceb692cd1))
- pulled job awaiter out of reactor client ([bd4c206a9](https://github.com/powerhouse-inc/powerhouse/commit/bd4c206a9))
- more test fixes ([12a0acd1d](https://github.com/powerhouse-inc/powerhouse/commit/12a0acd1d))
- **vetra:** add basic support to drop documents on vetra drive ([ce10ca3ee](https://github.com/powerhouse-inc/powerhouse/commit/ce10ca3ee))

### 🩹 Fixes

- linting issues ([ba85245b4](https://github.com/powerhouse-inc/powerhouse/commit/ba85245b4))
- fixes before merge ([b6bfba102](https://github.com/powerhouse-inc/powerhouse/commit/b6bfba102))
- **connect,common,reactor-browser,vetra:** resolve app name for each drive editor ([05f3a8893](https://github.com/powerhouse-inc/powerhouse/commit/05f3a8893))
- **connect-e2e:** fix failing tests ([88c3bea94](https://github.com/powerhouse-inc/powerhouse/commit/88c3bea94))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.51 (2025-09-11)

### 🚀 Features

- **codegen:** implement default error code generation from error names in PascalCase ([7554f3ede](https://github.com/powerhouse-inc/powerhouse/commit/7554f3ede))
- **document-drive:** stop git ignoring prisma files ([7e04c226b](https://github.com/powerhouse-inc/powerhouse/commit/7e04c226b))
- **monorepo:** use consistent formatting ([d2a1182c5](https://github.com/powerhouse-inc/powerhouse/commit/d2a1182c5))
- **monorepo:** use consistent separate type imports ([6fd4ac0f4](https://github.com/powerhouse-inc/powerhouse/commit/6fd4ac0f4))
- **monorepo:** make format consistent across ignores ([98469560f](https://github.com/powerhouse-inc/powerhouse/commit/98469560f))
- **reactor-api:** initial gql codegen ([3db9e9778](https://github.com/powerhouse-inc/powerhouse/commit/3db9e9778))
- **reactor-api:** generate sdk ([ec107015c](https://github.com/powerhouse-inc/powerhouse/commit/ec107015c))
- **reactor-api:** creating an sdk factory ([34151d5d2](https://github.com/powerhouse-inc/powerhouse/commit/34151d5d2))
- **reactor-api:** tests for each level of the reactor gql sdk ([1e52b761e](https://github.com/powerhouse-inc/powerhouse/commit/1e52b761e))
- **vetra:** add basic support to drop documents on vetra drive ([ce10ca3ee](https://github.com/powerhouse-inc/powerhouse/commit/ce10ca3ee))

### 🩹 Fixes

- annoyingly, you have to add ignores to the root eslint ([bb6d993bd](https://github.com/powerhouse-inc/powerhouse/commit/bb6d993bd))
- linting fixes ([27fe7d397](https://github.com/powerhouse-inc/powerhouse/commit/27fe7d397))
- whoops, adding generated code ([ffb6ca373](https://github.com/powerhouse-inc/powerhouse/commit/ffb6ca373))
- **connect,common,reactor-browser,vetra:** resolve app name for each drive editor ([05f3a8893](https://github.com/powerhouse-inc/powerhouse/commit/05f3a8893))
- **connect,reactor-browser:** remove documentModel argument on getSwitchboardUrl ([0eb514eda](https://github.com/powerhouse-inc/powerhouse/commit/0eb514eda))
- **docs:** improve document hooks documentation ([d05fcb835](https://github.com/powerhouse-inc/powerhouse/commit/d05fcb835))
- **reactor-api:** pass generated code through prettier and eslint ([1624548c0](https://github.com/powerhouse-inc/powerhouse/commit/1624548c0))
- **reactor-api:** fix import issue in generated gql ([bad71a0cc](https://github.com/powerhouse-inc/powerhouse/commit/bad71a0cc))
- **reactor-api:** adding a tools tsconfig that doesn't emit so we can support codegen.ts ([5898dc822](https://github.com/powerhouse-inc/powerhouse/commit/5898dc822))
- **reactor-api:** fixing linter issues ([5c0f1a074](https://github.com/powerhouse-inc/powerhouse/commit/5c0f1a074))
- **reactor-api:** fixing more linter issues ([aeb093426](https://github.com/powerhouse-inc/powerhouse/commit/aeb093426))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Callme-T
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter

## 5.0.0-staging.9 (2025-09-09)

### 🩹 Fixes

- **codegen:** do not overwrite existing processors ([4c74b8c4d](https://github.com/powerhouse-inc/powerhouse/commit/4c74b8c4d))
- **design-system:** improve drop zone validation and event handling ([75cd1e4c6](https://github.com/powerhouse-inc/powerhouse/commit/75cd1e4c6))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente

## 5.0.0-staging.8 (2025-09-09)

This was a version bump only, there were no code changes.

## 5.0.0-staging.7 (2025-09-09)

### 🚀 Features

- e2e integration test of document drive actions ([7b15c6c74](https://github.com/powerhouse-inc/powerhouse/commit/7b15c6c74))
- added job execution handle ([4fadd6638](https://github.com/powerhouse-inc/powerhouse/commit/4fadd6638))
- drain, block, unblock on queue ([77ad8f9bc](https://github.com/powerhouse-inc/powerhouse/commit/77ad8f9bc))
- moving to job execution handles ([f91c3a759](https://github.com/powerhouse-inc/powerhouse/commit/f91c3a759))
- tests for job execution handle ([5af69c190](https://github.com/powerhouse-inc/powerhouse/commit/5af69c190))
- update queue to use job handles ([acbe50ee1](https://github.com/powerhouse-inc/powerhouse/commit/acbe50ee1))

### 🩹 Fixes

- fix eventbus benchmarks, remove old benchmark ([5a85f498e](https://github.com/powerhouse-inc/powerhouse/commit/5a85f498e))
- automated linting fixes ([d9c123692](https://github.com/powerhouse-inc/powerhouse/commit/d9c123692))
- tons of linting fixes ([38c7981e3](https://github.com/powerhouse-inc/powerhouse/commit/38c7981e3))
- more linting issues ([5dd874517](https://github.com/powerhouse-inc/powerhouse/commit/5dd874517))
- **reactor-api:** delete drive mutation not working ([84cdf6c5a](https://github.com/powerhouse-inc/powerhouse/commit/84cdf6c5a))
- **reactor-api,reactor/browser:** update open in switchboard url ([f42897b29](https://github.com/powerhouse-inc/powerhouse/commit/f42897b29))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank

## 5.0.0-staging.6 (2025-09-08)

### 🩹 Fixes

- **reactor-browser:** use fallback when window.showSaveFilePicker is not available ([78164031c](https://github.com/powerhouse-inc/powerhouse/commit/78164031c))

### ❤️ Thank You

- acaldas @acaldas

## 5.0.0-staging.5 (2025-09-08)

This was a version bump only, there were no code changes.

## 5.0.0-staging.4 (2025-09-08)

### 🩹 Fixes

- fix eventbus benchmarks, remove old benchmark ([5a85f498e](https://github.com/powerhouse-inc/powerhouse/commit/5a85f498e))
- automated linting fixes ([d9c123692](https://github.com/powerhouse-inc/powerhouse/commit/d9c123692))
- tons of linting fixes ([38c7981e3](https://github.com/powerhouse-inc/powerhouse/commit/38c7981e3))
- more linting issues ([5dd874517](https://github.com/powerhouse-inc/powerhouse/commit/5dd874517))
- **reactor-api,reactor/browser:** update open in switchboard url ([f42897b29](https://github.com/powerhouse-inc/powerhouse/commit/f42897b29))
- **reactor-browser:** use fallback when window.showSaveFilePicker is not available ([78164031c](https://github.com/powerhouse-inc/powerhouse/commit/78164031c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 5.0.0-staging.3 (2025-09-08)

### 🩹 Fixes

- **reactor-browser:** switchboard url link ([b49ffa958](https://github.com/powerhouse-inc/powerhouse/commit/b49ffa958))

### ❤️ Thank You

- Frank

## 5.0.0-staging.2 (2025-09-05)

### 🚀 Features

- queue now queues by doc id ([afc03e437](https://github.com/powerhouse-inc/powerhouse/commit/afc03e437))
- wip dependency graph ([939e41076](https://github.com/powerhouse-inc/powerhouse/commit/939e41076))
- added robust dependency system to queue ([4aca91494](https://github.com/powerhouse-inc/powerhouse/commit/4aca91494))
- plug in persistence ([5af292734](https://github.com/powerhouse-inc/powerhouse/commit/5af292734))
- **reactor-api:** added nodeName to document query ([3d303c7e2](https://github.com/powerhouse-inc/powerhouse/commit/3d303c7e2))
- **reactor-browser:** accept documentId on dispatchActions ([a579dd53c](https://github.com/powerhouse-inc/powerhouse/commit/a579dd53c))

### 🩹 Fixes

- build errors ([97b4853a3](https://github.com/powerhouse-inc/powerhouse/commit/97b4853a3))
- **codegen:** remove .jsx imports ([880a98fe0](https://github.com/powerhouse-inc/powerhouse/commit/880a98fe0))
- **connect:** build issues ([858a36b99](https://github.com/powerhouse-inc/powerhouse/commit/858a36b99))
- **connect,reactor-browser:** add duplicated documents to reactor when nodes on a drive are duplicated ([ddb882f75](https://github.com/powerhouse-inc/powerhouse/commit/ddb882f75))
- **connect,reactor-browser:** fixed clearStorage on connect ([70588c663](https://github.com/powerhouse-inc/powerhouse/commit/70588c663))
- **connect,reactor-browser:** fixed node actions and zip upload ([3664d1238](https://github.com/powerhouse-inc/powerhouse/commit/3664d1238))
- **docs:** added zip redundancy to release notes ([3acfe1027](https://github.com/powerhouse-inc/powerhouse/commit/3acfe1027))
- **reactor-api:** node not found ([6c5a24a4e](https://github.com/powerhouse-inc/powerhouse/commit/6c5a24a4e))
- **reactor-api:** error logging on package load ([b56cf77c6](https://github.com/powerhouse-inc/powerhouse/commit/b56cf77c6))
- **reactor-browser:** do not show all nodes on drive root ([da55217c8](https://github.com/powerhouse-inc/powerhouse/commit/da55217c8))
- **reactor-browser,document-drive,design-system,common,connect:** fixed get drive sharing type logic ([134d15ded](https://github.com/powerhouse-inc/powerhouse/commit/134d15ded))
- **reactor-browser,renown,connect:** add bearer token to switchboard link ([59f35e3b7](https://github.com/powerhouse-inc/powerhouse/commit/59f35e3b7))
- **vetra:** do not include tsconfig and eslint on dist ([ace03e88a](https://github.com/powerhouse-inc/powerhouse/commit/ace03e88a))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Callme-T
- Frank

## 5.0.0-staging.1 (2025-09-04)

This was a version bump only, there were no code changes.

## 4.1.0-dev.44 (2025-09-04)

### 🚀 Features

- **reactor-browser,connect:** reduced jwt expiry time to 10seconds ([a833a71fe](https://github.com/powerhouse-inc/powerhouse/commit/a833a71fe))
- **switchboard:** updated readme ([9659cf035](https://github.com/powerhouse-inc/powerhouse/commit/9659cf035))

### 🩹 Fixes

- **connect:** only show add drive modal when apps are loaded ([b888806fb](https://github.com/powerhouse-inc/powerhouse/commit/b888806fb))
- **connect:** import document model editor styles ([#1808](https://github.com/powerhouse-inc/powerhouse/pull/1808))
- **reactor-api:** auth flow ([bbda4f2a1](https://github.com/powerhouse-inc/powerhouse/commit/bbda4f2a1))
- **reactor-api:** disable cache ([7fa75b69f](https://github.com/powerhouse-inc/powerhouse/commit/7fa75b69f))
- **reactor-api:** auth enabled false ([ff9ddfc58](https://github.com/powerhouse-inc/powerhouse/commit/ff9ddfc58))
- **renown:** automatically login after reload ([f20dc4fcc](https://github.com/powerhouse-inc/powerhouse/commit/f20dc4fcc))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.43 (2025-09-02)

### 🚀 Features

- first mutation queued... ([a678882a3](https://github.com/powerhouse-inc/powerhouse/commit/a678882a3))
- **connect,reactor-browser,renown:** added jwt expiry ([ec9483c1c](https://github.com/powerhouse-inc/powerhouse/commit/ec9483c1c))
- **reactor-api:** added renown credential auth check ([af266ae5b](https://github.com/powerhouse-inc/powerhouse/commit/af266ae5b))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 4.1.0-dev.42 (2025-09-02)

### 🩹 Fixes

- **reactor-api:** use proper issuer field ([a1e36efe0](https://github.com/powerhouse-inc/powerhouse/commit/a1e36efe0))
- **reactor-api:** use issuer field ([495a93337](https://github.com/powerhouse-inc/powerhouse/commit/495a93337))

### ❤️ Thank You

- Frank

## 4.1.0-dev.41 (2025-09-02)

### 🚀 Features

- **reactor-api:** added auth service ([a0863f6e3](https://github.com/powerhouse-inc/powerhouse/commit/a0863f6e3))

### 🩹 Fixes

- **document-drive:** add linux-musl binary target for prisma ([079b0cf04](https://github.com/powerhouse-inc/powerhouse/commit/079b0cf04))
- **document-drive:** prisma build ([7884368a2](https://github.com/powerhouse-inc/powerhouse/commit/7884368a2))
- **document-drive:** install openssl ([89f21529e](https://github.com/powerhouse-inc/powerhouse/commit/89f21529e))
- **switchboard, connect:** fetch proper tag ([79a0bc967](https://github.com/powerhouse-inc/powerhouse/commit/79a0bc967))

### ❤️ Thank You

- Frank

## 4.1.0-dev.40 (2025-09-02)

### 🩹 Fixes

- **switchboard:** added openssl to dockerfile ([a10230c60](https://github.com/powerhouse-inc/powerhouse/commit/a10230c60))

### ❤️ Thank You

- Frank

## 4.1.0-dev.39 (2025-09-02)

### 🩹 Fixes

- **switchboard:** added db push to switchboard entrypoint ([d109e4afb](https://github.com/powerhouse-inc/powerhouse/commit/d109e4afb))

### ❤️ Thank You

- Frank

## 4.1.0-dev.38 (2025-08-30)

### 🚀 Features

- implementing find facade on IReactor ([eed25fdae](https://github.com/powerhouse-inc/powerhouse/commit/eed25fdae))
- reactor find fixes ([9560ccb0f](https://github.com/powerhouse-inc/powerhouse/commit/9560ccb0f))
- gql-gen spec ([5bf2c7226](https://github.com/powerhouse-inc/powerhouse/commit/5bf2c7226))
- **reactor:** impstubbing out initial interface and types ([b74b194f9](https://github.com/powerhouse-inc/powerhouse/commit/b74b194f9))
- **reactor:** we have a reactor facade ([7a61e68ab](https://github.com/powerhouse-inc/powerhouse/commit/7a61e68ab))
- **reactor:** update mutate on facade ([aab0d7553](https://github.com/powerhouse-inc/powerhouse/commit/aab0d7553))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.37 (2025-08-29)

### 🩹 Fixes

- fixing synchronization post-refactor ([a4ad046e0](https://github.com/powerhouse-inc/powerhouse/commit/a4ad046e0))
- enhance codegen processor reliability and error handling ([8baef31d6](https://github.com/powerhouse-inc/powerhouse/commit/8baef31d6))
- **reactor-api:** loading local modules ([26e3e30a6](https://github.com/powerhouse-inc/powerhouse/commit/26e3e30a6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.36 (2025-08-28)

### 🩹 Fixes

- **reactor-browser:** root issue is creating a new array every time getSnapshot was called, plus some cleanup ([d7b5c5636](https://github.com/powerhouse-inc/powerhouse/commit/d7b5c5636))
- **reactor-browser:** we need to better handle errors in the IDB implementation, this is throwing ([42fcaf7a8](https://github.com/powerhouse-inc/powerhouse/commit/42fcaf7a8))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.35 (2025-08-27)

### 🚀 Features

- replaced vetra icon svg ([bb61632ea](https://github.com/powerhouse-inc/powerhouse/commit/bb61632ea))
- **ph-cmd:** add dynamic package detection for use command ([#1792](https://github.com/powerhouse-inc/powerhouse/pull/1792))

### 🩹 Fixes

- linter fixes ([7dc6fac02](https://github.com/powerhouse-inc/powerhouse/commit/7dc6fac02))
- fixing push/pull tests ([fa3c8f8e7](https://github.com/powerhouse-inc/powerhouse/commit/fa3c8f8e7))
- **builder-tools:** fixes based on type changes ([61f95be48](https://github.com/powerhouse-inc/powerhouse/commit/61f95be48))
- **codegen:** updating codegen with type fix ([3dc9b5f2d](https://github.com/powerhouse-inc/powerhouse/commit/3dc9b5f2d))
- **common:** type refactor for common ([c52c700b9](https://github.com/powerhouse-inc/powerhouse/commit/c52c700b9))
- **reactor-api:** updates for type shuffle ([44da3c0c2](https://github.com/powerhouse-inc/powerhouse/commit/44da3c0c2))
- **reactor-mcp:** updates for type shuffle ([fc9d5c660](https://github.com/powerhouse-inc/powerhouse/commit/fc9d5c660))
- **switchboard, ph-cli:** slight type fixes ([b1bf76f1b](https://github.com/powerhouse-inc/powerhouse/commit/b1bf76f1b))
- **vetra:** regenerate and fix all document models ([b28d67aac](https://github.com/powerhouse-inc/powerhouse/commit/b28d67aac))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.34 (2025-08-26)

### 🩹 Fixes

- updated document editor templates ([470583a25](https://github.com/powerhouse-inc/powerhouse/commit/470583a25))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.33 (2025-08-21)

### 🚀 Features

- add configurable drive preservation strategy for vetra ([aa8676a13](https://github.com/powerhouse-inc/powerhouse/commit/aa8676a13))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.32 (2025-08-21)

### 🚀 Features

- **vetra:** restrict document editor to single document type selection ([7280e5a26](https://github.com/powerhouse-inc/powerhouse/commit/7280e5a26))

### 🩹 Fixes

- updating the remainder of the projects with these breaking changes ([0d750fa6c](https://github.com/powerhouse-inc/powerhouse/commit/0d750fa6c))
- **ph-cli:** read reactor port from config file in vetra command ([efacf3ceb](https://github.com/powerhouse-inc/powerhouse/commit/efacf3ceb))
- **ph-cli:** resolve local document model loading in switchboard and vetra ([262f13035](https://github.com/powerhouse-inc/powerhouse/commit/262f13035))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.31 (2025-08-20)

### 🚀 Features

- added interactive mode to vetra command ([#1775](https://github.com/powerhouse-inc/powerhouse/pull/1775))

### 🩹 Fixes

- **codegen:** document drive templates ([0561a1991](https://github.com/powerhouse-inc/powerhouse/commit/0561a1991))
- **connect:** preserve built-in packages during hmr updates ([8398c0f06](https://github.com/powerhouse-inc/powerhouse/commit/8398c0f06))
- **reactor-browser:** get drive id from drive document ([82c785e67](https://github.com/powerhouse-inc/powerhouse/commit/82c785e67))
- **vetra:** improve error handling in document generation processors ([518c875f3](https://github.com/powerhouse-inc/powerhouse/commit/518c875f3))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

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

- use patname secret instead of github token ([db9dfd5cd](https://github.com/powerhouse-inc/powerhouse/commit/db9dfd5cd))
- proper tag for docker images ([e73e10617](https://github.com/powerhouse-inc/powerhouse/commit/e73e10617))
- use github tag properly ([95ccff4b8](https://github.com/powerhouse-inc/powerhouse/commit/95ccff4b8))
- extract metadata tags and labels for docker ([bb9c81ce7](https://github.com/powerhouse-inc/powerhouse/commit/bb9c81ce7))
- **vetra:** document handling and module resolution ([0f686b5fb](https://github.com/powerhouse-inc/powerhouse/commit/0f686b5fb))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente

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
- **codegen:** update templates ([d789b7a48](https://github.com/powerhouse-inc/powerhouse/commit/d789b7a48))
- **connect:** remove unused dep ([ef492bc7a](https://github.com/powerhouse-inc/powerhouse/commit/ef492bc7a))
- **connect:** set selected drive with drive object where possible ([f1ea28672](https://github.com/powerhouse-inc/powerhouse/commit/f1ea28672))
- **connect:** remove useless useCallbacks ([316e5155f](https://github.com/powerhouse-inc/powerhouse/commit/316e5155f))
- **connect:** remove broken electron code ([3f28d6a46](https://github.com/powerhouse-inc/powerhouse/commit/3f28d6a46))
- **connect:** remove redundant global types ([48e8ed60b](https://github.com/powerhouse-inc/powerhouse/commit/48e8ed60b))
- **connect,reactor-browser:** remove more old electron garbage ([5cd255568](https://github.com/powerhouse-inc/powerhouse/commit/5cd255568))
- **connect,state,reactor-browser:** eliminate jotai ([53b1ab759](https://github.com/powerhouse-inc/powerhouse/commit/53b1ab759))
- **connect,state,renown:** add state hook for renown ([5beb1252b](https://github.com/powerhouse-inc/powerhouse/commit/5beb1252b))
- **reactor-browser:** organize events code ([3775bc01d](https://github.com/powerhouse-inc/powerhouse/commit/3775bc01d))
- **reactor-browser:** add app config hooks ([911800ba7](https://github.com/powerhouse-inc/powerhouse/commit/911800ba7))
- **reactor-browser,connect:** remove wasted code ([5a628b3fb](https://github.com/powerhouse-inc/powerhouse/commit/5a628b3fb))
- **reactor-browser,connect:** add dispatch function to state hooks ([46ba715ec](https://github.com/powerhouse-inc/powerhouse/commit/46ba715ec))
- **reactor-browser,connect:** simplify login ([975f04b93](https://github.com/powerhouse-inc/powerhouse/commit/975f04b93))
- **reactor-browser,connect:** move connect crypto to reactor browser ([c3c913892](https://github.com/powerhouse-inc/powerhouse/commit/c3c913892))
- **reactor-browser,connect,vetra:** move state hooks into reactor browser and eliminate redundant and dead code ([30fa16f1f](https://github.com/powerhouse-inc/powerhouse/commit/30fa16f1f))
- **state:** add ph packages atoms ([e7a0bc96f](https://github.com/powerhouse-inc/powerhouse/commit/e7a0bc96f))
- **state:** use ph packages atoms ([6421fbeea](https://github.com/powerhouse-inc/powerhouse/commit/6421fbeea))
- **state:** rename to vetra packages ([c415b7dc2](https://github.com/powerhouse-inc/powerhouse/commit/c415b7dc2))
- **state:** watch document models and add to reactor when changes ([21b7f51ac](https://github.com/powerhouse-inc/powerhouse/commit/21b7f51ac))
- **state:** add fallback editor ([69b5f93be](https://github.com/powerhouse-inc/powerhouse/commit/69b5f93be))
- **state:** use default drive editor module id ([3b3062dd3](https://github.com/powerhouse-inc/powerhouse/commit/3b3062dd3))
- **state:** update readme ([df04aa491](https://github.com/powerhouse-inc/powerhouse/commit/df04aa491))
- **state,connect,reactor-browser:** eliminate jotai ([#1754](https://github.com/powerhouse-inc/powerhouse/pull/1754))
- **vetra:** added debounce ([e58427b7f](https://github.com/powerhouse-inc/powerhouse/commit/e58427b7f))

### 🩹 Fixes

- today claude taught me I could mock a package to fix circular references ([dcb83174c](https://github.com/powerhouse-inc/powerhouse/commit/dcb83174c))
- **connect:** re-add removed renown hook ([8f26d5461](https://github.com/powerhouse-inc/powerhouse/commit/8f26d5461))
- **connect:** stray log ([31c1740a9](https://github.com/powerhouse-inc/powerhouse/commit/31c1740a9))
- **connect:** stray log ([078cd6f77](https://github.com/powerhouse-inc/powerhouse/commit/078cd6f77))
- **connect:** lint issue ([ee0bf5133](https://github.com/powerhouse-inc/powerhouse/commit/ee0bf5133))
- **connect:** fixing linter and type issue ([ba3603a96](https://github.com/powerhouse-inc/powerhouse/commit/ba3603a96))
- **document-drive:** fix sync push issue ([76d1b16f7](https://github.com/powerhouse-inc/powerhouse/commit/76d1b16f7))
- **monorepo:** numerous build issues ([04349dd25](https://github.com/powerhouse-inc/powerhouse/commit/04349dd25))
- **monorepo:** bugs from wrong usage of types ([f29fbd145](https://github.com/powerhouse-inc/powerhouse/commit/f29fbd145))
- **vetra:** document type selection ([8eb33d1a8](https://github.com/powerhouse-inc/powerhouse/commit/8eb33d1a8))
- **vetra,reactor-browser,builder-tools:** use base state type ([0ed258c14](https://github.com/powerhouse-inc/powerhouse/commit/0ed258c14))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.23 (2025-08-19)

### 🚀 Features

- **vetra:** implement document type selection in editors ([bcd1879a1](https://github.com/powerhouse-inc/powerhouse/commit/bcd1879a1))

### 🩹 Fixes

- remove old commented out code ([9bb8d7665](https://github.com/powerhouse-inc/powerhouse/commit/9bb8d7665))
- apply refactoring to document-drive ([0175b6eff](https://github.com/powerhouse-inc/powerhouse/commit/0175b6eff))
- fix downstream consequences of getting rid of extended state ([2177d6e41](https://github.com/powerhouse-inc/powerhouse/commit/2177d6e41))
- **document-drive:** fixing misspelling in gql query ([35c5dc708](https://github.com/powerhouse-inc/powerhouse/commit/35c5dc708))
- **vetra:** prevent browser refresh when adding new document or editors ([ef979fc39](https://github.com/powerhouse-inc/powerhouse/commit/ef979fc39))
- **vetra:** handle optional author properties in package manifest generation ([39c64a30f](https://github.com/powerhouse-inc/powerhouse/commit/39c64a30f))
- **vetra:** build fixes for updates ([0a32b5570](https://github.com/powerhouse-inc/powerhouse/commit/0a32b5570))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.22 (2025-08-15)

### 🩹 Fixes

- **vetra:** use app id in editor app ([#1767](https://github.com/powerhouse-inc/powerhouse/pull/1767))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.21 (2025-08-15)

### 🚀 Features

- **academy:** hooks documentation ([a517eadce](https://github.com/powerhouse-inc/powerhouse/commit/a517eadce))
- **document-drive:** the DocumentAlreadyExistsErrors now tell you if it was the slug or id that is not unique ([2f1600b2d](https://github.com/powerhouse-inc/powerhouse/commit/2f1600b2d))
- **vetra:** update vetra document models with new status field ([#1765](https://github.com/powerhouse-inc/powerhouse/pull/1765))
- **vetra:** update manifest when new module is added ([#1766](https://github.com/powerhouse-inc/powerhouse/pull/1766))

### 🩹 Fixes

- fixed debug launch configuration now that source maps are in the proper locations ([c75d793ed](https://github.com/powerhouse-inc/powerhouse/commit/c75d793ed))
- **academy:** subgraphs documentation update ([4f3a024ab](https://github.com/powerhouse-inc/powerhouse/commit/4f3a024ab))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.20 (2025-08-15)

### 🚀 Features

- added app document to vetra package ([#1762](https://github.com/powerhouse-inc/powerhouse/pull/1762))

### 🩹 Fixes

- fixing all the other projects so that they build with action / operation refactor ([c185b3552](https://github.com/powerhouse-inc/powerhouse/commit/c185b3552))
- linter ([158db2a21](https://github.com/powerhouse-inc/powerhouse/commit/158db2a21))
- **codegen:** codegen update for operations change ([689df960c](https://github.com/powerhouse-inc/powerhouse/commit/689df960c))
- **document-drive:** deleting loads of duplicate tests, fixing some document drive compatibility issues ([d7212e639](https://github.com/powerhouse-inc/powerhouse/commit/d7212e639))
- **document-drive:** fix major issue where operation needed submitted to reducer options ([30453f708](https://github.com/powerhouse-inc/powerhouse/commit/30453f708))
- **document-drive:** fix remaining document-drive tests ([8265f133c](https://github.com/powerhouse-inc/powerhouse/commit/8265f133c))
- **document-model:** unit tests need to use the same objects ([e9e176ab9](https://github.com/powerhouse-inc/powerhouse/commit/e9e176ab9))
- **document-model:** remaining tests follow the same format ([81ea445bf](https://github.com/powerhouse-inc/powerhouse/commit/81ea445bf))
- **vetra:** fixing compile issues due to operation action split ([73ff839ba](https://github.com/powerhouse-inc/powerhouse/commit/73ff839ba))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.19 (2025-08-14)

### 🩹 Fixes

- **academy:** subgraph example ([ae3e24458](https://github.com/powerhouse-inc/powerhouse/commit/ae3e24458))
- **connect:** deduplicate operations fix ([d226b4d7c](https://github.com/powerhouse-inc/powerhouse/commit/d226b4d7c))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 4.1.0-dev.18 (2025-08-14)

### 🚀 Features

- added subgraph module to vetra package ([#1757](https://github.com/powerhouse-inc/powerhouse/pull/1757))
- added processor document model in vetra package ([#1758](https://github.com/powerhouse-inc/powerhouse/pull/1758))
- **vetra:** initialize PH app and set selected node on document open ([ae5f1cf05](https://github.com/powerhouse-inc/powerhouse/commit/ae5f1cf05))

### 🩹 Fixes

- overly aggressive linter fixes ([e074de3df](https://github.com/powerhouse-inc/powerhouse/commit/e074de3df))
- **builder-tools:** use correct config path when regenerating external packages ([afbe7ea04](https://github.com/powerhouse-inc/powerhouse/commit/afbe7ea04))
- **builder-tools:** support cjs requires of react and react-dom on external packages and enable sourcemap ([d9b84a69f](https://github.com/powerhouse-inc/powerhouse/commit/d9b84a69f))
- **builder-tools:** use correct config path when regenerating external packages ([4e89c38f0](https://github.com/powerhouse-inc/powerhouse/commit/4e89c38f0))
- **document-drive:** disallow document creation with invalid names ([1abeeb108](https://github.com/powerhouse-inc/powerhouse/commit/1abeeb108))
- **document-drive:** whoops -- allow spaces as well ([edb3a5243](https://github.com/powerhouse-inc/powerhouse/commit/edb3a5243))
- **reactor-api:** forward auth token from gateway to subgraphs ([e2986955c](https://github.com/powerhouse-inc/powerhouse/commit/e2986955c))
- **reactor-api:** add missing actionId field to GraphQL operation types ([12060376c](https://github.com/powerhouse-inc/powerhouse/commit/12060376c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.17 (2025-08-12)

### 🚀 Features

- refactor vetra command and remove vetra deps in connect and reactor ([#1753](https://github.com/powerhouse-inc/powerhouse/pull/1753))

### 🩹 Fixes

- downstream fixes in other package from signature change ([4048d4152](https://github.com/powerhouse-inc/powerhouse/commit/4048d4152))
- **ph-cli:** added port option to connect command ([19a84f950](https://github.com/powerhouse-inc/powerhouse/commit/19a84f950))
- **ph-cmd:** use --branch instead of --version on ph init ([29bd9b236](https://github.com/powerhouse-inc/powerhouse/commit/29bd9b236))
- **reactor-browser:** updated signature function call to new format ([4b1ce55c0](https://github.com/powerhouse-inc/powerhouse/commit/4b1ce55c0))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.16 (2025-08-12)

### 🚀 Features

- **codegen:** deduplicate operation errors and import them automatically with ts-morph ([e813b22b4](https://github.com/powerhouse-inc/powerhouse/commit/e813b22b4))

### 🩹 Fixes

- **codegen:** Unexpected BlockString ([00a31bba5](https://github.com/powerhouse-inc/powerhouse/commit/00a31bba5))

### ❤️ Thank You

- acaldas @acaldas
- Frank

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

### 🚀 Features

- **codegen,ph-cli:** add reducer code on codegen if it is set and allow --force option to overwrite reducers ([12751a8f5](https://github.com/powerhouse-inc/powerhouse/commit/12751a8f5))
- **vetra:** run switchboard in dev mode to load local document models ([741c2ceb3](https://github.com/powerhouse-inc/powerhouse/commit/741c2ceb3))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.12 (2025-08-08)

### 🩹 Fixes

- linter fixes ([56366e88d](https://github.com/powerhouse-inc/powerhouse/commit/56366e88d))
- **connect:** dynamically load vetra to avoid build issues ([98f8521c5](https://github.com/powerhouse-inc/powerhouse/commit/98f8521c5))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.11 (2025-08-07)

### 🚀 Features

- integrate package documents into reactor system ([939fe8e80](https://github.com/powerhouse-inc/powerhouse/commit/939fe8e80))
- add vetra drive editor support and fix preferredEditor handling ([bd0d9fe9f](https://github.com/powerhouse-inc/powerhouse/commit/bd0d9fe9f))
- added setSelectedNode to driveContext (remove this after integration with powerhousedao/state) ([69f0c6b3a](https://github.com/powerhouse-inc/powerhouse/commit/69f0c6b3a))
- vetra package documents and app integration ([0e4053302](https://github.com/powerhouse-inc/powerhouse/commit/0e4053302))
- **codegen:** implement generateManifest function for creating and updating Powerhouse manifests ([27b2f5650](https://github.com/powerhouse-inc/powerhouse/commit/27b2f5650))
- **connect:** integrate Vetra package documents and editors ([2ecb9bd15](https://github.com/powerhouse-inc/powerhouse/commit/2ecb9bd15))
- **ph-cli:** added verbose option to vetra command ([7310ec06c](https://github.com/powerhouse-inc/powerhouse/commit/7310ec06c))
- **switchboard:** added dev mode to switchboard where local document models are loaded ([449e730b6](https://github.com/powerhouse-inc/powerhouse/commit/449e730b6))
- **switchboard,reactor-local,reactor-api:** moved vite loader to reactor-api package ([c84f0a2a3](https://github.com/powerhouse-inc/powerhouse/commit/c84f0a2a3))
- **vetra:** add document-editor document model and refactor operations ([03017dcf2](https://github.com/powerhouse-inc/powerhouse/commit/03017dcf2))
- **vetra:** enabled support for new documents in codegen processor ([dd63103ac](https://github.com/powerhouse-inc/powerhouse/commit/dd63103ac))
- **vetra:** enabled codegen for document editors ([0f704353a](https://github.com/powerhouse-inc/powerhouse/commit/0f704353a))
- **vetra:** added vetra drive editor ([4ebafd143](https://github.com/powerhouse-inc/powerhouse/commit/4ebafd143))
- **vetra:** enhance logging and update ignored paths in server configuration ([4e1e0024b](https://github.com/powerhouse-inc/powerhouse/commit/4e1e0024b))

### 🩹 Fixes

- merge conflicts ([f003aeb76](https://github.com/powerhouse-inc/powerhouse/commit/f003aeb76))
- **document-drive:** implement documentType filter in listener manager ([5e801886e](https://github.com/powerhouse-inc/powerhouse/commit/5e801886e))
- **document-drive:** fix return value createDocument with documentType ([b4fcfecfc](https://github.com/powerhouse-inc/powerhouse/commit/b4fcfecfc))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.10 (2025-08-07)

### 🚀 Features

- **builder-tools,codegen,design-system,reactor-api:** updated document-engineering version ([e74068b43](https://github.com/powerhouse-inc/powerhouse/commit/e74068b43))
- **document-drive:** added support for adding document by providing only document type ([7e093800d](https://github.com/powerhouse-inc/powerhouse/commit/7e093800d))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.9 (2025-08-07)

### 🩹 Fixes

- **document-drive:** schema failures on server tests ([be5472ada](https://github.com/powerhouse-inc/powerhouse/commit/be5472ada))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.8 (2025-08-06)

### 🚀 Features

- **ph-cli:** add functions to update and remove CSS imports in styles.css during install/uninstall ([3643a44c8](https://github.com/powerhouse-inc/powerhouse/commit/3643a44c8))
- **reactor-api:** add delete drive mutation on system subgraph ([97640da41](https://github.com/powerhouse-inc/powerhouse/commit/97640da41))
- **switchboard,config,reactor-api:** handle auth in reactor-api ([f33c921ee](https://github.com/powerhouse-inc/powerhouse/commit/f33c921ee))

### 🩹 Fixes

- **builder-tools:** update css bundling process and html head injection ([09b508038](https://github.com/powerhouse-inc/powerhouse/commit/09b508038))
- **connect:** fix document upload regression ([2f8c97fad](https://github.com/powerhouse-inc/powerhouse/commit/2f8c97fad))
- **reactor-mcp:** improved error message when remote drive is not available ([bb6861655](https://github.com/powerhouse-inc/powerhouse/commit/bb6861655))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.7 (2025-08-06)

### 🚀 Features

- **switchboard:** added readme ([fbadfca11](https://github.com/powerhouse-inc/powerhouse/commit/fbadfca11))

### ❤️ Thank You

- Frank

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **codegen:** added generation of document model subgraphs to vetra processor ([0efa4b56e](https://github.com/powerhouse-inc/powerhouse/commit/0efa4b56e))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))
- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **state:** remove dishonest generics ([780ea4ed7](https://github.com/powerhouse-inc/powerhouse/commit/780ea4ed7))
- **state:** update readme docs ([5f060220d](https://github.com/powerhouse-inc/powerhouse/commit/5f060220d))
- **vetra:** do not include all json files in vetra ts config ([6178e7cdd](https://github.com/powerhouse-inc/powerhouse/commit/6178e7cdd))

### 🩹 Fixes

- **codegen:** added driveId to getDocuments Query ([7e84ce2df](https://github.com/powerhouse-inc/powerhouse/commit/7e84ce2df))
- **document-model:** added missing operation schemas ([5f5a7207f](https://github.com/powerhouse-inc/powerhouse/commit/5f5a7207f))
- **ph-cli:** restart services ([1c5016dd0](https://github.com/powerhouse-inc/powerhouse/commit/1c5016dd0))
- **reactor-api:** debounce updateRouter calls and improved logging ([d3ab9978c](https://github.com/powerhouse-inc/powerhouse/commit/d3ab9978c))
- **reactor/mcp:** improved mcp instructions ([c08155e7c](https://github.com/powerhouse-inc/powerhouse/commit/c08155e7c))
- **state:** formatting mistake ([d3ab58292](https://github.com/powerhouse-inc/powerhouse/commit/d3ab58292))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.5 (2025-08-05)

### 🚀 Features

- **document-model:** updated document model module ([f8827bf9f](https://github.com/powerhouse-inc/powerhouse/commit/f8827bf9f))
- **reactor-mcp:** provide generic reactor mcp instead of document-model specific ([eaeb0065b](https://github.com/powerhouse-inc/powerhouse/commit/eaeb0065b))
- **reactor-mcp:** changed addAction tool to addActions for more efficient tool calling and reduced output result to optimize token usage ([1bf58fe6e](https://github.com/powerhouse-inc/powerhouse/commit/1bf58fe6e))
- **reactor-mcp:** allow setting remote drive to connect to ([6d0516ffc](https://github.com/powerhouse-inc/powerhouse/commit/6d0516ffc))

### 🩹 Fixes

- **reactor-mcp:** made action input non restrictive ([46d48b757](https://github.com/powerhouse-inc/powerhouse/commit/46d48b757))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.4 (2025-08-02)

### 🚀 Features

- ts morph integration ([#1729](https://github.com/powerhouse-inc/powerhouse/pull/1729))

### 🩹 Fixes

- **reactor-mcp:** make test:watch the test watcher, and test the single shot, so that the root test:all does not hang ([fcb997186](https://github.com/powerhouse-inc/powerhouse/commit/fcb997186))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.3 (2025-08-01)

### 🚀 Features

- **reactor-mcp:** setup of modular reactor tools ([ceab98b08](https://github.com/powerhouse-inc/powerhouse/commit/ceab98b08))
- **reactor-mcp:** implemented remaining reactor mcp tools ([aca00a96e](https://github.com/powerhouse-inc/powerhouse/commit/aca00a96e))

### 🩹 Fixes

- linter errors from refactor ([11e8a1b16](https://github.com/powerhouse-inc/powerhouse/commit/11e8a1b16))
- **codegen:** generate actions and documents without the third type parameter ([4bf98510c](https://github.com/powerhouse-inc/powerhouse/commit/4bf98510c))
- **connect:** fix document upload regression ([6743d0061](https://github.com/powerhouse-inc/powerhouse/commit/6743d0061))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.2 (2025-07-31)

### 🚀 Features

- **reactor-mcp,document/model:** initial implementation of reactor mcp ([4eaab9ab0](https://github.com/powerhouse-inc/powerhouse/commit/4eaab9ab0))

### 🩹 Fixes

- remove operation scope from codegen output ([3127fd20d](https://github.com/powerhouse-inc/powerhouse/commit/3127fd20d))
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

### 🚀 Features

- **state:** simplify events ([39ead5990](https://github.com/powerhouse-inc/powerhouse/commit/39ead5990))

### 🩹 Fixes

- **connect:** fix fat finger mistake ([c315d95bc](https://github.com/powerhouse-inc/powerhouse/commit/c315d95bc))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.0.0-staging.7 (2025-07-26)

### 🚀 Features

- **reactor-api:** load auth config ([e1c90c4bd](https://github.com/powerhouse-inc/powerhouse/commit/e1c90c4bd))
- **state:** make all atom states derivative ([68a4bfece](https://github.com/powerhouse-inc/powerhouse/commit/68a4bfece))
- **state:** use initialized atoms to avoid exporting base atoms ([55f114672](https://github.com/powerhouse-inc/powerhouse/commit/55f114672))
- **state:** simplify hook names ([220bfbb90](https://github.com/powerhouse-inc/powerhouse/commit/220bfbb90))
- **state:** separate internal and external functions ([cd13a75aa](https://github.com/powerhouse-inc/powerhouse/commit/cd13a75aa))
- **state,connect:** remove unused code ([323155126](https://github.com/powerhouse-inc/powerhouse/commit/323155126))
- **state,connect:** cleanup hooks and clarify names ([#1710](https://github.com/powerhouse-inc/powerhouse/pull/1710))

### 🩹 Fixes

- **reactor-api:** add user to graphql context ([b20c94d03](https://github.com/powerhouse-inc/powerhouse/commit/b20c94d03))
- **reactor-api:** register pullresponder as guest ([abc323cc1](https://github.com/powerhouse-inc/powerhouse/commit/abc323cc1))
- **switchboard:** remove auth from switchboard config ([ff3410afc](https://github.com/powerhouse-inc/powerhouse/commit/ff3410afc))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.0.0-staging.6 (2025-07-25)

### 🚀 Features

- use EventQueueManager by default ([0d367ea6a](https://github.com/powerhouse-inc/powerhouse/commit/0d367ea6a))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- sync new documents and push+pull api tests ([b81096640](https://github.com/powerhouse-inc/powerhouse/commit/b81096640))
- updated remaining packages with new reactor api and bug fixes ([f8045faa1](https://github.com/powerhouse-inc/powerhouse/commit/f8045faa1))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **connect:** updated connect with new reactor interface ([8a73b62c8](https://github.com/powerhouse-inc/powerhouse/commit/8a73b62c8))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **connect:** fix drive icon ([76492b996](https://github.com/powerhouse-inc/powerhouse/commit/76492b996))
- **connect:** add comments ([31c363f99](https://github.com/powerhouse-inc/powerhouse/commit/31c363f99))
- **connect:** update document drive server hook dependency array ([51a27489a](https://github.com/powerhouse-inc/powerhouse/commit/51a27489a))
- **connect:** remove legacy document drives hook ([179478755](https://github.com/powerhouse-inc/powerhouse/commit/179478755))
- **connect:** do instant navigation when creating drive or document ([bea7bae67](https://github.com/powerhouse-inc/powerhouse/commit/bea7bae67))
- **connect:** also dedupe operations by hash ([fb26a8aca](https://github.com/powerhouse-inc/powerhouse/commit/fb26a8aca))
- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **connect:** use atom hooks instead of navigate when deleting drives ([cbbb0e688](https://github.com/powerhouse-inc/powerhouse/commit/cbbb0e688))
- **connect:** remove redundant load data hook invocation ([fdb56a1ae](https://github.com/powerhouse-inc/powerhouse/commit/fdb56a1ae))
- **connect,reactor-browser,common,state:** use new state hooks ([#1703](https://github.com/powerhouse-inc/powerhouse/pull/1703))
- **document-drive:** removed document and sync units from drive document model ([c73b11c16](https://github.com/powerhouse-inc/powerhouse/commit/c73b11c16))
- **document-drive:** initial work on retrieving sync units from storage ([a81a8a4bf](https://github.com/powerhouse-inc/powerhouse/commit/a81a8a4bf))
- **document-drive:** sync unit refactor ([c9efef89a](https://github.com/powerhouse-inc/powerhouse/commit/c9efef89a))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))
- **document-drive:** implement storage unit getter in memory storage. Adde SyncManager unit tests ([b6ba106eb](https://github.com/powerhouse-inc/powerhouse/commit/b6ba106eb))
- **document-drive:** reimplement COPY_CHILD_DOCUMENT signal handler ([729bbba25](https://github.com/powerhouse-inc/powerhouse/commit/729bbba25))
- **document-drive:** updated browser and filesystem storage adapters ([7e98ab2e2](https://github.com/powerhouse-inc/powerhouse/commit/7e98ab2e2))
- **document-drive:** added fallbacks with deprecation warnings on legacy reactor methods ([0e10883cc](https://github.com/powerhouse-inc/powerhouse/commit/0e10883cc))
- **document-drive, document-model:** event-based queue manager and typed signal handler result ([52d42156c](https://github.com/powerhouse-inc/powerhouse/commit/52d42156c))
- **prisma:** updated prisma storage adapter ([1303a2395](https://github.com/powerhouse-inc/powerhouse/commit/1303a2395))
- **reactor-browser:** add comments ([e9adb7d56](https://github.com/powerhouse-inc/powerhouse/commit/e9adb7d56))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- **state:** add hooks for drive documents ([a80c72e51](https://github.com/powerhouse-inc/powerhouse/commit/a80c72e51))
- **state:** update documents when selected drive changes ([94b893d0a](https://github.com/powerhouse-inc/powerhouse/commit/94b893d0a))
- **state:** use more descriptive hook name ([78c2b1d38](https://github.com/powerhouse-inc/powerhouse/commit/78c2b1d38))
- **state:** update initialize reactor deps array ([157b73aee](https://github.com/powerhouse-inc/powerhouse/commit/157b73aee))
- **state:** remove unused hook ([27c2ee2a1](https://github.com/powerhouse-inc/powerhouse/commit/27c2ee2a1))
- **state:** add doc comments for setter hooks ([ffc6506a0](https://github.com/powerhouse-inc/powerhouse/commit/ffc6506a0))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **state:** update package json meta ([8e8a71749](https://github.com/powerhouse-inc/powerhouse/commit/8e8a71749))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state,connect:** use window events for setting selected items ([29cc997d2](https://github.com/powerhouse-inc/powerhouse/commit/29cc997d2))

### 🩹 Fixes

- update sync unit status for unchanged documents after first pull ([3220f69eb](https://github.com/powerhouse-inc/powerhouse/commit/3220f69eb))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))
- **common:** use name on drive state in home page ([b2449c2bc](https://github.com/powerhouse-inc/powerhouse/commit/b2449c2bc))
- **connect:** update import ([467e1a48f](https://github.com/powerhouse-inc/powerhouse/commit/467e1a48f))
- **connect:** remove logs ([3267e3d57](https://github.com/powerhouse-inc/powerhouse/commit/3267e3d57))
- **connect:** remove commented out code ([605c3e72e](https://github.com/powerhouse-inc/powerhouse/commit/605c3e72e))
- **connect:** do not use selected drive id when closing node ([8d50dfccd](https://github.com/powerhouse-inc/powerhouse/commit/8d50dfccd))
- **connect:** remove should navigate hook arg ([befb67ca9](https://github.com/powerhouse-inc/powerhouse/commit/befb67ca9))
- **connect:** remove unused hook ([34885a879](https://github.com/powerhouse-inc/powerhouse/commit/34885a879))
- **document-drive:** fixed listener revisions handling ([84a13171b](https://github.com/powerhouse-inc/powerhouse/commit/84a13171b))
- **document-drive:** code fixes on tests ([5fdd4a095](https://github.com/powerhouse-inc/powerhouse/commit/5fdd4a095))
- **document-drive:** allow adding unsigned documents and fix prisma regressions ([5f96462aa](https://github.com/powerhouse-inc/powerhouse/commit/5f96462aa))
- **document-drive:** delete document from parents when it's deleted ([a53c4093d](https://github.com/powerhouse-inc/powerhouse/commit/a53c4093d))
- **document-drive:** set documentType when queueing new document ([feccd16bd](https://github.com/powerhouse-inc/powerhouse/commit/feccd16bd))
- **document-drive:** fix regression when adding multiple operations ([3a8617e79](https://github.com/powerhouse-inc/powerhouse/commit/3a8617e79))
- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **document-drive,connect,common,reactor-api:** test fixes and interface improvements ([981b638bf](https://github.com/powerhouse-inc/powerhouse/commit/981b638bf))
- **document-drive,connect,common,reactor-browser:** reimplemented support for copy node action ([0e4da7a84](https://github.com/powerhouse-inc/powerhouse/commit/0e4da7a84))
- **state:** add build command ([92dc76abe](https://github.com/powerhouse-inc/powerhouse/commit/92dc76abe))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.19 (2025-07-25)

### 🚀 Features

- use EventQueueManager by default ([0d367ea6a](https://github.com/powerhouse-inc/powerhouse/commit/0d367ea6a))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- sync new documents and push+pull api tests ([b81096640](https://github.com/powerhouse-inc/powerhouse/commit/b81096640))
- updated remaining packages with new reactor api and bug fixes ([f8045faa1](https://github.com/powerhouse-inc/powerhouse/commit/f8045faa1))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **connect:** updated connect with new reactor interface ([8a73b62c8](https://github.com/powerhouse-inc/powerhouse/commit/8a73b62c8))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **connect:** fix drive icon ([76492b996](https://github.com/powerhouse-inc/powerhouse/commit/76492b996))
- **connect:** add comments ([31c363f99](https://github.com/powerhouse-inc/powerhouse/commit/31c363f99))
- **connect:** update document drive server hook dependency array ([51a27489a](https://github.com/powerhouse-inc/powerhouse/commit/51a27489a))
- **connect:** remove legacy document drives hook ([179478755](https://github.com/powerhouse-inc/powerhouse/commit/179478755))
- **connect:** do instant navigation when creating drive or document ([bea7bae67](https://github.com/powerhouse-inc/powerhouse/commit/bea7bae67))
- **connect:** also dedupe operations by hash ([fb26a8aca](https://github.com/powerhouse-inc/powerhouse/commit/fb26a8aca))
- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **connect:** use atom hooks instead of navigate when deleting drives ([cbbb0e688](https://github.com/powerhouse-inc/powerhouse/commit/cbbb0e688))
- **connect:** remove redundant load data hook invocation ([fdb56a1ae](https://github.com/powerhouse-inc/powerhouse/commit/fdb56a1ae))
- **connect,reactor-browser,common,state:** use new state hooks ([#1703](https://github.com/powerhouse-inc/powerhouse/pull/1703))
- **document-drive:** removed document and sync units from drive document model ([c73b11c16](https://github.com/powerhouse-inc/powerhouse/commit/c73b11c16))
- **document-drive:** initial work on retrieving sync units from storage ([a81a8a4bf](https://github.com/powerhouse-inc/powerhouse/commit/a81a8a4bf))
- **document-drive:** sync unit refactor ([c9efef89a](https://github.com/powerhouse-inc/powerhouse/commit/c9efef89a))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))
- **document-drive:** implement storage unit getter in memory storage. Adde SyncManager unit tests ([b6ba106eb](https://github.com/powerhouse-inc/powerhouse/commit/b6ba106eb))
- **document-drive:** reimplement COPY_CHILD_DOCUMENT signal handler ([729bbba25](https://github.com/powerhouse-inc/powerhouse/commit/729bbba25))
- **document-drive:** updated browser and filesystem storage adapters ([7e98ab2e2](https://github.com/powerhouse-inc/powerhouse/commit/7e98ab2e2))
- **document-drive:** added fallbacks with deprecation warnings on legacy reactor methods ([0e10883cc](https://github.com/powerhouse-inc/powerhouse/commit/0e10883cc))
- **document-drive, document-model:** event-based queue manager and typed signal handler result ([52d42156c](https://github.com/powerhouse-inc/powerhouse/commit/52d42156c))
- **prisma:** updated prisma storage adapter ([1303a2395](https://github.com/powerhouse-inc/powerhouse/commit/1303a2395))
- **reactor-browser:** add comments ([e9adb7d56](https://github.com/powerhouse-inc/powerhouse/commit/e9adb7d56))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- **state:** add hooks for drive documents ([a80c72e51](https://github.com/powerhouse-inc/powerhouse/commit/a80c72e51))
- **state:** update documents when selected drive changes ([94b893d0a](https://github.com/powerhouse-inc/powerhouse/commit/94b893d0a))
- **state:** use more descriptive hook name ([78c2b1d38](https://github.com/powerhouse-inc/powerhouse/commit/78c2b1d38))
- **state:** update initialize reactor deps array ([157b73aee](https://github.com/powerhouse-inc/powerhouse/commit/157b73aee))
- **state:** remove unused hook ([27c2ee2a1](https://github.com/powerhouse-inc/powerhouse/commit/27c2ee2a1))
- **state:** add doc comments for setter hooks ([ffc6506a0](https://github.com/powerhouse-inc/powerhouse/commit/ffc6506a0))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **state:** update package json meta ([8e8a71749](https://github.com/powerhouse-inc/powerhouse/commit/8e8a71749))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state,connect:** use window events for setting selected items ([29cc997d2](https://github.com/powerhouse-inc/powerhouse/commit/29cc997d2))

### 🩹 Fixes

- update sync unit status for unchanged documents after first pull ([3220f69eb](https://github.com/powerhouse-inc/powerhouse/commit/3220f69eb))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))
- **common:** use name on drive state in home page ([b2449c2bc](https://github.com/powerhouse-inc/powerhouse/commit/b2449c2bc))
- **connect:** update import ([467e1a48f](https://github.com/powerhouse-inc/powerhouse/commit/467e1a48f))
- **connect:** remove logs ([3267e3d57](https://github.com/powerhouse-inc/powerhouse/commit/3267e3d57))
- **connect:** remove commented out code ([605c3e72e](https://github.com/powerhouse-inc/powerhouse/commit/605c3e72e))
- **connect:** do not use selected drive id when closing node ([8d50dfccd](https://github.com/powerhouse-inc/powerhouse/commit/8d50dfccd))
- **connect:** remove should navigate hook arg ([befb67ca9](https://github.com/powerhouse-inc/powerhouse/commit/befb67ca9))
- **connect:** remove unused hook ([34885a879](https://github.com/powerhouse-inc/powerhouse/commit/34885a879))
- **document-drive:** fixed listener revisions handling ([84a13171b](https://github.com/powerhouse-inc/powerhouse/commit/84a13171b))
- **document-drive:** code fixes on tests ([5fdd4a095](https://github.com/powerhouse-inc/powerhouse/commit/5fdd4a095))
- **document-drive:** allow adding unsigned documents and fix prisma regressions ([5f96462aa](https://github.com/powerhouse-inc/powerhouse/commit/5f96462aa))
- **document-drive:** delete document from parents when it's deleted ([a53c4093d](https://github.com/powerhouse-inc/powerhouse/commit/a53c4093d))
- **document-drive:** set documentType when queueing new document ([feccd16bd](https://github.com/powerhouse-inc/powerhouse/commit/feccd16bd))
- **document-drive:** fix regression when adding multiple operations ([bce76878e](https://github.com/powerhouse-inc/powerhouse/commit/bce76878e))
- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **document-drive,connect,common,reactor-api:** test fixes and interface improvements ([981b638bf](https://github.com/powerhouse-inc/powerhouse/commit/981b638bf))
- **document-drive,connect,common,reactor-browser:** reimplemented support for copy node action ([0e4da7a84](https://github.com/powerhouse-inc/powerhouse/commit/0e4da7a84))
- **state:** add build command ([92dc76abe](https://github.com/powerhouse-inc/powerhouse/commit/92dc76abe))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.18 (2025-07-24)

### 🩹 Fixes

- **document-drive:** fix regression when adding multiple operations ([3a8617e79](https://github.com/powerhouse-inc/powerhouse/commit/3a8617e79))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.17 (2025-07-23)

### 🩹 Fixes

- add release notes on correct branch ([a2d60a537](https://github.com/powerhouse-inc/powerhouse/commit/a2d60a537))
- update release notes ([f1b6a8e71](https://github.com/powerhouse-inc/powerhouse/commit/f1b6a8e71))
- **academy:** generate types command ([b8b883200](https://github.com/powerhouse-inc/powerhouse/commit/b8b883200))
- **codegen:** revert changes to resolvers template ([b96a7b899](https://github.com/powerhouse-inc/powerhouse/commit/b96a7b899))

### ❤️ Thank You

- acaldas @acaldas
- Callme-T
- Frank

## 3.3.0-dev.16 (2025-07-22)

### 🩹 Fixes

- **common,document-drive,reactor-api,reactor-browser:** revert undefined return on getDocument methods ([fc145a82a](https://github.com/powerhouse-inc/powerhouse/commit/fc145a82a))
- **connect,reactor-browser:** avoid memory leak on useDocumentDrives ([cdaba1dc3](https://github.com/powerhouse-inc/powerhouse/commit/cdaba1dc3))
- **reactor-api:** remove body-parser depecration warning ([4098ffedd](https://github.com/powerhouse-inc/powerhouse/commit/4098ffedd))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.15 (2025-07-17)

### 🩹 Fixes

- **academy:** update broken links ([cbbfe9b30](https://github.com/powerhouse-inc/powerhouse/commit/cbbfe9b30))
- **codegen:** updated subgraph template to deal with undefined return on getDocument ([7b2862a91](https://github.com/powerhouse-inc/powerhouse/commit/7b2862a91))
- **codegen:** updated processor factory to handle async processor factories ([8a562d95a](https://github.com/powerhouse-inc/powerhouse/commit/8a562d95a))
- **reactor-browser:** implement retry logic for live queries on relation errors ([7890e7d95](https://github.com/powerhouse-inc/powerhouse/commit/7890e7d95))

### ❤️ Thank You

- acaldas
- Callme-T
- Guillermo Puente @gpuente

## 3.3.0-dev.14 (2025-07-17)

### 🩹 Fixes

- **codegen:** run schema codegen without requiring kysely-pglite to be a direct dependency ([e9d901e00](https://github.com/powerhouse-inc/powerhouse/commit/e9d901e00))
- **codegen:** renamed folder to relationalDb ([42fb0ddff](https://github.com/powerhouse-inc/powerhouse/commit/42fb0ddff))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 3.3.0-dev.13 (2025-07-17)

### 🚀 Features

- **codegen,document-drive:** refactored relational processor namespace methods and updated related codegen templates ([00d4c4e87](https://github.com/powerhouse-inc/powerhouse/commit/00d4c4e87))

### ❤️ Thank You

- acaldas @acaldas

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
- **document-drive,codegen:** updated operational processor factory ([39630bfd4](https://github.com/powerhouse-inc/powerhouse/commit/39630bfd4))
- **document-drive,reactor-browser:** hash processor namespaces when writing and when querying from the relational db ([db817eeab](https://github.com/powerhouse-inc/powerhouse/commit/db817eeab))
- **reactor-browser:** update useOperationalQuery and createTypedQuery to support operational processor classes and drive IDs ([70cfe6fef](https://github.com/powerhouse-inc/powerhouse/commit/70cfe6fef))

### 🩹 Fixes

- connect build issues ([9e92db6f7](https://github.com/powerhouse-inc/powerhouse/commit/9e92db6f7))
- **builder-tools:** enhance Vite server configuration to allow serving files from current project and linked packages ([#1700](https://github.com/powerhouse-inc/powerhouse/pull/1700))
- **document-drive,reactor-browser:** use underscore instead of dashes and update loading status when there is an error ([02720ab52](https://github.com/powerhouse-inc/powerhouse/commit/02720ab52))
- **reactor-browser:** catch live query error ([c8c8f5c21](https://github.com/powerhouse-inc/powerhouse/commit/c8c8f5c21))
- **reactor-browser:** simplify useOperationalQuery by utilizing processor's query method for namespaced database ([7a07ef35c](https://github.com/powerhouse-inc/powerhouse/commit/7a07ef35c))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
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

### 🩹 Fixes

- **codegen:** update codegen with new header changes ([a933f1829](https://github.com/powerhouse-inc/powerhouse/commit/a933f1829))
- **codegen:** fix broken test ([4135c4174](https://github.com/powerhouse-inc/powerhouse/commit/4135c4174))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.3.0-dev.7 (2025-07-10)

### 🩹 Fixes

- **connect:** enable external processors by default ([010bed4ce](https://github.com/powerhouse-inc/powerhouse/commit/010bed4ce))
- **reactor-api:** update document exopect revision ([#1680](https://github.com/powerhouse-inc/powerhouse/pull/1680))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 3.3.0-dev.6 (2025-07-10)

### 🚀 Features

- **codegen:** support loading migration typescript file ([d3cc1957b](https://github.com/powerhouse-inc/powerhouse/commit/d3cc1957b))

### 🩹 Fixes

- initialize external processors with operationalStore ([532cb1bbd](https://github.com/powerhouse-inc/powerhouse/commit/532cb1bbd))
- **academy:** build ([88681db3d](https://github.com/powerhouse-inc/powerhouse/commit/88681db3d))
- **codegen:** replaced kysely with OperationalStore ([b8def2efd](https://github.com/powerhouse-inc/powerhouse/commit/b8def2efd))
- **codegen:** use inmemory pglite instance to generate db schema types ([93b075965](https://github.com/powerhouse-inc/powerhouse/commit/93b075965))
- **codegen,ph-cli:** make schema-file optional and updated generate help text ([adad303a8](https://github.com/powerhouse-inc/powerhouse/commit/adad303a8))
- **document-drive:** return missing fields in document query ([ab00dc3c1](https://github.com/powerhouse-inc/powerhouse/commit/ab00dc3c1))
- **document-model:** sort operations before retrieving the latest operation ([3fafac2a6](https://github.com/powerhouse-inc/powerhouse/commit/3fafac2a6))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Guillermo Puente @gpuente

## 3.3.0-dev.5 (2025-07-09)

### 🩹 Fixes

- **codegen:** proper import path for document types ([11352d4ae](https://github.com/powerhouse-inc/powerhouse/commit/11352d4ae))

### ❤️ Thank You

- Frank

## 3.3.0-dev.4 (2025-07-09)

### 🚀 Features

- **codegen,ph-cli:** added generate schema command ([9a5e921fb](https://github.com/powerhouse-inc/powerhouse/commit/9a5e921fb))
- **document-drive:** initial work on BaseOperationalProcessor ([40fe0ec2f](https://github.com/powerhouse-inc/powerhouse/commit/40fe0ec2f))

### 🩹 Fixes

- **codegen:** imports and instantiation ([37e6ae9ab](https://github.com/powerhouse-inc/powerhouse/commit/37e6ae9ab))
- **codegen:** schema generation ([378a666b2](https://github.com/powerhouse-inc/powerhouse/commit/378a666b2))
- **document-drive:** operational processor cleanup ([e6d0a96b6](https://github.com/powerhouse-inc/powerhouse/commit/e6d0a96b6))
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

### 🩹 Fixes

- **academy:** using the api ([833f1edde](https://github.com/powerhouse-inc/powerhouse/commit/833f1edde))
- **academy:** graphql at powerhouse update ([fea4eae24](https://github.com/powerhouse-inc/powerhouse/commit/fea4eae24))

### ❤️ Thank You

- Callme-T

## 3.3.0-dev.1 (2025-07-04)

### 🚀 Features

- renamed reactor-analytics to processor-manager ([22e7b245a](https://github.com/powerhouse-inc/powerhouse/commit/22e7b245a))
- **connect:** enable external processors ([274ca7251](https://github.com/powerhouse-inc/powerhouse/commit/274ca7251))
- **ph-cmd:** support shorthand package manager flags and fallback to lockfile resolver on ph use ([b915ccae6](https://github.com/powerhouse-inc/powerhouse/commit/b915ccae6))

### 🩹 Fixes

- **document-drive:** use async fs methods to avoid blocking the event loop ([795c486e4](https://github.com/powerhouse-inc/powerhouse/commit/795c486e4))
- **ph-cli,ph-cmd:** avoid lint error when import generated version file ([59fbddb3f](https://github.com/powerhouse-inc/powerhouse/commit/59fbddb3f))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 3.3.0-dev.0 (2025-07-02)

### 🚀 Features

- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))
- updating signing interfaces to connect document-model and connect packages ([e9b64ae77](https://github.com/powerhouse-inc/powerhouse/commit/e9b64ae77))
- on load, discard key pairs that do not match the updated algorithm ([845728953](https://github.com/powerhouse-inc/powerhouse/commit/845728953))
- starting to stub out a complete example of the analytics processor ([a84ed2dcf](https://github.com/powerhouse-inc/powerhouse/commit/a84ed2dcf))
- **academy:** add Drive Analytics documentation and examples ([daedc28a3](https://github.com/powerhouse-inc/powerhouse/commit/daedc28a3))
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
- added unique prefix to dimensions in drive and document processors ([3722a81c7](https://github.com/powerhouse-inc/powerhouse/commit/3722a81c7))
- adding a test for generating doc models, fixing a couple small pieces ([5f2edc53a](https://github.com/powerhouse-inc/powerhouse/commit/5f2edc53a))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))
- whoops, remove debug compile error ([40f1cc331](https://github.com/powerhouse-inc/powerhouse/commit/40f1cc331))
- add a longer timeout to the document model test ([5c8a9af00](https://github.com/powerhouse-inc/powerhouse/commit/5c8a9af00))
- fixing deprecated it usage ([e9d3bd4d8](https://github.com/powerhouse-inc/powerhouse/commit/e9d3bd4d8))
- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- nx should ignore this specific dependency issue, as it's just tests ([693cca500](https://github.com/powerhouse-inc/powerhouse/commit/693cca500))
- fix build ([c0cd6988d](https://github.com/powerhouse-inc/powerhouse/commit/c0cd6988d))
- **common:** fixing build and linter issues ([ef05830a4](https://github.com/powerhouse-inc/powerhouse/commit/ef05830a4))
- **connect:** added feature flag for diffs analytics ([161a3203b](https://github.com/powerhouse-inc/powerhouse/commit/161a3203b))
- **reactor-browser:** do not subscribe to query dimensions and debounce refetches triggered by subscriptions ([f6497eb30](https://github.com/powerhouse-inc/powerhouse/commit/f6497eb30))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 3.2.0-dev.9 (2025-07-02)

### 🩹 Fixes

- adding a test for generating doc models, fixing a couple small pieces ([5f2edc53a](https://github.com/powerhouse-inc/powerhouse/commit/5f2edc53a))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))
- whoops, remove debug compile error ([40f1cc331](https://github.com/powerhouse-inc/powerhouse/commit/40f1cc331))
- add a longer timeout to the document model test ([5c8a9af00](https://github.com/powerhouse-inc/powerhouse/commit/5c8a9af00))
- fixing deprecated it usage ([e9d3bd4d8](https://github.com/powerhouse-inc/powerhouse/commit/e9d3bd4d8))
- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- nx should ignore this specific dependency issue, as it's just tests ([693cca500](https://github.com/powerhouse-inc/powerhouse/commit/693cca500))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 3.2.0-dev.8 (2025-07-01)

### 🚀 Features

- **academy:** add Drive Analytics documentation and examples ([daedc28a3](https://github.com/powerhouse-inc/powerhouse/commit/daedc28a3))

### 🩹 Fixes

- added unique prefix to dimensions in drive and document processors ([3722a81c7](https://github.com/powerhouse-inc/powerhouse/commit/3722a81c7))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.2.0-dev.7 (2025-06-28)

### 🚀 Features

- starting to stub out a complete example of the analytics processor ([a84ed2dcf](https://github.com/powerhouse-inc/powerhouse/commit/a84ed2dcf))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

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
