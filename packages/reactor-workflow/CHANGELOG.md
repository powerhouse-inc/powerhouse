## 6.2.3-dev.23 (2026-09-24)

This was a version bump only for @powerhousedao/reactor-workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.22 (2026-09-23)

### 🚀 Features

- **workflow:** check a connection with the piece's own auth.validate ([2ce28e650](https://github.com/powerhouse-inc/powerhouse/commit/2ce28e650))

### 🩹 Fixes

- **ci:** slice the duration-watch baseline in jq, not through head ([73db497e0](https://github.com/powerhouse-inc/powerhouse/commit/73db497e0))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.21 (2026-09-22)

### 🚀 Features

- **reactor-api:** keep a package's pieces when it comes from a registry ([06c2bc6df](https://github.com/powerhouse-inc/powerhouse/commit/06c2bc6df))
- **workflow:** install what a piece bundle declares, when it declares any ([5262361ad](https://github.com/powerhouse-inc/powerhouse/commit/5262361ad))
- **workflow:** resolve an unpinned block type the same way everywhere ([d0e6aa8cb](https://github.com/powerhouse-inc/powerhouse/commit/d0e6aa8cb))
- **workflow:** resolve an unpinned trigger piece against the catalog ([82bfa4dbe](https://github.com/powerhouse-inc/powerhouse/commit/82bfa4dbe))

### 🩹 Fixes

- **workflow:** stamp a run with a name even when the workflow has none ([ae4d9b1ad](https://github.com/powerhouse-inc/powerhouse/commit/ae4d9b1ad))
- **workflow:** keep a package piece's audience, testStrategy and handshake ([c577fdb77](https://github.com/powerhouse-inc/powerhouse/commit/c577fdb77))
- **workflow:** keep a package piece's authored output shape ([625b0b88e](https://github.com/powerhouse-inc/powerhouse/commit/625b0b88e))
- **workflow:** list the engine's own blocks, and check a fresh connection ([4513eef24](https://github.com/powerhouse-inc/powerhouse/commit/4513eef24))
- ⚠️  **workflow:** serve ctx.reactor to the reactor piece alone ([eb06f5af6](https://github.com/powerhouse-inc/powerhouse/commit/eb06f5af6))
- **workflow:** tell an unreachable catalog apart from a piece that is gone ([8492afaad](https://github.com/powerhouse-inc/powerhouse/commit/8492afaad))
- **workflow:** carry the piece file limit to the worker child ([b3b82617a](https://github.com/powerhouse-inc/powerhouse/commit/b3b82617a))
- **workflow:** stop telling people to pin a version that does not exist ([6466b6329](https://github.com/powerhouse-inc/powerhouse/commit/6466b6329))
- **workflow:** fail a dispatch whose reducer rejected the action ([992976e99](https://github.com/powerhouse-inc/powerhouse/commit/992976e99))
- **workflow:** say so when a trigger names a piece nothing can resolve ([3f673ba86](https://github.com/powerhouse-inc/powerhouse/commit/3f673ba86))

### ⚠️  Breaking Changes

- **workflow:** serve ctx.reactor to the reactor piece alone  ([eb06f5af6](https://github.com/powerhouse-inc/powerhouse/commit/eb06f5af6))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.20 (2026-09-22)

### 🚀 Features

- **workflow:** let an error branch read why the step failed ([99242e124](https://github.com/powerhouse-inc/powerhouse/commit/99242e124))

### 🩹 Fixes

- **workflow:** floor a poll cadence at a second, and default it to a minute ([5049146a6](https://github.com/powerhouse-inc/powerhouse/commit/5049146a6))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.19 (2026-09-21)

### 🩹 Fixes

- **workflow:** let a step carry an attachment ref it is not allowed to open ([a700e098a](https://github.com/powerhouse-inc/powerhouse/commit/a700e098a))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.18 (2026-09-21)

### 🚀 Features

- **workflow:** drop the hand-written first-party catalog entries ([86d0f244b](https://github.com/powerhouse-inc/powerhouse/commit/86d0f244b))
- **workflow:** read pieces from a Powerhouse registry ([f1467e0b0](https://github.com/powerhouse-inc/powerhouse/commit/f1467e0b0))

### 🩹 Fixes

- **workflow:** hand a piece the JSON it cannot parse, instead of nothing ([4aa10a946](https://github.com/powerhouse-inc/powerhouse/commit/4aa10a946))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.17 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.16 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.15 (2026-09-20)

This was a version bump only for @powerhousedao/reactor-workflow to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.12 (2026-09-17)

### 🚀 Features

- **switchboard:** own the workflow runtime, feed it through a read model, and take workflows out of reactor-api ([#3042](https://github.com/powerhouse-inc/powerhouse/issues/3042))
- **reactor-workflow:** the workflow engine, composed in reactor-api behind the workflows flag ([cb807bf5d](https://github.com/powerhouse-inc/powerhouse/commit/cb807bf5d))
- **workflow:** the Connect-loaded workflow package, and the workflows flag in reactor-api ([0953fc254](https://github.com/powerhouse-inc/powerhouse/commit/0953fc254))
- **pieces-framework:** vendor the Activepieces piece framework as a Powerhouse package ([3da5dbea8](https://github.com/powerhouse-inc/powerhouse/commit/3da5dbea8))

### ❤️ Thank You

- acaldas