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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.123 (2026-03-29)

### 🚀 Features

- **docker:** redesign Docker strategy with runtime package loading ([08207df3d](https://github.com/powerhouse-inc/powerhouse/commit/08207df3d))

### ❤️ Thank You

- Frank

## 6.0.0-dev.122 (2026-03-29)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.121 (2026-03-29)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.120 (2026-03-29)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.119 (2026-03-29)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.118 (2026-03-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.117 (2026-03-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.110 (2026-03-25)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.109 (2026-03-24)

### 🚀 Features

- **vetra-e2e:** add editor creation, registry publish, and consumer install e2e tests ([a215a7d7e](https://github.com/powerhouse-inc/powerhouse/commit/a215a7d7e))

### 🩹 Fixes

- lockfile ([292187fae](https://github.com/powerhouse-inc/powerhouse/commit/292187fae))
- **reactor:** return cursor when single scope is requested on getOperations ([b7c6a6c33](https://github.com/powerhouse-inc/powerhouse/commit/b7c6a6c33))

### ❤️ Thank You

- acaldas @acaldas
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
- long test ([687e70c1e](https://github.com/powerhouse-inc/powerhouse/commit/687e70c1e))
- codegen tests ([b857b8ab6](https://github.com/powerhouse-inc/powerhouse/commit/b857b8ab6))
- **reactor-api:** resolve tsconfig path aliases in switchboard's Vite SSR loader ([dd812a933](https://github.com/powerhouse-inc/powerhouse/commit/dd812a933))
- **document-drive:** fix tsc build and prisma ESM \_\_dirname error ([f0c252d96](https://github.com/powerhouse-inc/powerhouse/commit/f0c252d96))
- stop mixing node and browser code ([9d5513533](https://github.com/powerhouse-inc/powerhouse/commit/9d5513533))
- always build css after bundle ([36dca2c95](https://github.com/powerhouse-inc/powerhouse/commit/36dca2c95))
- always build css after bundling ([565d11dca](https://github.com/powerhouse-inc/powerhouse/commit/565d11dca))
- so much, too much to even describe ([4aa9ebf54](https://github.com/powerhouse-inc/powerhouse/commit/4aa9ebf54))
- e2e tests ([d1bfe5f08](https://github.com/powerhouse-inc/powerhouse/commit/d1bfe5f08))
- type mock weirdness ([74e669c0f](https://github.com/powerhouse-inc/powerhouse/commit/74e669c0f))
- **connect,vetra:** move vite plugin node polyfills to specific packages ([e3b0fa37b](https://github.com/powerhouse-inc/powerhouse/commit/e3b0fa37b))
- strange export style in reactor browser which caused circular references ([683e17196](https://github.com/powerhouse-inc/powerhouse/commit/683e17196))
- handle both node and browser types ([90f793133](https://github.com/powerhouse-inc/powerhouse/commit/90f793133))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.107 (2026-03-23)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.104 (2026-03-22)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.103 (2026-03-21)

### 🩹 Fixes

- **reactor:** temporary fix for deleting documents and cleaning up all edges too -- very costly ([8a15a0604](https://github.com/powerhouse-inc/powerhouse/commit/8a15a0604))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.102 (2026-03-20)

### 🩹 Fixes

- update workflow to use refname for tag in case it is not annotated, and provide a clear error message when there is no tag ([269758716](https://github.com/powerhouse-inc/powerhouse/commit/269758716))
- **reactor:** fix issue where deleted docs were still being returned -- document-view should store isdeleted across all scopes ([709b4917c](https://github.com/powerhouse-inc/powerhouse/commit/709b4917c))
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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

### 🚀 Features

- **reactor:** abort signals should be able to be passed all the way through the job pipeline, which also gives us job timeout ([192ff6111](https://github.com/powerhouse-inc/powerhouse/commit/192ff6111))
- **reactor:** introducing a new quarantine feature -- now instead of blocking an entire remote from updating after sync issues, we only quarantine affected documents ([6df4d4a31](https://github.com/powerhouse-inc/powerhouse/commit/6df4d4a31))

### 🩹 Fixes

- **design-system:** removed zod dependency ([fdc7c2ef7](https://github.com/powerhouse-inc/powerhouse/commit/fdc7c2ef7))
- **reactor:** backfill should stream pages into outbox to get them all, and to prevent in-memory buildup ([fa3acba22](https://github.com/powerhouse-inc/powerhouse/commit/fa3acba22))
- **reactor:** removing some dead code ([4aa05f61c](https://github.com/powerhouse-inc/powerhouse/commit/4aa05f61c))
- **reactor:** gql channel should not have multiple pushes in-flight at the same time ([bdcd32a01](https://github.com/powerhouse-inc/powerhouse/commit/bdcd32a01))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan

## 6.0.0-dev.96 (2026-03-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.92 (2026-03-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.91 (2026-03-17)

### 🩹 Fixes

- **reactor:** gql requests should hava abort signal ([2d764968e](https://github.com/powerhouse-inc/powerhouse/commit/2d764968e))
- adding build-bundle to simulate-ci-workflow ([ca93d1a2b](https://github.com/powerhouse-inc/powerhouse/commit/ca93d1a2b))
- **reactor, reactor-api:** added multiple sync recovery fixes ([9e7bfa64f](https://github.com/powerhouse-inc/powerhouse/commit/9e7bfa64f))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.90 (2026-03-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.89 (2026-03-13)

### 🚀 Features

- **reactor:** add a DocumentIntegrityService with keyframe/snapshot validation and rebuild, a new integrity inspector UI component, and IKeyframeStore.listKeyframes/deleteKeyframes extensions ([7baebff7f](https://github.com/powerhouse-inc/powerhouse/commit/7baebff7f))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.88 (2026-03-12)

### 🚀 Features

- reactor-hypercore example ([d5557973a](https://github.com/powerhouse-inc/powerhouse/commit/d5557973a))
- **reactor:** massive refactor to write model which attempts to unify txns with execution context ([622c009c3](https://github.com/powerhouse-inc/powerhouse/commit/622c009c3))

### 🩹 Fixes

- **reactor:** fixed a caching issue that could occur if commit failed ([d7fd3661b](https://github.com/powerhouse-inc/powerhouse/commit/d7fd3661b))
- **reactor:** fire event outside of txn ([7616a6f02](https://github.com/powerhouse-inc/powerhouse/commit/7616a6f02))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.87 (2026-03-12)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.86 (2026-03-12)

### 🚀 Features

- **renown,reactor-browser:** renown integration improvements ([a65731a73](https://github.com/powerhouse-inc/powerhouse/commit/a65731a73))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.85 (2026-03-12)

### 🚀 Features

- auto-discover and install packages for unknown document types ([4e8fa145c](https://github.com/powerhouse-inc/powerhouse/commit/4e8fa145c))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.84 (2026-03-11)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.83 (2026-03-11)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.82 (2026-03-11)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.81 (2026-03-11)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.80 (2026-03-11)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.79 (2026-03-11)

### 🚀 Features

- **ci:** add gitops action for registry image updates ([ba91d00dd](https://github.com/powerhouse-inc/powerhouse/commit/ba91d00dd))

### ❤️ Thank You

- Frank

## 6.0.0-dev.78 (2026-03-11)

### 🚀 Features

- **reactor:** migrating channel connection status to a state machine, added hooks for this, and an inspector tab ([c64755563](https://github.com/powerhouse-inc/powerhouse/commit/c64755563))

### 🩹 Fixes

- **reactor:** guard against deleting all cursors, fix redundant backfill issue, guard against cursor killing backfill, use paging ([8303bcf64](https://github.com/powerhouse-inc/powerhouse/commit/8303bcf64))
- **reactor:** discover existing drives on ProcessorManager restart ([07d22e79d](https://github.com/powerhouse-inc/powerhouse/commit/07d22e79d))

### ❤️ Thank You

- Benjamin Jordan
- Frank

## 6.0.0-dev.77 (2026-03-10)

### 🩹 Fixes

- **connect,reactor:** fixed peerDependencies ([d7f0e3623](https://github.com/powerhouse-inc/powerhouse/commit/d7f0e3623))
- **renown:** moved e2e script test to reactor-browser ([3c9b41045](https://github.com/powerhouse-inc/powerhouse/commit/3c9b41045))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.76 (2026-03-10)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.68 (2026-03-04)

### 🩹 Fixes

- **vetra:** remove custom subgraphs from vetra ([3a1e3b9b0](https://github.com/powerhouse-inc/powerhouse/commit/3a1e3b9b0))
- resolve empty name causing silent ADD_FILE failure in drives ([b44ed0c1c](https://github.com/powerhouse-inc/powerhouse/commit/b44ed0c1c))
- **reactor-mcp:** adopt new reactor client interface for MCP server ([1b8e6fb19](https://github.com/powerhouse-inc/powerhouse/commit/1b8e6fb19))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.67 (2026-03-03)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.66 (2026-03-03)

### 🚀 Features

- move reactor logic from connect to reactor browser ([#2385](https://github.com/powerhouse-inc/powerhouse/pull/2385))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.65 (2026-03-03)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.64 (2026-03-03)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.59 (2026-02-26)

### 🚀 Features

- use update-ts-references tool which also removes unused ones ([#2374](https://github.com/powerhouse-inc/powerhouse/pull/2374))

### 🩹 Fixes

- remove artificial paging limit -- reshuffle depth is NOT the same as query depth ([3d3706253](https://github.com/powerhouse-inc/powerhouse/commit/3d3706253))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.58 (2026-02-25)

### 🩹 Fixes

- load jobs should fetch document meta to see if the document has been deleted -- also we should not retry jobs where documents were deleted ([2cab0fcb3](https://github.com/powerhouse-inc/powerhouse/commit/2cab0fcb3))
- **executor:** update write cache after delete so double-deletion returns DocumentDeletedError ([06de40d98](https://github.com/powerhouse-inc/powerhouse/commit/06de40d98))
- **write-cache:** address PR review feedback ([a160fe311](https://github.com/powerhouse-inc/powerhouse/commit/a160fe311))

### 🔥 Performance

- **write-cache:** slice operations to last-per-scope to eliminate O(n²) copies ([ac55a6131](https://github.com/powerhouse-inc/powerhouse/commit/ac55a6131))
- **reducer:** pre-allocate operation arrays to avoid resize overhead ([1cf1c0078](https://github.com/powerhouse-inc/powerhouse/commit/1cf1c0078))

### ❤️ Thank You

- Benjamin Jordan
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.57 (2026-02-24)

### 🚀 Features

- run sync integration test as part of reactor flow ([7dea8bf3e](https://github.com/powerhouse-inc/powerhouse/commit/7dea8bf3e))
- dead letter persistent storage ([c7249bf13](https://github.com/powerhouse-inc/powerhouse/commit/c7249bf13))

### 🩹 Fixes

- build fix in document-view tests ([66d7a5483](https://github.com/powerhouse-inc/powerhouse/commit/66d7a5483))
- switchboard needs build:misc ([916f761b8](https://github.com/powerhouse-inc/powerhouse/commit/916f761b8))
- arg, workflow changes should trigger the workflow ([645cca08f](https://github.com/powerhouse-inc/powerhouse/commit/645cca08f))
- build step before integration test ([0b6b48f74](https://github.com/powerhouse-inc/powerhouse/commit/0b6b48f74))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.56 (2026-02-21)

### 🚀 Features

- jobs that fail from document not found errors get deferred and requeued ([5232928f0](https://github.com/powerhouse-inc/powerhouse/commit/5232928f0))
- document-model resolution fixes ([41c95c507](https://github.com/powerhouse-inc/powerhouse/commit/41c95c507))

### 🩹 Fixes

- whoops, properly export things for reactor-api ([2a769bda9](https://github.com/powerhouse-inc/powerhouse/commit/2a769bda9))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.55 (2026-02-20)

### 🚀 Features

- test-connect and reactor gql updates to pass along more context ([ae581e8e8](https://github.com/powerhouse-inc/powerhouse/commit/ae581e8e8))

### 🩹 Fixes

- fail job when loader fails ([f32b72a94](https://github.com/powerhouse-inc/powerhouse/commit/f32b72a94))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.54 (2026-02-19)

### 🚀 Features

- wip orchestrator for the test-client ([186d7c015](https://github.com/powerhouse-inc/powerhouse/commit/186d7c015))
- add the ability to change the poll interval in the inspector ([0d47c30f9](https://github.com/powerhouse-inc/powerhouse/commit/0d47c30f9))
- **connect:** build tweaks ([22b6bc7d5](https://github.com/powerhouse-inc/powerhouse/commit/22b6bc7d5))

### 🩹 Fixes

- ackordinal now works again, in addition we send dead letters back in poll ([ba3f39a17](https://github.com/powerhouse-inc/powerhouse/commit/ba3f39a17))
- when a dead letter is added to the gql-req-channel, stop polling for goodness sake ([b2ac429bb](https://github.com/powerhouse-inc/powerhouse/commit/b2ac429bb))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan

## 6.0.0-dev.53 (2026-02-18)

### 🩹 Fixes

- fixing reshuffle issue with correct tiebreakers ([7be1adf54](https://github.com/powerhouse-inc/powerhouse/commit/7be1adf54))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.52 (2026-02-17)

### 🩹 Fixes

- **reactor-api:** improved subgraph path matching and removed name parameter from reactor subgraph ([dcadf7fb3](https://github.com/powerhouse-inc/powerhouse/commit/dcadf7fb3))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.51 (2026-02-17)

### 🩹 Fixes

- **reactor-browser,reactor:** improved error instance checks ([c6b8625e7](https://github.com/powerhouse-inc/powerhouse/commit/c6b8625e7))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.50 (2026-02-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.49 (2026-02-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.47 (2026-02-17)

### 🩹 Fixes

- **monorepo:** make shared package publicly available ([#2348](https://github.com/powerhouse-inc/powerhouse/pull/2348))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.46 (2026-02-17)

### 🚀 Features

- adding exponential backoff and jitter for retries ([bbee985eb](https://github.com/powerhouse-inc/powerhouse/commit/bbee985eb))
- the poll scheduler now considers backpressure when scheduling polls, also fixed some mocking issues ([df40e2502](https://github.com/powerhouse-inc/powerhouse/commit/df40e2502))
- added sync status back ([6d8d8e420](https://github.com/powerhouse-inc/powerhouse/commit/6d8d8e420))
- **connect:** re enable processors in connect ([#2342](https://github.com/powerhouse-inc/powerhouse/pull/2342))

### 🩹 Fixes

- instead of moving failed outbox messages to deadletter, set for retry and only move unrecoverable errors ([5a6d4cae1](https://github.com/powerhouse-inc/powerhouse/commit/5a6d4cae1))

### 🔥 Performance

- strip operations and clipboard from keyframes on persist ([d1cb126c2](https://github.com/powerhouse-inc/powerhouse/commit/d1cb126c2))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.45 (2026-02-16)

### 🚀 Features

- **monorepo:** ensure shared is only in dev deps ([#2341](https://github.com/powerhouse-inc/powerhouse/pull/2341))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.44 (2026-02-15)

### 🚀 Features

- echo-prevention tests ([fb30d7e80](https://github.com/powerhouse-inc/powerhouse/commit/fb30d7e80))
- added some more tests to prove consistency ([5d9c4469a](https://github.com/powerhouse-inc/powerhouse/commit/5d9c4469a))

### 🩹 Fixes

- log out all dead letters, correctly parse empty dependencies ([672f444d6](https://github.com/powerhouse-inc/powerhouse/commit/672f444d6))
- ordinal was not being sent in payload, and fixed gql shape change in tests ([58375cb69](https://github.com/powerhouse-inc/powerhouse/commit/58375cb69))
- regenerating from schema to fix gql issues ([1ba2c4f09](https://github.com/powerhouse-inc/powerhouse/commit/1ba2c4f09))
- build fixes with import changes ([bd8bb613c](https://github.com/powerhouse-inc/powerhouse/commit/bd8bb613c))
- found a sql issue and fixed other failing reactor tests ([9c0b1f745](https://github.com/powerhouse-inc/powerhouse/commit/9c0b1f745))
- fixed an issue with connect-switchboard sync and added more proof tests ([0ff5791c1](https://github.com/powerhouse-inc/powerhouse/commit/0ff5791c1))
- fixed a couple edge cases in sync-manager ([873654f12](https://github.com/powerhouse-inc/powerhouse/commit/873654f12))
- fixing unit tests for channels and fixing persistence bug ([eea411d8b](https://github.com/powerhouse-inc/powerhouse/commit/eea411d8b))
- build fixes ([f0aab9190](https://github.com/powerhouse-inc/powerhouse/commit/f0aab9190))
- timestamp comparator was busted ([829784954](https://github.com/powerhouse-inc/powerhouse/commit/829784954))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.43 (2026-02-14)

### 🚀 Features

- **monorepo:** move more shared stuff to shared ([#2335](https://github.com/powerhouse-inc/powerhouse/pull/2335))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.42 (2026-02-13)

### 🚀 Features

- preserve existing signatures and support resulting state hash ([dd6b44675](https://github.com/powerhouse-inc/powerhouse/commit/dd6b44675))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.41 (2026-02-12)

### 🚀 Features

- **monorepo:** use catalog for other shared deps ([#2330](https://github.com/powerhouse-inc/powerhouse/pull/2330))
- **vetra:** add processor apps input to vetra ([#2329](https://github.com/powerhouse-inc/powerhouse/pull/2329))

### 🩹 Fixes

- **reactor:** use direct imports from document-drive ([88563000f](https://github.com/powerhouse-inc/powerhouse/commit/88563000f))
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

### 🩹 Fixes

- **reactor:** avoid browser breaking # import ([b444b86df](https://github.com/powerhouse-inc/powerhouse/commit/b444b86df))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.37 (2026-02-10)

### 🚀 Features

- **reactor-api:** added nested operations query on phdocument and Graphql client update ([67584e3fc](https://github.com/powerhouse-inc/powerhouse/commit/67584e3fc))

### 🩹 Fixes

- fixing all linter warnings ([0662a0b45](https://github.com/powerhouse-inc/powerhouse/commit/0662a0b45))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.36 (2026-02-06)

### 🚀 Features

- **codegen:** use bun for the slowest tests ([#2303](https://github.com/powerhouse-inc/powerhouse/pull/2303))
- batch ids passed as meta ([30904169a](https://github.com/powerhouse-inc/powerhouse/commit/30904169a))
- loadBatch interface ([03bdf8a2a](https://github.com/powerhouse-inc/powerhouse/commit/03bdf8a2a))

### 🩹 Fixes

- dependencies are passed through poll as well ([8b9534bbd](https://github.com/powerhouse-inc/powerhouse/commit/8b9534bbd))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.35 (2026-02-06)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

### 🚀 Features

- new queue inspector ([3c0c2f9cc](https://github.com/powerhouse-inc/powerhouse/commit/3c0c2f9cc))
- batching mailbox items ([3b7a5ff7e](https://github.com/powerhouse-inc/powerhouse/commit/3b7a5ff7e))
- replacing outbox with buffered outbox ([3a9397c67](https://github.com/powerhouse-inc/powerhouse/commit/3a9397c67))
- initial implementation of buffered mailbox ([fa91c8996](https://github.com/powerhouse-inc/powerhouse/commit/fa91c8996))
- adding inspector for channel polling ([f9ff2d411](https://github.com/powerhouse-inc/powerhouse/commit/f9ff2d411))

### 🩹 Fixes

- reintroduced echo issue, but fixed along with test-client updates ([66d8e873f](https://github.com/powerhouse-inc/powerhouse/commit/66d8e873f))
- sync-manager fix that backfills before ADD_RELATIONSHIP ([7662e8109](https://github.com/powerhouse-inc/powerhouse/commit/7662e8109))
- batches need to keep doc id + scope in mind, dummy ([83de46307](https://github.com/powerhouse-inc/powerhouse/commit/83de46307))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.32 (2026-02-04)

### 🩹 Fixes

- remove duplicate trigger-downstream from publish-docker-images ([1f70c8041](https://github.com/powerhouse-inc/powerhouse/commit/1f70c8041))

### ❤️ Thank You

- Frank

## 6.0.0-dev.31 (2026-02-04)

### 🚀 Features

- collection membership cache ([6a733e22d](https://github.com/powerhouse-inc/powerhouse/commit/6a733e22d))
- trigger powerhouse-demo after release ([f5b63728d](https://github.com/powerhouse-inc/powerhouse/commit/f5b63728d))
- **profiling:** add Pyroscope monitoring to reactor-direct ([2c7779229](https://github.com/powerhouse-inc/powerhouse/commit/2c7779229))
- **profiling:** add reactor-direct.ts for direct reactor performance profiling ([806714e27](https://github.com/powerhouse-inc/powerhouse/commit/806714e27))

### 🩹 Fixes

- collection filtering ([f7627857b](https://github.com/powerhouse-inc/powerhouse/commit/f7627857b))
- linting issues ([e1eb2c806](https://github.com/powerhouse-inc/powerhouse/commit/e1eb2c806))
- more test fixes, and removing bad tests ([7f256071d](https://github.com/powerhouse-inc/powerhouse/commit/7f256071d))
- refactoring job execution config ([76f9a7ce0](https://github.com/powerhouse-inc/powerhouse/commit/76f9a7ce0))
- resolve TypeScript errors in reactor-direct profiling script ([5262c3ff5](https://github.com/powerhouse-inc/powerhouse/commit/5262c3ff5))
- unit test fixes ([014fc07ed](https://github.com/powerhouse-inc/powerhouse/commit/014fc07ed))
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
- adding signal handlers and removing old feature flags ([f08253a2d](https://github.com/powerhouse-inc/powerhouse/commit/f08253a2d))
- added a withSignalHandlers function to the reactor-builder ([666cec6c7](https://github.com/powerhouse-inc/powerhouse/commit/666cec6c7))
- **reactor:** added totalCount in findDocuments pagination ([7f1118022](https://github.com/powerhouse-inc/powerhouse/commit/7f1118022))

### 🩹 Fixes

- test fixes due to changed endpoint ([bab3fcaf9](https://github.com/powerhouse-inc/powerhouse/commit/bab3fcaf9))
- process limitations in browser ([e674f48a6](https://github.com/powerhouse-inc/powerhouse/commit/e674f48a6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.27 (2026-01-30)

### 🚀 Features

- initial implementation of getMany on document-view ([11fc5f5b4](https://github.com/powerhouse-inc/powerhouse/commit/11fc5f5b4))
- renown sdk improvements ([bc1099d94](https://github.com/powerhouse-inc/powerhouse/commit/bc1099d94))
- **ph-cmd:** fix forwarding and versioning bug ([#2272](https://github.com/powerhouse-inc/powerhouse/pull/2272))

### 🩹 Fixes

- missing unit tests for paging in the document indexer ([6e7d14273](https://github.com/powerhouse-inc/powerhouse/commit/6e7d14273))
- exporting more, removing outdated test ([5acdae784](https://github.com/powerhouse-inc/powerhouse/commit/5acdae784))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.26 (2026-01-29)

### 🚀 Features

- update minimum node version to 24 ([7a71107c5](https://github.com/powerhouse-inc/powerhouse/commit/7a71107c5))

### 🩹 Fixes

- undo my changes to the tsc script ([0a36d0a49](https://github.com/powerhouse-inc/powerhouse/commit/0a36d0a49))
- broken test expectation ([03a5014d9](https://github.com/powerhouse-inc/powerhouse/commit/03a5014d9))
- nailed down the two-reactor sync tests with fake timers ([d6d5335da](https://github.com/powerhouse-inc/powerhouse/commit/d6d5335da))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 6.0.0-dev.25 (2026-01-28)

### 🩹 Fixes

- ci pipeline does not like my build command ([03c70d15e](https://github.com/powerhouse-inc/powerhouse/commit/03c70d15e))
- resolve reshuffle race issues when timestamps match ([bb66eeb90](https://github.com/powerhouse-inc/powerhouse/commit/bb66eeb90))
- fixing some bad tests ([cf8b8649a](https://github.com/powerhouse-inc/powerhouse/commit/cf8b8649a))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 6.0.0-dev.24 (2026-01-27)

### 🚀 Features

- **monorepo:** ensure the same typescript version is used everywhere ([#2258](https://github.com/powerhouse-inc/powerhouse/pull/2258))

### 🩹 Fixes

- added many missing tests ([0afe3277f](https://github.com/powerhouse-inc/powerhouse/commit/0afe3277f))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.23 (2026-01-27)

### 🚀 Features

- **monorepo:** add diff filter to exclude deleted files in changed files action ([e86961e79](https://github.com/powerhouse-inc/powerhouse/commit/e86961e79))
- **academy:** added release slides to academy project ([eab5e56fe](https://github.com/powerhouse-inc/powerhouse/commit/eab5e56fe))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.22 (2026-01-27)

### 🩹 Fixes

- **monorepo:** inefficient workflows ([#2250](https://github.com/powerhouse-inc/powerhouse/pull/2250))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.21 (2026-01-27)

### 🚀 Features

- pulling operation filters into the store ([7c88714b4](https://github.com/powerhouse-inc/powerhouse/commit/7c88714b4))
- step one of operation filtering ([62580c897](https://github.com/powerhouse-inc/powerhouse/commit/62580c897))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 6.0.0-dev.20 (2026-01-26)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.19 (2026-01-26)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.16 (2026-01-24)

### 🩹 Fixes

- reactor backfill now respects timestamp ([6edcdeaeb](https://github.com/powerhouse-inc/powerhouse/commit/6edcdeaeb))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 6.0.0-dev.15 (2026-01-23)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

### 🩹 Fixes

- processor filter logic fixes and tests ([3b5b210b7](https://github.com/powerhouse-inc/powerhouse/commit/3b5b210b7))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 6.0.0-dev.12 (2026-01-20)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.11 (2026-01-20)

### 🩹 Fixes

- **monorepo:** exclude root package from recursive build to prevent infinite loop ([099139393](https://github.com/powerhouse-inc/powerhouse/commit/099139393))
- update addDrive function to set drive name ([#2223](https://github.com/powerhouse-inc/powerhouse/pull/2223))
- **codegen:** fix failing codegen tests ([#2227](https://github.com/powerhouse-inc/powerhouse/pull/2227))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente
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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.4 (2026-01-16)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.3 (2026-01-16)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.2 (2026-01-15)

### 🚀 Features

- adding a migration command to switchboard ([155f3da66](https://github.com/powerhouse-inc/powerhouse/commit/155f3da66))
- test-client now successfully executes scenarios ([ef9299d90](https://github.com/powerhouse-inc/powerhouse/commit/ef9299d90))
- new cicd flows ([01310e0d3](https://github.com/powerhouse-inc/powerhouse/commit/01310e0d3))
- enabled doc version in connect ([#2171](https://github.com/powerhouse-inc/powerhouse/pull/2171))

### 🩹 Fixes

- workflow permissions ([6e451590d](https://github.com/powerhouse-inc/powerhouse/commit/6e451590d))
- validateActions was querying, also fixing some logging ([3b4420656](https://github.com/powerhouse-inc/powerhouse/commit/3b4420656))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 6.0.0-dev.1 (2026-01-15)

### 🚀 Features

- **academy:** added k8s deployment ([5f7e27162](https://github.com/powerhouse-inc/powerhouse/commit/5f7e27162))
- adding protocol versions to document headers, populated by the reactor ([d7ceb80aa](https://github.com/powerhouse-inc/powerhouse/commit/d7ceb80aa))
- first pass implementation of v2 undo/redo reducer ([d6c3b8084](https://github.com/powerhouse-inc/powerhouse/commit/d6c3b8084))
- **monorepo:** upgrade document engineering package ([#2215](https://github.com/powerhouse-inc/powerhouse/pull/2215))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Ryan Wolhuter @ryanwolhuter

## 5.2.0-dev.1 (2026-01-15)

### 🚀 Features

- **monorepo:** upgrade zod and use compatibility layer for errors ([#2210](https://github.com/powerhouse-inc/powerhouse/pull/2210))
- **monorepo:** use local package execution for tailwind instead of downloading it every time ([ed149558c](https://github.com/powerhouse-inc/powerhouse/commit/ed149558c))

### 🩹 Fixes

- fix race condition in reactor tests ([6400c1867](https://github.com/powerhouse-inc/powerhouse/commit/6400c1867))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.42 (2026-01-14)

### 🩹 Fixes

- do not overwrite undo/redo skips ([35de3648d](https://github.com/powerhouse-inc/powerhouse/commit/35de3648d))
- error was written incorrectly for revision mismatch ([4995abbb9](https://github.com/powerhouse-inc/powerhouse/commit/4995abbb9))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.41 (2026-01-13)

### 🩹 Fixes

- testing issue with ids ([8cad05973](https://github.com/powerhouse-inc/powerhouse/commit/8cad05973))
- move ALL operation ids to derived ids ([4ac51f535](https://github.com/powerhouse-inc/powerhouse/commit/4ac51f535))
- less strict document models array type on reactor builder ([1548ddec7](https://github.com/powerhouse-inc/powerhouse/commit/1548ddec7))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.40 (2026-01-10)

### 🚀 Features

- moved over the processor-manager for reactor ([c232c55c1](https://github.com/powerhouse-inc/powerhouse/commit/c232c55c1))
- **builder-tools:** improved validation on doc model editor and unit tests ([336f5d575](https://github.com/powerhouse-inc/powerhouse/commit/336f5d575))
- **codegen:** add validation to package json test ([03d06ef57](https://github.com/powerhouse-inc/powerhouse/commit/03d06ef57))

### 🩹 Fixes

- inspector was not schema aware ([ed06ebc74](https://github.com/powerhouse-inc/powerhouse/commit/ed06ebc74))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 5.1.0-dev.39 (2026-01-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.38 (2026-01-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.37 (2026-01-09)

### 🚀 Features

- **codegen,ph-cmd:** use templates for project boilerplate creation ([#2190](https://github.com/powerhouse-inc/powerhouse/pull/2190))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.36 (2026-01-09)

### 🩹 Fixes

- add relationship should work even if the child doesn't exist or is deleted, also added logging to logger not console ([8776991d4](https://github.com/powerhouse-inc/powerhouse/commit/8776991d4))
- gql should create a channel if there isn't one, also fix issue with ADD_RELATIONSHIP needing the target ([3bda61732](https://github.com/powerhouse-inc/powerhouse/commit/3bda61732))
- return gql-channel polling to something sane ([e0baf8006](https://github.com/powerhouse-inc/powerhouse/commit/e0baf8006))
- all timestamps throughout the reactor should be stored as iso strings ([d52810df2](https://github.com/powerhouse-inc/powerhouse/commit/d52810df2))
- fix some tests ([715696fa2](https://github.com/powerhouse-inc/powerhouse/commit/715696fa2))
- skips were being calculated incorrectly ([d5ea31e58](https://github.com/powerhouse-inc/powerhouse/commit/d5ea31e58))
- linting ([c135690f1](https://github.com/powerhouse-inc/powerhouse/commit/c135690f1))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.35 (2026-01-08)

### 🚀 Features

- side-by-side reshuffle test ([cd4f879f9](https://github.com/powerhouse-inc/powerhouse/commit/cd4f879f9))

### 🩹 Fixes

- linting and build fixes, plus a three-reactor setup test ([87cdde785](https://github.com/powerhouse-inc/powerhouse/commit/87cdde785))
- reactor was mutating operation indices ([47440d882](https://github.com/powerhouse-inc/powerhouse/commit/47440d882))
- operation id should be deterministic, not a uuid ([41f50b7f8](https://github.com/powerhouse-inc/powerhouse/commit/41f50b7f8))
- removing a bunch of logging and making a half fix where we only overwrite _some_ timestamps ([31ce11c55](https://github.com/powerhouse-inc/powerhouse/commit/31ce11c55))
- timestamps and indices were being overwritten -- also lots of logging that is in progress ([b4153193a](https://github.com/powerhouse-inc/powerhouse/commit/b4153193a))
- ordinal issue ([bcc284ce1](https://github.com/powerhouse-inc/powerhouse/commit/bcc284ce1))
- revert to 100 skips ([8409a98a8](https://github.com/powerhouse-inc/powerhouse/commit/8409a98a8))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.34 (2026-01-07)

### 🚀 Features

- **ph-cli:** add index.html migration to migrate command ([#2186](https://github.com/powerhouse-inc/powerhouse/pull/2186))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.33 (2026-01-06)

### 🚀 Features

- implemented a temp doc cache in reactor-browser for the new reactor ([afda2c2c0](https://github.com/powerhouse-inc/powerhouse/commit/afda2c2c0))
- passing logger through to sync-manager ([91af0bbfe](https://github.com/powerhouse-inc/powerhouse/commit/91af0bbfe))
- adding an explicit createdocumentindrive function ([7ed396977](https://github.com/powerhouse-inc/powerhouse/commit/7ed396977))

### 🩹 Fixes

- fixing an off by one issue and fixing cache invalidation ([fe7ab6ebd](https://github.com/powerhouse-inc/powerhouse/commit/fe7ab6ebd))
- added configuration to debug switchboard, and cleaned up some of the subgraph code ([9ce04c899](https://github.com/powerhouse-inc/powerhouse/commit/9ce04c899))
- operation batching must also consider scopes ([591937fa2](https://github.com/powerhouse-inc/powerhouse/commit/591937fa2))
- correctly batch sync ops in sync envelopes ([f7485b5ab](https://github.com/powerhouse-inc/powerhouse/commit/f7485b5ab))
- collections should not limit by joined ordinal ([5504007a1](https://github.com/powerhouse-inc/powerhouse/commit/5504007a1))
- reshuffling in load operations was not pulling all operations ([cc77bc8ee](https://github.com/powerhouse-inc/powerhouse/commit/cc77bc8ee))
- integration test was waiting wrong ([d993f2759](https://github.com/powerhouse-inc/powerhouse/commit/d993f2759))

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.29 (2025-12-30)

### 🩹 Fixes

- **connect,builder-tools,vetra:** avoid page reload on vite HMR ([1c3f5d1dd](https://github.com/powerhouse-inc/powerhouse/commit/1c3f5d1dd))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.28 (2025-12-30)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.27 (2025-12-24)

### 🚀 Features

- **reactor-api:** datadog integration ([3c433c686](https://github.com/powerhouse-inc/powerhouse/commit/3c433c686))
- **reactor-browser:** improved document retrieval hooks ([4fed49391](https://github.com/powerhouse-inc/powerhouse/commit/4fed49391))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 5.1.0-dev.26 (2025-12-20)

### 🚀 Features

- integrate doc model versioning in reactor ([#2145](https://github.com/powerhouse-inc/powerhouse/pull/2145))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 5.1.0-dev.25 (2025-12-19)

### 🚀 Features

- added subscriptions as a read model ([39490cc20](https://github.com/powerhouse-inc/powerhouse/commit/39490cc20))

### 🩹 Fixes

- passing meta through job system to avoid race conditions ([8b65bb42d](https://github.com/powerhouse-inc/powerhouse/commit/8b65bb42d))
- **reactor:** we were echoing back sync envelopes ([0fc679d21](https://github.com/powerhouse-inc/powerhouse/commit/0fc679d21))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.24 (2025-12-18)

### 🚀 Features

- the gql channel should start poll before waiting ([f569b462b](https://github.com/powerhouse-inc/powerhouse/commit/f569b462b))

### 🩹 Fixes

- switchboard's new reactor signs everything ([b7fafb7fa](https://github.com/powerhouse-inc/powerhouse/commit/b7fafb7fa))
- **reactor:** document model core types need to be numerical versions, also fixed a gql bug ([6495a88e2](https://github.com/powerhouse-inc/powerhouse/commit/6495a88e2))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.23 (2025-12-17)

### 🩹 Fixes

- **reactor:** integrated the document meta cache ([29565fa5f](https://github.com/powerhouse-inc/powerhouse/commit/29565fa5f))
- default state should be 0 ([a19a2ebec](https://github.com/powerhouse-inc/powerhouse/commit/a19a2ebec))

### 🔥 Performance

- **queue:** make Reactor queue perf benches reproducible, timed, and invariant-safe ([20c5c4376](https://github.com/powerhouse-inc/powerhouse/commit/20c5c4376))
- **queue:** removed any random calls to make benches deterministic ([886874cde](https://github.com/powerhouse-inc/powerhouse/commit/886874cde))
- **queue:** added in-memory queue performance benchmarks ([e7184d495](https://github.com/powerhouse-inc/powerhouse/commit/e7184d495))
- **queue:** added progressively taxing queue hint DAG resolution benchmarks ([3dd42d08b](https://github.com/powerhouse-inc/powerhouse/commit/3dd42d08b))
- **queue:** added focused queue performance benches ([caa975f99](https://github.com/powerhouse-inc/powerhouse/commit/caa975f99))
- **queue:** added some helper funcs for additional benches ([4810e1e91](https://github.com/powerhouse-inc/powerhouse/commit/4810e1e91))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Samuel Hawksby-Robinson @Samyoul

## 5.1.0-dev.22 (2025-12-16)

### 🚀 Features

- added support for runtime document model subgraphs ([dc8248ec6](https://github.com/powerhouse-inc/powerhouse/commit/dc8248ec6))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.21 (2025-12-13)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.20 (2025-12-12)

### 🚀 Features

- **reactor-browsers:** added onErrors callback to dispatch method ([4824a0a10](https://github.com/powerhouse-inc/powerhouse/commit/4824a0a10))

### ❤️ Thank You

- acaldas @acaldas

## 5.1.0-dev.19 (2025-12-12)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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
- **codegen:** update zod schema generation library ([#2129](https://github.com/powerhouse-inc/powerhouse/pull/2129))
- integrate visibility tools for remotes and pglite instance ([#2122](https://github.com/powerhouse-inc/powerhouse/pull/2122))
- adding new storage to delete ([d478af153](https://github.com/powerhouse-inc/powerhouse/commit/d478af153))

### 🩹 Fixes

- backfill tests + create default via new reactor to get create/update ([889d890a3](https://github.com/powerhouse-inc/powerhouse/commit/889d890a3))
- use a unique id for remote name ([37a700848](https://github.com/powerhouse-inc/powerhouse/commit/37a700848))
- syncenvelope shape was incorrect ([cc6226be9](https://github.com/powerhouse-inc/powerhouse/commit/cc6226be9))
- gql fixes, like making channels :) ([ee71e2229](https://github.com/powerhouse-inc/powerhouse/commit/ee71e2229))
- some signature fixes and progress on integrating the reactor client on writes ([a3129a1b9](https://github.com/powerhouse-inc/powerhouse/commit/a3129a1b9))
- properly check job info in reactor-client ([0bad3762d](https://github.com/powerhouse-inc/powerhouse/commit/0bad3762d))
- consistency was not guaranteed when using legacy storage -- introduced a wrapper with consistency token ([8e46dcec8](https://github.com/powerhouse-inc/powerhouse/commit/8e46dcec8))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.15 (2025-12-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.14 (2025-12-08)

### 🚀 Features

- **connect, switchboard:** added healthcheck route ([9a0671113](https://github.com/powerhouse-inc/powerhouse/commit/9a0671113))
- **academy:** added docker build and publish workflow ([b17562994](https://github.com/powerhouse-inc/powerhouse/commit/b17562994))

### ❤️ Thank You

- Frank

## 5.1.0-dev.13 (2025-12-08)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.12 (2025-12-08)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.11 (2025-12-08)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.7 (2025-12-04)

### 🚀 Features

- stubbing in a logging interface ([06799507d](https://github.com/powerhouse-inc/powerhouse/commit/06799507d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.6 (2025-12-04)

### 🩹 Fixes

- **renown:** build issues ([1893c35a0](https://github.com/powerhouse-inc/powerhouse/commit/1893c35a0))
- **reactor:** pulling some files out of the code coverage analysis ([5dcb7431d](https://github.com/powerhouse-inc/powerhouse/commit/5dcb7431d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 5.1.0-dev.5 (2025-12-04)

### 🚀 Features

- connect crypto signer and verifier ([918fb1fab](https://github.com/powerhouse-inc/powerhouse/commit/918fb1fab))

### 🩹 Fixes

- build issues ([4825c1c01](https://github.com/powerhouse-inc/powerhouse/commit/4825c1c01))
- adding testing for document creation signatures ([ae6e33c12](https://github.com/powerhouse-inc/powerhouse/commit/ae6e33c12))
- vitest was destroying my computer ([a43c93c4b](https://github.com/powerhouse-inc/powerhouse/commit/a43c93c4b))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.4 (2025-12-03)

### 🚀 Features

- **codegen,ph-cli:** add tsx code generator ([#2116](https://github.com/powerhouse-inc/powerhouse/pull/2116))
- pulling in all the signing work ([6f1361ead](https://github.com/powerhouse-inc/powerhouse/commit/6f1361ead))

### 🩹 Fixes

- all actions can now be signed ([12717055b](https://github.com/powerhouse-inc/powerhouse/commit/12717055b))
- updating client and reactor interfaces to use branch instead of view filter on writes ([9e1abf004](https://github.com/powerhouse-inc/powerhouse/commit/9e1abf004))
- reactor-client signs mutations ([26e20b54e](https://github.com/powerhouse-inc/powerhouse/commit/26e20b54e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Ryan Wolhuter @ryanwolhuter

## 5.1.0-dev.3 (2025-12-02)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.2 (2025-12-02)

### 🚀 Features

- added integration tests for gql sync ([554280dbc](https://github.com/powerhouse-inc/powerhouse/commit/554280dbc))
- large refactor such that ids are only on remotes and not channels ([29a807e08](https://github.com/powerhouse-inc/powerhouse/commit/29a807e08))
- building out fuller spec on gql sync ([084f9bbda](https://github.com/powerhouse-inc/powerhouse/commit/084f9bbda))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 5.1.0-dev.1 (2025-11-26)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 5.1.0-dev.0 (2025-11-20)

### 🚀 Features

- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- reactor-client handles deletion propagation ([58b5e6646](https://github.com/powerhouse-inc/powerhouse/commit/58b5e6646))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))
- reactor-client handles deletion propagation ([a28706734](https://github.com/powerhouse-inc/powerhouse/commit/a28706734))
- added new get by id or slug so that reactor-client -> reactor can use it ([189294fac](https://github.com/powerhouse-inc/powerhouse/commit/189294fac))
- initial implementation of reactor-client missing methods ([b9a0d5c18](https://github.com/powerhouse-inc/powerhouse/commit/b9a0d5c18))
- updating the reactor find() method to use the new document indexer ([e2f5de1b7](https://github.com/powerhouse-inc/powerhouse/commit/e2f5de1b7))
- reshuffle tests ([e4bac1d84](https://github.com/powerhouse-inc/powerhouse/commit/e4bac1d84))
- excessive reshuffles ([17d551321](https://github.com/powerhouse-inc/powerhouse/commit/17d551321))
- initial tla spec ([ced4140e0](https://github.com/powerhouse-inc/powerhouse/commit/ced4140e0))
- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))
- add conflict resolution test for concurrent modifications ([d938cbfd5](https://github.com/powerhouse-inc/powerhouse/commit/d938cbfd5))
- added big test where lots of docs are synced ([9b856ce93](https://github.com/powerhouse-inc/powerhouse/commit/9b856ce93))
- opearations_ready flow for waiting for sync ([f8d96b1e1](https://github.com/powerhouse-inc/powerhouse/commit/f8d96b1e1))
- major rename to avoid issues -- syncoperation rather than job handle ([28a1a5c54](https://github.com/powerhouse-inc/powerhouse/commit/28a1a5c54))
- initial dual reactor sync test ([51414e67d](https://github.com/powerhouse-inc/powerhouse/commit/51414e67d))
- sync-builder ([a422dd23d](https://github.com/powerhouse-inc/powerhouse/commit/a422dd23d))
- initial sync-manager implementation ([00c693e4b](https://github.com/powerhouse-inc/powerhouse/commit/00c693e4b))
- internalchannel implementation and types ([644ef1695](https://github.com/powerhouse-inc/powerhouse/commit/644ef1695))
- getting types in place for implementation ([bbc146227](https://github.com/powerhouse-inc/powerhouse/commit/bbc146227))
- initial implementations of cursor and remotes storage for sync ([1e7fadcf4](https://github.com/powerhouse-inc/powerhouse/commit/1e7fadcf4))
- plan and implementation for kysely sync storage ([7ccc7ae67](https://github.com/powerhouse-inc/powerhouse/commit/7ccc7ae67))
- first pass implementation of job-handle and mailbox ([b86e87803](https://github.com/powerhouse-inc/powerhouse/commit/b86e87803))
- **ph-cli:** ph migrate command ([#2099](https://github.com/powerhouse-inc/powerhouse/pull/2099))
- implementation of the new join on ordinal in the index ([ad621af7a](https://github.com/powerhouse-inc/powerhouse/commit/ad621af7a))
- adding operation index to executor integration tests ([63b51b84f](https://github.com/powerhouse-inc/powerhouse/commit/63b51b84f))
- first pass operation-index integration ([4e5b1e191](https://github.com/powerhouse-inc/powerhouse/commit/4e5b1e191))
- splitting job integration tests into legacy and current ([413ead70c](https://github.com/powerhouse-inc/powerhouse/commit/413ead70c))
- initial implementation of operation index ([906588091](https://github.com/powerhouse-inc/powerhouse/commit/906588091))
- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))
- wip load-reshuffle test ([fa05f1666](https://github.com/powerhouse-inc/powerhouse/commit/fa05f1666))
- first pass load impl on write side ([85ef79df9](https://github.com/powerhouse-inc/powerhouse/commit/85ef79df9))
- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- migration scripts for all storage ([804f5838c](https://github.com/powerhouse-inc/powerhouse/commit/804f5838c))
- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))
- **connect:** remove circular imports ([a1632d41e](https://github.com/powerhouse-inc/powerhouse/commit/a1632d41e))
- switching to tinybench for benchmarks ([5b915e025](https://github.com/powerhouse-inc/powerhouse/commit/5b915e025))
- integration tests for consistency token ([030744ec2](https://github.com/powerhouse-inc/powerhouse/commit/030744ec2))
- **codegen, vetra:** update codegen templates ([#2056](https://github.com/powerhouse-inc/powerhouse/pull/2056))
- starting to migrate reactor to use the legacy storage feature flag ([c24a9829e](https://github.com/powerhouse-inc/powerhouse/commit/c24a9829e))
- adding consistency tracking to the document indexer ([a2a0b4e9c](https://github.com/powerhouse-inc/powerhouse/commit/a2a0b4e9c))
- adding consistency tracking to the document indexer ([3e4b694e6](https://github.com/powerhouse-inc/powerhouse/commit/3e4b694e6))
- updated read model specs with consistency token ([3a7d6f91a](https://github.com/powerhouse-inc/powerhouse/commit/3a7d6f91a))
- added consistency token to the job interface ([f5077680c](https://github.com/powerhouse-inc/powerhouse/commit/f5077680c))
- consistency tracker implementation ([73449ab68](https://github.com/powerhouse-inc/powerhouse/commit/73449ab68))
- working out how consistency guarantees are provided through consistency tokens ([18737020e](https://github.com/powerhouse-inc/powerhouse/commit/18737020e))
- create default vetra package document when ph vetra is started for a remote drive ([#2066](https://github.com/powerhouse-inc/powerhouse/pull/2066))
- feature flag to toggle write to legacy storage ([151e40d76](https://github.com/powerhouse-inc/powerhouse/commit/151e40d76))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))
- first pass batch job implementation ([227305ec8](https://github.com/powerhouse-inc/powerhouse/commit/227305ec8))
- first pass implementation with unit tests ([5bc7416ef](https://github.com/powerhouse-inc/powerhouse/commit/5bc7416ef))
- reactor and job executor have a separate path for relationships ([b1cabb7f5](https://github.com/powerhouse-inc/powerhouse/commit/b1cabb7f5))
- initial types for relationship indexer ([151502633](https://github.com/powerhouse-inc/powerhouse/commit/151502633))
- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### 🩹 Fixes

- build and lint fixes ([ddbb423c6](https://github.com/powerhouse-inc/powerhouse/commit/ddbb423c6))
- reactor document-model filtering was busted ([98bb94668](https://github.com/powerhouse-inc/powerhouse/commit/98bb94668))
- slug mappings were not being inserted properly ([1ddc6f349](https://github.com/powerhouse-inc/powerhouse/commit/1ddc6f349))
- build and lint fixes ([efeece878](https://github.com/powerhouse-inc/powerhouse/commit/efeece878))
- reactor document-model filtering was busted ([4700ad9f3](https://github.com/powerhouse-inc/powerhouse/commit/4700ad9f3))
- slug mappings were not being inserted properly ([d1864769a](https://github.com/powerhouse-inc/powerhouse/commit/d1864769a))
- pull readmodel coordinator init back into reactor ([bf3a4261b](https://github.com/powerhouse-inc/powerhouse/commit/bf3a4261b))
- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))
- unskipping skipped tests and fixing ([f28bd79f2](https://github.com/powerhouse-inc/powerhouse/commit/f28bd79f2))
- use real operation store ([97fac3d7f](https://github.com/powerhouse-inc/powerhouse/commit/97fac3d7f))
- **ph-cli:** added missing runtime dependencies ([da1b66e73](https://github.com/powerhouse-inc/powerhouse/commit/da1b66e73))
- **builder-tools:** use alias for self-reference import on ts instead of loading from dist ([b23b772c0](https://github.com/powerhouse-inc/powerhouse/commit/b23b772c0))
- **reactor-api,switchboard:** load local package by default and resolve self reference import on ts files ([2b2d29ba6](https://github.com/powerhouse-inc/powerhouse/commit/2b2d29ba6))
- linter fixes ([d0b6e63d7](https://github.com/powerhouse-inc/powerhouse/commit/d0b6e63d7))
- fixing lint issues ([3afde3ebd](https://github.com/powerhouse-inc/powerhouse/commit/3afde3ebd))
- fix issue with resuffling ([7bcb931b7](https://github.com/powerhouse-inc/powerhouse/commit/7bcb931b7))
- reshuffles work a bit differently ([0cf39c12d](https://github.com/powerhouse-inc/powerhouse/commit/0cf39c12d))
- require job executor config, and fix mock data in unit tests ([7c7362325](https://github.com/powerhouse-inc/powerhouse/commit/7c7362325))
- linting warnings ([5f79fcf98](https://github.com/powerhouse-inc/powerhouse/commit/5f79fcf98))
- removing race condition from test ([251531bf4](https://github.com/powerhouse-inc/powerhouse/commit/251531bf4))
- linting fixes ([2ab0f01ed](https://github.com/powerhouse-inc/powerhouse/commit/2ab0f01ed))
- **codegen:** move read-pkg to runtime dependency ([939f01045](https://github.com/powerhouse-inc/powerhouse/commit/939f01045))
- **codegen:** run prettier programmatically ([23f948c4d](https://github.com/powerhouse-inc/powerhouse/commit/23f948c4d))
- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- broke the build, fixing with reactorbuilder ([2c4ade4e6](https://github.com/powerhouse-inc/powerhouse/commit/2c4ade4e6))
- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))
- update atlas packages ([fa174d00e](https://github.com/powerhouse-inc/powerhouse/commit/fa174d00e))
- commenting out test that exports broke ([75cfba9b5](https://github.com/powerhouse-inc/powerhouse/commit/75cfba9b5))
- linter issues ([bc1d2a569](https://github.com/powerhouse-inc/powerhouse/commit/bc1d2a569))
- add/remove children need special revision handling ([52b8bbd72](https://github.com/powerhouse-inc/powerhouse/commit/52b8bbd72))
- type fixes in the document indexer ([98cd03b92](https://github.com/powerhouse-inc/powerhouse/commit/98cd03b92))
- fixing unit test build and adding a couple comments ([d24d46b2d](https://github.com/powerhouse-inc/powerhouse/commit/d24d46b2d))
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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.127 (2025-11-19)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.126 (2025-11-19)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.125 (2025-11-19)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.124 (2025-11-18)

### 🚀 Features

- first pass web-sockets in subgraphs ([41b0aff7a](https://github.com/powerhouse-inc/powerhouse/commit/41b0aff7a))
- reactor gql subscriptions ([522d502ba](https://github.com/powerhouse-inc/powerhouse/commit/522d502ba))
- reactor-client handles deletion propagation ([58b5e6646](https://github.com/powerhouse-inc/powerhouse/commit/58b5e6646))
- first pass web-sockets in subgraphs ([cf39dd0dc](https://github.com/powerhouse-inc/powerhouse/commit/cf39dd0dc))
- reactor gql subscriptions ([cb23eb953](https://github.com/powerhouse-inc/powerhouse/commit/cb23eb953))
- reactor-client handles deletion propagation ([a28706734](https://github.com/powerhouse-inc/powerhouse/commit/a28706734))

### 🩹 Fixes

- build and lint fixes ([ddbb423c6](https://github.com/powerhouse-inc/powerhouse/commit/ddbb423c6))
- reactor document-model filtering was busted ([98bb94668](https://github.com/powerhouse-inc/powerhouse/commit/98bb94668))
- slug mappings were not being inserted properly ([1ddc6f349](https://github.com/powerhouse-inc/powerhouse/commit/1ddc6f349))
- build and lint fixes ([efeece878](https://github.com/powerhouse-inc/powerhouse/commit/efeece878))
- reactor document-model filtering was busted ([4700ad9f3](https://github.com/powerhouse-inc/powerhouse/commit/4700ad9f3))
- slug mappings were not being inserted properly ([d1864769a](https://github.com/powerhouse-inc/powerhouse/commit/d1864769a))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.123 (2025-11-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.122 (2025-11-18)

### 🚀 Features

- added new get by id or slug so that reactor-client -> reactor can use it ([189294fac](https://github.com/powerhouse-inc/powerhouse/commit/189294fac))
- initial implementation of reactor-client missing methods ([b9a0d5c18](https://github.com/powerhouse-inc/powerhouse/commit/b9a0d5c18))

### 🩹 Fixes

- pull readmodel coordinator init back into reactor ([bf3a4261b](https://github.com/powerhouse-inc/powerhouse/commit/bf3a4261b))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.121 (2025-11-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.120 (2025-11-17)

### 🩹 Fixes

- ensure version.ts is generated before TypeScript compilation in CI ([dd49fdd4f](https://github.com/powerhouse-inc/powerhouse/commit/dd49fdd4f))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.119 (2025-11-15)

### 🚀 Features

- updating the reactor find() method to use the new document indexer ([e2f5de1b7](https://github.com/powerhouse-inc/powerhouse/commit/e2f5de1b7))
- reshuffle tests ([e4bac1d84](https://github.com/powerhouse-inc/powerhouse/commit/e4bac1d84))
- excessive reshuffles ([17d551321](https://github.com/powerhouse-inc/powerhouse/commit/17d551321))
- initial tla spec ([ced4140e0](https://github.com/powerhouse-inc/powerhouse/commit/ced4140e0))
- spammy benchmarks ([bea3671a1](https://github.com/powerhouse-inc/powerhouse/commit/bea3671a1))
- add conflict resolution test for concurrent modifications ([d938cbfd5](https://github.com/powerhouse-inc/powerhouse/commit/d938cbfd5))
- added big test where lots of docs are synced ([9b856ce93](https://github.com/powerhouse-inc/powerhouse/commit/9b856ce93))
- opearations_ready flow for waiting for sync ([f8d96b1e1](https://github.com/powerhouse-inc/powerhouse/commit/f8d96b1e1))
- major rename to avoid issues -- syncoperation rather than job handle ([28a1a5c54](https://github.com/powerhouse-inc/powerhouse/commit/28a1a5c54))
- initial dual reactor sync test ([51414e67d](https://github.com/powerhouse-inc/powerhouse/commit/51414e67d))
- sync-builder ([a422dd23d](https://github.com/powerhouse-inc/powerhouse/commit/a422dd23d))
- initial sync-manager implementation ([00c693e4b](https://github.com/powerhouse-inc/powerhouse/commit/00c693e4b))
- internalchannel implementation and types ([644ef1695](https://github.com/powerhouse-inc/powerhouse/commit/644ef1695))
- getting types in place for implementation ([bbc146227](https://github.com/powerhouse-inc/powerhouse/commit/bbc146227))
- initial implementations of cursor and remotes storage for sync ([1e7fadcf4](https://github.com/powerhouse-inc/powerhouse/commit/1e7fadcf4))
- plan and implementation for kysely sync storage ([7ccc7ae67](https://github.com/powerhouse-inc/powerhouse/commit/7ccc7ae67))
- first pass implementation of job-handle and mailbox ([b86e87803](https://github.com/powerhouse-inc/powerhouse/commit/b86e87803))

### 🩹 Fixes

- unskipping skipped tests and fixing ([f28bd79f2](https://github.com/powerhouse-inc/powerhouse/commit/f28bd79f2))
- use real operation store ([97fac3d7f](https://github.com/powerhouse-inc/powerhouse/commit/97fac3d7f))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.118 (2025-11-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.117 (2025-11-13)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

### 🚀 Features

- implementation of the new join on ordinal in the index ([ad621af7a](https://github.com/powerhouse-inc/powerhouse/commit/ad621af7a))

### 🩹 Fixes

- linter fixes ([d0b6e63d7](https://github.com/powerhouse-inc/powerhouse/commit/d0b6e63d7))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.113 (2025-11-12)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.112 (2025-11-12)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.111 (2025-11-12)

### 🚀 Features

- adding operation index to executor integration tests ([63b51b84f](https://github.com/powerhouse-inc/powerhouse/commit/63b51b84f))
- first pass operation-index integration ([4e5b1e191](https://github.com/powerhouse-inc/powerhouse/commit/4e5b1e191))
- splitting job integration tests into legacy and current ([413ead70c](https://github.com/powerhouse-inc/powerhouse/commit/413ead70c))
- initial implementation of operation index ([906588091](https://github.com/powerhouse-inc/powerhouse/commit/906588091))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.110 (2025-11-11)

### 🚀 Features

- **connect,common,builder-tools:** optimize connect bundle chunks ([#2093](https://github.com/powerhouse-inc/powerhouse/pull/2093))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.109 (2025-11-10)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.108 (2025-11-10)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.107 (2025-11-10)

### 🚀 Features

- wip load-reshuffle test ([fa05f1666](https://github.com/powerhouse-inc/powerhouse/commit/fa05f1666))
- first pass load impl on write side ([85ef79df9](https://github.com/powerhouse-inc/powerhouse/commit/85ef79df9))
- **monorepo:** exit with error code if circular import found ([3ca6d3512](https://github.com/powerhouse-inc/powerhouse/commit/3ca6d3512))
- **connect:** do not use redundant dev deps ([2a847e944](https://github.com/powerhouse-inc/powerhouse/commit/2a847e944))
- **connect,builder-tools:** improve chunking ([c089c7678](https://github.com/powerhouse-inc/powerhouse/commit/c089c7678))
- **codegen,design-system:** update path for import connect components ([f8f387023](https://github.com/powerhouse-inc/powerhouse/commit/f8f387023))
- **monorepo:** add circular imports check in ci ([d6e46a869](https://github.com/powerhouse-inc/powerhouse/commit/d6e46a869))
- **design-system:** resolve remaining circular imports ([b82cc2e3c](https://github.com/powerhouse-inc/powerhouse/commit/b82cc2e3c))
- **document-drive:** fix circular imports ([f2db50c23](https://github.com/powerhouse-inc/powerhouse/commit/f2db50c23))
- **monorepo:** add check circular imports scripts ([d633b37c2](https://github.com/powerhouse-inc/powerhouse/commit/d633b37c2))

### 🩹 Fixes

- fixing lint issues ([3afde3ebd](https://github.com/powerhouse-inc/powerhouse/commit/3afde3ebd))
- fix issue with resuffling ([7bcb931b7](https://github.com/powerhouse-inc/powerhouse/commit/7bcb931b7))
- reshuffles work a bit differently ([0cf39c12d](https://github.com/powerhouse-inc/powerhouse/commit/0cf39c12d))
- publish docker prod workflow ([d701f8dc0](https://github.com/powerhouse-inc/powerhouse/commit/d701f8dc0))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.106 (2025-11-10)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.105 (2025-11-08)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.104 (2025-11-07)

### 🚀 Features

- migration scripts for all storage ([804f5838c](https://github.com/powerhouse-inc/powerhouse/commit/804f5838c))
- **ph-cli:** remove reactor-local command ([029e5db7d](https://github.com/powerhouse-inc/powerhouse/commit/029e5db7d))

### 🩹 Fixes

- require job executor config, and fix mock data in unit tests ([7c7362325](https://github.com/powerhouse-inc/powerhouse/commit/7c7362325))
- linting warnings ([5f79fcf98](https://github.com/powerhouse-inc/powerhouse/commit/5f79fcf98))
- removing race condition from test ([251531bf4](https://github.com/powerhouse-inc/powerhouse/commit/251531bf4))
- linting fixes ([2ab0f01ed](https://github.com/powerhouse-inc/powerhouse/commit/2ab0f01ed))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

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
- integration tests for consistency token ([030744ec2](https://github.com/powerhouse-inc/powerhouse/commit/030744ec2))
- starting to migrate reactor to use the legacy storage feature flag ([c24a9829e](https://github.com/powerhouse-inc/powerhouse/commit/c24a9829e))
- adding consistency tracking to the document indexer ([a2a0b4e9c](https://github.com/powerhouse-inc/powerhouse/commit/a2a0b4e9c))
- adding consistency tracking to the document indexer ([3e4b694e6](https://github.com/powerhouse-inc/powerhouse/commit/3e4b694e6))
- updated read model specs with consistency token ([3a7d6f91a](https://github.com/powerhouse-inc/powerhouse/commit/3a7d6f91a))
- added consistency token to the job interface ([f5077680c](https://github.com/powerhouse-inc/powerhouse/commit/f5077680c))
- consistency tracker implementation ([73449ab68](https://github.com/powerhouse-inc/powerhouse/commit/73449ab68))
- working out how consistency guarantees are provided through consistency tokens ([18737020e](https://github.com/powerhouse-inc/powerhouse/commit/18737020e))

### 🩹 Fixes

- try again with a pnpm upgrade ([ec081f743](https://github.com/powerhouse-inc/powerhouse/commit/ec081f743))
- trying a completely fresh lockfile ([c9888939a](https://github.com/powerhouse-inc/powerhouse/commit/c9888939a))
- broke the build, fixing with reactorbuilder ([2c4ade4e6](https://github.com/powerhouse-inc/powerhouse/commit/2c4ade4e6))
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
- feature flag to toggle write to legacy storage ([151e40d76](https://github.com/powerhouse-inc/powerhouse/commit/151e40d76))
- added some broken tests that are in progress ([c92e1f057](https://github.com/powerhouse-inc/powerhouse/commit/c92e1f057))
- migrating to mutateBatch API for addFile ([75ffe94e9](https://github.com/powerhouse-inc/powerhouse/commit/75ffe94e9))
- first pass batch job implementation ([227305ec8](https://github.com/powerhouse-inc/powerhouse/commit/227305ec8))
- first pass implementation with unit tests ([5bc7416ef](https://github.com/powerhouse-inc/powerhouse/commit/5bc7416ef))
- reactor and job executor have a separate path for relationships ([b1cabb7f5](https://github.com/powerhouse-inc/powerhouse/commit/b1cabb7f5))
- initial types for relationship indexer ([151502633](https://github.com/powerhouse-inc/powerhouse/commit/151502633))

### 🩹 Fixes

- **monorepo:** fix lockfile and test filter ([#2069](https://github.com/powerhouse-inc/powerhouse/pull/2069))
- commenting out test that exports broke ([75cfba9b5](https://github.com/powerhouse-inc/powerhouse/commit/75cfba9b5))
- added a v1 addfile integration test ([47fae0474](https://github.com/powerhouse-inc/powerhouse/commit/47fae0474))
- linter issues ([bc1d2a569](https://github.com/powerhouse-inc/powerhouse/commit/bc1d2a569))
- add/remove children need special revision handling ([52b8bbd72](https://github.com/powerhouse-inc/powerhouse/commit/52b8bbd72))
- type fixes in the document indexer ([98cd03b92](https://github.com/powerhouse-inc/powerhouse/commit/98cd03b92))
- fixing unit test build and adding a couple comments ([d24d46b2d](https://github.com/powerhouse-inc/powerhouse/commit/d24d46b2d))
- publish docker prod workflow ([ab7c4e6cb](https://github.com/powerhouse-inc/powerhouse/commit/ab7c4e6cb))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 4.1.0-dev.99 (2025-10-31)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.98 (2025-10-31)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.97 (2025-10-30)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.96 (2025-10-30)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.95 (2025-10-30)

### 🚀 Features

- enabled ph init --remote-drives and ph checkout commands ([#2057](https://github.com/powerhouse-inc/powerhouse/pull/2057))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.94 (2025-10-29)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.93 (2025-10-29)

### 🚀 Features

- first swing at a project to import these recorded operations ([41b139237](https://github.com/powerhouse-inc/powerhouse/commit/41b139237))

### 🩹 Fixes

- package link issues ([3415df513](https://github.com/powerhouse-inc/powerhouse/commit/3415df513))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.92 (2025-10-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.91 (2025-10-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.90 (2025-10-27)

### 🚀 Features

- **reactor-api:** updated apollo server to v5 ([66dffda7b](https://github.com/powerhouse-inc/powerhouse/commit/66dffda7b))

### ❤️ Thank You

- acaldas

## 4.1.0-dev.89 (2025-10-24)

### 🩹 Fixes

- used fixed versions for codemirror dep ([183e487db](https://github.com/powerhouse-inc/powerhouse/commit/183e487db))

### ❤️ Thank You

- Guillermo Puente

## 4.1.0-dev.88 (2025-10-24)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.87 (2025-10-24)

### 🩹 Fixes

- read tests had a type bug ([b0f21cddc](https://github.com/powerhouse-inc/powerhouse/commit/b0f21cddc))
- let revision errors bubble up to jobs ([13e82cec9](https://github.com/powerhouse-inc/powerhouse/commit/13e82cec9))
- fixing a deep issue where operations were being used to calculate index instead of revisions ([a6611501d](https://github.com/powerhouse-inc/powerhouse/commit/a6611501d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.86 (2025-10-23)

### 🚀 Features

- initial write cache bench, but incomplete ([a9cbcf20e](https://github.com/powerhouse-inc/powerhouse/commit/a9cbcf20e))

### 🩹 Fixes

- **vetra:** added codegen debounce test and reduced logging ([bc360b8e0](https://github.com/powerhouse-inc/powerhouse/commit/bc360b8e0))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.85 (2025-10-22)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.84 (2025-10-22)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.83 (2025-10-22)

### 🚀 Features

- write cache integration test updates and explicit error handling ([9f4d0a5b8](https://github.com/powerhouse-inc/powerhouse/commit/9f4d0a5b8))
- full write cache integration tests using document-drive ([cd22c881b](https://github.com/powerhouse-inc/powerhouse/commit/cd22c881b))
- proof of cache ([53ceae009](https://github.com/powerhouse-inc/powerhouse/commit/53ceae009))
- testing ring buffers directly on the implementation ([bc46076fe](https://github.com/powerhouse-inc/powerhouse/commit/bc46076fe))
- write cache and ring buffer tightening, removing some bad test cases ([f0915abbf](https://github.com/powerhouse-inc/powerhouse/commit/f0915abbf))
- introducing the keyframe store ([fee0e7d2f](https://github.com/powerhouse-inc/powerhouse/commit/fee0e7d2f))
- compatibility fixes ([34bc595c8](https://github.com/powerhouse-inc/powerhouse/commit/34bc595c8))
- easy path -- cache hit ([2804e447f](https://github.com/powerhouse-inc/powerhouse/commit/2804e447f))
- phase 4 of write cache plan ([ac339ff1a](https://github.com/powerhouse-inc/powerhouse/commit/ac339ff1a))
- added a simple lru ([5651ecd17](https://github.com/powerhouse-inc/powerhouse/commit/5651ecd17))
- added simple ring-buffer ([9b73aac39](https://github.com/powerhouse-inc/powerhouse/commit/9b73aac39))
- created necessary interfaces ([f4c1bc9cf](https://github.com/powerhouse-inc/powerhouse/commit/f4c1bc9cf))
- kv-store implementation ([25aa8cfd2](https://github.com/powerhouse-inc/powerhouse/commit/25aa8cfd2))
- add automated tests for vetra features ([#1962](https://github.com/powerhouse-inc/powerhouse/pull/1962))

### 🩹 Fixes

- the last writecache unit test ([999f286a2](https://github.com/powerhouse-inc/powerhouse/commit/999f286a2))
- all of the write cache tests should prove they are using snapshots correctly ([4badb3729](https://github.com/powerhouse-inc/powerhouse/commit/4badb3729))
- offering yet more proof of correctness in base revision usage ([94370ca90](https://github.com/powerhouse-inc/powerhouse/commit/94370ca90))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.82 (2025-10-21)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.81 (2025-10-21)

### 🚀 Features

- **reactor-browser:** remove catch all wildcard ([f09931a88](https://github.com/powerhouse-inc/powerhouse/commit/f09931a88))
- **reactor-browser,connect:** use new window function factory ([7886c284f](https://github.com/powerhouse-inc/powerhouse/commit/7886c284f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.80 (2025-10-21)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.79 (2025-10-20)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.78 (2025-10-20)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.77 (2025-10-20)

### 🩹 Fixes

- add missing @openfeature/core peer dependency ([2c4a904b0](https://github.com/powerhouse-inc/powerhouse/commit/2c4a904b0))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.76 (2025-10-18)

### 🚀 Features

- document-view parity fixes ([0d6dd53fa](https://github.com/powerhouse-inc/powerhouse/commit/0d6dd53fa))

### 🩹 Fixes

- filesystem needs to calculate revisions better ([96654825a](https://github.com/powerhouse-inc/powerhouse/commit/96654825a))
- fixes to how revisions are calculated ([c2b0c2227](https://github.com/powerhouse-inc/powerhouse/commit/c2b0c2227))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.75 (2025-10-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.74 (2025-10-15)

### 🚀 Features

- document-view stiching changes ([fd875ca0a](https://github.com/powerhouse-inc/powerhouse/commit/fd875ca0a))
- document-view optimizations ([d4251ce98](https://github.com/powerhouse-inc/powerhouse/commit/d4251ce98))
- document-view reconstruction fixes ([97a66e3fd](https://github.com/powerhouse-inc/powerhouse/commit/97a66e3fd))
- introduced a read model coordinator ([ae5e765a9](https://github.com/powerhouse-inc/powerhouse/commit/ae5e765a9))
- implemented job tracking ([370447337](https://github.com/powerhouse-inc/powerhouse/commit/370447337))
- deletion state checks ([9fc3798cd](https://github.com/powerhouse-inc/powerhouse/commit/9fc3798cd))
- dual write ([cd1fad2fb](https://github.com/powerhouse-inc/powerhouse/commit/cd1fad2fb))

### 🩹 Fixes

- **codegen:** update graphql dependency in package.json ([257f368ac](https://github.com/powerhouse-inc/powerhouse/commit/257f368ac))
- merge fixes ([e5eda5985](https://github.com/powerhouse-inc/powerhouse/commit/e5eda5985))
- error thrown on shutdown ([b52cdb6fe](https://github.com/powerhouse-inc/powerhouse/commit/b52cdb6fe))
- document-drive-model tests should use updated job status system and proper lifecycle methods of coordinator ([4217e3292](https://github.com/powerhouse-inc/powerhouse/commit/4217e3292))
- now we need an actual job executor to make tests pass ([c869f1f34](https://github.com/powerhouse-inc/powerhouse/commit/c869f1f34))
- jobs can have many operations, fixing create/update in new flow ([ffcf6b468](https://github.com/powerhouse-inc/powerhouse/commit/ffcf6b468))
- adding all header parameters to create action input ([67ac63f05](https://github.com/powerhouse-inc/powerhouse/commit/67ac63f05))
- fixing issue where create, update, delete were applied with incorrect scope ([59c7a981e](https://github.com/powerhouse-inc/powerhouse/commit/59c7a981e))
- incremental fix wit hack ([5f4a7e2cd](https://github.com/powerhouse-inc/powerhouse/commit/5f4a7e2cd))
- date issue in op store ([4c2fb3ae6](https://github.com/powerhouse-inc/powerhouse/commit/4c2fb3ae6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.73 (2025-10-15)

### 🚀 Features

- **renown:** added login button ([f109c7305](https://github.com/powerhouse-inc/powerhouse/commit/f109c7305))

### ❤️ Thank You

- Frank

## 4.1.0-dev.72 (2025-10-15)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.71 (2025-10-15)

### 🩹 Fixes

- **codegen:** update analytics processor imports to use in processor templates ([#1954](https://github.com/powerhouse-inc/powerhouse/pull/1954))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.70 (2025-10-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.69 (2025-10-11)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.65 (2025-10-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.64 (2025-10-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.63 (2025-10-09)

### 🚀 Features

- update @electric-sql/pglite version ([fa3529328](https://github.com/powerhouse-inc/powerhouse/commit/fa3529328))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.62 (2025-10-08)

### 🚀 Features

- wip delete document action ([5f753cea0](https://github.com/powerhouse-inc/powerhouse/commit/5f753cea0))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.61 (2025-10-08)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.60 (2025-10-08)

### 🚀 Features

- **vetra:** added read model to fetch vetra packages ([23c55364d](https://github.com/powerhouse-inc/powerhouse/commit/23c55364d))
- added hashing options to the document scope ([af2ef40c0](https://github.com/powerhouse-inc/powerhouse/commit/af2ef40c0))
- using types instead of dynamic objects for create and upgrade input ([2a0e80974](https://github.com/powerhouse-inc/powerhouse/commit/2a0e80974))
- operation store now uses updated create / update actions ([180702e6c](https://github.com/powerhouse-inc/powerhouse/commit/180702e6c))
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
- added getMany to document view ([f89a1c46c](https://github.com/powerhouse-inc/powerhouse/commit/f89a1c46c))
- initial document view methods + tests ([af8a9a0e7](https://github.com/powerhouse-inc/powerhouse/commit/af8a9a0e7))
- add remaining methods ([2d1bd201e](https://github.com/powerhouse-inc/powerhouse/commit/2d1bd201e))
- added initial pieces of the kysely operation store implementation ([3fbece162](https://github.com/powerhouse-inc/powerhouse/commit/3fbece162))
- **connect,builder-tools:** build rework ([#1871](https://github.com/powerhouse-inc/powerhouse/pull/1871))
- **codegen:** updated editor boilerplate with document state and example setName dispatch ([3e7c51cc3](https://github.com/powerhouse-inc/powerhouse/commit/3e7c51cc3))
- restructure document model to avoid circular imports ([#1874](https://github.com/powerhouse-inc/powerhouse/pull/1874))

### 🩹 Fixes

- flakey test fix using fake timers ([4c7be58f3](https://github.com/powerhouse-inc/powerhouse/commit/4c7be58f3))
- linting queue and awaiter now ([39b0f07ae](https://github.com/powerhouse-inc/powerhouse/commit/39b0f07ae))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.59 (2025-09-24)

### 🚀 Features

- **reactor:** fix lint error ([53777e154](https://github.com/powerhouse-inc/powerhouse/commit/53777e154))
- **monorepo:** rename tsc to tsc:build ([c1385418b](https://github.com/powerhouse-inc/powerhouse/commit/c1385418b))

### 🩹 Fixes

- **builder-tools:** declare @storybook/preview-api dependency ([705ac8da1](https://github.com/powerhouse-inc/powerhouse/commit/705ac8da1))
- more type fixes ([16c562ae1](https://github.com/powerhouse-inc/powerhouse/commit/16c562ae1))
- lots of type fixes for modules ([8f4cf02fe](https://github.com/powerhouse-inc/powerhouse/commit/8f4cf02fe))
- reverting bad merge changes and getting reactor to build again ([eb687de4c](https://github.com/powerhouse-inc/powerhouse/commit/eb687de4c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.55 (2025-09-16)

### 🚀 Features

- enable supported document types for drag and drop feature ([#1860](https://github.com/powerhouse-inc/powerhouse/pull/1860))

### 🩹 Fixes

- add default, passthrough signer ([d9e2c4f1d](https://github.com/powerhouse-inc/powerhouse/commit/d9e2c4f1d))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.54 (2025-09-16)

### 🚀 Features

- adding reactor client to subgraph args ([d0a8011e6](https://github.com/powerhouse-inc/powerhouse/commit/d0a8011e6))
- updating docs with error handler ([4e28b0573](https://github.com/powerhouse-inc/powerhouse/commit/4e28b0573))
- subscriptions now have guaranteed delivery and output errors through a centralized error handler ([d9b0c4326](https://github.com/powerhouse-inc/powerhouse/commit/d9b0c4326))
- naive implementation of subscriptions ([5ae6dd83c](https://github.com/powerhouse-inc/powerhouse/commit/5ae6dd83c))
- reactor client builder ([d93875bcd](https://github.com/powerhouse-inc/powerhouse/commit/d93875bcd))

### 🩹 Fixes

- linter feedback ([5219f6322](https://github.com/powerhouse-inc/powerhouse/commit/5219f6322))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.53 (2025-09-13)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.52 (2025-09-12)

### 🚀 Features

- more test fixes ([12a0acd1d](https://github.com/powerhouse-inc/powerhouse/commit/12a0acd1d))
- pulled job awaiter out of reactor client ([bd4c206a9](https://github.com/powerhouse-inc/powerhouse/commit/bd4c206a9))
- implemented the easy, passthrough functions ([ceb692cd1](https://github.com/powerhouse-inc/powerhouse/commit/ceb692cd1))
- add a bunch of failing tests for the reactor-client ([8276565a8](https://github.com/powerhouse-inc/powerhouse/commit/8276565a8))

### 🩹 Fixes

- linting issues ([ba85245b4](https://github.com/powerhouse-inc/powerhouse/commit/ba85245b4))
- **connect-e2e:** fix failing tests ([88c3bea94](https://github.com/powerhouse-inc/powerhouse/commit/88c3bea94))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.51 (2025-09-11)

### 🚀 Features

- **reactor-api:** generate sdk ([ec107015c](https://github.com/powerhouse-inc/powerhouse/commit/ec107015c))
- **reactor-api:** initial gql codegen ([3db9e9778](https://github.com/powerhouse-inc/powerhouse/commit/3db9e9778))
- **monorepo:** make format consistent across ignores ([98469560f](https://github.com/powerhouse-inc/powerhouse/commit/98469560f))
- **monorepo:** use consistent separate type imports ([6fd4ac0f4](https://github.com/powerhouse-inc/powerhouse/commit/6fd4ac0f4))

### 🩹 Fixes

- annoyingly, you have to add ignores to the root eslint ([bb6d993bd](https://github.com/powerhouse-inc/powerhouse/commit/bb6d993bd))
- **docs:** improve document hooks documentation ([d05fcb835](https://github.com/powerhouse-inc/powerhouse/commit/d05fcb835))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.50 (2025-09-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.49 (2025-09-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.48 (2025-09-09)

### 🚀 Features

- update queue to use job handles ([acbe50ee1](https://github.com/powerhouse-inc/powerhouse/commit/acbe50ee1))
- tests for job execution handle ([5af69c190](https://github.com/powerhouse-inc/powerhouse/commit/5af69c190))
- moving to job execution handles ([f91c3a759](https://github.com/powerhouse-inc/powerhouse/commit/f91c3a759))
- drain, block, unblock on queue ([77ad8f9bc](https://github.com/powerhouse-inc/powerhouse/commit/77ad8f9bc))
- added job execution handle ([4fadd6638](https://github.com/powerhouse-inc/powerhouse/commit/4fadd6638))

### 🩹 Fixes

- more linting issues ([5dd874517](https://github.com/powerhouse-inc/powerhouse/commit/5dd874517))
- tons of linting fixes ([38c7981e3](https://github.com/powerhouse-inc/powerhouse/commit/38c7981e3))
- automated linting fixes ([d9c123692](https://github.com/powerhouse-inc/powerhouse/commit/d9c123692))
- fix eventbus benchmarks, remove old benchmark ([5a85f498e](https://github.com/powerhouse-inc/powerhouse/commit/5a85f498e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.47 (2025-09-06)

### 🩹 Fixes

- **docs:** added zip redundancy to release notes ([3acfe1027](https://github.com/powerhouse-inc/powerhouse/commit/3acfe1027))

### ❤️ Thank You

- Callme-T

## 4.1.0-dev.46 (2025-09-05)

### 🚀 Features

- plug in persistence ([5af292734](https://github.com/powerhouse-inc/powerhouse/commit/5af292734))
- added robust dependency system to queue ([4aca91494](https://github.com/powerhouse-inc/powerhouse/commit/4aca91494))
- wip dependency graph ([939e41076](https://github.com/powerhouse-inc/powerhouse/commit/939e41076))
- queue now queues by doc id ([afc03e437](https://github.com/powerhouse-inc/powerhouse/commit/afc03e437))

### 🩹 Fixes

- **docs:** added zip redundancy to release notes ([3acfe1027](https://github.com/powerhouse-inc/powerhouse/commit/3acfe1027))
- build errors ([97b4853a3](https://github.com/powerhouse-inc/powerhouse/commit/97b4853a3))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T

## 5.0.0-staging.1 (2025-09-04)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.44 (2025-09-04)

### 🚀 Features

- **switchboard:** updated readme ([9659cf035](https://github.com/powerhouse-inc/powerhouse/commit/9659cf035))

### ❤️ Thank You

- Frank

## 4.1.0-dev.43 (2025-09-02)

### 🚀 Features

- first mutation queued... ([a678882a3](https://github.com/powerhouse-inc/powerhouse/commit/a678882a3))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.42 (2025-09-02)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.41 (2025-09-02)

### 🩹 Fixes

- **document-drive:** install openssl ([89f21529e](https://github.com/powerhouse-inc/powerhouse/commit/89f21529e))
- **document-drive:** prisma build ([7884368a2](https://github.com/powerhouse-inc/powerhouse/commit/7884368a2))
- **switchboard, connect:** fetch proper tag ([79a0bc967](https://github.com/powerhouse-inc/powerhouse/commit/79a0bc967))

### ❤️ Thank You

- Frank

## 4.1.0-dev.40 (2025-09-02)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.39 (2025-09-02)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.38 (2025-08-30)

### 🚀 Features

- **reactor:** update mutate on facade ([aab0d7553](https://github.com/powerhouse-inc/powerhouse/commit/aab0d7553))
- gql-gen spec ([5bf2c7226](https://github.com/powerhouse-inc/powerhouse/commit/5bf2c7226))
- reactor find fixes ([9560ccb0f](https://github.com/powerhouse-inc/powerhouse/commit/9560ccb0f))
- implementing find facade on IReactor ([eed25fdae](https://github.com/powerhouse-inc/powerhouse/commit/eed25fdae))
- **reactor:** we have a reactor facade ([7a61e68ab](https://github.com/powerhouse-inc/powerhouse/commit/7a61e68ab))
- **reactor:** impstubbing out initial interface and types ([b74b194f9](https://github.com/powerhouse-inc/powerhouse/commit/b74b194f9))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.37 (2025-08-29)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.36 (2025-08-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.35 (2025-08-27)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.34 (2025-08-26)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.33 (2025-08-21)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.32 (2025-08-21)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.31 (2025-08-20)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.22 (2025-08-15)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.21 (2025-08-15)

### 🚀 Features

- **vetra:** update manifest when new module is added ([#1766](https://github.com/powerhouse-inc/powerhouse/pull/1766))

### 🩹 Fixes

- fixed debug launch configuration now that source maps are in the proper locations ([c75d793ed](https://github.com/powerhouse-inc/powerhouse/commit/c75d793ed))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.20 (2025-08-15)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.19 (2025-08-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.18 (2025-08-14)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.17 (2025-08-12)

### 🚀 Features

- refactor vetra command and remove vetra deps in connect and reactor ([#1753](https://github.com/powerhouse-inc/powerhouse/pull/1753))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.16 (2025-08-12)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.12 (2025-08-08)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.11 (2025-08-07)

### 🚀 Features

- **switchboard,reactor-local,reactor-api:** moved vite loader to reactor-api package ([c84f0a2a3](https://github.com/powerhouse-inc/powerhouse/commit/c84f0a2a3))
- vetra package documents and app integration ([0e4053302](https://github.com/powerhouse-inc/powerhouse/commit/0e4053302))
- **vetra:** added vetra drive editor ([4ebafd143](https://github.com/powerhouse-inc/powerhouse/commit/4ebafd143))
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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.8 (2025-08-06)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.7 (2025-08-06)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.5 (2025-08-05)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.17 (2025-07-23)

### 🩹 Fixes

- **codegen:** revert changes to resolvers template ([b96a7b899](https://github.com/powerhouse-inc/powerhouse/commit/b96a7b899))
- update release notes ([f1b6a8e71](https://github.com/powerhouse-inc/powerhouse/commit/f1b6a8e71))
- add release notes on correct branch ([a2d60a537](https://github.com/powerhouse-inc/powerhouse/commit/a2d60a537))

### ❤️ Thank You

- acaldas
- Callme-T

## 3.3.0-dev.16 (2025-07-22)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.15 (2025-07-17)

### 🩹 Fixes

- **codegen:** updated subgraph template to deal with undefined return on getDocument ([7b2862a91](https://github.com/powerhouse-inc/powerhouse/commit/7b2862a91))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.14 (2025-07-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.13 (2025-07-17)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.12 (2025-07-17)

### 🩹 Fixes

- **document-drive:** use lowercase letters when hashing relational processor namespace ([87c7944d3](https://github.com/powerhouse-inc/powerhouse/commit/87c7944d3))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.11 (2025-07-16)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.7 (2025-07-10)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.6 (2025-07-10)

### 🚀 Features

- **codegen:** support loading migration typescript file ([d3cc1957b](https://github.com/powerhouse-inc/powerhouse/commit/d3cc1957b))

### 🩹 Fixes

- **codegen,ph-cli:** make schema-file optional and updated generate help text ([adad303a8](https://github.com/powerhouse-inc/powerhouse/commit/adad303a8))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.5 (2025-07-09)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.1 (2025-07-04)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.3.0-dev.0 (2025-07-02)

### 🚀 Features

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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.2.0-dev.7 (2025-06-28)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

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
- adding id/slug resolution to document storage ([0c611fb1b](https://github.com/powerhouse-inc/powerhouse/commit/0c611fb1b))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
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

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 3.2.0-dev.1 (2025-06-19)

### 🩹 Fixes

- **connect,builder-tools:** support base paths without ending slash ([1ee6d9d9f](https://github.com/powerhouse-inc/powerhouse/commit/1ee6d9d9f))

### ❤️ Thank You

- acaldas @acaldas

## 3.2.0-dev.0 (2025-06-18)

### 🚀 Features

- use document model subgraph when clicking on switchboard url button ([24cf6ad94](https://github.com/powerhouse-inc/powerhouse/commit/24cf6ad94))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.41 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.40 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.39 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.38 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.37 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.36 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.35 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.34 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.33 (2025-06-18)

### 🚀 Features

- **reactor:** added repository url to package.json ([662c90e89](https://github.com/powerhouse-inc/powerhouse/commit/662c90e89))

### 🩹 Fixes

- deploy not on push to main ([63eef7020](https://github.com/powerhouse-inc/powerhouse/commit/63eef7020))
- deploy powerhouse to available environments ([a45859a22](https://github.com/powerhouse-inc/powerhouse/commit/a45859a22))

### ❤️ Thank You

- Frank

## 2.5.0-dev.32 (2025-06-18)

This was a version bump only for @powerhousedao/reactor to align it with other projects, there were no code changes.

## 2.5.0-dev.31 (2025-06-18)

### 🚀 Features

- **reactor:** proof-of-concept benchmarks for queue->event->job execution flow ([c297618b9](https://github.com/powerhouse-inc/powerhouse/commit/c297618b9))
- **reactor:** job executor and queue implementations and tests ([c74bbc712](https://github.com/powerhouse-inc/powerhouse/commit/c74bbc712))
- **reactor:** initial event-bus implementation with tests and benchmarks ([ef5b3c42e](https://github.com/powerhouse-inc/powerhouse/commit/ef5b3c42e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
