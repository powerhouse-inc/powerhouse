## 6.2.3-dev.79 (2026-10-28)

### 🚀 Features

- ⚠️  **switchboard:** startSwitchboard(config, deps) reads only its config ([29d223ebff](https://github.com/powerhouse-inc/powerhouse/commit/29d223ebff))
- **ph-cli,codegen:** ph mcp, a stdio launcher for reactor-mcp that starts vetra on the first tool call, and generated mcp configs that run it ([c64883e693](https://github.com/powerhouse-inc/powerhouse/commit/c64883e693))
- **codegen,vetra,ph-cli,connect:** project agent guidance as a managed AGENTS.md block and skills, and eval fixes ([#3303](https://github.com/powerhouse-inc/powerhouse/pull/3303))

### 🩹 Fixes

- **codegen,shared,vetra,ph-cli,document-model,reactor,reactor-api:** scaffolds get their dependencies, migration-file works, new documents count 0 per scope, subgraphs filter plain ids, and vetra sets the preview drive's app ([6fe1ead94c](https://github.com/powerhouse-inc/powerhouse/commit/6fe1ead94c))

### ⚠️  Breaking Changes

- **switchboard:** startSwitchboard(config, deps) reads only its config  ([29d223ebff](https://github.com/powerhouse-inc/powerhouse/commit/29d223ebff))
  startSwitchboard(options) is now startSwitchboard(config, deps).
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.78 (2026-10-27)

### 🚀 Features

- **portle:** scaffold @powerhousedao/portle, the switchboard plugin that gates publication through Portle ([68ab561f7d](https://github.com/powerhouse-inc/powerhouse/commit/68ab561f7d))
- **reactor-api,switchboard:** vacuum full policy knob, no forced rewrite under load by default ([d6dcbf5cd0](https://github.com/powerhouse-inc/powerhouse/commit/d6dcbf5cd0))

### 🩹 Fixes

- **registry:** a failed tarball write no longer records its attachment ([5d3ae94bd8](https://github.com/powerhouse-inc/powerhouse/commit/5d3ae94bd8))
- **reactor-api:** the one-time VACUUM FULL is off by default; quiet and forced are opt-ins ([fd7c19e313](https://github.com/powerhouse-inc/powerhouse/commit/fd7c19e313))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.77 (2026-10-26)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.76 (2026-10-25)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.75 (2026-10-24)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** ph host check behind FEATURE_UNIFORM_RUNNERS_ENABLED ([3a41a17991](https://github.com/powerhouse-inc/powerhouse/commit/3a41a17991))
- **codegen:** ph migrate moves connect's theme overrides from style.css to the host stylesheet ([b113414352](https://github.com/powerhouse-inc/powerhouse/commit/b113414352))

### 🩹 Fixes

- **builder-tools:** the worker-safe vendor check parses imports, so import-like text in strings and comments no longer counts ([9d3e167f4b](https://github.com/powerhouse-inc/powerhouse/commit/9d3e167f4b))
- **reactor-browser,connect,reactor-monitor:** the worker reactor loads a registry package's module graph, and packages added or updated after boot ([5348ffa792](https://github.com/powerhouse-inc/powerhouse/commit/5348ffa792))
- **powerhouse-vetra-packages:** the document-model editor writes nothing on open unless the model is blank ([f5dc33dd0a](https://github.com/powerhouse-inc/powerhouse/commit/f5dc33dd0a))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.74 (2026-10-24)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** ph host check behind FEATURE_UNIFORM_RUNNERS_ENABLED ([3a41a17991](https://github.com/powerhouse-inc/powerhouse/commit/3a41a17991))
- **codegen:** ph migrate moves connect's theme overrides from style.css to the host stylesheet ([b113414352](https://github.com/powerhouse-inc/powerhouse/commit/b113414352))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.73 (2026-10-23)

### 🩹 Fixes

- **builder-tools:** the worker-safe vendor check parses imports, so import-like text in strings and comments no longer counts ([9d3e167f4b](https://github.com/powerhouse-inc/powerhouse/commit/9d3e167f4b))
- **reactor-browser,connect,reactor-monitor:** the worker reactor loads a registry package's module graph, and packages added or updated after boot ([5348ffa792](https://github.com/powerhouse-inc/powerhouse/commit/5348ffa792))
- **powerhouse-vetra-packages:** the document-model editor writes nothing on open unless the model is blank ([f5dc33dd0a](https://github.com/powerhouse-inc/powerhouse/commit/f5dc33dd0a))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.72 (2026-10-23)

### 🚀 Features

- **shared,connect,codegen:** ph init and ph migrate give a project the router as a peer at connect's version, and the host stylesheet shows light and dark tokens ([0829546eaf](https://github.com/powerhouse-inc/powerhouse/commit/0829546eaf))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.71 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))
- **desktop:** vendor local package tarballs into the stack (PH_DESKTOP_LOCAL_PACKAGES) ([000bc39d10](https://github.com/powerhouse-inc/powerhouse/commit/000bc39d10))
- **codegen:** pure builders for generated outputs.js/.d.ts and the hosts typing files ([be3c35122f](https://github.com/powerhouse-inc/powerhouse/commit/be3c35122f))
- **connect,desktop:** layered backgrounds for the home screen and the loading page ([9ffe4915b4](https://github.com/powerhouse-inc/powerhouse/commit/9ffe4915b4))
- **host-core,ph-cli,switchboard,connect,codegen:** workflow plugins declare the drive and the link ([ab37f30600](https://github.com/powerhouse-inc/powerhouse/commit/ab37f30600))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.70 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.69 (2026-10-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.64 (2026-10-20)

### 🩹 Fixes

- **reactor-api:** complete a removed subgraph's supergraph SSE streams ([9eac161e3c](https://github.com/powerhouse-inc/powerhouse/commit/9eac161e3c))
- **reactor-api:** complete a replaced or removed subgraph's SSE streams ([2cacef8d1d](https://github.com/powerhouse-inc/powerhouse/commit/2cacef8d1d))
- **releases:** parse pnpm publish output when packed paths contain braces ([a30562aeca](https://github.com/powerhouse-inc/powerhouse/commit/a30562aeca))

### 🔥 Performance

- **ph-cli,docker:** serve precompressed wasm and data in connect preview and nginx ([85db6ff307](https://github.com/powerhouse-inc/powerhouse/commit/85db6ff307))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.63 (2026-10-18)

### 🚀 Features

- **connect,builder-tools:** prerendered app shell, self-hosted font and module warm-up ([cf9b61ef86](https://github.com/powerhouse-inc/powerhouse/commit/cf9b61ef86))

### 🩹 Fixes

- **ph-cli,docker,codegen:** serve connect under a base path ([fe07684e12](https://github.com/powerhouse-inc/powerhouse/commit/fe07684e12))

### 🔥 Performance

- **connect:** trim connect's boot imports and break its barrel cycles ([dde9430d74](https://github.com/powerhouse-inc/powerhouse/commit/dde9430d74))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.62 (2026-10-16)

### 🚀 Features

- **connect,builder-tools:** prerendered app shell, self-hosted font and module warm-up ([cf9b61ef86](https://github.com/powerhouse-inc/powerhouse/commit/cf9b61ef86))

### 🩹 Fixes

- **ph-cli,docker,codegen:** serve connect under a base path ([fe07684e12](https://github.com/powerhouse-inc/powerhouse/commit/fe07684e12))

### 🔥 Performance

- **connect:** trim connect's boot imports and break its barrel cycles ([dde9430d74](https://github.com/powerhouse-inc/powerhouse/commit/dde9430d74))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.61 (2026-10-16)

### 🚀 Features

- **desktop:** builder-owned desktop identity via a generated tauri shell ([8b87d55db7](https://github.com/powerhouse-inc/powerhouse/commit/8b87d55db7))

### ❤️ Thank You

- Claude Opus 4.8
- Wouter Kampmann

## 6.2.3-dev.60 (2026-10-15)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.59 (2026-10-15)

### 🚀 Features

- **connect,vetra-studio:** browser plugin pipeline over the served composition (R3.2) + the studio plugins (R4 start) ([8fb91868da](https://github.com/powerhouse-inc/powerhouse/commit/8fb91868da))
- **switchboard:** plugin pipeline scaffold for the subsystem carve (R2.1) ([042cd5a93c](https://github.com/powerhouse-inc/powerhouse/commit/042cd5a93c))

### ❤️ Thank You

- Claude Fable 5
- Wouter Kampmann

## 6.2.3-dev.58 (2026-10-14)

### 🩹 Fixes

- **registry:** declare reactor-workflow — undeclared dep broke test shard 1 ([37660d7b04](https://github.com/powerhouse-inc/powerhouse/commit/37660d7b04))
- **release:** the desktop build filter belongs in scripts.build — the prior commit amended test:ci ([2cbbff231c](https://github.com/powerhouse-inc/powerhouse/commit/2cbbff231c))
- **release:** build @powerhousedao/desktop — dev.57 shipped an empty tarball; guard the filter list ([9103896840](https://github.com/powerhouse-inc/powerhouse/commit/9103896840))
- **clint:** powerhousedao packages are regular deps, not peers — npm ERESOLVE on scaffold install ([6de7d0d7c6](https://github.com/powerhouse-inc/powerhouse/commit/6de7d0d7c6))

### ❤️ Thank You

- Claude Fable 5
- Wouter Kampmann

## 6.2.3-dev.57 (2026-10-14)

### 🚀 Features

- **desktop:** @powerhousedao/desktop — the desktop runner productized (P6.1-P6.5) ([58ce9a0d4a](https://github.com/powerhouse-inc/powerhouse/commit/58ce9a0d4a))
- **clint,ph-cli:** one static-serve implementation — connect-server deleted (P5.7) ([c35b0341c6](https://github.com/powerhouse-inc/powerhouse/commit/c35b0341c6))
- **clint:** mastra-runner — remote reactor attach + OpenAI-compatible agent API (P5.5, P5.6) ([532cb2128f](https://github.com/powerhouse-inc/powerhouse/commit/532cb2128f))
- **clint:** port the ph-clint framework — core, integrations, TUI, testing + full suite (P5.2, P5.3) ([d1ace0688e](https://github.com/powerhouse-inc/powerhouse/commit/d1ace0688e))
- **clint:** scaffold @powerhousedao/clint — the ph-clint port lands here (P5.1) ([c7a3435588](https://github.com/powerhouse-inc/powerhouse/commit/c7a3435588))
- **host-core,ph-cli:** structural multi-reactor — backends drive the routing client (P4.1-P4.3) ([e7c71ca7ac](https://github.com/powerhouse-inc/powerhouse/commit/e7c71ca7ac))
- **host-core:** shared zod host schemas; bridges adopt strict reactor/profile (P2.1, P2.2) ([1bd9db67be](https://github.com/powerhouse-inc/powerhouse/commit/1bd9db67be))
- **vetra:** lint project subgraphs for types core or the package's models own ([6855c0ed91](https://github.com/powerhouse-inc/powerhouse/commit/6855c0ed91))
- **host-core:** generic run records and pid-probe (P1.3, P1.5, P1.6 foundation) ([9a6affd46e](https://github.com/powerhouse-inc/powerhouse/commit/9a6affd46e))
- **host-core:** move drive projection primitives; add projectDrivesIntoConnect (P1.4) ([6cd1d8ee6e](https://github.com/powerhouse-inc/powerhouse/commit/6cd1d8ee6e))
- **host-core:** scaffold @powerhousedao/host-core (P1.1) ([c7d9b415b5](https://github.com/powerhouse-inc/powerhouse/commit/c7d9b415b5))
- **ph-cli:** uniform-runners flag helper and host.js loader (P0.1, P0.2, P0.12) ([4c04163009](https://github.com/powerhouse-inc/powerhouse/commit/4c04163009))

### 🩹 Fixes

- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **tsconfig:** dedup host-core from root references now that ph-cli references it (P1.2) ([988cbc574c](https://github.com/powerhouse-inc/powerhouse/commit/988cbc574c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.56 (2026-10-14)

### 🚀 Features

- **desktop:** @powerhousedao/desktop — the desktop runner productized (P6.1-P6.5) ([58ce9a0d4a](https://github.com/powerhouse-inc/powerhouse/commit/58ce9a0d4a))
- **clint,ph-cli:** one static-serve implementation — connect-server deleted (P5.7) ([c35b0341c6](https://github.com/powerhouse-inc/powerhouse/commit/c35b0341c6))
- **clint:** mastra-runner — remote reactor attach + OpenAI-compatible agent API (P5.5, P5.6) ([532cb2128f](https://github.com/powerhouse-inc/powerhouse/commit/532cb2128f))
- **clint:** port the ph-clint framework — core, integrations, TUI, testing + full suite (P5.2, P5.3) ([d1ace0688e](https://github.com/powerhouse-inc/powerhouse/commit/d1ace0688e))
- **clint:** scaffold @powerhousedao/clint — the ph-clint port lands here (P5.1) ([c7a3435588](https://github.com/powerhouse-inc/powerhouse/commit/c7a3435588))
- **host-core,ph-cli:** structural multi-reactor — backends drive the routing client (P4.1-P4.3) ([e7c71ca7ac](https://github.com/powerhouse-inc/powerhouse/commit/e7c71ca7ac))
- **host-core:** shared zod host schemas; bridges adopt strict reactor/profile (P2.1, P2.2) ([1bd9db67be](https://github.com/powerhouse-inc/powerhouse/commit/1bd9db67be))
- **vetra:** lint project subgraphs for types core or the package's models own ([6855c0ed91](https://github.com/powerhouse-inc/powerhouse/commit/6855c0ed91))
- **host-core:** generic run records and pid-probe (P1.3, P1.5, P1.6 foundation) ([9a6affd46e](https://github.com/powerhouse-inc/powerhouse/commit/9a6affd46e))
- **host-core:** move drive projection primitives; add projectDrivesIntoConnect (P1.4) ([6cd1d8ee6e](https://github.com/powerhouse-inc/powerhouse/commit/6cd1d8ee6e))
- **host-core:** scaffold @powerhousedao/host-core (P1.1) ([c7d9b415b5](https://github.com/powerhouse-inc/powerhouse/commit/c7d9b415b5))
- **ph-cli:** uniform-runners flag helper and host.js loader (P0.1, P0.2, P0.12) ([4c04163009](https://github.com/powerhouse-inc/powerhouse/commit/4c04163009))

### 🩹 Fixes

- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **tsconfig:** dedup host-core from root references now that ph-cli references it (P1.2) ([988cbc574c](https://github.com/powerhouse-inc/powerhouse/commit/988cbc574c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.55 (2026-10-13)

### 🚀 Features

- **reactor-monitor:** build remote inspection queries from the wire fields ([d16699f94e](https://github.com/powerhouse-inc/powerhouse/commit/d16699f94e))

### 🩹 Fixes

- **reactor-workflow:** upload a step's output as a file-backed Blob ([8c943bfbeb](https://github.com/powerhouse-inc/powerhouse/commit/8c943bfbeb))
- **reactor-attachments:** hash and upload attachments without reading the whole file into memory ([f6532d6449](https://github.com/powerhouse-inc/powerhouse/commit/f6532d6449))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.54 (2026-10-12)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.53 (2026-10-11)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.52 (2026-10-10)

### 🚀 Features

- **ph-cli:** keep native and WebAssembly dependencies external and list them as externalDependencies ([e3b616e67b](https://github.com/powerhouse-inc/powerhouse/commit/e3b616e67b))
- **reactor-router:** the routing IReactorClient over IRoutableBackend ([772aefe6ec](https://github.com/powerhouse-inc/powerhouse/commit/772aefe6ec))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.51 (2026-10-10)

### 🚀 Features

- **ph-cli:** keep native and WebAssembly dependencies external and list them as externalDependencies ([e3b616e67b](https://github.com/powerhouse-inc/powerhouse/commit/e3b616e67b))
- **reactor-router:** the routing IReactorClient over IRoutableBackend ([772aefe6ec](https://github.com/powerhouse-inc/powerhouse/commit/772aefe6ec))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.50 (2026-10-09)

### 🚀 Features

- **reactor-workflow:** trace runs, steps, workers and reactor calls with a host-supplied tracer and meter ([d42c5d9053](https://github.com/powerhouse-inc/powerhouse/commit/d42c5d9053))

### 🩹 Fixes

- **registry:** stop Verdaccio dropping a package write when Windows refuses the rename ([79636fd438](https://github.com/powerhouse-inc/powerhouse/commit/79636fd438))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.49 (2026-10-08)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.48 (2026-10-07)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.47 (2026-10-07)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.46 (2026-10-07)

### 🚀 Features

- **connect:** load local project models in the reactor worker ([6e2929ce60](https://github.com/powerhouse-inc/powerhouse/commit/6e2929ce60))

### 🩹 Fixes

- **builder-tools:** make the worker bundle survive consumer projects ([6361a66b6d](https://github.com/powerhouse-inc/powerhouse/commit/6361a66b6d))
- **builder-tools:** assert the vendor-dir mode only where modes exist ([f47c32a020](https://github.com/powerhouse-inc/powerhouse/commit/f47c32a020))

### ❤️ Thank You

- Claude Fable 5
- Wouter Kampmann

## 6.2.3-dev.45 (2026-10-06)

### 🚀 Features

- ⚠️  **reactor-workflow:** let any workflow piece read and write documents through the reactor ([fcccf0dfca](https://github.com/powerhouse-inc/powerhouse/commit/fcccf0dfca))

### 🩹 Fixes

- **pglite:** bound the old-dir removal after conversion ([0aef46f0ca](https://github.com/powerhouse-inc/powerhouse/commit/0aef46f0ca))
- **pglite:** open files read-write for the tree sync ([ce0fa23af5](https://github.com/powerhouse-inc/powerhouse/commit/ce0fa23af5))
- **switchboard:** resolve the legacy pg_dump wasm path on Windows ([c35148183a](https://github.com/powerhouse-inc/powerhouse/commit/c35148183a))

### 🔥 Performance

- **pglite:** sync the tree once after initdb, conversion and migration ([9ec8caf970](https://github.com/powerhouse-inc/powerhouse/commit/9ec8caf970))

### ⚠️  Breaking Changes

- **reactor-workflow:** let any workflow piece read and write documents through the reactor  ([fcccf0dfca](https://github.com/powerhouse-inc/powerhouse/commit/fcccf0dfca))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.44 (2026-10-06)

### 🩹 Fixes

- **analytics:** anchor periods and timestamps to UTC ([#3175](https://github.com/powerhouse-inc/powerhouse/pull/3175))
- **reactor:** make the reactor suite pass on Windows ([#3171](https://github.com/powerhouse-inc/powerhouse/pull/3171))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5 (1M context)
- Wouter Kampmann

## 6.2.3-dev.43 (2026-10-05)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.42 (2026-10-04)

### 🩹 Fixes

- **registry:** stop a tarball stream's late fstat from crashing the registry ([84f56c54bf](https://github.com/powerhouse-inc/powerhouse/commit/84f56c54bf))
- **reactor:** let executor workers load document models from the registry ([8ae1911d44](https://github.com/powerhouse-inc/powerhouse/commit/8ae1911d44))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.41 (2026-10-03)

### 🩹 Fixes

- **registry:** stop a tarball stream's late fstat from crashing the registry ([84f56c54bf](https://github.com/powerhouse-inc/powerhouse/commit/84f56c54bf))
- **reactor:** let executor workers load document models from the registry ([8ae1911d44](https://github.com/powerhouse-inc/powerhouse/commit/8ae1911d44))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.40 (2026-10-02)

### 🩹 Fixes

- **document-model:** leave unmatched @tokens in log messages as written ([0538ea019c](https://github.com/powerhouse-inc/powerhouse/commit/0538ea019c))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.39 (2026-10-02)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.38 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.37 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.36 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.35 (2026-10-01)

### 🚀 Features

- ⚠️  **registry:** serve every replica from Postgres and S3, processing publishes in a worker ([0d25d5fe35](https://github.com/powerhouse-inc/powerhouse/commit/0d25d5fe35))
- **switchboard:** run the privacy add-on behind PH_PRIVACY_ENABLED ([38c9a43856](https://github.com/powerhouse-inc/powerhouse/commit/38c9a43856))
- **reactor-privacy:** erase requested documents on a serial schedule ([f4f31289a1](https://github.com/powerhouse-inc/powerhouse/commit/f4f31289a1))
- **reactor-privacy:** serve disclosure and erasure to supreme admins only ([7a6b5232cb](https://github.com/powerhouse-inc/powerhouse/commit/7a6b5232cb))
- **reactor-privacy:** scaffold the package and its migration ledger ([152ecff77b](https://github.com/powerhouse-inc/powerhouse/commit/152ecff77b))
- **reactor-drive:** erase a purged document's nodes in NodeProcessor ([5a608e73bf](https://github.com/powerhouse-inc/powerhouse/commit/5a608e73bf))
- **reactor-attachments:** delete a purged document's attachment references ([4121c83347](https://github.com/powerhouse-inc/powerhouse/commit/4121c83347))

### 🩹 Fixes

- **reactor:** a drive's purge does not require a live former member ([e8266b1035](https://github.com/powerhouse-inc/powerhouse/commit/e8266b1035))
- **reactor-privacy:** warn and record lastError while a leaked purge blocks dispatch ([cd6fe4f022](https://github.com/powerhouse-inc/powerhouse/commit/cd6fe4f022))
- **reactor-privacy:** reopen every failed request with no failed item each tick ([d9c19c3837](https://github.com/powerhouse-inc/powerhouse/commit/d9c19c3837))
- **reactor-api:** ignore polled refusals of an unknown kind ([aac4a3e752](https://github.com/powerhouse-inc/powerhouse/commit/aac4a3e752))
- **reactor-api:** fail a poll with a recoverable code when a refusal is not recorded ([3ab1c92f7b](https://github.com/powerhouse-inc/powerhouse/commit/3ab1c92f7b))
- **reactor:** keep a polled marker refusal only when the marker was owed ([07cae595da](https://github.com/powerhouse-inc/powerhouse/commit/07cae595da))
- **reactor:** persist a purge refusal only from a MARKER_REFUSED dead letter ([ef2c3f4729](https://github.com/powerhouse-inc/powerhouse/commit/ef2c3f4729))

### 🔥 Performance

- **reactor-privacy:** dispatch the next purge without rescanning the backlog ([5de3703ebf](https://github.com/powerhouse-inc/powerhouse/commit/5de3703ebf))

### ⚠️  Breaking Changes

- **registry:** serve every replica from Postgres and S3, processing publishes in a worker  ([0d25d5fe35](https://github.com/powerhouse-inc/powerhouse/commit/0d25d5fe35))
  /packages and /pieces return pages ({items,total,limit,offset,hasMore}) instead of full arrays, and piece bundles move to /-/pieces/bundled/<name>/<version>.tgz.

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.34 (2026-09-30)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.33 (2026-09-30)

### 🚀 Features

- **reactor:** add catch-up operator tools and observability ([5722d7836](https://github.com/powerhouse-inc/powerhouse/commit/5722d7836))

### 🩹 Fixes

- **reactor:** claim a batch for each read model as it queues ([c09b1de2a](https://github.com/powerhouse-inc/powerhouse/commit/c09b1de2a))
- **reactor:** settle a probe on its own xid, not on an empty xip ([4e0f0dab9](https://github.com/powerhouse-inc/powerhouse/commit/4e0f0dab9))
- **reactor:** leave a stream to the next sweep while its live pass runs ([53112bad4](https://github.com/powerhouse-inc/powerhouse/commit/53112bad4))
- **reactor:** start a head registration at the sequence head ([e06581849](https://github.com/powerhouse-inc/powerhouse/commit/e06581849))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.32 (2026-09-29)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.31 (2026-09-29)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.30 (2026-09-29)

### 🩹 Fixes

- **deps:** load cmd-ts's ESM build under bun, which fails to require chalk from its CJS build ([749528c71](https://github.com/powerhouse-inc/powerhouse/commit/749528c71))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.29 (2026-09-28)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.28 (2026-09-28)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.27 (2026-09-28)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.26 (2026-09-26)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.25 (2026-09-25)

### 🚀 Features

- **workflow:** show run data in a lazy-loaded tree with copyable references, and scope the connection picker to the drive ([1d286f4a6](https://github.com/powerhouse-inc/powerhouse/commit/1d286f4a6))

### 🩹 Fixes

- **ci:** let the release skip the transpiler TypeScript 7 broke ([#36306](https://github.com/powerhouse-inc/powerhouse/issues/36306))

### ❤️ Thank You

- acaldas
- Guillermo Puente @gpuente

## 6.2.3-dev.24 (2026-09-25)

### 🚀 Features

- **reactor:** action signature integrity ([#3088](https://github.com/powerhouse-inc/powerhouse/pull/3088), [#2894](https://github.com/powerhouse-inc/powerhouse/issues/2894), [#7](https://github.com/powerhouse-inc/powerhouse/issues/7))

### 🩹 Fixes

- **workflow:** build after powerhouse-vetra-packages so their tsc --build runs never overlap ([#3101](https://github.com/powerhouse-inc/powerhouse/pull/3101))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.23 (2026-09-24)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.22 (2026-09-23)

### 🩹 Fixes

- **ci:** slice the duration-watch baseline in jq, not through head ([73db497e0](https://github.com/powerhouse-inc/powerhouse/commit/73db497e0))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.21 (2026-09-22)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.20 (2026-09-22)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.19 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.18 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.17 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.16 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.15 (2026-09-20)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.14 (2026-09-19)

### 🚀 Features

- **ph-cli:** build pieces on ph build ([3913b0796](https://github.com/powerhouse-inc/powerhouse/commit/3913b0796))
- **doc-harness:** serve rendered reports and transcripts from mastra studio ([fd64a4661](https://github.com/powerhouse-inc/powerhouse/commit/fd64a4661))
- **doc-harness:** workflows, steps, and the run/resume/inspect commands ([0e116d226](https://github.com/powerhouse-inc/powerhouse/commit/0e116d226))
- **doc-harness:** pilot task catalog with pinned recipe inputs ([74bc26129](https://github.com/powerhouse-inc/powerhouse/commit/74bc26129))
- **doc-harness:** workspace wiring and core schemas for the docs-validation harness ([5c591ac69](https://github.com/powerhouse-inc/powerhouse/commit/5c591ac69))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.13 (2026-09-18)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.12 (2026-09-17)

### 🚀 Features

- **switchboard:** own the workflow runtime, feed it through a read model, and take workflows out of reactor-api ([#3042](https://github.com/powerhouse-inc/powerhouse/issues/3042))
- **reactor-workflow:** the workflow engine, composed in reactor-api behind the workflows flag ([cb807bf5d](https://github.com/powerhouse-inc/powerhouse/commit/cb807bf5d))
- **workflow:** the Connect-loaded workflow package, and the workflows flag in reactor-api ([0953fc254](https://github.com/powerhouse-inc/powerhouse/commit/0953fc254))
- **pieces-framework:** vendor the Activepieces piece framework as a Powerhouse package ([3da5dbea8](https://github.com/powerhouse-inc/powerhouse/commit/3da5dbea8))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.11 (2026-09-17)

### 🚀 Features

- **reactor-browser,design-system:** keep the legacy useDocumentOperations and RevisionHistory shapes as deprecated aliases ([6de05e632](https://github.com/powerhouse-inc/powerhouse/commit/6de05e632))

### 🩹 Fixes

- **design-system,connect:** end the history walk on a failed page and show what loaded ([95f815b46](https://github.com/powerhouse-inc/powerhouse/commit/95f815b46))
- hold the timeline revision until the global history is loaded, default to the global scope, hide paging mid-load ([80c3b1289](https://github.com/powerhouse-inc/powerhouse/commit/80c3b1289))
- **reactor-browser:** page operations through nextCursor and invalidate alias keys ([ccb965869](https://github.com/powerhouse-inc/powerhouse/commit/ccb965869))

### 🔥 Performance

- **design-system,connect:** wait for the whole history before rendering the timeline, yield between pages, fetch 500 per page ([86435721c](https://github.com/powerhouse-inc/powerhouse/commit/86435721c))

### ❤️ Thank You

- Frank Pfeift

## 6.2.3-dev.10 (2026-09-16)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.9 (2026-09-15)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.8 (2026-09-15)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.7 (2026-09-14)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.6 (2026-09-14)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.5 (2026-09-13)

### 🩹 Fixes

- **reactor-api:** warn at boot when auth is on but anonymous is still admitted ([84605330c](https://github.com/powerhouse-inc/powerhouse/commit/84605330c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5

## 6.2.3-dev.4 (2026-09-12)

### 🩹 Fixes

- **reactor-api:** warn at boot when auth is on but anonymous is still admitted ([84605330c](https://github.com/powerhouse-inc/powerhouse/commit/84605330c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5

## 6.2.3-dev.3 (2026-09-11)

### 🚀 Features

- **reactor-api:** add in-process stitching gateway adapter ([#1565](https://github.com/powerhouse-inc/powerhouse/issues/1565))

### 🩹 Fixes

- **claude:** bench-loop offers the after-record a fix produced instead of counting its FIXED citation as read ([c4b4690be](https://github.com/powerhouse-inc/powerhouse/commit/c4b4690be))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- froid1911

## 6.2.3-dev.2 (2026-09-10)

### 🩹 Fixes

- **ci:** roll out prod registry on production releases ([354085855](https://github.com/powerhouse-inc/powerhouse/commit/354085855))
- **switchboard-lb:** keep a webhook token out of the logs and traces ([5cfdb6e93](https://github.com/powerhouse-inc/powerhouse/commit/5cfdb6e93))

### ❤️ Thank You

- acaldas
- froid1911

## 6.2.3-dev.1 (2026-09-10)

### 🚀 Features

- **shared:** add install-spec parsing and update-target resolution ([#2357](https://github.com/powerhouse-inc/powerhouse/issues/2357))

### ❤️ Thank You

- froid1911

## 6.2.3-dev.0 (2026-09-10)

### 🚀 Features

- **switchboard-lb:** route the webhook and package-REST classes ([df18b32a7](https://github.com/powerhouse-inc/powerhouse/commit/df18b32a7))

### 🩹 Fixes

- **docker:** make the switchboard load harness buildable again ([cb65fac68](https://github.com/powerhouse-inc/powerhouse/commit/cb65fac68))

### ❤️ Thank You

- acaldas

## 6.2.2-dev.88 (2026-09-10)

### 🚀 Features

- add standalone stale-bot tool (ported sweep + headless driver) ([ed2846a6a](https://github.com/powerhouse-inc/powerhouse/commit/ed2846a6a))

### 🩹 Fixes

- use labels[] in stale-bot addLabel (label field 422s) ([f40b4e0ad](https://github.com/powerhouse-inc/powerhouse/commit/f40b4e0ad))

### ❤️ Thank You

- froid1911

## 6.2.2-dev.87 (2026-09-09)

### 🩹 Fixes

- **ci:** test package managers against pnpm latest ([#2990](https://github.com/powerhouse-inc/powerhouse/issues/2990))

### ❤️ Thank You

- froid1911

## 6.2.2-dev.86 (2026-09-09)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.85 (2026-09-09)

### 🚀 Features

- **reactor-api:** prefill GraphiQL explorer from explorerURLState ([f609aaaa0](https://github.com/powerhouse-inc/powerhouse/commit/f609aaaa0))

### 🩹 Fixes

- **ci:** move @jsr registry mapping to the root .npmrc ([56092b254](https://github.com/powerhouse-inc/powerhouse/commit/56092b254))
- **reactor-browser:** remove duplicate graphql dependency and clean lockfile ([472c42a1c](https://github.com/powerhouse-inc/powerhouse/commit/472c42a1c))
- **reactor-browser:** prefill Switchboard link with document-scoped query ([db58970d3](https://github.com/powerhouse-inc/powerhouse/commit/db58970d3))

### ❤️ Thank You

- froid1911

## 6.2.2-dev.84 (2026-09-09)

### 🚀 Features

- download drive folders as zip archives with round-trip import ([#134](https://github.com/powerhouse-inc/powerhouse/pull/134), [#2986](https://github.com/powerhouse-inc/powerhouse/pull/2986))
- **scripts:** add new-worktree.sh to create ready-to-test worktrees ([#2982](https://github.com/powerhouse-inc/powerhouse/pull/2982))

### 🩹 Fixes

- **academy:** pin cross-env instead of catalog: so the Docker build resolves ([705d68a09](https://github.com/powerhouse-inc/powerhouse/commit/705d68a09))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5
- Frank @froid1911

## 6.2.2-dev.83 (2026-09-08)

### 🩹 Fixes

- **release:** create the GitHub release after the push, not during changelog ([df3d2c88c](https://github.com/powerhouse-inc/powerhouse/commit/df3d2c88c))

### ❤️ Thank You

- acaldas

## 6.2.2-dev.82 (2026-09-08)

### 🩹 Fixes

- **release:** emit the pnpm 11+ scoped-registry publish flag ([1ddf2464b](https://github.com/powerhouse-inc/powerhouse/commit/1ddf2464b))
- **ci:** route the @jsr scope from the workspace root .npmrc ([#2968](https://github.com/powerhouse-inc/powerhouse/pull/2968))
- **ci:** resolve @jsr scope to npm.jsr.io in pnpm-workspace ([d5dd3a39e](https://github.com/powerhouse-inc/powerhouse/commit/d5dd3a39e))

### ❤️ Thank You

- acaldas
- Frank @froid1911

## 6.2.2-dev.81 (2026-09-05)

### 🚀 Features

- **reactor:** a FIXED task must cite a benchmark measured at the fix commit ([c091953ad](https://github.com/powerhouse-inc/powerhouse/commit/c091953ad))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5

## 6.2.2-dev.80 (2026-09-04)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.79 (2026-09-04)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.78 (2026-09-04)

### 🚀 Features

- **bench:** bench:fix gate picks the next VERIFIED task when no id is given ([7c0560964](https://github.com/powerhouse-inc/powerhouse/commit/7c0560964))
- **bench:** bench-fixer agent and /bench-fix command close a verified finding ([9a2cbfdfe](https://github.com/powerhouse-inc/powerhouse/commit/9a2cbfdfe))

### 🩹 Fixes

- **connect:** stop serving stale builds after a deploy ([#2960](https://github.com/powerhouse-inc/powerhouse/pull/2960))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- Frank @froid1911

## 6.2.2-dev.77 (2026-09-03)

### 🚀 Features

- **connect:** AI chat assistant with settings, feature flag, and markdown ([#2956](https://github.com/powerhouse-inc/powerhouse/pull/2956))
- **reactor:** pure data layer for a bench records viewer ([d7abdde8e](https://github.com/powerhouse-inc/powerhouse/commit/d7abdde8e))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- Frank @froid1911

## 6.2.2-dev.76 (2026-09-03)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.75 (2026-09-03)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.74 (2026-09-02)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.73 (2026-09-02)

### 🚀 Features

- **reactor:** one script runs the benchmarks and records them ([89f958f97](https://github.com/powerhouse-inc/powerhouse/commit/89f958f97))
- three bench agents and the loop that runs them back to back ([af0e7467f](https://github.com/powerhouse-inc/powerhouse/commit/af0e7467f))
- **reactor:** add zod schemas for benchmark and task records ([9869572ba](https://github.com/powerhouse-inc/powerhouse/commit/9869572ba))

### 🩹 Fixes

- **ci:** emit an empty changed-files list without a trailing space ([366ad4d96](https://github.com/powerhouse-inc/powerhouse/commit/366ad4d96))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5

## 6.2.2-dev.72 (2026-09-02)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.71 (2026-09-01)

### 🚀 Features

- agent-managed Vetra with per-project ports ([#2946](https://github.com/powerhouse-inc/powerhouse/pull/2946))

### 🩹 Fixes

- **reactor-api:** hold @apollo/subgraph below 2.15 and use its array form ([ec6d19da0](https://github.com/powerhouse-inc/powerhouse/commit/ec6d19da0))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5
- Frank @froid1911

## 6.2.2-dev.70 (2026-09-01)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.69 (2026-08-31)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.68 (2026-08-31)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.67 (2026-08-31)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.66 (2026-08-30)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.65 (2026-08-29)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.64 (2026-08-28)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.63 (2026-08-27)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.62 (2026-08-27)

### 🩹 Fixes

- **shared:** move generateMock to a dedicated subpath so runtime bundles drop zocker/faker ([223e1682a](https://github.com/powerhouse-inc/powerhouse/commit/223e1682a))
- **ci:** build before typecheck in simulate-ci-workflow ([2ecd03e81](https://github.com/powerhouse-inc/powerhouse/commit/2ecd03e81))
- **windows:** spawn package managers through cross-spawn ([ff4140072](https://github.com/powerhouse-inc/powerhouse/commit/ff4140072))
- **windows:** make package scripts runnable under cmd.exe ([987022ed9](https://github.com/powerhouse-inc/powerhouse/commit/987022ed9))

### ❤️ Thank You

- acaldas
- Claude Opus 5 (1M context)
- Wouter Kampmann

## 6.2.2-dev.61 (2026-08-26)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.60 (2026-08-26)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.59 (2026-08-25)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.58 (2026-08-25)

### 🚀 Features

- **docker:** per-channel compose files on cr.vetra.io with fixed ports ([7d8f51b57](https://github.com/powerhouse-inc/powerhouse/commit/7d8f51b57))

### 🩹 Fixes

- **docker:** connect image HEALTHCHECK uses 127.0.0.1 ([4c80c5759](https://github.com/powerhouse-inc/powerhouse/commit/4c80c5759))
- **docker:** healthcheck 127.0.0.1 instead of localhost in compose files ([e15bb8c9d](https://github.com/powerhouse-inc/powerhouse/commit/e15bb8c9d))

### ❤️ Thank You

- froid1911

## 6.2.2-dev.57 (2026-08-24)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.56 (2026-08-23)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.55 (2026-08-22)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.54 (2026-08-21)

### 🚀 Features

- ⚠️  **reactor-api:** type the actions mutateDocument accepts ([1b9adbe2a](https://github.com/powerhouse-inc/powerhouse/commit/1b9adbe2a))

### ⚠️  Breaking Changes

- **reactor-api:** type the actions mutateDocument accepts  ([1b9adbe2a](https://github.com/powerhouse-inc/powerhouse/commit/1b9adbe2a))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5

## 6.2.2-dev.53 (2026-08-20)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.52 (2026-08-19)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.51 (2026-08-19)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.50 (2026-08-18)

### 🩹 Fixes

- **ci:** install chromium from the package that owns playwright ([653349ee0](https://github.com/powerhouse-inc/powerhouse/commit/653349ee0))
- **connect:** stage the CSP rewrite instead of sed -i ([ab5cd1d8f](https://github.com/powerhouse-inc/powerhouse/commit/ab5cd1d8f))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5 (1M context)

## 6.2.2-dev.49 (2026-08-17)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.48 (2026-08-15)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.47 (2026-08-14)

### 🩹 Fixes

- **connect:** sync CSP registry origin to runtime packageRegistryUrl ([418652419](https://github.com/powerhouse-inc/powerhouse/commit/418652419))

### ❤️ Thank You

- Frank Pfeift

## 6.2.2-dev.46 (2026-08-14)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.45 (2026-08-13)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.44 (2026-08-12)

### 🚀 Features

- **reactor:** authGroups enforcement - groups projection, positional walk, group references ([afb95e3ff](https://github.com/powerhouse-inc/powerhouse/commit/afb95e3ff))
- **reactor-group:** ship the PHGroup document model as @powerhousedao/reactor-group ([d5a323016](https://github.com/powerhouse-inc/powerhouse/commit/d5a323016))

### 🩹 Fixes

- **shared:** harden the condition evaluator per review ([eea3fb475](https://github.com/powerhouse-inc/powerhouse/commit/eea3fb475))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5