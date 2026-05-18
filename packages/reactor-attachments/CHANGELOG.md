## 6.0.0-dev.253 (2026-05-18)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.252 (2026-05-17)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.251 (2026-05-16)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.250 (2026-05-15)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.244 (2026-05-13)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.243 (2026-05-12)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

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

### ❤️ Thank You

- acaldas

## 6.0.0-dev.238 (2026-05-11)

### 🚀 Features

- **switchboard:** bridge OpenTelemetry spans to Sentry ([c1f2fc28b](https://github.com/powerhouse-inc/powerhouse/commit/c1f2fc28b))
- **ph-cli,ph-cmd,shared:** use lightweight sentry sdk ([248c6b2f6](https://github.com/powerhouse-inc/powerhouse/commit/248c6b2f6))

### 🩹 Fixes

- update dockerfiles for pnpm 11 bin path ([d33db03ce](https://github.com/powerhouse-inc/powerhouse/commit/d33db03ce))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.237 (2026-05-10)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.236 (2026-05-09)

### 🚀 Features

- add download button ([#2586](https://github.com/powerhouse-inc/powerhouse/pull/2586))
- new test-sync-queue cli app that detects sync drift for large drives ([771352e08](https://github.com/powerhouse-inc/powerhouse/commit/771352e08))
- new test-sync-queue cli app that detects sync drift for large drives ([ddcd53f1e](https://github.com/powerhouse-inc/powerhouse/commit/ddcd53f1e))

### ❤️ Thank You

- Benjamin Jordan
- Ryan Wolhuter @ryanwolhuter

## 6.0.0-dev.235 (2026-05-08)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.234 (2026-05-08)

### 🩹 Fixes

- **ci:** pnpm 11 reads PNPM_CONFIG_* not NPM_CONFIG_* ([b6c05fb23](https://github.com/powerhouse-inc/powerhouse/commit/b6c05fb23))
- **ci, docker:** pnpm 11 uses pnpm-workspace.yaml for allowBuilds; env var for min-release-age ([37c04c28a](https://github.com/powerhouse-inc/powerhouse/commit/37c04c28a))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.233 (2026-05-08)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.229 (2026-05-07)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.228 (2026-05-07)

### 🚀 Features

- **connect,reactor-api:** set git hash at build time and display with url ([99b5233c7](https://github.com/powerhouse-inc/powerhouse/commit/99b5233c7))

### ❤️ Thank You

- acaldas

## 6.0.0-dev.227 (2026-05-07)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.226 (2026-05-06)

### 🚀 Features

- various mixed load scenarios for the lb ([6ef3a76bf](https://github.com/powerhouse-inc/powerhouse/commit/6ef3a76bf))

### 🩹 Fixes

- bump document-engineering to 1.40.3 and align zod pin ([d50e7e42c](https://github.com/powerhouse-inc/powerhouse/commit/d50e7e42c))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente

## 6.0.0-dev.225 (2026-05-06)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.224 (2026-05-06)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.219 (2026-05-06)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.218 (2026-05-06)

### 🚀 Features

- **registry:** renown JWT auth in front of verdaccio ([e5bbf93f1](https://github.com/powerhouse-inc/powerhouse/commit/e5bbf93f1))

### ❤️ Thank You

- Frank

## 6.0.0-dev.217 (2026-05-06)

### 🚀 Features

- **switchboard-lb:** rewrite to use simpler drive-id header ([a442207d1](https://github.com/powerhouse-inc/powerhouse/commit/a442207d1))
- **reactor-attachments:** implementing HEAD, implementing soft-delete and fixing some indexing issues ([f1430bca4](https://github.com/powerhouse-inc/powerhouse/commit/f1430bca4))

### 🩹 Fixes

- **reactor-attachments:** switch to Attachment-Metadata instead of the X- prefix ([7ea3f120a](https://github.com/powerhouse-inc/powerhouse/commit/7ea3f120a))
- **reactor-attachments:** code-review feedback ([18cd49ab6](https://github.com/powerhouse-inc/powerhouse/commit/18cd49ab6))

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

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.212 (2026-05-03)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.211 (2026-05-02)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.210 (2026-05-01)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.0-dev.209 (2026-04-30)

### 🚀 Features

- **reactor-api:** added system subgraph which returns version and hash information ([248fc1e92](https://github.com/powerhouse-inc/powerhouse/commit/248fc1e92))
- **reactor-attachments:** switchboard implementation fixes ([3b320d01c](https://github.com/powerhouse-inc/powerhouse/commit/3b320d01c))
- initial switchboard endpoints and implementation ([01b20cede](https://github.com/powerhouse-inc/powerhouse/commit/01b20cede))

### 🩹 Fixes

- so much linting that it kills my computer ([d6b6ff143](https://github.com/powerhouse-inc/powerhouse/commit/d6b6ff143))
- **reactor-attachments:** force octet-stream content-type for remote uploads ([fc45afccb](https://github.com/powerhouse-inc/powerhouse/commit/fc45afccb))

### ❤️ Thank You

- Benjamin Jordan

## 6.0.0-dev.208 (2026-04-29)

### 🚀 Features

- first swing at a load test ([f7e0f4456](https://github.com/powerhouse-inc/powerhouse/commit/f7e0f4456))
- added observability profile ([957af0925](https://github.com/powerhouse-inc/powerhouse/commit/957af0925))
- metrics integration ([1ce0b5fdf](https://github.com/powerhouse-inc/powerhouse/commit/1ce0b5fdf))
- switchboard-lb M3 ([cc49638e0](https://github.com/powerhouse-inc/powerhouse/commit/cc49638e0))
- **reactor-api:** added attachment service creation to reactor-api ([f96e9806b](https://github.com/powerhouse-inc/powerhouse/commit/f96e9806b))
- **reactor-attachments:** added builder ([2f5b10c4b](https://github.com/powerhouse-inc/powerhouse/commit/2f5b10c4b))
- **reactor-attachments:** initial direct upload and switchboard transport implementations ([624579adc](https://github.com/powerhouse-inc/powerhouse/commit/624579adc))
- **reactor-attachments:** reservations ([f13680db1](https://github.com/powerhouse-inc/powerhouse/commit/f13680db1))
- **reactor-attachments:** initial storage implementation ([b82e0fc8c](https://github.com/powerhouse-inc/powerhouse/commit/b82e0fc8c))
- **reactor-attachments:** initial setup of package ([ac5bac96a](https://github.com/powerhouse-inc/powerhouse/commit/ac5bac96a))

### 🩹 Fixes

- **reactor-attachments:** fix the tsdown config ([8485b54be](https://github.com/powerhouse-inc/powerhouse/commit/8485b54be))

### ❤️ Thank You

- Benjamin Jordan