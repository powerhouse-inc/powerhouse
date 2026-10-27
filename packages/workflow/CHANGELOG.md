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

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.76 (2026-10-25)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

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
- **shared,workflow:** the package stylesheet entry takes the theme to reference and skips source maps; workflow's stylesheet holds its own classes and vendor CSS against the design system's theme ([f3bfe645e9](https://github.com/powerhouse-inc/powerhouse/commit/f3bfe645e9))
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
- **shared,workflow:** the package stylesheet entry takes the theme to reference and skips source maps; workflow's stylesheet holds its own classes and vendor CSS against the design system's theme ([f3bfe645e9](https://github.com/powerhouse-inc/powerhouse/commit/f3bfe645e9))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.69 (2026-10-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))
- **connect,design-system,workflow,codegen:** one Tailwind build per page; ph migrate moves style.css onto Connect's Tailwind source ([3b7d052bcd](https://github.com/powerhouse-inc/powerhouse/commit/3b7d052bcd))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

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

- **workflow,vetra:** keep workflow state in the url and select nodes via the store ([ad08b5a16a](https://github.com/powerhouse-inc/powerhouse/commit/ad08b5a16a))
- **connect,builder-tools:** prerendered app shell, self-hosted font and module warm-up ([cf9b61ef86](https://github.com/powerhouse-inc/powerhouse/commit/cf9b61ef86))

### 🩹 Fixes

- **ph-cli,docker,codegen:** serve connect under a base path ([fe07684e12](https://github.com/powerhouse-inc/powerhouse/commit/fe07684e12))

### 🔥 Performance

- **connect:** trim connect's boot imports and break its barrel cycles ([dde9430d74](https://github.com/powerhouse-inc/powerhouse/commit/dde9430d74))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.62 (2026-10-16)

### 🚀 Features

- **workflow,vetra:** keep workflow state in the url and select nodes via the store ([ad08b5a16a](https://github.com/powerhouse-inc/powerhouse/commit/ad08b5a16a))
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

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

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
- **reactor-workflow:** admit runs under a cross-workflow cap, keep fires durable across restarts, and give each workflow its own trigger lane ([596775ab44](https://github.com/powerhouse-inc/powerhouse/commit/596775ab44))
- ⚠️  **reactor-workflow:** lease warm piece children per request from one pool sized around the reactor's threads ([9ff3834198](https://github.com/powerhouse-inc/powerhouse/commit/9ff3834198))

### 🩹 Fixes

- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **tsconfig:** dedup host-core from root references now that ph-cli references it (P1.2) ([988cbc574c](https://github.com/powerhouse-inc/powerhouse/commit/988cbc574c))

### ⚠️  Breaking Changes

- **reactor-workflow:** lease warm piece children per request from one pool sized around the reactor's threads  ([9ff3834198](https://github.com/powerhouse-inc/powerhouse/commit/9ff3834198))

### ❤️ Thank You

- acaldas
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
- **reactor-workflow:** admit runs under a cross-workflow cap, keep fires durable across restarts, and give each workflow its own trigger lane ([596775ab44](https://github.com/powerhouse-inc/powerhouse/commit/596775ab44))
- ⚠️  **reactor-workflow:** lease warm piece children per request from one pool sized around the reactor's threads ([9ff3834198](https://github.com/powerhouse-inc/powerhouse/commit/9ff3834198))

### 🩹 Fixes

- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **tsconfig:** dedup host-core from root references now that ph-cli references it (P1.2) ([988cbc574c](https://github.com/powerhouse-inc/powerhouse/commit/988cbc574c))

### ⚠️  Breaking Changes

- **reactor-workflow:** lease warm piece children per request from one pool sized around the reactor's threads  ([9ff3834198](https://github.com/powerhouse-inc/powerhouse/commit/9ff3834198))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.55 (2026-10-13)

### 🚀 Features

- **workflow:** field-level operations for connection config and the trigger's config, connection and version ([d81c181fb8](https://github.com/powerhouse-inc/powerhouse/commit/d81c181fb8))
- **reactor-monitor:** build remote inspection queries from the wire fields ([d16699f94e](https://github.com/powerhouse-inc/powerhouse/commit/d16699f94e))
- **workflow:** re-add the React-free ./editors/runtime entry ([de46721dd5](https://github.com/powerhouse-inc/powerhouse/commit/de46721dd5))

### 🩹 Fixes

- **workflow:** show the graph's hover cards on folded rows, keep their steps on narrow screens, and lift the open hint over the graph ([0dd86dde1b](https://github.com/powerhouse-inc/powerhouse/commit/0dd86dde1b))
- **workflow:** keep the property form's edits while earlier saves echo back ([3409ac21ec](https://github.com/powerhouse-inc/powerhouse/commit/3409ac21ec))
- **workflow:** build each schedule change on the newest config sent, not the last one echoed ([d7a5f55075](https://github.com/powerhouse-inc/powerhouse/commit/d7a5f55075))
- **reactor-workflow:** upload a step's output as a file-backed Blob ([8c943bfbeb](https://github.com/powerhouse-inc/powerhouse/commit/8c943bfbeb))
- **reactor-attachments:** hash and upload attachments without reading the whole file into memory ([f6532d6449](https://github.com/powerhouse-inc/powerhouse/commit/f6532d6449))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.54 (2026-10-12)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.53 (2026-10-11)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.52 (2026-10-10)

### 🚀 Features

- **ph-cli:** keep native and WebAssembly dependencies external and list them as externalDependencies ([e3b616e67b](https://github.com/powerhouse-inc/powerhouse/commit/e3b616e67b))
- **workflow:** polish the block picker after a visual review ([67bf5a96f7](https://github.com/powerhouse-inc/powerhouse/commit/67bf5a96f7))
- **workflow:** accessible, keyboard-complete block picker; ranked AI connector search ([2241f7e3ec](https://github.com/powerhouse-inc/powerhouse/commit/2241f7e3ec))
- **workflow:** two-pane block picker with keyboard navigation, recent picks and on-screen placement ([79f9cfa795](https://github.com/powerhouse-inc/powerhouse/commit/79f9cfa795))
- **workflow:** group block picker search by piece and add source tabs ([723d7a0660](https://github.com/powerhouse-inc/powerhouse/commit/723d7a0660))
- **reactor-router:** the routing IReactorClient over IRoutableBackend ([772aefe6ec](https://github.com/powerhouse-inc/powerhouse/commit/772aefe6ec))
- **reactor-workflow:** claim the workflow singleton before composing ([98a51ff9ab](https://github.com/powerhouse-inc/powerhouse/commit/98a51ff9ab))

### 🩹 Fixes

- **workflow:** let an untouched interval field follow outside changes ([fef1916cb4](https://github.com/powerhouse-inc/powerhouse/commit/fef1916cb4))
- **workflow:** keep typed interval while a slower save echoes back ([#3196](https://github.com/powerhouse-inc/powerhouse/issues/3196))
- **workflow:** address block picker review findings ([1c69224191](https://github.com/powerhouse-inc/powerhouse/commit/1c69224191))
- **workflow:** close the block picker on canvas clicks and soften match highlights ([23286ceb9d](https://github.com/powerhouse-inc/powerhouse/commit/23286ceb9d))
- **workflow:** label the cloud catalog tab Integrations ([8f14e04a71](https://github.com/powerhouse-inc/powerhouse/commit/8f14e04a71))
- **reactor-workflow:** never take the singleton from a live holder of the same name ([9f6750789d](https://github.com/powerhouse-inc/powerhouse/commit/9f6750789d))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.51 (2026-10-10)

### 🚀 Features

- **ph-cli:** keep native and WebAssembly dependencies external and list them as externalDependencies ([e3b616e67b](https://github.com/powerhouse-inc/powerhouse/commit/e3b616e67b))
- **workflow:** polish the block picker after a visual review ([67bf5a96f7](https://github.com/powerhouse-inc/powerhouse/commit/67bf5a96f7))
- **workflow:** accessible, keyboard-complete block picker; ranked AI connector search ([2241f7e3ec](https://github.com/powerhouse-inc/powerhouse/commit/2241f7e3ec))
- **workflow:** two-pane block picker with keyboard navigation, recent picks and on-screen placement ([79f9cfa795](https://github.com/powerhouse-inc/powerhouse/commit/79f9cfa795))
- **workflow:** group block picker search by piece and add source tabs ([723d7a0660](https://github.com/powerhouse-inc/powerhouse/commit/723d7a0660))
- **reactor-router:** the routing IReactorClient over IRoutableBackend ([772aefe6ec](https://github.com/powerhouse-inc/powerhouse/commit/772aefe6ec))
- **reactor-workflow:** claim the workflow singleton before composing ([98a51ff9ab](https://github.com/powerhouse-inc/powerhouse/commit/98a51ff9ab))

### 🩹 Fixes

- **workflow:** let an untouched interval field follow outside changes ([fef1916cb4](https://github.com/powerhouse-inc/powerhouse/commit/fef1916cb4))
- **workflow:** keep typed interval while a slower save echoes back ([#3196](https://github.com/powerhouse-inc/powerhouse/issues/3196))
- **workflow:** address block picker review findings ([1c69224191](https://github.com/powerhouse-inc/powerhouse/commit/1c69224191))
- **workflow:** close the block picker on canvas clicks and soften match highlights ([23286ceb9d](https://github.com/powerhouse-inc/powerhouse/commit/23286ceb9d))
- **workflow:** label the cloud catalog tab Integrations ([8f14e04a71](https://github.com/powerhouse-inc/powerhouse/commit/8f14e04a71))
- **reactor-workflow:** never take the singleton from a live holder of the same name ([9f6750789d](https://github.com/powerhouse-inc/powerhouse/commit/9f6750789d))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.50 (2026-10-09)

### 🚀 Features

- **reactor-workflow:** stream, cache and authorize step attachments ([2c33603d58](https://github.com/powerhouse-inc/powerhouse/commit/2c33603d58))
- **reactor-workflow:** trace runs, steps, workers and reactor calls with a host-supplied tracer and meter ([d42c5d9053](https://github.com/powerhouse-inc/powerhouse/commit/d42c5d9053))
- **reactor-workflow:** enforce the policy knobs, or mark them unenforced ([ef311827ef](https://github.com/powerhouse-inc/powerhouse/commit/ef311827ef))

### 🩹 Fixes

- **registry:** stop Verdaccio dropping a package write when Windows refuses the rename ([79636fd438](https://github.com/powerhouse-inc/powerhouse/commit/79636fd438))
- **reactor-workflow:** let a run its deadline cancelled be rerun ([77196c4fb5](https://github.com/powerhouse-inc/powerhouse/commit/77196c4fb5))
- **workflow:** show an INDETERMINATE step test as a warning, not a pass ([890c30ba59](https://github.com/powerhouse-inc/powerhouse/commit/890c30ba59))
- **reactor-workflow:** bound the run journal, and stop rerun redoing a lost side effect ([4b898216b9](https://github.com/powerhouse-inc/powerhouse/commit/4b898216b9))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.49 (2026-10-08)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.48 (2026-10-07)

### 🚀 Features

- **workflow:** more room between a workflow's trigger and its first step ([73cd872a34](https://github.com/powerhouse-inc/powerhouse/commit/73cd872a34))
- **workflow:** collapsible overview rows, and workflow graphs that wrap ([6c70cc8082](https://github.com/powerhouse-inc/powerhouse/commit/6c70cc8082))
- **workflow:** name a reactor trigger by the document and action it waits for ([d286a108e4](https://github.com/powerhouse-inc/powerhouse/commit/d286a108e4))

### 🩹 Fixes

- **workflow:** a step's only way out stays on its lane ([9151bf6b95](https://github.com/powerhouse-inc/powerhouse/commit/9151bf6b95))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.47 (2026-10-07)

### 🚀 Features

- **workflow:** edit a workflow's description in the editor and show it on the overview ([77f6e625f9](https://github.com/powerhouse-inc/powerhouse/commit/77f6e625f9))
- **workflow:** back and forward walk the workflows visited in the studio ([f6bda90d6c](https://github.com/powerhouse-inc/powerhouse/commit/f6bda90d6c))
- **workflow:** horizontal workflow graph on the studio overview and workflow page ([98784e4d17](https://github.com/powerhouse-inc/powerhouse/commit/98784e4d17))
- **workflow:** drag-and-drop workflow order in the studio sidebar and overview ([763f001f9c](https://github.com/powerhouse-inc/powerhouse/commit/763f001f9c))

### 🩹 Fixes

- **workflow:** scrolling past the studio's end no longer shifts it inside Connect ([074603d4f0](https://github.com/powerhouse-inc/powerhouse/commit/074603d4f0))
- **workflow:** connection fields show names and flag documents that are not connections ([54f6c5b9df](https://github.com/powerhouse-inc/powerhouse/commit/54f6c5b9df))

### ❤️ Thank You

- acaldas

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

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.38 (2026-10-01)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.37 (2026-10-01)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.36 (2026-10-01)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

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

### 🩹 Fixes

- **workflow:** tell agents that publishing does not enable a workflow ([cbed7db121](https://github.com/powerhouse-inc/powerhouse/commit/cbed7db121))
- **workflow:** show a failed publish's error once the draft banner is gone ([f8278642aa](https://github.com/powerhouse-inc/powerhouse/commit/f8278642aa))
- **workflow:** drop the test of a block an undo removes, and settle a failed undo ([12c5073697](https://github.com/powerhouse-inc/powerhouse/commit/12c5073697))

### ❤️ Thank You

- acaldas

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

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.31 (2026-09-29)

### 🚀 Features

- **workflow:** sign connections in with OAuth2 using their own app ([b03b33bf0](https://github.com/powerhouse-inc/powerhouse/commit/b03b33bf0))
- **reactor-workflow:** opt-in run retention sweep and dedupe cleanup for deleted workflows ([e2b6484aa](https://github.com/powerhouse-inc/powerhouse/commit/e2b6484aa))
- **reactor-workflow:** keyset-paginate the run listing through the subgraph and runs views ([d22a4eea5](https://github.com/powerhouse-inc/powerhouse/commit/d22a4eea5))
- **workflow:** publishing, step testing, versions, computed validity, ports and typed variables in the editors ([e2be02d2d](https://github.com/powerhouse-inc/powerhouse/commit/e2be02d2d))
- ⚠️  **workflow:** piece fields, publishing, skip, tests and typed variables in the workflow model ([60fb3777f](https://github.com/powerhouse-inc/powerhouse/commit/60fb3777f))

### 🩹 Fixes

- **workflow:** keep the field focused and the tree up while picking data ([5e93b1a38](https://github.com/powerhouse-inc/powerhouse/commit/5e93b1a38))
- **workflow:** open the panel for an added block and keep the connection field hidden until its form loads ([7edc28408](https://github.com/powerhouse-inc/powerhouse/commit/7edc28408))
- **workflow:** name canvas add buttons and retry a failed catalog load ([2d43667fc](https://github.com/powerhouse-inc/powerhouse/commit/2d43667fc))
- **workflow:** reword the variable type description so the subgraph doesn't read it as a type declaration ([030bad026](https://github.com/powerhouse-inc/powerhouse/commit/030bad026))
- ⚠️  **workflow:** read reactor piece ids, JSON and action input strictly ([1282ff102](https://github.com/powerhouse-inc/powerhouse/commit/1282ff102))

### ⚠️  Breaking Changes

- **workflow:** read reactor piece ids, JSON and action input strictly  ([1282ff102](https://github.com/powerhouse-inc/powerhouse/commit/1282ff102))
- **workflow:** piece fields, publishing, skip, tests and typed variables in the workflow model  ([60fb3777f](https://github.com/powerhouse-inc/powerhouse/commit/60fb3777f))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.30 (2026-09-29)

### 🩹 Fixes

- **deps:** load cmd-ts's ESM build under bun, which fails to require chalk from its CJS build ([749528c71](https://github.com/powerhouse-inc/powerhouse/commit/749528c71))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.29 (2026-09-28)

### 🩹 Fixes

- **reactor-workflow:** refuse a secrets master key other than the one secrets were stored with ([87cfde0f5](https://github.com/powerhouse-inc/powerhouse/commit/87cfde0f5))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.28 (2026-09-28)

### 🚀 Features

- **workflow:** split drive and folder, and give the reactor steps an action form ([b1939e431](https://github.com/powerhouse-inc/powerhouse/commit/b1939e431))
- **workflow:** render every Activepieces prop type and layout hint in the step form ([908e74733](https://github.com/powerhouse-inc/powerhouse/commit/908e74733))

### 🩹 Fixes

- **workflow:** reset source search on dismiss, keep picked labels, commit colour once, fold block descriptions ([585993cb6](https://github.com/powerhouse-inc/powerhouse/commit/585993cb6))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.27 (2026-09-28)

### 🩹 Fixes

- **workflow:** name a piece run's trigger in the runs table instead of showing its block type ([83b2956b4](https://github.com/powerhouse-inc/powerhouse/commit/83b2956b4))
- **workflow:** end long logo chains in +N instead of overflowing the next column ([8730c9407](https://github.com/powerhouse-inc/powerhouse/commit/8730c9407))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.26 (2026-09-26)

### 🩹 Fixes

- **workflow:** name a piece run's trigger in the runs table instead of showing its block type ([83b2956b4](https://github.com/powerhouse-inc/powerhouse/commit/83b2956b4))
- **workflow:** end long logo chains in +N instead of overflowing the next column ([8730c9407](https://github.com/powerhouse-inc/powerhouse/commit/8730c9407))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.25 (2026-09-25)

### 🚀 Features

- **workflow:** let a connection choose among its piece's sign-in methods ([ddd04de0d](https://github.com/powerhouse-inc/powerhouse/commit/ddd04de0d))
- **workflow:** show run data in a lazy-loaded tree with copyable references, and scope the connection picker to the drive ([1d286f4a6](https://github.com/powerhouse-inc/powerhouse/commit/1d286f4a6))
- **workflow:** one editor header, a schedule builder, run timelines and connection checks ([b11c4710e](https://github.com/powerhouse-inc/powerhouse/commit/b11c4710e))
- **reactor-workflow:** record when each step starts and ends ([6f6d8a233](https://github.com/powerhouse-inc/powerhouse/commit/6f6d8a233))
- **workflow:** show saved connection secrets as locked cards with replace, reveal and reference controls ([fc59e6829](https://github.com/powerhouse-inc/powerhouse/commit/fc59e6829))
- **workflow:** a workflow overview, run chains, plain-language triggers and a Last run tab ([39866eac5](https://github.com/powerhouse-inc/powerhouse/commit/39866eac5))
- **workflow:** restyle Studio and the editors on theme tokens, with a two-tab step panel ([52732d931](https://github.com/powerhouse-inc/powerhouse/commit/52732d931))

### 🩹 Fixes

- **ci:** let the release skip the transpiler TypeScript 7 broke ([#36306](https://github.com/powerhouse-inc/powerhouse/issues/36306))
- **workflow:** full step references, drop other sign-in methods' secrets on switch, and read older interval schedules ([b36799493](https://github.com/powerhouse-inc/powerhouse/commit/b36799493))
- **workflow:** keep the step track's rings unclipped and draw its logos with BlockLogo ([ee519671d](https://github.com/powerhouse-inc/powerhouse/commit/ee519671d))
- **workflow:** size the dark-mode logo tile's padding in pixels ([f83a63762](https://github.com/powerhouse-inc/powerhouse/commit/f83a63762))
- **workflow:** name piece actions and triggers by their catalog names ([8561f9806](https://github.com/powerhouse-inc/powerhouse/commit/8561f9806))
- **workflow:** bind field labels to their controls and keep Select keyboard-operable ([dc573eb54](https://github.com/powerhouse-inc/powerhouse/commit/dc573eb54))

### ❤️ Thank You

- acaldas
- Guillermo Puente @gpuente

## 6.2.3-dev.24 (2026-09-25)

### 🚀 Features

- **reactor:** action signature integrity ([#3088](https://github.com/powerhouse-inc/powerhouse/pull/3088), [#2894](https://github.com/powerhouse-inc/powerhouse/issues/2894), [#7](https://github.com/powerhouse-inc/powerhouse/issues/7))
- **reactor-workflow:** refuse the auth and trigger features the engine can't run ([7ce03d28f](https://github.com/powerhouse-inc/powerhouse/commit/7ce03d28f))

### 🩹 Fixes

- **workflow:** build after powerhouse-vetra-packages so their tsc --build runs never overlap ([#3101](https://github.com/powerhouse-inc/powerhouse/pull/3101))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.23 (2026-09-24)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.22 (2026-09-23)

### 🩹 Fixes

- **ci:** slice the duration-watch baseline in jq, not through head ([73db497e0](https://github.com/powerhouse-inc/powerhouse/commit/73db497e0))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.21 (2026-09-22)

### 🩹 Fixes

- **workflow:** fail a dispatch whose reducer rejected the action ([992976e99](https://github.com/powerhouse-inc/powerhouse/commit/992976e99))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.20 (2026-09-22)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.19 (2026-09-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.18 (2026-09-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.17 (2026-09-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.16 (2026-09-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.15 (2026-09-20)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.12 (2026-09-17)

### 🚀 Features

- **switchboard:** own the workflow runtime, feed it through a read model, and take workflows out of reactor-api ([#3042](https://github.com/powerhouse-inc/powerhouse/issues/3042))
- **reactor-workflow:** the workflow engine, composed in reactor-api behind the workflows flag ([cb807bf5d](https://github.com/powerhouse-inc/powerhouse/commit/cb807bf5d))
- **workflow:** the Connect-loaded workflow package, and the workflows flag in reactor-api ([0953fc254](https://github.com/powerhouse-inc/powerhouse/commit/0953fc254))
- **pieces-framework:** vendor the Activepieces piece framework as a Powerhouse package ([3da5dbea8](https://github.com/powerhouse-inc/powerhouse/commit/3da5dbea8))

### ❤️ Thank You

- acaldas