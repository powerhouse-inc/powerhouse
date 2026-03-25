## 6.0.2-staging.0 (2026-03-25)

### 🚀 Features

- **examples:** add Discord webhook processor example ([fc09a4d66](https://github.com/powerhouse-inc/powerhouse/commit/fc09a4d66))
- **shared:** add full-text search processor for document indexing ([48ffbff4f](https://github.com/powerhouse-inc/powerhouse/commit/48ffbff4f))
- **test-subscription:** adding a cli test-client for testing reactor api subscriptions ([563a8ac7d](https://github.com/powerhouse-inc/powerhouse/commit/563a8ac7d))
- **switchboard:** add OTel metrics export via OTEL_EXPORTER_OTLP_ENDPOINT ([52f34aa1f](https://github.com/powerhouse-inc/powerhouse/commit/52f34aa1f))
- reactor-hypercore example ([d5557973a](https://github.com/powerhouse-inc/powerhouse/commit/d5557973a))
- **renown,reactor-browser:** renown integration improvements ([a65731a73](https://github.com/powerhouse-inc/powerhouse/commit/a65731a73))
- **ci:** add gitops action for registry image updates ([ba91d00dd](https://github.com/powerhouse-inc/powerhouse/commit/ba91d00dd))
- replace reactor dropdown with registry selector in package manager ([c8a944a24](https://github.com/powerhouse-inc/powerhouse/commit/c8a944a24))
- **ci:** add registry Docker image to publish workflow ([17544abad](https://github.com/powerhouse-inc/powerhouse/commit/17544abad))
- opentelementry-instrumentation-reactor package ([67d5c31e5](https://github.com/powerhouse-inc/powerhouse/commit/67d5c31e5))
- **renown,reactor-browser,connect:** cleanup renown integration ([fe6112c2c](https://github.com/powerhouse-inc/powerhouse/commit/fe6112c2c))
- **connect,reactor-browser:** add dynamic package loading from HTTP registry ([f92816782](https://github.com/powerhouse-inc/powerhouse/commit/f92816782))
- **document-model,reactor-api,reactor-browser:** implemented remote document controller ([6299c21da](https://github.com/powerhouse-inc/powerhouse/commit/6299c21da))
- **switchboard,reactor-api,registry:** add runtime dynamic pacage loading from HTTP registry ([37f91250e](https://github.com/powerhouse-inc/powerhouse/commit/37f91250e))
- add new bundling for connect ([#2390](https://github.com/powerhouse-inc/powerhouse/pull/2390))

### 🩹 Fixes

- use fixed versions to avoid resolution issues with npm ([9d6a4ea61](https://github.com/powerhouse-inc/powerhouse/commit/9d6a4ea61))
- **reactor:** temporary fix for deleting documents and cleaning up all edges too -- very costly ([8a15a0604](https://github.com/powerhouse-inc/powerhouse/commit/8a15a0604))
- update workflow to use refname for tag in case it is not annotated, and provide a clear error message when there is no tag ([269758716](https://github.com/powerhouse-inc/powerhouse/commit/269758716))
- **builder-tools,reactor-browser:** bundling fixes ([59dfd75b6](https://github.com/powerhouse-inc/powerhouse/commit/59dfd75b6))
- updated pnpm-lock ([c2843dc5b](https://github.com/powerhouse-inc/powerhouse/commit/c2843dc5b))
- **connect:** declare dependencies ([6aa6910d3](https://github.com/powerhouse-inc/powerhouse/commit/6aa6910d3))
- **design-system:** removed zod dependency ([fdc7c2ef7](https://github.com/powerhouse-inc/powerhouse/commit/fdc7c2ef7))
- **codegen:** added missing deps to boilerplate ([721dcb581](https://github.com/powerhouse-inc/powerhouse/commit/721dcb581))
- **switchboard:** address OTel metrics review feedback ([c5ac016fc](https://github.com/powerhouse-inc/powerhouse/commit/c5ac016fc))
- **common:** added missing runtime dependencies ([b0f647f75](https://github.com/powerhouse-inc/powerhouse/commit/b0f647f75))
- adding build-bundle to simulate-ci-workflow ([ca93d1a2b](https://github.com/powerhouse-inc/powerhouse/commit/ca93d1a2b))
- **renown:** moved e2e script test to reactor-browser ([3c9b41045](https://github.com/powerhouse-inc/powerhouse/commit/3c9b41045))
- **registry:** resolve catalog references in Dockerfile with sed ([765e8fbdd](https://github.com/powerhouse-inc/powerhouse/commit/765e8fbdd))
- **registry:** copy pnpm-workspace.yaml for Docker build catalog resolution ([7407700b1](https://github.com/powerhouse-inc/powerhouse/commit/7407700b1))
- **reactor-browser:** removed subexports ([4cda7f44c](https://github.com/powerhouse-inc/powerhouse/commit/4cda7f44c))
- eslint config ([fb20b3726](https://github.com/powerhouse-inc/powerhouse/commit/fb20b3726))
- **vetra:** remove custom subgraphs from vetra ([3a1e3b9b0](https://github.com/powerhouse-inc/powerhouse/commit/3a1e3b9b0))
- resolve empty name causing silent ADD_FILE failure in drives ([b44ed0c1c](https://github.com/powerhouse-inc/powerhouse/commit/b44ed0c1c))
- **reactor-mcp:** adopt new reactor client interface for MCP server ([1b8e6fb19](https://github.com/powerhouse-inc/powerhouse/commit/1b8e6fb19))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Claude Opus 4.6
- Frank
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.1-staging.0 (2026-03-23)

### 🚀 Features

- **examples:** add Discord webhook processor example ([fc09a4d66](https://github.com/powerhouse-inc/powerhouse/commit/fc09a4d66))
- **shared:** add full-text search processor for document indexing ([48ffbff4f](https://github.com/powerhouse-inc/powerhouse/commit/48ffbff4f))
- **test-subscription:** adding a cli test-client for testing reactor api subscriptions ([563a8ac7d](https://github.com/powerhouse-inc/powerhouse/commit/563a8ac7d))
- **switchboard:** add OTel metrics export via OTEL_EXPORTER_OTLP_ENDPOINT ([52f34aa1f](https://github.com/powerhouse-inc/powerhouse/commit/52f34aa1f))
- reactor-hypercore example ([d5557973a](https://github.com/powerhouse-inc/powerhouse/commit/d5557973a))
- **renown,reactor-browser:** renown integration improvements ([a65731a73](https://github.com/powerhouse-inc/powerhouse/commit/a65731a73))
- **ci:** add gitops action for registry image updates ([ba91d00dd](https://github.com/powerhouse-inc/powerhouse/commit/ba91d00dd))
- replace reactor dropdown with registry selector in package manager ([c8a944a24](https://github.com/powerhouse-inc/powerhouse/commit/c8a944a24))
- **ci:** add registry Docker image to publish workflow ([17544abad](https://github.com/powerhouse-inc/powerhouse/commit/17544abad))
- opentelementry-instrumentation-reactor package ([67d5c31e5](https://github.com/powerhouse-inc/powerhouse/commit/67d5c31e5))
- **renown,reactor-browser,connect:** cleanup renown integration ([fe6112c2c](https://github.com/powerhouse-inc/powerhouse/commit/fe6112c2c))
- **connect,reactor-browser:** add dynamic package loading from HTTP registry ([f92816782](https://github.com/powerhouse-inc/powerhouse/commit/f92816782))
- **document-model,reactor-api,reactor-browser:** implemented remote document controller ([6299c21da](https://github.com/powerhouse-inc/powerhouse/commit/6299c21da))
- **switchboard,reactor-api,registry:** add runtime dynamic pacage loading from HTTP registry ([37f91250e](https://github.com/powerhouse-inc/powerhouse/commit/37f91250e))
- add new bundling for connect ([#2390](https://github.com/powerhouse-inc/powerhouse/pull/2390))

### 🩹 Fixes

- **reactor:** temporary fix for deleting documents and cleaning up all edges too -- very costly ([8a15a0604](https://github.com/powerhouse-inc/powerhouse/commit/8a15a0604))
- update workflow to use refname for tag in case it is not annotated, and provide a clear error message when there is no tag ([269758716](https://github.com/powerhouse-inc/powerhouse/commit/269758716))
- **builder-tools,reactor-browser:** bundling fixes ([59dfd75b6](https://github.com/powerhouse-inc/powerhouse/commit/59dfd75b6))
- updated pnpm-lock ([c2843dc5b](https://github.com/powerhouse-inc/powerhouse/commit/c2843dc5b))
- **connect:** declare dependencies ([6aa6910d3](https://github.com/powerhouse-inc/powerhouse/commit/6aa6910d3))
- **design-system:** removed zod dependency ([fdc7c2ef7](https://github.com/powerhouse-inc/powerhouse/commit/fdc7c2ef7))
- **codegen:** added missing deps to boilerplate ([721dcb581](https://github.com/powerhouse-inc/powerhouse/commit/721dcb581))
- **switchboard:** address OTel metrics review feedback ([c5ac016fc](https://github.com/powerhouse-inc/powerhouse/commit/c5ac016fc))
- **common:** added missing runtime dependencies ([b0f647f75](https://github.com/powerhouse-inc/powerhouse/commit/b0f647f75))
- adding build-bundle to simulate-ci-workflow ([ca93d1a2b](https://github.com/powerhouse-inc/powerhouse/commit/ca93d1a2b))
- **renown:** moved e2e script test to reactor-browser ([3c9b41045](https://github.com/powerhouse-inc/powerhouse/commit/3c9b41045))
- **registry:** resolve catalog references in Dockerfile with sed ([765e8fbdd](https://github.com/powerhouse-inc/powerhouse/commit/765e8fbdd))
- **registry:** copy pnpm-workspace.yaml for Docker build catalog resolution ([7407700b1](https://github.com/powerhouse-inc/powerhouse/commit/7407700b1))
- **reactor-browser:** removed subexports ([4cda7f44c](https://github.com/powerhouse-inc/powerhouse/commit/4cda7f44c))
- eslint config ([fb20b3726](https://github.com/powerhouse-inc/powerhouse/commit/fb20b3726))
- **vetra:** remove custom subgraphs from vetra ([3a1e3b9b0](https://github.com/powerhouse-inc/powerhouse/commit/3a1e3b9b0))
- resolve empty name causing silent ADD_FILE failure in drives ([b44ed0c1c](https://github.com/powerhouse-inc/powerhouse/commit/b44ed0c1c))
- **reactor-mcp:** adopt new reactor client interface for MCP server ([1b8e6fb19](https://github.com/powerhouse-inc/powerhouse/commit/1b8e6fb19))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Claude Opus 4.6
- Frank
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-staging.0 (2026-03-18)

### 🚀 Features

- **test-subscription:** adding a cli test-client for testing reactor api subscriptions ([563a8ac7d](https://github.com/powerhouse-inc/powerhouse/commit/563a8ac7d))
- **switchboard:** add OTel metrics export via OTEL_EXPORTER_OTLP_ENDPOINT ([52f34aa1f](https://github.com/powerhouse-inc/powerhouse/commit/52f34aa1f))
- reactor-hypercore example ([d5557973a](https://github.com/powerhouse-inc/powerhouse/commit/d5557973a))
- **renown,reactor-browser:** renown integration improvements ([a65731a73](https://github.com/powerhouse-inc/powerhouse/commit/a65731a73))
- **ci:** add gitops action for registry image updates ([ba91d00dd](https://github.com/powerhouse-inc/powerhouse/commit/ba91d00dd))
- replace reactor dropdown with registry selector in package manager ([c8a944a24](https://github.com/powerhouse-inc/powerhouse/commit/c8a944a24))
- **ci:** add registry Docker image to publish workflow ([17544abad](https://github.com/powerhouse-inc/powerhouse/commit/17544abad))
- opentelementry-instrumentation-reactor package ([67d5c31e5](https://github.com/powerhouse-inc/powerhouse/commit/67d5c31e5))
- **renown,reactor-browser,connect:** cleanup renown integration ([fe6112c2c](https://github.com/powerhouse-inc/powerhouse/commit/fe6112c2c))
- **connect,reactor-browser:** add dynamic package loading from HTTP registry ([f92816782](https://github.com/powerhouse-inc/powerhouse/commit/f92816782))
- **document-model,reactor-api,reactor-browser:** implemented remote document controller ([6299c21da](https://github.com/powerhouse-inc/powerhouse/commit/6299c21da))
- **switchboard,reactor-api,registry:** add runtime dynamic pacage loading from HTTP registry ([37f91250e](https://github.com/powerhouse-inc/powerhouse/commit/37f91250e))
- add new bundling for connect ([#2390](https://github.com/powerhouse-inc/powerhouse/pull/2390))

### 🩹 Fixes

- updated pnpm-lock ([c2843dc5b](https://github.com/powerhouse-inc/powerhouse/commit/c2843dc5b))
- **connect:** declare dependencies ([6aa6910d3](https://github.com/powerhouse-inc/powerhouse/commit/6aa6910d3))
- **design-system:** removed zod dependency ([fdc7c2ef7](https://github.com/powerhouse-inc/powerhouse/commit/fdc7c2ef7))
- **codegen:** added missing deps to boilerplate ([721dcb581](https://github.com/powerhouse-inc/powerhouse/commit/721dcb581))
- **switchboard:** address OTel metrics review feedback ([c5ac016fc](https://github.com/powerhouse-inc/powerhouse/commit/c5ac016fc))
- **common:** added missing runtime dependencies ([b0f647f75](https://github.com/powerhouse-inc/powerhouse/commit/b0f647f75))
- adding build-bundle to simulate-ci-workflow ([ca93d1a2b](https://github.com/powerhouse-inc/powerhouse/commit/ca93d1a2b))
- **renown:** moved e2e script test to reactor-browser ([3c9b41045](https://github.com/powerhouse-inc/powerhouse/commit/3c9b41045))
- **registry:** resolve catalog references in Dockerfile with sed ([765e8fbdd](https://github.com/powerhouse-inc/powerhouse/commit/765e8fbdd))
- **registry:** copy pnpm-workspace.yaml for Docker build catalog resolution ([7407700b1](https://github.com/powerhouse-inc/powerhouse/commit/7407700b1))
- **reactor-browser:** removed subexports ([4cda7f44c](https://github.com/powerhouse-inc/powerhouse/commit/4cda7f44c))
- eslint config ([fb20b3726](https://github.com/powerhouse-inc/powerhouse/commit/fb20b3726))
- **vetra:** remove custom subgraphs from vetra ([3a1e3b9b0](https://github.com/powerhouse-inc/powerhouse/commit/3a1e3b9b0))
- resolve empty name causing silent ADD_FILE failure in drives ([b44ed0c1c](https://github.com/powerhouse-inc/powerhouse/commit/b44ed0c1c))
- **reactor-mcp:** adopt new reactor client interface for MCP server ([1b8e6fb19](https://github.com/powerhouse-inc/powerhouse/commit/1b8e6fb19))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Frank
- Guillermo Puente
- Ryan Wolhuter
- Samuel Hawksby-Robinson

## 6.0.1-staging.1 (2026-03-03)

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

## 6.0.0-dev.67 (2026-03-03)

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

## 6.0.0-dev.66 (2026-03-03)

### 🚀 Features

- move reactor logic from connect to reactor browser ([#2385](https://github.com/powerhouse-inc/powerhouse/pull/2385))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.65 (2026-03-03)

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

## 6.0.0-dev.64 (2026-03-03)

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

## 6.0.0-dev.52 (2026-02-17)

### 🩹 Fixes

- **reactor-api:** improved subgraph path matching and removed name parameter from reactor subgraph ([dcadf7fb3](https://github.com/powerhouse-inc/powerhouse/commit/dcadf7fb3))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.51 (2026-02-17)

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

## 6.0.0-dev.50 (2026-02-17)

This was a version bump only for @powerhousedao/shared to align it with other projects, there were no code changes.

## 6.0.0-dev.49 (2026-02-17)

### 🩹 Fixes

- **shared:** add missing repository field in shared package.json ([10283f638](https://github.com/powerhouse-inc/powerhouse/commit/10283f638))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 6.0.0-dev.47 (2026-02-17)

### 🩹 Fixes

- **monorepo:** make shared package publicly available ([#2348](https://github.com/powerhouse-inc/powerhouse/pull/2348))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter
