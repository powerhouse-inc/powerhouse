## 6.2.3-dev.36 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.35 (2026-10-01)

### 🚀 Features

- ⚠️  **registry:** serve every replica from Postgres and S3, processing publishes in a worker ([0d25d5fe35](https://github.com/powerhouse-inc/powerhouse/commit/0d25d5fe35))
- **reactor-workflow:** submit a reactor write and wait on it in slices ([5b9d3e327b](https://github.com/powerhouse-inc/powerhouse/commit/5b9d3e327b))
- **switchboard:** run the privacy add-on behind PH_PRIVACY_ENABLED ([38c9a43856](https://github.com/powerhouse-inc/powerhouse/commit/38c9a43856))
- **reactor-privacy:** erase requested documents on a serial schedule ([f4f31289a1](https://github.com/powerhouse-inc/powerhouse/commit/f4f31289a1))
- **reactor-privacy:** serve disclosure and erasure to supreme admins only ([7a6b5232cb](https://github.com/powerhouse-inc/powerhouse/commit/7a6b5232cb))
- **reactor-privacy:** scaffold the package and its migration ledger ([152ecff77b](https://github.com/powerhouse-inc/powerhouse/commit/152ecff77b))
- **reactor-drive:** erase a purged document's nodes in NodeProcessor ([5a608e73bf](https://github.com/powerhouse-inc/powerhouse/commit/5a608e73bf))
- **reactor-workflow:** erase the runs of a purged document ([eddbb70899](https://github.com/powerhouse-inc/powerhouse/commit/eddbb70899))
- **reactor-attachments:** delete a purged document's attachment references ([4121c83347](https://github.com/powerhouse-inc/powerhouse/commit/4121c83347))

### 🩹 Fixes

- **reactor-workflow:** page the registry piece catalog and fetch bundles from a folder per piece ([bc7439e3ee](https://github.com/powerhouse-inc/powerhouse/commit/bc7439e3ee))
- **reactor-workflow:** refuse to rerun a step or trigger test as a whole run ([6ff63f9042](https://github.com/powerhouse-inc/powerhouse/commit/6ff63f9042))
- **switchboard:** let workflow steps read attachments as they read documents ([b8c861360b](https://github.com/powerhouse-inc/powerhouse/commit/b8c861360b))
- **reactor-workflow:** fall back to the cloud catalog when the piece registry is down ([a72f4b53b3](https://github.com/powerhouse-inc/powerhouse/commit/a72f4b53b3))
- **reactor-workflow:** submit a reactor create and wait on it in slices ([2c1224f3e5](https://github.com/powerhouse-inc/powerhouse/commit/2c1224f3e5))
- **reactor-workflow:** refuse a late reactor submit and name one left unanswered ([bae14d56f5](https://github.com/powerhouse-inc/powerhouse/commit/bae14d56f5))
- **reactor-workflow:** bound the calls after a reactor job lands by the step deadline ([9d2456c385](https://github.com/powerhouse-inc/powerhouse/commit/9d2456c385))
- **reactor-workflow:** poll a reactor write to its outcome, not the host-call cap ([23ac79f2a6](https://github.com/powerhouse-inc/powerhouse/commit/23ac79f2a6))
- **reactor-workflow:** read the branch a reactor get names ([addd898de9](https://github.com/powerhouse-inc/powerhouse/commit/addd898de9))
- **reactor:** a drive's purge does not require a live former member ([e8266b1035](https://github.com/powerhouse-inc/powerhouse/commit/e8266b1035))
- **reactor-privacy:** warn and record lastError while a leaked purge blocks dispatch ([cd6fe4f022](https://github.com/powerhouse-inc/powerhouse/commit/cd6fe4f022))
- **reactor-privacy:** reopen every failed request with no failed item each tick ([d9c19c3837](https://github.com/powerhouse-inc/powerhouse/commit/d9c19c3837))
- **reactor-api:** ignore polled refusals of an unknown kind ([aac4a3e752](https://github.com/powerhouse-inc/powerhouse/commit/aac4a3e752))
- **reactor-api:** fail a poll with a recoverable code when a refusal is not recorded ([3ab1c92f7b](https://github.com/powerhouse-inc/powerhouse/commit/3ab1c92f7b))
- **reactor:** keep a polled marker refusal only when the marker was owed ([07cae595da](https://github.com/powerhouse-inc/powerhouse/commit/07cae595da))
- **reactor:** persist a purge refusal only from a MARKER_REFUSED dead letter ([ef2c3f4729](https://github.com/powerhouse-inc/powerhouse/commit/ef2c3f4729))
- **reactor-workflow:** reopen the run journal and fire unjournaled once ([5054629e2b](https://github.com/powerhouse-inc/powerhouse/commit/5054629e2b))
- **reactor-workflow:** erase test runs and lifecycle runs naming a purged id ([07426d1799](https://github.com/powerhouse-inc/powerhouse/commit/07426d1799))
- **reactor-workflow:** erase a purged workflow's own runs ([ece827ab5a](https://github.com/powerhouse-inc/powerhouse/commit/ece827ab5a))
- **reactor-workflow:** hold the triggers cursor while the journal is down ([7314c6c87c](https://github.com/powerhouse-inc/powerhouse/commit/7314c6c87c))
- **reactor-workflow:** disarm a workflow on its purge marker ([642617dccf](https://github.com/powerhouse-inc/powerhouse/commit/642617dccf))
- **reactor:** keep unfenced downstream read models outside the default fence ([9d38a1928a](https://github.com/powerhouse-inc/powerhouse/commit/9d38a1928a))
- **reactor-workflow:** read a purged trigger document as absent ([9202aefdf8](https://github.com/powerhouse-inc/powerhouse/commit/9202aefdf8))

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

- **reactor-workflow:** let EXISTS and DOES_NOT_EXIST test a field that is missing ([589f1e85f6](https://github.com/powerhouse-inc/powerhouse/commit/589f1e85f6))
- **reactor-workflow:** run an armed workflow's webhook deliveries while a trigger test waits ([c2db3402de](https://github.com/powerhouse-inc/powerhouse/commit/c2db3402de))
- **reactor-workflow:** migrate block_type journals to piece and block name columns ([236e2b00f0](https://github.com/powerhouse-inc/powerhouse/commit/236e2b00f0))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.33 (2026-09-30)

### 🚀 Features

- **reactor:** add catch-up operator tools and observability ([5722d7836](https://github.com/powerhouse-inc/powerhouse/commit/5722d7836))
- **reactor:** move read-model cursors to contiguous catch-up ([ae8859131](https://github.com/powerhouse-inc/powerhouse/commit/ae8859131))

### 🩹 Fixes

- **reactor:** claim a batch for each read model as it queues ([c09b1de2a](https://github.com/powerhouse-inc/powerhouse/commit/c09b1de2a))
- **reactor:** settle a probe on its own xid, not on an empty xip ([4e0f0dab9](https://github.com/powerhouse-inc/powerhouse/commit/4e0f0dab9))
- **reactor:** leave a stream to the next sweep while its live pass runs ([53112bad4](https://github.com/powerhouse-inc/powerhouse/commit/53112bad4))
- **reactor:** start a head registration at the sequence head ([e06581849](https://github.com/powerhouse-inc/powerhouse/commit/e06581849))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.32 (2026-09-29)

This was a version bump only for @powerhousedao/reactor-workflow to align it with other projects, there were no code changes.

## 6.2.3-dev.31 (2026-09-29)

### 🚀 Features

- **reactor-workflow:** run an action's test method in a single-step test ([42886840b](https://github.com/powerhouse-inc/powerhouse/commit/42886840b))
- **workflow:** sign connections in with OAuth2 using their own app ([b03b33bf0](https://github.com/powerhouse-inc/powerhouse/commit/b03b33bf0))
- **reactor-workflow:** opt-in run retention sweep and dedupe cleanup for deleted workflows ([e2b6484aa](https://github.com/powerhouse-inc/powerhouse/commit/e2b6484aa))
- **reactor-workflow:** keyset-paginate the run listing through the subgraph and runs views ([d22a4eea5](https://github.com/powerhouse-inc/powerhouse/commit/d22a4eea5))
- **reactor-workflow:** renew webhook trigger subscriptions ([4fc6bfea6](https://github.com/powerhouse-inc/powerhouse/commit/4fc6bfea6))
- ⚠️  **reactor-workflow:** run published workflows through versioned pieces, the built-in core piece and step tests ([6b848bc0c](https://github.com/powerhouse-inc/powerhouse/commit/6b848bc0c))

### 🩹 Fixes

- **reactor-workflow:** count recovered runs and pruned dedupe keys off RETURNING ([0ba67ffa4](https://github.com/powerhouse-inc/powerhouse/commit/0ba67ffa4))
- **reactor-workflow:** order runs by a key that doesn't change when they start ([f15425dd8](https://github.com/powerhouse-inc/powerhouse/commit/f15425dd8))
- **reactor-workflow:** disarm a workflow's trigger when its document is deleted ([866427bc6](https://github.com/powerhouse-inc/powerhouse/commit/866427bc6))
- **reactor-workflow:** list connections past the first page ([9b611b7ff](https://github.com/powerhouse-inc/powerhouse/commit/9b611b7ff))
- **reactor-workflow:** claim dedupe and enqueue the run in one transaction ([1718ae86f](https://github.com/powerhouse-inc/powerhouse/commit/1718ae86f))

### 🔥 Performance

- **reactor-workflow:** batch run listing step and document reads ([c33a42f7d](https://github.com/powerhouse-inc/powerhouse/commit/c33a42f7d))
- **reactor-workflow:** index run listings, dedupe prunes and due triggers ([588945432](https://github.com/powerhouse-inc/powerhouse/commit/588945432))

### ⚠️  Breaking Changes

- **reactor-workflow:** run published workflows through versioned pieces, the built-in core piece and step tests  ([6b848bc0c](https://github.com/powerhouse-inc/powerhouse/commit/6b848bc0c))

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

- **reactor-workflow:** carry Activepieces layout hints, property groups and search to the editor ([4eca1e1bd](https://github.com/powerhouse-inc/powerhouse/commit/4eca1e1bd))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.27 (2026-09-28)

### 🩹 Fixes

- **reactor-workflow:** hand a fired run back only as run would serve it ([8b9237433](https://github.com/powerhouse-inc/powerhouse/commit/8b9237433))
- **reactor-workflow:** gate a run on the documents its steps were handed ([f50b602a4](https://github.com/powerhouse-inc/powerhouse/commit/f50b602a4))
- **reactor-workflow:** serve workflow reads and runs as the caller ([b2ddd126a](https://github.com/powerhouse-inc/powerhouse/commit/b2ddd126a))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.26 (2026-09-26)

### 🩹 Fixes

- **reactor-workflow:** hand a fired run back only as run would serve it ([8b9237433](https://github.com/powerhouse-inc/powerhouse/commit/8b9237433))
- **reactor-workflow:** gate a run on the documents its steps were handed ([f50b602a4](https://github.com/powerhouse-inc/powerhouse/commit/f50b602a4))
- **reactor-workflow:** serve workflow reads and runs as the caller ([b2ddd126a](https://github.com/powerhouse-inc/powerhouse/commit/b2ddd126a))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.25 (2026-09-25)

### 🚀 Features

- **reactor-workflow:** run pieces with several sign-in methods through the connection's own method ([4293a9ff8](https://github.com/powerhouse-inc/powerhouse/commit/4293a9ff8))
- **workflow:** show run data in a lazy-loaded tree with copyable references, and scope the connection picker to the drive ([1d286f4a6](https://github.com/powerhouse-inc/powerhouse/commit/1d286f4a6))
- **reactor-workflow:** record when each step starts and ends ([6f6d8a233](https://github.com/powerhouse-inc/powerhouse/commit/6f6d8a233))

### 🩹 Fixes

- **ci:** let the release skip the transpiler TypeScript 7 broke ([#36306](https://github.com/powerhouse-inc/powerhouse/issues/36306))

### ❤️ Thank You

- acaldas
- Guillermo Puente @gpuente

## 6.2.3-dev.24 (2026-09-25)

### 🚀 Features

- **reactor:** action signature integrity ([#3088](https://github.com/powerhouse-inc/powerhouse/pull/3088), [#2894](https://github.com/powerhouse-inc/powerhouse/issues/2894), [#7](https://github.com/powerhouse-inc/powerhouse/issues/7))
- **reactor-workflow:** refuse the auth and trigger features the engine can't run ([7ce03d28f](https://github.com/powerhouse-inc/powerhouse/commit/7ce03d28f))
- **reactor-workflow:** hand pieces the real run, workflow, project and step ids ([3ad6c1c60](https://github.com/powerhouse-inc/powerhouse/commit/3ad6c1c60))
- **reactor-workflow:** validate props before a piece runs, naming each field ([de6288f85](https://github.com/powerhouse-inc/powerhouse/commit/de6288f85))
- type-safe piece authoring, upstream connection hooks, and a ph build that typechecks first ([#3082](https://github.com/powerhouse-inc/powerhouse/pull/3082))

### 🩹 Fixes

- **workflow:** build after powerhouse-vetra-packages so their tsc --build runs never overlap ([#3101](https://github.com/powerhouse-inc/powerhouse/pull/3101))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

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