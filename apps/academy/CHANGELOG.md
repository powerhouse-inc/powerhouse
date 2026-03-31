## 6.0.0-dev.135 (2026-03-31)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.134 (2026-03-31)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.133 (2026-03-31)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.132 (2026-03-31)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.131 (2026-03-31)

### 🚀 Features

- add separate node and browser processor bundles ([#2451](https://github.com/powerhouse-inc/powerhouse/pull/2451))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.130 (2026-03-31)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.129 (2026-03-30)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.128 (2026-03-30)

### 🩹 Fixes

- **reactor-api,switchboard:** import vite loader from subexport ([1909d0c25](https://github.com/powerhouse-inc/powerhouse/commit/1909d0c25))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.127 (2026-03-30)

### 🩹 Fixes

- **connect,docker:** set connect registry url on build step ([cc96c4ad7](https://github.com/powerhouse-inc/powerhouse/commit/cc96c4ad7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.126 (2026-03-30)

### 🚀 Features

- **connect,docker:** load PH_PACKAGES from runtime JSON instead of build-time define ([701eec6ac](https://github.com/powerhouse-inc/powerhouse/commit/701eec6ac))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.125 (2026-03-30)

### 🚀 Features

- **docker:** use switchboard bin directly in entrypoint ([6848e119b](https://github.com/powerhouse-inc/powerhouse/commit/6848e119b))
- **docker:** install switchboard directly instead of ph-cmd ([66ab86bc1](https://github.com/powerhouse-inc/powerhouse/commit/66ab86bc1))

### 🩹 Fixes

- **connect,builder-tools,design-system:** multiple fixes to dynamic package loading in connect ([fb47de8b3](https://github.com/powerhouse-inc/powerhouse/commit/fb47de8b3))

### ❤️ Thank You

- acaldas
- Frank

## 6.0.0-dev.124 (2026-03-30)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.123 (2026-03-29)

### 🚀 Features

- **docker:** redesign Docker strategy with runtime package loading ([08207df3d](https://github.com/powerhouse-inc/powerhouse/commit/08207df3d))

### ❤️ Thank You

- Frank

## 6.0.0-dev.122 (2026-03-29)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.121 (2026-03-29)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.120 (2026-03-29)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.119 (2026-03-29)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.118 (2026-03-28)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.117 (2026-03-28)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.110 (2026-03-25)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.104 (2026-03-22)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.99 (2026-03-18)

### 🚀 Features

- **test-subscription:** adding a cli test-client for testing reactor api subscriptions ([563a8ac7d](https://github.com/powerhouse-inc/powerhouse/commit/563a8ac7d))

### 🩹 Fixes

- updated pnpm-lock ([c2843dc5b](https://github.com/powerhouse-inc/powerhouse/commit/c2843dc5b))

### ❤️ Thank You

- acaldas @acaldas
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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.92 (2026-03-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.91 (2026-03-17)

### 🩹 Fixes

- adding build-bundle to simulate-ci-workflow ([ca93d1a2b](https://github.com/powerhouse-inc/powerhouse/commit/ca93d1a2b))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.90 (2026-03-14)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.89 (2026-03-13)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.88 (2026-03-12)

### 🚀 Features

- reactor-hypercore example ([d5557973a](https://github.com/powerhouse-inc/powerhouse/commit/d5557973a))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.87 (2026-03-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.86 (2026-03-12)

### 🚀 Features

- **renown,reactor-browser:** renown integration improvements ([a65731a73](https://github.com/powerhouse-inc/powerhouse/commit/a65731a73))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.85 (2026-03-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.84 (2026-03-11)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.83 (2026-03-11)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.82 (2026-03-11)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.81 (2026-03-11)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.80 (2026-03-11)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.79 (2026-03-11)

### 🚀 Features

- **ci:** add gitops action for registry image updates ([ba91d00dd](https://github.com/powerhouse-inc/powerhouse/commit/ba91d00dd))

### ❤️ Thank You

- Frank

## 6.0.0-dev.78 (2026-03-11)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.77 (2026-03-10)

### 🩹 Fixes

- **renown:** moved e2e script test to reactor-browser ([3c9b41045](https://github.com/powerhouse-inc/powerhouse/commit/3c9b41045))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.76 (2026-03-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.68 (2026-03-04)

### 🚀 Features

- **codegen:** versioned reducers by default ([c8111a1d9](https://github.com/powerhouse-inc/powerhouse/commit/c8111a1d9))

### 🩹 Fixes

- **vetra:** remove custom subgraphs from vetra ([3a1e3b9b0](https://github.com/powerhouse-inc/powerhouse/commit/3a1e3b9b0))
- resolve empty name causing silent ADD_FILE failure in drives ([b44ed0c1c](https://github.com/powerhouse-inc/powerhouse/commit/b44ed0c1c))
- **reactor-mcp:** adopt new reactor client interface for MCP server ([1b8e6fb19](https://github.com/powerhouse-inc/powerhouse/commit/1b8e6fb19))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.67 (2026-03-03)

### 🩹 Fixes

- **academy:** remove outdated production warning from authorization docs ([137a38d74](https://github.com/powerhouse-inc/powerhouse/commit/137a38d74))

### ❤️ Thank You

- Frank

## 6.0.0-dev.66 (2026-03-03)

### 🚀 Features

- move reactor logic from connect to reactor browser ([#2385](https://github.com/powerhouse-inc/powerhouse/pull/2385))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.65 (2026-03-03)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.64 (2026-03-03)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.59 (2026-02-26)

### 🚀 Features

- use update-ts-references tool which also removes unused ones ([#2374](https://github.com/powerhouse-inc/powerhouse/pull/2374))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.58 (2026-02-25)

### 🚀 Features

- add document model versioning documentation ([f32fcff3c](https://github.com/powerhouse-inc/powerhouse/commit/f32fcff3c))

### 🔥 Performance

- **reducer:** pre-allocate operation arrays to avoid resize overhead ([1cf1c0078](https://github.com/powerhouse-inc/powerhouse/commit/1cf1c0078))

### ❤️ Thank You

- Guillermo Puente @gpuente
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

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.55 (2026-02-20)

### 🚀 Features

- test-connect and reactor gql updates to pass along more context ([ae581e8e8](https://github.com/powerhouse-inc/powerhouse/commit/ae581e8e8))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.54 (2026-02-19)

### 🚀 Features

- wip orchestrator for the test-client ([186d7c015](https://github.com/powerhouse-inc/powerhouse/commit/186d7c015))
- **connect:** build tweaks ([22b6bc7d5](https://github.com/powerhouse-inc/powerhouse/commit/22b6bc7d5))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan

## 6.0.0-dev.53 (2026-02-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.52 (2026-02-17)

### 🩹 Fixes

- **reactor-api:** improved subgraph path matching and removed name parameter from reactor subgraph ([dcadf7fb3](https://github.com/powerhouse-inc/powerhouse/commit/dcadf7fb3))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.51 (2026-02-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.50 (2026-02-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.49 (2026-02-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.47 (2026-02-17)

### 🩹 Fixes

- **monorepo:** make shared package publicly available ([#2348](https://github.com/powerhouse-inc/powerhouse/pull/2348))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.46 (2026-02-17)

### 🚀 Features

- **connect:** re enable processors in connect ([#2342](https://github.com/powerhouse-inc/powerhouse/pull/2342))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.45 (2026-02-16)

### 🚀 Features

- **monorepo:** ensure shared is only in dev deps ([#2341](https://github.com/powerhouse-inc/powerhouse/pull/2341))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.44 (2026-02-15)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.43 (2026-02-14)

### 🚀 Features

- **monorepo:** move more shared stuff to shared ([#2335](https://github.com/powerhouse-inc/powerhouse/pull/2335))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.42 (2026-02-13)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.41 (2026-02-12)

### 🚀 Features

- **monorepo:** use catalog for other shared deps ([#2330](https://github.com/powerhouse-inc/powerhouse/pull/2330))
- **vetra:** add processor apps input to vetra ([#2329](https://github.com/powerhouse-inc/powerhouse/pull/2329))

### 🩹 Fixes

- **builder-tools:** use same class-variance-authority as design-systom ([d600feb49](https://github.com/powerhouse-inc/powerhouse/commit/d600feb49))
- **design-system:** copy assets to dist folder to enable relative path import ([de5cb5e4e](https://github.com/powerhouse-inc/powerhouse/commit/de5cb5e4e))
- **monorepo:** add build-cli to old release workflow ([a30624bd2](https://github.com/powerhouse-inc/powerhouse/commit/a30624bd2))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.40 (2026-02-12)

### 🚀 Features

- **monorepo:** add shared package ([#2324](https://github.com/powerhouse-inc/powerhouse/pull/2324))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.39 (2026-02-11)

### 🚀 Features

- **reactor,codegen:** handle processor apps in cli ([#2319](https://github.com/powerhouse-inc/powerhouse/pull/2319))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.38 (2026-02-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.37 (2026-02-10)

### 🚀 Features

- **reactor-api:** added nested operations query on phdocument and Graphql client update ([67584e3fc](https://github.com/powerhouse-inc/powerhouse/commit/67584e3fc))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.36 (2026-02-06)

### 🚀 Features

- **codegen:** use bun for the slowest tests ([#2303](https://github.com/powerhouse-inc/powerhouse/pull/2303))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.35 (2026-02-06)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.34 (2026-02-05)

### 🚀 Features

- **codegen:** update processors codegen ([#2293](https://github.com/powerhouse-inc/powerhouse/pull/2293))

### 🩹 Fixes

- **ci:** allow release to continue when academy build fails ([477d9ef71](https://github.com/powerhouse-inc/powerhouse/commit/477d9ef71))

### 🔥 Performance

- **document-model:** optimize getDocumentLastModified from O(n log n) to O(n) ([bb94ff310](https://github.com/powerhouse-inc/powerhouse/commit/bb94ff310))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.33 (2026-02-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.32 (2026-02-04)

### 🩹 Fixes

- remove duplicate trigger-downstream from publish-docker-images ([1f70c8041](https://github.com/powerhouse-inc/powerhouse/commit/1f70c8041))

### ❤️ Thank You

- Frank

## 6.0.0-dev.31 (2026-02-04)

### 🚀 Features

- trigger powerhouse-demo after release ([f5b63728d](https://github.com/powerhouse-inc/powerhouse/commit/f5b63728d))
- **profiling:** add Pyroscope monitoring to reactor-direct ([2c7779229](https://github.com/powerhouse-inc/powerhouse/commit/2c7779229))
- **profiling:** add reactor-direct.ts for direct reactor performance profiling ([806714e27](https://github.com/powerhouse-inc/powerhouse/commit/806714e27))

### 🩹 Fixes

- linting issues ([e1eb2c806](https://github.com/powerhouse-inc/powerhouse/commit/e1eb2c806))
- ignore release.ts ([25a40d2a6](https://github.com/powerhouse-inc/powerhouse/commit/25a40d2a6))

### ❤️ Thank You

- Benjamin Jordan
- Frank
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.30 (2026-02-03)

### 🩹 Fixes

- **release:** ignore errors on git stage ([e0c10d604](https://github.com/powerhouse-inc/powerhouse/commit/e0c10d604))
- **releases:** remove problematic publish dry run ([8b9b065b9](https://github.com/powerhouse-inc/powerhouse/commit/8b9b065b9))
- **releases:** include git side effects check in all booleans ([19c44503d](https://github.com/powerhouse-inc/powerhouse/commit/19c44503d))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.29 (2026-02-03)

### 🚀 Features

- **release:** add doc comments ([3ab9879d4](https://github.com/powerhouse-inc/powerhouse/commit/3ab9879d4))
- **monorepo:** simplified release workflow ([#2276](https://github.com/powerhouse-inc/powerhouse/pull/2276))

### 🩹 Fixes

- package.json onlyBuilt ([3b6165267](https://github.com/powerhouse-inc/powerhouse/commit/3b6165267))
- **release:** move checkout action ([4ed305d57](https://github.com/powerhouse-inc/powerhouse/commit/4ed305d57))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.28 (2026-01-31)

### 🚀 Features

- add e2e tests to simulate ([6ba43d19b](https://github.com/powerhouse-inc/powerhouse/commit/6ba43d19b))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 6.0.0-dev.27 (2026-01-30)

### 🚀 Features

- renown sdk improvements ([bc1099d94](https://github.com/powerhouse-inc/powerhouse/commit/bc1099d94))
- **ph-cmd:** fix forwarding and versioning bug ([#2272](https://github.com/powerhouse-inc/powerhouse/pull/2272))

### ❤️ Thank You

- acaldas
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.26 (2026-01-29)

### 🚀 Features

- update minimum node version to 24 ([7a71107c5](https://github.com/powerhouse-inc/powerhouse/commit/7a71107c5))

### 🩹 Fixes

- undo my changes to the tsc script ([0a36d0a49](https://github.com/powerhouse-inc/powerhouse/commit/0a36d0a49))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 6.0.0-dev.25 (2026-01-28)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.24 (2026-01-27)

### 🚀 Features

- **monorepo:** ensure the same typescript version is used everywhere ([#2258](https://github.com/powerhouse-inc/powerhouse/pull/2258))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.23 (2026-01-27)

### 🚀 Features

- **monorepo:** add diff filter to exclude deleted files in changed files action ([e86961e79](https://github.com/powerhouse-inc/powerhouse/commit/e86961e79))
- **academy:** added release slides to academy project ([eab5e56fe](https://github.com/powerhouse-inc/powerhouse/commit/eab5e56fe))

### 🩹 Fixes

- **academy:** added missing slide break ([4d2adfe41](https://github.com/powerhouse-inc/powerhouse/commit/4d2adfe41))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.22 (2026-01-27)

### 🩹 Fixes

- **monorepo:** inefficient workflows ([#2250](https://github.com/powerhouse-inc/powerhouse/pull/2250))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.21 (2026-01-27)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.20 (2026-01-26)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.19 (2026-01-26)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.18 (2026-01-26)

### 🚀 Features

- **ph-cli, ph-cmd:** use cmd ts for remaining ph cmd commands ([#2209](https://github.com/powerhouse-inc/powerhouse/pull/2209))

### 🩹 Fixes

- trailing newline in publish-docker-images workflow ([7d2e30db4](https://github.com/powerhouse-inc/powerhouse/commit/7d2e30db4))
- **ci:** remove deploy-k8s from publish-docker-images workflow ([c5869e82f](https://github.com/powerhouse-inc/powerhouse/commit/c5869e82f))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.17 (2026-01-26)

### 🩹 Fixes

- **academy:** remove reference to excluded DriveAnalyticsHooks doc ([83dc4dcf5](https://github.com/powerhouse-inc/powerhouse/commit/83dc4dcf5))

### ❤️ Thank You

- Frank

## 6.0.0-dev.16 (2026-01-24)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.15 (2026-01-23)

### 🩹 Fixes

- **academy:** improved making authenticated requests ([079182b75](https://github.com/powerhouse-inc/powerhouse/commit/079182b75))

### ❤️ Thank You

- Frank

## 6.0.0-dev.14 (2026-01-22)

### 🩹 Fixes

- pnpm filtering ([3875e271c](https://github.com/powerhouse-inc/powerhouse/commit/3875e271c))
- do not run profiling tests by default ([a196a19da](https://github.com/powerhouse-inc/powerhouse/commit/a196a19da))
- **profiling:** add TypeScript configuration for profiling scripts ([d0ee094c7](https://github.com/powerhouse-inc/powerhouse/commit/d0ee094c7))
- **design-system:** declare document-drive and reactor-browser as runtime dependencies ([3db4afa38](https://github.com/powerhouse-inc/powerhouse/commit/3db4afa38))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.13 (2026-01-21)

### 🚀 Features

- add workflow to trigger downstream package updates ([e8c6cce75](https://github.com/powerhouse-inc/powerhouse/commit/e8c6cce75))

### ❤️ Thank You

- Frank

## 6.0.0-dev.12 (2026-01-20)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.11 (2026-01-20)

### 🩹 Fixes

- **monorepo:** exclude root package from recursive build to prevent infinite loop ([099139393](https://github.com/powerhouse-inc/powerhouse/commit/099139393))
- **codegen:** fix failing codegen tests ([#2227](https://github.com/powerhouse-inc/powerhouse/pull/2227))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.10 (2026-01-19)

### 🚀 Features

- **ph-cmd:** move dependencies to dev dependencies ([8aa16c346](https://github.com/powerhouse-inc/powerhouse/commit/8aa16c346))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.9 (2026-01-19)

### 🚀 Features

- **ph-cmd:** test build with bun ([#2225](https://github.com/powerhouse-inc/powerhouse/pull/2225))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.8 (2026-01-17)

### 🚀 Features

- **design-system:** default styles tweaks and DocumentStateViewer ([c0a66720c](https://github.com/powerhouse-inc/powerhouse/commit/c0a66720c))
- **ci:** deploy staging tenant from release/staging/\* branches ([8761579e7](https://github.com/powerhouse-inc/powerhouse/commit/8761579e7))
- **ci:** add Harbor registry to docker image publishing ([f3a2fab69](https://github.com/powerhouse-inc/powerhouse/commit/f3a2fab69))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 6.0.0-dev.7 (2026-01-16)

### 🩹 Fixes

- **ph-cmd:** do not publish dependencies in cli ([0f5296d02](https://github.com/powerhouse-inc/powerhouse/commit/0f5296d02))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.6 (2026-01-16)

### 🩹 Fixes

- **ph-cmd:** move .npmrc to codegen package dir ([35ef27743](https://github.com/powerhouse-inc/powerhouse/commit/35ef27743))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.5 (2026-01-16)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.4 (2026-01-16)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.3 (2026-01-16)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 6.0.0-dev.2 (2026-01-15)

### 🚀 Features

- adding a migration command to switchboard ([155f3da66](https://github.com/powerhouse-inc/powerhouse/commit/155f3da66))
- test-client now successfully executes scenarios ([ef9299d90](https://github.com/powerhouse-inc/powerhouse/commit/ef9299d90))
- new cicd flows ([01310e0d3](https://github.com/powerhouse-inc/powerhouse/commit/01310e0d3))
- enabled doc version in connect ([#2171](https://github.com/powerhouse-inc/powerhouse/pull/2171))

### 🩹 Fixes

- workflow permissions ([6e451590d](https://github.com/powerhouse-inc/powerhouse/commit/6e451590d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.1 (2026-01-15)

### 🚀 Features

- **academy:** added k8s deployment ([5f7e27162](https://github.com/powerhouse-inc/powerhouse/commit/5f7e27162))
- **monorepo:** upgrade document engineering package ([#2215](https://github.com/powerhouse-inc/powerhouse/pull/2215))

### 🩹 Fixes

- **academy:** updated search subgraph example ([f06540fe5](https://github.com/powerhouse-inc/powerhouse/commit/f06540fe5))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 5.2.0-dev.1 (2026-01-15)

### 🚀 Features

- **monorepo:** upgrade zod and use compatibility layer for errors ([#2210](https://github.com/powerhouse-inc/powerhouse/pull/2210))
- **monorepo:** use local package execution for tailwind instead of downloading it every time ([ed149558c](https://github.com/powerhouse-inc/powerhouse/commit/ed149558c))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.42 (2026-01-14)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.41 (2026-01-13)

### 🚀 Features

- **reactor-browser:** useSelectedDocument throws error if there is no selected document ([0eb7ce1b2](https://github.com/powerhouse-inc/powerhouse/commit/0eb7ce1b2))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.40 (2026-01-10)

### 🚀 Features

- **builder-tools:** improved validation on doc model editor and unit tests ([336f5d575](https://github.com/powerhouse-inc/powerhouse/commit/336f5d575))
- **codegen:** add validation to package json test ([03d06ef57](https://github.com/powerhouse-inc/powerhouse/commit/03d06ef57))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.39 (2026-01-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.38 (2026-01-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.37 (2026-01-09)

### 🚀 Features

- **codegen,ph-cmd:** use templates for project boilerplate creation ([#2190](https://github.com/powerhouse-inc/powerhouse/pull/2190))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.36 (2026-01-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.35 (2026-01-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.34 (2026-01-07)

### 🚀 Features

- **ph-cli:** add index.html migration to migrate command ([#2186](https://github.com/powerhouse-inc/powerhouse/pull/2186))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.33 (2026-01-06)

### 🩹 Fixes

- added configuration to debug switchboard, and cleaned up some of the subgraph code ([9ce04c899](https://github.com/powerhouse-inc/powerhouse/commit/9ce04c899))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.32 (2026-01-02)

### 🚀 Features

- **tracing:** migrate from Datadog to OpenTelemetry with Tempo service graphs ([6b4eb9c82](https://github.com/powerhouse-inc/powerhouse/commit/6b4eb9c82))

### ❤️ Thank You

- Frank

## 5.1.0-dev.31 (2026-01-02)

### 🚀 Features

- **switchboard:** added tracing ([c978736b7](https://github.com/powerhouse-inc/powerhouse/commit/c978736b7))

### ❤️ Thank You

- Frank

## 5.1.0-dev.30 (2026-01-01)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.29 (2025-12-30)

### 🩹 Fixes

- **connect,builder-tools,vetra:** avoid page reload on vite HMR ([1c3f5d1dd](https://github.com/powerhouse-inc/powerhouse/commit/1c3f5d1dd))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.28 (2025-12-30)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.27 (2025-12-24)

### 🚀 Features

- **reactor-api:** datadog integration ([3c433c686](https://github.com/powerhouse-inc/powerhouse/commit/3c433c686))
- **reactor-browser:** improved document retrieval hooks ([4fed49391](https://github.com/powerhouse-inc/powerhouse/commit/4fed49391))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 5.1.0-dev.26 (2025-12-20)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.25 (2025-12-19)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.24 (2025-12-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.23 (2025-12-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.22 (2025-12-16)

### 🚀 Features

- added support for runtime document model subgraphs ([dc8248ec6](https://github.com/powerhouse-inc/powerhouse/commit/dc8248ec6))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.21 (2025-12-13)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.20 (2025-12-12)

### 🚀 Features

- **reactor-browsers:** added onErrors callback to dispatch method ([4824a0a10](https://github.com/powerhouse-inc/powerhouse/commit/4824a0a10))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.19 (2025-12-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.18 (2025-12-11)

### 🚀 Features

- **codegen:** add versioned document model generation ([#2130](https://github.com/powerhouse-inc/powerhouse/pull/2130))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.17 (2025-12-11)

### 🩹 Fixes

- **ph-cli:** auth with access-token ([df48be6e9](https://github.com/powerhouse-inc/powerhouse/commit/df48be6e9))

### ❤️ Thank You

- Frank

## 5.1.0-dev.16 (2025-12-11)

### 🚀 Features

- **ph-cli:** added access-token command ([e48181df6](https://github.com/powerhouse-inc/powerhouse/commit/e48181df6))
- **ph-cli:** added login command ([3dbccd06a](https://github.com/powerhouse-inc/powerhouse/commit/3dbccd06a))
- **codegen:** update zod schema generation library ([#2129](https://github.com/powerhouse-inc/powerhouse/pull/2129))
- integrate visibility tools for remotes and pglite instance ([#2122](https://github.com/powerhouse-inc/powerhouse/pull/2122))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.15 (2025-12-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.14 (2025-12-08)

### 🚀 Features

- **connect, switchboard:** added healthcheck route ([9a0671113](https://github.com/powerhouse-inc/powerhouse/commit/9a0671113))
- **academy:** added docker build and publish workflow ([b17562994](https://github.com/powerhouse-inc/powerhouse/commit/b17562994))

### ❤️ Thank You

- Frank

## 5.1.0-dev.13 (2025-12-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.12 (2025-12-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.11 (2025-12-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.10 (2025-12-06)

### 🚀 Features

- **design-system:** added remotes inspector and channel inspector components ([093896ebf](https://github.com/powerhouse-inc/powerhouse/commit/093896ebf))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 5.1.0-dev.9 (2025-12-05)

### 🩹 Fixes

- **renown:** small ui fixes and made connectcrypto and renown id available in hooks ([c06e17226](https://github.com/powerhouse-inc/powerhouse/commit/c06e17226))

### ❤️ Thank You

- Frank

## 5.1.0-dev.8 (2025-12-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.7 (2025-12-04)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.6 (2025-12-04)

### 🩹 Fixes

- **renown:** build issues ([1893c35a0](https://github.com/powerhouse-inc/powerhouse/commit/1893c35a0))

### ❤️ Thank You

- Frank

## 5.1.0-dev.5 (2025-12-04)

### 🚀 Features

- connect crypto signer and verifier ([918fb1fab](https://github.com/powerhouse-inc/powerhouse/commit/918fb1fab))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.4 (2025-12-03)

### 🚀 Features

- **codegen,ph-cli:** add tsx code generator ([#2116](https://github.com/powerhouse-inc/powerhouse/pull/2116))
- **academy:** add new todo list tutorial content ([b6dc16545](https://github.com/powerhouse-inc/powerhouse/commit/b6dc16545))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.3 (2025-12-02)

### 🚀 Features

- **renown:** login component ([#2117](https://github.com/powerhouse-inc/powerhouse/pull/2117))

### ❤️ Thank You

- Frank @froid1911

## 5.1.0-dev.2 (2025-12-02)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.1 (2025-11-26)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.1.0-dev.0 (2025-11-20)

### 🚀 Features

- **reactor-browser,academy:** update hooks documentation ([#2110](https://github.com/powerhouse-inc/powerhouse/pull/2110))
- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))
- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))
- **ph-cli:** ph migrate command ([#2099](https://github.com/powerhouse-inc/powerhouse/pull/2099))
- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))
- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))
- **connect:** remove circular imports ([a1632d41e](https://github.com/powerhouse-inc/powerhouse/commit/a1632d41e))
- switching to tinybench for benchmarks ([5b915e025](https://github.com/powerhouse-inc/powerhouse/commit/5b915e025))
- **codegen, vetra:** update codegen templates ([#2056](https://github.com/powerhouse-inc/powerhouse/pull/2056))
- create default vetra package document when ph vetra is started for a remote drive ([#2066](https://github.com/powerhouse-inc/powerhouse/pull/2066))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))
- **ph-cmd, codegen:** allow specifying custom boilerplate branch to checkout on init ([cd50f8d38](https://github.com/powerhouse-inc/powerhouse/commit/cd50f8d38))
- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### 🩹 Fixes

- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))
- **ph-cli:** added missing runtime dependencies ([da1b66e73](https://github.com/powerhouse-inc/powerhouse/commit/da1b66e73))
- **builder-tools:** use alias for self-reference import on ts instead of loading from dist ([b23b772c0](https://github.com/powerhouse-inc/powerhouse/commit/b23b772c0))
- **reactor-api,switchboard:** load local package by default and resolve self reference import on ts files ([2b2d29ba6](https://github.com/powerhouse-inc/powerhouse/commit/2b2d29ba6))
- **codegen:** move read-pkg to runtime dependency ([939f01045](https://github.com/powerhouse-inc/powerhouse/commit/939f01045))
- **codegen:** run prettier programmatically ([23f948c4d](https://github.com/powerhouse-inc/powerhouse/commit/23f948c4d))
- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))
- update atlas packages ([fa174d00e](https://github.com/powerhouse-inc/powerhouse/commit/fa174d00e))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.128 (2025-11-20)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.127 (2025-11-19)

### 🚀 Features

- **reactor-browser,academy:** update hooks documentation ([#2110](https://github.com/powerhouse-inc/powerhouse/pull/2110))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.126 (2025-11-19)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.125 (2025-11-19)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.124 (2025-11-18)

### 🚀 Features

- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.123 (2025-11-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.122 (2025-11-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.121 (2025-11-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.120 (2025-11-17)

### 🩹 Fixes

- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.119 (2025-11-15)

### 🚀 Features

- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.118 (2025-11-14)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.117 (2025-11-13)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.116 (2025-11-13)

### 🩹 Fixes

- **ph-cli:** added missing runtime dependencies ([da1b66e73](https://github.com/powerhouse-inc/powerhouse/commit/da1b66e73))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.115 (2025-11-13)

### 🚀 Features

- **ph-cli:** ph migrate command ([#2099](https://github.com/powerhouse-inc/powerhouse/pull/2099))

### 🩹 Fixes

- **builder-tools:** use alias for self-reference import on ts instead of loading from dist ([b23b772c0](https://github.com/powerhouse-inc/powerhouse/commit/b23b772c0))
- **reactor-api,switchboard:** load local package by default and resolve self reference import on ts files ([2b2d29ba6](https://github.com/powerhouse-inc/powerhouse/commit/2b2d29ba6))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.114 (2025-11-13)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.113 (2025-11-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.112 (2025-11-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.111 (2025-11-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.110 (2025-11-11)

### 🚀 Features

- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.109 (2025-11-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.108 (2025-11-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.107 (2025-11-10)

### 🚀 Features

- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))

### 🩹 Fixes

- publish docker prod workflow ([d701f8dc0](https://github.com/powerhouse-inc/powerhouse/commit/d701f8dc0))

### ❤️ Thank You

- Frank
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.106 (2025-11-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.105 (2025-11-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.104 (2025-11-07)

### 🚀 Features

- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.103 (2025-11-06)

### 🚀 Features

- **connect:** remove circular imports ([a1632d41e](https://github.com/powerhouse-inc/powerhouse/commit/a1632d41e))

### 🩹 Fixes

- **codegen:** move read-pkg to runtime dependency ([939f01045](https://github.com/powerhouse-inc/powerhouse/commit/939f01045))
- **codegen:** run prettier programmatically ([23f948c4d](https://github.com/powerhouse-inc/powerhouse/commit/23f948c4d))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.102 (2025-11-06)

### 🚀 Features

- switching to tinybench for benchmarks ([5b915e025](https://github.com/powerhouse-inc/powerhouse/commit/5b915e025))

### 🩹 Fixes

- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- update atlas packages ([fa174d00e](https://github.com/powerhouse-inc/powerhouse/commit/fa174d00e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.101 (2025-11-05)

### 🚀 Features

- **codegen, vetra:** update codegen templates ([#2056](https://github.com/powerhouse-inc/powerhouse/pull/2056))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.100 (2025-11-04)

### 🚀 Features

- create default vetra package document when ph vetra is started for a remote drive ([#2066](https://github.com/powerhouse-inc/powerhouse/pull/2066))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))

### 🩹 Fixes

- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.99 (2025-10-31)

### 🚀 Features

- **ph-cmd, codegen:** allow specifying custom boilerplate branch to checkout on init ([cd50f8d38](https://github.com/powerhouse-inc/powerhouse/commit/cd50f8d38))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.98 (2025-10-31)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.97 (2025-10-30)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.96 (2025-10-30)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.95 (2025-10-30)

### 🚀 Features

- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.94 (2025-10-29)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.93 (2025-10-29)

### 🚀 Features

- first swing at a project to import these recorded operations ([41b139237](https://github.com/powerhouse-inc/powerhouse/commit/41b139237))

### 🩹 Fixes

- package link issues ([3415df513](https://github.com/powerhouse-inc/powerhouse/commit/3415df513))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.92 (2025-10-28)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.91 (2025-10-28)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.90 (2025-10-27)

### 🚀 Features

- **reactor-api:** updated apollo server to v5 ([66dffda7b](https://github.com/powerhouse-inc/powerhouse/commit/66dffda7b))

### ❤️ Thank You

- acaldas

## 4.1.0-dev.89 (2025-10-24)

### 🩹 Fixes

- used fixed versions for codemirror dep ([183e487db](https://github.com/powerhouse-inc/powerhouse/commit/183e487db))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.88 (2025-10-24)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.87 (2025-10-24)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.86 (2025-10-23)

### 🩹 Fixes

- **vetra:** added codegen debounce test and reduced logging ([bc360b8e0](https://github.com/powerhouse-inc/powerhouse/commit/bc360b8e0))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.85 (2025-10-22)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.84 (2025-10-22)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.83 (2025-10-22)

### 🚀 Features

- add automated tests for vetra features ([#1962](https://github.com/powerhouse-inc/powerhouse/pull/1962))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.82 (2025-10-21)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.81 (2025-10-21)

### 🚀 Features

- **reactor-browser:** remove catch all wildcard ([f09931a88](https://github.com/powerhouse-inc/powerhouse/commit/f09931a88))
- **reactor-browser,connect:** use new window function factory ([7886c284f](https://github.com/powerhouse-inc/powerhouse/commit/7886c284f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.80 (2025-10-21)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.79 (2025-10-20)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.78 (2025-10-20)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.77 (2025-10-20)

### 🩹 Fixes

- add missing @openfeature/core peer dependency ([2c4a904b0](https://github.com/powerhouse-inc/powerhouse/commit/2c4a904b0))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.76 (2025-10-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.75 (2025-10-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.74 (2025-10-15)

### 🩹 Fixes

- **codegen:** update graphql dependency in package.json ([257f368ac](https://github.com/powerhouse-inc/powerhouse/commit/257f368ac))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.73 (2025-10-15)

### 🚀 Features

- **renown:** added login button ([f109c7305](https://github.com/powerhouse-inc/powerhouse/commit/f109c7305))

### ❤️ Thank You

- Frank

## 4.1.0-dev.72 (2025-10-15)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.71 (2025-10-15)

### 🩹 Fixes

- **codegen:** update analytics processor imports to use in processor templates ([#1954](https://github.com/powerhouse-inc/powerhouse/pull/1954))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.70 (2025-10-14)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.69 (2025-10-11)

### 🚀 Features

- **builder-tools, ph-cli, connect:** reimplemented ph connect build and preview ([4f568517b](https://github.com/powerhouse-inc/powerhouse/commit/4f568517b))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.68 (2025-10-11)

### 🚀 Features

- **vetra:** added read model to fetch vetra packages ([abb6d3742](https://github.com/powerhouse-inc/powerhouse/commit/abb6d3742))

### ❤️ Thank You

- Frank

## 4.1.0-dev.67 (2025-10-10)

### 🚀 Features

- **vetra:** add open button to Package Information section ([#1930](https://github.com/powerhouse-inc/powerhouse/pull/1930))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.66 (2025-10-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.65 (2025-10-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.64 (2025-10-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.63 (2025-10-09)

### 🚀 Features

- update @electric-sql/pglite version ([fa3529328](https://github.com/powerhouse-inc/powerhouse/commit/fa3529328))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.62 (2025-10-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.61 (2025-10-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.60 (2025-10-08)

### 🚀 Features

- **vetra:** added read model to fetch vetra packages ([23c55364d](https://github.com/powerhouse-inc/powerhouse/commit/23c55364d))
- **monorepo:** use latest versions of react related deps ([#1905](https://github.com/powerhouse-inc/powerhouse/pull/1905))
- **monorepo:** remove global storybook installs ([#1903](https://github.com/powerhouse-inc/powerhouse/pull/1903))
- **monorepo:** update to react 19 ([#1902](https://github.com/powerhouse-inc/powerhouse/pull/1902))
- **vetra:** enabled HMR in dev mode ([8cf19757e](https://github.com/powerhouse-inc/powerhouse/commit/8cf19757e))
- **vetra:** new connect build setup on vetra ([8dd11a849](https://github.com/powerhouse-inc/powerhouse/commit/8dd11a849))
- **monorepo:** revert package versions ([8a1a02628](https://github.com/powerhouse-inc/powerhouse/commit/8a1a02628))
- **monorepo:** update eslint config ([ac97af97d](https://github.com/powerhouse-inc/powerhouse/commit/ac97af97d))
- adding feature flags to reactor-mcp ([fe4f2f683](https://github.com/powerhouse-inc/powerhouse/commit/fe4f2f683))
- stubbing out feature flag + reactor setup in connect and deleting unused code in reactor-browser ([793bbd7af](https://github.com/powerhouse-inc/powerhouse/commit/793bbd7af))
- syncing feature flag behavior between switchboard and reactor-local ([e45dc2bf7](https://github.com/powerhouse-inc/powerhouse/commit/e45dc2bf7))
- added initial pieces of the kysely operation store implementation ([3fbece162](https://github.com/powerhouse-inc/powerhouse/commit/3fbece162))
- **connect,builder-tools:** build rework ([#1871](https://github.com/powerhouse-inc/powerhouse/pull/1871))
- **codegen:** updated editor boilerplate with document state and example setName dispatch ([3e7c51cc3](https://github.com/powerhouse-inc/powerhouse/commit/3e7c51cc3))
- restructure document model to avoid circular imports ([#1874](https://github.com/powerhouse-inc/powerhouse/pull/1874))
- added watch-packages option to vetra command and disabled dynamic package loading by default ([#1875](https://github.com/powerhouse-inc/powerhouse/pull/1875))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.59 (2025-09-24)

### 🚀 Features

- **monorepo:** rename tsc to tsc:build ([c1385418b](https://github.com/powerhouse-inc/powerhouse/commit/c1385418b))

### 🩹 Fixes

- **builder-tools:** declare @storybook/preview-api dependency ([705ac8da1](https://github.com/powerhouse-inc/powerhouse/commit/705ac8da1))
- lots of type fixes for modules ([8f4cf02fe](https://github.com/powerhouse-inc/powerhouse/commit/8f4cf02fe))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.58 (2025-09-18)

### 🚀 Features

- adding feature flag to switchboard for controlling reactorv2 api ([4486c8a8d](https://github.com/powerhouse-inc/powerhouse/commit/4486c8a8d))

### 🩹 Fixes

- test fix for document-drive package ([40f4b6416](https://github.com/powerhouse-inc/powerhouse/commit/40f4b6416))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.57 (2025-09-17)

### 🚀 Features

- **monorepo:** empty commit to satisfy naming ([5aa18f417](https://github.com/powerhouse-inc/powerhouse/commit/5aa18f417))
- **monorepo:** merge main ([79f6472b1](https://github.com/powerhouse-inc/powerhouse/commit/79f6472b1))
- **monorepo:** update release branch workflow ([e9c221ab5](https://github.com/powerhouse-inc/powerhouse/commit/e9c221ab5))

### 🩹 Fixes

- **monorepo:** re-add nx js plugin ([d477a49d7](https://github.com/powerhouse-inc/powerhouse/commit/d477a49d7))
- **monorepo:** regenerate lockfile ([7811171ff](https://github.com/powerhouse-inc/powerhouse/commit/7811171ff))
- **monorepo:** linting and type checking ([#1776](https://github.com/powerhouse-inc/powerhouse/pull/1776))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.56 (2025-09-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.55 (2025-09-16)

### 🚀 Features

- enable supported document types for drag and drop feature ([#1860](https://github.com/powerhouse-inc/powerhouse/pull/1860))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.54 (2025-09-16)

### 🚀 Features

- adding reactor client to subgraph args ([d0a8011e6](https://github.com/powerhouse-inc/powerhouse/commit/d0a8011e6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.53 (2025-09-13)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.52 (2025-09-12)

### 🩹 Fixes

- **connect-e2e:** fix failing tests ([88c3bea94](https://github.com/powerhouse-inc/powerhouse/commit/88c3bea94))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.51 (2025-09-11)

### 🚀 Features

- **reactor-api:** generate sdk ([ec107015c](https://github.com/powerhouse-inc/powerhouse/commit/ec107015c))
- **reactor-api:** initial gql codegen ([3db9e9778](https://github.com/powerhouse-inc/powerhouse/commit/3db9e9778))
- **monorepo:** make format consistent across ignores ([98469560f](https://github.com/powerhouse-inc/powerhouse/commit/98469560f))
- **monorepo:** use consistent separate type imports ([6fd4ac0f4](https://github.com/powerhouse-inc/powerhouse/commit/6fd4ac0f4))
- **monorepo:** use consistent formatting ([d2a1182c5](https://github.com/powerhouse-inc/powerhouse/commit/d2a1182c5))

### 🩹 Fixes

- linting fixes ([27fe7d397](https://github.com/powerhouse-inc/powerhouse/commit/27fe7d397))
- annoyingly, you have to add ignores to the root eslint ([bb6d993bd](https://github.com/powerhouse-inc/powerhouse/commit/bb6d993bd))
- **docs:** improve document hooks documentation ([d05fcb835](https://github.com/powerhouse-inc/powerhouse/commit/d05fcb835))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T
- ryanwolhuter @ryanwolhuter

## 5.0.0-staging.9 (2025-09-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.0.0-staging.8 (2025-09-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.0.0-staging.7 (2025-09-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.0.0-staging.6 (2025-09-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.0.0-staging.5 (2025-09-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.0.0-staging.4 (2025-09-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.0.0-staging.3 (2025-09-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 5.0.0-staging.2 (2025-09-05)

### 🩹 Fixes

- **docs:** added zip redundancy to release notes ([3acfe1027](https://github.com/powerhouse-inc/powerhouse/commit/3acfe1027))

### ❤️ Thank You

- Callme-T

## 5.0.0-staging.1 (2025-09-04)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.44 (2025-09-04)

### 🚀 Features

- **switchboard:** updated readme ([9659cf035](https://github.com/powerhouse-inc/powerhouse/commit/9659cf035))

### ❤️ Thank You

- Frank

## 4.1.0-dev.43 (2025-09-02)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.42 (2025-09-02)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.41 (2025-09-02)

### 🩹 Fixes

- **document-drive:** install openssl ([89f21529e](https://github.com/powerhouse-inc/powerhouse/commit/89f21529e))
- **document-drive:** prisma build ([7884368a2](https://github.com/powerhouse-inc/powerhouse/commit/7884368a2))
- **switchboard, connect:** fetch proper tag ([79a0bc967](https://github.com/powerhouse-inc/powerhouse/commit/79a0bc967))

### ❤️ Thank You

- Frank

## 4.1.0-dev.40 (2025-09-02)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.39 (2025-09-02)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.38 (2025-08-30)

### 🚀 Features

- gql-gen spec ([5bf2c7226](https://github.com/powerhouse-inc/powerhouse/commit/5bf2c7226))
- **reactor:** we have a reactor facade ([7a61e68ab](https://github.com/powerhouse-inc/powerhouse/commit/7a61e68ab))
- **reactor:** impstubbing out initial interface and types ([b74b194f9](https://github.com/powerhouse-inc/powerhouse/commit/b74b194f9))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.37 (2025-08-29)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.36 (2025-08-28)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.35 (2025-08-27)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.34 (2025-08-26)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.33 (2025-08-21)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.32 (2025-08-21)

### 🩹 Fixes

- **ph-cli:** resolve local document model loading in switchboard and vetra ([262f13035](https://github.com/powerhouse-inc/powerhouse/commit/262f13035))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.31 (2025-08-20)

### 🚀 Features

- added interactive mode to vetra command ([#1775](https://github.com/powerhouse-inc/powerhouse/pull/1775))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.30 (2025-08-20)

### 🩹 Fixes

- add additional tags ([4f0cf8658](https://github.com/powerhouse-inc/powerhouse/commit/4f0cf8658))

### ❤️ Thank You

- Frank

## 4.1.0-dev.29 (2025-08-20)

### 🩹 Fixes

- fetch tags :-) ([df0b7beba](https://github.com/powerhouse-inc/powerhouse/commit/df0b7beba))

### ❤️ Thank You

- Frank

## 4.1.0-dev.28 (2025-08-20)

### 🩹 Fixes

- removed metadata extraction from commit ([637960021](https://github.com/powerhouse-inc/powerhouse/commit/637960021))

### ❤️ Thank You

- Frank

## 4.1.0-dev.27 (2025-08-20)

### 🩹 Fixes

- extract metadata tags and labels for docker ([bb9c81ce7](https://github.com/powerhouse-inc/powerhouse/commit/bb9c81ce7))
- use github tag properly ([95ccff4b8](https://github.com/powerhouse-inc/powerhouse/commit/95ccff4b8))
- proper tag for docker images ([e73e10617](https://github.com/powerhouse-inc/powerhouse/commit/e73e10617))
- use patname secret instead of github token ([db9dfd5cd](https://github.com/powerhouse-inc/powerhouse/commit/db9dfd5cd))

### ❤️ Thank You

- Frank

## 4.1.0-dev.26 (2025-08-20)

### 🩹 Fixes

- docker deploy alternative approach ([2a5522cdc](https://github.com/powerhouse-inc/powerhouse/commit/2a5522cdc))

### ❤️ Thank You

- Frank

## 4.1.0-dev.25 (2025-08-20)

### 🩹 Fixes

- docker deploy ([b057a7cce](https://github.com/powerhouse-inc/powerhouse/commit/b057a7cce))

### ❤️ Thank You

- Frank

## 4.1.0-dev.24 (2025-08-20)

### 🚀 Features

- **codegen:** add drive explorer template ([9c27219dc](https://github.com/powerhouse-inc/powerhouse/commit/9c27219dc))
- **connect,reactor-browser:** remove more old electron garbage ([5cd255568](https://github.com/powerhouse-inc/powerhouse/commit/5cd255568))
- **connect:** remove broken electron code ([3f28d6a46](https://github.com/powerhouse-inc/powerhouse/commit/3f28d6a46))
- **reactor-browser,connect,vetra:** move state hooks into reactor browser and eliminate redundant and dead code ([30fa16f1f](https://github.com/powerhouse-inc/powerhouse/commit/30fa16f1f))
- **connect,state,renown:** add state hook for renown ([5beb1252b](https://github.com/powerhouse-inc/powerhouse/commit/5beb1252b))
- **connect:** remove unused dep ([ef492bc7a](https://github.com/powerhouse-inc/powerhouse/commit/ef492bc7a))
- **connect,state,reactor-browser:** eliminate jotai ([53b1ab759](https://github.com/powerhouse-inc/powerhouse/commit/53b1ab759))
- **state:** rename to vetra packages ([c415b7dc2](https://github.com/powerhouse-inc/powerhouse/commit/c415b7dc2))
- **state:** use ph packages atoms ([6421fbeea](https://github.com/powerhouse-inc/powerhouse/commit/6421fbeea))

### 🩹 Fixes

- today claude taught me I could mock a package to fix circular references ([dcb83174c](https://github.com/powerhouse-inc/powerhouse/commit/dcb83174c))
- **monorepo:** numerous build issues ([04349dd25](https://github.com/powerhouse-inc/powerhouse/commit/04349dd25))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.23 (2025-08-19)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.22 (2025-08-15)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.21 (2025-08-15)

### 🚀 Features

- **vetra:** update manifest when new module is added ([#1766](https://github.com/powerhouse-inc/powerhouse/pull/1766))
- **academy:** hooks documentation ([a517eadce](https://github.com/powerhouse-inc/powerhouse/commit/a517eadce))

### 🩹 Fixes

- **academy:** subgraphs documentation update ([4f3a024ab](https://github.com/powerhouse-inc/powerhouse/commit/4f3a024ab))
- fixed debug launch configuration now that source maps are in the proper locations ([c75d793ed](https://github.com/powerhouse-inc/powerhouse/commit/c75d793ed))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.20 (2025-08-15)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.19 (2025-08-14)

### 🩹 Fixes

- **academy:** subgraph example ([ae3e24458](https://github.com/powerhouse-inc/powerhouse/commit/ae3e24458))

### ❤️ Thank You

- Frank

## 4.1.0-dev.18 (2025-08-14)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.17 (2025-08-12)

### 🚀 Features

- refactor vetra command and remove vetra deps in connect and reactor ([#1753](https://github.com/powerhouse-inc/powerhouse/pull/1753))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.16 (2025-08-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.15 (2025-08-12)

### 🚀 Features

- **reactor-mcp,reactor-api,reactor-local,switchboard,ph-cli:** run mcp on express app ([d51fa590e](https://github.com/powerhouse-inc/powerhouse/commit/d51fa590e))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.14 (2025-08-11)

### 🚀 Features

- update document engineering dep ([54dcee90d](https://github.com/powerhouse-inc/powerhouse/commit/54dcee90d))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.13 (2025-08-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.12 (2025-08-08)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.11 (2025-08-07)

### 🚀 Features

- **switchboard,reactor-local,reactor-api:** moved vite loader to reactor-api package ([c84f0a2a3](https://github.com/powerhouse-inc/powerhouse/commit/c84f0a2a3))
- vetra package documents and app integration ([0e4053302](https://github.com/powerhouse-inc/powerhouse/commit/0e4053302))
- **vetra:** added vetra drive editor ([4ebafd143](https://github.com/powerhouse-inc/powerhouse/commit/4ebafd143))
- **ph-cli:** added verbose option to vetra command ([7310ec06c](https://github.com/powerhouse-inc/powerhouse/commit/7310ec06c))
- integrate package documents into reactor system ([939fe8e80](https://github.com/powerhouse-inc/powerhouse/commit/939fe8e80))
- **connect:** integrate Vetra package documents and editors ([2ecb9bd15](https://github.com/powerhouse-inc/powerhouse/commit/2ecb9bd15))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.10 (2025-08-07)

### 🚀 Features

- **builder-tools,codegen,design-system,reactor-api:** updated document-engineering version ([e74068b43](https://github.com/powerhouse-inc/powerhouse/commit/e74068b43))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.9 (2025-08-07)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.8 (2025-08-06)

### 🚀 Features

- **switchboard,config,reactor-api:** handle auth in reactor-api ([f33c921ee](https://github.com/powerhouse-inc/powerhouse/commit/f33c921ee))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.7 (2025-08-06)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.5 (2025-08-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.1.0-dev.4 (2025-08-02)

### 🚀 Features

- ts morph integration ([#1729](https://github.com/powerhouse-inc/powerhouse/pull/1729))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.3 (2025-08-01)

### 🚀 Features

- **reactor-mcp:** setup of modular reactor tools ([ceab98b08](https://github.com/powerhouse-inc/powerhouse/commit/ceab98b08))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.2 (2025-07-31)

### 🚀 Features

- **reactor-mcp,document/model:** initial implementation of reactor mcp ([4eaab9ab0](https://github.com/powerhouse-inc/powerhouse/commit/4eaab9ab0))

### 🩹 Fixes

- linter issues ([e55a16456](https://github.com/powerhouse-inc/powerhouse/commit/e55a16456))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.1 (2025-07-29)

### 🚀 Features

- added vetra command and vetra project ([#1713](https://github.com/powerhouse-inc/powerhouse/pull/1713))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.0.0-staging.8 (2025-07-29)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 4.0.0-staging.7 (2025-07-26)

### 🚀 Features

- **state:** make all atom states derivative ([68a4bfece](https://github.com/powerhouse-inc/powerhouse/commit/68a4bfece))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.0.0-staging.6 (2025-07-25)

### 🚀 Features

- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.19 (2025-07-25)

### 🚀 Features

- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.18 (2025-07-24)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.17 (2025-07-23)

### 🩹 Fixes

- update release notes ([f1b6a8e71](https://github.com/powerhouse-inc/powerhouse/commit/f1b6a8e71))
- add release notes on correct branch ([a2d60a537](https://github.com/powerhouse-inc/powerhouse/commit/a2d60a537))

### ❤️ Thank You

- Callme-T

## 3.3.0-dev.16 (2025-07-22)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.15 (2025-07-17)

### 🩹 Fixes

- **codegen:** updated subgraph template to deal with undefined return on getDocument ([7b2862a91](https://github.com/powerhouse-inc/powerhouse/commit/7b2862a91))
- **academy:** update broken links ([cbbfe9b30](https://github.com/powerhouse-inc/powerhouse/commit/cbbfe9b30))

### ❤️ Thank You

- acaldas
- Callme-T

## 3.3.0-dev.14 (2025-07-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.13 (2025-07-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.12 (2025-07-17)

### 🩹 Fixes

- **document-drive:** use lowercase letters when hashing relational processor namespace ([87c7944d3](https://github.com/powerhouse-inc/powerhouse/commit/87c7944d3))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.11 (2025-07-16)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.10 (2025-07-15)

### 🩹 Fixes

- **codegen:** remove sucrase dependency and update schema gen ([9d3efd2ec](https://github.com/powerhouse-inc/powerhouse/commit/9d3efd2ec))

### ❤️ Thank You

- Guillermo Puente

## 3.3.0-dev.9 (2025-07-10)

### 🩹 Fixes

- force release ([8185a3b37](https://github.com/powerhouse-inc/powerhouse/commit/8185a3b37))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.3.0-dev.8 (2025-07-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.7 (2025-07-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.6 (2025-07-10)

### 🚀 Features

- **codegen:** support loading migration typescript file ([d3cc1957b](https://github.com/powerhouse-inc/powerhouse/commit/d3cc1957b))

### 🩹 Fixes

- **academy:** build ([88681db3d](https://github.com/powerhouse-inc/powerhouse/commit/88681db3d))
- **codegen,ph-cli:** make schema-file optional and updated generate help text ([adad303a8](https://github.com/powerhouse-inc/powerhouse/commit/adad303a8))

### ❤️ Thank You

- acaldas
- Frank

## 3.3.0-dev.5 (2025-07-09)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.4 (2025-07-09)

### 🚀 Features

- **codegen,ph-cli:** added generate schema command ([9a5e921fb](https://github.com/powerhouse-inc/powerhouse/commit/9a5e921fb))
- **document-drive:** initial work on BaseOperationalProcessor ([40fe0ec2f](https://github.com/powerhouse-inc/powerhouse/commit/40fe0ec2f))

### 🩹 Fixes

- **reactor-api, reactor-local:** build issues ([927192aff](https://github.com/powerhouse-inc/powerhouse/commit/927192aff))

### ❤️ Thank You

- acaldas
- Frank

## 3.3.0-dev.3 (2025-07-08)

### 🚀 Features

- added operational hooks and utils in reactor-browser ([216f7d03d](https://github.com/powerhouse-inc/powerhouse/commit/216f7d03d))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.2 (2025-07-05)

### 🩹 Fixes

- **academy:** graphql at powerhouse update ([fea4eae24](https://github.com/powerhouse-inc/powerhouse/commit/fea4eae24))

### ❤️ Thank You

- Callme-T

## 3.3.0-dev.1 (2025-07-04)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.3.0-dev.0 (2025-07-02)

### 🚀 Features

- **academy:** add Drive Analytics documentation and examples ([daedc28a3](https://github.com/powerhouse-inc/powerhouse/commit/daedc28a3))
- starting to stub out a complete example of the analytics processor ([a84ed2dcf](https://github.com/powerhouse-inc/powerhouse/commit/a84ed2dcf))
- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))
- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### 🩹 Fixes

- fix build ([c0cd6988d](https://github.com/powerhouse-inc/powerhouse/commit/c0cd6988d))
- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))
- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 3.2.0-dev.9 (2025-07-02)

### 🩹 Fixes

- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 3.2.0-dev.8 (2025-07-01)

### 🚀 Features

- **academy:** add Drive Analytics documentation and examples ([daedc28a3](https://github.com/powerhouse-inc/powerhouse/commit/daedc28a3))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.2.0-dev.7 (2025-06-28)

### 🚀 Features

- starting to stub out a complete example of the analytics processor ([a84ed2dcf](https://github.com/powerhouse-inc/powerhouse/commit/a84ed2dcf))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 3.2.0-dev.6 (2025-06-27)

### 🚀 Features

- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))
- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### 🩹 Fixes

- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente
- Guillermo Puente Sandoval
- ryanwolhuter

## 3.2.0-dev.5 (2025-06-26)

### 🚀 Features

- **common:** add atoms library ([dbc8e8b44](https://github.com/powerhouse-inc/powerhouse/commit/dbc8e8b44))

### 🩹 Fixes

- **connect,codegen,common,reactor-browser:** fix analytics query subscription ([6e9729739](https://github.com/powerhouse-inc/powerhouse/commit/6e9729739))

### ❤️ Thank You

- acaldas
- ryanwolhuter

## 3.2.0-dev.4 (2025-06-25)

### 🚀 Features

- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### ❤️ Thank You

- Guillermo Puente Sandoval

## 3.2.0-dev.3 (2025-06-24)

### 🩹 Fixes

- **connect, builder-tools:** disable external packages in dev mode ([e13243874](https://github.com/powerhouse-inc/powerhouse/commit/e13243874))

### ❤️ Thank You

- acaldas

## 3.2.0-dev.2 (2025-06-20)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 3.2.0-dev.1 (2025-06-19)

### 🩹 Fixes

- **connect,builder-tools:** support base paths without ending slash ([1ee6d9d9f](https://github.com/powerhouse-inc/powerhouse/commit/1ee6d9d9f))

### ❤️ Thank You

- acaldas

## 3.2.0-dev.0 (2025-06-18)

### 🚀 Features

- use document model subgraph when clicking on switchboard url button ([24cf6ad94](https://github.com/powerhouse-inc/powerhouse/commit/24cf6ad94))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.41 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.40 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.39 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.38 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.37 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.36 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.35 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.34 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.33 (2025-06-18)

### 🩹 Fixes

- deploy not on push to main ([63eef7020](https://github.com/powerhouse-inc/powerhouse/commit/63eef7020))
- deploy powerhouse to available environments ([a45859a22](https://github.com/powerhouse-inc/powerhouse/commit/a45859a22))

### ❤️ Thank You

- Frank

## 2.5.0-dev.32 (2025-06-18)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.31 (2025-06-18)

### 🚀 Features

- **connect,builder-tools,ph-cli:** added support for path argument on ph connect build and preview ([fe049aae8](https://github.com/powerhouse-inc/powerhouse/commit/fe049aae8))
- **reactor:** initial event-bus implementation with tests and benchmarks ([ef5b3c42e](https://github.com/powerhouse-inc/powerhouse/commit/ef5b3c42e))

### 🩹 Fixes

- **ph-cli:** install and uninstall packages with and without version tag ([c2a4ad13f](https://github.com/powerhouse-inc/powerhouse/commit/c2a4ad13f))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank

## 2.5.0-dev.30 (2025-06-17)

### 🩹 Fixes

- **connect:** set proper tag on docker build ([598c1b3fb](https://github.com/powerhouse-inc/powerhouse/commit/598c1b3fb))

### ❤️ Thank You

- Frank

## 2.5.0-dev.29 (2025-06-17)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.28 (2025-06-16)

### 🚀 Features

- add app skeleton to html at build time ([1882bb820](https://github.com/powerhouse-inc/powerhouse/commit/1882bb820))

### ❤️ Thank You

- acaldas

## 2.5.0-dev.27 (2025-06-16)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.26 (2025-06-16)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.25 (2025-06-13)

### 🚀 Features

- start dependent services with switchboard ([188c82c6a](https://github.com/powerhouse-inc/powerhouse/commit/188c82c6a))

### 🩹 Fixes

- **docker:** request write permissions ([29d4d3fd7](https://github.com/powerhouse-inc/powerhouse/commit/29d4d3fd7))

### ❤️ Thank You

- Frank

## 2.5.0-dev.24 (2025-06-13)

### 🚀 Features

- added hostnames in docker compose ([a590eea17](https://github.com/powerhouse-inc/powerhouse/commit/a590eea17))
- **docker-compose:** work with published images ([9f31b70fb](https://github.com/powerhouse-inc/powerhouse/commit/9f31b70fb))
- **ci:** build and publish docker images on newly created tags ([ee930c4a4](https://github.com/powerhouse-inc/powerhouse/commit/ee930c4a4))

### ❤️ Thank You

- Frank

## 2.5.0-dev.23 (2025-06-13)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.22 (2025-06-13)

### 🩹 Fixes

- **ci:** set proper tags for docker images ([3cab91969](https://github.com/powerhouse-inc/powerhouse/commit/3cab91969))
- **ci:** connect deployment ([8ac8e423b](https://github.com/powerhouse-inc/powerhouse/commit/8ac8e423b))

### ❤️ Thank You

- Frank

## 2.5.0-dev.21 (2025-06-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.20 (2025-06-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.19 (2025-06-12)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.18 (2025-06-12)

### 🚀 Features

- added docker publish workflow ([adf65ef8a](https://github.com/powerhouse-inc/powerhouse/commit/adf65ef8a))

### ❤️ Thank You

- Frank

## 2.5.0-dev.17 (2025-06-12)

### 🚀 Features

- show app skeleton while loading and accessibility fixes ([4f96e2472](https://github.com/powerhouse-inc/powerhouse/commit/4f96e2472))

### ❤️ Thank You

- acaldas

## 2.5.0-dev.16 (2025-06-11)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.15 (2025-06-11)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.14 (2025-06-10)

### 🚀 Features

- improved analytics frontend integration ([269aed50c](https://github.com/powerhouse-inc/powerhouse/commit/269aed50c))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.13 (2025-06-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.12 (2025-06-10)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.11 (2025-06-07)

### 🚀 Features

- **connect:** updated diff-analyzer processor ([ce5d1219f](https://github.com/powerhouse-inc/powerhouse/commit/ce5d1219f))

### ❤️ Thank You

- acaldas

## 2.5.0-dev.10 (2025-06-06)

### 🚀 Features

- run analytics db on web worker ([ecf79575f](https://github.com/powerhouse-inc/powerhouse/commit/ecf79575f))

### ❤️ Thank You

- acaldas

## 2.5.0-dev.9 (2025-06-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.8 (2025-06-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.7 (2025-06-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.6 (2025-06-05)

### 🩹 Fixes

- set node 22 in release branch workflow ([b33681938](https://github.com/powerhouse-inc/powerhouse/commit/b33681938))

### ❤️ Thank You

- Frank

## 2.5.0-dev.5 (2025-06-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.4 (2025-06-05)

### 🩹 Fixes

- **builder-tools:** move esbuild dev dep to deps ([baa22be6f](https://github.com/powerhouse-inc/powerhouse/commit/baa22be6f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.3 (2025-06-05)

### 🚀 Features

- **builder-tools:** add node polyfills esbuild plugin for connect build ([43dd16b4d](https://github.com/powerhouse-inc/powerhouse/commit/43dd16b4d))

### ❤️ Thank You

- ryanwolhuter

## 2.5.0-dev.2 (2025-06-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.1 (2025-06-05)

This was a version bump only for @powerhousedao/academy to align it with other projects, there were no code changes.

## 2.5.0-dev.0 (2025-06-04)

### 🚀 Features

- **academy:** centralize husky & auto-update cli docs ([8c92e0bb1](https://github.com/powerhouse-inc/powerhouse/commit/8c92e0bb1))
- **ph-cli:** added setup-service command ([dfa082aa6](https://github.com/powerhouse-inc/powerhouse/commit/dfa082aa6))
- **scripts:** updated setup scripts ([9f7fa7644](https://github.com/powerhouse-inc/powerhouse/commit/9f7fa7644))
- enforce conventional commits ([faa49da40](https://github.com/powerhouse-inc/powerhouse/commit/faa49da40))
- removed scalars package ([d6f7059a7](https://github.com/powerhouse-inc/powerhouse/commit/d6f7059a7))
- enabled switchboard command ([5a9c467bf](https://github.com/powerhouse-inc/powerhouse/commit/5a9c467bf))
- removed scalars dependencies ([596aedbd5](https://github.com/powerhouse-inc/powerhouse/commit/596aedbd5))
- **builder-tools:** handle recursive objects in initial state generator ([c9eedcc43](https://github.com/powerhouse-inc/powerhouse/commit/c9eedcc43))
- **monorepo:** bump graphql lib ([ba9d5d338](https://github.com/powerhouse-inc/powerhouse/commit/ba9d5d338))
- **monorepo:** handle updating monorepo build deps ([db2ac2316](https://github.com/powerhouse-inc/powerhouse/commit/db2ac2316))
- **monorepo:** regenerate lockfile ([a6c390b4e](https://github.com/powerhouse-inc/powerhouse/commit/a6c390b4e))
- **builder-tools:** fix wrong value used for field id ([a6c6142e0](https://github.com/powerhouse-inc/powerhouse/commit/a6c6142e0))
- **reactor-api,reactor-local:** updated analytics dependencies ([cbeace573](https://github.com/powerhouse-inc/powerhouse/commit/cbeace573))

### 🩹 Fixes

- **academy:** docker build ([58e83be09](https://github.com/powerhouse-inc/powerhouse/commit/58e83be09))
- **academy:** lockfile issue second time' ([6208fe614](https://github.com/powerhouse-inc/powerhouse/commit/6208fe614))
- **academy:** fix frozen lockfile issue' ([80f18ec73](https://github.com/powerhouse-inc/powerhouse/commit/80f18ec73))
- **academy:** fix frozen lockfile issue ([bfc3dcd21](https://github.com/powerhouse-inc/powerhouse/commit/bfc3dcd21))
- **pre-commit:** use bash syntax and shebang ([da00ff581](https://github.com/powerhouse-inc/powerhouse/commit/da00ff581))
- added missing dep to academy ([4ec6c8278](https://github.com/powerhouse-inc/powerhouse/commit/4ec6c8278))
- **academy:** clean up husky script ([e18e26cd8](https://github.com/powerhouse-inc/powerhouse/commit/e18e26cd8))
- **academy:** deployment ([36e5f194d](https://github.com/powerhouse-inc/powerhouse/commit/36e5f194d))
- **switchboard:** docker build ([7052e39e1](https://github.com/powerhouse-inc/powerhouse/commit/7052e39e1))
- docker build with PH_PACKAGES ([856ac1187](https://github.com/powerhouse-inc/powerhouse/commit/856ac1187))
- **document-drive:** fix type issue on browser storage ([240a78b41](https://github.com/powerhouse-inc/powerhouse/commit/240a78b41))
- **ph-cli:** ph add does not remove installed packages ([aedfbf56e](https://github.com/powerhouse-inc/powerhouse/commit/aedfbf56e))
- remove .env and add to .gitignore ([0d2d48684](https://github.com/powerhouse-inc/powerhouse/commit/0d2d48684))
- **switchboard,reactor-local:** latest version of sky atlas was not being installed ([72bf72fd4](https://github.com/powerhouse-inc/powerhouse/commit/72bf72fd4))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Callme-T
- Frank
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter

## 0.1.0-dev.6 (2025-06-04)

### 🩹 Fixes

- **academy:** docker build ([58e83be09](https://github.com/powerhouse-inc/powerhouse/commit/58e83be09))

### ❤️ Thank You

- Frank

## 0.1.0-dev.5 (2025-06-03)

### 🩹 Fixes

- **academy:** lockfile issue second time' ([6208fe614](https://github.com/powerhouse-inc/powerhouse/commit/6208fe614))
- **academy:** fix frozen lockfile issue' ([80f18ec73](https://github.com/powerhouse-inc/powerhouse/commit/80f18ec73))
- **academy:** fix frozen lockfile issue ([bfc3dcd21](https://github.com/powerhouse-inc/powerhouse/commit/bfc3dcd21))

### ❤️ Thank You

- Callme-T

## 0.1.0-dev.4 (2025-06-03)

### 🚀 Features

- **academy:** centralize husky & auto-update cli docs ([8c92e0bb1](https://github.com/powerhouse-inc/powerhouse/commit/8c92e0bb1))
- **ph-cli:** added setup-service command ([dfa082aa6](https://github.com/powerhouse-inc/powerhouse/commit/dfa082aa6))
- **scripts:** updated setup scripts ([9f7fa7644](https://github.com/powerhouse-inc/powerhouse/commit/9f7fa7644))

### 🩹 Fixes

- **pre-commit:** use bash syntax and shebang ([da00ff581](https://github.com/powerhouse-inc/powerhouse/commit/da00ff581))
- added missing dep to academy ([4ec6c8278](https://github.com/powerhouse-inc/powerhouse/commit/4ec6c8278))
- **academy:** clean up husky script ([e18e26cd8](https://github.com/powerhouse-inc/powerhouse/commit/e18e26cd8))

### ❤️ Thank You

- Callme-T
- Frank
- Guillermo Puente @gpuente

## 0.1.0-dev.3 (2025-05-27)

### 🚀 Features

- enforce conventional commits ([faa49da40](https://github.com/powerhouse-inc/powerhouse/commit/faa49da40))

### ❤️ Thank You

- Frank

## 0.1.0-dev.2 (2025-05-26)

### 🩹 Fixes

- **academy:** deployment ([36e5f194d](https://github.com/powerhouse-inc/powerhouse/commit/36e5f194d))
- **switchboard:** docker build ([7052e39e1](https://github.com/powerhouse-inc/powerhouse/commit/7052e39e1))

### ❤️ Thank You

- Frank

## 0.1.0-dev.1 (2025-05-25)

### 🚀 Features

- **academy:** added authorization docs ([470231bfd](https://github.com/powerhouse-inc/powerhouse/commit/470231bfd))

### ❤️ Thank You

- Frank

## 0.1.0-dev.0 (2025-05-24)

### 🚀 Features

- **academy:** added authorization docs ([470231bfd](https://github.com/powerhouse-inc/powerhouse/commit/470231bfd))

### ❤️ Thank You

- Frank
