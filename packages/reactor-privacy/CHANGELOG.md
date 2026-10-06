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

This was a version bump only for @powerhousedao/reactor-privacy to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-privacy to align it with other projects, there were no code changes.

## 6.2.3-dev.38 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-privacy to align it with other projects, there were no code changes.

## 6.2.3-dev.37 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-privacy to align it with other projects, there were no code changes.

## 6.2.3-dev.36 (2026-10-01)

This was a version bump only for @powerhousedao/reactor-privacy to align it with other projects, there were no code changes.

## 6.2.3-dev.35 (2026-10-01)

### 🚀 Features

- ⚠️  **registry:** serve every replica from Postgres and S3, processing publishes in a worker ([0d25d5fe35](https://github.com/powerhouse-inc/powerhouse/commit/0d25d5fe35))
- **switchboard:** configure the erasure purge timeout ([354375ea61](https://github.com/powerhouse-inc/powerhouse/commit/354375ea61))
- **switchboard:** run the privacy add-on behind PH_PRIVACY_ENABLED ([38c9a43856](https://github.com/powerhouse-inc/powerhouse/commit/38c9a43856))
- **reactor-privacy:** erase requested documents on a serial schedule ([f4f31289a1](https://github.com/powerhouse-inc/powerhouse/commit/f4f31289a1))
- **reactor-privacy:** serve disclosure and erasure to supreme admins only ([7a6b5232cb](https://github.com/powerhouse-inc/powerhouse/commit/7a6b5232cb))
- **reactor-privacy:** declare the erasure service contract ([c41c062089](https://github.com/powerhouse-inc/powerhouse/commit/c41c062089))
- **reactor-privacy:** disclose what is held about an identifier ([e2b128f639](https://github.com/powerhouse-inc/powerhouse/commit/e2b128f639))
- **reactor-privacy:** index subjects by keyed hash in a fenced read model ([e78a08cccd](https://github.com/powerhouse-inc/powerhouse/commit/e78a08cccd))
- **reactor-privacy:** scaffold the package and its migration ledger ([152ecff77b](https://github.com/powerhouse-inc/powerhouse/commit/152ecff77b))
- **reactor-drive:** erase a purged document's nodes in NodeProcessor ([5a608e73bf](https://github.com/powerhouse-inc/powerhouse/commit/5a608e73bf))
- **reactor-attachments:** delete a purged document's attachment references ([4121c83347](https://github.com/powerhouse-inc/powerhouse/commit/4121c83347))

### 🩹 Fixes

- **reactor:** a drive's purge does not require a live former member ([e8266b1035](https://github.com/powerhouse-inc/powerhouse/commit/e8266b1035))
- **reactor-privacy:** a denied delete leaves the document live ([62f1038ce6](https://github.com/powerhouse-inc/powerhouse/commit/62f1038ce6))
- **reactor-privacy:** warn and record lastError while a leaked purge blocks dispatch ([cd6fe4f022](https://github.com/powerhouse-inc/powerhouse/commit/cd6fe4f022))
- **reactor-privacy:** reopen every failed request with no failed item each tick ([d9c19c3837](https://github.com/powerhouse-inc/powerhouse/commit/d9c19c3837))
- **reactor-api:** ignore polled refusals of an unknown kind ([aac4a3e752](https://github.com/powerhouse-inc/powerhouse/commit/aac4a3e752))
- **reactor-api:** fail a poll with a recoverable code when a refusal is not recorded ([3ab1c92f7b](https://github.com/powerhouse-inc/powerhouse/commit/3ab1c92f7b))
- **reactor:** keep a polled marker refusal only when the marker was owed ([07cae595da](https://github.com/powerhouse-inc/powerhouse/commit/07cae595da))
- **reactor:** persist a purge refusal only from a MARKER_REFUSED dead letter ([ef2c3f4729](https://github.com/powerhouse-inc/powerhouse/commit/ef2c3f4729))
- **reactor-privacy:** re-read stored remotes after a removal in the same tick ([4bd90b322d](https://github.com/powerhouse-inc/powerhouse/commit/4bd90b322d))
- **reactor-privacy:** recover failed purges that commit, one purge at a time ([6832617d50](https://github.com/powerhouse-inc/powerhouse/commit/6832617d50))
- **reactor-privacy:** judge delivery from stored remotes and persisted refusals ([57446c0e93](https://github.com/powerhouse-inc/powerhouse/commit/57446c0e93))
- **reactor-privacy:** declare the subject index commits in the fence trx ([375e9331bc](https://github.com/powerhouse-inc/powerhouse/commit/375e9331bc))

### 🔥 Performance

- **reactor-privacy:** dispatch the next purge without rescanning the backlog ([5de3703ebf](https://github.com/powerhouse-inc/powerhouse/commit/5de3703ebf))
- **reactor-privacy:** start the next purge when one completes ([2ea63577de](https://github.com/powerhouse-inc/powerhouse/commit/2ea63577de))

### ⚠️  Breaking Changes

- **registry:** serve every replica from Postgres and S3, processing publishes in a worker  ([0d25d5fe35](https://github.com/powerhouse-inc/powerhouse/commit/0d25d5fe35))
  /packages and /pieces return pages ({items,total,limit,offset,hasMore}) instead of full arrays, and piece bundles move to /-/pieces/bundled/<name>/<version>.tgz.

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5