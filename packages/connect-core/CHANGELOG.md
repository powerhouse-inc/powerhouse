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