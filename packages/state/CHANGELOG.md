## 4.1.0-dev.7 (2025-08-06)

This was a version bump only for @powerhousedao/state to align it with other projects, there were no code changes.

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))
- **state:** update readme docs ([5f060220d](https://github.com/powerhouse-inc/powerhouse/commit/5f060220d))
- **state:** remove dishonest generics ([780ea4ed7](https://github.com/powerhouse-inc/powerhouse/commit/780ea4ed7))

### 🩹 Fixes

- **state:** formatting mistake ([d3ab58292](https://github.com/powerhouse-inc/powerhouse/commit/d3ab58292))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.5 (2025-08-05)

This was a version bump only for @powerhousedao/state to align it with other projects, there were no code changes.

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

### 🚀 Features

- **state:** simplify events ([39ead5990](https://github.com/powerhouse-inc/powerhouse/commit/39ead5990))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.0.0-staging.7 (2025-07-26)

### 🚀 Features

- **state:** separate internal and external functions ([cd13a75aa](https://github.com/powerhouse-inc/powerhouse/commit/cd13a75aa))
- **state:** make all atom states derivative ([68a4bfece](https://github.com/powerhouse-inc/powerhouse/commit/68a4bfece))
- **state,connect:** remove unused code ([323155126](https://github.com/powerhouse-inc/powerhouse/commit/323155126))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.0.0-staging.6 (2025-07-25)

### 🚀 Features

- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **state,connect:** use window events for setting selected items ([29cc997d2](https://github.com/powerhouse-inc/powerhouse/commit/29cc997d2))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** update package json meta ([8e8a71749](https://github.com/powerhouse-inc/powerhouse/commit/8e8a71749))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **connect:** do instant navigation when creating drive or document ([bea7bae67](https://github.com/powerhouse-inc/powerhouse/commit/bea7bae67))
- **state:** add doc comments for setter hooks ([ffc6506a0](https://github.com/powerhouse-inc/powerhouse/commit/ffc6506a0))
- **state:** remove unused hook ([27c2ee2a1](https://github.com/powerhouse-inc/powerhouse/commit/27c2ee2a1))
- **state:** update initialize reactor deps array ([157b73aee](https://github.com/powerhouse-inc/powerhouse/commit/157b73aee))
- **state:** use more descriptive hook name ([78c2b1d38](https://github.com/powerhouse-inc/powerhouse/commit/78c2b1d38))
- **state:** update documents when selected drive changes ([94b893d0a](https://github.com/powerhouse-inc/powerhouse/commit/94b893d0a))
- **state:** add hooks for drive documents ([a80c72e51](https://github.com/powerhouse-inc/powerhouse/commit/a80c72e51))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **connect:** remove should navigate hook arg ([befb67ca9](https://github.com/powerhouse-inc/powerhouse/commit/befb67ca9))
- **state:** add build command ([92dc76abe](https://github.com/powerhouse-inc/powerhouse/commit/92dc76abe))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.19 (2025-07-25)

### 🚀 Features

- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **state,connect:** use window events for setting selected items ([29cc997d2](https://github.com/powerhouse-inc/powerhouse/commit/29cc997d2))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** update package json meta ([8e8a71749](https://github.com/powerhouse-inc/powerhouse/commit/8e8a71749))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **connect:** do instant navigation when creating drive or document ([bea7bae67](https://github.com/powerhouse-inc/powerhouse/commit/bea7bae67))
- **state:** add doc comments for setter hooks ([ffc6506a0](https://github.com/powerhouse-inc/powerhouse/commit/ffc6506a0))
- **state:** remove unused hook ([27c2ee2a1](https://github.com/powerhouse-inc/powerhouse/commit/27c2ee2a1))
- **state:** update initialize reactor deps array ([157b73aee](https://github.com/powerhouse-inc/powerhouse/commit/157b73aee))
- **state:** use more descriptive hook name ([78c2b1d38](https://github.com/powerhouse-inc/powerhouse/commit/78c2b1d38))
- **state:** update documents when selected drive changes ([94b893d0a](https://github.com/powerhouse-inc/powerhouse/commit/94b893d0a))
- **state:** add hooks for drive documents ([a80c72e51](https://github.com/powerhouse-inc/powerhouse/commit/a80c72e51))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))

### 🩹 Fixes

- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **connect:** remove should navigate hook arg ([befb67ca9](https://github.com/powerhouse-inc/powerhouse/commit/befb67ca9))
- **state:** add build command ([92dc76abe](https://github.com/powerhouse-inc/powerhouse/commit/92dc76abe))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))

### ❤️ Thank You

- acaldas @acaldas
- ryanwolhuter @ryanwolhuter