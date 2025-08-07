## 4.1.0-dev.10 (2025-08-07)

### 🚀 Features

- **builder-tools,codegen,design-system,reactor-api:** updated document-engineering version ([e74068b43](https://github.com/powerhouse-inc/powerhouse/commit/e74068b43))
- **document-drive:** added support for adding document by providing only document type ([7e093800d](https://github.com/powerhouse-inc/powerhouse/commit/7e093800d))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.9 (2025-08-07)

### 🩹 Fixes

- **document-drive:** schema failures on server tests ([be5472ada](https://github.com/powerhouse-inc/powerhouse/commit/be5472ada))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.8 (2025-08-06)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 4.1.0-dev.7 (2025-08-06)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.5 (2025-08-05)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 4.1.0-dev.4 (2025-08-02)

### 🚀 Features

- ts morph integration ([#1729](https://github.com/powerhouse-inc/powerhouse/pull/1729))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.3 (2025-08-01)

### 🚀 Features

- **reactor-mcp:** setup of modular reactor tools ([ceab98b08](https://github.com/powerhouse-inc/powerhouse/commit/ceab98b08))

### 🩹 Fixes

- linter errors from refactor ([11e8a1b16](https://github.com/powerhouse-inc/powerhouse/commit/11e8a1b16))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

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

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 4.0.0-staging.7 (2025-07-26)

### 🚀 Features

- **state:** make all atom states derivative ([68a4bfece](https://github.com/powerhouse-inc/powerhouse/commit/68a4bfece))
- **state,connect:** remove unused code ([323155126](https://github.com/powerhouse-inc/powerhouse/commit/323155126))

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
- **document-drive:** added fallbacks with deprecation warnings on legacy reactor methods ([0e10883cc](https://github.com/powerhouse-inc/powerhouse/commit/0e10883cc))
- **prisma:** updated prisma storage adapter ([1303a2395](https://github.com/powerhouse-inc/powerhouse/commit/1303a2395))
- updated remaining packages with new reactor api and bug fixes ([f8045faa1](https://github.com/powerhouse-inc/powerhouse/commit/f8045faa1))
- **document-drive:** updated browser and filesystem storage adapters ([7e98ab2e2](https://github.com/powerhouse-inc/powerhouse/commit/7e98ab2e2))
- sync new documents and push+pull api tests ([b81096640](https://github.com/powerhouse-inc/powerhouse/commit/b81096640))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** reimplement COPY_CHILD_DOCUMENT signal handler ([729bbba25](https://github.com/powerhouse-inc/powerhouse/commit/729bbba25))
- **document-drive:** implement storage unit getter in memory storage. Adde SyncManager unit tests ([b6ba106eb](https://github.com/powerhouse-inc/powerhouse/commit/b6ba106eb))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))
- **document-drive:** sync unit refactor ([c9efef89a](https://github.com/powerhouse-inc/powerhouse/commit/c9efef89a))
- **document-drive:** initial work on retrieving sync units from storage ([a81a8a4bf](https://github.com/powerhouse-inc/powerhouse/commit/a81a8a4bf))
- **document-drive:** removed document and sync units from drive document model ([c73b11c16](https://github.com/powerhouse-inc/powerhouse/commit/c73b11c16))
- use EventQueueManager by default ([0d367ea6a](https://github.com/powerhouse-inc/powerhouse/commit/0d367ea6a))
- **document-drive, document-model:** event-based queue manager and typed signal handler result ([52d42156c](https://github.com/powerhouse-inc/powerhouse/commit/52d42156c))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **document-drive:** fix regression when adding multiple operations ([3a8617e79](https://github.com/powerhouse-inc/powerhouse/commit/3a8617e79))
- **document-drive:** set documentType when queueing new document ([feccd16bd](https://github.com/powerhouse-inc/powerhouse/commit/feccd16bd))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))
- **document-drive,connect,common,reactor-browser:** reimplemented support for copy node action ([0e4da7a84](https://github.com/powerhouse-inc/powerhouse/commit/0e4da7a84))
- **document-drive,connect,common,reactor-api:** test fixes and interface improvements ([981b638bf](https://github.com/powerhouse-inc/powerhouse/commit/981b638bf))
- **document-drive:** delete document from parents when it's deleted ([a53c4093d](https://github.com/powerhouse-inc/powerhouse/commit/a53c4093d))
- **document-drive:** allow adding unsigned documents and fix prisma regressions ([5f96462aa](https://github.com/powerhouse-inc/powerhouse/commit/5f96462aa))
- **document-drive:** code fixes on tests ([5fdd4a095](https://github.com/powerhouse-inc/powerhouse/commit/5fdd4a095))
- update sync unit status for unchanged documents after first pull ([3220f69eb](https://github.com/powerhouse-inc/powerhouse/commit/3220f69eb))
- **document-drive:** fixed listener revisions handling ([84a13171b](https://github.com/powerhouse-inc/powerhouse/commit/84a13171b))

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
- **document-drive:** added fallbacks with deprecation warnings on legacy reactor methods ([0e10883cc](https://github.com/powerhouse-inc/powerhouse/commit/0e10883cc))
- **prisma:** updated prisma storage adapter ([1303a2395](https://github.com/powerhouse-inc/powerhouse/commit/1303a2395))
- updated remaining packages with new reactor api and bug fixes ([f8045faa1](https://github.com/powerhouse-inc/powerhouse/commit/f8045faa1))
- **document-drive:** updated browser and filesystem storage adapters ([7e98ab2e2](https://github.com/powerhouse-inc/powerhouse/commit/7e98ab2e2))
- sync new documents and push+pull api tests ([b81096640](https://github.com/powerhouse-inc/powerhouse/commit/b81096640))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** reimplement COPY_CHILD_DOCUMENT signal handler ([729bbba25](https://github.com/powerhouse-inc/powerhouse/commit/729bbba25))
- **document-drive:** implement storage unit getter in memory storage. Adde SyncManager unit tests ([b6ba106eb](https://github.com/powerhouse-inc/powerhouse/commit/b6ba106eb))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))
- **document-drive:** sync unit refactor ([c9efef89a](https://github.com/powerhouse-inc/powerhouse/commit/c9efef89a))
- **document-drive:** initial work on retrieving sync units from storage ([a81a8a4bf](https://github.com/powerhouse-inc/powerhouse/commit/a81a8a4bf))
- **document-drive:** removed document and sync units from drive document model ([c73b11c16](https://github.com/powerhouse-inc/powerhouse/commit/c73b11c16))
- use EventQueueManager by default ([0d367ea6a](https://github.com/powerhouse-inc/powerhouse/commit/0d367ea6a))
- **document-drive, document-model:** event-based queue manager and typed signal handler result ([52d42156c](https://github.com/powerhouse-inc/powerhouse/commit/52d42156c))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **document-drive:** fix regression when adding multiple operations ([bce76878e](https://github.com/powerhouse-inc/powerhouse/commit/bce76878e))
- **document-drive:** set documentType when queueing new document ([feccd16bd](https://github.com/powerhouse-inc/powerhouse/commit/feccd16bd))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))
- **document-drive,connect,common,reactor-browser:** reimplemented support for copy node action ([0e4da7a84](https://github.com/powerhouse-inc/powerhouse/commit/0e4da7a84))
- **document-drive,connect,common,reactor-api:** test fixes and interface improvements ([981b638bf](https://github.com/powerhouse-inc/powerhouse/commit/981b638bf))
- **document-drive:** delete document from parents when it's deleted ([a53c4093d](https://github.com/powerhouse-inc/powerhouse/commit/a53c4093d))
- **document-drive:** allow adding unsigned documents and fix prisma regressions ([5f96462aa](https://github.com/powerhouse-inc/powerhouse/commit/5f96462aa))
- **document-drive:** code fixes on tests ([5fdd4a095](https://github.com/powerhouse-inc/powerhouse/commit/5fdd4a095))
- update sync unit status for unchanged documents after first pull ([3220f69eb](https://github.com/powerhouse-inc/powerhouse/commit/3220f69eb))
- **document-drive:** fixed listener revisions handling ([84a13171b](https://github.com/powerhouse-inc/powerhouse/commit/84a13171b))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.18 (2025-07-24)

### 🩹 Fixes

- **document-drive:** fix regression when adding multiple operations ([3a8617e79](https://github.com/powerhouse-inc/powerhouse/commit/3a8617e79))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.17 (2025-07-23)

### 🩹 Fixes

- update release notes ([f1b6a8e71](https://github.com/powerhouse-inc/powerhouse/commit/f1b6a8e71))
- add release notes on correct branch ([a2d60a537](https://github.com/powerhouse-inc/powerhouse/commit/a2d60a537))

### ❤️ Thank You

- Callme-T

## 3.3.0-dev.16 (2025-07-22)

### 🩹 Fixes

- **common,document-drive,reactor-api,reactor-browser:** revert undefined return on getDocument methods ([fc145a82a](https://github.com/powerhouse-inc/powerhouse/commit/fc145a82a))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.15 (2025-07-17)

### 🩹 Fixes

- **codegen:** updated subgraph template to deal with undefined return on getDocument ([7b2862a91](https://github.com/powerhouse-inc/powerhouse/commit/7b2862a91))

### ❤️ Thank You

- acaldas

## 3.3.0-dev.14 (2025-07-17)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 3.3.0-dev.13 (2025-07-17)

### 🚀 Features

- **codegen,document-drive:** refactored relational processor namespace methods and updated related codegen templates ([00d4c4e87](https://github.com/powerhouse-inc/powerhouse/commit/00d4c4e87))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.12 (2025-07-17)

### 🚀 Features

- **reactor-api,reactor-browser,document-drive,codegen,connect:** operation to relationalDb renaming, relational db type improvements, added namespace methods to IRelationalDb ([fd35c3500](https://github.com/powerhouse-inc/powerhouse/commit/fd35c3500))

### 🩹 Fixes

- **document-drive:** use lowercase letters when hashing relational processor namespace ([87c7944d3](https://github.com/powerhouse-inc/powerhouse/commit/87c7944d3))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.11 (2025-07-16)

### 🚀 Features

- **document-drive,reactor-browser:** hash processor namespaces when writing and when querying from the relational db ([db817eeab](https://github.com/powerhouse-inc/powerhouse/commit/db817eeab))
- **document-drive,codegen:** updated operational processor factory ([39630bfd4](https://github.com/powerhouse-inc/powerhouse/commit/39630bfd4))
- **codegen,document-drive,reactor-api:** use namespaces per drive and operational processor ([9f2280929](https://github.com/powerhouse-inc/powerhouse/commit/9f2280929))
- **document-drive:** anticipate undefined return values for documents and drives ([9bd1bba7b](https://github.com/powerhouse-inc/powerhouse/commit/9bd1bba7b))

### 🩹 Fixes

- **document-drive,reactor-browser:** use underscore instead of dashes and update loading status when there is an error ([02720ab52](https://github.com/powerhouse-inc/powerhouse/commit/02720ab52))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.10 (2025-07-15)

### 🩹 Fixes

- **codegen:** remove sucrase dependency and update schema gen ([9d3efd2ec](https://github.com/powerhouse-inc/powerhouse/commit/9d3efd2ec))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.3.0-dev.9 (2025-07-10)

### 🩹 Fixes

- force release ([8185a3b37](https://github.com/powerhouse-inc/powerhouse/commit/8185a3b37))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.3.0-dev.8 (2025-07-10)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 3.3.0-dev.7 (2025-07-10)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 3.3.0-dev.6 (2025-07-10)

### 🚀 Features

- **codegen:** support loading migration typescript file ([d3cc1957b](https://github.com/powerhouse-inc/powerhouse/commit/d3cc1957b))

### 🩹 Fixes

- **document-drive:** return missing fields in document query ([ab00dc3c1](https://github.com/powerhouse-inc/powerhouse/commit/ab00dc3c1))
- **codegen,ph-cli:** make schema-file optional and updated generate help text ([adad303a8](https://github.com/powerhouse-inc/powerhouse/commit/adad303a8))

### ❤️ Thank You

- acaldas
- Guillermo Puente

## 3.3.0-dev.5 (2025-07-09)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 3.3.0-dev.4 (2025-07-09)

### 🚀 Features

- **codegen,ph-cli:** added generate schema command ([9a5e921fb](https://github.com/powerhouse-inc/powerhouse/commit/9a5e921fb))
- **document-drive:** initial work on BaseOperationalProcessor ([40fe0ec2f](https://github.com/powerhouse-inc/powerhouse/commit/40fe0ec2f))

### 🩹 Fixes

- **document-drive:** operational processor cleanup ([e6d0a96b6](https://github.com/powerhouse-inc/powerhouse/commit/e6d0a96b6))
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

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 3.3.0-dev.1 (2025-07-04)

### 🩹 Fixes

- **document-drive:** use async fs methods to avoid blocking the event loop ([795c486e4](https://github.com/powerhouse-inc/powerhouse/commit/795c486e4))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.0 (2025-07-02)

### 🚀 Features

- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))
- updating signing interfaces to connect document-model and connect packages ([e9b64ae77](https://github.com/powerhouse-inc/powerhouse/commit/e9b64ae77))
- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### 🩹 Fixes

- fix build ([c0cd6988d](https://github.com/powerhouse-inc/powerhouse/commit/c0cd6988d))
- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))
- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- vitest issue with timers ([0fe5a125d](https://github.com/powerhouse-inc/powerhouse/commit/0fe5a125d))
- linting issues ([e7bd4117d](https://github.com/powerhouse-inc/powerhouse/commit/e7bd4117d))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))
- graphql test fix now that id is on header ([6ccadb6c2](https://github.com/powerhouse-inc/powerhouse/commit/6ccadb6c2))
- fix issues with signature migration tests ([5477f0388](https://github.com/powerhouse-inc/powerhouse/commit/5477f0388))
- conflict resolution should be tested on all storage layers since this is an integration test ([b58142dd7](https://github.com/powerhouse-inc/powerhouse/commit/b58142dd7))
- prisma should use update instead of updateMany for operations ([de2e17992](https://github.com/powerhouse-inc/powerhouse/commit/de2e17992))
- test all storage adapters with drive operations ([ceb4e8288](https://github.com/powerhouse-inc/powerhouse/commit/ceb4e8288))
- massive type bug in core base-server where header and document were conflated ([1960e1b01](https://github.com/powerhouse-inc/powerhouse/commit/1960e1b01))
- a few more fixes for unit tests and making storage engines return the same stuff ([224535d66](https://github.com/powerhouse-inc/powerhouse/commit/224535d66))
- prisma had an issue with creation date ([c3e53354a](https://github.com/powerhouse-inc/powerhouse/commit/c3e53354a))
- fixing issue with header rebuilding ([5ac7b91d3](https://github.com/powerhouse-inc/powerhouse/commit/5ac7b91d3))
- refactor storage layer to save header appropriately ([eafd9b2b6](https://github.com/powerhouse-inc/powerhouse/commit/eafd9b2b6))
- export issues with header ([8f984d558](https://github.com/powerhouse-inc/powerhouse/commit/8f984d558))
- moving graphql transformations into a shared function so unit tests can reuse them ([68a380eba](https://github.com/powerhouse-inc/powerhouse/commit/68a380eba))
- adding some backward compat fixes for document model and document drive ([73d08a5b0](https://github.com/powerhouse-inc/powerhouse/commit/73d08a5b0))
- fixing document-drive tests, round 1 ([5316e4717](https://github.com/powerhouse-inc/powerhouse/commit/5316e4717))
- lots of refactoring for moving header and making id a signature ([5651159e6](https://github.com/powerhouse-inc/powerhouse/commit/5651159e6))

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

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 3.2.0-dev.7 (2025-06-28)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 3.2.0-dev.6 (2025-06-27)

### 🚀 Features

- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))
- updating signing interfaces to connect document-model and connect packages ([e9b64ae77](https://github.com/powerhouse-inc/powerhouse/commit/e9b64ae77))
- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### 🩹 Fixes

- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- vitest issue with timers ([0fe5a125d](https://github.com/powerhouse-inc/powerhouse/commit/0fe5a125d))
- linting issues ([e7bd4117d](https://github.com/powerhouse-inc/powerhouse/commit/e7bd4117d))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))
- graphql test fix now that id is on header ([6ccadb6c2](https://github.com/powerhouse-inc/powerhouse/commit/6ccadb6c2))
- fix issues with signature migration tests ([5477f0388](https://github.com/powerhouse-inc/powerhouse/commit/5477f0388))
- conflict resolution should be tested on all storage layers since this is an integration test ([b58142dd7](https://github.com/powerhouse-inc/powerhouse/commit/b58142dd7))
- prisma should use update instead of updateMany for operations ([de2e17992](https://github.com/powerhouse-inc/powerhouse/commit/de2e17992))
- test all storage adapters with drive operations ([ceb4e8288](https://github.com/powerhouse-inc/powerhouse/commit/ceb4e8288))
- massive type bug in core base-server where header and document were conflated ([1960e1b01](https://github.com/powerhouse-inc/powerhouse/commit/1960e1b01))
- a few more fixes for unit tests and making storage engines return the same stuff ([224535d66](https://github.com/powerhouse-inc/powerhouse/commit/224535d66))
- prisma had an issue with creation date ([c3e53354a](https://github.com/powerhouse-inc/powerhouse/commit/c3e53354a))
- fixing issue with header rebuilding ([5ac7b91d3](https://github.com/powerhouse-inc/powerhouse/commit/5ac7b91d3))
- refactor storage layer to save header appropriately ([eafd9b2b6](https://github.com/powerhouse-inc/powerhouse/commit/eafd9b2b6))
- export issues with header ([8f984d558](https://github.com/powerhouse-inc/powerhouse/commit/8f984d558))
- moving graphql transformations into a shared function so unit tests can reuse them ([68a380eba](https://github.com/powerhouse-inc/powerhouse/commit/68a380eba))
- adding some backward compat fixes for document model and document drive ([73d08a5b0](https://github.com/powerhouse-inc/powerhouse/commit/73d08a5b0))
- fixing document-drive tests, round 1 ([5316e4717](https://github.com/powerhouse-inc/powerhouse/commit/5316e4717))
- lots of refactoring for moving header and making id a signature ([5651159e6](https://github.com/powerhouse-inc/powerhouse/commit/5651159e6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente
- Guillermo Puente Sandoval
- ryanwolhuter

## 3.2.0-dev.5 (2025-06-26)

### 🚀 Features

- **common:** add atoms library ([dbc8e8b44](https://github.com/powerhouse-inc/powerhouse/commit/dbc8e8b44))

### 🩹 Fixes

- added new events for operations added ([7d89701b8](https://github.com/powerhouse-inc/powerhouse/commit/7d89701b8))
- **connect,codegen,common,reactor-browser:** fix analytics query subscription ([6e9729739](https://github.com/powerhouse-inc/powerhouse/commit/6e9729739))
- **document-drive:** safer check for document.slug ([15883aa34](https://github.com/powerhouse-inc/powerhouse/commit/15883aa34))
- adding id/slug resolution to document storage ([0c611fb1b](https://github.com/powerhouse-inc/powerhouse/commit/0c611fb1b))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente
- ryanwolhuter

## 3.2.0-dev.4 (2025-06-25)

### 🚀 Features

- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 3.2.0-dev.3 (2025-06-24)

### 🩹 Fixes

- moving prisma copy to prebuild so that build failure doesn't cause more build failure ([11df37b55](https://github.com/powerhouse-inc/powerhouse/commit/11df37b55))
- **connect, builder-tools:** disable external packages in dev mode ([e13243874](https://github.com/powerhouse-inc/powerhouse/commit/e13243874))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 3.2.0-dev.2 (2025-06-20)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

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

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.40 (2025-06-18)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.39 (2025-06-18)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.38 (2025-06-18)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.37 (2025-06-18)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.36 (2025-06-18)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.35 (2025-06-18)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.34 (2025-06-18)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.33 (2025-06-18)

### 🩹 Fixes

- deploy not on push to main ([63eef7020](https://github.com/powerhouse-inc/powerhouse/commit/63eef7020))
- deploy powerhouse to available environments ([a45859a22](https://github.com/powerhouse-inc/powerhouse/commit/a45859a22))

### ❤️ Thank You

- Frank

## 2.5.0-dev.32 (2025-06-18)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.31 (2025-06-18)

### 🚀 Features

- **reactor:** initial event-bus implementation with tests and benchmarks ([ef5b3c42e](https://github.com/powerhouse-inc/powerhouse/commit/ef5b3c42e))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 2.5.0-dev.30 (2025-06-17)

### 🩹 Fixes

- **connect:** set proper tag on docker build ([598c1b3fb](https://github.com/powerhouse-inc/powerhouse/commit/598c1b3fb))

### ❤️ Thank You

- Frank

## 2.5.0-dev.29 (2025-06-17)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.28 (2025-06-16)

### 🚀 Features

- add app skeleton to html at build time ([1882bb820](https://github.com/powerhouse-inc/powerhouse/commit/1882bb820))

### 🩹 Fixes

- **document-drive:** ensure valid slug assignment in BrowserStorage ([891df972a](https://github.com/powerhouse-inc/powerhouse/commit/891df972a))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 2.5.0-dev.27 (2025-06-16)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.26 (2025-06-16)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

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

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.22 (2025-06-13)

### 🩹 Fixes

- **ci:** set proper tags for docker images ([3cab91969](https://github.com/powerhouse-inc/powerhouse/commit/3cab91969))
- **ci:** connect deployment ([8ac8e423b](https://github.com/powerhouse-inc/powerhouse/commit/8ac8e423b))

### ❤️ Thank You

- Frank

## 2.5.0-dev.21 (2025-06-12)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.20 (2025-06-12)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.19 (2025-06-12)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.18 (2025-06-12)

### 🚀 Features

- added docker publish workflow ([adf65ef8a](https://github.com/powerhouse-inc/powerhouse/commit/adf65ef8a))

### ❤️ Thank You

- Frank

## 2.5.0-dev.17 (2025-06-12)

### 🚀 Features

- show app skeleton while loading and accessibility fixes ([4f96e2472](https://github.com/powerhouse-inc/powerhouse/commit/4f96e2472))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.16 (2025-06-11)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.15 (2025-06-11)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.14 (2025-06-10)

### 🚀 Features

- improved analytics frontend integration ([269aed50c](https://github.com/powerhouse-inc/powerhouse/commit/269aed50c))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.13 (2025-06-10)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.12 (2025-06-10)

### 🩹 Fixes

- **document-drive:** queue strands to be transmitted to internal transmitters to avoid concurrency issues ([685e84483](https://github.com/powerhouse-inc/powerhouse/commit/685e84483))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.11 (2025-06-07)

### 🚀 Features

- **connect:** updated diff-analyzer processor ([ce5d1219f](https://github.com/powerhouse-inc/powerhouse/commit/ce5d1219f))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.10 (2025-06-06)

### 🚀 Features

- run analytics db on web worker ([ecf79575f](https://github.com/powerhouse-inc/powerhouse/commit/ecf79575f))

### 🩹 Fixes

- **document-drive:** build internal transmitter updates without blocking the event loop ([01ec364b7](https://github.com/powerhouse-inc/powerhouse/commit/01ec364b7))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.9 (2025-06-05)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.8 (2025-06-05)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.7 (2025-06-05)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.6 (2025-06-05)

### 🩹 Fixes

- set node 22 in release branch workflow ([b33681938](https://github.com/powerhouse-inc/powerhouse/commit/b33681938))

### ❤️ Thank You

- Frank

## 2.5.0-dev.5 (2025-06-05)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.4 (2025-06-05)

### 🩹 Fixes

- **builder-tools:** move esbuild dev dep to deps ([baa22be6f](https://github.com/powerhouse-inc/powerhouse/commit/baa22be6f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.3 (2025-06-05)

### 🚀 Features

- **builder-tools:** add node polyfills esbuild plugin for connect build ([43dd16b4d](https://github.com/powerhouse-inc/powerhouse/commit/43dd16b4d))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.2 (2025-06-05)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.1 (2025-06-05)

This was a version bump only for document-drive to align it with other projects, there were no code changes.

## 2.5.0-dev.0 (2025-06-04)

### 🚀 Features

- **academy:** centralize husky & auto-update cli docs ([8c92e0bb1](https://github.com/powerhouse-inc/powerhouse/commit/8c92e0bb1))
- **document-drive:** made defaultDrives optional on reactor options ([566791c56](https://github.com/powerhouse-inc/powerhouse/commit/566791c56))
- **ph-cli:** added setup-service command ([dfa082aa6](https://github.com/powerhouse-inc/powerhouse/commit/dfa082aa6))
- **scripts:** updated setup scripts ([9f7fa7644](https://github.com/powerhouse-inc/powerhouse/commit/9f7fa7644))
- enforce conventional commits ([faa49da40](https://github.com/powerhouse-inc/powerhouse/commit/faa49da40))
- remove JWT handler on logout ([9c6c32015](https://github.com/powerhouse-inc/powerhouse/commit/9c6c32015))
- **document-drive:** use bearer token if handler is set ([dbdf025a8](https://github.com/powerhouse-inc/powerhouse/commit/dbdf025a8))
- **reactor:** added optional headers param to requestPublicDrive ([24f2aeab2](https://github.com/powerhouse-inc/powerhouse/commit/24f2aeab2))
- **reactor:** added auth headers for pull responder and switchboard push ([89ad3b111](https://github.com/powerhouse-inc/powerhouse/commit/89ad3b111))
- removed scalars package ([d6f7059a7](https://github.com/powerhouse-inc/powerhouse/commit/d6f7059a7))
- enabled switchboard command ([5a9c467bf](https://github.com/powerhouse-inc/powerhouse/commit/5a9c467bf))
- removed scalars dependencies ([596aedbd5](https://github.com/powerhouse-inc/powerhouse/commit/596aedbd5))
- **document-drive:** regenerated document drive model ([9819d8481](https://github.com/powerhouse-inc/powerhouse/commit/9819d8481))
- **builder-tools:** handle recursive objects in initial state generator ([c9eedcc43](https://github.com/powerhouse-inc/powerhouse/commit/c9eedcc43))
- **monorepo:** bump graphql lib ([ba9d5d338](https://github.com/powerhouse-inc/powerhouse/commit/ba9d5d338))
- **monorepo:** handle updating monorepo build deps ([db2ac2316](https://github.com/powerhouse-inc/powerhouse/commit/db2ac2316))
- **monorepo:** regenerate lockfile ([a6c390b4e](https://github.com/powerhouse-inc/powerhouse/commit/a6c390b4e))
- **builder-tools:** fix wrong value used for field id ([a6c6142e0](https://github.com/powerhouse-inc/powerhouse/commit/a6c6142e0))
- **reactor-api,reactor-local:** updated analytics dependencies ([cbeace573](https://github.com/powerhouse-inc/powerhouse/commit/cbeace573))

### 🩹 Fixes

- **academy:** lockfile issue second time' ([6208fe614](https://github.com/powerhouse-inc/powerhouse/commit/6208fe614))
- **academy:** fix frozen lockfile issue' ([80f18ec73](https://github.com/powerhouse-inc/powerhouse/commit/80f18ec73))
- **pre-commit:** use bash syntax and shebang ([da00ff581](https://github.com/powerhouse-inc/powerhouse/commit/da00ff581))
- added missing dep to academy ([4ec6c8278](https://github.com/powerhouse-inc/powerhouse/commit/4ec6c8278))
- **academy:** clean up husky script ([e18e26cd8](https://github.com/powerhouse-inc/powerhouse/commit/e18e26cd8))
- **switchboard:** docker build ([7052e39e1](https://github.com/powerhouse-inc/powerhouse/commit/7052e39e1))
- docker build with PH_PACKAGES ([856ac1187](https://github.com/powerhouse-inc/powerhouse/commit/856ac1187))
- **auth:** some error handling ([1b3d6a38d](https://github.com/powerhouse-inc/powerhouse/commit/1b3d6a38d))
- **connect, switchboard:** signing and verification issues ([3aa76e9e6](https://github.com/powerhouse-inc/powerhouse/commit/3aa76e9e6))
- **document-drive:** fixed fetchDocument graphql query ([b3fc988e8](https://github.com/powerhouse-inc/powerhouse/commit/b3fc988e8))
- **document-drive:** do not use read mode if no access level is set ([f8a3c0dcf](https://github.com/powerhouse-inc/powerhouse/commit/f8a3c0dcf))
- **document-drive:** fix type issue on browser storage ([240a78b41](https://github.com/powerhouse-inc/powerhouse/commit/240a78b41))
- **document-drive:** delete drive slug when drive is deleted ([fa1a05509](https://github.com/powerhouse-inc/powerhouse/commit/fa1a05509))
- **reactor-api,reactor-local,document-drive:** import processors from packages ([2c6054850](https://github.com/powerhouse-inc/powerhouse/commit/2c6054850))
- **ph-cli:** ph add does not remove installed packages ([aedfbf56e](https://github.com/powerhouse-inc/powerhouse/commit/aedfbf56e))
- remove .env and add to .gitignore ([0d2d48684](https://github.com/powerhouse-inc/powerhouse/commit/0d2d48684))
- **reactor:** all storage implementations should throw the same errors on document not found ([1c07564fc](https://github.com/powerhouse-inc/powerhouse/commit/1c07564fc))
- **switchboard,reactor-local:** latest version of sky atlas was not being installed ([72bf72fd4](https://github.com/powerhouse-inc/powerhouse/commit/72bf72fd4))
- **reactor:** sync should loop pulls while there is more data available ([ee016a3b5](https://github.com/powerhouse-inc/powerhouse/commit/ee016a3b5))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Callme-T
- Frank
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter

## 1.0.0-alpha.103 (2024-10-09)

### 🚀 Features

- **monorepo:** use latest version of pnpm ([5b60c6b5](https://github.com/powerhouse-inc/powerhouse/commit/5b60c6b5))
- **monorepo:** regenerate lockfile ([b4a469e5](https://github.com/powerhouse-inc/powerhouse/commit/b4a469e5))
- **monorepo:** regenerate lockfile ([0e277cec](https://github.com/powerhouse-inc/powerhouse/commit/0e277cec))
- **monorepo:** apply auto fix to updated files ([f8357f46](https://github.com/powerhouse-inc/powerhouse/commit/f8357f46))
- **monorepo:** apply lint fixes ([9803ac77](https://github.com/powerhouse-inc/powerhouse/commit/9803ac77))
- **monorepo:** update github workflows ([daec0ac6](https://github.com/powerhouse-inc/powerhouse/commit/daec0ac6))
- **monorepo:** migrate to unified configs ([693ce1a3](https://github.com/powerhouse-inc/powerhouse/commit/693ce1a3))
- **design-system:** rwa editor props and modals logic ([f0ab9f0f](https://github.com/powerhouse-inc/powerhouse/commit/f0ab9f0f))
- improved create script ([88b225f2](https://github.com/powerhouse-inc/powerhouse/commit/88b225f2))
- migrate eslint config ([#378](https://github.com/powerhouse-inc/powerhouse/pull/378))
- added Footer component ([38a1ffdf](https://github.com/powerhouse-inc/powerhouse/commit/38a1ffdf))
- display dates in tables in UTC + UTC label for date inputs ([dab0731b](https://github.com/powerhouse-inc/powerhouse/commit/dab0731b))
- added LoadingScreen Component ([440bb5df](https://github.com/powerhouse-inc/powerhouse/commit/440bb5df))
- update loader animation ([#344](https://github.com/powerhouse-inc/powerhouse/pull/344))
- switch to inline svgs ([#337](https://github.com/powerhouse-inc/powerhouse/pull/337))
- remove react aria ([#336](https://github.com/powerhouse-inc/powerhouse/pull/336))
- simplify tree view ([#332](https://github.com/powerhouse-inc/powerhouse/pull/332))
- use radix tooltip instead of react tooltip ([#329](https://github.com/powerhouse-inc/powerhouse/pull/329))
- revision history optimization ([#327](https://github.com/powerhouse-inc/powerhouse/pull/327))
- add rwa report file icon ([#321](https://github.com/powerhouse-inc/powerhouse/pull/321))
- add signature UI row component ([#310](https://github.com/powerhouse-inc/powerhouse/pull/310))
- bump react aria ([0e01efd3](https://github.com/powerhouse-inc/powerhouse/commit/0e01efd3))
- add filter transactions by asset ([#285](https://github.com/powerhouse-inc/powerhouse/pull/285))
- implement teep's feedback 2 ([#259](https://github.com/powerhouse-inc/powerhouse/pull/259))
- add other tab ([#251](https://github.com/powerhouse-inc/powerhouse/pull/251))
- implement teeps feedback ([#239](https://github.com/powerhouse-inc/powerhouse/pull/239))
- added connect toast ([5497ea7b](https://github.com/powerhouse-inc/powerhouse/commit/5497ea7b))
- added connect settings modal ([da943155](https://github.com/powerhouse-inc/powerhouse/commit/da943155))
- add chromatic ([#211](https://github.com/powerhouse-inc/powerhouse/pull/211))
- bump all to latest ([#197](https://github.com/powerhouse-inc/powerhouse/pull/197))
- update inputs to match schema ([#185](https://github.com/powerhouse-inc/powerhouse/pull/185))
- updated readme ([23dfa5c5](https://github.com/powerhouse-inc/powerhouse/commit/23dfa5c5))
- added asset details to fixed-income-assets-table ([bee2322b](https://github.com/powerhouse-inc/powerhouse/commit/bee2322b))
- added RWAAssetDetails components + table inputs components ([a5c92936](https://github.com/powerhouse-inc/powerhouse/commit/a5c92936))
- updated document drive dep ([78b82507](https://github.com/powerhouse-inc/powerhouse/commit/78b82507))
- added RWATable component ([7a36aabd](https://github.com/powerhouse-inc/powerhouse/commit/7a36aabd))
- added create asset modal + RWA base input components ([e0633983](https://github.com/powerhouse-inc/powerhouse/commit/e0633983))
- updated drive info request ([8d9f7ac4](https://github.com/powerhouse-inc/powerhouse/commit/8d9f7ac4))
- request public drive info ([a2be5b83](https://github.com/powerhouse-inc/powerhouse/commit/a2be5b83))
- 101 UI drive settings component ([#104](https://github.com/powerhouse-inc/powerhouse/pull/104))
- add new configs for typescript eslint ([#93](https://github.com/powerhouse-inc/powerhouse/pull/93))
- 75 drive status indicator local cloud available offline ([#92](https://github.com/powerhouse-inc/powerhouse/pull/92))
- add official tailwind prettier plugin ([#91](https://github.com/powerhouse-inc/powerhouse/pull/91))
- fixed dropItem export ([e9319cb2](https://github.com/powerhouse-inc/powerhouse/commit/e9319cb2))
- removed react-click-away-listener as peer dependency ([8ed92661](https://github.com/powerhouse-inc/powerhouse/commit/8ed92661))
- **tree-view-input:** 🚀 Added TreeViewInput Component ([bba0d1e1](https://github.com/powerhouse-inc/powerhouse/commit/bba0d1e1))
- **dropdown-menu:** 🚀 added DropdownMenu component ([aad28ad1](https://github.com/powerhouse-inc/powerhouse/commit/aad28ad1))
- added sidebar collapse animation ([9706446a](https://github.com/powerhouse-inc/powerhouse/commit/9706446a))
- **project-setup:** enabled commit lint ([0921ad4d](https://github.com/powerhouse-inc/powerhouse/commit/0921ad4d))
- added release workflow ([d3df37cd](https://github.com/powerhouse-inc/powerhouse/commit/d3df37cd))
- added jest setup + testing library ([8fb4f485](https://github.com/powerhouse-inc/powerhouse/commit/8fb4f485))
- added eslint setup ([e08b2266](https://github.com/powerhouse-inc/powerhouse/commit/e08b2266))
- added storybook setup ([45da43da](https://github.com/powerhouse-inc/powerhouse/commit/45da43da))

### 🩹 Fixes

- **monorepo:** try just release publish ([3a708dab](https://github.com/powerhouse-inc/powerhouse/commit/3a708dab))
- **monorepo:** remove skip publish ([3788d2c7](https://github.com/powerhouse-inc/powerhouse/commit/3788d2c7))
- **monorepo:** add install ignore scripts ([4f2832d6](https://github.com/powerhouse-inc/powerhouse/commit/4f2832d6))
- **monorepo:** fix command name ([d3e296e8](https://github.com/powerhouse-inc/powerhouse/commit/d3e296e8))
- **monorepo:** try build all ([42beb01c](https://github.com/powerhouse-inc/powerhouse/commit/42beb01c))
- **monorepo:** remove workspaces and package manager fields ([e0b53fef](https://github.com/powerhouse-inc/powerhouse/commit/e0b53fef))
- **monorepo:** try remove resolutions ([d8ed0db3](https://github.com/powerhouse-inc/powerhouse/commit/d8ed0db3))
- **monorepo:** try frozen lockfile ([ea788885](https://github.com/powerhouse-inc/powerhouse/commit/ea788885))
- **monorepo:** add missing dep ([28d487d7](https://github.com/powerhouse-inc/powerhouse/commit/28d487d7))
- fixed read required button not being enabled when scroll ends ([deed9f41](https://github.com/powerhouse-inc/powerhouse/commit/deed9f41))
- prevent revisions history scroll cutoff ([6ac1efdc](https://github.com/powerhouse-inc/powerhouse/commit/6ac1efdc))
- don't show selected file on fileItem path ([3bdb9eb2](https://github.com/powerhouse-inc/powerhouse/commit/3bdb9eb2))
- Storybook body styles ([dbe53e8a](https://github.com/powerhouse-inc/powerhouse/commit/dbe53e8a))
- sotorybook dep with yarn ([fc7970e8](https://github.com/powerhouse-inc/powerhouse/commit/fc7970e8))

### ❤️  Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

# 1.0.0 (2024-10-09)

### 🚀 Features

- **monorepo:** use latest version of pnpm ([5b60c6b5](https://github.com/powerhouse-inc/powerhouse/commit/5b60c6b5))
- **monorepo:** regenerate lockfile ([b4a469e5](https://github.com/powerhouse-inc/powerhouse/commit/b4a469e5))
- **monorepo:** regenerate lockfile ([0e277cec](https://github.com/powerhouse-inc/powerhouse/commit/0e277cec))
- **monorepo:** apply auto fix to updated files ([f8357f46](https://github.com/powerhouse-inc/powerhouse/commit/f8357f46))
- **monorepo:** apply lint fixes ([9803ac77](https://github.com/powerhouse-inc/powerhouse/commit/9803ac77))
- **monorepo:** update github workflows ([daec0ac6](https://github.com/powerhouse-inc/powerhouse/commit/daec0ac6))
- **monorepo:** migrate to unified configs ([693ce1a3](https://github.com/powerhouse-inc/powerhouse/commit/693ce1a3))
- **design-system:** rwa editor props and modals logic ([f0ab9f0f](https://github.com/powerhouse-inc/powerhouse/commit/f0ab9f0f))
- improved create script ([88b225f2](https://github.com/powerhouse-inc/powerhouse/commit/88b225f2))
- migrate eslint config ([#378](https://github.com/powerhouse-inc/powerhouse/pull/378))
- added Footer component ([38a1ffdf](https://github.com/powerhouse-inc/powerhouse/commit/38a1ffdf))
- display dates in tables in UTC + UTC label for date inputs ([dab0731b](https://github.com/powerhouse-inc/powerhouse/commit/dab0731b))
- added LoadingScreen Component ([440bb5df](https://github.com/powerhouse-inc/powerhouse/commit/440bb5df))
- update loader animation ([#344](https://github.com/powerhouse-inc/powerhouse/pull/344))
- switch to inline svgs ([#337](https://github.com/powerhouse-inc/powerhouse/pull/337))
- remove react aria ([#336](https://github.com/powerhouse-inc/powerhouse/pull/336))
- simplify tree view ([#332](https://github.com/powerhouse-inc/powerhouse/pull/332))
- use radix tooltip instead of react tooltip ([#329](https://github.com/powerhouse-inc/powerhouse/pull/329))
- revision history optimization ([#327](https://github.com/powerhouse-inc/powerhouse/pull/327))
- add rwa report file icon ([#321](https://github.com/powerhouse-inc/powerhouse/pull/321))
- add signature UI row component ([#310](https://github.com/powerhouse-inc/powerhouse/pull/310))
- bump react aria ([0e01efd3](https://github.com/powerhouse-inc/powerhouse/commit/0e01efd3))
- add filter transactions by asset ([#285](https://github.com/powerhouse-inc/powerhouse/pull/285))
- implement teep's feedback 2 ([#259](https://github.com/powerhouse-inc/powerhouse/pull/259))
- add other tab ([#251](https://github.com/powerhouse-inc/powerhouse/pull/251))
- implement teeps feedback ([#239](https://github.com/powerhouse-inc/powerhouse/pull/239))
- added connect toast ([5497ea7b](https://github.com/powerhouse-inc/powerhouse/commit/5497ea7b))
- added connect settings modal ([da943155](https://github.com/powerhouse-inc/powerhouse/commit/da943155))
- add chromatic ([#211](https://github.com/powerhouse-inc/powerhouse/pull/211))
- bump all to latest ([#197](https://github.com/powerhouse-inc/powerhouse/pull/197))
- update inputs to match schema ([#185](https://github.com/powerhouse-inc/powerhouse/pull/185))
- updated readme ([23dfa5c5](https://github.com/powerhouse-inc/powerhouse/commit/23dfa5c5))
- added asset details to fixed-income-assets-table ([bee2322b](https://github.com/powerhouse-inc/powerhouse/commit/bee2322b))
- added RWAAssetDetails components + table inputs components ([a5c92936](https://github.com/powerhouse-inc/powerhouse/commit/a5c92936))
- updated document drive dep ([78b82507](https://github.com/powerhouse-inc/powerhouse/commit/78b82507))
- added RWATable component ([7a36aabd](https://github.com/powerhouse-inc/powerhouse/commit/7a36aabd))
- added create asset modal + RWA base input components ([e0633983](https://github.com/powerhouse-inc/powerhouse/commit/e0633983))
- updated drive info request ([8d9f7ac4](https://github.com/powerhouse-inc/powerhouse/commit/8d9f7ac4))
- request public drive info ([a2be5b83](https://github.com/powerhouse-inc/powerhouse/commit/a2be5b83))
- 101 UI drive settings component ([#104](https://github.com/powerhouse-inc/powerhouse/pull/104))
- add new configs for typescript eslint ([#93](https://github.com/powerhouse-inc/powerhouse/pull/93))
- 75 drive status indicator local cloud available offline ([#92](https://github.com/powerhouse-inc/powerhouse/pull/92))
- add official tailwind prettier plugin ([#91](https://github.com/powerhouse-inc/powerhouse/pull/91))
- fixed dropItem export ([e9319cb2](https://github.com/powerhouse-inc/powerhouse/commit/e9319cb2))
- removed react-click-away-listener as peer dependency ([8ed92661](https://github.com/powerhouse-inc/powerhouse/commit/8ed92661))
- **tree-view-input:** 🚀 Added TreeViewInput Component ([bba0d1e1](https://github.com/powerhouse-inc/powerhouse/commit/bba0d1e1))
- **dropdown-menu:** 🚀 added DropdownMenu component ([aad28ad1](https://github.com/powerhouse-inc/powerhouse/commit/aad28ad1))
- added sidebar collapse animation ([9706446a](https://github.com/powerhouse-inc/powerhouse/commit/9706446a))
- **project-setup:** enabled commit lint ([0921ad4d](https://github.com/powerhouse-inc/powerhouse/commit/0921ad4d))
- added release workflow ([d3df37cd](https://github.com/powerhouse-inc/powerhouse/commit/d3df37cd))
- added jest setup + testing library ([8fb4f485](https://github.com/powerhouse-inc/powerhouse/commit/8fb4f485))
- added eslint setup ([e08b2266](https://github.com/powerhouse-inc/powerhouse/commit/e08b2266))
- added storybook setup ([45da43da](https://github.com/powerhouse-inc/powerhouse/commit/45da43da))

### 🩹 Fixes

- **monorepo:** try just release publish ([3a708dab](https://github.com/powerhouse-inc/powerhouse/commit/3a708dab))
- **monorepo:** remove skip publish ([3788d2c7](https://github.com/powerhouse-inc/powerhouse/commit/3788d2c7))
- **monorepo:** add install ignore scripts ([4f2832d6](https://github.com/powerhouse-inc/powerhouse/commit/4f2832d6))
- **monorepo:** fix command name ([d3e296e8](https://github.com/powerhouse-inc/powerhouse/commit/d3e296e8))
- **monorepo:** try build all ([42beb01c](https://github.com/powerhouse-inc/powerhouse/commit/42beb01c))
- **monorepo:** remove workspaces and package manager fields ([e0b53fef](https://github.com/powerhouse-inc/powerhouse/commit/e0b53fef))
- **monorepo:** try remove resolutions ([d8ed0db3](https://github.com/powerhouse-inc/powerhouse/commit/d8ed0db3))
- **monorepo:** try frozen lockfile ([ea788885](https://github.com/powerhouse-inc/powerhouse/commit/ea788885))
- **monorepo:** add missing dep ([28d487d7](https://github.com/powerhouse-inc/powerhouse/commit/28d487d7))
- fixed read required button not being enabled when scroll ends ([deed9f41](https://github.com/powerhouse-inc/powerhouse/commit/deed9f41))
- prevent revisions history scroll cutoff ([6ac1efdc](https://github.com/powerhouse-inc/powerhouse/commit/6ac1efdc))
- don't show selected file on fileItem path ([3bdb9eb2](https://github.com/powerhouse-inc/powerhouse/commit/3bdb9eb2))
- Storybook body styles ([dbe53e8a](https://github.com/powerhouse-inc/powerhouse/commit/dbe53e8a))
- sotorybook dep with yarn ([fc7970e8](https://github.com/powerhouse-inc/powerhouse/commit/fc7970e8))

### 🧱 Updated Dependencies

- Updated document-model-libs to 1.93.0

### ❤️  Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 1.0.0-alpha.102 (2024-10-03)


### 🚀 Features

- **document-drive:** update peer dependencies ([534bf37](https://github.com/powerhouse-inc/powerhouse/commit/534bf37))


### ❤️  Thank You

- acaldas @acaldas

## 1.0.0-alpha.101 (2024-10-03)


### 🚀 Features

-  **document-drive:** add support for dynamic document models and controlled ([e167334](https://github.com/powerhouse-inc/powerhouse/commit/e167334))


### 🩹 Fixes

- **document-drive:** disable unused eslint rules ([75fd5a5](https://github.com/powerhouse-inc/powerhouse/commit/75fd5a5))


### ❤️  Thank You

- acaldas @acaldas

## 1.0.0-alpha.100 (2024-09-30)


### 🚀 Features

- **document-drive:** initial package setup ([0595bd1](https://github.com/powerhouse-inc/powerhouse/commit/0595bd1))


### ❤️  Thank You

- Guillermo Puente @gpuente

# [1.0.0-alpha.99](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.98...v1.0.0-alpha.99) (2024-09-24)


### Features

* added detach strategy for old drives ([#305](https://github.com/powerhouse-inc/document-drive/issues/305)) ([a436492](https://github.com/powerhouse-inc/document-drive/commit/a4364925addaa031da91f5e678e49b29eebe0c32))

# [1.0.0-alpha.98](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.97...v1.0.0-alpha.98) (2024-09-20)


### Features

* added operation context on fetch document ([66fd645](https://github.com/powerhouse-inc/document-drive/commit/66fd6456d153d974e15513813368a3ab30f14a47))

# [1.0.0-alpha.97](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.96...v1.0.0-alpha.97) (2024-09-20)


### Features

* improved handling of graphql responses and type improvements ([aec6371](https://github.com/powerhouse-inc/document-drive/commit/aec63713ba4f95fc03cf044852a45b8083ae01d0))

# [1.0.0-alpha.96](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.95...v1.0.0-alpha.96) (2024-09-18)


### Bug Fixes

* fix browser storage document fix ([7c43b0f](https://github.com/powerhouse-inc/document-drive/commit/7c43b0fd7dafd7d1d56c171aa7b4e522a4743e51))

# [1.0.0-alpha.95](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.94...v1.0.0-alpha.95) (2024-09-18)


### Bug Fixes

* fixed browser storage document exists check ([3d513c0](https://github.com/powerhouse-inc/document-drive/commit/3d513c0d90b44fb25cce51c63f3359884aa1decf))

# [1.0.0-alpha.94](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.93...v1.0.0-alpha.94) (2024-09-12)


### Features

* improved handling of user access level on default drives ([d209944](https://github.com/powerhouse-inc/document-drive/commit/d20994483a1fcbbe8d79ea4110685fbe5ed2fac6))

# [1.0.0-alpha.93](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.92...v1.0.0-alpha.93) (2024-09-11)


### Features

* added support for read mode on default drives ([5d0d878](https://github.com/powerhouse-inc/document-drive/commit/5d0d87860283ff8de9dfd8114cb5be0b2eab6de1))
* build queries per document model ([02f3866](https://github.com/powerhouse-inc/document-drive/commit/02f3866744927b5243a72ac7ae92fdd7f25455b7))
* declared default drives interface ([ab5008d](https://github.com/powerhouse-inc/document-drive/commit/ab5008d6a02df1d332af54578adae47bdeedd33f))
* implemented read mode interface ([f2c1a4a](https://github.com/powerhouse-inc/document-drive/commit/f2c1a4a9b0e8b3bd70e2d18ba150c95ebf9f87d8))
* improved read mode code structure ([c3e9b82](https://github.com/powerhouse-inc/document-drive/commit/c3e9b82631dbccb1473234bc32517dfab38fbaba))
* return full documents on read mode and emit drives change event ([174d9d7](https://github.com/powerhouse-inc/document-drive/commit/174d9d751576d82e59d9d322b1e973ece6371de2))

# [1.0.0-alpha.92](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.91...v1.0.0-alpha.92) (2024-09-09)


### Bug Fixes

* fixed test timers ([05b12db](https://github.com/powerhouse-inc/document-drive/commit/05b12db865827436069c2266c61e29762068c6d4))


### Features

* added config support to set task queue method ([5575c60](https://github.com/powerhouse-inc/document-drive/commit/5575c60694dc0a41f839c78a00bcead9836325b9))
* added queueing to triggerUpdate ([809bf43](https://github.com/powerhouse-inc/document-drive/commit/809bf430f9cb00a4672fe1d24c20034cb475f2dc))
* handle old remote drives ([#284](https://github.com/powerhouse-inc/document-drive/issues/284)) ([562c5b2](https://github.com/powerhouse-inc/document-drive/commit/562c5b2248d8c73f2d887b30c82973c6004e3ee9))
* iterate through strands and queue macro tasks for performOperation ([1978899](https://github.com/powerhouse-inc/document-drive/commit/197889984e9a46d594275180b8407af3098986c4))
* remove env support from default-drives-manager ([a8f7aae](https://github.com/powerhouse-inc/document-drive/commit/a8f7aae4b22e8e44773bda3e3dd54338cc72f68a))
* updated document model dep ([c8b9dfb](https://github.com/powerhouse-inc/document-drive/commit/c8b9dfbb14296358f34d75789c14ee98e1be393b))
* use runAsap when processing jobs on the queue ([ac671aa](https://github.com/powerhouse-inc/document-drive/commit/ac671aa9acd9c07f087aa5ebe88c4faa1ab54c29))

# [1.0.0-alpha.91](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.90...v1.0.0-alpha.91) (2024-09-04)


### Features

* enable return error from getSyncStatus ([#292](https://github.com/powerhouse-inc/document-drive/issues/292)) ([fcd3508](https://github.com/powerhouse-inc/document-drive/commit/fcd3508b587f9a890e2ee967fca26fd37da4bf1b))

# [1.0.0-alpha.90](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.89...v1.0.0-alpha.90) (2024-09-04)


### Features

* remove default drives env config ([#291](https://github.com/powerhouse-inc/document-drive/issues/291)) ([dab49f7](https://github.com/powerhouse-inc/document-drive/commit/dab49f7fb3e99d8b8f76ddc223849b5a7a27c21f))

# [1.0.0-alpha.89](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.88...v1.0.0-alpha.89) (2024-09-03)


### Features

* handle default remote drives ([#277](https://github.com/powerhouse-inc/document-drive/issues/277)) ([2a0dddf](https://github.com/powerhouse-inc/document-drive/commit/2a0dddff7a7b1e4d16464ddfa5c9b3815efb4da5))
* handle old remote drives ([#284](https://github.com/powerhouse-inc/document-drive/issues/284)) ([87e304a](https://github.com/powerhouse-inc/document-drive/commit/87e304a3e346170c459cbe7e9536ffd8bad7a3a8))
* implemented sync unit status for push and pull operations ([#269](https://github.com/powerhouse-inc/document-drive/issues/269)) ([ea0138c](https://github.com/powerhouse-inc/document-drive/commit/ea0138c61a0b79466cdacfb64e7118537de58881))

# [1.0.0-alpha.88](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.87...v1.0.0-alpha.88) (2024-07-25)


### Features

* legacy signatures migration ([a90bb49](https://github.com/powerhouse-inc/document-drive/commit/a90bb4977c2e9012ca1377155c09b15561175b34))

# [1.0.0-alpha.87](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.86...v1.0.0-alpha.87) (2024-07-22)


### Features

* ignore document not found error on document check ([5ecdf4a](https://github.com/powerhouse-inc/document-drive/commit/5ecdf4af2d887ed2e5a7872608849cb6b4febf3b))

# [1.0.0-alpha.86](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.85...v1.0.0-alpha.86) (2024-07-18)


### Features

* updated dependencies ([d0de9c8](https://github.com/powerhouse-inc/document-drive/commit/d0de9c8fe164f46f4455cf0def21b9d1d5501a1f))

# [1.0.0-alpha.85](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.84...v1.0.0-alpha.85) (2024-07-18)


### Features

* improved queue and listener handling ([38453d4](https://github.com/powerhouse-inc/document-drive/commit/38453d4afd4737ce213cbbd9223902002197b516))

# [1.0.0-alpha.84](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.83...v1.0.0-alpha.84) (2024-07-11)


### Features

* added logging to error when adding drive jobs ([6175311](https://github.com/powerhouse-inc/document-drive/commit/61753112c16b8c21969147018cbc4c978feb7b87))

# [1.0.0-alpha.83](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.82...v1.0.0-alpha.83) (2024-07-08)

### Bug Fixes

-   ignore record does not exist error ([fe79163](https://github.com/powerhouse-inc/document-drive/commit/fe79163c141d2ea2ab66013749bd1545fa2393c9))

### Features

-   added expiry to redis cache ([2bec3a4](https://github.com/powerhouse-inc/document-drive/commit/2bec3a4e855536ca3e0a65902271fbf75dcf8bd5))

# [1.0.0-alpha.82](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.81...v1.0.0-alpha.82) (2024-07-05)

### Features

-   enabled clientStrandsError event ([#229](https://github.com/powerhouse-inc/document-drive/issues/229)) ([d887cdd](https://github.com/powerhouse-inc/document-drive/commit/d887cdd7424edebe63e311f95ebf0fbcb73c5929))

# [1.0.0-alpha.81](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.80...v1.0.0-alpha.81) (2024-07-05)

### Features

-   getResultingState before building document ([ad09a33](https://github.com/powerhouse-inc/document-drive/commit/ad09a3385853fcaedb93ec1c72ed40784f4f20d9))
-   improves getStrands performance by reusing drive state ([be56f3a](https://github.com/powerhouse-inc/document-drive/commit/be56f3ae54e45f5b1461f5392b76737f700843f2))

# [1.0.0-alpha.80](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.79...v1.0.0-alpha.80) (2024-06-27)

### Features

-   update strands query ([#217](https://github.com/powerhouse-inc/document-drive/issues/217)) ([0c849b8](https://github.com/powerhouse-inc/document-drive/commit/0c849b8c870a48a3bccb4d600d5ccca958242e68))

# [1.0.0-alpha.79](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.78...v1.0.0-alpha.79) (2024-06-24)

### Bug Fixes

-   do not store resulting state in cache ([f5ca275](https://github.com/powerhouse-inc/document-drive/commit/f5ca27549a1ef36cbb7600b47ae27e3d53a94c33))

# [1.0.0-alpha.78](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.77...v1.0.0-alpha.78) (2024-06-20)

### Features

-   prevent pushing strands when they come from the same url ([e92a207](https://github.com/powerhouse-inc/document-drive/commit/e92a20709f54917e4fe814368ed0b0fda5aa8528))

# [1.0.0-alpha.77](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.76...v1.0.0-alpha.77) (2024-06-19)

### Features

-   added readme ([50484e8](https://github.com/powerhouse-inc/document-drive/commit/50484e86b4e39d326893629ea0a4c5227afb1e63))

# [1.0.0-alpha.76](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.75...v1.0.0-alpha.76) (2024-06-19)

### Bug Fixes

-   added op id ([8652431](https://github.com/powerhouse-inc/document-drive/commit/86524310ce4234e94db3447d1777081d0351fa3e))

# [1.0.0-alpha.75](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.74...v1.0.0-alpha.75) (2024-06-18)

### Features

-   check if operations being added are already stored ([5de4d74](https://github.com/powerhouse-inc/document-drive/commit/5de4d7482e2e6fa60a4e2ca43734771ff501f4d6))

# [1.0.0-alpha.74](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.73...v1.0.0-alpha.74) (2024-06-12)

### Features

-   cleanup listeners when drive is removed ([7c33166](https://github.com/powerhouse-inc/document-drive/commit/7c33166141ee65d7776e5281be0e808bd8936563))

# [1.0.0-alpha.73](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.72...v1.0.0-alpha.73) (2024-06-10)

### Features

-   add storage method to fetch sync units revision ([aa9c16f](https://github.com/powerhouse-inc/document-drive/commit/aa9c16f6b8b90273dc6df007e806274fa2d30f76))
-   implemented getSynchronizationUnitsRevision ([4e8f899](https://github.com/powerhouse-inc/document-drive/commit/4e8f89919d1098dbb4376a9e3be137f581b565d2))
-   removed unnecessary sync units call on pullResponder ([972d2ec](https://github.com/powerhouse-inc/document-drive/commit/972d2ec15cf0f150a4e2b6e88a09e6df6cb7dbc7))
-   removed unnecessary sync units queries ([1c0d98f](https://github.com/powerhouse-inc/document-drive/commit/1c0d98f65dd0e7a52fbb7ad1ad394c256419dc68))

# [1.0.0-alpha.72](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.71...v1.0.0-alpha.72) (2024-06-07)

### Features

-   add sync status to file when add drive operations ([a6c5380](https://github.com/powerhouse-inc/document-drive/commit/a6c5380aafb383c467fc765ee2c2690bdc20cd7c))
-   added sync status to files when add document operations ([c89b02c](https://github.com/powerhouse-inc/document-drive/commit/c89b02c01c3589c725ffa700fbf38812ea700259))
-   remove related sync status when stopSyncRemoteDrive ([c6577e2](https://github.com/powerhouse-inc/document-drive/commit/c6577e2df3846f15248bacbc8b42f358949db3c8))
-   use syncId instead of documentId ([bd4073a](https://github.com/powerhouse-inc/document-drive/commit/bd4073a3d741e03bf99ae9651ef57c5192a1a204))

# [1.0.0-alpha.71](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.70...v1.0.0-alpha.71) (2024-06-07)

### Features

-   added queue actions implementations ([6741a59](https://github.com/powerhouse-inc/document-drive/commit/6741a59d191c5cdd1bfb253c3d5ee28d7f2a0779))
-   support operation and action jobs ([7e6c878](https://github.com/powerhouse-inc/document-drive/commit/7e6c878560ce3132d8dc1a71913a83ad5d138da9))

# [1.0.0-alpha.70](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.69...v1.0.0-alpha.70) (2024-06-07)

### Bug Fixes

-   slug caching ([1465ef0](https://github.com/powerhouse-inc/document-drive/commit/1465ef028d825ed2dfe50126c6dc64e8ba4445d5))
-   slug caching ([1134dc6](https://github.com/powerhouse-inc/document-drive/commit/1134dc6c1384648f6af5c871d0e51e6acb4e63fb))

# [1.0.0-alpha.69](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.68...v1.0.0-alpha.69) (2024-06-07)

### Bug Fixes

-   optimize get documents ([f6f13ab](https://github.com/powerhouse-inc/document-drive/commit/f6f13abb65d8c34a7ba64787fa4ae4ee024956fa))

# [1.0.0-alpha.68](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.67...v1.0.0-alpha.68) (2024-06-04)

### Bug Fixes

-   redis queue ([e99d1b9](https://github.com/powerhouse-inc/document-drive/commit/e99d1b9f0c704836cc0752e36e0f905dc192e5e1))

# [1.0.0-alpha.67](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.66...v1.0.0-alpha.67) (2024-06-04)

### Features

-   get operations from cache on storage ([8416464](https://github.com/powerhouse-inc/document-drive/commit/84164646609045b2cd8e9e8747e364c746d9e3ec))

# [1.0.0-alpha.66](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.65...v1.0.0-alpha.66) (2024-06-03)

### Features

-   updated libs ([5e47758](https://github.com/powerhouse-inc/document-drive/commit/5e477580524a1defd92dd0bef9b160e182436ec9))

# [1.0.0-alpha.65](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.64...v1.0.0-alpha.65) (2024-05-30)

### Features

-   fetch resulting state for last unskipped operation ([8297353](https://github.com/powerhouse-inc/document-drive/commit/8297353dc8eaca107d8134580dee67c3265b05b5))

# [1.0.0-alpha.64](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.63...v1.0.0-alpha.64) (2024-05-30)

### Features

-   update document-model lib version ([#180](https://github.com/powerhouse-inc/document-drive/issues/180)) ([83cec58](https://github.com/powerhouse-inc/document-drive/commit/83cec58cb02388a3b2a643dd5af6c31cd850242d))

# [1.0.0-alpha.63](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.62...v1.0.0-alpha.63) (2024-05-30)

### Bug Fixes

-   operations query ([8dd11c7](https://github.com/powerhouse-inc/document-drive/commit/8dd11c72058452f3e8febac472d01ad56d959e17))

# [1.0.0-alpha.62](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.61...v1.0.0-alpha.62) (2024-05-30)

### Bug Fixes

-   added drive and documentId filter ([718405f](https://github.com/powerhouse-inc/document-drive/commit/718405febbe8e53a3fd392cdd4acf2b041347eaf))

# [1.0.0-alpha.61](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.60...v1.0.0-alpha.61) (2024-05-30)

### Features

-   store resulting state as bytes and only retrieve state for last op of each scope ([c6a5004](https://github.com/powerhouse-inc/document-drive/commit/c6a5004a3dd07ee1ce2f5521bb7a6aa5e970465e))

# [1.0.0-alpha.60](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.59...v1.0.0-alpha.60) (2024-05-29)

### Features

-   avoid duplicated getDocument call ([c0684bc](https://github.com/powerhouse-inc/document-drive/commit/c0684bc0746d8bafb9393cdaeebfb60b38a8a32f))

# [1.0.0-alpha.59](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.58...v1.0.0-alpha.59) (2024-05-28)

### Features

-   enable operation id ([#174](https://github.com/powerhouse-inc/document-drive/issues/174)) ([1d77fd2](https://github.com/powerhouse-inc/document-drive/commit/1d77fd2f6a4618371c6fc4c072d4eab7d27a662a))

# [1.0.0-alpha.58](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.57...v1.0.0-alpha.58) (2024-05-28)

### Features

-   don't save queue job result ([efbf239](https://github.com/powerhouse-inc/document-drive/commit/efbf239e5f77592267446d5c11d670a82f1f6e58))

# [1.0.0-alpha.57](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.56...v1.0.0-alpha.57) (2024-05-22)

### Features

-   new release ([17796e8](https://github.com/powerhouse-inc/document-drive/commit/17796e8577d16d3095a8adf3c40e7bd7146b6142))

# [1.0.0-alpha.56](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.55...v1.0.0-alpha.56) (2024-05-22)

### Features

-   add queues and append only conflict resolution ([d17abd6](https://github.com/powerhouse-inc/document-drive/commit/d17abd664a7381f80faa6530f83ca9e224282ba1)), closes [#153](https://github.com/powerhouse-inc/document-drive/issues/153)

# 1.0.0-experimental.1 (2024-05-15)

### Bug Fixes

-   acknowledge porper document ([c7abd01](https://github.com/powerhouse-inc/document-drive/commit/c7abd0138346b2482546a7a731b22be3e61c8ccd))
-   add exports ([#157](https://github.com/powerhouse-inc/document-drive/issues/157)) ([1c74344](https://github.com/powerhouse-inc/document-drive/commit/1c74344f225aa0dc12b06603937c137b6be2afe7))
-   added exports ([04958fb](https://github.com/powerhouse-inc/document-drive/commit/04958fb7c6595bc5e700196e481c4746e6702301))
-   added name field to getDocument ([2cba21a](https://github.com/powerhouse-inc/document-drive/commit/2cba21aa6c4efcde50d8524f46dd22804b96f7d0))
-   apply auto lint ([803cf91](https://github.com/powerhouse-inc/document-drive/commit/803cf91b3c427dd9c6b1ef9a76c92a4cfa480fbd))
-   cast result of json parse ([83ee12b](https://github.com/powerhouse-inc/document-drive/commit/83ee12be711c74047eb7a4a86e235b7ab16e0a69))
-   delete drive handling ([6547274](https://github.com/powerhouse-inc/document-drive/commit/6547274d4ebe02e737aa429699af39fbabe2184b))
-   duplicate driv entry ([c89c27e](https://github.com/powerhouse-inc/document-drive/commit/c89c27e892a2b1d345cf5b28b00722f3cef88228))
-   generate drive Id if empty string ([9c5044c](https://github.com/powerhouse-inc/document-drive/commit/9c5044cb21b9f311b999ab60612e8e61991d0dad))
-   handle signals in sequence ([9660b08](https://github.com/powerhouse-inc/document-drive/commit/9660b089e554e570ff6312645b799e1af9e09596))
-   missing operations in return values ([6d6cf56](https://github.com/powerhouse-inc/document-drive/commit/6d6cf56426d75b41aad1df0e8735e2a3dcc34221))
-   operation data filter ([0e91f21](https://github.com/powerhouse-inc/document-drive/commit/0e91f2110a5942404b864199af8ebabd00112dea))
-   prisma schema ([bac17dd](https://github.com/powerhouse-inc/document-drive/commit/bac17ddd305788252529706c0c2e8b2207c64838))
-   queue actions ([8a9f3c0](https://github.com/powerhouse-inc/document-drive/commit/8a9f3c0ed0ff78fcebf3630ca3c3b64c245a3baf))
-   remove react settings ([6e11865](https://github.com/powerhouse-inc/document-drive/commit/6e1186575de9a457add141fc916d6ea78fd066d5))
-   remove sentry ([75faf6a](https://github.com/powerhouse-inc/document-drive/commit/75faf6acff391bb2f5fac016190a481019a225ee))
-   reverse since change ([3e09362](https://github.com/powerhouse-inc/document-drive/commit/3e093623ca2f315e7faebeee3b3f3fc42bad083b))
-   semantic release ([94077da](https://github.com/powerhouse-inc/document-drive/commit/94077da1f383ee2bf1530af9a4f2749cbc8d4e89))
-   transmitter not found ([0fac28b](https://github.com/powerhouse-inc/document-drive/commit/0fac28b6f3de37b13899075c88fd37a9ce355013))
-   types ([37ebeca](https://github.com/powerhouse-inc/document-drive/commit/37ebeca0ff18a8f60c4604ace6ba17bad730f4cb))
-   update revision field if new operations are added ([45eb259](https://github.com/powerhouse-inc/document-drive/commit/45eb259b479655dde575835ce5c1aa6ad68a94f1))
-   wording issues ([fcbb994](https://github.com/powerhouse-inc/document-drive/commit/fcbb994d49eb035cdb9e553b104b6c8279b7fbef))

### Features

-   add ts-reset lib ([760c3fb](https://github.com/powerhouse-inc/document-drive/commit/760c3fbe685775be506835a1975541539c8fb862))
-   add unique constraint on operation index ([b058834](https://github.com/powerhouse-inc/document-drive/commit/b058834a8b48c2f6db971427e9633a91141c1079))
-   added .env.example ([c781094](https://github.com/powerhouse-inc/document-drive/commit/c781094ad7f7312efeee3e94695e809c5d4c6722))
-   added acknowledge function to pull responder ([e72a721](https://github.com/powerhouse-inc/document-drive/commit/e72a721713bb947b0ba93be1c38797e209865e5c))
-   added addAction methods and addInternalListener ([9a076b3](https://github.com/powerhouse-inc/document-drive/commit/9a076b3155060825d442351a2cd36d935a17ca44))
-   added basic implementation of push and pull transmitter ([1ffb004](https://github.com/powerhouse-inc/document-drive/commit/1ffb00443bf442a17e545f2451e9b399edfcc0d3))
-   added basic push strands implementatioN ([c858b75](https://github.com/powerhouse-inc/document-drive/commit/c858b7544365429ce4535a6c849cf785a5cafcd5))
-   added basic transmitters ([996ff0f](https://github.com/powerhouse-inc/document-drive/commit/996ff0f0c7ea212f1ed96ebc05690d0689bf3429))
-   added clearStorage support ([#82](https://github.com/powerhouse-inc/document-drive/issues/82)) ([323a93f](https://github.com/powerhouse-inc/document-drive/commit/323a93f0aaf1da1bd66b3b3292e35aefd92e9c5f))
-   added clipboard flag to operations table ([f6ce677](https://github.com/powerhouse-inc/document-drive/commit/f6ce677b5e3d723074a40bb834f4029cd1c13b9a))
-   added clipboard to document ([3f8c295](https://github.com/powerhouse-inc/document-drive/commit/3f8c29573cbd08f071492b56f4b31f688af7c9db))
-   added debug and trace methods and logger export ([c7336de](https://github.com/powerhouse-inc/document-drive/commit/c7336de1f4b0e55a4c8d4e5efe5b063c7a4ccc88))
-   added document cache ([deae523](https://github.com/powerhouse-inc/document-drive/commit/deae523851b98fcd250825a4b2918b364525660f))
-   added drive events and improved sync error handling ([647c833](https://github.com/powerhouse-inc/document-drive/commit/647c8339b2166767c240a286d9ea12b032695417))
-   added duplicate folders id tests ([#143](https://github.com/powerhouse-inc/document-drive/issues/143)) ([abd3688](https://github.com/powerhouse-inc/document-drive/commit/abd3688bb284257a8f088e905e1f7cf6de1f8f5d))
-   added experimental release ([#155](https://github.com/powerhouse-inc/document-drive/issues/155)) ([adc52a5](https://github.com/powerhouse-inc/document-drive/commit/adc52a56655ef97de588cb03b6922ab69e72a8e9))
-   added exponential retry backoff to prisma transactions ([b38e72f](https://github.com/powerhouse-inc/document-drive/commit/b38e72fdfd29f4c39e15f606fccc942ec966fffe))
-   added getDrive by slug to memory adapter ([5515c34](https://github.com/powerhouse-inc/document-drive/commit/5515c34ecc18a6f14931a1a66cee454f14dbe03f))
-   added getDriveBySlug ([680cf71](https://github.com/powerhouse-inc/document-drive/commit/680cf71209853689e1414f90f58f079460be94d5))
-   added graphql requests for pull responder ([6578bae](https://github.com/powerhouse-inc/document-drive/commit/6578bae242a0c625531ac8b9bdec4c51727f57e6))
-   added init of pullResponder ([3961916](https://github.com/powerhouse-inc/document-drive/commit/3961916bbb780c0555d3d7e106ab25c80e988c7b))
-   added internal transmitter ([d728aed](https://github.com/powerhouse-inc/document-drive/commit/d728aed8ae692a83a0b998ccd6d7e36496e08b95))
-   added internal transmitter service ([6863620](https://github.com/powerhouse-inc/document-drive/commit/68636202d5bfd081ef979263fd697086529a1d10))
-   added listener functions ([6bc1803](https://github.com/powerhouse-inc/document-drive/commit/6bc180358826adf8a0ce6f247df37d8de245d8e7))
-   added missing forceSync param ([04cd42c](https://github.com/powerhouse-inc/document-drive/commit/04cd42c5cc1f173dd04e362fde7ba2e592142d62))
-   added namespace option for browser storage ([2fb312a](https://github.com/powerhouse-inc/document-drive/commit/2fb312a020d6593157c401814e0327d260f64718))
-   added operation queues with memory and redis adapters ([#139](https://github.com/powerhouse-inc/document-drive/issues/139)) ([df54c4a](https://github.com/powerhouse-inc/document-drive/commit/df54c4a0ab069d0bc96cd0988967dc421c332668)), closes [#154](https://github.com/powerhouse-inc/document-drive/issues/154)
-   added prisma connection ([ef87ca7](https://github.com/powerhouse-inc/document-drive/commit/ef87ca7681c4336a68f15ecf35906cdfc9c8aa0a))
-   added registerListener function to PullResponderTransmitter ([814c160](https://github.com/powerhouse-inc/document-drive/commit/814c1603ef011402db30f373c3b5fbb2d3f12c58))
-   added retry mechanism to transaction ([e01a2cb](https://github.com/powerhouse-inc/document-drive/commit/e01a2cb6e1c64d37655255191fc4af13254201fe))
-   added semantic release ([f1c31a6](https://github.com/powerhouse-inc/document-drive/commit/f1c31a6bd2012ac6d51a7a3a5b94f656887e6b5a))
-   added sequelize adapter ([#19](https://github.com/powerhouse-inc/document-drive/issues/19)) ([71529d8](https://github.com/powerhouse-inc/document-drive/commit/71529d8d60eb6ff0390bdebb1bb660fb680c99f3))
-   added strandUpdate events ([1143716](https://github.com/powerhouse-inc/document-drive/commit/11437161fd1b0b0f37a7ef50833022507e4699f3))
-   added support for update noop operations ([#42](https://github.com/powerhouse-inc/document-drive/issues/42)) ([c59e15a](https://github.com/powerhouse-inc/document-drive/commit/c59e15a69f08f2abe654ce15c090f1212aee7606))
-   added update operations in prisma storage addDocumentOperations ([#71](https://github.com/powerhouse-inc/document-drive/issues/71)) ([eeb96af](https://github.com/powerhouse-inc/document-drive/commit/eeb96afbad520f90ce8c9b71bf573950dadadf4b))
-   added winston as default logger ([77c2451](https://github.com/powerhouse-inc/document-drive/commit/77c2451e4ceaddb11dd378a89f89c4245db51cb0))
-   also transmit scope state on internal transmitters ([c75a5d5](https://github.com/powerhouse-inc/document-drive/commit/c75a5d5b01ddaf166f0d86cd0afab4f888757a17))
-   avoid duplicating sync units on listener manager ([ad9a015](https://github.com/powerhouse-inc/document-drive/commit/ad9a015d8b50ba444362b85b1f57b9349037c325))
-   bug fixing ([1bb6097](https://github.com/powerhouse-inc/document-drive/commit/1bb60972588b5b95d2bb52354d8b35319d21eed5))
-   bump document-model dep ([7442070](https://github.com/powerhouse-inc/document-drive/commit/744207006dad191e214f0547d78d185530476560))
-   bump libs ([8b18624](https://github.com/powerhouse-inc/document-drive/commit/8b18624c05792d086b31a0b42b99cf42f3dc0627))
-   bump lint deps ([c4a68c9](https://github.com/powerhouse-inc/document-drive/commit/c4a68c9d1c8fea85d85d18eebf66a53d57438dbd))
-   cache updated document as soon as possible ([0b3327c](https://github.com/powerhouse-inc/document-drive/commit/0b3327cea01b508e0c07f05dee7fdcb4a6aaea35))
-   change unimportant rules to warn ([3958150](https://github.com/powerhouse-inc/document-drive/commit/395815033e8fe5e937342b5b2ba1d57ba64cbc8d))
-   check if there are conflicting operations when storing operations ([2487ab1](https://github.com/powerhouse-inc/document-drive/commit/2487ab10017ab819c560a115409829027dad9fda))
-   continue initializing remaining drives if one fails ([5cd9962](https://github.com/powerhouse-inc/document-drive/commit/5cd9962785e399aa5eb06f2b87a97fed72b51178))
-   defined types and functions ([0b57ae9](https://github.com/powerhouse-inc/document-drive/commit/0b57ae969f023f06ffc4859d1f8f514ef7a2508f))
-   delay sync updates after receiving strands ([e1d3a87](https://github.com/powerhouse-inc/document-drive/commit/e1d3a871a99042d397b7c7928432028251fba55d))
-   delete sync units before removing document ([6b54e1d](https://github.com/powerhouse-inc/document-drive/commit/6b54e1dfb7249c0c6e061e916783ac92cb5d1481))
-   do not consider already skipped operations when adding operations to document ([0778863](https://github.com/powerhouse-inc/document-drive/commit/077886351a1dbde484331a30778fa4daf12cf2a2))
-   don't send operation with index equal to fromRevision ([f279046](https://github.com/powerhouse-inc/document-drive/commit/f279046f156c3b9c35c1c7cdd950319078f09e04))
-   emit missing operation error ([8250681](https://github.com/powerhouse-inc/document-drive/commit/82506819148565aa6a7034b8e4a6d27ec9d3a0a3))
-   emit single sync status event for multiple strands ([1b9cf53](https://github.com/powerhouse-inc/document-drive/commit/1b9cf5313cca31f696c104b169d1210a3c2b829f))
-   emit sync events when updating listeners ([b1899bb](https://github.com/powerhouse-inc/document-drive/commit/b1899bbe6a3d555fc6ea5236c55b1417def11ec2))
-   filter out drive strand if filter excludes it ([a6d3cd2](https://github.com/powerhouse-inc/document-drive/commit/a6d3cd25e63c917cf0033429ab75d265e76bde32))
-   fix adding files with documents ([b033ff9](https://github.com/powerhouse-inc/document-drive/commit/b033ff99be62a7024448c51186b26aaa6d49215c))
-   fix filter operations with since timestamp ([8a19d30](https://github.com/powerhouse-inc/document-drive/commit/8a19d30f892a9862be15c670d8114f4493198245))
-   fixed array access error ([ed1a3a9](https://github.com/powerhouse-inc/document-drive/commit/ed1a3a953a0a52d629eb8a69f83ce18b976076af))
-   fixed date comparison ([6d28a3b](https://github.com/powerhouse-inc/document-drive/commit/6d28a3bfd6b338deaa5ede718b7a9ebc0cccf498))
-   fixed state on internal transmitter strand ([5dbe930](https://github.com/powerhouse-inc/document-drive/commit/5dbe930af551375117d36f9b4d36fd613de8d9f7))
-   fixed unit tests ([46edd15](https://github.com/powerhouse-inc/document-drive/commit/46edd150aa4deb8814b4d1e6bd41b13e42b6ae91))
-   force deploy ([#126](https://github.com/powerhouse-inc/document-drive/issues/126)) ([e02d22e](https://github.com/powerhouse-inc/document-drive/commit/e02d22ee00471f3f20544cc27155108143d22512))
-   format changelog ([99dd18b](https://github.com/powerhouse-inc/document-drive/commit/99dd18bf95b798423e4dc83c2b4fd088a612b9c8))
-   get drive by id or slug ([95c171e](https://github.com/powerhouse-inc/document-drive/commit/95c171e97eb7e27a65129d7fc400fae862d62fdc))
-   implementation of switchboard transmitter ([cfbdc85](https://github.com/powerhouse-inc/document-drive/commit/cfbdc8570dfc86b6fe949c5246b240c634917a99))
-   implemented operation validation for document operations ([39bedf4](https://github.com/powerhouse-inc/document-drive/commit/39bedf43d2a3b1fda51d82f26b7f92b93a7cce5b))
-   improve add operations insert statement ([1c238ce](https://github.com/powerhouse-inc/document-drive/commit/1c238cef779e62bf89d2341a05a3af3633b9ec59))
-   improved error reporting and fixed operation hash check ([c6cc70f](https://github.com/powerhouse-inc/document-drive/commit/c6cc70f627dbdd2eab6399543fd41544fb959506))
-   improved operation errors ([a05772d](https://github.com/powerhouse-inc/document-drive/commit/a05772d023c600dd85d50be65f1ee80b19d546ef))
-   init listener manager ([0edb539](https://github.com/powerhouse-inc/document-drive/commit/0edb53988f691672a3c3e0ce3179142bc09b6b58))
-   initial work on tests migration ([3046dc1](https://github.com/powerhouse-inc/document-drive/commit/3046dc16a0405476a0af22aaf605be6ce43bf4c5))
-   instantiate listeners on server initialization ([367396d](https://github.com/powerhouse-inc/document-drive/commit/367396d8205b6ba81f7c4261d516be2eebfb664e))
-   integrated append only conflict resolution ([#153](https://github.com/powerhouse-inc/document-drive/issues/153)) ([16f12b6](https://github.com/powerhouse-inc/document-drive/commit/16f12b655963bd34575a00af3deb49182a35863a))
-   only add listeners once ([12ca458](https://github.com/powerhouse-inc/document-drive/commit/12ca458ce9a4b5577fc45c5a8bcca5d905bd80ee))
-   only emit event when syncStatus changes ([1cedf61](https://github.com/powerhouse-inc/document-drive/commit/1cedf6110fead2410a61d0d8f261a57d11c48fa1))
-   proceed with loop only after previous request is done ([d7eec70](https://github.com/powerhouse-inc/document-drive/commit/d7eec7044233c060c56e98698360070198a540dd))
-   replaced winston with console ([bbb7fc5](https://github.com/powerhouse-inc/document-drive/commit/bbb7fc53fa8cb5da97c6068e95ab77d5149d87fc))
-   run pull loop immediately for the first time ([802a126](https://github.com/powerhouse-inc/document-drive/commit/802a126e4ec90b5b62ad3e228cee73daa06cf651))
-   set sync status success if no new strands ([7a9627c](https://github.com/powerhouse-inc/document-drive/commit/7a9627cd72c80ae3c56a933bcd92c3da87529e00))
-   skip hash generation when replaying documents ([697ea35](https://github.com/powerhouse-inc/document-drive/commit/697ea35ae79a6697c8bfd4810a8d28139bf1a01f))
-   stop drive sync if triggers are removed ([dcf2df2](https://github.com/powerhouse-inc/document-drive/commit/dcf2df256f43f234bfb9188c750521fb57df880f))
-   store and sync operation context ([b2e5d5e](https://github.com/powerhouse-inc/document-drive/commit/b2e5d5efe59ed382fe6f984c193959218cbac4e0))
-   sync protocol draft ([f5ef843](https://github.com/powerhouse-inc/document-drive/commit/f5ef8436f9dfa50b546c77363bc8edfb887d671c))
-   trigger release ([a99370f](https://github.com/powerhouse-inc/document-drive/commit/a99370fbfea65bbc20f3fc3c39f0a26087795603))
-   trigger release ([75d8cc7](https://github.com/powerhouse-inc/document-drive/commit/75d8cc73c7022ecb6c71945486539e3b61ad9e1d))
-   trigger release ([33209d5](https://github.com/powerhouse-inc/document-drive/commit/33209d59cf4f44946b524a88c9008fef40aceea9))
-   Update CHANGELOG.md ([dc9d571](https://github.com/powerhouse-inc/document-drive/commit/dc9d5712092eec57d156b967f91a3079ce6dd917))
-   update config ([c0197a6](https://github.com/powerhouse-inc/document-drive/commit/c0197a6bd86cdb706883e9cd7f0cad017fa115de))
-   update document-model and document-model-libs ([#145](https://github.com/powerhouse-inc/document-drive/issues/145)) ([87dff17](https://github.com/powerhouse-inc/document-drive/commit/87dff17b5c8a76010e09dff2d8e6dba55fb262a5))
-   update document-model-libs version ([#100](https://github.com/powerhouse-inc/document-drive/issues/100)) ([0648328](https://github.com/powerhouse-inc/document-drive/commit/06483288af745f94aa9a81e526a03ae72197aa99))
-   update updatedOperations instead of create ([f87691d](https://github.com/powerhouse-inc/document-drive/commit/f87691dadee45b08f357f5b9df7374bbf7dd39f1))
-   updated document model dep ([37fa455](https://github.com/powerhouse-inc/document-drive/commit/37fa4556c44b000837bcb95673c90cf06af784c7))
-   updated document model dep ([c9876dc](https://github.com/powerhouse-inc/document-drive/commit/c9876dc83462d80b1c4c4213f9aab6f791f60f61))
-   updated document-model ([6d2eb8b](https://github.com/powerhouse-inc/document-drive/commit/6d2eb8b6eb35696b84d6dbe4586ec410ff5c61e6))
-   updated document-model-libs dep ([44bced0](https://github.com/powerhouse-inc/document-drive/commit/44bced07a07d6f65f105f342c8b07f98b5f1bbc4))
-   updated document-model-libs dep ([e73b813](https://github.com/powerhouse-inc/document-drive/commit/e73b81352899b1478512f2e9a50d61e534c6c360))
-   updated IDocumentDriveServer type ([ea1d7b4](https://github.com/powerhouse-inc/document-drive/commit/ea1d7b4ad3b4804db398de6a5d7f60088bee3118))
-   updated prisma schema with syncUnits and listeners ([224cbfe](https://github.com/powerhouse-inc/document-drive/commit/224cbfe51d97a2107ea114cc00a7a1665278f85c))
-   use prisma transaction ([4a02fb8](https://github.com/powerhouse-inc/document-drive/commit/4a02fb8c7d2b93253c4cd7104318772e3b199b61))
-   use reshuffleByTimestamp + added BasciClient + tests ([#129](https://github.com/powerhouse-inc/document-drive/issues/129)) ([8e0cfae](https://github.com/powerhouse-inc/document-drive/commit/8e0cfae5e0d2de52064689f023e4a80c170d8c84))
-   use serializable transactions ([267cae4](https://github.com/powerhouse-inc/document-drive/commit/267cae47ba3fec4a4863169350cbf961172caebf))

# [1.0.0-experimental.5](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-experimental.4...v1.0.0-experimental.5) (2024-05-09)

### Features

-   updated IDocumentDriveServer type ([09dfbd4](https://github.com/powerhouse-inc/document-drive/commit/09dfbd41da5a805c842a69bedf168d5cff0976f0))

# [1.0.0-experimental.4](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-experimental.3...v1.0.0-experimental.4) (2024-05-08)

### Bug Fixes

-   add exports ([#157](https://github.com/powerhouse-inc/document-drive/issues/157)) ([59b5753](https://github.com/powerhouse-inc/document-drive/commit/59b57539216aea41f633c7a3f88cf93974c5f0e5))

# [1.0.0-experimental.3](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-experimental.2...v1.0.0-experimental.3) (2024-05-08)

### Bug Fixes

-   added exports ([412aced](https://github.com/powerhouse-inc/document-drive/commit/412acedb614750d6fe0ca23cdcff90e1003a99ad))

# [1.0.0-experimental.2](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-experimental.1...v1.0.0-experimental.2) (2024-05-08)

### Features

-   added operation queues with memory and redis adapters ([#139](https://github.com/powerhouse-inc/document-drive/issues/139)) ([7839cea](https://github.com/powerhouse-inc/document-drive/commit/7839ceadb666d2358a7e06167862c7f179b7ad5a)), closes [#154](https://github.com/powerhouse-inc/document-drive/issues/154)

# 1.0.0-experimental.1 (2024-05-07)

### Bug Fixes

-   acknowledge porper document ([c7abd01](https://github.com/powerhouse-inc/document-drive/commit/c7abd0138346b2482546a7a731b22be3e61c8ccd))
-   added name field to getDocument ([2cba21a](https://github.com/powerhouse-inc/document-drive/commit/2cba21aa6c4efcde50d8524f46dd22804b96f7d0))
-   apply auto lint ([803cf91](https://github.com/powerhouse-inc/document-drive/commit/803cf91b3c427dd9c6b1ef9a76c92a4cfa480fbd))
-   cast result of json parse ([83ee12b](https://github.com/powerhouse-inc/document-drive/commit/83ee12be711c74047eb7a4a86e235b7ab16e0a69))
-   delete drive handling ([6547274](https://github.com/powerhouse-inc/document-drive/commit/6547274d4ebe02e737aa429699af39fbabe2184b))
-   duplicate driv entry ([c89c27e](https://github.com/powerhouse-inc/document-drive/commit/c89c27e892a2b1d345cf5b28b00722f3cef88228))
-   generate drive Id if empty string ([9c5044c](https://github.com/powerhouse-inc/document-drive/commit/9c5044cb21b9f311b999ab60612e8e61991d0dad))
-   handle signals in sequence ([9660b08](https://github.com/powerhouse-inc/document-drive/commit/9660b089e554e570ff6312645b799e1af9e09596))
-   missing operations in return values ([6d6cf56](https://github.com/powerhouse-inc/document-drive/commit/6d6cf56426d75b41aad1df0e8735e2a3dcc34221))
-   operation data filter ([0e91f21](https://github.com/powerhouse-inc/document-drive/commit/0e91f2110a5942404b864199af8ebabd00112dea))
-   prisma schema ([bac17dd](https://github.com/powerhouse-inc/document-drive/commit/bac17ddd305788252529706c0c2e8b2207c64838))
-   remove react settings ([6e11865](https://github.com/powerhouse-inc/document-drive/commit/6e1186575de9a457add141fc916d6ea78fd066d5))
-   remove sentry ([75faf6a](https://github.com/powerhouse-inc/document-drive/commit/75faf6acff391bb2f5fac016190a481019a225ee))
-   reverse since change ([3e09362](https://github.com/powerhouse-inc/document-drive/commit/3e093623ca2f315e7faebeee3b3f3fc42bad083b))
-   semantic release ([94077da](https://github.com/powerhouse-inc/document-drive/commit/94077da1f383ee2bf1530af9a4f2749cbc8d4e89))
-   transmitter not found ([0fac28b](https://github.com/powerhouse-inc/document-drive/commit/0fac28b6f3de37b13899075c88fd37a9ce355013))
-   types ([37ebeca](https://github.com/powerhouse-inc/document-drive/commit/37ebeca0ff18a8f60c4604ace6ba17bad730f4cb))
-   update revision field if new operations are added ([45eb259](https://github.com/powerhouse-inc/document-drive/commit/45eb259b479655dde575835ce5c1aa6ad68a94f1))
-   wording issues ([fcbb994](https://github.com/powerhouse-inc/document-drive/commit/fcbb994d49eb035cdb9e553b104b6c8279b7fbef))

### Features

-   add ts-reset lib ([760c3fb](https://github.com/powerhouse-inc/document-drive/commit/760c3fbe685775be506835a1975541539c8fb862))
-   add unique constraint on operation index ([b058834](https://github.com/powerhouse-inc/document-drive/commit/b058834a8b48c2f6db971427e9633a91141c1079))
-   added .env.example ([c781094](https://github.com/powerhouse-inc/document-drive/commit/c781094ad7f7312efeee3e94695e809c5d4c6722))
-   added acknowledge function to pull responder ([e72a721](https://github.com/powerhouse-inc/document-drive/commit/e72a721713bb947b0ba93be1c38797e209865e5c))
-   added addAction methods and addInternalListener ([9a076b3](https://github.com/powerhouse-inc/document-drive/commit/9a076b3155060825d442351a2cd36d935a17ca44))
-   added basic implementation of push and pull transmitter ([1ffb004](https://github.com/powerhouse-inc/document-drive/commit/1ffb00443bf442a17e545f2451e9b399edfcc0d3))
-   added basic push strands implementatioN ([c858b75](https://github.com/powerhouse-inc/document-drive/commit/c858b7544365429ce4535a6c849cf785a5cafcd5))
-   added basic transmitters ([996ff0f](https://github.com/powerhouse-inc/document-drive/commit/996ff0f0c7ea212f1ed96ebc05690d0689bf3429))
-   added clearStorage support ([#82](https://github.com/powerhouse-inc/document-drive/issues/82)) ([323a93f](https://github.com/powerhouse-inc/document-drive/commit/323a93f0aaf1da1bd66b3b3292e35aefd92e9c5f))
-   added clipboard flag to operations table ([f6ce677](https://github.com/powerhouse-inc/document-drive/commit/f6ce677b5e3d723074a40bb834f4029cd1c13b9a))
-   added clipboard to document ([3f8c295](https://github.com/powerhouse-inc/document-drive/commit/3f8c29573cbd08f071492b56f4b31f688af7c9db))
-   added debug and trace methods and logger export ([c7336de](https://github.com/powerhouse-inc/document-drive/commit/c7336de1f4b0e55a4c8d4e5efe5b063c7a4ccc88))
-   added document cache ([deae523](https://github.com/powerhouse-inc/document-drive/commit/deae523851b98fcd250825a4b2918b364525660f))
-   added drive events and improved sync error handling ([647c833](https://github.com/powerhouse-inc/document-drive/commit/647c8339b2166767c240a286d9ea12b032695417))
-   added duplicate folders id tests ([#143](https://github.com/powerhouse-inc/document-drive/issues/143)) ([abd3688](https://github.com/powerhouse-inc/document-drive/commit/abd3688bb284257a8f088e905e1f7cf6de1f8f5d))
-   added experimental release ([#155](https://github.com/powerhouse-inc/document-drive/issues/155)) ([adc52a5](https://github.com/powerhouse-inc/document-drive/commit/adc52a56655ef97de588cb03b6922ab69e72a8e9))
-   added exponential retry backoff to prisma transactions ([b38e72f](https://github.com/powerhouse-inc/document-drive/commit/b38e72fdfd29f4c39e15f606fccc942ec966fffe))
-   added getDrive by slug to memory adapter ([5515c34](https://github.com/powerhouse-inc/document-drive/commit/5515c34ecc18a6f14931a1a66cee454f14dbe03f))
-   added getDriveBySlug ([680cf71](https://github.com/powerhouse-inc/document-drive/commit/680cf71209853689e1414f90f58f079460be94d5))
-   added graphql requests for pull responder ([6578bae](https://github.com/powerhouse-inc/document-drive/commit/6578bae242a0c625531ac8b9bdec4c51727f57e6))
-   added init of pullResponder ([3961916](https://github.com/powerhouse-inc/document-drive/commit/3961916bbb780c0555d3d7e106ab25c80e988c7b))
-   added internal transmitter ([d728aed](https://github.com/powerhouse-inc/document-drive/commit/d728aed8ae692a83a0b998ccd6d7e36496e08b95))
-   added internal transmitter service ([6863620](https://github.com/powerhouse-inc/document-drive/commit/68636202d5bfd081ef979263fd697086529a1d10))
-   added listener functions ([6bc1803](https://github.com/powerhouse-inc/document-drive/commit/6bc180358826adf8a0ce6f247df37d8de245d8e7))
-   added namespace option for browser storage ([2fb312a](https://github.com/powerhouse-inc/document-drive/commit/2fb312a020d6593157c401814e0327d260f64718))
-   added prisma connection ([ef87ca7](https://github.com/powerhouse-inc/document-drive/commit/ef87ca7681c4336a68f15ecf35906cdfc9c8aa0a))
-   added registerListener function to PullResponderTransmitter ([814c160](https://github.com/powerhouse-inc/document-drive/commit/814c1603ef011402db30f373c3b5fbb2d3f12c58))
-   added retry mechanism to transaction ([e01a2cb](https://github.com/powerhouse-inc/document-drive/commit/e01a2cb6e1c64d37655255191fc4af13254201fe))
-   added semantic release ([f1c31a6](https://github.com/powerhouse-inc/document-drive/commit/f1c31a6bd2012ac6d51a7a3a5b94f656887e6b5a))
-   added sequelize adapter ([#19](https://github.com/powerhouse-inc/document-drive/issues/19)) ([71529d8](https://github.com/powerhouse-inc/document-drive/commit/71529d8d60eb6ff0390bdebb1bb660fb680c99f3))
-   added strandUpdate events ([1143716](https://github.com/powerhouse-inc/document-drive/commit/11437161fd1b0b0f37a7ef50833022507e4699f3))
-   added support for update noop operations ([#42](https://github.com/powerhouse-inc/document-drive/issues/42)) ([c59e15a](https://github.com/powerhouse-inc/document-drive/commit/c59e15a69f08f2abe654ce15c090f1212aee7606))
-   added update operations in prisma storage addDocumentOperations ([#71](https://github.com/powerhouse-inc/document-drive/issues/71)) ([eeb96af](https://github.com/powerhouse-inc/document-drive/commit/eeb96afbad520f90ce8c9b71bf573950dadadf4b))
-   added winston as default logger ([77c2451](https://github.com/powerhouse-inc/document-drive/commit/77c2451e4ceaddb11dd378a89f89c4245db51cb0))
-   also transmit scope state on internal transmitters ([c75a5d5](https://github.com/powerhouse-inc/document-drive/commit/c75a5d5b01ddaf166f0d86cd0afab4f888757a17))
-   avoid duplicating sync units on listener manager ([ad9a015](https://github.com/powerhouse-inc/document-drive/commit/ad9a015d8b50ba444362b85b1f57b9349037c325))
-   bug fixing ([1bb6097](https://github.com/powerhouse-inc/document-drive/commit/1bb60972588b5b95d2bb52354d8b35319d21eed5))
-   bump document-model dep ([7442070](https://github.com/powerhouse-inc/document-drive/commit/744207006dad191e214f0547d78d185530476560))
-   bump libs ([8b18624](https://github.com/powerhouse-inc/document-drive/commit/8b18624c05792d086b31a0b42b99cf42f3dc0627))
-   bump lint deps ([c4a68c9](https://github.com/powerhouse-inc/document-drive/commit/c4a68c9d1c8fea85d85d18eebf66a53d57438dbd))
-   cache updated document as soon as possible ([0b3327c](https://github.com/powerhouse-inc/document-drive/commit/0b3327cea01b508e0c07f05dee7fdcb4a6aaea35))
-   change unimportant rules to warn ([3958150](https://github.com/powerhouse-inc/document-drive/commit/395815033e8fe5e937342b5b2ba1d57ba64cbc8d))
-   check if there are conflicting operations when storing operations ([2487ab1](https://github.com/powerhouse-inc/document-drive/commit/2487ab10017ab819c560a115409829027dad9fda))
-   continue initializing remaining drives if one fails ([5cd9962](https://github.com/powerhouse-inc/document-drive/commit/5cd9962785e399aa5eb06f2b87a97fed72b51178))
-   defined types and functions ([0b57ae9](https://github.com/powerhouse-inc/document-drive/commit/0b57ae969f023f06ffc4859d1f8f514ef7a2508f))
-   delay sync updates after receiving strands ([e1d3a87](https://github.com/powerhouse-inc/document-drive/commit/e1d3a871a99042d397b7c7928432028251fba55d))
-   delete sync units before removing document ([6b54e1d](https://github.com/powerhouse-inc/document-drive/commit/6b54e1dfb7249c0c6e061e916783ac92cb5d1481))
-   do not consider already skipped operations when adding operations to document ([0778863](https://github.com/powerhouse-inc/document-drive/commit/077886351a1dbde484331a30778fa4daf12cf2a2))
-   don't send operation with index equal to fromRevision ([f279046](https://github.com/powerhouse-inc/document-drive/commit/f279046f156c3b9c35c1c7cdd950319078f09e04))
-   emit missing operation error ([8250681](https://github.com/powerhouse-inc/document-drive/commit/82506819148565aa6a7034b8e4a6d27ec9d3a0a3))
-   emit single sync status event for multiple strands ([1b9cf53](https://github.com/powerhouse-inc/document-drive/commit/1b9cf5313cca31f696c104b169d1210a3c2b829f))
-   emit sync events when updating listeners ([b1899bb](https://github.com/powerhouse-inc/document-drive/commit/b1899bbe6a3d555fc6ea5236c55b1417def11ec2))
-   filter out drive strand if filter excludes it ([a6d3cd2](https://github.com/powerhouse-inc/document-drive/commit/a6d3cd25e63c917cf0033429ab75d265e76bde32))
-   fix filter operations with since timestamp ([8a19d30](https://github.com/powerhouse-inc/document-drive/commit/8a19d30f892a9862be15c670d8114f4493198245))
-   fixed array access error ([ed1a3a9](https://github.com/powerhouse-inc/document-drive/commit/ed1a3a953a0a52d629eb8a69f83ce18b976076af))
-   fixed date comparison ([6d28a3b](https://github.com/powerhouse-inc/document-drive/commit/6d28a3bfd6b338deaa5ede718b7a9ebc0cccf498))
-   fixed state on internal transmitter strand ([5dbe930](https://github.com/powerhouse-inc/document-drive/commit/5dbe930af551375117d36f9b4d36fd613de8d9f7))
-   fixed unit tests ([46edd15](https://github.com/powerhouse-inc/document-drive/commit/46edd150aa4deb8814b4d1e6bd41b13e42b6ae91))
-   force deploy ([#126](https://github.com/powerhouse-inc/document-drive/issues/126)) ([e02d22e](https://github.com/powerhouse-inc/document-drive/commit/e02d22ee00471f3f20544cc27155108143d22512))
-   get drive by id or slug ([95c171e](https://github.com/powerhouse-inc/document-drive/commit/95c171e97eb7e27a65129d7fc400fae862d62fdc))
-   implementation of switchboard transmitter ([cfbdc85](https://github.com/powerhouse-inc/document-drive/commit/cfbdc8570dfc86b6fe949c5246b240c634917a99))
-   implemented operation validation for document operations ([39bedf4](https://github.com/powerhouse-inc/document-drive/commit/39bedf43d2a3b1fda51d82f26b7f92b93a7cce5b))
-   improve add operations insert statement ([1c238ce](https://github.com/powerhouse-inc/document-drive/commit/1c238cef779e62bf89d2341a05a3af3633b9ec59))
-   improved error reporting and fixed operation hash check ([c6cc70f](https://github.com/powerhouse-inc/document-drive/commit/c6cc70f627dbdd2eab6399543fd41544fb959506))
-   improved operation errors ([a05772d](https://github.com/powerhouse-inc/document-drive/commit/a05772d023c600dd85d50be65f1ee80b19d546ef))
-   init listener manager ([0edb539](https://github.com/powerhouse-inc/document-drive/commit/0edb53988f691672a3c3e0ce3179142bc09b6b58))
-   initial work on tests migration ([3046dc1](https://github.com/powerhouse-inc/document-drive/commit/3046dc16a0405476a0af22aaf605be6ce43bf4c5))
-   instantiate listeners on server initialization ([367396d](https://github.com/powerhouse-inc/document-drive/commit/367396d8205b6ba81f7c4261d516be2eebfb664e))
-   integrated append only conflict resolution ([#153](https://github.com/powerhouse-inc/document-drive/issues/153)) ([5ecb264](https://github.com/powerhouse-inc/document-drive/commit/5ecb264ec6a4804653ff81d213c42d5e8cfb341b))
-   only add listeners once ([12ca458](https://github.com/powerhouse-inc/document-drive/commit/12ca458ce9a4b5577fc45c5a8bcca5d905bd80ee))
-   only emit event when syncStatus changes ([1cedf61](https://github.com/powerhouse-inc/document-drive/commit/1cedf6110fead2410a61d0d8f261a57d11c48fa1))
-   proceed with loop only after previous request is done ([d7eec70](https://github.com/powerhouse-inc/document-drive/commit/d7eec7044233c060c56e98698360070198a540dd))
-   replaced winston with console ([bbb7fc5](https://github.com/powerhouse-inc/document-drive/commit/bbb7fc53fa8cb5da97c6068e95ab77d5149d87fc))
-   run pull loop immediately for the first time ([802a126](https://github.com/powerhouse-inc/document-drive/commit/802a126e4ec90b5b62ad3e228cee73daa06cf651))
-   set sync status success if no new strands ([7a9627c](https://github.com/powerhouse-inc/document-drive/commit/7a9627cd72c80ae3c56a933bcd92c3da87529e00))
-   skip hash generation when replaying documents ([697ea35](https://github.com/powerhouse-inc/document-drive/commit/697ea35ae79a6697c8bfd4810a8d28139bf1a01f))
-   stop drive sync if triggers are removed ([dcf2df2](https://github.com/powerhouse-inc/document-drive/commit/dcf2df256f43f234bfb9188c750521fb57df880f))
-   store and sync operation context ([b2e5d5e](https://github.com/powerhouse-inc/document-drive/commit/b2e5d5efe59ed382fe6f984c193959218cbac4e0))
-   sync protocol draft ([f5ef843](https://github.com/powerhouse-inc/document-drive/commit/f5ef8436f9dfa50b546c77363bc8edfb887d671c))
-   trigger release ([a99370f](https://github.com/powerhouse-inc/document-drive/commit/a99370fbfea65bbc20f3fc3c39f0a26087795603))
-   trigger release ([75d8cc7](https://github.com/powerhouse-inc/document-drive/commit/75d8cc73c7022ecb6c71945486539e3b61ad9e1d))
-   trigger release ([33209d5](https://github.com/powerhouse-inc/document-drive/commit/33209d59cf4f44946b524a88c9008fef40aceea9))
-   update config ([c0197a6](https://github.com/powerhouse-inc/document-drive/commit/c0197a6bd86cdb706883e9cd7f0cad017fa115de))
-   update document-model and document-model-libs ([#145](https://github.com/powerhouse-inc/document-drive/issues/145)) ([87dff17](https://github.com/powerhouse-inc/document-drive/commit/87dff17b5c8a76010e09dff2d8e6dba55fb262a5))
-   update document-model-libs version ([#100](https://github.com/powerhouse-inc/document-drive/issues/100)) ([0648328](https://github.com/powerhouse-inc/document-drive/commit/06483288af745f94aa9a81e526a03ae72197aa99))
-   update updatedOperations instead of create ([f87691d](https://github.com/powerhouse-inc/document-drive/commit/f87691dadee45b08f357f5b9df7374bbf7dd39f1))
-   updated document model dep ([37fa455](https://github.com/powerhouse-inc/document-drive/commit/37fa4556c44b000837bcb95673c90cf06af784c7))
-   updated document model dep ([c9876dc](https://github.com/powerhouse-inc/document-drive/commit/c9876dc83462d80b1c4c4213f9aab6f791f60f61))
-   updated document-model ([6d2eb8b](https://github.com/powerhouse-inc/document-drive/commit/6d2eb8b6eb35696b84d6dbe4586ec410ff5c61e6))
-   updated document-model-libs dep ([44bced0](https://github.com/powerhouse-inc/document-drive/commit/44bced07a07d6f65f105f342c8b07f98b5f1bbc4))
-   updated document-model-libs dep ([e73b813](https://github.com/powerhouse-inc/document-drive/commit/e73b81352899b1478512f2e9a50d61e534c6c360))
-   updated prisma schema with syncUnits and listeners ([224cbfe](https://github.com/powerhouse-inc/document-drive/commit/224cbfe51d97a2107ea114cc00a7a1665278f85c))
-   use prisma transaction ([4a02fb8](https://github.com/powerhouse-inc/document-drive/commit/4a02fb8c7d2b93253c4cd7104318772e3b199b61))
-   use reshuffleByTimestamp + added BasciClient + tests ([#129](https://github.com/powerhouse-inc/document-drive/issues/129)) ([8e0cfae](https://github.com/powerhouse-inc/document-drive/commit/8e0cfae5e0d2de52064689f023e4a80c170d8c84))
-   use serializable transactions ([267cae4](https://github.com/powerhouse-inc/document-drive/commit/267cae47ba3fec4a4863169350cbf961172caebf))

# [1.0.0-alpha.54](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.53...v1.0.0-alpha.54) (2024-05-07)

### Features

-   added experimental release ([#155](https://github.com/powerhouse-inc/document-drive/issues/155)) ([adc52a5](https://github.com/powerhouse-inc/document-drive/commit/adc52a56655ef97de588cb03b6922ab69e72a8e9))

# [1.0.0-alpha.53](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.52...v1.0.0-alpha.53) (2024-04-30)

### Features

-   added getDrive by slug to memory adapter ([5515c34](https://github.com/powerhouse-inc/document-drive/commit/5515c34ecc18a6f14931a1a66cee454f14dbe03f))
-   added getDriveBySlug ([680cf71](https://github.com/powerhouse-inc/document-drive/commit/680cf71209853689e1414f90f58f079460be94d5))
-   get drive by id or slug ([95c171e](https://github.com/powerhouse-inc/document-drive/commit/95c171e97eb7e27a65129d7fc400fae862d62fdc))

# [1.0.0-alpha.52](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.51...v1.0.0-alpha.52) (2024-04-24)

### Features

-   store and sync operation context ([b2e5d5e](https://github.com/powerhouse-inc/document-drive/commit/b2e5d5efe59ed382fe6f984c193959218cbac4e0))

# [1.0.0-alpha.51](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.50...v1.0.0-alpha.51) (2024-04-24)

### Features

-   added exponential retry backoff to prisma transactions ([b38e72f](https://github.com/powerhouse-inc/document-drive/commit/b38e72fdfd29f4c39e15f606fccc942ec966fffe))

# [1.0.0-alpha.50](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.49...v1.0.0-alpha.50) (2024-04-23)

### Features

-   update document-model and document-model-libs ([#145](https://github.com/powerhouse-inc/document-drive/issues/145)) ([87dff17](https://github.com/powerhouse-inc/document-drive/commit/87dff17b5c8a76010e09dff2d8e6dba55fb262a5))

# [1.0.0-alpha.49](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.48...v1.0.0-alpha.49) (2024-04-23)

### Features

-   added duplicate folders id tests ([#143](https://github.com/powerhouse-inc/document-drive/issues/143)) ([abd3688](https://github.com/powerhouse-inc/document-drive/commit/abd3688bb284257a8f088e905e1f7cf6de1f8f5d))

# [1.0.0-alpha.48](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.47...v1.0.0-alpha.48) (2024-04-23)

### Features

-   added retry mechanism to transaction ([e01a2cb](https://github.com/powerhouse-inc/document-drive/commit/e01a2cb6e1c64d37655255191fc4af13254201fe))

# [1.0.0-alpha.47](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.46...v1.0.0-alpha.47) (2024-04-23)

### Features

-   use serializable transactions ([267cae4](https://github.com/powerhouse-inc/document-drive/commit/267cae47ba3fec4a4863169350cbf961172caebf))

# [1.0.0-alpha.46](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.45...v1.0.0-alpha.46) (2024-04-23)

### Features

-   do not consider already skipped operations when adding operations to document ([0778863](https://github.com/powerhouse-inc/document-drive/commit/077886351a1dbde484331a30778fa4daf12cf2a2))

# [1.0.0-alpha.45](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.44...v1.0.0-alpha.45) (2024-04-22)

### Features

-   continue initializing remaining drives if one fails ([5cd9962](https://github.com/powerhouse-inc/document-drive/commit/5cd9962785e399aa5eb06f2b87a97fed72b51178))

# [1.0.0-alpha.44](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.43...v1.0.0-alpha.44) (2024-04-22)

### Features

-   cache updated document as soon as possible ([0b3327c](https://github.com/powerhouse-inc/document-drive/commit/0b3327cea01b508e0c07f05dee7fdcb4a6aaea35))

# [1.0.0-alpha.43](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.42...v1.0.0-alpha.43) (2024-04-19)

### Features

-   fixed array access error ([ed1a3a9](https://github.com/powerhouse-inc/document-drive/commit/ed1a3a953a0a52d629eb8a69f83ce18b976076af))

# [1.0.0-alpha.42](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.41...v1.0.0-alpha.42) (2024-04-19)

### Features

-   trigger release ([a99370f](https://github.com/powerhouse-inc/document-drive/commit/a99370fbfea65bbc20f3fc3c39f0a26087795603))

# [1.0.0-alpha.41](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.40...v1.0.0-alpha.41) (2024-04-18)

### Features

-   updated document-model ([6d2eb8b](https://github.com/powerhouse-inc/document-drive/commit/6d2eb8b6eb35696b84d6dbe4586ec410ff5c61e6))

# [1.0.0-alpha.40](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.39...v1.0.0-alpha.40) (2024-04-18)

### Features

-   skip hash generation when replaying documents ([697ea35](https://github.com/powerhouse-inc/document-drive/commit/697ea35ae79a6697c8bfd4810a8d28139bf1a01f))

# [1.0.0-alpha.39](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.38...v1.0.0-alpha.39) (2024-04-18)

### Features

-   trigger release ([75d8cc7](https://github.com/powerhouse-inc/document-drive/commit/75d8cc73c7022ecb6c71945486539e3b61ad9e1d))

# [1.0.0-alpha.38](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.37...v1.0.0-alpha.38) (2024-04-17)

### Bug Fixes

-   types ([37ebeca](https://github.com/powerhouse-inc/document-drive/commit/37ebeca0ff18a8f60c4604ace6ba17bad730f4cb))

### Features

-   added document cache ([deae523](https://github.com/powerhouse-inc/document-drive/commit/deae523851b98fcd250825a4b2918b364525660f))

# [1.0.0-alpha.37](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.36...v1.0.0-alpha.37) (2024-04-17)

### Features

-   fixed unit tests ([46edd15](https://github.com/powerhouse-inc/document-drive/commit/46edd150aa4deb8814b4d1e6bd41b13e42b6ae91))
-   initial work on tests migration ([3046dc1](https://github.com/powerhouse-inc/document-drive/commit/3046dc16a0405476a0af22aaf605be6ce43bf4c5))

# [1.0.0-alpha.36](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.35...v1.0.0-alpha.36) (2024-04-16)

### Features

-   added namespace option for browser storage ([2fb312a](https://github.com/powerhouse-inc/document-drive/commit/2fb312a020d6593157c401814e0327d260f64718))

# [1.0.0-alpha.35](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.34...v1.0.0-alpha.35) (2024-04-16)

### Features

-   use reshuffleByTimestamp + added BasciClient + tests ([#129](https://github.com/powerhouse-inc/document-drive/issues/129)) ([8e0cfae](https://github.com/powerhouse-inc/document-drive/commit/8e0cfae5e0d2de52064689f023e4a80c170d8c84))

# [1.0.0-alpha.34](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.33...v1.0.0-alpha.34) (2024-04-12)

### Features

-   force deploy ([#126](https://github.com/powerhouse-inc/document-drive/issues/126)) ([e02d22e](https://github.com/powerhouse-inc/document-drive/commit/e02d22ee00471f3f20544cc27155108143d22512))

# [1.0.0-alpha.33](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.32...v1.0.0-alpha.33) (2024-04-11)

### Features

-   added debug and trace methods and logger export ([c7336de](https://github.com/powerhouse-inc/document-drive/commit/c7336de1f4b0e55a4c8d4e5efe5b063c7a4ccc88))

# [1.0.0-alpha.32](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.31...v1.0.0-alpha.32) (2024-04-11)

### Features

-   replaced winston with console ([bbb7fc5](https://github.com/powerhouse-inc/document-drive/commit/bbb7fc53fa8cb5da97c6068e95ab77d5149d87fc))

# [1.0.0-alpha.31](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.30...v1.0.0-alpha.31) (2024-04-10)

### Bug Fixes

-   remove sentry ([75faf6a](https://github.com/powerhouse-inc/document-drive/commit/75faf6acff391bb2f5fac016190a481019a225ee))

# [1.0.0-alpha.30](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.29...v1.0.0-alpha.30) (2024-04-10)

### Bug Fixes

-   delete drive handling ([6547274](https://github.com/powerhouse-inc/document-drive/commit/6547274d4ebe02e737aa429699af39fbabe2184b))

# [1.0.0-alpha.29](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.28...v1.0.0-alpha.29) (2024-04-10)

### Features

-   added winston as default logger ([77c2451](https://github.com/powerhouse-inc/document-drive/commit/77c2451e4ceaddb11dd378a89f89c4245db51cb0))

# [1.0.0-alpha.28](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.27...v1.0.0-alpha.28) (2024-04-05)

### Features

-   avoid duplicating sync units on listener manager ([ad9a015](https://github.com/powerhouse-inc/document-drive/commit/ad9a015d8b50ba444362b85b1f57b9349037c325))
-   delay sync updates after receiving strands ([e1d3a87](https://github.com/powerhouse-inc/document-drive/commit/e1d3a871a99042d397b7c7928432028251fba55d))

# [1.0.0-alpha.27](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.26...v1.0.0-alpha.27) (2024-04-03)

### Features

-   updated document-model-libs dep ([44bced0](https://github.com/powerhouse-inc/document-drive/commit/44bced07a07d6f65f105f342c8b07f98b5f1bbc4))
-   updated document-model-libs dep ([e73b813](https://github.com/powerhouse-inc/document-drive/commit/e73b81352899b1478512f2e9a50d61e534c6c360))

# [1.0.0-alpha.26](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.25...v1.0.0-alpha.26) (2024-04-03)

### Features

-   only add listeners once ([12ca458](https://github.com/powerhouse-inc/document-drive/commit/12ca458ce9a4b5577fc45c5a8bcca5d905bd80ee))

# [1.0.0-alpha.25](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.24...v1.0.0-alpha.25) (2024-04-02)

### Features

-   update updatedOperations instead of create ([f87691d](https://github.com/powerhouse-inc/document-drive/commit/f87691dadee45b08f357f5b9df7374bbf7dd39f1))
-   use prisma transaction ([4a02fb8](https://github.com/powerhouse-inc/document-drive/commit/4a02fb8c7d2b93253c4cd7104318772e3b199b61))

# [1.0.0-alpha.24](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.23...v1.0.0-alpha.24) (2024-04-01)

### Features

-   add unique constraint on operation index ([b058834](https://github.com/powerhouse-inc/document-drive/commit/b058834a8b48c2f6db971427e9633a91141c1079))
-   check if there are conflicting operations when storing operations ([2487ab1](https://github.com/powerhouse-inc/document-drive/commit/2487ab10017ab819c560a115409829027dad9fda))

# [1.0.0-alpha.23](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.22...v1.0.0-alpha.23) (2024-03-29)

### Bug Fixes

-   generate drive Id if empty string ([9c5044c](https://github.com/powerhouse-inc/document-drive/commit/9c5044cb21b9f311b999ab60612e8e61991d0dad))

# [1.0.0-alpha.22](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.21...v1.0.0-alpha.22) (2024-03-29)

### Features

-   emit missing operation error ([8250681](https://github.com/powerhouse-inc/document-drive/commit/82506819148565aa6a7034b8e4a6d27ec9d3a0a3))

# [1.0.0-alpha.21](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.20...v1.0.0-alpha.21) (2024-03-29)

### Features

-   update document-model-libs version ([#100](https://github.com/powerhouse-inc/document-drive/issues/100)) ([0648328](https://github.com/powerhouse-inc/document-drive/commit/06483288af745f94aa9a81e526a03ae72197aa99))

# [1.0.0-alpha.20](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.19...v1.0.0-alpha.20) (2024-03-28)

### Features

-   updated document model dep ([37fa455](https://github.com/powerhouse-inc/document-drive/commit/37fa4556c44b000837bcb95673c90cf06af784c7))

# [1.0.0-alpha.19](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.18...v1.0.0-alpha.19) (2024-03-28)

### Features

-   updated document model dep ([c9876dc](https://github.com/powerhouse-inc/document-drive/commit/c9876dc83462d80b1c4c4213f9aab6f791f60f61))

# [1.0.0-alpha.18](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.17...v1.0.0-alpha.18) (2024-03-27)

### Features

-   only emit event when syncStatus changes ([1cedf61](https://github.com/powerhouse-inc/document-drive/commit/1cedf6110fead2410a61d0d8f261a57d11c48fa1))

# [1.0.0-alpha.17](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.16...v1.0.0-alpha.17) (2024-03-06)

### Features

-   added clearStorage support ([#82](https://github.com/powerhouse-inc/document-drive/issues/82)) ([323a93f](https://github.com/powerhouse-inc/document-drive/commit/323a93f0aaf1da1bd66b3b3292e35aefd92e9c5f))

# [1.0.0-alpha.16](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.15...v1.0.0-alpha.16) (2024-03-04)

### Features

-   fixed state on internal transmitter strand ([5dbe930](https://github.com/powerhouse-inc/document-drive/commit/5dbe930af551375117d36f9b4d36fd613de8d9f7))

# [1.0.0-alpha.15](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.14...v1.0.0-alpha.15) (2024-03-04)

### Features

-   instantiate listeners on server initialization ([367396d](https://github.com/powerhouse-inc/document-drive/commit/367396d8205b6ba81f7c4261d516be2eebfb664e))

# [1.0.0-alpha.14](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.13...v1.0.0-alpha.14) (2024-02-29)

### Features

-   added addAction methods and addInternalListener ([9a076b3](https://github.com/powerhouse-inc/document-drive/commit/9a076b3155060825d442351a2cd36d935a17ca44))
-   also transmit scope state on internal transmitters ([c75a5d5](https://github.com/powerhouse-inc/document-drive/commit/c75a5d5b01ddaf166f0d86cd0afab4f888757a17))

# [1.0.0-alpha.13](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.12...v1.0.0-alpha.13) (2024-02-28)

### Bug Fixes

-   wording issues ([fcbb994](https://github.com/powerhouse-inc/document-drive/commit/fcbb994d49eb035cdb9e553b104b6c8279b7fbef))

### Features

-   added internal transmitter ([d728aed](https://github.com/powerhouse-inc/document-drive/commit/d728aed8ae692a83a0b998ccd6d7e36496e08b95))

# [1.0.0-alpha.12](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.11...v1.0.0-alpha.12) (2024-02-26)

### Features

-   stop drive sync if triggers are removed ([dcf2df2](https://github.com/powerhouse-inc/document-drive/commit/dcf2df256f43f234bfb9188c750521fb57df880f))

# [1.0.0-alpha.11](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.10...v1.0.0-alpha.11) (2024-02-22)

### Features

-   filter out drive strand if filter excludes it ([a6d3cd2](https://github.com/powerhouse-inc/document-drive/commit/a6d3cd25e63c917cf0033429ab75d265e76bde32))

# [1.0.0-alpha.10](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.9...v1.0.0-alpha.10) (2024-02-21)

### Features

-   improve add operations insert statement ([1c238ce](https://github.com/powerhouse-inc/document-drive/commit/1c238cef779e62bf89d2341a05a3af3633b9ec59))

# [1.0.0-alpha.9](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.8...v1.0.0-alpha.9) (2024-02-21)

### Features

-   added update operations in prisma storage addDocumentOperations ([#71](https://github.com/powerhouse-inc/document-drive/issues/71)) ([eeb96af](https://github.com/powerhouse-inc/document-drive/commit/eeb96afbad520f90ce8c9b71bf573950dadadf4b))

# [1.0.0-alpha.8](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.7...v1.0.0-alpha.8) (2024-02-21)

### Features

-   set sync status success if no new strands ([7a9627c](https://github.com/powerhouse-inc/document-drive/commit/7a9627cd72c80ae3c56a933bcd92c3da87529e00))

# [1.0.0-alpha.7](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.6...v1.0.0-alpha.7) (2024-02-20)

### Features

-   fixed date comparison ([6d28a3b](https://github.com/powerhouse-inc/document-drive/commit/6d28a3bfd6b338deaa5ede718b7a9ebc0cccf498))

# [1.0.0-alpha.6](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.5...v1.0.0-alpha.6) (2024-02-20)

### Bug Fixes

-   reverse since change ([3e09362](https://github.com/powerhouse-inc/document-drive/commit/3e093623ca2f315e7faebeee3b3f3fc42bad083b))

# [1.0.0-alpha.5](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.4...v1.0.0-alpha.5) (2024-02-20)

### Features

-   trigger release ([33209d5](https://github.com/powerhouse-inc/document-drive/commit/33209d59cf4f44946b524a88c9008fef40aceea9))

# [1.0.0-alpha.4](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.3...v1.0.0-alpha.4) (2024-02-20)

### Features

-   fix filter operations with since timestamp ([8a19d30](https://github.com/powerhouse-inc/document-drive/commit/8a19d30f892a9862be15c670d8114f4493198245))

# [1.0.0-alpha.3](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.2...v1.0.0-alpha.3) (2024-02-20)

### Features

-   bump document-model dep ([7442070](https://github.com/powerhouse-inc/document-drive/commit/744207006dad191e214f0547d78d185530476560))

# [1.0.0-alpha.2](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2024-02-20)

### Features

-   emit single sync status event for multiple strands ([1b9cf53](https://github.com/powerhouse-inc/document-drive/commit/1b9cf5313cca31f696c104b169d1210a3c2b829f))
-   improved error reporting and fixed operation hash check ([c6cc70f](https://github.com/powerhouse-inc/document-drive/commit/c6cc70f627dbdd2eab6399543fd41544fb959506))
-   proceed with loop only after previous request is done ([d7eec70](https://github.com/powerhouse-inc/document-drive/commit/d7eec7044233c060c56e98698360070198a540dd))

# 1.0.0-alpha.1 (2024-02-16)

### Bug Fixes

-   acknowledge porper document ([c7abd01](https://github.com/powerhouse-inc/document-drive/commit/c7abd0138346b2482546a7a731b22be3e61c8ccd))
-   added name field to getDocument ([2cba21a](https://github.com/powerhouse-inc/document-drive/commit/2cba21aa6c4efcde50d8524f46dd22804b96f7d0))
-   apply auto lint ([803cf91](https://github.com/powerhouse-inc/document-drive/commit/803cf91b3c427dd9c6b1ef9a76c92a4cfa480fbd))
-   cast result of json parse ([83ee12b](https://github.com/powerhouse-inc/document-drive/commit/83ee12be711c74047eb7a4a86e235b7ab16e0a69))
-   duplicate driv entry ([c89c27e](https://github.com/powerhouse-inc/document-drive/commit/c89c27e892a2b1d345cf5b28b00722f3cef88228))
-   handle signals in sequence ([9660b08](https://github.com/powerhouse-inc/document-drive/commit/9660b089e554e570ff6312645b799e1af9e09596))
-   missing operations in return values ([6d6cf56](https://github.com/powerhouse-inc/document-drive/commit/6d6cf56426d75b41aad1df0e8735e2a3dcc34221))
-   operation data filter ([0e91f21](https://github.com/powerhouse-inc/document-drive/commit/0e91f2110a5942404b864199af8ebabd00112dea))
-   prisma schema ([bac17dd](https://github.com/powerhouse-inc/document-drive/commit/bac17ddd305788252529706c0c2e8b2207c64838))
-   remove react settings ([6e11865](https://github.com/powerhouse-inc/document-drive/commit/6e1186575de9a457add141fc916d6ea78fd066d5))
-   semantic release ([94077da](https://github.com/powerhouse-inc/document-drive/commit/94077da1f383ee2bf1530af9a4f2749cbc8d4e89))
-   transmitter not found ([0fac28b](https://github.com/powerhouse-inc/document-drive/commit/0fac28b6f3de37b13899075c88fd37a9ce355013))
-   update revision field if new operations are added ([45eb259](https://github.com/powerhouse-inc/document-drive/commit/45eb259b479655dde575835ce5c1aa6ad68a94f1))

### Features

-   add ts-reset lib ([760c3fb](https://github.com/powerhouse-inc/document-drive/commit/760c3fbe685775be506835a1975541539c8fb862))
-   added .env.example ([c781094](https://github.com/powerhouse-inc/document-drive/commit/c781094ad7f7312efeee3e94695e809c5d4c6722))
-   added acknowledge function to pull responder ([e72a721](https://github.com/powerhouse-inc/document-drive/commit/e72a721713bb947b0ba93be1c38797e209865e5c))
-   added basic implementation of push and pull transmitter ([1ffb004](https://github.com/powerhouse-inc/document-drive/commit/1ffb00443bf442a17e545f2451e9b399edfcc0d3))
-   added basic push strands implementatioN ([c858b75](https://github.com/powerhouse-inc/document-drive/commit/c858b7544365429ce4535a6c849cf785a5cafcd5))
-   added basic transmitters ([996ff0f](https://github.com/powerhouse-inc/document-drive/commit/996ff0f0c7ea212f1ed96ebc05690d0689bf3429))
-   added clipboard flag to operations table ([f6ce677](https://github.com/powerhouse-inc/document-drive/commit/f6ce677b5e3d723074a40bb834f4029cd1c13b9a))
-   added clipboard to document ([3f8c295](https://github.com/powerhouse-inc/document-drive/commit/3f8c29573cbd08f071492b56f4b31f688af7c9db))
-   added drive events and improved sync error handling ([647c833](https://github.com/powerhouse-inc/document-drive/commit/647c8339b2166767c240a286d9ea12b032695417))
-   added graphql requests for pull responder ([6578bae](https://github.com/powerhouse-inc/document-drive/commit/6578bae242a0c625531ac8b9bdec4c51727f57e6))
-   added init of pullResponder ([3961916](https://github.com/powerhouse-inc/document-drive/commit/3961916bbb780c0555d3d7e106ab25c80e988c7b))
-   added internal transmitter service ([6863620](https://github.com/powerhouse-inc/document-drive/commit/68636202d5bfd081ef979263fd697086529a1d10))
-   added listener functions ([6bc1803](https://github.com/powerhouse-inc/document-drive/commit/6bc180358826adf8a0ce6f247df37d8de245d8e7))
-   added prisma connection ([ef87ca7](https://github.com/powerhouse-inc/document-drive/commit/ef87ca7681c4336a68f15ecf35906cdfc9c8aa0a))
-   added registerListener function to PullResponderTransmitter ([814c160](https://github.com/powerhouse-inc/document-drive/commit/814c1603ef011402db30f373c3b5fbb2d3f12c58))
-   added semantic release ([f1c31a6](https://github.com/powerhouse-inc/document-drive/commit/f1c31a6bd2012ac6d51a7a3a5b94f656887e6b5a))
-   added sequelize adapter ([#19](https://github.com/powerhouse-inc/document-drive/issues/19)) ([71529d8](https://github.com/powerhouse-inc/document-drive/commit/71529d8d60eb6ff0390bdebb1bb660fb680c99f3))
-   added strandUpdate events ([1143716](https://github.com/powerhouse-inc/document-drive/commit/11437161fd1b0b0f37a7ef50833022507e4699f3))
-   added support for update noop operations ([#42](https://github.com/powerhouse-inc/document-drive/issues/42)) ([c59e15a](https://github.com/powerhouse-inc/document-drive/commit/c59e15a69f08f2abe654ce15c090f1212aee7606))
-   bug fixing ([1bb6097](https://github.com/powerhouse-inc/document-drive/commit/1bb60972588b5b95d2bb52354d8b35319d21eed5))
-   bump libs ([8b18624](https://github.com/powerhouse-inc/document-drive/commit/8b18624c05792d086b31a0b42b99cf42f3dc0627))
-   bump lint deps ([c4a68c9](https://github.com/powerhouse-inc/document-drive/commit/c4a68c9d1c8fea85d85d18eebf66a53d57438dbd))
-   change unimportant rules to warn ([3958150](https://github.com/powerhouse-inc/document-drive/commit/395815033e8fe5e937342b5b2ba1d57ba64cbc8d))
-   defined types and functions ([0b57ae9](https://github.com/powerhouse-inc/document-drive/commit/0b57ae969f023f06ffc4859d1f8f514ef7a2508f))
-   delete sync units before removing document ([6b54e1d](https://github.com/powerhouse-inc/document-drive/commit/6b54e1dfb7249c0c6e061e916783ac92cb5d1481))
-   don't send operation with index equal to fromRevision ([f279046](https://github.com/powerhouse-inc/document-drive/commit/f279046f156c3b9c35c1c7cdd950319078f09e04))
-   emit sync events when updating listeners ([b1899bb](https://github.com/powerhouse-inc/document-drive/commit/b1899bbe6a3d555fc6ea5236c55b1417def11ec2))
-   implementation of switchboard transmitter ([cfbdc85](https://github.com/powerhouse-inc/document-drive/commit/cfbdc8570dfc86b6fe949c5246b240c634917a99))
-   implemented operation validation for document operations ([39bedf4](https://github.com/powerhouse-inc/document-drive/commit/39bedf43d2a3b1fda51d82f26b7f92b93a7cce5b))
-   improved operation errors ([a05772d](https://github.com/powerhouse-inc/document-drive/commit/a05772d023c600dd85d50be65f1ee80b19d546ef))
-   init listener manager ([0edb539](https://github.com/powerhouse-inc/document-drive/commit/0edb53988f691672a3c3e0ce3179142bc09b6b58))
-   run pull loop immediately for the first time ([802a126](https://github.com/powerhouse-inc/document-drive/commit/802a126e4ec90b5b62ad3e228cee73daa06cf651))
-   sync protocol draft ([f5ef843](https://github.com/powerhouse-inc/document-drive/commit/f5ef8436f9dfa50b546c77363bc8edfb887d671c))
-   update config ([c0197a6](https://github.com/powerhouse-inc/document-drive/commit/c0197a6bd86cdb706883e9cd7f0cad017fa115de))
-   updated prisma schema with syncUnits and listeners ([224cbfe](https://github.com/powerhouse-inc/document-drive/commit/224cbfe51d97a2107ea114cc00a7a1665278f85c))
