## 6.2.3-dev.52 (2026-10-10)

### 🚀 Features

- **ph-cli:** keep native and WebAssembly dependencies external and list them as externalDependencies ([e3b616e67b](https://github.com/powerhouse-inc/powerhouse/commit/e3b616e67b))
- **reactor-router:** submit async variants without waiting when a backend can ([3a9fbf8db7](https://github.com/powerhouse-inc/powerhouse/commit/3a9fbf8db7))
- **reactor-router:** the routing IReactorClient over IRoutableBackend ([772aefe6ec](https://github.com/powerhouse-inc/powerhouse/commit/772aefe6ec))
- **reactor-router:** refuse a misrouted write on the router's side ([2cbef1945a](https://github.com/powerhouse-inc/powerhouse/commit/2cbef1945a))
- **reactor-router:** advisory routing that re-aims a misrouted operation ([ffec5ad049](https://github.com/powerhouse-inc/powerhouse/commit/ffec5ad049))
- **reactor-router:** fan-in reads with a documented merge ([d4d68478ae](https://github.com/powerhouse-inc/powerhouse/commit/d4d68478ae))
- **reactor-router:** place collections over backend facts and keep a router table ([4f6f936780](https://github.com/powerhouse-inc/powerhouse/commit/4f6f936780))
- **reactor-router:** route over IRoutableBackend and backend facts ([9e9b597500](https://github.com/powerhouse-inc/powerhouse/commit/9e9b597500))
- **reactor-router:** the misroute contract and the router's error surface ([d8cba07067](https://github.com/powerhouse-inc/powerhouse/commit/d8cba07067))

### 🩹 Fixes

- **reactor-router:** verify cached routes before a relationship split check ([9c937bc0af](https://github.com/powerhouse-inc/powerhouse/commit/9c937bc0af))
- **reactor-router:** resolve every create through the batch rules ([0f9bc40204](https://github.com/powerhouse-inc/powerhouse/commit/0f9bc40204))
- **reactor-router:** treat a cached route as a hint when resolving a batch ([5a13066c11](https://github.com/powerhouse-inc/powerhouse/commit/5a13066c11))
- **reactor-router:** resolve every batch through one backend-resolution rule ([dea08f0ff2](https://github.com/powerhouse-inc/powerhouse/commit/dea08f0ff2))
- **reactor-router:** re-resolve a refused batch without the refusing backends ([1707190959](https://github.com/powerhouse-inc/powerhouse/commit/1707190959))
- **reactor-router:** skip the batch ownership guard for an id the batch creates ([e09055a544](https://github.com/powerhouse-inc/powerhouse/commit/e09055a544))
- **reactor-router:** place an unserved id by its collection route everywhere ([9a9fc629ac](https://github.com/powerhouse-inc/powerhouse/commit/9a9fc629ac))
- **reactor-router:** leave every route unchanged after a recovered read ([c12b65fd04](https://github.com/powerhouse-inc/powerhouse/commit/c12b65fd04))
- **reactor-router:** answer isDocumentIdTaken strictly across backends ([cd994d0cc6](https://github.com/powerhouse-inc/powerhouse/commit/cd994d0cc6))
- **reactor-router:** answer waitForJob for an unknown job as a failed job ([36745bd630](https://github.com/powerhouse-inc/powerhouse/commit/36745bd630))
- **reactor-router:** correct a stale document entry under a batch-shaped write ([257a2a032e](https://github.com/powerhouse-inc/powerhouse/commit/257a2a032e))
- **reactor-router:** let a backend report not-found when nothing holds the target ([104ed4cdfd](https://github.com/powerhouse-inc/powerhouse/commit/104ed4cdfd))
- **reactor-router:** place a parentless create by its collection route ([6a7b5229bc](https://github.com/powerhouse-inc/powerhouse/commit/6a7b5229bc))
- **reactor-router:** decide route-source precedence in one place ([5e47d3f8af](https://github.com/powerhouse-inc/powerhouse/commit/5e47d3f8af))
- **reactor-router:** refuse an unservable find as a rejection, not a throw ([06dedd2d00](https://github.com/powerhouse-inc/powerhouse/commit/06dedd2d00))
- **reactor-router:** recognise the GraphQL client's wrong-shard refusal ([bee26886f2](https://github.com/powerhouse-inc/powerhouse/commit/bee26886f2))
- **reactor,reactor-router:** name an unknown job so the router stops reporting real jobs as unknown ([34aadb3add](https://github.com/powerhouse-inc/powerhouse/commit/34aadb3add))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.51 (2026-10-10)

### 🚀 Features

- **ph-cli:** keep native and WebAssembly dependencies external and list them as externalDependencies ([e3b616e67b](https://github.com/powerhouse-inc/powerhouse/commit/e3b616e67b))
- **reactor-router:** submit async variants without waiting when a backend can ([3a9fbf8db7](https://github.com/powerhouse-inc/powerhouse/commit/3a9fbf8db7))
- **reactor-router:** the routing IReactorClient over IRoutableBackend ([772aefe6ec](https://github.com/powerhouse-inc/powerhouse/commit/772aefe6ec))
- **reactor-router:** refuse a misrouted write on the router's side ([2cbef1945a](https://github.com/powerhouse-inc/powerhouse/commit/2cbef1945a))
- **reactor-router:** advisory routing that re-aims a misrouted operation ([ffec5ad049](https://github.com/powerhouse-inc/powerhouse/commit/ffec5ad049))
- **reactor-router:** fan-in reads with a documented merge ([d4d68478ae](https://github.com/powerhouse-inc/powerhouse/commit/d4d68478ae))
- **reactor-router:** place collections over backend facts and keep a router table ([4f6f936780](https://github.com/powerhouse-inc/powerhouse/commit/4f6f936780))
- **reactor-router:** route over IRoutableBackend and backend facts ([9e9b597500](https://github.com/powerhouse-inc/powerhouse/commit/9e9b597500))
- **reactor-router:** the misroute contract and the router's error surface ([d8cba07067](https://github.com/powerhouse-inc/powerhouse/commit/d8cba07067))

### 🩹 Fixes

- **reactor-router:** verify cached routes before a relationship split check ([9c937bc0af](https://github.com/powerhouse-inc/powerhouse/commit/9c937bc0af))
- **reactor-router:** resolve every create through the batch rules ([0f9bc40204](https://github.com/powerhouse-inc/powerhouse/commit/0f9bc40204))
- **reactor-router:** treat a cached route as a hint when resolving a batch ([5a13066c11](https://github.com/powerhouse-inc/powerhouse/commit/5a13066c11))
- **reactor-router:** resolve every batch through one backend-resolution rule ([dea08f0ff2](https://github.com/powerhouse-inc/powerhouse/commit/dea08f0ff2))
- **reactor-router:** re-resolve a refused batch without the refusing backends ([1707190959](https://github.com/powerhouse-inc/powerhouse/commit/1707190959))
- **reactor-router:** skip the batch ownership guard for an id the batch creates ([e09055a544](https://github.com/powerhouse-inc/powerhouse/commit/e09055a544))
- **reactor-router:** place an unserved id by its collection route everywhere ([9a9fc629ac](https://github.com/powerhouse-inc/powerhouse/commit/9a9fc629ac))
- **reactor-router:** leave every route unchanged after a recovered read ([c12b65fd04](https://github.com/powerhouse-inc/powerhouse/commit/c12b65fd04))
- **reactor-router:** answer isDocumentIdTaken strictly across backends ([cd994d0cc6](https://github.com/powerhouse-inc/powerhouse/commit/cd994d0cc6))
- **reactor-router:** answer waitForJob for an unknown job as a failed job ([36745bd630](https://github.com/powerhouse-inc/powerhouse/commit/36745bd630))
- **reactor-router:** correct a stale document entry under a batch-shaped write ([257a2a032e](https://github.com/powerhouse-inc/powerhouse/commit/257a2a032e))
- **reactor-router:** let a backend report not-found when nothing holds the target ([104ed4cdfd](https://github.com/powerhouse-inc/powerhouse/commit/104ed4cdfd))
- **reactor-router:** place a parentless create by its collection route ([6a7b5229bc](https://github.com/powerhouse-inc/powerhouse/commit/6a7b5229bc))
- **reactor-router:** decide route-source precedence in one place ([5e47d3f8af](https://github.com/powerhouse-inc/powerhouse/commit/5e47d3f8af))
- **reactor-router:** refuse an unservable find as a rejection, not a throw ([06dedd2d00](https://github.com/powerhouse-inc/powerhouse/commit/06dedd2d00))
- **reactor-router:** recognise the GraphQL client's wrong-shard refusal ([bee26886f2](https://github.com/powerhouse-inc/powerhouse/commit/bee26886f2))
- **reactor,reactor-router:** name an unknown job so the router stops reporting real jobs as unknown ([34aadb3add](https://github.com/powerhouse-inc/powerhouse/commit/34aadb3add))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5