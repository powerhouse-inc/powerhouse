## 6.2.3-dev.72 (2026-10-23)

### 🚀 Features

- **shared,connect,codegen:** ph init and ph migrate give a project the router as a peer at connect's version, and the host stylesheet shows light and dark tokens ([0829546eaf](https://github.com/powerhouse-inc/powerhouse/commit/0829546eaf))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.71 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))
- **desktop:** vendor local package tarballs into the stack (PH_DESKTOP_LOCAL_PACKAGES) ([000bc39d10](https://github.com/powerhouse-inc/powerhouse/commit/000bc39d10))
- **connect:** a connect host's config takes output tokens in its URL fields ([14846ab254](https://github.com/powerhouse-inc/powerhouse/commit/14846ab254))
- **host-core:** reject a $map in a non-collection field at declared validation ([4867b2726b](https://github.com/powerhouse-inc/powerhouse/commit/4867b2726b))
- **host-core:** type $key by its map's over; no literal undefined in templates ([18ece8decf](https://github.com/powerhouse-inc/powerhouse/commit/18ece8decf))
- **codegen:** scaffold cli/desktop attach every switchboard drive via $map ([ff607adada](https://github.com/powerhouse-inc/powerhouse/commit/ff607adada))
- **codegen:** vetra-switchboard serves the switchboard host's drives too ([8b1675b637](https://github.com/powerhouse-inc/powerhouse/commit/8b1675b637))
- **shared,codegen:** assistant.port slot in powerhouse.config.json ([bf1cba34da](https://github.com/powerhouse-inc/powerhouse/commit/bf1cba34da))
- **host-core:** expectHost, a pure per-host expectation ([d51a6fa7de](https://github.com/powerhouse-inc/powerhouse/commit/d51a6fa7de))
- **host-core:** $map / $item / $key resolve, declared checks and field typing ([42a8521faa](https://github.com/powerhouse-inc/powerhouse/commit/42a8521faa))
- **host-core:** defineHostSchemas builders get the set's field wrappers ([6430294d2d](https://github.com/powerhouse-inc/powerhouse/commit/6430294d2d))
- **host-core:** output-token resolver, declared/resolved host schemas, token-planned compound ([c37d42c6b6](https://github.com/powerhouse-inc/powerhouse/commit/c37d42c6b6))
- **host-core:** type-map entry for the generic compound runner ([c0338dc219](https://github.com/powerhouse-inc/powerhouse/commit/c0338dc219))
- **codegen:** pure builders for generated outputs.js/.d.ts and the hosts typing files ([be3c35122f](https://github.com/powerhouse-inc/powerhouse/commit/be3c35122f))
- **host-core:** @satisfies PHHost checks plugin configs; known specifiers match only their typed entry ([1b8760c3a2](https://github.com/powerhouse-inc/powerhouse/commit/1b8760c3a2))
- **host-core:** host files may import sibling outputs.js; process. is banned; stale outputs.js fails the load ([4c42a3f4ad](https://github.com/powerhouse-inc/powerhouse/commit/4c42a3f4ad))
- **host-core:** dead-config warnings for Connect slices whose plugin is not composed ([93d18eb43d](https://github.com/powerhouse-inc/powerhouse/commit/93d18eb43d))
- **host-core:** zod single source for host types, kind-aware validateHost, v2 run records ([66e4bcaccd](https://github.com/powerhouse-inc/powerhouse/commit/66e4bcaccd))
- **host-core:** output token types, ref(), and the PHHost type map ([53e77de4ce](https://github.com/powerhouse-inc/powerhouse/commit/53e77de4ce))
- **connect,desktop:** layered backgrounds for the home screen and the loading page ([9ffe4915b4](https://github.com/powerhouse-inc/powerhouse/commit/9ffe4915b4))
- splash images for the desktop loading page and Connect's home hero ([45a7e316b3](https://github.com/powerhouse-inc/powerhouse/commit/45a7e316b3))
- project icon sets for Connect and Desktop hosts (proof of concept) ([b0fb21b1de](https://github.com/powerhouse-inc/powerhouse/commit/b0fb21b1de))
- **host-core,ph-cli,switchboard,connect,codegen:** workflow plugins declare the drive and the link ([ab37f30600](https://github.com/powerhouse-inc/powerhouse/commit/ab37f30600))

### 🩹 Fixes

- **host-core:** finish() rejects an omitted deferred value in an array slot ([839fcaa10d](https://github.com/powerhouse-inc/powerhouse/commit/839fcaa10d))
- **host-core:** an absent optional output field omits the consuming property ([c402a8a781](https://github.com/powerhouse-inc/powerhouse/commit/c402a8a781))
- **host-core:** forward cspRegistrySync to any runner that declares it, else warn ([85637fc108](https://github.com/powerhouse-inc/powerhouse/commit/85637fc108))
- **host-core:** the compound runner names the project like start-run does ([36268da095](https://github.com/powerhouse-inc/powerhouse/commit/36268da095))
- **host-core:** compound members publish their schema-parsed outputs ([f958714648](https://github.com/powerhouse-inc/powerhouse/commit/f958714648))
- **host-core:** one-shot compound members get the ${userData}/${projectRoot} sugar ([15447e243e](https://github.com/powerhouse-inc/powerhouse/commit/15447e243e))
- **host-core:** a compound build takes no lock and writes no run record ([c4b882fc97](https://github.com/powerhouse-inc/powerhouse/commit/c4b882fc97))
- **host-core:** re-export the tokens by name, not export * ([432263592e](https://github.com/powerhouse-inc/powerhouse/commit/432263592e))
- **host-core:** the process. ban scans template literals properly ([26428a702d](https://github.com/powerhouse-inc/powerhouse/commit/26428a702d))
- **host-core:** a remote backend without a remote block fails validation ([9a0c0be688](https://github.com/powerhouse-inc/powerhouse/commit/9a0c0be688))
- **host-core,ph-cli:** review findings for $map ([9ff3e273bd](https://github.com/powerhouse-inc/powerhouse/commit/9ff3e273bd))
- **host-core:** token brands survive dts bundling; export the $map field types ([c5125f8c6a](https://github.com/powerhouse-inc/powerhouse/commit/c5125f8c6a))
- **host-core:** expectHost merges drives by served slug ([c00e1587c8](https://github.com/powerhouse-inc/powerhouse/commit/c00e1587c8))
- **host-core:** type the generic compound's host by its declared schema ([e2582ecded](https://github.com/powerhouse-inc/powerhouse/commit/e2582ecded))
- **host-core,ph-cli:** $$ escapes survive to the verb; connect members leave SIGTERM to the compound ([28b1c77ff7](https://github.com/powerhouse-inc/powerhouse/commit/28b1c77ff7))
- **host-core,ph-cli:** review findings on the T3 resolver ([9c8fda53a4](https://github.com/powerhouse-inc/powerhouse/commit/9c8fda53a4))
- **host-core:** keep validateHost's dotted issue paths ([59ed092313](https://github.com/powerhouse-inc/powerhouse/commit/59ed092313))
- **host-core:** hash the producer host name; allow a 'process' property of another object (review) ([84287f2ac8](https://github.com/powerhouse-inc/powerhouse/commit/84287f2ac8))
- **host-core:** a partial owned value Connect already serves is not dead config ([598cc8b859](https://github.com/powerhouse-inc/powerhouse/commit/598cc8b859))
- **host-core:** type the shared tsdown options as UserConfig ([1594b753b7](https://github.com/powerhouse-inc/powerhouse/commit/1594b753b7))

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

This was a version bump only for @powerhousedao/host-core to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/host-core to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/host-core to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/host-core to align it with other projects, there were no code changes.

## 6.2.3-dev.64 (2026-10-20)

### 🚀 Features

- **shared,switchboard,ph-cli,host-core,reactor-api:** one .ph root, user data under PH_USER_DATA_DIR (A3, A4b) ([19d53aeb36](https://github.com/powerhouse-inc/powerhouse/commit/19d53aeb36))

### 🩹 Fixes

- **reactor-api:** complete a removed subgraph's supergraph SSE streams ([9eac161e3c](https://github.com/powerhouse-inc/powerhouse/commit/9eac161e3c))
- **reactor-api:** complete a replaced or removed subgraph's SSE streams ([2cacef8d1d](https://github.com/powerhouse-inc/powerhouse/commit/2cacef8d1d))
- **releases:** parse pnpm publish output when packed paths contain braces ([a30562aeca](https://github.com/powerhouse-inc/powerhouse/commit/a30562aeca))
- **codegen,host-core:** desktop host stores in ${userData}/.ph, one dir per PGlite store (A4, A5) ([de35d74a9d](https://github.com/powerhouse-inc/powerhouse/commit/de35d74a9d))

### 🔥 Performance

- **ph-cli,docker:** serve precompressed wasm and data in connect preview and nginx ([85db6ff307](https://github.com/powerhouse-inc/powerhouse/commit/85db6ff307))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5
- Wouter Kampmann

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

### 🚀 Features

- **connect,host-core:** single reactorClient selector for all four client modes ([fe33899e8b](https://github.com/powerhouse-inc/powerhouse/commit/fe33899e8b))

### ❤️ Thank You

- Claude Fable 5
- Wouter Kampmann

## 6.2.3-dev.59 (2026-10-15)

### 🚀 Features

- **connect,vetra-studio:** browser plugin pipeline over the served composition (R3.2) + the studio plugins (R4 start) ([8fb91868da](https://github.com/powerhouse-inc/powerhouse/commit/8fb91868da))
- **switchboard:** workflows subsystem carved into the plugin composition (R2.5) ([e9467d9c38](https://github.com/powerhouse-inc/powerhouse/commit/e9467d9c38))
- **switchboard:** plugin pipeline scaffold for the subsystem carve (R2.1) ([042cd5a93c](https://github.com/powerhouse-inc/powerhouse/commit/042cd5a93c))
- **host-core:** plugin framework, drive declarations, sibling imports, full-statement wrappers (R1) ([008d01f90f](https://github.com/powerhouse-inc/powerhouse/commit/008d01f90f))

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
- desktop runner semantics — the generic compound replaces the ph-win sidecar ([96f8fa9ad7](https://github.com/powerhouse-inc/powerhouse/commit/96f8fa9ad7))
- **host-core,ph-cli:** structural multi-reactor — backends drive the routing client (P4.1-P4.3) ([e7c71ca7ac](https://github.com/powerhouse-inc/powerhouse/commit/e7c71ca7ac))
- **host-core:** per-member default verbs at compound run (P3.4 desktop shape) ([b99e704eae](https://github.com/powerhouse-inc/powerhouse/commit/b99e704eae))
- **host-core:** generic compound runner module with verb forwarding (P3.1, P3.2) ([111aae56a1](https://github.com/powerhouse-inc/powerhouse/commit/111aae56a1))
- **host-core:** emit editor JSON schemas for host files + drift test (P2.3) ([562bacf9be](https://github.com/powerhouse-inc/powerhouse/commit/562bacf9be))
- **host-core:** shared zod host schemas; bridges adopt strict reactor/profile (P2.1, P2.2) ([1bd9db67be](https://github.com/powerhouse-inc/powerhouse/commit/1bd9db67be))
- **vetra:** lint project subgraphs for types core or the package's models own ([6855c0ed91](https://github.com/powerhouse-inc/powerhouse/commit/6855c0ed91))
- **host-core:** reactor-config projections + protocol conflict guard (P2.1, P2.4, P2.5, P2.6) ([d1e6269b14](https://github.com/powerhouse-inc/powerhouse/commit/d1e6269b14))
- **host-core:** generic compound runner — runCompound supervision engine (P1.3) ([4090c98e3a](https://github.com/powerhouse-inc/powerhouse/commit/4090c98e3a))
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
- desktop runner semantics — the generic compound replaces the ph-win sidecar ([96f8fa9ad7](https://github.com/powerhouse-inc/powerhouse/commit/96f8fa9ad7))
- **host-core,ph-cli:** structural multi-reactor — backends drive the routing client (P4.1-P4.3) ([e7c71ca7ac](https://github.com/powerhouse-inc/powerhouse/commit/e7c71ca7ac))
- **host-core:** per-member default verbs at compound run (P3.4 desktop shape) ([b99e704eae](https://github.com/powerhouse-inc/powerhouse/commit/b99e704eae))
- **host-core:** generic compound runner module with verb forwarding (P3.1, P3.2) ([111aae56a1](https://github.com/powerhouse-inc/powerhouse/commit/111aae56a1))
- **host-core:** emit editor JSON schemas for host files + drift test (P2.3) ([562bacf9be](https://github.com/powerhouse-inc/powerhouse/commit/562bacf9be))
- **host-core:** shared zod host schemas; bridges adopt strict reactor/profile (P2.1, P2.2) ([1bd9db67be](https://github.com/powerhouse-inc/powerhouse/commit/1bd9db67be))
- **vetra:** lint project subgraphs for types core or the package's models own ([6855c0ed91](https://github.com/powerhouse-inc/powerhouse/commit/6855c0ed91))
- **host-core:** reactor-config projections + protocol conflict guard (P2.1, P2.4, P2.5, P2.6) ([d1e6269b14](https://github.com/powerhouse-inc/powerhouse/commit/d1e6269b14))
- **host-core:** generic compound runner — runCompound supervision engine (P1.3) ([4090c98e3a](https://github.com/powerhouse-inc/powerhouse/commit/4090c98e3a))
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