## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-monitor-app to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-monitor-app to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-monitor-app to align it with other projects, there were no code changes.

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
- **reactor-monitor-app:** restart a worker reactor from the Overview tab ([1a66b39330](https://github.com/powerhouse-inc/powerhouse/commit/1a66b39330))
- **reactor-monitor-app:** create a drive from the Drives tab ([586f081c3b](https://github.com/powerhouse-inc/powerhouse/commit/586f081c3b))
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
- **reactor-monitor-app:** restart a worker reactor from the Overview tab ([1a66b39330](https://github.com/powerhouse-inc/powerhouse/commit/1a66b39330))
- **reactor-monitor-app:** create a drive from the Drives tab ([586f081c3b](https://github.com/powerhouse-inc/powerhouse/commit/586f081c3b))
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

- **reactor-monitor-app:** send an unpersisted bearer to a remote reactor ([0232756142](https://github.com/powerhouse-inc/powerhouse/commit/0232756142))
- **reactor-monitor:** build remote inspection queries from the wire fields ([d16699f94e](https://github.com/powerhouse-inc/powerhouse/commit/d16699f94e))

### 🩹 Fixes

- **reactor-monitor-app:** start the SharedWorker explicitly and assert its chunk ([1161861eff](https://github.com/powerhouse-inc/powerhouse/commit/1161861eff))
- **reactor-monitor-app:** stop saying no refs were seen once all are held ([0a57ca0eb2](https://github.com/powerhouse-inc/powerhouse/commit/0a57ca0eb2))
- **reactor-monitor-app:** show failed sync reads on the Sync tab ([1061f5df83](https://github.com/powerhouse-inc/powerhouse/commit/1061f5df83))
- **reactor-monitor-app:** keep the bearer field out of password managers ([2167f24ba2](https://github.com/powerhouse-inc/powerhouse/commit/2167f24ba2))
- **reactor-monitor-app:** never offer a remote reactor as a local-link end ([12c88118f2](https://github.com/powerhouse-inc/powerhouse/commit/12c88118f2))
- **reactor-monitor-app:** keep a failed processor retry on screen past the next poll ([61984b2c62](https://github.com/powerhouse-inc/powerhouse/commit/61984b2c62))
- **reactor-monitor-app:** repair sync through ISyncAdmin, cut rewind, show tracked storage health ([c8618d7e70](https://github.com/powerhouse-inc/powerhouse/commit/c8618d7e70))
- **reactor-monitor-app:** gate workflows on the reactor's info ([cee0d352a3](https://github.com/powerhouse-inc/powerhouse/commit/cee0d352a3))
- **reactor-monitor-app:** type the modules and drives tabs against the monitor inspector ([ee56228591](https://github.com/powerhouse-inc/powerhouse/commit/ee56228591))
- **reactor-monitor-app:** query the store only where the reactor serves SQL ([b67718c060](https://github.com/powerhouse-inc/powerhouse/commit/b67718c060))
- **reactor-monitor-app:** retry, sweep and rebuild through the admin levers ([fa5f989a44](https://github.com/powerhouse-inc/powerhouse/commit/fa5f989a44))
- **reactor-monitor-app:** render queue jobs as wire records and pause through the admin levers ([ea8b78b9b4](https://github.com/powerhouse-inc/powerhouse/commit/ea8b78b9b4))
- **reactor-monitor-app:** gate levers, SQL and operational reads on the reactor's info ([6c03222e60](https://github.com/powerhouse-inc/powerhouse/commit/6c03222e60))
- **reactor-monitor-app:** gate local sync links on the reactor's info ([670b8182ec](https://github.com/powerhouse-inc/powerhouse/commit/670b8182ec))
- **reactor-monitor-app:** route over local reactors as routable backends ([b3cd0e6c83](https://github.com/powerhouse-inc/powerhouse/commit/b3cd0e6c83))
- **reactor-workflow:** upload a step's output as a file-backed Blob ([8c943bfbeb](https://github.com/powerhouse-inc/powerhouse/commit/8c943bfbeb))
- **reactor-attachments:** hash and upload attachments without reading the whole file into memory ([f6532d6449](https://github.com/powerhouse-inc/powerhouse/commit/f6532d6449))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5