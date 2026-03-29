## 6.0.0-dev.122 (2026-03-29)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.121 (2026-03-29)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.120 (2026-03-29)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.119 (2026-03-29)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.118 (2026-03-28)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.117 (2026-03-28)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.116 (2026-03-27)

### 🚀 Features

- verify signatures on switchboard an consider actions without an app key on signer as unsigned ([c9a45d2e7](https://github.com/powerhouse-inc/powerhouse/commit/c9a45d2e7))

### 🩹 Fixes

- **reactor-api:** deserialize signatures in pushSyncEnvelopes resolver ([ab5a33eb6](https://github.com/powerhouse-inc/powerhouse/commit/ab5a33eb6))
- dependency improvements ([a41a67741](https://github.com/powerhouse-inc/powerhouse/commit/a41a67741))
- **document-drive:** exclude self from collision check when renaming nodes ([7dfc73268](https://github.com/powerhouse-inc/powerhouse/commit/7dfc73268))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 6.0.0-dev.115 (2026-03-27)

### 🚀 Features

- **reactor-api:** add MercuriusGatewayAdapter implementing IGatewayAdapter ([ea05779a3](https://github.com/powerhouse-inc/powerhouse/commit/ea05779a3))
- **reactor-api:** add FastifyHttpAdapter with dispatch-map design ([969d56af3](https://github.com/powerhouse-inc/powerhouse/commit/969d56af3))
- **reactor-api:** add FastifyHttpAdapter implementing IHttpAdapter ([94d3d9b48](https://github.com/powerhouse-inc/powerhouse/commit/94d3d9b48))

### ❤️ Thank You

- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.114 (2026-03-27)

### 🚀 Features

- **registry:** simplify Dockerfile to install from npm ([7e2c2fa91](https://github.com/powerhouse-inc/powerhouse/commit/7e2c2fa91))

### ❤️ Thank You

- acaldas @acaldas
- Claude Opus 4.6 (1M context)

## 6.0.0-dev.113 (2026-03-27)

### 🚀 Features

- expand codegen tests to cover new cases ([#2432](https://github.com/powerhouse-inc/powerhouse/pull/2432))

### 🩹 Fixes

- **codegen:** e2e tests for doc model and subgraph generation -- and a fix for a bug they found ([1c58a34df](https://github.com/powerhouse-inc/powerhouse/commit/1c58a34df))
- **codegen:** handle JSONC comments in ensureTsconfigPaths ([ae3cd38fe](https://github.com/powerhouse-inc/powerhouse/commit/ae3cd38fe))
- **vetra:** move connect dependency to root and fix CSS import ([1e288a8a9](https://github.com/powerhouse-inc/powerhouse/commit/1e288a8a9))
- **vetra:** add missing Connect boilerplate files for ph vetra ([bfe64f705](https://github.com/powerhouse-inc/powerhouse/commit/bfe64f705))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.112 (2026-03-26)

### 🚀 Features

- **codegen:** e2e codegen processor tests ([08686abc6](https://github.com/powerhouse-inc/powerhouse/commit/08686abc6))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.111 (2026-03-25)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.110 (2026-03-25)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.109 (2026-03-24)

### 🚀 Features

- **vetra-e2e:** add editor creation, registry publish, and consumer install e2e tests ([a215a7d7e](https://github.com/powerhouse-inc/powerhouse/commit/a215a7d7e))

### 🩹 Fixes

- lockfile ([292187fae](https://github.com/powerhouse-inc/powerhouse/commit/292187fae))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.108 (2026-03-24)

### 🚀 Features

- register vetra document models and processors in switchboard ([b50da707e](https://github.com/powerhouse-inc/powerhouse/commit/b50da707e))
- add document drive bundle step ([4c5085630](https://github.com/powerhouse-inc/powerhouse/commit/4c5085630))
- bundle cli shared stuff separately ([0f1f1ed8e](https://github.com/powerhouse-inc/powerhouse/commit/0f1f1ed8e))
- move shared cli types ([437455beb](https://github.com/powerhouse-inc/powerhouse/commit/437455beb))
- deal with an absolutely ridiculous amount of wrong exports ([d45e52ab9](https://github.com/powerhouse-inc/powerhouse/commit/d45e52ab9))
- dang that's a lot of files ([d7c198c22](https://github.com/powerhouse-inc/powerhouse/commit/d7c198c22))
- add versioned deps as dep of vetra-e2e ([884de81e5](https://github.com/powerhouse-inc/powerhouse/commit/884de81e5))
- update config for versioned documents test package ([a29d6b9ab](https://github.com/powerhouse-inc/powerhouse/commit/a29d6b9ab))
- make vetra a common package in connect ([4b366d892](https://github.com/powerhouse-inc/powerhouse/commit/4b366d892))
- re-implement package manager and add start connect function ([1fd9946b4](https://github.com/powerhouse-inc/powerhouse/commit/1fd9946b4))
- add build command ([b8427cbca](https://github.com/powerhouse-inc/powerhouse/commit/b8427cbca))
- remove dependency on knex from analytics engine browser ([e87e0c75a](https://github.com/powerhouse-inc/powerhouse/commit/e87e0c75a))
- **vetra:** do not bundle processors isomorphically ([6f9d380a6](https://github.com/powerhouse-inc/powerhouse/commit/6f9d380a6))
- **registry:** use tsdown in registry ([fd3da952b](https://github.com/powerhouse-inc/powerhouse/commit/fd3da952b))
- **analytics-engine:** use tsdown in analytics engine ([ef8bce39c](https://github.com/powerhouse-inc/powerhouse/commit/ef8bce39c))
- **builder-tools:** use tsdown for builder tools ([076657a43](https://github.com/powerhouse-inc/powerhouse/commit/076657a43))
- **ph-cmd:** use tsdown for ph-cmd ([23ea5bc8d](https://github.com/powerhouse-inc/powerhouse/commit/23ea5bc8d))
- start using tsdown ([b8b03f73a](https://github.com/powerhouse-inc/powerhouse/commit/b8b03f73a))
- **ph-cli:** use tsdown to bundle ph-cli ([b32726fc1](https://github.com/powerhouse-inc/powerhouse/commit/b32726fc1))
- add tsdown ([276222480](https://github.com/powerhouse-inc/powerhouse/commit/276222480))

### 🩹 Fixes

- include academy tenant in dev releases ([a459f0edf](https://github.com/powerhouse-inc/powerhouse/commit/a459f0edf))
- add retry loop for k8s push race conditions ([31659b5e3](https://github.com/powerhouse-inc/powerhouse/commit/31659b5e3))
- deps ([cbb8c5da9](https://github.com/powerhouse-inc/powerhouse/commit/cbb8c5da9))
- codegen tests ([b857b8ab6](https://github.com/powerhouse-inc/powerhouse/commit/b857b8ab6))
- **reactor-api:** resolve tsconfig path aliases in switchboard's Vite SSR loader ([dd812a933](https://github.com/powerhouse-inc/powerhouse/commit/dd812a933))
- **document-drive:** fix tsc build and prisma ESM \_\_dirname error ([f0c252d96](https://github.com/powerhouse-inc/powerhouse/commit/f0c252d96))
- stop mixing node and browser code ([9d5513533](https://github.com/powerhouse-inc/powerhouse/commit/9d5513533))
- always build css after bundle ([36dca2c95](https://github.com/powerhouse-inc/powerhouse/commit/36dca2c95))
- always build css after bundling ([565d11dca](https://github.com/powerhouse-inc/powerhouse/commit/565d11dca))
- so much, too much to even describe ([4aa9ebf54](https://github.com/powerhouse-inc/powerhouse/commit/4aa9ebf54))
- e2e tests ([d1bfe5f08](https://github.com/powerhouse-inc/powerhouse/commit/d1bfe5f08))
- **connect,vetra:** move vite plugin node polyfills to specific packages ([e3b0fa37b](https://github.com/powerhouse-inc/powerhouse/commit/e3b0fa37b))
- strange export style in reactor browser which caused circular references ([683e17196](https://github.com/powerhouse-inc/powerhouse/commit/683e17196))
- handle both node and browser types ([90f793133](https://github.com/powerhouse-inc/powerhouse/commit/90f793133))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.107 (2026-03-23)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.106 (2026-03-23)

### 🚀 Features

- add ph build command 2 ([#2415](https://github.com/powerhouse-inc/powerhouse/pull/2415))

### 🩹 Fixes

- **release:** remove stale build-connect step, now covered by build-bundle ([e00eed45a](https://github.com/powerhouse-inc/powerhouse/commit/e00eed45a))
- add git pull --rebase before push in k8s update jobs to avoid race conditions ([fa7af726f](https://github.com/powerhouse-inc/powerhouse/commit/fa7af726f))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.105 (2026-03-23)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.104 (2026-03-22)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.103 (2026-03-21)

### 🩹 Fixes

- **reactor:** temporary fix for deleting documents and cleaning up all edges too -- very costly ([8a15a0604](https://github.com/powerhouse-inc/powerhouse/commit/8a15a0604))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.102 (2026-03-20)

### 🩹 Fixes

- update workflow to use refname for tag in case it is not annotated, and provide a clear error message when there is no tag ([269758716](https://github.com/powerhouse-inc/powerhouse/commit/269758716))
- **builder-tools,reactor-browser:** bundling fixes ([59dfd75b6](https://github.com/powerhouse-inc/powerhouse/commit/59dfd75b6))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan

## 6.0.0-dev.101 (2026-03-20)

### 🚀 Features

- **examples:** add Discord webhook processor example ([fc09a4d66](https://github.com/powerhouse-inc/powerhouse/commit/fc09a4d66))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 4.6

## 6.0.0-dev.100 (2026-03-19)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.99 (2026-03-18)

### 🚀 Features

- **test-subscription:** adding a cli test-client for testing reactor api subscriptions ([563a8ac7d](https://github.com/powerhouse-inc/powerhouse/commit/563a8ac7d))

### 🩹 Fixes

- updated pnpm-lock ([c2843dc5b](https://github.com/powerhouse-inc/powerhouse/commit/c2843dc5b))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.98 (2026-03-18)

### 🩹 Fixes

- **connect:** declare dependencies ([6aa6910d3](https://github.com/powerhouse-inc/powerhouse/commit/6aa6910d3))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.97 (2026-03-18)

### 🩹 Fixes

- **design-system:** removed zod dependency ([fdc7c2ef7](https://github.com/powerhouse-inc/powerhouse/commit/fdc7c2ef7))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.96 (2026-03-17)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.95 (2026-03-17)

### 🚀 Features

- **switchboard:** add OTel metrics export via OTEL_EXPORTER_OTLP_ENDPOINT ([52f34aa1f](https://github.com/powerhouse-inc/powerhouse/commit/52f34aa1f))

### 🩹 Fixes

- **codegen:** added missing deps to boilerplate ([721dcb581](https://github.com/powerhouse-inc/powerhouse/commit/721dcb581))
- **switchboard:** address OTel metrics review feedback ([c5ac016fc](https://github.com/powerhouse-inc/powerhouse/commit/c5ac016fc))

### ❤️ Thank You

- acaldas @acaldas
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.94 (2026-03-17)

### 🩹 Fixes

- **common:** added missing runtime dependencies ([b0f647f75](https://github.com/powerhouse-inc/powerhouse/commit/b0f647f75))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.93 (2026-03-17)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.92 (2026-03-17)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.91 (2026-03-17)

### 🩹 Fixes

- adding build-bundle to simulate-ci-workflow ([ca93d1a2b](https://github.com/powerhouse-inc/powerhouse/commit/ca93d1a2b))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.90 (2026-03-14)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.89 (2026-03-13)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.88 (2026-03-12)

### 🚀 Features

- reactor-hypercore example ([d5557973a](https://github.com/powerhouse-inc/powerhouse/commit/d5557973a))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.87 (2026-03-12)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.86 (2026-03-12)

### 🚀 Features

- **renown,reactor-browser:** renown integration improvements ([a65731a73](https://github.com/powerhouse-inc/powerhouse/commit/a65731a73))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.85 (2026-03-12)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.84 (2026-03-11)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.83 (2026-03-11)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.82 (2026-03-11)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.81 (2026-03-11)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.80 (2026-03-11)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.79 (2026-03-11)

### 🚀 Features

- **ci:** add gitops action for registry image updates ([ba91d00dd](https://github.com/powerhouse-inc/powerhouse/commit/ba91d00dd))

### ❤️ Thank You

- Frank

## 6.0.0-dev.78 (2026-03-11)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.77 (2026-03-10)

### 🩹 Fixes

- **renown:** moved e2e script test to reactor-browser ([3c9b41045](https://github.com/powerhouse-inc/powerhouse/commit/3c9b41045))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.76 (2026-03-10)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.75 (2026-03-10)

### 🩹 Fixes

- **registry:** resolve catalog references in Dockerfile with sed ([765e8fbdd](https://github.com/powerhouse-inc/powerhouse/commit/765e8fbdd))
- **registry:** copy pnpm-workspace.yaml for Docker build catalog resolution ([7407700b1](https://github.com/powerhouse-inc/powerhouse/commit/7407700b1))

### ❤️ Thank You

- Frank

## 6.0.0-dev.74 (2026-03-10)

### 🚀 Features

- **ci:** add registry Docker image to publish workflow ([17544abad](https://github.com/powerhouse-inc/powerhouse/commit/17544abad))

### ❤️ Thank You

- Frank

## 6.0.0-dev.73 (2026-03-10)

### 🚀 Features

- opentelementry-instrumentation-reactor package ([67d5c31e5](https://github.com/powerhouse-inc/powerhouse/commit/67d5c31e5))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.72 (2026-03-09)

### 🚀 Features

- **renown,reactor-browser,connect:** cleanup renown integration ([fe6112c2c](https://github.com/powerhouse-inc/powerhouse/commit/fe6112c2c))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.71 (2026-03-07)

### 🚀 Features

- **connect,reactor-browser:** add dynamic package loading from HTTP registry ([f92816782](https://github.com/powerhouse-inc/powerhouse/commit/f92816782))
- **document-model,reactor-api,reactor-browser:** implemented remote document controller ([6299c21da](https://github.com/powerhouse-inc/powerhouse/commit/6299c21da))

### 🩹 Fixes

- **reactor-browser:** removed subexports ([4cda7f44c](https://github.com/powerhouse-inc/powerhouse/commit/4cda7f44c))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 6.0.0-dev.70 (2026-03-06)

### 🚀 Features

- **switchboard,reactor-api,registry:** add runtime dynamic pacage loading from HTTP registry ([37f91250e](https://github.com/powerhouse-inc/powerhouse/commit/37f91250e))
- add new bundling for connect ([#2390](https://github.com/powerhouse-inc/powerhouse/pull/2390))

### 🩹 Fixes

- eslint config ([fb20b3726](https://github.com/powerhouse-inc/powerhouse/commit/fb20b3726))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.69 (2026-03-05)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.68 (2026-03-04)

### 🩹 Fixes

- **vetra:** remove custom subgraphs from vetra ([3a1e3b9b0](https://github.com/powerhouse-inc/powerhouse/commit/3a1e3b9b0))
- resolve empty name causing silent ADD_FILE failure in drives ([b44ed0c1c](https://github.com/powerhouse-inc/powerhouse/commit/b44ed0c1c))
- **reactor-mcp:** adopt new reactor client interface for MCP server ([1b8e6fb19](https://github.com/powerhouse-inc/powerhouse/commit/1b8e6fb19))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.67 (2026-03-03)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.66 (2026-03-03)

### 🚀 Features

- move reactor logic from connect to reactor browser ([#2385](https://github.com/powerhouse-inc/powerhouse/pull/2385))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.65 (2026-03-03)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.64 (2026-03-03)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.62 (2026-03-03)

### 🚀 Features

- **ci:** push academy to Harbor academy project and update k8s for academy namespace ([efbf8f58d](https://github.com/powerhouse-inc/powerhouse/commit/efbf8f58d))

### 🩹 Fixes

- cherry-picked fixes ([a73630a6a](https://github.com/powerhouse-inc/powerhouse/commit/a73630a6a))
- moving analytics processors to shared and fixing them, fixing other linting errors toos ([0c8f7fe98](https://github.com/powerhouse-inc/powerhouse/commit/0c8f7fe98))

### ❤️ Thank You

- Benjamin Jordan
- Frank

## 6.0.0-dev.61 (2026-02-27)

### 🚀 Features

- **ci:** update k8s-hosting academy image tag after docker publish ([0b98b73a9](https://github.com/powerhouse-inc/powerhouse/commit/0b98b73a9))
- add bundle step for ph cli ([#2375](https://github.com/powerhouse-inc/powerhouse/pull/2375))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.60 (2026-02-27)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.

## 6.0.0-dev.59 (2026-02-26)

### 🚀 Features

- use update-ts-references tool which also removes unused ones ([#2374](https://github.com/powerhouse-inc/powerhouse/pull/2374))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.58 (2026-02-25)

### 🔥 Performance

- **reducer:** pre-allocate operation arrays to avoid resize overhead ([1cf1c0078](https://github.com/powerhouse-inc/powerhouse/commit/1cf1c0078))

### ❤️ Thank You

- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.57 (2026-02-24)

### 🚀 Features

- run sync integration test as part of reactor flow ([7dea8bf3e](https://github.com/powerhouse-inc/powerhouse/commit/7dea8bf3e))

### 🩹 Fixes

- switchboard needs build:misc ([916f761b8](https://github.com/powerhouse-inc/powerhouse/commit/916f761b8))
- arg, workflow changes should trigger the workflow ([645cca08f](https://github.com/powerhouse-inc/powerhouse/commit/645cca08f))
- build step before integration test ([0b6b48f74](https://github.com/powerhouse-inc/powerhouse/commit/0b6b48f74))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.56 (2026-02-21)

This was a version bump only for @powerhousedao/powerhouse-vetra-packages to align it with other projects, there were no code changes.
