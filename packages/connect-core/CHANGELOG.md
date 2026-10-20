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