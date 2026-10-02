## 6.2.3-dev.40 (2026-10-02)

### 🩹 Fixes

- **document-model:** leave unmatched @tokens in log messages as written ([0538ea019c](https://github.com/powerhouse-inc/powerhouse/commit/0538ea019c))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.39 (2026-10-02)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.38 (2026-10-01)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.37 (2026-10-01)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.36 (2026-10-01)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.35 (2026-10-01)

### 🚀 Features

- ⚠️  **registry:** serve every replica from Postgres and S3, processing publishes in a worker ([0d25d5fe35](https://github.com/powerhouse-inc/powerhouse/commit/0d25d5fe35))
- **switchboard:** run the privacy add-on behind PH_PRIVACY_ENABLED ([38c9a43856](https://github.com/powerhouse-inc/powerhouse/commit/38c9a43856))
- **reactor-privacy:** erase requested documents on a serial schedule ([f4f31289a1](https://github.com/powerhouse-inc/powerhouse/commit/f4f31289a1))
- **reactor-privacy:** serve disclosure and erasure to supreme admins only ([7a6b5232cb](https://github.com/powerhouse-inc/powerhouse/commit/7a6b5232cb))
- **reactor-privacy:** scaffold the package and its migration ledger ([152ecff77b](https://github.com/powerhouse-inc/powerhouse/commit/152ecff77b))
- **reactor-drive:** erase a purged document's nodes in NodeProcessor ([5a608e73bf](https://github.com/powerhouse-inc/powerhouse/commit/5a608e73bf))
- **reactor-attachments:** delete a purged document's attachment references ([4121c83347](https://github.com/powerhouse-inc/powerhouse/commit/4121c83347))

### 🩹 Fixes

- **reactor:** a drive's purge does not require a live former member ([e8266b1035](https://github.com/powerhouse-inc/powerhouse/commit/e8266b1035))
- **reactor-privacy:** warn and record lastError while a leaked purge blocks dispatch ([cd6fe4f022](https://github.com/powerhouse-inc/powerhouse/commit/cd6fe4f022))
- **reactor-privacy:** reopen every failed request with no failed item each tick ([d9c19c3837](https://github.com/powerhouse-inc/powerhouse/commit/d9c19c3837))
- **reactor-api:** ignore polled refusals of an unknown kind ([aac4a3e752](https://github.com/powerhouse-inc/powerhouse/commit/aac4a3e752))
- **reactor-api:** fail a poll with a recoverable code when a refusal is not recorded ([3ab1c92f7b](https://github.com/powerhouse-inc/powerhouse/commit/3ab1c92f7b))
- **reactor:** keep a polled marker refusal only when the marker was owed ([07cae595da](https://github.com/powerhouse-inc/powerhouse/commit/07cae595da))
- **reactor:** persist a purge refusal only from a MARKER_REFUSED dead letter ([ef2c3f4729](https://github.com/powerhouse-inc/powerhouse/commit/ef2c3f4729))

### 🔥 Performance

- **reactor-privacy:** dispatch the next purge without rescanning the backlog ([5de3703ebf](https://github.com/powerhouse-inc/powerhouse/commit/5de3703ebf))

### ⚠️  Breaking Changes

- **registry:** serve every replica from Postgres and S3, processing publishes in a worker  ([0d25d5fe35](https://github.com/powerhouse-inc/powerhouse/commit/0d25d5fe35))
  /packages and /pieces return pages ({items,total,limit,offset,hasMore}) instead of full arrays, and piece bundles move to /-/pieces/bundled/<name>/<version>.tgz.

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.34 (2026-09-30)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.33 (2026-09-30)

### 🚀 Features

- **reactor:** add catch-up operator tools and observability ([5722d7836](https://github.com/powerhouse-inc/powerhouse/commit/5722d7836))

### 🩹 Fixes

- **reactor:** claim a batch for each read model as it queues ([c09b1de2a](https://github.com/powerhouse-inc/powerhouse/commit/c09b1de2a))
- **reactor:** settle a probe on its own xid, not on an empty xip ([4e0f0dab9](https://github.com/powerhouse-inc/powerhouse/commit/4e0f0dab9))
- **reactor:** leave a stream to the next sweep while its live pass runs ([53112bad4](https://github.com/powerhouse-inc/powerhouse/commit/53112bad4))
- **reactor:** start a head registration at the sequence head ([e06581849](https://github.com/powerhouse-inc/powerhouse/commit/e06581849))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.32 (2026-09-29)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.31 (2026-09-29)

### 🚀 Features

- **workflow:** sign connections in with OAuth2 using their own app ([b03b33bf0](https://github.com/powerhouse-inc/powerhouse/commit/b03b33bf0))
- ⚠️  **pieces-framework:** version matching, trigger strategy, schedule parsing and declared ports for workflows ([97a15b968](https://github.com/powerhouse-inc/powerhouse/commit/97a15b968))

### ⚠️  Breaking Changes

- **pieces-framework:** version matching, trigger strategy, schedule parsing and declared ports for workflows  ([97a15b968](https://github.com/powerhouse-inc/powerhouse/commit/97a15b968))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.30 (2026-09-29)

### 🩹 Fixes

- **deps:** load cmd-ts's ESM build under bun, which fails to require chalk from its CJS build ([749528c71](https://github.com/powerhouse-inc/powerhouse/commit/749528c71))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.29 (2026-09-28)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.28 (2026-09-28)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.27 (2026-09-28)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.26 (2026-09-26)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.25 (2026-09-25)

### 🚀 Features

- **workflow:** show run data in a lazy-loaded tree with copyable references, and scope the connection picker to the drive ([1d286f4a6](https://github.com/powerhouse-inc/powerhouse/commit/1d286f4a6))

### 🩹 Fixes

- **ci:** let the release skip the transpiler TypeScript 7 broke ([#36306](https://github.com/powerhouse-inc/powerhouse/issues/36306))

### ❤️ Thank You

- acaldas
- Guillermo Puente @gpuente

## 6.2.3-dev.24 (2026-09-25)

### 🚀 Features

- **reactor:** action signature integrity ([#3088](https://github.com/powerhouse-inc/powerhouse/pull/3088), [#2894](https://github.com/powerhouse-inc/powerhouse/issues/2894), [#7](https://github.com/powerhouse-inc/powerhouse/issues/7))
- **reactor-workflow:** validate props before a piece runs, naming each field ([de6288f85](https://github.com/powerhouse-inc/powerhouse/commit/de6288f85))
- type-safe piece authoring, upstream connection hooks, and a ph build that typechecks first ([#3082](https://github.com/powerhouse-inc/powerhouse/pull/3082))

### 🩹 Fixes

- **workflow:** build after powerhouse-vetra-packages so their tsc --build runs never overlap ([#3101](https://github.com/powerhouse-inc/powerhouse/pull/3101))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.23 (2026-09-24)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.22 (2026-09-23)

### 🩹 Fixes

- **ci:** slice the duration-watch baseline in jq, not through head ([73db497e0](https://github.com/powerhouse-inc/powerhouse/commit/73db497e0))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.21 (2026-09-22)

### 🚀 Features

- **workflow:** install what a piece bundle declares, when it declares any ([5262361ad](https://github.com/powerhouse-inc/powerhouse/commit/5262361ad))

### 🩹 Fixes

- ⚠️  **workflow:** serve ctx.reactor to the reactor piece alone ([eb06f5af6](https://github.com/powerhouse-inc/powerhouse/commit/eb06f5af6))

### ⚠️  Breaking Changes

- **workflow:** serve ctx.reactor to the reactor piece alone  ([eb06f5af6](https://github.com/powerhouse-inc/powerhouse/commit/eb06f5af6))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.20 (2026-09-22)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.19 (2026-09-21)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.18 (2026-09-21)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.17 (2026-09-21)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.16 (2026-09-21)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.15 (2026-09-20)

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/pieces-framework to align it with other projects, there were no code changes.

## 6.2.3-dev.12 (2026-09-17)

### 🚀 Features

- **switchboard:** own the workflow runtime, feed it through a read model, and take workflows out of reactor-api ([#3042](https://github.com/powerhouse-inc/powerhouse/issues/3042))
- **reactor-workflow:** the workflow engine, composed in reactor-api behind the workflows flag ([cb807bf5d](https://github.com/powerhouse-inc/powerhouse/commit/cb807bf5d))
- **workflow:** the Connect-loaded workflow package, and the workflows flag in reactor-api ([0953fc254](https://github.com/powerhouse-inc/powerhouse/commit/0953fc254))
- **pieces-framework:** vendor the Activepieces piece framework as a Powerhouse package ([3da5dbea8](https://github.com/powerhouse-inc/powerhouse/commit/3da5dbea8))

### ❤️ Thank You

- acaldas