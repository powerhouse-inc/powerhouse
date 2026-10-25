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