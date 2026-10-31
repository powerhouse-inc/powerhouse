## 6.2.3-dev.87 (2026-10-31)

### 🚀 Features

- **host-core:** warn when two compound members declare one port ([493216cf65](https://github.com/powerhouse-inc/powerhouse/commit/493216cf65))
- **document-model:** add the code-first definition kernel ([5cf4c8ec4b](https://github.com/powerhouse-inc/powerhouse/commit/5cf4c8ec4b))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5
- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.86 (2026-10-30)

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

## 6.2.3-dev.85 (2026-10-30)

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

## 6.2.3-dev.84 (2026-10-30)

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

## 6.2.3-dev.83 (2026-10-30)

### 🩹 Fixes

- **connect:** a kept copy is ready once it holds the switchboard's revision ([f327ce1fa6](https://github.com/powerhouse-inc/powerhouse/commit/f327ce1fa6))
- **connect:** wait for the copy in every tab, and re-read moves before reconciling at boot ([243e0813d7](https://github.com/powerhouse-inc/powerhouse/commit/243e0813d7))

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
- **document-model,codegen,reactor-api,ph-cli:** projects define their own GraphQL scalars ([968fa45a44](https://github.com/powerhouse-inc/powerhouse/commit/968fa45a44))

### 🩹 Fixes

- **ci:** install academy lint dependencies and restore codegen test cwd ([c99d5e4fe4](https://github.com/powerhouse-inc/powerhouse/commit/c99d5e4fe4))

### ❤️ Thank You

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

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

## 6.2.3-dev.76 (2026-10-25)

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/vetra-studio to align it with other projects, there were no code changes.

## 6.2.3-dev.59 (2026-10-15)

### 🚀 Features

- **connect,vetra-studio:** browser plugin pipeline over the served composition (R3.2) + the studio plugins (R4 start) ([8fb91868da](https://github.com/powerhouse-inc/powerhouse/commit/8fb91868da))
- **switchboard:** plugin pipeline scaffold for the subsystem carve (R2.1) ([042cd5a93c](https://github.com/powerhouse-inc/powerhouse/commit/042cd5a93c))

### ❤️ Thank You

- Claude Fable 5
- Wouter Kampmann