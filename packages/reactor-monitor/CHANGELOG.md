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