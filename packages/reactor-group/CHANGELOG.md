## 6.2.3-dev.48 (2026-10-07)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.47 (2026-10-07)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.46 (2026-10-07)

### 🚀 Features

- **connect:** load local project models in the reactor worker ([6e2929ce60](https://github.com/powerhouse-inc/powerhouse/commit/6e2929ce60))

### 🩹 Fixes

- **builder-tools:** make the worker bundle survive consumer projects ([6361a66b6d](https://github.com/powerhouse-inc/powerhouse/commit/6361a66b6d))
- **builder-tools:** assert the vendor-dir mode only where modes exist ([f47c32a020](https://github.com/powerhouse-inc/powerhouse/commit/f47c32a020))

### ❤️ Thank You

- Claude Fable 5
- Wouter Kampmann

## 6.2.3-dev.45 (2026-10-06)

### 🚀 Features

- ⚠️  **reactor-workflow:** let any workflow piece read and write documents through the reactor ([fcccf0dfca](https://github.com/powerhouse-inc/powerhouse/commit/fcccf0dfca))

### 🩹 Fixes

- **pglite:** bound the old-dir removal after conversion ([0aef46f0ca](https://github.com/powerhouse-inc/powerhouse/commit/0aef46f0ca))
- **pglite:** open files read-write for the tree sync ([ce0fa23af5](https://github.com/powerhouse-inc/powerhouse/commit/ce0fa23af5))
- **switchboard:** resolve the legacy pg_dump wasm path on Windows ([c35148183a](https://github.com/powerhouse-inc/powerhouse/commit/c35148183a))

### 🔥 Performance

- **pglite:** sync the tree once after initdb, conversion and migration ([9ec8caf970](https://github.com/powerhouse-inc/powerhouse/commit/9ec8caf970))

### ⚠️  Breaking Changes

- **reactor-workflow:** let any workflow piece read and write documents through the reactor  ([fcccf0dfca](https://github.com/powerhouse-inc/powerhouse/commit/fcccf0dfca))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.44 (2026-10-06)

### 🩹 Fixes

- **analytics:** anchor periods and timestamps to UTC ([#3175](https://github.com/powerhouse-inc/powerhouse/pull/3175))
- **reactor:** make the reactor suite pass on Windows ([#3171](https://github.com/powerhouse-inc/powerhouse/pull/3171))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5 (1M context)
- Wouter Kampmann

## 6.2.3-dev.43 (2026-10-05)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.42 (2026-10-04)

### 🩹 Fixes

- **registry:** stop a tarball stream's late fstat from crashing the registry ([84f56c54bf](https://github.com/powerhouse-inc/powerhouse/commit/84f56c54bf))
- **reactor:** let executor workers load document models from the registry ([8ae1911d44](https://github.com/powerhouse-inc/powerhouse/commit/8ae1911d44))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.41 (2026-10-03)

### 🩹 Fixes

- **registry:** stop a tarball stream's late fstat from crashing the registry ([84f56c54bf](https://github.com/powerhouse-inc/powerhouse/commit/84f56c54bf))
- **reactor:** let executor workers load document models from the registry ([8ae1911d44](https://github.com/powerhouse-inc/powerhouse/commit/8ae1911d44))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.40 (2026-10-02)

### 🩹 Fixes

- **document-model:** leave unmatched @tokens in log messages as written ([0538ea019c](https://github.com/powerhouse-inc/powerhouse/commit/0538ea019c))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.39 (2026-10-02)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.38 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.37 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.36 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.31 (2026-09-29)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.30 (2026-09-29)

### 🩹 Fixes

- **deps:** load cmd-ts's ESM build under bun, which fails to require chalk from its CJS build ([749528c71](https://github.com/powerhouse-inc/powerhouse/commit/749528c71))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.29 (2026-09-28)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.28 (2026-09-28)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.27 (2026-09-28)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.26 (2026-09-26)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

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

### 🩹 Fixes

- **workflow:** build after powerhouse-vetra-packages so their tsc --build runs never overlap ([#3101](https://github.com/powerhouse-inc/powerhouse/pull/3101))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1

## 6.2.3-dev.23 (2026-09-24)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.22 (2026-09-23)

### 🩹 Fixes

- **ci:** slice the duration-watch baseline in jq, not through head ([73db497e0](https://github.com/powerhouse-inc/powerhouse/commit/73db497e0))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.21 (2026-09-22)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.20 (2026-09-22)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.19 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.18 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.17 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.16 (2026-09-21)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.15 (2026-09-20)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.12 (2026-09-17)

### 🚀 Features

- **switchboard:** own the workflow runtime, feed it through a read model, and take workflows out of reactor-api ([#3042](https://github.com/powerhouse-inc/powerhouse/issues/3042))
- **reactor-workflow:** the workflow engine, composed in reactor-api behind the workflows flag ([cb807bf5d](https://github.com/powerhouse-inc/powerhouse/commit/cb807bf5d))
- **workflow:** the Connect-loaded workflow package, and the workflows flag in reactor-api ([0953fc254](https://github.com/powerhouse-inc/powerhouse/commit/0953fc254))
- **pieces-framework:** vendor the Activepieces piece framework as a Powerhouse package ([3da5dbea8](https://github.com/powerhouse-inc/powerhouse/commit/3da5dbea8))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.11 (2026-09-17)

### 🚀 Features

- **reactor-browser,design-system:** keep the legacy useDocumentOperations and RevisionHistory shapes as deprecated aliases ([6de05e632](https://github.com/powerhouse-inc/powerhouse/commit/6de05e632))

### 🩹 Fixes

- **design-system,connect:** end the history walk on a failed page and show what loaded ([95f815b46](https://github.com/powerhouse-inc/powerhouse/commit/95f815b46))
- hold the timeline revision until the global history is loaded, default to the global scope, hide paging mid-load ([80c3b1289](https://github.com/powerhouse-inc/powerhouse/commit/80c3b1289))
- **reactor-browser:** page operations through nextCursor and invalidate alias keys ([ccb965869](https://github.com/powerhouse-inc/powerhouse/commit/ccb965869))

### 🔥 Performance

- **design-system,connect:** wait for the whole history before rendering the timeline, yield between pages, fetch 500 per page ([86435721c](https://github.com/powerhouse-inc/powerhouse/commit/86435721c))

### ❤️ Thank You

- Frank Pfeift

## 6.2.3-dev.10 (2026-09-16)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.9 (2026-09-15)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.8 (2026-09-15)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.7 (2026-09-14)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.6 (2026-09-14)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.3-dev.5 (2026-09-13)

### 🩹 Fixes

- **reactor-api:** warn at boot when auth is on but anonymous is still admitted ([84605330c](https://github.com/powerhouse-inc/powerhouse/commit/84605330c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5

## 6.2.3-dev.4 (2026-09-12)

### 🩹 Fixes

- **reactor-api:** warn at boot when auth is on but anonymous is still admitted ([84605330c](https://github.com/powerhouse-inc/powerhouse/commit/84605330c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5

## 6.2.3-dev.3 (2026-09-11)

### 🚀 Features

- **reactor-api:** add in-process stitching gateway adapter ([#1565](https://github.com/powerhouse-inc/powerhouse/issues/1565))

### 🩹 Fixes

- **claude:** bench-loop offers the after-record a fix produced instead of counting its FIXED citation as read ([c4b4690be](https://github.com/powerhouse-inc/powerhouse/commit/c4b4690be))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- froid1911

## 6.2.3-dev.2 (2026-09-10)

### 🩹 Fixes

- **ci:** roll out prod registry on production releases ([354085855](https://github.com/powerhouse-inc/powerhouse/commit/354085855))
- **switchboard-lb:** keep a webhook token out of the logs and traces ([5cfdb6e93](https://github.com/powerhouse-inc/powerhouse/commit/5cfdb6e93))

### ❤️ Thank You

- acaldas
- froid1911

## 6.2.3-dev.1 (2026-09-10)

### 🚀 Features

- **shared:** add install-spec parsing and update-target resolution ([#2357](https://github.com/powerhouse-inc/powerhouse/issues/2357))

### ❤️ Thank You

- froid1911

## 6.2.3-dev.0 (2026-09-10)

### 🚀 Features

- **switchboard-lb:** route the webhook and package-REST classes ([df18b32a7](https://github.com/powerhouse-inc/powerhouse/commit/df18b32a7))

### 🩹 Fixes

- **docker:** make the switchboard load harness buildable again ([cb65fac68](https://github.com/powerhouse-inc/powerhouse/commit/cb65fac68))

### ❤️ Thank You

- acaldas

## 6.2.2-dev.88 (2026-09-10)

### 🚀 Features

- add standalone stale-bot tool (ported sweep + headless driver) ([ed2846a6a](https://github.com/powerhouse-inc/powerhouse/commit/ed2846a6a))

### 🩹 Fixes

- use labels[] in stale-bot addLabel (label field 422s) ([f40b4e0ad](https://github.com/powerhouse-inc/powerhouse/commit/f40b4e0ad))

### ❤️ Thank You

- froid1911

## 6.2.2-dev.87 (2026-09-09)

### 🩹 Fixes

- **ci:** test package managers against pnpm latest ([#2990](https://github.com/powerhouse-inc/powerhouse/issues/2990))

### ❤️ Thank You

- froid1911

## 6.2.2-dev.86 (2026-09-09)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.85 (2026-09-09)

### 🚀 Features

- **reactor-api:** prefill GraphiQL explorer from explorerURLState ([f609aaaa0](https://github.com/powerhouse-inc/powerhouse/commit/f609aaaa0))

### 🩹 Fixes

- **ci:** move @jsr registry mapping to the root .npmrc ([56092b254](https://github.com/powerhouse-inc/powerhouse/commit/56092b254))
- **reactor-browser:** remove duplicate graphql dependency and clean lockfile ([472c42a1c](https://github.com/powerhouse-inc/powerhouse/commit/472c42a1c))
- **reactor-browser:** prefill Switchboard link with document-scoped query ([db58970d3](https://github.com/powerhouse-inc/powerhouse/commit/db58970d3))

### ❤️ Thank You

- froid1911

## 6.2.2-dev.84 (2026-09-09)

### 🚀 Features

- download drive folders as zip archives with round-trip import ([#134](https://github.com/powerhouse-inc/powerhouse/pull/134), [#2986](https://github.com/powerhouse-inc/powerhouse/pull/2986))
- **scripts:** add new-worktree.sh to create ready-to-test worktrees ([#2982](https://github.com/powerhouse-inc/powerhouse/pull/2982))

### 🩹 Fixes

- **academy:** pin cross-env instead of catalog: so the Docker build resolves ([705d68a09](https://github.com/powerhouse-inc/powerhouse/commit/705d68a09))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5
- Frank @froid1911

## 6.2.2-dev.83 (2026-09-08)

### 🩹 Fixes

- **release:** create the GitHub release after the push, not during changelog ([df3d2c88c](https://github.com/powerhouse-inc/powerhouse/commit/df3d2c88c))

### ❤️ Thank You

- acaldas

## 6.2.2-dev.82 (2026-09-08)

### 🩹 Fixes

- **release:** emit the pnpm 11+ scoped-registry publish flag ([1ddf2464b](https://github.com/powerhouse-inc/powerhouse/commit/1ddf2464b))
- **ci:** route the @jsr scope from the workspace root .npmrc ([#2968](https://github.com/powerhouse-inc/powerhouse/pull/2968))
- **ci:** resolve @jsr scope to npm.jsr.io in pnpm-workspace ([d5dd3a39e](https://github.com/powerhouse-inc/powerhouse/commit/d5dd3a39e))

### ❤️ Thank You

- acaldas
- Frank @froid1911

## 6.2.2-dev.81 (2026-09-05)

### 🚀 Features

- **reactor:** a FIXED task must cite a benchmark measured at the fix commit ([c091953ad](https://github.com/powerhouse-inc/powerhouse/commit/c091953ad))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5

## 6.2.2-dev.80 (2026-09-04)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.79 (2026-09-04)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.78 (2026-09-04)

### 🚀 Features

- **bench:** bench:fix gate picks the next VERIFIED task when no id is given ([7c0560964](https://github.com/powerhouse-inc/powerhouse/commit/7c0560964))
- **bench:** bench-fixer agent and /bench-fix command close a verified finding ([9a2cbfdfe](https://github.com/powerhouse-inc/powerhouse/commit/9a2cbfdfe))

### 🩹 Fixes

- **connect:** stop serving stale builds after a deploy ([#2960](https://github.com/powerhouse-inc/powerhouse/pull/2960))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- Frank @froid1911

## 6.2.2-dev.77 (2026-09-03)

### 🚀 Features

- **connect:** AI chat assistant with settings, feature flag, and markdown ([#2956](https://github.com/powerhouse-inc/powerhouse/pull/2956))
- **reactor:** pure data layer for a bench records viewer ([d7abdde8e](https://github.com/powerhouse-inc/powerhouse/commit/d7abdde8e))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- Frank @froid1911

## 6.2.2-dev.76 (2026-09-03)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.75 (2026-09-03)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.74 (2026-09-02)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.73 (2026-09-02)

### 🚀 Features

- **reactor:** one script runs the benchmarks and records them ([89f958f97](https://github.com/powerhouse-inc/powerhouse/commit/89f958f97))
- three bench agents and the loop that runs them back to back ([af0e7467f](https://github.com/powerhouse-inc/powerhouse/commit/af0e7467f))
- **reactor:** add zod schemas for benchmark and task records ([9869572ba](https://github.com/powerhouse-inc/powerhouse/commit/9869572ba))

### 🩹 Fixes

- **ci:** emit an empty changed-files list without a trailing space ([366ad4d96](https://github.com/powerhouse-inc/powerhouse/commit/366ad4d96))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5

## 6.2.2-dev.72 (2026-09-02)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.71 (2026-09-01)

### 🚀 Features

- agent-managed Vetra with per-project ports ([#2946](https://github.com/powerhouse-inc/powerhouse/pull/2946))

### 🩹 Fixes

- **reactor-api:** hold @apollo/subgraph below 2.15 and use its array form ([ec6d19da0](https://github.com/powerhouse-inc/powerhouse/commit/ec6d19da0))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5
- Frank @froid1911

## 6.2.2-dev.70 (2026-09-01)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.69 (2026-08-31)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.68 (2026-08-31)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.67 (2026-08-31)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.66 (2026-08-30)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.65 (2026-08-29)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.64 (2026-08-28)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.63 (2026-08-27)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.62 (2026-08-27)

### 🩹 Fixes

- **shared:** move generateMock to a dedicated subpath so runtime bundles drop zocker/faker ([223e1682a](https://github.com/powerhouse-inc/powerhouse/commit/223e1682a))
- **ci:** build before typecheck in simulate-ci-workflow ([2ecd03e81](https://github.com/powerhouse-inc/powerhouse/commit/2ecd03e81))
- **windows:** spawn package managers through cross-spawn ([ff4140072](https://github.com/powerhouse-inc/powerhouse/commit/ff4140072))
- **windows:** make package scripts runnable under cmd.exe ([987022ed9](https://github.com/powerhouse-inc/powerhouse/commit/987022ed9))

### ❤️ Thank You

- acaldas
- Claude Opus 5 (1M context)
- Wouter Kampmann

## 6.2.2-dev.61 (2026-08-26)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.60 (2026-08-26)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.59 (2026-08-25)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.58 (2026-08-25)

### 🚀 Features

- **docker:** per-channel compose files on cr.vetra.io with fixed ports ([7d8f51b57](https://github.com/powerhouse-inc/powerhouse/commit/7d8f51b57))

### 🩹 Fixes

- **docker:** connect image HEALTHCHECK uses 127.0.0.1 ([4c80c5759](https://github.com/powerhouse-inc/powerhouse/commit/4c80c5759))
- **docker:** healthcheck 127.0.0.1 instead of localhost in compose files ([e15bb8c9d](https://github.com/powerhouse-inc/powerhouse/commit/e15bb8c9d))

### ❤️ Thank You

- froid1911

## 6.2.2-dev.57 (2026-08-24)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.56 (2026-08-23)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.55 (2026-08-22)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.54 (2026-08-21)

### 🚀 Features

- ⚠️  **reactor-api:** type the actions mutateDocument accepts ([1b9adbe2a](https://github.com/powerhouse-inc/powerhouse/commit/1b9adbe2a))

### ⚠️  Breaking Changes

- **reactor-api:** type the actions mutateDocument accepts  ([1b9adbe2a](https://github.com/powerhouse-inc/powerhouse/commit/1b9adbe2a))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5

## 6.2.2-dev.53 (2026-08-20)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.52 (2026-08-19)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.51 (2026-08-19)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.50 (2026-08-18)

### 🩹 Fixes

- **ci:** install chromium from the package that owns playwright ([653349ee0](https://github.com/powerhouse-inc/powerhouse/commit/653349ee0))
- **connect:** stage the CSP rewrite instead of sed -i ([ab5cd1d8f](https://github.com/powerhouse-inc/powerhouse/commit/ab5cd1d8f))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5 (1M context)

## 6.2.2-dev.49 (2026-08-17)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.48 (2026-08-15)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.47 (2026-08-14)

### 🩹 Fixes

- **connect:** sync CSP registry origin to runtime packageRegistryUrl ([418652419](https://github.com/powerhouse-inc/powerhouse/commit/418652419))

### ❤️ Thank You

- Frank Pfeift

## 6.2.2-dev.46 (2026-08-14)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.45 (2026-08-13)

This was a version bump only for @powerhousedao/reactor-group to align it with other projects, there were no code changes.

## 6.2.2-dev.44 (2026-08-12)

### 🚀 Features

- **reactor:** authGroups enforcement - groups projection, positional walk, group references ([afb95e3ff](https://github.com/powerhouse-inc/powerhouse/commit/afb95e3ff))
- **reactor-group:** ship the PHGroup document model as @powerhousedao/reactor-group ([d5a323016](https://github.com/powerhouse-inc/powerhouse/commit/d5a323016))

### 🩹 Fixes

- **shared:** harden the condition evaluator per review ([eea3fb475](https://github.com/powerhouse-inc/powerhouse/commit/eea3fb475))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5