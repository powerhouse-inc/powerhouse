## 6.0.0-dev.249 (2026-05-15)

### 🚀 Features

- added release script ([20454f119](https://github.com/powerhouse-inc/powerhouse/commit/20454f119))
- add tailwind eslint plugin ([#2612](https://github.com/powerhouse-inc/powerhouse/pull/2612))

### 🩹 Fixes

- **codegen:** install dependencies during migrate before regeneration ([ff107e29f](https://github.com/powerhouse-inc/powerhouse/commit/ff107e29f))

### ❤️ Thank You

- acaldas
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.248 (2026-05-14)

### 🚀 Features

- **shared:** replace jszip with fflate for tree-shakeable zip handling ([9a417aa98](https://github.com/powerhouse-inc/powerhouse/commit/9a417aa98))

### 🩹 Fixes

- declare graphql/graphql-tag as peerDependencies to prevent dup instances ([4fec9d5b6](https://github.com/powerhouse-inc/powerhouse/commit/4fec9d5b6))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.247 (2026-05-14)

### 🚀 Features

- **pglite-fs:** adding crash tests, also adding permutations of reactor tests with new backend ([4747ba737](https://github.com/powerhouse-inc/powerhouse/commit/4747ba737))
- **pglite-fs:** implemented a fs-backed pglite backend with in-memory WAL ([736ae675b](https://github.com/powerhouse-inc/powerhouse/commit/736ae675b))
- **ph-lora:** release-notes skill + v6.0.0 release notes ([22aa1e682](https://github.com/powerhouse-inc/powerhouse/commit/22aa1e682))
- **ph-lora:** doc-status and doc-clarity command ([1087fadb9](https://github.com/powerhouse-inc/powerhouse/commit/1087fadb9))
- **ph-lora:** doc-fix command ([87c6ab98d](https://github.com/powerhouse-inc/powerhouse/commit/87c6ab98d))
- **ph-lora:** tier 2 CI, mapping validator, file-level sourceFiles, authorization gap report ([76ce10b41](https://github.com/powerhouse-inc/powerhouse/commit/76ce10b41))
- **ph-lora:** tier 1 doc checker, mapping, gap report for react hooks ([47c6fc620](https://github.com/powerhouse-inc/powerhouse/commit/47c6fc620))

### ❤️ Thank You

- Benjamin Jordan
- CallmeT-ty @CallmeT-ty
- Claude Sonnet 4.6

## 6.0.0-dev.246 (2026-05-13)

### 🚀 Features

- improve document toolbar ([#2602](https://github.com/powerhouse-inc/powerhouse/pull/2602))

### 🩹 Fixes

- mark json files with correct permissions so nginx can serve them ([c2008bb1c](https://github.com/powerhouse-inc/powerhouse/commit/c2008bb1c))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.245 (2026-05-13)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.244 (2026-05-13)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.243 (2026-05-12)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.242 (2026-05-12)

### 🩹 Fixes

- **release:** pass explicit from-ref to releaseChangelog ([5af1ce209](https://github.com/powerhouse-inc/powerhouse/commit/5af1ce209))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.241 (2026-05-12)

### 🚀 Features

- **connect:** surface missing-model failures and move registry URL to ph-packages.json ([bcb8bbdb0](https://github.com/powerhouse-inc/powerhouse/commit/bcb8bbdb0))

### 🩹 Fixes

- **release:** pass explicit from-ref to releaseChangelog ([5af1ce209](https://github.com/powerhouse-inc/powerhouse/commit/5af1ce209))
- **switchboard:** move @pyroscope/nodejs to dependencies ([c71e0b3de](https://github.com/powerhouse-inc/powerhouse/commit/c71e0b3de))
- **sentry:** inject debug-ids before publish + drop dead dirs ([444c677a2](https://github.com/powerhouse-inc/powerhouse/commit/444c677a2))
- switching postgres versions ([353951582](https://github.com/powerhouse-inc/powerhouse/commit/353951582))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.240 (2026-05-11)

### 🩹 Fixes

- **reactor-api:** exclude hub/spoke test by default, added specific job to test it ([8e8474929](https://github.com/powerhouse-inc/powerhouse/commit/8e8474929))
- **release:** pass the just-published tag from release -> publish-ph-binaries ([dd19a9b20](https://github.com/powerhouse-inc/powerhouse/commit/dd19a9b20))

### ❤️ Thank You

- acaldas
- Benjamin Jordan

## 6.0.0-dev.239 (2026-05-11)

### 🚀 Features

- **ph-cmd:** added scripts to install dev and staging ph-cmd binary ([492555423](https://github.com/powerhouse-inc/powerhouse/commit/492555423))
- **switchboard:** bridge OpenTelemetry spans to Sentry ([c1f2fc28b](https://github.com/powerhouse-inc/powerhouse/commit/c1f2fc28b))
- **ph-cli,ph-cmd,shared:** use lightweight sentry sdk ([248c6b2f6](https://github.com/powerhouse-inc/powerhouse/commit/248c6b2f6))

### 🩹 Fixes

- update dockerfiles for pnpm 11 bin path ([d33db03ce](https://github.com/powerhouse-inc/powerhouse/commit/d33db03ce))
- **switchboard:** only enable tracing if a destination is configured ([8abff8020](https://github.com/powerhouse-inc/powerhouse/commit/8abff8020))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.238 (2026-05-11)

### 🚀 Features

- **switchboard:** bridge OpenTelemetry spans to Sentry ([c1f2fc28b](https://github.com/powerhouse-inc/powerhouse/commit/c1f2fc28b))
- **ph-cli,ph-cmd,shared:** use lightweight sentry sdk ([248c6b2f6](https://github.com/powerhouse-inc/powerhouse/commit/248c6b2f6))

### 🩹 Fixes

- update dockerfiles for pnpm 11 bin path ([d33db03ce](https://github.com/powerhouse-inc/powerhouse/commit/d33db03ce))
- **switchboard:** only enable tracing if a destination is configured ([8abff8020](https://github.com/powerhouse-inc/powerhouse/commit/8abff8020))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.237 (2026-05-10)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.236 (2026-05-09)

### 🚀 Features

- add download button ([#2586](https://github.com/powerhouse-inc/powerhouse/pull/2586))
- new test-sync-queue cli app that detects sync drift for large drives ([771352e08](https://github.com/powerhouse-inc/powerhouse/commit/771352e08))
- new test-sync-queue cli app that detects sync drift for large drives ([ddcd53f1e](https://github.com/powerhouse-inc/powerhouse/commit/ddcd53f1e))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.235 (2026-05-08)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.234 (2026-05-08)

### 🩹 Fixes

- **ci:** pnpm 11 reads PNPM_CONFIG_* not NPM_CONFIG_* ([b6c05fb23](https://github.com/powerhouse-inc/powerhouse/commit/b6c05fb23))
- **ci, docker:** pnpm 11 uses pnpm-workspace.yaml for allowBuilds; env var for min-release-age ([37c04c28a](https://github.com/powerhouse-inc/powerhouse/commit/37c04c28a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.233 (2026-05-08)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.232 (2026-05-07)

### 🩹 Fixes

- opt out of pnpm 11 minimum-release-age; fix docker/boilerplate strict-dep-builds ([75d31f3c6](https://github.com/powerhouse-inc/powerhouse/commit/75d31f3c6))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.231 (2026-05-07)

### 🩹 Fixes

- add pnpm workspace to boilerplate ([1b3a6e78c](https://github.com/powerhouse-inc/powerhouse/commit/1b3a6e78c))
- **ci:** pnpm v11 docker init + global bin path ([9d93dc20a](https://github.com/powerhouse-inc/powerhouse/commit/9d93dc20a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.230 (2026-05-07)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.229 (2026-05-07)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.228 (2026-05-07)

### 🚀 Features

- **connect,reactor-api:** set git hash at build time and display with url ([99b5233c7](https://github.com/powerhouse-inc/powerhouse/commit/99b5233c7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.227 (2026-05-07)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.226 (2026-05-06)

### 🚀 Features

- various mixed load scenarios for the lb ([6ef3a76bf](https://github.com/powerhouse-inc/powerhouse/commit/6ef3a76bf))

### 🩹 Fixes

- bump document-engineering to 1.40.3 and align zod pin ([d50e7e42c](https://github.com/powerhouse-inc/powerhouse/commit/d50e7e42c))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.225 (2026-05-06)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.224 (2026-05-06)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.223 (2026-05-06)

### 🚀 Features

- add json viewer for operations tooltip ([#2569](https://github.com/powerhouse-inc/powerhouse/pull/2569))

### 🩹 Fixes

- **release:** drop concurrency from publish-docker-images.yml ([#2572](https://github.com/powerhouse-inc/powerhouse/issues/2572))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.222 (2026-05-06)

### 🩹 Fixes

- **release:** retry git push with rebase + add workflow concurrency ([#2572](https://github.com/powerhouse-inc/powerhouse/pull/2572))

### ❤️ Thank You

- Frank @froid1911

## 6.0.0-dev.220 (2026-05-06)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.219 (2026-05-06)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.218 (2026-05-06)

### 🚀 Features

- **registry:** renown JWT auth in front of verdaccio ([e5bbf93f1](https://github.com/powerhouse-inc/powerhouse/commit/e5bbf93f1))

### ❤️ Thank You

- Frank

## 6.0.0-dev.217 (2026-05-06)

### 🚀 Features

- **switchboard-lb:** rewrite to use simpler drive-id header ([a442207d1](https://github.com/powerhouse-inc/powerhouse/commit/a442207d1))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.216 (2026-05-05)

### 🩹 Fixes

- **codegen,ph-cli,shared:** build package types with tsc ([a1a47e932](https://github.com/powerhouse-inc/powerhouse/commit/a1a47e932))
- **codegen,ph-cli,shared:** build package types with tsc ([f3658dddc](https://github.com/powerhouse-inc/powerhouse/commit/f3658dddc))

### ❤️ Thank You

- acaldas
- Copilot

## 6.0.0-dev.215 (2026-05-05)

### 🚀 Features

- make document cache usable with graphql client ([#2557](https://github.com/powerhouse-inc/powerhouse/pull/2557))

### 🩹 Fixes

- **ci:** pick docker tag matching branch channel ([1f6c5ba7c](https://github.com/powerhouse-inc/powerhouse/commit/1f6c5ba7c))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.214 (2026-05-05)

### 🚀 Features

- **switchboard:** adding pglite migration flag ([952075b11](https://github.com/powerhouse-inc/powerhouse/commit/952075b11))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.213 (2026-05-04)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.212 (2026-05-03)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.211 (2026-05-02)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.210 (2026-05-01)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.209 (2026-04-30)

### 🚀 Features

- **reactor-api:** added system subgraph which returns version and hash information ([248fc1e92](https://github.com/powerhouse-inc/powerhouse/commit/248fc1e92))
- initial switchboard endpoints and implementation ([01b20cede](https://github.com/powerhouse-inc/powerhouse/commit/01b20cede))

### 🩹 Fixes

- so much linting that it kills my computer ([d6b6ff143](https://github.com/powerhouse-inc/powerhouse/commit/d6b6ff143))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.208 (2026-04-29)

### 🚀 Features

- first swing at a load test ([f7e0f4456](https://github.com/powerhouse-inc/powerhouse/commit/f7e0f4456))
- added observability profile ([957af0925](https://github.com/powerhouse-inc/powerhouse/commit/957af0925))
- metrics integration ([1ce0b5fdf](https://github.com/powerhouse-inc/powerhouse/commit/1ce0b5fdf))
- switchboard-lb M3 ([cc49638e0](https://github.com/powerhouse-inc/powerhouse/commit/cc49638e0))
- **reactor-api:** added attachment service creation to reactor-api ([f96e9806b](https://github.com/powerhouse-inc/powerhouse/commit/f96e9806b))
- **reactor-attachments:** initial storage implementation ([b82e0fc8c](https://github.com/powerhouse-inc/powerhouse/commit/b82e0fc8c))
- **reactor-attachments:** initial setup of package ([ac5bac96a](https://github.com/powerhouse-inc/powerhouse/commit/ac5bac96a))

### 🩹 Fixes

- **reactor-attachments:** fix the tsdown config ([8485b54be](https://github.com/powerhouse-inc/powerhouse/commit/8485b54be))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.207 (2026-04-29)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.206 (2026-04-28)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.205 (2026-04-28)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.204 (2026-04-28)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.203 (2026-04-28)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.202 (2026-04-28)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.201 (2026-04-28)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.200 (2026-04-27)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.199 (2026-04-26)

### 🚀 Features

- **ph-cli:** add ph-clint and mastra dependencies ([a389b5bdd](https://github.com/powerhouse-inc/powerhouse/commit/a389b5bdd))

### ❤️ Thank You

- Frank

## 6.0.0-dev.198 (2026-04-26)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.197 (2026-04-25)

### 🩹 Fixes

- exclude pglite wasm and data files on ph build ([96eee628c](https://github.com/powerhouse-inc/powerhouse/commit/96eee628c))

### 🔥 Performance

- **design-system:** improve DocumentToolbar tree-shaking ([6d3bf98ad](https://github.com/powerhouse-inc/powerhouse/commit/6d3bf98ad))

### ❤️ Thank You

- acaldas
- Copilot

## 6.0.0-dev.196 (2026-04-24)

### 🚀 Features

- separate generate commands ([#2505](https://github.com/powerhouse-inc/powerhouse/pull/2505))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.195 (2026-04-24)

### 🚀 Features

- **codegen:** add sideEffects:false to generated package boilerplate ([844449485](https://github.com/powerhouse-inc/powerhouse/commit/844449485))
- **tree-shaking:** add sideEffects:false and lazy-load pglite ([92f8e988e](https://github.com/powerhouse-inc/powerhouse/commit/92f8e988e))

### 🩹 Fixes

- **registry:** downgrade express to v4 to fix package details page 404 ([40cd8a5d8](https://github.com/powerhouse-inc/powerhouse/commit/40cd8a5d8))
- outdated pnpm lock ([4a1f21903](https://github.com/powerhouse-inc/powerhouse/commit/4a1f21903))
- **common:** cleanup deps ([8602d77ba](https://github.com/powerhouse-inc/powerhouse/commit/8602d77ba))

### ❤️ Thank You

- acaldas
- Guillermo Puente @gpuente

## 6.0.0-dev.194 (2026-04-23)

### 🩹 Fixes

- **codegen:** updated dependencies list ([b4545f389](https://github.com/powerhouse-inc/powerhouse/commit/b4545f389))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.193 (2026-04-23)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.192 (2026-04-22)

### 🚀 Features

- update migrate command ([#2492](https://github.com/powerhouse-inc/powerhouse/pull/2492))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.191 (2026-04-22)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.190 (2026-04-22)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.189 (2026-04-22)

### 🚀 Features

- **lb:** the load balancer now pins through milestone 2 ([b928cfe04](https://github.com/powerhouse-inc/powerhouse/commit/b928cfe04))
- **lb:** wip on m1 features ([096384d5c](https://github.com/powerhouse-inc/powerhouse/commit/096384d5c))
- **switchboard-lb:** proxy upstream routes via least_conn (M1) ([5e3343b21](https://github.com/powerhouse-inc/powerhouse/commit/5e3343b21))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 4.7

## 6.0.0-dev.188 (2026-04-21)

### 🩹 Fixes

- **ph-cli:** pin @tsdown/css to match tsdown version ([961675548](https://github.com/powerhouse-inc/powerhouse/commit/961675548))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.187 (2026-04-21)

### 🩹 Fixes

- **ci:** install sentry-cli via official installer ([52a3b3fbd](https://github.com/powerhouse-inc/powerhouse/commit/52a3b3fbd))

### ❤️ Thank You

- Frank

## 6.0.0-dev.186 (2026-04-21)

### 🩹 Fixes

- **ci:** invoke sentry-cli via --package so npx resolves the binary ([21cf95abb](https://github.com/powerhouse-inc/powerhouse/commit/21cf95abb))

### ❤️ Thank You

- Frank

## 6.0.0-dev.185 (2026-04-21)

### 🚀 Features

- **sentry:** upload source maps + tag releases in CI ([46461b97e](https://github.com/powerhouse-inc/powerhouse/commit/46461b97e))

### ❤️ Thank You

- Frank

## 6.0.0-dev.184 (2026-04-21)

### 🚀 Features

- **cli:** opt-out Sentry error reporting for ph-cli and ph-cmd ([1f9c3be35](https://github.com/powerhouse-inc/powerhouse/commit/1f9c3be35))

### ❤️ Thank You

- Frank

## 6.0.0-dev.183 (2026-04-21)

### 🚀 Features

- reactor now attempts to migrate dbs from old versions ([92b2fdde9](https://github.com/powerhouse-inc/powerhouse/commit/92b2fdde9))
- step 1 of a switchboard load balancer ([618c32bfc](https://github.com/powerhouse-inc/powerhouse/commit/618c32bfc))
- **docker:** run connect nginx as non-root (H3) ([3120ba1c4](https://github.com/powerhouse-inc/powerhouse/commit/3120ba1c4))
- emit editor assets as hashed files via resolveNewUrlToAsset ([27f0ea69c](https://github.com/powerhouse-inc/powerhouse/commit/27f0ea69c))

### 🩹 Fixes

- **shared:** handle react imports in cjs deps ([78941ed7c](https://github.com/powerhouse-inc/powerhouse/commit/78941ed7c))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Frank
- Guillermo Puente @gpuente

## 6.0.0-dev.182 (2026-04-20)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.181 (2026-04-19)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.180 (2026-04-18)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.179 (2026-04-17)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.178 (2026-04-17)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.177 (2026-04-17)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.176 (2026-04-16)

### 🩹 Fixes

- update lockfile ([728604c16](https://github.com/powerhouse-inc/powerhouse/commit/728604c16))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.175 (2026-04-16)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.174 (2026-04-15)

### 🩹 Fixes

- **deps:** resolve all critical and high security vulnerabilities ([6a8531af3](https://github.com/powerhouse-inc/powerhouse/commit/6a8531af3))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.173 (2026-04-15)

### 🩹 Fixes

- **renown:** fix sleep listener leak, fix pre-existing test failures, add test script ([606e9f82e](https://github.com/powerhouse-inc/powerhouse/commit/606e9f82e))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.172 (2026-04-15)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.171 (2026-04-14)

### 🩹 Fixes

- **vetra:** generate manifest from global state in package generator ([f5de73f05](https://github.com/powerhouse-inc/powerhouse/commit/f5de73f05))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 6.0.0-dev.170 (2026-04-13)

### 🩹 Fixes

- declare react as peerDependency and dedupe on vite ([3444dab52](https://github.com/powerhouse-inc/powerhouse/commit/3444dab52))
- **reactor:** make registerModules and registerUpgradeManifests resilient to invalid items ([20b4dd6c6](https://github.com/powerhouse-inc/powerhouse/commit/20b4dd6c6))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.169 (2026-04-13)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.168 (2026-04-12)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.167 (2026-04-11)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.166 (2026-04-10)

### 🩹 Fixes

- **design-system,connect:** cleanup dependencies ([97466944a](https://github.com/powerhouse-inc/powerhouse/commit/97466944a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.165 (2026-04-10)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.164 (2026-04-09)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.163 (2026-04-09)

### 🩹 Fixes

- **switchboard:** set log level from env var ([eddc863e8](https://github.com/powerhouse-inc/powerhouse/commit/eddc863e8))
- **reactor-api,switchboard:** output https hooks on separate file ([9b05a45e9](https://github.com/powerhouse-inc/powerhouse/commit/9b05a45e9))
- **renown:** removed unused didtools/key-did dependency ([7771007c0](https://github.com/powerhouse-inc/powerhouse/commit/7771007c0))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.162 (2026-04-09)

### 🚀 Features

- **ph-cmd:** delegate init to versioned ph-cli ([875a4e6f4](https://github.com/powerhouse-inc/powerhouse/commit/875a4e6f4))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.161 (2026-04-08)

### 🩹 Fixes

- **connect:** prevent HMR page reloads and support hot module re-injection ([26c8c79b9](https://github.com/powerhouse-inc/powerhouse/commit/26c8c79b9))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.160 (2026-04-08)

### 🩹 Fixes

- **design-system:** fixed build and static assets ([fbcfd28d0](https://github.com/powerhouse-inc/powerhouse/commit/fbcfd28d0))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.159 (2026-04-07)

### 🩹 Fixes

- support both old and new switchboard dist layout in entrypoint ([80bfba241](https://github.com/powerhouse-inc/powerhouse/commit/80bfba241))

### ❤️ Thank You

- Frank

## 6.0.0-dev.158 (2026-04-07)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.157 (2026-04-06)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.156 (2026-04-05)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.155 (2026-04-04)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.154 (2026-04-03)

### 🩹 Fixes

- versioned docs need build artifacts ([d20b4db62](https://github.com/powerhouse-inc/powerhouse/commit/d20b4db62))
- add typecheck to simulate workflow ([76d4e606c](https://github.com/powerhouse-inc/powerhouse/commit/76d4e606c))
- lots of feedback, and added tsdown configs for 4 packages ([d847d8748](https://github.com/powerhouse-inc/powerhouse/commit/d847d8748))
- switching versioned-documents test to tsdown ([f9ade0d54](https://github.com/powerhouse-inc/powerhouse/commit/f9ade0d54))
- a few more build fixes ([b8b395f68](https://github.com/powerhouse-inc/powerhouse/commit/b8b395f68))
- remove outdated script ([2f194d576](https://github.com/powerhouse-inc/powerhouse/commit/2f194d576))
- a few fixes on the build workflow ([b6195242c](https://github.com/powerhouse-inc/powerhouse/commit/b6195242c))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.153 (2026-04-02)

### 🩹 Fixes

- **codegen:** moved tmpl/core to devDeps to avoid jsr install issues ([c322fbe60](https://github.com/powerhouse-inc/powerhouse/commit/c322fbe60))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.152 (2026-04-02)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.151 (2026-04-01)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.150 (2026-04-01)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.149 (2026-04-01)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.148 (2026-04-01)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.147 (2026-04-01)

### 🚀 Features

- unify package and manifest types ([#2458](https://github.com/powerhouse-inc/powerhouse/pull/2458))

### 🩹 Fixes

- format readme ([01011a461](https://github.com/powerhouse-inc/powerhouse/commit/01011a461))

### ❤️ Thank You

- acaldas
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.146 (2026-04-01)

### 🩹 Fixes

- **docker:** fix switchboard-entrypoint.sh ([18a4013d7](https://github.com/powerhouse-inc/powerhouse/commit/18a4013d7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.145 (2026-04-01)

### 🩹 Fixes

- **registry:** cache and resolve different package versions ([773d021a2](https://github.com/powerhouse-inc/powerhouse/commit/773d021a2))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.144 (2026-04-01)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.143 (2026-03-31)

### 🚀 Features

- **switchboard,reactor-api:** implemented httpPackageLoader ([ba53e2298](https://github.com/powerhouse-inc/powerhouse/commit/ba53e2298))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.142 (2026-03-31)

### 🩹 Fixes

- **docker:** use scoped registry for @powerhousedao instead of global override ([33d06b487](https://github.com/powerhouse-inc/powerhouse/commit/33d06b487))

### ❤️ Thank You

- Frank

## 6.0.0-dev.141 (2026-03-31)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.140 (2026-03-31)

### 🚀 Features

- **registry:** enable npm proxy uplink in Verdaccio ([405733914](https://github.com/powerhouse-inc/powerhouse/commit/405733914))

### 🩹 Fixes

- **docker:** use .npmrc for scoped registry config ([8568e3a20](https://github.com/powerhouse-inc/powerhouse/commit/8568e3a20))

### ❤️ Thank You

- Frank

## 6.0.0-dev.139 (2026-03-31)

### 🩹 Fixes

- **docker:** use scoped registry for @powerhousedao packages ([f7c8ff72c](https://github.com/powerhouse-inc/powerhouse/commit/f7c8ff72c))

### ❤️ Thank You

- Frank

## 6.0.0-dev.138 (2026-03-31)

### 🚀 Features

- **docker:** install PH_PACKAGES at switchboard startup ([c510da354](https://github.com/powerhouse-inc/powerhouse/commit/c510da354))
- **docker:** install PH_PACKAGES at switchboard startup ([fdf33e0aa](https://github.com/powerhouse-inc/powerhouse/commit/fdf33e0aa))

### ❤️ Thank You

- Frank

## 6.0.0-dev.137 (2026-03-31)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.136 (2026-03-31)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.135 (2026-03-31)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.134 (2026-03-31)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.133 (2026-03-31)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.132 (2026-03-31)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.131 (2026-03-31)

### 🚀 Features

- add separate node and browser processor bundles ([#2451](https://github.com/powerhouse-inc/powerhouse/pull/2451))

### ❤️ Thank You

- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.130 (2026-03-31)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.129 (2026-03-30)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.123 (2026-03-29)

### 🚀 Features

- **docker:** redesign Docker strategy with runtime package loading ([08207df3d](https://github.com/powerhouse-inc/powerhouse/commit/08207df3d))

### ❤️ Thank You

- Frank

## 6.0.0-dev.122 (2026-03-29)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.121 (2026-03-29)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.120 (2026-03-29)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.119 (2026-03-29)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.118 (2026-03-28)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.117 (2026-03-28)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.110 (2026-03-25)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.104 (2026-03-22)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.92 (2026-03-17)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.91 (2026-03-17)

### 🩹 Fixes

- adding build-bundle to simulate-ci-workflow ([ca93d1a2b](https://github.com/powerhouse-inc/powerhouse/commit/ca93d1a2b))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.90 (2026-03-14)

### 🩹 Fixes

- clear stale timeout in queueDepth observable callback ([61a89e9e0](https://github.com/powerhouse-inc/powerhouse/commit/61a89e9e0))
- add timeout to async queueDepth observable callback ([c9d505a71](https://github.com/powerhouse-inc/powerhouse/commit/c9d505a71))
- properly remove observable gauge callbacks on stop() ([35164b411](https://github.com/powerhouse-inc/powerhouse/commit/35164b411))
- remove remaining non-null assertions in registerObservableGauges ([05a0df1c7](https://github.com/powerhouse-inc/powerhouse/commit/05a0df1c7))
- address code review issues in opentelemetry-instrumentation-reactor ([72c751c67](https://github.com/powerhouse-inc/powerhouse/commit/72c751c67))

### ❤️ Thank You

- Samuel Hawksby-Robinson @Samyoul

## 6.0.0-dev.89 (2026-03-13)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.88 (2026-03-12)

### 🚀 Features

- reactor-hypercore example ([d5557973a](https://github.com/powerhouse-inc/powerhouse/commit/d5557973a))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.87 (2026-03-12)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.86 (2026-03-12)

### 🚀 Features

- **renown,reactor-browser:** renown integration improvements ([a65731a73](https://github.com/powerhouse-inc/powerhouse/commit/a65731a73))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.85 (2026-03-12)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.84 (2026-03-11)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.83 (2026-03-11)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.82 (2026-03-11)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.81 (2026-03-11)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.80 (2026-03-11)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.79 (2026-03-11)

### 🚀 Features

- **ci:** add gitops action for registry image updates ([ba91d00dd](https://github.com/powerhouse-inc/powerhouse/commit/ba91d00dd))

### ❤️ Thank You

- Frank

## 6.0.0-dev.78 (2026-03-11)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

## 6.0.0-dev.77 (2026-03-10)

### 🩹 Fixes

- **renown:** moved e2e script test to reactor-browser ([3c9b41045](https://github.com/powerhouse-inc/powerhouse/commit/3c9b41045))

### ❤️ Thank You

- acaldas @acaldas

## 6.0.0-dev.76 (2026-03-10)

This was a version bump only for @powerhousedao/opentelemetry-instrumentation-reactor to align it with other projects, there were no code changes.

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
