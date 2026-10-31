## 6.2.3-dev.87 (2026-10-31)

### 🚀 Features

- **host-core:** warn when two compound members declare one port ([493216cf65](https://github.com/powerhouse-inc/powerhouse/commit/493216cf65))
- **document-model:** add the code-first definition kernel ([5cf4c8ec4b](https://github.com/powerhouse-inc/powerhouse/commit/5cf4c8ec4b))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5
- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.86 (2026-10-30)

### 🚀 Features

- **reactor:** keyframe clean-up with a dry run ([9be5cad060](https://github.com/powerhouse-inc/powerhouse/commit/9be5cad060))
- **reactor:** memory telemetry correlated with operations processed ([c8d0779075](https://github.com/powerhouse-inc/powerhouse/commit/c8d0779075))
- **reactor:** per-processor timing, top 5 in the catch-up output ([ca20e898e4](https://github.com/powerhouse-inc/powerhouse/commit/ca20e898e4))

### ❤️ Thank You

- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.85 (2026-10-30)

This was a version bump only for @powerhousedao/reactor-monitor to align it with other projects, there were no code changes.

## 6.2.3-dev.84 (2026-10-30)

This was a version bump only for @powerhousedao/reactor-monitor to align it with other projects, there were no code changes.

## 6.2.3-dev.83 (2026-10-30)

### 🩹 Fixes

- **connect:** a kept copy is ready once it holds the switchboard's revision ([f327ce1fa6](https://github.com/powerhouse-inc/powerhouse/commit/f327ce1fa6))
- **connect:** wait for the copy in every tab, and re-read moves before reconciling at boot ([243e0813d7](https://github.com/powerhouse-inc/powerhouse/commit/243e0813d7))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.82 (2026-10-29)

### 🚀 Features

- **reactor,reactor-api:** inspection says whether models load on demand ([c467cb6314](https://github.com/powerhouse-inc/powerhouse/commit/c467cb6314))
- **reactor-router:** a backend's document types may read as open ([df1583eab1](https://github.com/powerhouse-inc/powerhouse/commit/df1583eab1))
- **reactor-browser:** createSwitchboardBackend, a Switchboard as a router backend ([f2b6b608af](https://github.com/powerhouse-inc/powerhouse/commit/f2b6b608af))

### 🩹 Fixes

- **reactor-browser:** a switchboard that loads models on demand gets no create pre-check ([cd57ceec10](https://github.com/powerhouse-inc/powerhouse/commit/cd57ceec10))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.81 (2026-10-29)

### 🚀 Features

- **workflow:** multi-provider AI piece ([59cea966ff](https://github.com/powerhouse-inc/powerhouse/commit/59cea966ff))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.80 (2026-10-29)

### 🚀 Features

- **vetra-studio:** publish @powerhousedao/vetra-studio ([8bf7e24674](https://github.com/powerhouse-inc/powerhouse/commit/8bf7e24674))
- **vetra-studio:** studio sign-in, an agent logs the studio Connect in with an access token ([da56737a56](https://github.com/powerhouse-inc/powerhouse/commit/da56737a56))
- **reactor-monitor:** a remote descriptor takes a switchboard drive address ([64202449c9](https://github.com/powerhouse-inc/powerhouse/commit/64202449c9))
- **document-model,codegen,reactor-api,ph-cli:** projects define their own GraphQL scalars ([968fa45a44](https://github.com/powerhouse-inc/powerhouse/commit/968fa45a44))

### 🩹 Fixes

- **ci:** install academy lint dependencies and restore codegen test cwd ([c99d5e4fe4](https://github.com/powerhouse-inc/powerhouse/commit/c99d5e4fe4))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5
- Wouter Kampmann
- Yasiel Cabrera @YasielCabrera

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

This was a version bump only for @powerhousedao/reactor-monitor to align it with other projects, there were no code changes.

## 6.2.3-dev.76 (2026-10-25)

### 🚀 Features

- **reactor-monitor:** read and set the catch-up priority ([864588a7f5](https://github.com/powerhouse-inc/powerhouse/commit/864588a7f5))
- **reactor,reactor-api,reactor-monitor:** record each processor's run start and phase ([14bb78ea51](https://github.com/powerhouse-inc/powerhouse/commit/14bb78ea51))

### ❤️ Thank You

- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.75 (2026-10-24)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** ph host check behind FEATURE_UNIFORM_RUNNERS_ENABLED ([3a41a17991](https://github.com/powerhouse-inc/powerhouse/commit/3a41a17991))
- **codegen:** ph migrate moves connect's theme overrides from style.css to the host stylesheet ([b113414352](https://github.com/powerhouse-inc/powerhouse/commit/b113414352))
- **reactor-monitor:** read and set the catch-up priority ([864588a7f5](https://github.com/powerhouse-inc/powerhouse/commit/864588a7f5))
- **reactor,reactor-api,reactor-monitor:** record each processor's run start and phase ([14bb78ea51](https://github.com/powerhouse-inc/powerhouse/commit/14bb78ea51))
- **reactor,reactor-api,reactor-monitor:** rerun a processor, cleared or from an ordinal ([279342d614](https://github.com/powerhouse-inc/powerhouse/commit/279342d614))

### 🩹 Fixes

- **builder-tools:** the worker-safe vendor check parses imports, so import-like text in strings and comments no longer counts ([9d3e167f4b](https://github.com/powerhouse-inc/powerhouse/commit/9d3e167f4b))
- **reactor-browser,connect,reactor-monitor:** the worker reactor loads a registry package's module graph, and packages added or updated after boot ([5348ffa792](https://github.com/powerhouse-inc/powerhouse/commit/5348ffa792))
- **powerhouse-vetra-packages:** the document-model editor writes nothing on open unless the model is blank ([f5dc33dd0a](https://github.com/powerhouse-inc/powerhouse/commit/f5dc33dd0a))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.74 (2026-10-24)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** ph host check behind FEATURE_UNIFORM_RUNNERS_ENABLED ([3a41a17991](https://github.com/powerhouse-inc/powerhouse/commit/3a41a17991))
- **codegen:** ph migrate moves connect's theme overrides from style.css to the host stylesheet ([b113414352](https://github.com/powerhouse-inc/powerhouse/commit/b113414352))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.73 (2026-10-23)

### 🚀 Features

- **reactor,reactor-api,reactor-monitor:** rerun a processor, cleared or from an ordinal ([279342d614](https://github.com/powerhouse-inc/powerhouse/commit/279342d614))

### 🩹 Fixes

- **builder-tools:** the worker-safe vendor check parses imports, so import-like text in strings and comments no longer counts ([9d3e167f4b](https://github.com/powerhouse-inc/powerhouse/commit/9d3e167f4b))
- **reactor-browser,connect,reactor-monitor:** the worker reactor loads a registry package's module graph, and packages added or updated after boot ([5348ffa792](https://github.com/powerhouse-inc/powerhouse/commit/5348ffa792))
- **powerhouse-vetra-packages:** the document-model editor writes nothing on open unless the model is blank ([f5dc33dd0a](https://github.com/powerhouse-inc/powerhouse/commit/f5dc33dd0a))

### ❤️ Thank You

- acaldas
- Claude Opus 5.5
- Wouter Kampmann

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

This was a version bump only for @powerhousedao/reactor-monitor to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-monitor to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-monitor to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-monitor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-monitor to align it with other projects, there were no code changes.

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
- **reactor-monitor:** registry.restart() provisions a restarted worker reactor again ([2f2ba2a112](https://github.com/powerhouse-inc/powerhouse/commit/2f2ba2a112))
- **reactor-monitor:** let a remote descriptor set its request timeout ([844eaa1f7f](https://github.com/powerhouse-inc/powerhouse/commit/844eaa1f7f))
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
- **reactor-monitor:** registry.restart() provisions a restarted worker reactor again ([2f2ba2a112](https://github.com/powerhouse-inc/powerhouse/commit/2f2ba2a112))
- **reactor-monitor:** let a remote descriptor set its request timeout ([844eaa1f7f](https://github.com/powerhouse-inc/powerhouse/commit/844eaa1f7f))
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

- **reactor-monitor:** provision a remote reactor as a read-only handle ([66103d6d6f](https://github.com/powerhouse-inc/powerhouse/commit/66103d6d6f))
- **reactor-monitor:** read a remote reactor through the read-only inspection subgraph ([e80be5aa0f](https://github.com/powerhouse-inc/powerhouse/commit/e80be5aa0f))
- **reactor-monitor:** build remote inspection queries from the wire fields ([d16699f94e](https://github.com/powerhouse-inc/powerhouse/commit/d16699f94e))
- **reactor-monitor:** hold a Web Lock on a persistent store from open to close ([2e16dcfbf2](https://github.com/powerhouse-inc/powerhouse/commit/2e16dcfbf2))
- **reactor-monitor:** host worker reactors on reactor-browser's rpc dispatchers ([18f3f2d0c9](https://github.com/powerhouse-inc/powerhouse/commit/18f3f2d0c9))
- **reactor-monitor:** fail a ready reactor whose store is poisoned ([b62327ce5f](https://github.com/powerhouse-inc/powerhouse/commit/b62327ce5f))
- **reactor-monitor:** describe reactors by reach and ReactorInfo ([c655457487](https://github.com/powerhouse-inc/powerhouse/commit/c655457487))
- **reactor-monitor:** build reactors on main's PGlite storage ([6b8bd7e4b5](https://github.com/powerhouse-inc/powerhouse/commit/6b8bd7e4b5))

### 🩹 Fixes

- **reactor-monitor:** share one in-flight restart between overlapping callers ([b464f7a721](https://github.com/powerhouse-inc/powerhouse/commit/b464f7a721))
- **reactor-monitor:** export the worker as an explicit start function ([3ea673db6d](https://github.com/powerhouse-inc/powerhouse/commit/3ea673db6d))
- **reactor-monitor:** list a worker reactor's local sync links in its tab ([0737b7b941](https://github.com/powerhouse-inc/powerhouse/commit/0737b7b941))
- **reactor-monitor:** resolve a worker restart when the worker retires ([e24060fc90](https://github.com/powerhouse-inc/powerhouse/commit/e24060fc90))
- **reactor-monitor:** queue a close or kill before publishing it ([7c34d687de](https://github.com/powerhouse-inc/powerhouse/commit/7c34d687de))
- **reactor-monitor:** killAll waits per name, not across names ([8f09c3240a](https://github.com/powerhouse-inc/powerhouse/commit/8f09c3240a))
- **reactor-monitor:** bound every remote inspection request ([4394bf0c86](https://github.com/powerhouse-inc/powerhouse/commit/4394bf0c86))
- **reactor-monitor:** keep kill async so a listener throw rejects ([a16666e14e](https://github.com/powerhouse-inc/powerhouse/commit/a16666e14e))
- **reactor-monitor:** close the store and its lock on any build throw ([4f353fc5dc](https://github.com/powerhouse-inc/powerhouse/commit/4f353fc5dc))
- **reactor-monitor:** keep a store's lock when its close fails ([0e2d444422](https://github.com/powerhouse-inc/powerhouse/commit/0e2d444422))
- **reactor-monitor:** run a name's registry ops one after another ([33aac623db](https://github.com/powerhouse-inc/powerhouse/commit/33aac623db))
- **reactor-workflow:** upload a step's output as a file-backed Blob ([8c943bfbeb](https://github.com/powerhouse-inc/powerhouse/commit/8c943bfbeb))
- **reactor-attachments:** hash and upload attachments without reading the whole file into memory ([f6532d6449](https://github.com/powerhouse-inc/powerhouse/commit/f6532d6449))
- **reactor-monitor:** fail a worker handle on retirement and move to a fresh worker ([90b5259914](https://github.com/powerhouse-inc/powerhouse/commit/90b5259914))
- **reactor-monitor:** retire a worker whose store is poisoned ([fdd16aa25a](https://github.com/powerhouse-inc/powerhouse/commit/fdd16aa25a))
- **reactor-monitor:** offer a worker's syncAdmin only with admin access ([f69555f655](https://github.com/powerhouse-inc/powerhouse/commit/f69555f655))
- **reactor-monitor:** type closing on every registry entry variant ([d1450f9821](https://github.com/powerhouse-inc/powerhouse/commit/d1450f9821))
- **reactor-monitor:** wait for a failed reactor's store to close ([760ca22ca2](https://github.com/powerhouse-inc/powerhouse/commit/760ca22ca2))
- **reactor-monitor:** bound the reactor stop so shutdown always closes the store ([010e385663](https://github.com/powerhouse-inc/powerhouse/commit/010e385663))
- **reactor-monitor:** swap in only the sync reads the adapter defines ([1777df6f69](https://github.com/powerhouse-inc/powerhouse/commit/1777df6f69))
- **reactor-monitor:** load the remote operations module against main's wire table ([e95a4f52b3](https://github.com/powerhouse-inc/powerhouse/commit/e95a4f52b3))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5