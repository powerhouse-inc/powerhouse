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

This was a version bump only for @powerhousedao/reactor-router to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-router to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-router to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-router to align it with other projects, there were no code changes.

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
- **reactor-router,connect:** create documents and skip drive syncing on the remote reactor client ([dbdb1f1356](https://github.com/powerhouse-inc/powerhouse/commit/dbdb1f1356))

### 🔥 Performance

- **connect:** trim connect's boot imports and break its barrel cycles ([dde9430d74](https://github.com/powerhouse-inc/powerhouse/commit/dde9430d74))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.62 (2026-10-16)

### 🚀 Features

- **connect,builder-tools:** prerendered app shell, self-hosted font and module warm-up ([cf9b61ef86](https://github.com/powerhouse-inc/powerhouse/commit/cf9b61ef86))

### 🩹 Fixes

- **ph-cli,docker,codegen:** serve connect under a base path ([fe07684e12](https://github.com/powerhouse-inc/powerhouse/commit/fe07684e12))
- **reactor-router,connect:** create documents and skip drive syncing on the remote reactor client ([dbdb1f1356](https://github.com/powerhouse-inc/powerhouse/commit/dbdb1f1356))

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

This was a version bump only for @powerhousedao/reactor-router to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-router to align it with other projects, there were no code changes.

## 6.2.3-dev.53 (2026-10-11)

This was a version bump only for @powerhousedao/reactor-router to align it with other projects, there were no code changes.

## 6.2.3-dev.52 (2026-10-10)

### 🚀 Features

- **ph-cli:** keep native and WebAssembly dependencies external and list them as externalDependencies ([e3b616e67b](https://github.com/powerhouse-inc/powerhouse/commit/e3b616e67b))
- **reactor-router:** submit async variants without waiting when a backend can ([3a9fbf8db7](https://github.com/powerhouse-inc/powerhouse/commit/3a9fbf8db7))
- **reactor-router:** the routing IReactorClient over IRoutableBackend ([772aefe6ec](https://github.com/powerhouse-inc/powerhouse/commit/772aefe6ec))
- **reactor-router:** refuse a misrouted write on the router's side ([2cbef1945a](https://github.com/powerhouse-inc/powerhouse/commit/2cbef1945a))
- **reactor-router:** advisory routing that re-aims a misrouted operation ([ffec5ad049](https://github.com/powerhouse-inc/powerhouse/commit/ffec5ad049))
- **reactor-router:** fan-in reads with a documented merge ([d4d68478ae](https://github.com/powerhouse-inc/powerhouse/commit/d4d68478ae))
- **reactor-router:** place collections over backend facts and keep a router table ([4f6f936780](https://github.com/powerhouse-inc/powerhouse/commit/4f6f936780))
- **reactor-router:** route over IRoutableBackend and backend facts ([9e9b597500](https://github.com/powerhouse-inc/powerhouse/commit/9e9b597500))
- **reactor-router:** the misroute contract and the router's error surface ([d8cba07067](https://github.com/powerhouse-inc/powerhouse/commit/d8cba07067))

### 🩹 Fixes

- **reactor-router:** verify cached routes before a relationship split check ([9c937bc0af](https://github.com/powerhouse-inc/powerhouse/commit/9c937bc0af))
- **reactor-router:** resolve every create through the batch rules ([0f9bc40204](https://github.com/powerhouse-inc/powerhouse/commit/0f9bc40204))
- **reactor-router:** treat a cached route as a hint when resolving a batch ([5a13066c11](https://github.com/powerhouse-inc/powerhouse/commit/5a13066c11))
- **reactor-router:** resolve every batch through one backend-resolution rule ([dea08f0ff2](https://github.com/powerhouse-inc/powerhouse/commit/dea08f0ff2))
- **reactor-router:** re-resolve a refused batch without the refusing backends ([1707190959](https://github.com/powerhouse-inc/powerhouse/commit/1707190959))
- **reactor-router:** skip the batch ownership guard for an id the batch creates ([e09055a544](https://github.com/powerhouse-inc/powerhouse/commit/e09055a544))
- **reactor-router:** place an unserved id by its collection route everywhere ([9a9fc629ac](https://github.com/powerhouse-inc/powerhouse/commit/9a9fc629ac))
- **reactor-router:** leave every route unchanged after a recovered read ([c12b65fd04](https://github.com/powerhouse-inc/powerhouse/commit/c12b65fd04))
- **reactor-router:** answer isDocumentIdTaken strictly across backends ([cd994d0cc6](https://github.com/powerhouse-inc/powerhouse/commit/cd994d0cc6))
- **reactor-router:** answer waitForJob for an unknown job as a failed job ([36745bd630](https://github.com/powerhouse-inc/powerhouse/commit/36745bd630))
- **reactor-router:** correct a stale document entry under a batch-shaped write ([257a2a032e](https://github.com/powerhouse-inc/powerhouse/commit/257a2a032e))
- **reactor-router:** let a backend report not-found when nothing holds the target ([104ed4cdfd](https://github.com/powerhouse-inc/powerhouse/commit/104ed4cdfd))
- **reactor-router:** place a parentless create by its collection route ([6a7b5229bc](https://github.com/powerhouse-inc/powerhouse/commit/6a7b5229bc))
- **reactor-router:** decide route-source precedence in one place ([5e47d3f8af](https://github.com/powerhouse-inc/powerhouse/commit/5e47d3f8af))
- **reactor-router:** refuse an unservable find as a rejection, not a throw ([06dedd2d00](https://github.com/powerhouse-inc/powerhouse/commit/06dedd2d00))
- **reactor-router:** recognise the GraphQL client's wrong-shard refusal ([bee26886f2](https://github.com/powerhouse-inc/powerhouse/commit/bee26886f2))
- **reactor,reactor-router:** name an unknown job so the router stops reporting real jobs as unknown ([34aadb3add](https://github.com/powerhouse-inc/powerhouse/commit/34aadb3add))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.51 (2026-10-10)

### 🚀 Features

- **ph-cli:** keep native and WebAssembly dependencies external and list them as externalDependencies ([e3b616e67b](https://github.com/powerhouse-inc/powerhouse/commit/e3b616e67b))
- **reactor-router:** submit async variants without waiting when a backend can ([3a9fbf8db7](https://github.com/powerhouse-inc/powerhouse/commit/3a9fbf8db7))
- **reactor-router:** the routing IReactorClient over IRoutableBackend ([772aefe6ec](https://github.com/powerhouse-inc/powerhouse/commit/772aefe6ec))
- **reactor-router:** refuse a misrouted write on the router's side ([2cbef1945a](https://github.com/powerhouse-inc/powerhouse/commit/2cbef1945a))
- **reactor-router:** advisory routing that re-aims a misrouted operation ([ffec5ad049](https://github.com/powerhouse-inc/powerhouse/commit/ffec5ad049))
- **reactor-router:** fan-in reads with a documented merge ([d4d68478ae](https://github.com/powerhouse-inc/powerhouse/commit/d4d68478ae))
- **reactor-router:** place collections over backend facts and keep a router table ([4f6f936780](https://github.com/powerhouse-inc/powerhouse/commit/4f6f936780))
- **reactor-router:** route over IRoutableBackend and backend facts ([9e9b597500](https://github.com/powerhouse-inc/powerhouse/commit/9e9b597500))
- **reactor-router:** the misroute contract and the router's error surface ([d8cba07067](https://github.com/powerhouse-inc/powerhouse/commit/d8cba07067))

### 🩹 Fixes

- **reactor-router:** verify cached routes before a relationship split check ([9c937bc0af](https://github.com/powerhouse-inc/powerhouse/commit/9c937bc0af))
- **reactor-router:** resolve every create through the batch rules ([0f9bc40204](https://github.com/powerhouse-inc/powerhouse/commit/0f9bc40204))
- **reactor-router:** treat a cached route as a hint when resolving a batch ([5a13066c11](https://github.com/powerhouse-inc/powerhouse/commit/5a13066c11))
- **reactor-router:** resolve every batch through one backend-resolution rule ([dea08f0ff2](https://github.com/powerhouse-inc/powerhouse/commit/dea08f0ff2))
- **reactor-router:** re-resolve a refused batch without the refusing backends ([1707190959](https://github.com/powerhouse-inc/powerhouse/commit/1707190959))
- **reactor-router:** skip the batch ownership guard for an id the batch creates ([e09055a544](https://github.com/powerhouse-inc/powerhouse/commit/e09055a544))
- **reactor-router:** place an unserved id by its collection route everywhere ([9a9fc629ac](https://github.com/powerhouse-inc/powerhouse/commit/9a9fc629ac))
- **reactor-router:** leave every route unchanged after a recovered read ([c12b65fd04](https://github.com/powerhouse-inc/powerhouse/commit/c12b65fd04))
- **reactor-router:** answer isDocumentIdTaken strictly across backends ([cd994d0cc6](https://github.com/powerhouse-inc/powerhouse/commit/cd994d0cc6))
- **reactor-router:** answer waitForJob for an unknown job as a failed job ([36745bd630](https://github.com/powerhouse-inc/powerhouse/commit/36745bd630))
- **reactor-router:** correct a stale document entry under a batch-shaped write ([257a2a032e](https://github.com/powerhouse-inc/powerhouse/commit/257a2a032e))
- **reactor-router:** let a backend report not-found when nothing holds the target ([104ed4cdfd](https://github.com/powerhouse-inc/powerhouse/commit/104ed4cdfd))
- **reactor-router:** place a parentless create by its collection route ([6a7b5229bc](https://github.com/powerhouse-inc/powerhouse/commit/6a7b5229bc))
- **reactor-router:** decide route-source precedence in one place ([5e47d3f8af](https://github.com/powerhouse-inc/powerhouse/commit/5e47d3f8af))
- **reactor-router:** refuse an unservable find as a rejection, not a throw ([06dedd2d00](https://github.com/powerhouse-inc/powerhouse/commit/06dedd2d00))
- **reactor-router:** recognise the GraphQL client's wrong-shard refusal ([bee26886f2](https://github.com/powerhouse-inc/powerhouse/commit/bee26886f2))
- **reactor,reactor-router:** name an unknown job so the router stops reporting real jobs as unknown ([34aadb3add](https://github.com/powerhouse-inc/powerhouse/commit/34aadb3add))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5