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