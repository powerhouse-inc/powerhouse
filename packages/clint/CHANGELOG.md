## 6.2.3-dev.79 (2026-10-28)

### 🚀 Features

- **clint:** start the switchboard with config and deps ([0262b45d4a](https://github.com/powerhouse-inc/powerhouse/commit/0262b45d4a))
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

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.76 (2026-10-25)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

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

- **clint:** give the Mastra agent read tools over the attached reactor ([80899e7f30](https://github.com/powerhouse-inc/powerhouse/commit/80899e7f30))
- **shared,connect,codegen:** ph init and ph migrate give a project the router as a peer at connect's version, and the host stylesheet shows light and dark tokens ([0829546eaf](https://github.com/powerhouse-inc/powerhouse/commit/0829546eaf))

### ❤️ Thank You

- acaldas
- Claude Fable 5.1
- Wouter Kampmann

## 6.2.3-dev.71 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))
- **desktop:** vendor local package tarballs into the stack (PH_DESKTOP_LOCAL_PACKAGES) ([000bc39d10](https://github.com/powerhouse-inc/powerhouse/commit/000bc39d10))
- **clint:** resolve the shell's own tokens through host-core deferSelf ([15011891e9](https://github.com/powerhouse-inc/powerhouse/commit/15011891e9))
- **clint:** resolve the shell's own agent/proxy fields after its members start ([7992b685a5](https://github.com/powerhouse-inc/powerhouse/commit/7992b685a5))
- **codegen:** pure builders for generated outputs.js/.d.ts and the hosts typing files ([be3c35122f](https://github.com/powerhouse-inc/powerhouse/commit/be3c35122f))
- **clint:** agent urls and proxy upstreams are ref() fields; sibling resolvers deleted ([ac3a884674](https://github.com/powerhouse-inc/powerhouse/commit/ac3a884674))
- **clint:** mastra-runner reads the resolved remote.url and takes apiKey from config ([2bdc19463a](https://github.com/powerhouse-inc/powerhouse/commit/2bdc19463a))
- **clint:** typed host contracts for mastra-runner and clint-runner ([f3729a9d59](https://github.com/powerhouse-inc/powerhouse/commit/f3729a9d59))
- **host-core:** zod single source for host types, kind-aware validateHost, v2 run records ([66e4bcaccd](https://github.com/powerhouse-inc/powerhouse/commit/66e4bcaccd))
- **connect,desktop:** layered backgrounds for the home screen and the loading page ([9ffe4915b4](https://github.com/powerhouse-inc/powerhouse/commit/9ffe4915b4))
- **host-core,ph-cli,switchboard,connect,codegen:** workflow plugins declare the drive and the link ([ab37f30600](https://github.com/powerhouse-inc/powerhouse/commit/ab37f30600))

### 🩹 Fixes

- **clint:** wait for the run record of a member re-attached by port ([7ac55c2aa5](https://github.com/powerhouse-inc/powerhouse/commit/7ac55c2aa5))
- **clint:** start compound members in token-dependency order ([219fe31438](https://github.com/powerhouse-inc/powerhouse/commit/219fe31438))
- **clint:** wait for a member's run record before reading its outputs ([1c57387b1f](https://github.com/powerhouse-inc/powerhouse/commit/1c57387b1f))
- **clint:** start-run is the only standalone run-record writer ([4ce6fafcb3](https://github.com/powerhouse-inc/powerhouse/commit/4ce6fafcb3))
- **clint:** tear the shell down when its outputs fail validation ([94473002b9](https://github.com/powerhouse-inc/powerhouse/commit/94473002b9))

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

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.59 (2026-10-15)

### 🚀 Features

- **clint:** compound proxy plugin + mastra agent-card/settings split (R5) ([5f90d78cfa](https://github.com/powerhouse-inc/powerhouse/commit/5f90d78cfa))
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
- **clint:** clint-runner — children as clint services, agents manager, lifecycle, build forwarding (P5.4) ([fb78468352](https://github.com/powerhouse-inc/powerhouse/commit/fb78468352))
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

- **clint,desktop:** repository field for npm provenance ([7df6953a2a](https://github.com/powerhouse-inc/powerhouse/commit/7df6953a2a))
- **clint:** deflake the REPL /exit frame assertion on loaded runners ([5664e2daef](https://github.com/powerhouse-inc/powerhouse/commit/5664e2daef))
- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **clint:** clint-runner readiness + layered re-attach + suite teardown (P5.9) ([6dddb4108c](https://github.com/powerhouse-inc/powerhouse/commit/6dddb4108c))
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
- **clint:** clint-runner — children as clint services, agents manager, lifecycle, build forwarding (P5.4) ([fb78468352](https://github.com/powerhouse-inc/powerhouse/commit/fb78468352))
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

- **clint:** deflake the REPL /exit frame assertion on loaded runners ([5664e2daef](https://github.com/powerhouse-inc/powerhouse/commit/5664e2daef))
- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **clint:** clint-runner readiness + layered re-attach + suite teardown (P5.9) ([6dddb4108c](https://github.com/powerhouse-inc/powerhouse/commit/6dddb4108c))
- **tsconfig:** dedup host-core from root references now that ph-cli references it (P1.2) ([988cbc574c](https://github.com/powerhouse-inc/powerhouse/commit/988cbc574c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5.5
- Wouter Kampmann