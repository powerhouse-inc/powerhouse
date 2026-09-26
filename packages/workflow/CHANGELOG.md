## 6.2.3-dev.26 (2026-09-26)

### 🩹 Fixes

- **workflow:** name a piece run's trigger in the runs table instead of showing its block type ([83b2956b4](https://github.com/powerhouse-inc/powerhouse/commit/83b2956b4))
- **workflow:** end long logo chains in +N instead of overflowing the next column ([8730c9407](https://github.com/powerhouse-inc/powerhouse/commit/8730c9407))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.25 (2026-09-25)

### 🚀 Features

- **workflow:** let a connection choose among its piece's sign-in methods ([ddd04de0d](https://github.com/powerhouse-inc/powerhouse/commit/ddd04de0d))
- **workflow:** show run data in a lazy-loaded tree with copyable references, and scope the connection picker to the drive ([1d286f4a6](https://github.com/powerhouse-inc/powerhouse/commit/1d286f4a6))
- **workflow:** one editor header, a schedule builder, run timelines and connection checks ([b11c4710e](https://github.com/powerhouse-inc/powerhouse/commit/b11c4710e))
- **reactor-workflow:** record when each step starts and ends ([6f6d8a233](https://github.com/powerhouse-inc/powerhouse/commit/6f6d8a233))
- **workflow:** show saved connection secrets as locked cards with replace, reveal and reference controls ([fc59e6829](https://github.com/powerhouse-inc/powerhouse/commit/fc59e6829))
- **workflow:** a workflow overview, run chains, plain-language triggers and a Last run tab ([39866eac5](https://github.com/powerhouse-inc/powerhouse/commit/39866eac5))
- **workflow:** restyle Studio and the editors on theme tokens, with a two-tab step panel ([52732d931](https://github.com/powerhouse-inc/powerhouse/commit/52732d931))

### 🩹 Fixes

- **ci:** let the release skip the transpiler TypeScript 7 broke ([#36306](https://github.com/powerhouse-inc/powerhouse/issues/36306))
- **workflow:** full step references, drop other sign-in methods' secrets on switch, and read older interval schedules ([b36799493](https://github.com/powerhouse-inc/powerhouse/commit/b36799493))
- **workflow:** keep the step track's rings unclipped and draw its logos with BlockLogo ([ee519671d](https://github.com/powerhouse-inc/powerhouse/commit/ee519671d))
- **workflow:** size the dark-mode logo tile's padding in pixels ([f83a63762](https://github.com/powerhouse-inc/powerhouse/commit/f83a63762))
- **workflow:** name piece actions and triggers by their catalog names ([8561f9806](https://github.com/powerhouse-inc/powerhouse/commit/8561f9806))
- **workflow:** bind field labels to their controls and keep Select keyboard-operable ([dc573eb54](https://github.com/powerhouse-inc/powerhouse/commit/dc573eb54))

### ❤️ Thank You

- acaldas
- Guillermo Puente @gpuente

## 6.2.3-dev.24 (2026-09-25)

### 🚀 Features

- **reactor:** action signature integrity ([#3088](https://github.com/powerhouse-inc/powerhouse/pull/3088), [#2894](https://github.com/powerhouse-inc/powerhouse/issues/2894), [#7](https://github.com/powerhouse-inc/powerhouse/issues/7))
- **reactor-workflow:** refuse the auth and trigger features the engine can't run ([7ce03d28f](https://github.com/powerhouse-inc/powerhouse/commit/7ce03d28f))

### 🩹 Fixes

- **workflow:** build after powerhouse-vetra-packages so their tsc --build runs never overlap ([#3101](https://github.com/powerhouse-inc/powerhouse/pull/3101))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.23 (2026-09-24)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.22 (2026-09-23)

### 🩹 Fixes

- **ci:** slice the duration-watch baseline in jq, not through head ([73db497e0](https://github.com/powerhouse-inc/powerhouse/commit/73db497e0))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.21 (2026-09-22)

### 🩹 Fixes

- **workflow:** fail a dispatch whose reducer rejected the action ([992976e99](https://github.com/powerhouse-inc/powerhouse/commit/992976e99))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.20 (2026-09-22)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.19 (2026-09-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.18 (2026-09-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.17 (2026-09-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.16 (2026-09-21)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.15 (2026-09-20)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.14 (2026-09-19)

### 🚀 Features

- **ph-cli:** build pieces on ph build ([3913b0796](https://github.com/powerhouse-inc/powerhouse/commit/3913b0796))
- **doc-harness:** serve rendered reports and transcripts from mastra studio ([fd64a4661](https://github.com/powerhouse-inc/powerhouse/commit/fd64a4661))
- **doc-harness:** workflows, steps, and the run/resume/inspect commands ([0e116d226](https://github.com/powerhouse-inc/powerhouse/commit/0e116d226))
- **doc-harness:** pilot task catalog with pinned recipe inputs ([74bc26129](https://github.com/powerhouse-inc/powerhouse/commit/74bc26129))
- **doc-harness:** workspace wiring and core schemas for the docs-validation harness ([5c591ac69](https://github.com/powerhouse-inc/powerhouse/commit/5c591ac69))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.13 (2026-09-18)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.12 (2026-09-17)

### 🚀 Features

- **switchboard:** own the workflow runtime, feed it through a read model, and take workflows out of reactor-api ([#3042](https://github.com/powerhouse-inc/powerhouse/issues/3042))
- **reactor-workflow:** the workflow engine, composed in reactor-api behind the workflows flag ([cb807bf5d](https://github.com/powerhouse-inc/powerhouse/commit/cb807bf5d))
- **workflow:** the Connect-loaded workflow package, and the workflows flag in reactor-api ([0953fc254](https://github.com/powerhouse-inc/powerhouse/commit/0953fc254))
- **pieces-framework:** vendor the Activepieces piece framework as a Powerhouse package ([3da5dbea8](https://github.com/powerhouse-inc/powerhouse/commit/3da5dbea8))

### ❤️ Thank You

- acaldas