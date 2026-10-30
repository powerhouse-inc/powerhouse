## 6.2.3-dev.83 (2026-10-30)

### 🚀 Features

- **connect-core:** per-browser drive moves over the host's placement ([7f3329bba9](https://github.com/powerhouse-inc/powerhouse/commit/7f3329bba9))
- **connect-core:** route to one backend per switchboard, named by host key ([eb309ff74c](https://github.com/powerhouse-inc/powerhouse/commit/eb309ff74c))
- **connect-core:** read drive placement from the served config ([50181cd9ae](https://github.com/powerhouse-inc/powerhouse/commit/50181cd9ae))

### 🩹 Fixes

- **connect:** a kept copy is ready once it holds the switchboard's revision ([f327ce1fa6](https://github.com/powerhouse-inc/powerhouse/commit/f327ce1fa6))
- **connect-core:** wait for the copy whenever a drive's effective placement becomes this browser ([420d544c12](https://github.com/powerhouse-inc/powerhouse/commit/420d544c12))
- **connect:** wait for the copy in every tab, and re-read moves before reconciling at boot ([243e0813d7](https://github.com/powerhouse-inc/powerhouse/commit/243e0813d7))
- **connect-core:** other tabs follow a kept copy only once it has arrived ([3fe267ef02](https://github.com/powerhouse-inc/powerhouse/commit/3fe267ef02))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.82 (2026-10-29)

### 🚀 Features

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
- **connect:** a proxied Connect names its switchboard as ${origin}; the runner proxies the switchboard's paths ([bdaffdb580](https://github.com/powerhouse-inc/powerhouse/commit/bdaffdb580))
- **connect-core,reactor-browser:** a sign-in gate when the backend refuses the caller ([77eda7795b](https://github.com/powerhouse-inc/powerhouse/commit/77eda7795b))
- **document-model,codegen,reactor-api,ph-cli:** projects define their own GraphQL scalars ([968fa45a44](https://github.com/powerhouse-inc/powerhouse/commit/968fa45a44))

### 🩹 Fixes

- **connect-core:** the backend auth gate relists drives without importing the client ([06ddcdf1a1](https://github.com/powerhouse-inc/powerhouse/commit/06ddcdf1a1))
- **connect:** the sign-in gate renders in Connect's own root, survives StrictMode, and re-lists drives after a sign-in ([0ac4f667e7](https://github.com/powerhouse-inc/powerhouse/commit/0ac4f667e7))
- **connect-core:** the boot drive refresh records a Switchboard refusal instead of failing the boot ([6d0bd85c6e](https://github.com/powerhouse-inc/powerhouse/commit/6d0bd85c6e))
- **ci:** install academy lint dependencies and restore codegen test cwd ([c99d5e4fe4](https://github.com/powerhouse-inc/powerhouse/commit/c99d5e4fe4))

### ❤️ Thank You

- Claude Fable 5.1
- Claude Opus 5.5
- Wouter Kampmann
- Yasiel Cabrera

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
- **reactor-router,connect-core:** routed drive node reads use the backend's node queries ([23b098a1c7](https://github.com/powerhouse-inc/powerhouse/commit/23b098a1c7))
- **reactor-browser,connect-core,connect:** read drive nodes from read.drives through a per-drive cache, not from the drive document ([c51c39602e](https://github.com/powerhouse-inc/powerhouse/commit/c51c39602e))
- **reactor-api,switchboard:** vacuum full policy knob, no forced rewrite under load by default ([d6dcbf5cd0](https://github.com/powerhouse-inc/powerhouse/commit/d6dcbf5cd0))

### 🩹 Fixes

- **registry:** a failed tarball write no longer records its attachment ([5d3ae94bd8](https://github.com/powerhouse-inc/powerhouse/commit/5d3ae94bd8))
- **reactor-api:** the one-time VACUUM FULL is off by default; quiet and forced are opt-ins ([fd7c19e313](https://github.com/powerhouse-inc/powerhouse/commit/fd7c19e313))

### 🔥 Performance

- **reactor-browser,reactor-router,connect-core:** batch multi-document reads into getMany ([5b7cdef949](https://github.com/powerhouse-inc/powerhouse/commit/5b7cdef949))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.77 (2026-10-26)

### 🚀 Features

- **connect-core:** move the local id-check fallback into the router ([56fb81edb6](https://github.com/powerhouse-inc/powerhouse/commit/56fb81edb6))

### ❤️ Thank You

- Claude Fable 5.1
- Wouter Kampmann

## 6.2.3-dev.76 (2026-10-25)

This was a version bump only for @powerhousedao/connect-core to align it with other projects, there were no code changes.

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

- **connect,connect-core,design-system:** home page parts for a custom home, accessible sidebar items and a phone layout, a centred modal dialog, router devtools off by default ([19de3ad862](https://github.com/powerhouse-inc/powerhouse/commit/19de3ad862))
- **shared,connect,codegen:** ph init and ph migrate give a project the router as a peer at connect's version, and the host stylesheet shows light and dark tokens ([0829546eaf](https://github.com/powerhouse-inc/powerhouse/commit/0829546eaf))

### 🩹 Fixes

- **connect-core,connect,design-system,reactor-browser:** the create-document modal outside a drive asks for one, preselecting the only drive, and takes a driveId ([7ae549e673](https://github.com/powerhouse-inc/powerhouse/commit/7ae549e673))
- **builder-tools,connect-core,connect,ph-cli:** routes generation takes settings tab overrides, fails on two routes at one url, and warns on silent drops in builds and studio ([35461fda2c](https://github.com/powerhouse-inc/powerhouse/commit/35461fda2c))
- **connect-core,connect:** core's and connect's built code runs in plain node, so a project's loading shell prerenders ([ece1559217](https://github.com/powerhouse-inc/powerhouse/commit/ece1559217))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.71 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))
- **reactor-browser,design-system,connect-core,connect,vetra:** editor and drive contexts replace scoped PH stores; hosts pass editors and drive apps document and dispatch as props ([4596b2d037](https://github.com/powerhouse-inc/powerhouse/commit/4596b2d037))
- **design-system,connect-core,connect,shared:** theme.css holds Connect's tokens without its classes, plugins in plugins.css, one layer order with Tailwind's properties layer first ([f7ffdd1a27](https://github.com/powerhouse-inc/powerhouse/commit/f7ffdd1a27))
- **desktop:** vendor local package tarballs into the stack (PH_DESKTOP_LOCAL_PACKAGES) ([000bc39d10](https://github.com/powerhouse-inc/powerhouse/commit/000bc39d10))
- **codegen:** pure builders for generated outputs.js/.d.ts and the hosts typing files ([be3c35122f](https://github.com/powerhouse-inc/powerhouse/commit/be3c35122f))
- **connect,desktop:** layered backgrounds for the home screen and the loading page ([9ffe4915b4](https://github.com/powerhouse-inc/powerhouse/commit/9ffe4915b4))
- **host-core,ph-cli,switchboard,connect,codegen:** workflow plugins declare the drive and the link ([ab37f30600](https://github.com/powerhouse-inc/powerhouse/commit/ab37f30600))

### 🩹 Fixes

- **connect-core:** glob the route entries with tsdown, so a Windows build still emits dist/routes ([196c7b4b76](https://github.com/powerhouse-inc/powerhouse/commit/196c7b4b76))
- **connect-core:** ship the route files compiled, so an installed Connect pre-bundles them ([435a290711](https://github.com/powerhouse-inc/powerhouse/commit/435a290711))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.70 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))
- **reactor-browser,design-system,connect-core,connect,vetra:** editor and drive contexts replace scoped PH stores; hosts pass editors and drive apps document and dispatch as props ([4596b2d037](https://github.com/powerhouse-inc/powerhouse/commit/4596b2d037))
- **design-system,connect-core,connect,shared:** theme.css holds Connect's tokens without its classes, plugins in plugins.css, one layer order with Tailwind's properties layer first ([f7ffdd1a27](https://github.com/powerhouse-inc/powerhouse/commit/f7ffdd1a27))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.69 (2026-10-21)

This was a version bump only for @powerhousedao/connect-core to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/connect-core to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))
- **connect-core:** core's routes and views for home, drives, documents, settings, not found and modals, with a light and dark theme ([acaf09fbb7](https://github.com/powerhouse-inc/powerhouse/commit/acaf09fbb7))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))
- **connect-core:** router/core-views is the router's one lazy edge to core's views, so views importing router helpers makes no import cycle; ConnectCoreApp moves to the router ([289a788dd8](https://github.com/powerhouse-inc/powerhouse/commit/289a788dd8))
- **ph-cli,connect-core,connect,reactor-browser,builder-tools:** one browser build for a package's routes, and review fixes ([63e9fd3473](https://github.com/powerhouse-inc/powerhouse/commit/63e9fd3473))

### ❤️ Thank You

- acaldas
- Claude
- Claude Opus 5.5