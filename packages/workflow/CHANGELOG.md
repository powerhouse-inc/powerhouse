## 6.2.3-dev.40 (2026-10-02)

### 🩹 Fixes

- **document-model:** leave unmatched @tokens in log messages as written ([0538ea019c](https://github.com/powerhouse-inc/powerhouse/commit/0538ea019c))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.39 (2026-10-02)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.38 (2026-10-01)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.37 (2026-10-01)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.36 (2026-10-01)

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

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

### 🩹 Fixes

- **workflow:** tell agents that publishing does not enable a workflow ([cbed7db121](https://github.com/powerhouse-inc/powerhouse/commit/cbed7db121))
- **workflow:** show a failed publish's error once the draft banner is gone ([f8278642aa](https://github.com/powerhouse-inc/powerhouse/commit/f8278642aa))
- **workflow:** drop the test of a block an undo removes, and settle a failed undo ([12c5073697](https://github.com/powerhouse-inc/powerhouse/commit/12c5073697))

### ❤️ Thank You

- acaldas

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

This was a version bump only for @powerhousedao/workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.31 (2026-09-29)

### 🚀 Features

- **workflow:** sign connections in with OAuth2 using their own app ([b03b33bf0](https://github.com/powerhouse-inc/powerhouse/commit/b03b33bf0))
- **reactor-workflow:** opt-in run retention sweep and dedupe cleanup for deleted workflows ([e2b6484aa](https://github.com/powerhouse-inc/powerhouse/commit/e2b6484aa))
- **reactor-workflow:** keyset-paginate the run listing through the subgraph and runs views ([d22a4eea5](https://github.com/powerhouse-inc/powerhouse/commit/d22a4eea5))
- **workflow:** publishing, step testing, versions, computed validity, ports and typed variables in the editors ([e2be02d2d](https://github.com/powerhouse-inc/powerhouse/commit/e2be02d2d))
- ⚠️  **workflow:** piece fields, publishing, skip, tests and typed variables in the workflow model ([60fb3777f](https://github.com/powerhouse-inc/powerhouse/commit/60fb3777f))

### 🩹 Fixes

- **workflow:** keep the field focused and the tree up while picking data ([5e93b1a38](https://github.com/powerhouse-inc/powerhouse/commit/5e93b1a38))
- **workflow:** open the panel for an added block and keep the connection field hidden until its form loads ([7edc28408](https://github.com/powerhouse-inc/powerhouse/commit/7edc28408))
- **workflow:** name canvas add buttons and retry a failed catalog load ([2d43667fc](https://github.com/powerhouse-inc/powerhouse/commit/2d43667fc))
- **workflow:** reword the variable type description so the subgraph doesn't read it as a type declaration ([030bad026](https://github.com/powerhouse-inc/powerhouse/commit/030bad026))
- ⚠️  **workflow:** read reactor piece ids, JSON and action input strictly ([1282ff102](https://github.com/powerhouse-inc/powerhouse/commit/1282ff102))

### ⚠️  Breaking Changes

- **workflow:** read reactor piece ids, JSON and action input strictly  ([1282ff102](https://github.com/powerhouse-inc/powerhouse/commit/1282ff102))
- **workflow:** piece fields, publishing, skip, tests and typed variables in the workflow model  ([60fb3777f](https://github.com/powerhouse-inc/powerhouse/commit/60fb3777f))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.30 (2026-09-29)

### 🩹 Fixes

- **deps:** load cmd-ts's ESM build under bun, which fails to require chalk from its CJS build ([749528c71](https://github.com/powerhouse-inc/powerhouse/commit/749528c71))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.29 (2026-09-28)

### 🩹 Fixes

- **reactor-workflow:** refuse a secrets master key other than the one secrets were stored with ([87cfde0f5](https://github.com/powerhouse-inc/powerhouse/commit/87cfde0f5))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.28 (2026-09-28)

### 🚀 Features

- **workflow:** split drive and folder, and give the reactor steps an action form ([b1939e431](https://github.com/powerhouse-inc/powerhouse/commit/b1939e431))
- **workflow:** render every Activepieces prop type and layout hint in the step form ([908e74733](https://github.com/powerhouse-inc/powerhouse/commit/908e74733))

### 🩹 Fixes

- **workflow:** reset source search on dismiss, keep picked labels, commit colour once, fold block descriptions ([585993cb6](https://github.com/powerhouse-inc/powerhouse/commit/585993cb6))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.27 (2026-09-28)

### 🩹 Fixes

- **workflow:** name a piece run's trigger in the runs table instead of showing its block type ([83b2956b4](https://github.com/powerhouse-inc/powerhouse/commit/83b2956b4))
- **workflow:** end long logo chains in +N instead of overflowing the next column ([8730c9407](https://github.com/powerhouse-inc/powerhouse/commit/8730c9407))

### ❤️ Thank You

- acaldas

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