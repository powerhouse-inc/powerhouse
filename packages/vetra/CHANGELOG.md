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
- **vetra:** document handling and module resolution ([0f686b5fb](https://github.com/powerhouse-inc/powerhouse/commit/0f686b5fb))
- use patname secret instead of github token ([db9dfd5cd](https://github.com/powerhouse-inc/powerhouse/commit/db9dfd5cd))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente

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
- **vetra:** added debounce ([e58427b7f](https://github.com/powerhouse-inc/powerhouse/commit/e58427b7f))
- **connect:** remove broken electron code ([3f28d6a46](https://github.com/powerhouse-inc/powerhouse/commit/3f28d6a46))
- **reactor-browser:** add app config hooks ([911800ba7](https://github.com/powerhouse-inc/powerhouse/commit/911800ba7))
- **reactor-browser,connect:** add dispatch function to state hooks ([46ba715ec](https://github.com/powerhouse-inc/powerhouse/commit/46ba715ec))
- **reactor-browser,connect:** remove wasted code ([5a628b3fb](https://github.com/powerhouse-inc/powerhouse/commit/5a628b3fb))
- **reactor-browser,connect,vetra:** move state hooks into reactor browser and eliminate redundant and dead code ([30fa16f1f](https://github.com/powerhouse-inc/powerhouse/commit/30fa16f1f))
- **connect,state,renown:** add state hook for renown ([5beb1252b](https://github.com/powerhouse-inc/powerhouse/commit/5beb1252b))
- **connect:** remove unused dep ([ef492bc7a](https://github.com/powerhouse-inc/powerhouse/commit/ef492bc7a))
- **connect,state,reactor-browser:** eliminate jotai ([53b1ab759](https://github.com/powerhouse-inc/powerhouse/commit/53b1ab759))
- **state:** watch document models and add to reactor when changes ([21b7f51ac](https://github.com/powerhouse-inc/powerhouse/commit/21b7f51ac))
- **state:** rename to vetra packages ([c415b7dc2](https://github.com/powerhouse-inc/powerhouse/commit/c415b7dc2))
- **state:** use ph packages atoms ([6421fbeea](https://github.com/powerhouse-inc/powerhouse/commit/6421fbeea))

### 🩹 Fixes

- today claude taught me I could mock a package to fix circular references ([dcb83174c](https://github.com/powerhouse-inc/powerhouse/commit/dcb83174c))
- **vetra:** document type selection ([8eb33d1a8](https://github.com/powerhouse-inc/powerhouse/commit/8eb33d1a8))
- **vetra,reactor-browser,builder-tools:** use base state type ([0ed258c14](https://github.com/powerhouse-inc/powerhouse/commit/0ed258c14))
- **monorepo:** bugs from wrong usage of types ([f29fbd145](https://github.com/powerhouse-inc/powerhouse/commit/f29fbd145))
- **monorepo:** numerous build issues ([04349dd25](https://github.com/powerhouse-inc/powerhouse/commit/04349dd25))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.23 (2025-08-19)

### 🚀 Features

- **vetra:** implement document type selection in editors ([bcd1879a1](https://github.com/powerhouse-inc/powerhouse/commit/bcd1879a1))

### 🩹 Fixes

- **vetra:** build fixes for updates ([0a32b5570](https://github.com/powerhouse-inc/powerhouse/commit/0a32b5570))
- **vetra:** handle optional author properties in package manifest generation ([39c64a30f](https://github.com/powerhouse-inc/powerhouse/commit/39c64a30f))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.22 (2025-08-15)

### 🩹 Fixes

- **vetra:** use app id in editor app ([#1767](https://github.com/powerhouse-inc/powerhouse/pull/1767))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.21 (2025-08-15)

### 🚀 Features

- **vetra:** update manifest when new module is added ([#1766](https://github.com/powerhouse-inc/powerhouse/pull/1766))
- **vetra:** update vetra document models with new status field ([#1765](https://github.com/powerhouse-inc/powerhouse/pull/1765))

### 🩹 Fixes

- fixed debug launch configuration now that source maps are in the proper locations ([c75d793ed](https://github.com/powerhouse-inc/powerhouse/commit/c75d793ed))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.20 (2025-08-15)

### 🚀 Features

- added app document to vetra package ([#1762](https://github.com/powerhouse-inc/powerhouse/pull/1762))

### 🩹 Fixes

- **vetra:** fixing compile issues due to operation action split ([73ff839ba](https://github.com/powerhouse-inc/powerhouse/commit/73ff839ba))
- fixing all the other projects so that they build with action / operation refactor ([c185b3552](https://github.com/powerhouse-inc/powerhouse/commit/c185b3552))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.19 (2025-08-14)

This was a version bump only for @powerhousedao/vetra to align it with other projects, there were no code changes.

## 4.1.0-dev.18 (2025-08-14)

### 🚀 Features

- added processor document model in vetra package ([#1758](https://github.com/powerhouse-inc/powerhouse/pull/1758))
- added subgraph module to vetra package ([#1757](https://github.com/powerhouse-inc/powerhouse/pull/1757))
- **vetra:** initialize PH app and set selected node on document open ([ae5f1cf05](https://github.com/powerhouse-inc/powerhouse/commit/ae5f1cf05))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.17 (2025-08-12)

### 🚀 Features

- refactor vetra command and remove vetra deps in connect and reactor ([#1753](https://github.com/powerhouse-inc/powerhouse/pull/1753))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.16 (2025-08-12)

This was a version bump only for @powerhousedao/vetra to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/vetra to align it with other projects, there were no code changes.

## 4.1.0-dev.12 (2025-08-08)

This was a version bump only for @powerhousedao/vetra to align it with other projects, there were no code changes.

## 4.1.0-dev.11 (2025-08-07)

### 🚀 Features

- **switchboard,reactor-local,reactor-api:** moved vite loader to reactor-api package ([c84f0a2a3](https://github.com/powerhouse-inc/powerhouse/commit/c84f0a2a3))
- vetra package documents and app integration ([0e4053302](https://github.com/powerhouse-inc/powerhouse/commit/0e4053302))
- added setSelectedNode to driveContext (remove this after integration with powerhousedao/state) ([69f0c6b3a](https://github.com/powerhouse-inc/powerhouse/commit/69f0c6b3a))
- **vetra:** enhance logging and update ignored paths in server configuration ([4e1e0024b](https://github.com/powerhouse-inc/powerhouse/commit/4e1e0024b))
- add vetra drive editor support and fix preferredEditor handling ([bd0d9fe9f](https://github.com/powerhouse-inc/powerhouse/commit/bd0d9fe9f))
- **vetra:** added vetra drive editor ([4ebafd143](https://github.com/powerhouse-inc/powerhouse/commit/4ebafd143))
- **vetra:** enabled codegen for document editors ([0f704353a](https://github.com/powerhouse-inc/powerhouse/commit/0f704353a))
- **vetra:** enabled support for new documents in codegen processor ([dd63103ac](https://github.com/powerhouse-inc/powerhouse/commit/dd63103ac))
- integrate package documents into reactor system ([939fe8e80](https://github.com/powerhouse-inc/powerhouse/commit/939fe8e80))
- **connect:** integrate Vetra package documents and editors ([2ecb9bd15](https://github.com/powerhouse-inc/powerhouse/commit/2ecb9bd15))
- **vetra:** add document-editor document model and refactor operations ([03017dcf2](https://github.com/powerhouse-inc/powerhouse/commit/03017dcf2))

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

This was a version bump only for @powerhousedao/vetra to align it with other projects, there were no code changes.

## 4.1.0-dev.8 (2025-08-06)

This was a version bump only for @powerhousedao/vetra to align it with other projects, there were no code changes.

## 4.1.0-dev.7 (2025-08-06)

This was a version bump only for @powerhousedao/vetra to align it with other projects, there were no code changes.

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))
- **codegen:** added generation of document model subgraphs to vetra processor ([0efa4b56e](https://github.com/powerhouse-inc/powerhouse/commit/0efa4b56e))
- **vetra:** do not include all json files in vetra ts config ([6178e7cdd](https://github.com/powerhouse-inc/powerhouse/commit/6178e7cdd))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.5 (2025-08-05)

This was a version bump only for @powerhousedao/vetra to align it with other projects, there were no code changes.

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