## 4.1.0-dev.74 (2025-10-15)

### 🚀 Features

- dual write ([cd1fad2fb](https://github.com/powerhouse-inc/powerhouse/commit/cd1fad2fb))
- deletion state checks ([9fc3798cd](https://github.com/powerhouse-inc/powerhouse/commit/9fc3798cd))
- implemented job tracking ([370447337](https://github.com/powerhouse-inc/powerhouse/commit/370447337))
- introduced a read model coordinator ([ae5e765a9](https://github.com/powerhouse-inc/powerhouse/commit/ae5e765a9))
- document-view reconstruction fixes ([97a66e3fd](https://github.com/powerhouse-inc/powerhouse/commit/97a66e3fd))
- document-view optimizations ([d4251ce98](https://github.com/powerhouse-inc/powerhouse/commit/d4251ce98))
- document-view stiching changes ([fd875ca0a](https://github.com/powerhouse-inc/powerhouse/commit/fd875ca0a))

### 🩹 Fixes

- date issue in op store ([4c2fb3ae6](https://github.com/powerhouse-inc/powerhouse/commit/4c2fb3ae6))
- incremental fix wit hack ([5f4a7e2cd](https://github.com/powerhouse-inc/powerhouse/commit/5f4a7e2cd))
- fixing issue where create, update, delete were applied with incorrect scope ([59c7a981e](https://github.com/powerhouse-inc/powerhouse/commit/59c7a981e))
- adding all header parameters to create action input ([67ac63f05](https://github.com/powerhouse-inc/powerhouse/commit/67ac63f05))
- jobs can have many operations, fixing create/update in new flow ([ffcf6b468](https://github.com/powerhouse-inc/powerhouse/commit/ffcf6b468))
- now we need an actual job executor to make tests pass ([c869f1f34](https://github.com/powerhouse-inc/powerhouse/commit/c869f1f34))
- document-drive-model tests should use updated job status system and proper lifecycle methods of coordinator ([4217e3292](https://github.com/powerhouse-inc/powerhouse/commit/4217e3292))
- error thrown on shutdown ([b52cdb6fe](https://github.com/powerhouse-inc/powerhouse/commit/b52cdb6fe))
- merge fixes ([e5eda5985](https://github.com/powerhouse-inc/powerhouse/commit/e5eda5985))
- **codegen:** update graphql dependency in package.json ([257f368ac](https://github.com/powerhouse-inc/powerhouse/commit/257f368ac))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.73 (2025-10-15)

### 🚀 Features

- **renown:** added login button ([f109c7305](https://github.com/powerhouse-inc/powerhouse/commit/f109c7305))

### 🩹 Fixes

- **ph-cmd:** add overrides for react and react-dom versions ([fe1412c20](https://github.com/powerhouse-inc/powerhouse/commit/fe1412c20))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente

## 4.1.0-dev.72 (2025-10-15)

### 🩹 Fixes

- **connect, builder-tools:** normalize base path to start and end with a slash ([bea7b4673](https://github.com/powerhouse-inc/powerhouse/commit/bea7b4673))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.71 (2025-10-15)

### 🚀 Features

- **reactor-api:** add operation type and id resolvers to DriveSubgraph ([#1955](https://github.com/powerhouse-inc/powerhouse/pull/1955))

### 🩹 Fixes

- **codegen:** update analytics processor imports to use in processor templates ([#1954](https://github.com/powerhouse-inc/powerhouse/pull/1954))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.70 (2025-10-14)

### 🩹 Fixes

- broken templates, drive app styles, local state schema and validation ([#1941](https://github.com/powerhouse-inc/powerhouse/pull/1941))
- revert delete operation change to base-server as the underlying storage doesn't support it ([723345310](https://github.com/powerhouse-inc/powerhouse/commit/723345310))
- **codegen:** generate dm subgraphs ([a7be027f1](https://github.com/powerhouse-inc/powerhouse/commit/a7be027f1))
- **reactor-api:** bandaid a deeper issue where some document model types have their own name separate from header information, and headers aren't generally synced ([bbf5c94d8](https://github.com/powerhouse-inc/powerhouse/commit/bbf5c94d8))
- **vetra:** added drive id to read model ([2e40cc500](https://github.com/powerhouse-inc/powerhouse/commit/2e40cc500))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.69 (2025-10-11)

### 🚀 Features

- **builder-tools, ph-cli, connect:** reimplemented ph connect build and preview ([4f568517b](https://github.com/powerhouse-inc/powerhouse/commit/4f568517b))

### 🩹 Fixes

- **builder-tools:** do not watch if local package is disabled ([335f41a0c](https://github.com/powerhouse-inc/powerhouse/commit/335f41a0c))
- **codegen:** add /index.js to import path on templates ([37bc2e9ef](https://github.com/powerhouse-inc/powerhouse/commit/37bc2e9ef))
- **ph-cmd:** fixed detection of help command ([157249468](https://github.com/powerhouse-inc/powerhouse/commit/157249468))
- **vetra:** added drive id to read model ([cfe16037e](https://github.com/powerhouse-inc/powerhouse/commit/cfe16037e))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 4.1.0-dev.68 (2025-10-11)

### 🚀 Features

- update file extension to .phd for document export ([#1894](https://github.com/powerhouse-inc/powerhouse/pull/1894))
- generate unique vetra drive IDs per project ([#1936](https://github.com/powerhouse-inc/powerhouse/pull/1936))
- **connect:** import document-model editor missing styles ([#1937](https://github.com/powerhouse-inc/powerhouse/pull/1937))
- **vetra:** added read model to fetch vetra packages ([abb6d3742](https://github.com/powerhouse-inc/powerhouse/commit/abb6d3742))
- **vetra:** added documentId in filter option ([01bb92f28](https://github.com/powerhouse-inc/powerhouse/commit/01bb92f28))

### 🩹 Fixes

- enabled supported file ext in drop zone ([#1892](https://github.com/powerhouse-inc/powerhouse/pull/1892))
- **reactor-api:** added auth export ([a38df7fde](https://github.com/powerhouse-inc/powerhouse/commit/a38df7fde))
- **vetra:** added vetra package to processor filter ([5f3eaadf4](https://github.com/powerhouse-inc/powerhouse/commit/5f3eaadf4))
- **vetra:** package query ([36bea7102](https://github.com/powerhouse-inc/powerhouse/commit/36bea7102))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.67 (2025-10-10)

### 🚀 Features

- **vetra:** add delete functionality to vetra drive app documents ([#1927](https://github.com/powerhouse-inc/powerhouse/pull/1927))
- **vetra:** add open button to Package Information section ([#1930](https://github.com/powerhouse-inc/powerhouse/pull/1930))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.66 (2025-10-09)

### 🚀 Features

- **connect, builder-tools, reactor-browser:** support basepath on connect ([0571822ed](https://github.com/powerhouse-inc/powerhouse/commit/0571822ed))

### 🩹 Fixes

- **ph-reactor:** remove test files from root index ([2a217e8e6](https://github.com/powerhouse-inc/powerhouse/commit/2a217e8e6))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.65 (2025-10-09)

### 🩹 Fixes

- **ph-cli:** build version on release ci action ([cb86009c4](https://github.com/powerhouse-inc/powerhouse/commit/cb86009c4))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.64 (2025-10-09)

### 🩹 Fixes

- **ph-cli:** force transpiliation of version.ts ([6b1294745](https://github.com/powerhouse-inc/powerhouse/commit/6b1294745))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.63 (2025-10-09)

### 🚀 Features

- update @electric-sql/pglite version ([fa3529328](https://github.com/powerhouse-inc/powerhouse/commit/fa3529328))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.62 (2025-10-08)

### 🚀 Features

- wip delete document action ([5f753cea0](https://github.com/powerhouse-inc/powerhouse/commit/5f753cea0))

### 🩹 Fixes

- **connect:** fix build issues on external package ([2e46ebdcb](https://github.com/powerhouse-inc/powerhouse/commit/2e46ebdcb))
- **connect:** bad worker path ([66b8cd9a1](https://github.com/powerhouse-inc/powerhouse/commit/66b8cd9a1))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.61 (2025-10-08)

### 🩹 Fixes

- **connect:** fix use default export as fallback ([1569f1342](https://github.com/powerhouse-inc/powerhouse/commit/1569f1342))
- **ph-cli:** missing version.js file on dist ([ae7bc3772](https://github.com/powerhouse-inc/powerhouse/commit/ae7bc3772))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.60 (2025-10-08)

### 🚀 Features

- added watch-packages option to vetra command and disabled dynamic package loading by default ([#1875](https://github.com/powerhouse-inc/powerhouse/pull/1875))
- handle replace and duplicate documents in drag and drop ([#1876](https://github.com/powerhouse-inc/powerhouse/pull/1876))
- remove hardcoded Vetra drive ID from document editors ([#1878](https://github.com/powerhouse-inc/powerhouse/pull/1878))
- refactor drag and drop to use withDropZone HOC ([1737fd4fd](https://github.com/powerhouse-inc/powerhouse/commit/1737fd4fd))
- restructure document model to avoid circular imports ([#1874](https://github.com/powerhouse-inc/powerhouse/pull/1874))
- make EditorProps generic and added codegen tests ([ff5664adc](https://github.com/powerhouse-inc/powerhouse/commit/ff5664adc))
- add document state copy button with toast notification ([#1880](https://github.com/powerhouse-inc/powerhouse/pull/1880))
- pass documentId to editor component and useDocumentOfModule for type safe retrieval ([7f0781ea0](https://github.com/powerhouse-inc/powerhouse/commit/7f0781ea0))
- enhance upload tracking with unsupported document type handling ([bcf784dfc](https://github.com/powerhouse-inc/powerhouse/commit/bcf784dfc))
- document editor update ([ee24e7823](https://github.com/powerhouse-inc/powerhouse/commit/ee24e7823))
- useDocumentOfType hook ([d71661167](https://github.com/powerhouse-inc/powerhouse/commit/d71661167))
- removed props from document editor and updated boilerplate to use hook ([7f49e9070](https://github.com/powerhouse-inc/powerhouse/commit/7f49e9070))
- added initial pieces of the kysely operation store implementation ([3fbece162](https://github.com/powerhouse-inc/powerhouse/commit/3fbece162))
- add remaining methods ([2d1bd201e](https://github.com/powerhouse-inc/powerhouse/commit/2d1bd201e))
- initial document view methods + tests ([af8a9a0e7](https://github.com/powerhouse-inc/powerhouse/commit/af8a9a0e7))
- added getMany to document view ([f89a1c46c](https://github.com/powerhouse-inc/powerhouse/commit/f89a1c46c))
- drive boilerplate update ([aca241a83](https://github.com/powerhouse-inc/powerhouse/commit/aca241a83))
- refactor DriveExplorer and FolderTree components to use unified node structure and Sidebar component ([64c69ce59](https://github.com/powerhouse-inc/powerhouse/commit/64c69ce59))
- for backward compat, only new documents can have dual actions ([7c751bbcc](https://github.com/powerhouse-inc/powerhouse/commit/7c751bbcc))
- for backward compat, only new documents can have dual actions ([df8f38510](https://github.com/powerhouse-inc/powerhouse/commit/df8f38510))
- syncing feature flag behavior between switchboard and reactor-local ([e45dc2bf7](https://github.com/powerhouse-inc/powerhouse/commit/e45dc2bf7))
- stubbing out feature flag + reactor setup in connect and deleting unused code in reactor-browser ([793bbd7af](https://github.com/powerhouse-inc/powerhouse/commit/793bbd7af))
- adding feature flags to reactor-mcp ([fe4f2f683](https://github.com/powerhouse-inc/powerhouse/commit/fe4f2f683))
- added connect feature flag provider implementation that uses query parameters ([748aba57b](https://github.com/powerhouse-inc/powerhouse/commit/748aba57b))
- operation store now uses updated create / update actions ([180702e6c](https://github.com/powerhouse-inc/powerhouse/commit/180702e6c))
- using types instead of dynamic objects for create and upgrade input ([2a0e80974](https://github.com/powerhouse-inc/powerhouse/commit/2a0e80974))
- added hashing options to the document scope ([af2ef40c0](https://github.com/powerhouse-inc/powerhouse/commit/af2ef40c0))
- **codegen:** updated editor boilerplate with document state and example setName dispatch ([3e7c51cc3](https://github.com/powerhouse-inc/powerhouse/commit/3e7c51cc3))
- **codegen:** updated document editor boilerplate ([75cc0b9ff](https://github.com/powerhouse-inc/powerhouse/commit/75cc0b9ff))
- **codegen:** fix some type errors ([0f5eec72a](https://github.com/powerhouse-inc/powerhouse/commit/0f5eec72a))
- **codegen:** fix index file code lost in merge ([ded0c91e5](https://github.com/powerhouse-inc/powerhouse/commit/ded0c91e5))
- **codegen,reactor-browser:** drive boilerplate tweaks ([870180495](https://github.com/powerhouse-inc/powerhouse/commit/870180495))
- **common,vetra,connect:** render document editor as child of drive ([#1882](https://github.com/powerhouse-inc/powerhouse/pull/1882))
- **connect:** open remote drive ([59e6200ac](https://github.com/powerhouse-inc/powerhouse/commit/59e6200ac))
- **connect:** open remote drive ([e0a1c43a6](https://github.com/powerhouse-inc/powerhouse/commit/e0a1c43a6))
- **connect:** load modals on demand ([f61980996](https://github.com/powerhouse-inc/powerhouse/commit/f61980996))
- **connect, builder-tools:** centralized logic to handle env vars ([bf4b569d1](https://github.com/powerhouse-inc/powerhouse/commit/bf4b569d1))
- **connect, ph-cli, builder-tools, vetra:** ph connect rework ([746390687](https://github.com/powerhouse-inc/powerhouse/commit/746390687))
- **connect,builder-tools:** build rework ([#1871](https://github.com/powerhouse-inc/powerhouse/pull/1871))
- **connect,builder-tools,common,document-model,reactor-browser,vetra:** typed editor components with dispatch as prop ([553d38fef](https://github.com/powerhouse-inc/powerhouse/commit/553d38fef))
- **connect,builder-tools,common,document-model,reactor-browser,vetra:** typed editor components with dispatch as prop ([c47d1d5dd](https://github.com/powerhouse-inc/powerhouse/commit/c47d1d5dd))
- **connect,reactor-browser:** reenabled loading screen during initial loading ([ab7cfa580](https://github.com/powerhouse-inc/powerhouse/commit/ab7cfa580))
- **connect,reactor-browser:** remove drive context and use window for modals ([a9539202e](https://github.com/powerhouse-inc/powerhouse/commit/a9539202e))
- **design-system:** moved default ph styles to the design system stylesheet ([5860f6cc3](https://github.com/powerhouse-inc/powerhouse/commit/5860f6cc3))
- **monorepo:** attempt to integrate with main ([b53828c5c](https://github.com/powerhouse-inc/powerhouse/commit/b53828c5c))
- **monorepo:** update eslint config ([ac97af97d](https://github.com/powerhouse-inc/powerhouse/commit/ac97af97d))
- **monorepo:** revert package versions ([8a1a02628](https://github.com/powerhouse-inc/powerhouse/commit/8a1a02628))
- **monorepo:** a humble attempt at integration with main ([#1891](https://github.com/powerhouse-inc/powerhouse/pull/1891))
- **monorepo:** update to react 19 ([#1902](https://github.com/powerhouse-inc/powerhouse/pull/1902))
- **monorepo:** remove global storybook installs ([#1903](https://github.com/powerhouse-inc/powerhouse/pull/1903))
- **monorepo:** use latest versions of react related deps ([#1905](https://github.com/powerhouse-inc/powerhouse/pull/1905))
- **reactor-browser,codegen:** unify new and existing drive hooks ([7ed734b23](https://github.com/powerhouse-inc/powerhouse/commit/7ed734b23))
- **renown:** added connect crypto ([7d7a7bbd3](https://github.com/powerhouse-inc/powerhouse/commit/7d7a7bbd3))
- **vetra:** new connect build setup on vetra ([8dd11a849](https://github.com/powerhouse-inc/powerhouse/commit/8dd11a849))
- **vetra:** enabled HMR in dev mode ([8cf19757e](https://github.com/powerhouse-inc/powerhouse/commit/8cf19757e))
- **vetra:** added read model to fetch vetra packages ([23c55364d](https://github.com/powerhouse-inc/powerhouse/commit/23c55364d))
- **vetra:** added documentId in filter option ([b9c698e9b](https://github.com/powerhouse-inc/powerhouse/commit/b9c698e9b))

### 🩹 Fixes

- fix vite-config loading issue that breaks in vscode ([c40f8f312](https://github.com/powerhouse-inc/powerhouse/commit/c40f8f312))
- whoops, state needs to be undefined so it is rebuilt ([1ba7dc3bf](https://github.com/powerhouse-inc/powerhouse/commit/1ba7dc3bf))
- linting queue and awaiter now ([39b0f07ae](https://github.com/powerhouse-inc/powerhouse/commit/39b0f07ae))
- flakey test fix using fake timers ([4c7be58f3](https://github.com/powerhouse-inc/powerhouse/commit/4c7be58f3))
- regenerate prisma ([adb51a368](https://github.com/powerhouse-inc/powerhouse/commit/adb51a368))
- added more tests to confirm cross compat, and fixed an issue with create/upgrade hash mismatch ([37e39bcde](https://github.com/powerhouse-inc/powerhouse/commit/37e39bcde))
- multiple fixes for ph vetra ([#1906](https://github.com/powerhouse-inc/powerhouse/pull/1906))
- enable ph vetra command ([#1907](https://github.com/powerhouse-inc/powerhouse/pull/1907))
- use documentModelModule when creating document in processDocumentJob ([#1918](https://github.com/powerhouse-inc/powerhouse/pull/1918))
- **builder-tools:** hide @import warning ([4a507ac75](https://github.com/powerhouse-inc/powerhouse/commit/4a507ac75))
- **builder-tools:** dedupe react when linked to the monorepo ([08a6e23bb](https://github.com/powerhouse-inc/powerhouse/commit/08a6e23bb))
- **builder-tools,codegen,reactor-browser,vetra:** better error handling on useSelectedDocumentOfType ([2c2d15e06](https://github.com/powerhouse-inc/powerhouse/commit/2c2d15e06))
- **codegen:** support document-model on typemap ([43be2d482](https://github.com/powerhouse-inc/powerhouse/commit/43be2d482))
- **codegen:** do not overwrite existing subgraphs ([b4b553441](https://github.com/powerhouse-inc/powerhouse/commit/b4b553441))
- **codegen:** do not rely on global installation of prettier ([67076c5a5](https://github.com/powerhouse-inc/powerhouse/commit/67076c5a5))
- **codegen, document-model:** export actions object from document-model ([66c2b2b4b](https://github.com/powerhouse-inc/powerhouse/commit/66c2b2b4b))
- **connect:** added switchboard push listener ([c611ffa9e](https://github.com/powerhouse-inc/powerhouse/commit/c611ffa9e))
- **connect:** added switchboard push listener ([39e8660f5](https://github.com/powerhouse-inc/powerhouse/commit/39e8660f5))
- **connect, design-system, vetra:** import design system tailwind theme separately ([97857800d](https://github.com/powerhouse-inc/powerhouse/commit/97857800d))
- **connect, reactor-browser:** call useSelectedDriveSafe on unsafe contexts ([3a487e6aa](https://github.com/powerhouse-inc/powerhouse/commit/3a487e6aa))
- **connect, vetra:** update package.json and tsconfig ([637e735cd](https://github.com/powerhouse-inc/powerhouse/commit/637e735cd))
- **design-system:** include all font weights for Inter ([cdf04168b](https://github.com/powerhouse-inc/powerhouse/commit/cdf04168b))
- **document-drive:** reduce log verbosity ([29cc6ec9a](https://github.com/powerhouse-inc/powerhouse/commit/29cc6ec9a))
- **ph-cli,builder-tools:** remove ph connect implementation ([f92aa4df5](https://github.com/powerhouse-inc/powerhouse/commit/f92aa4df5))
- **ph-cmd:** ignore scalars package on ph commands ([ea2a28432](https://github.com/powerhouse-inc/powerhouse/commit/ea2a28432))
- **reactor-api:** do not use multiple loaders ([93ca742ae](https://github.com/powerhouse-inc/powerhouse/commit/93ca742ae))
- **reactor-api:** catch errors when loading packages to avoid breaking the process ([87adac5f2](https://github.com/powerhouse-inc/powerhouse/commit/87adac5f2))
- **reactor-api:** skip document model with duplicated name instead of breaking ([d0bc1ff58](https://github.com/powerhouse-inc/powerhouse/commit/d0bc1ff58))
- **reactor-api:** rename timestamp fields to follow ISO format ([86813d154](https://github.com/powerhouse-inc/powerhouse/commit/86813d154))
- **reactor-api:** catch subgraph setup errors to avoid breaking the server ([2237ff6b4](https://github.com/powerhouse-inc/powerhouse/commit/2237ff6b4))
- **reactor-api:** added auth export ([d3a13f128](https://github.com/powerhouse-inc/powerhouse/commit/d3a13f128))
- **reactor-api:** rolling back some changes that break subgraph injection ([29fd974e1](https://github.com/powerhouse-inc/powerhouse/commit/29fd974e1))
- **reactor-browser:** document switchboard query ([ab4633588](https://github.com/powerhouse-inc/powerhouse/commit/ab4633588))
- **reactor-browser:** document switchboard query ([e0929df25](https://github.com/powerhouse-inc/powerhouse/commit/e0929df25))
- **renown:** different export for nodejs ([b3a01161a](https://github.com/powerhouse-inc/powerhouse/commit/b3a01161a))
- **switchboard, ph-cli, ph-cmd, builder-tools:** ensure minimum node version ([e0fb396e7](https://github.com/powerhouse-inc/powerhouse/commit/e0fb396e7))
- **vetra:** activate codegen processor on either driveId or drive slug ([f4600228a](https://github.com/powerhouse-inc/powerhouse/commit/f4600228a))
- **vetra:** make default css styles specific to vetra ([30d598c3e](https://github.com/powerhouse-inc/powerhouse/commit/30d598c3e))
- **vetra:** get vetra package docId from selectedDrive ([4c031f5cb](https://github.com/powerhouse-inc/powerhouse/commit/4c031f5cb))
- **vetra:** added vetra package to processor filter ([0d6ab5a70](https://github.com/powerhouse-inc/powerhouse/commit/0d6ab5a70))
- **vetra:** tsconfig regression ([f669dcf64](https://github.com/powerhouse-inc/powerhouse/commit/f669dcf64))

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
- **ph-cmd:** fix wrong mocking that breaks tests ([7a5a19fb9](https://github.com/powerhouse-inc/powerhouse/commit/7a5a19fb9))
- **reactor:** fix lint error ([53777e154](https://github.com/powerhouse-inc/powerhouse/commit/53777e154))

### 🩹 Fixes

- codegen broke, fixing for reactor gql types ([86fe61c84](https://github.com/powerhouse-inc/powerhouse/commit/86fe61c84))
- reverting bad merge changes and getting reactor to build again ([eb687de4c](https://github.com/powerhouse-inc/powerhouse/commit/eb687de4c))
- lots of type fixes for modules ([8f4cf02fe](https://github.com/powerhouse-inc/powerhouse/commit/8f4cf02fe))
- part 2 of build fixes for module changes ([3000a13c3](https://github.com/powerhouse-inc/powerhouse/commit/3000a13c3))
- more type fixes ([16c562ae1](https://github.com/powerhouse-inc/powerhouse/commit/16c562ae1))
- hand-edit document-model generated stuff so as not to have a circular reference ([e9ec89590](https://github.com/powerhouse-inc/powerhouse/commit/e9ec89590))
- generating prisma client ([0a101b476](https://github.com/powerhouse-inc/powerhouse/commit/0a101b476))
- fix remaining tests ([60bf7b767](https://github.com/powerhouse-inc/powerhouse/commit/60bf7b767))
- updating codegen ([5585bd012](https://github.com/powerhouse-inc/powerhouse/commit/5585bd012))
- **builder-tools:** declare @storybook/preview-api dependency ([705ac8da1](https://github.com/powerhouse-inc/powerhouse/commit/705ac8da1))
- **document-drive:** changed default log level from 'debug' to 'info' ([dffeb1d81](https://github.com/powerhouse-inc/powerhouse/commit/dffeb1d81))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.58 (2025-09-18)

### 🚀 Features

- adding feature flag to switchboard for controlling reactorv2 api ([4486c8a8d](https://github.com/powerhouse-inc/powerhouse/commit/4486c8a8d))

### 🩹 Fixes

- fixing the utc times ([15b06d2e2](https://github.com/powerhouse-inc/powerhouse/commit/15b06d2e2))
- build fixes ([fe2cd6699](https://github.com/powerhouse-inc/powerhouse/commit/fe2cd6699))
- fixing issue where icon was breaking ([cd7d0e6ec](https://github.com/powerhouse-inc/powerhouse/commit/cd7d0e6ec))
- fixing issue with local state not being persisted ([fc6735e6c](https://github.com/powerhouse-inc/powerhouse/commit/fc6735e6c))
- document type was wrong ([ae3ffb9ee](https://github.com/powerhouse-inc/powerhouse/commit/ae3ffb9ee))
- test fix for document-drive package ([40f4b6416](https://github.com/powerhouse-inc/powerhouse/commit/40f4b6416))
- codegen package needs to copy before testing ([9115c7968](https://github.com/powerhouse-inc/powerhouse/commit/9115c7968))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.57 (2025-09-17)

### 🚀 Features

- add processor configuration support to switchboard and Vetra integration ([#1859](https://github.com/powerhouse-inc/powerhouse/pull/1859))
- **monorepo:** update release branch workflow ([e9c221ab5](https://github.com/powerhouse-inc/powerhouse/commit/e9c221ab5))
- **monorepo:** merge main ([79f6472b1](https://github.com/powerhouse-inc/powerhouse/commit/79f6472b1))
- **monorepo:** empty commit to satisfy naming ([5aa18f417](https://github.com/powerhouse-inc/powerhouse/commit/5aa18f417))

### 🩹 Fixes

- **config:** set back config field to vetraUrl to avoid breaking change ([487b996a6](https://github.com/powerhouse-inc/powerhouse/commit/487b996a6))
- **monorepo:** linting and type checking ([#1776](https://github.com/powerhouse-inc/powerhouse/pull/1776))
- **monorepo:** regenerate lockfile ([7811171ff](https://github.com/powerhouse-inc/powerhouse/commit/7811171ff))
- **monorepo:** re-add nx js plugin ([d477a49d7](https://github.com/powerhouse-inc/powerhouse/commit/d477a49d7))
- **reactor-api:** moved delete drive to mutations resolvers ([888f37a3e](https://github.com/powerhouse-inc/powerhouse/commit/888f37a3e))
- **vetra:** activate codegen processor on either driveId or drive slug ([024304ed0](https://github.com/powerhouse-inc/powerhouse/commit/024304ed0))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.56 (2025-09-17)

### 🚀 Features

- first pass implementing some of the query resolvers with client ([aa76a8fea](https://github.com/powerhouse-inc/powerhouse/commit/aa76a8fea))
- making the reactor subgraph much more descriptive in failure ([190b27e82](https://github.com/powerhouse-inc/powerhouse/commit/190b27e82))
- resolvers and full tests ([134dce888](https://github.com/powerhouse-inc/powerhouse/commit/134dce888))
- **codegen:** enable localStorage by default in withDropZone hoc ([9b105aae7](https://github.com/powerhouse-inc/powerhouse/commit/9b105aae7))

### 🩹 Fixes

- updating jobinfo type with created, complete, and result ([ebb139d1a](https://github.com/powerhouse-inc/powerhouse/commit/ebb139d1a))
- switching back to checks ([9dacd70fe](https://github.com/powerhouse-inc/powerhouse/commit/9dacd70fe))
- auto-lint fixes ([960719d58](https://github.com/powerhouse-inc/powerhouse/commit/960719d58))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.55 (2025-09-16)

### 🚀 Features

- add processor configuration support to switchboard and Vetra integration ([#1859](https://github.com/powerhouse-inc/powerhouse/pull/1859))
- enable supported document types for drag and drop feature ([#1860](https://github.com/powerhouse-inc/powerhouse/pull/1860))

### 🩹 Fixes

- add default, passthrough signer ([d9e2c4f1d](https://github.com/powerhouse-inc/powerhouse/commit/d9e2c4f1d))
- **connect:** ignore drive node drag when moving it to it's current position ([4aa387814](https://github.com/powerhouse-inc/powerhouse/commit/4aa387814))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.54 (2025-09-16)

### 🚀 Features

- app module drag and drop files ([#1834](https://github.com/powerhouse-inc/powerhouse/pull/1834))
- reactor client builder ([d93875bcd](https://github.com/powerhouse-inc/powerhouse/commit/d93875bcd))
- naive implementation of subscriptions ([5ae6dd83c](https://github.com/powerhouse-inc/powerhouse/commit/5ae6dd83c))
- update app module state to support root documentTypes ([173127a5d](https://github.com/powerhouse-inc/powerhouse/commit/173127a5d))
- subscriptions now have guaranteed delivery and output errors through a centralized error handler ([d9b0c4326](https://github.com/powerhouse-inc/powerhouse/commit/d9b0c4326))
- updating docs with error handler ([4e28b0573](https://github.com/powerhouse-inc/powerhouse/commit/4e28b0573))
- adding reactor client to subgraph args ([d0a8011e6](https://github.com/powerhouse-inc/powerhouse/commit/d0a8011e6))
- add dynamic document type icons to upload progress ([#1857](https://github.com/powerhouse-inc/powerhouse/pull/1857))

### 🩹 Fixes

- linter feedback ([5219f6322](https://github.com/powerhouse-inc/powerhouse/commit/5219f6322))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.53 (2025-09-13)

### 🩹 Fixes

- **connect:** disable search bar by default ([bd05e44aa](https://github.com/powerhouse-inc/powerhouse/commit/bd05e44aa))
- **connect-e2e:** make folder selection more specific ([7800b4696](https://github.com/powerhouse-inc/powerhouse/commit/7800b4696))
- **connect-e2e:** fix flaky tests in CI ([d970bd4d3](https://github.com/powerhouse-inc/powerhouse/commit/d970bd4d3))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.52 (2025-09-12)

### 🚀 Features

- add a bunch of failing tests for the reactor-client ([8276565a8](https://github.com/powerhouse-inc/powerhouse/commit/8276565a8))
- implemented the easy, passthrough functions ([ceb692cd1](https://github.com/powerhouse-inc/powerhouse/commit/ceb692cd1))
- pulled job awaiter out of reactor client ([bd4c206a9](https://github.com/powerhouse-inc/powerhouse/commit/bd4c206a9))
- more test fixes ([12a0acd1d](https://github.com/powerhouse-inc/powerhouse/commit/12a0acd1d))
- **vetra:** add basic support to drop documents on vetra drive ([ce10ca3ee](https://github.com/powerhouse-inc/powerhouse/commit/ce10ca3ee))

### 🩹 Fixes

- linting issues ([ba85245b4](https://github.com/powerhouse-inc/powerhouse/commit/ba85245b4))
- fixes before merge ([b6bfba102](https://github.com/powerhouse-inc/powerhouse/commit/b6bfba102))
- **connect,common,reactor-browser,vetra:** resolve app name for each drive editor ([05f3a8893](https://github.com/powerhouse-inc/powerhouse/commit/05f3a8893))
- **connect-e2e:** fix failing tests ([88c3bea94](https://github.com/powerhouse-inc/powerhouse/commit/88c3bea94))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.51 (2025-09-11)

### 🚀 Features

- **codegen:** implement default error code generation from error names in PascalCase ([7554f3ede](https://github.com/powerhouse-inc/powerhouse/commit/7554f3ede))
- **document-drive:** stop git ignoring prisma files ([7e04c226b](https://github.com/powerhouse-inc/powerhouse/commit/7e04c226b))
- **monorepo:** use consistent formatting ([d2a1182c5](https://github.com/powerhouse-inc/powerhouse/commit/d2a1182c5))
- **monorepo:** use consistent separate type imports ([6fd4ac0f4](https://github.com/powerhouse-inc/powerhouse/commit/6fd4ac0f4))
- **monorepo:** make format consistent across ignores ([98469560f](https://github.com/powerhouse-inc/powerhouse/commit/98469560f))
- **reactor-api:** initial gql codegen ([3db9e9778](https://github.com/powerhouse-inc/powerhouse/commit/3db9e9778))
- **reactor-api:** generate sdk ([ec107015c](https://github.com/powerhouse-inc/powerhouse/commit/ec107015c))
- **reactor-api:** creating an sdk factory ([34151d5d2](https://github.com/powerhouse-inc/powerhouse/commit/34151d5d2))
- **reactor-api:** tests for each level of the reactor gql sdk ([1e52b761e](https://github.com/powerhouse-inc/powerhouse/commit/1e52b761e))
- **vetra:** add basic support to drop documents on vetra drive ([ce10ca3ee](https://github.com/powerhouse-inc/powerhouse/commit/ce10ca3ee))

### 🩹 Fixes

- annoyingly, you have to add ignores to the root eslint ([bb6d993bd](https://github.com/powerhouse-inc/powerhouse/commit/bb6d993bd))
- linting fixes ([27fe7d397](https://github.com/powerhouse-inc/powerhouse/commit/27fe7d397))
- whoops, adding generated code ([ffb6ca373](https://github.com/powerhouse-inc/powerhouse/commit/ffb6ca373))
- **connect,common,reactor-browser,vetra:** resolve app name for each drive editor ([05f3a8893](https://github.com/powerhouse-inc/powerhouse/commit/05f3a8893))
- **connect,reactor-browser:** remove documentModel argument on getSwitchboardUrl ([0eb514eda](https://github.com/powerhouse-inc/powerhouse/commit/0eb514eda))
- **docs:** improve document hooks documentation ([d05fcb835](https://github.com/powerhouse-inc/powerhouse/commit/d05fcb835))
- **reactor-api:** pass generated code through prettier and eslint ([1624548c0](https://github.com/powerhouse-inc/powerhouse/commit/1624548c0))
- **reactor-api:** fix import issue in generated gql ([bad71a0cc](https://github.com/powerhouse-inc/powerhouse/commit/bad71a0cc))
- **reactor-api:** adding a tools tsconfig that doesn't emit so we can support codegen.ts ([5898dc822](https://github.com/powerhouse-inc/powerhouse/commit/5898dc822))
- **reactor-api:** fixing linter issues ([5c0f1a074](https://github.com/powerhouse-inc/powerhouse/commit/5c0f1a074))
- **reactor-api:** fixing more linter issues ([aeb093426](https://github.com/powerhouse-inc/powerhouse/commit/aeb093426))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Callme-T
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter

## 5.0.0-staging.9 (2025-09-09)

### 🩹 Fixes

- **codegen:** do not overwrite existing processors ([4c74b8c4d](https://github.com/powerhouse-inc/powerhouse/commit/4c74b8c4d))
- **design-system:** improve drop zone validation and event handling ([75cd1e4c6](https://github.com/powerhouse-inc/powerhouse/commit/75cd1e4c6))

### ❤️ Thank You

- Frank
- Guillermo Puente @gpuente

## 5.0.0-staging.8 (2025-09-09)

This was a version bump only, there were no code changes.

## 5.0.0-staging.7 (2025-09-09)

### 🚀 Features

- e2e integration test of document drive actions ([7b15c6c74](https://github.com/powerhouse-inc/powerhouse/commit/7b15c6c74))
- added job execution handle ([4fadd6638](https://github.com/powerhouse-inc/powerhouse/commit/4fadd6638))
- drain, block, unblock on queue ([77ad8f9bc](https://github.com/powerhouse-inc/powerhouse/commit/77ad8f9bc))
- moving to job execution handles ([f91c3a759](https://github.com/powerhouse-inc/powerhouse/commit/f91c3a759))
- tests for job execution handle ([5af69c190](https://github.com/powerhouse-inc/powerhouse/commit/5af69c190))
- update queue to use job handles ([acbe50ee1](https://github.com/powerhouse-inc/powerhouse/commit/acbe50ee1))

### 🩹 Fixes

- fix eventbus benchmarks, remove old benchmark ([5a85f498e](https://github.com/powerhouse-inc/powerhouse/commit/5a85f498e))
- automated linting fixes ([d9c123692](https://github.com/powerhouse-inc/powerhouse/commit/d9c123692))
- tons of linting fixes ([38c7981e3](https://github.com/powerhouse-inc/powerhouse/commit/38c7981e3))
- more linting issues ([5dd874517](https://github.com/powerhouse-inc/powerhouse/commit/5dd874517))
- **reactor-api:** delete drive mutation not working ([84cdf6c5a](https://github.com/powerhouse-inc/powerhouse/commit/84cdf6c5a))
- **reactor-api,reactor/browser:** update open in switchboard url ([f42897b29](https://github.com/powerhouse-inc/powerhouse/commit/f42897b29))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank

## 5.0.0-staging.6 (2025-09-08)

### 🩹 Fixes

- **reactor-browser:** use fallback when window.showSaveFilePicker is not available ([78164031c](https://github.com/powerhouse-inc/powerhouse/commit/78164031c))

### ❤️ Thank You

- acaldas @acaldas

## 5.0.0-staging.5 (2025-09-08)

This was a version bump only, there were no code changes.

## 5.0.0-staging.4 (2025-09-08)

### 🩹 Fixes

- fix eventbus benchmarks, remove old benchmark ([5a85f498e](https://github.com/powerhouse-inc/powerhouse/commit/5a85f498e))
- automated linting fixes ([d9c123692](https://github.com/powerhouse-inc/powerhouse/commit/d9c123692))
- tons of linting fixes ([38c7981e3](https://github.com/powerhouse-inc/powerhouse/commit/38c7981e3))
- more linting issues ([5dd874517](https://github.com/powerhouse-inc/powerhouse/commit/5dd874517))
- **reactor-api,reactor/browser:** update open in switchboard url ([f42897b29](https://github.com/powerhouse-inc/powerhouse/commit/f42897b29))
- **reactor-browser:** use fallback when window.showSaveFilePicker is not available ([78164031c](https://github.com/powerhouse-inc/powerhouse/commit/78164031c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 5.0.0-staging.3 (2025-09-08)

### 🩹 Fixes

- **reactor-browser:** switchboard url link ([b49ffa958](https://github.com/powerhouse-inc/powerhouse/commit/b49ffa958))

### ❤️ Thank You

- Frank

## 5.0.0-staging.2 (2025-09-05)

### 🚀 Features

- queue now queues by doc id ([afc03e437](https://github.com/powerhouse-inc/powerhouse/commit/afc03e437))
- wip dependency graph ([939e41076](https://github.com/powerhouse-inc/powerhouse/commit/939e41076))
- added robust dependency system to queue ([4aca91494](https://github.com/powerhouse-inc/powerhouse/commit/4aca91494))
- plug in persistence ([5af292734](https://github.com/powerhouse-inc/powerhouse/commit/5af292734))
- **reactor-api:** added nodeName to document query ([3d303c7e2](https://github.com/powerhouse-inc/powerhouse/commit/3d303c7e2))
- **reactor-browser:** accept documentId on dispatchActions ([a579dd53c](https://github.com/powerhouse-inc/powerhouse/commit/a579dd53c))

### 🩹 Fixes

- build errors ([97b4853a3](https://github.com/powerhouse-inc/powerhouse/commit/97b4853a3))
- **codegen:** remove .jsx imports ([880a98fe0](https://github.com/powerhouse-inc/powerhouse/commit/880a98fe0))
- **connect:** build issues ([858a36b99](https://github.com/powerhouse-inc/powerhouse/commit/858a36b99))
- **connect,reactor-browser:** add duplicated documents to reactor when nodes on a drive are duplicated ([ddb882f75](https://github.com/powerhouse-inc/powerhouse/commit/ddb882f75))
- **connect,reactor-browser:** fixed clearStorage on connect ([70588c663](https://github.com/powerhouse-inc/powerhouse/commit/70588c663))
- **connect,reactor-browser:** fixed node actions and zip upload ([3664d1238](https://github.com/powerhouse-inc/powerhouse/commit/3664d1238))
- **docs:** added zip redundancy to release notes ([3acfe1027](https://github.com/powerhouse-inc/powerhouse/commit/3acfe1027))
- **reactor-api:** node not found ([6c5a24a4e](https://github.com/powerhouse-inc/powerhouse/commit/6c5a24a4e))
- **reactor-api:** error logging on package load ([b56cf77c6](https://github.com/powerhouse-inc/powerhouse/commit/b56cf77c6))
- **reactor-browser:** do not show all nodes on drive root ([da55217c8](https://github.com/powerhouse-inc/powerhouse/commit/da55217c8))
- **reactor-browser,document-drive,design-system,common,connect:** fixed get drive sharing type logic ([134d15ded](https://github.com/powerhouse-inc/powerhouse/commit/134d15ded))
- **reactor-browser,renown,connect:** add bearer token to switchboard link ([59f35e3b7](https://github.com/powerhouse-inc/powerhouse/commit/59f35e3b7))
- **vetra:** do not include tsconfig and eslint on dist ([ace03e88a](https://github.com/powerhouse-inc/powerhouse/commit/ace03e88a))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Callme-T
- Frank

## 5.0.0-staging.1 (2025-09-04)

This was a version bump only, there were no code changes.

## 4.1.0-dev.44 (2025-09-04)

### 🚀 Features

- **reactor-browser,connect:** reduced jwt expiry time to 10seconds ([a833a71fe](https://github.com/powerhouse-inc/powerhouse/commit/a833a71fe))
- **switchboard:** updated readme ([9659cf035](https://github.com/powerhouse-inc/powerhouse/commit/9659cf035))

### 🩹 Fixes

- **connect:** only show add drive modal when apps are loaded ([b888806fb](https://github.com/powerhouse-inc/powerhouse/commit/b888806fb))
- **connect:** import document model editor styles ([#1808](https://github.com/powerhouse-inc/powerhouse/pull/1808))
- **reactor-api:** auth flow ([bbda4f2a1](https://github.com/powerhouse-inc/powerhouse/commit/bbda4f2a1))
- **reactor-api:** disable cache ([7fa75b69f](https://github.com/powerhouse-inc/powerhouse/commit/7fa75b69f))
- **reactor-api:** auth enabled false ([ff9ddfc58](https://github.com/powerhouse-inc/powerhouse/commit/ff9ddfc58))
- **renown:** automatically login after reload ([f20dc4fcc](https://github.com/powerhouse-inc/powerhouse/commit/f20dc4fcc))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.43 (2025-09-02)

### 🚀 Features

- first mutation queued... ([a678882a3](https://github.com/powerhouse-inc/powerhouse/commit/a678882a3))
- **connect,reactor-browser,renown:** added jwt expiry ([ec9483c1c](https://github.com/powerhouse-inc/powerhouse/commit/ec9483c1c))
- **reactor-api:** added renown credential auth check ([af266ae5b](https://github.com/powerhouse-inc/powerhouse/commit/af266ae5b))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank

## 4.1.0-dev.42 (2025-09-02)

### 🩹 Fixes

- **reactor-api:** use proper issuer field ([a1e36efe0](https://github.com/powerhouse-inc/powerhouse/commit/a1e36efe0))
- **reactor-api:** use issuer field ([495a93337](https://github.com/powerhouse-inc/powerhouse/commit/495a93337))

### ❤️ Thank You

- Frank

## 4.1.0-dev.41 (2025-09-02)

### 🚀 Features

- **reactor-api:** added auth service ([a0863f6e3](https://github.com/powerhouse-inc/powerhouse/commit/a0863f6e3))

### 🩹 Fixes

- **document-drive:** add linux-musl binary target for prisma ([079b0cf04](https://github.com/powerhouse-inc/powerhouse/commit/079b0cf04))
- **document-drive:** prisma build ([7884368a2](https://github.com/powerhouse-inc/powerhouse/commit/7884368a2))
- **document-drive:** install openssl ([89f21529e](https://github.com/powerhouse-inc/powerhouse/commit/89f21529e))
- **switchboard, connect:** fetch proper tag ([79a0bc967](https://github.com/powerhouse-inc/powerhouse/commit/79a0bc967))

### ❤️ Thank You

- Frank

## 4.1.0-dev.40 (2025-09-02)

### 🩹 Fixes

- **switchboard:** added openssl to dockerfile ([a10230c60](https://github.com/powerhouse-inc/powerhouse/commit/a10230c60))

### ❤️ Thank You

- Frank

## 4.1.0-dev.39 (2025-09-02)

### 🩹 Fixes

- **switchboard:** added db push to switchboard entrypoint ([d109e4afb](https://github.com/powerhouse-inc/powerhouse/commit/d109e4afb))

### ❤️ Thank You

- Frank

## 4.1.0-dev.38 (2025-08-30)

### 🚀 Features

- implementing find facade on IReactor ([eed25fdae](https://github.com/powerhouse-inc/powerhouse/commit/eed25fdae))
- reactor find fixes ([9560ccb0f](https://github.com/powerhouse-inc/powerhouse/commit/9560ccb0f))
- gql-gen spec ([5bf2c7226](https://github.com/powerhouse-inc/powerhouse/commit/5bf2c7226))
- **reactor:** impstubbing out initial interface and types ([b74b194f9](https://github.com/powerhouse-inc/powerhouse/commit/b74b194f9))
- **reactor:** we have a reactor facade ([7a61e68ab](https://github.com/powerhouse-inc/powerhouse/commit/7a61e68ab))
- **reactor:** update mutate on facade ([aab0d7553](https://github.com/powerhouse-inc/powerhouse/commit/aab0d7553))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.37 (2025-08-29)

### 🩹 Fixes

- fixing synchronization post-refactor ([a4ad046e0](https://github.com/powerhouse-inc/powerhouse/commit/a4ad046e0))
- enhance codegen processor reliability and error handling ([8baef31d6](https://github.com/powerhouse-inc/powerhouse/commit/8baef31d6))
- **reactor-api:** loading local modules ([26e3e30a6](https://github.com/powerhouse-inc/powerhouse/commit/26e3e30a6))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.36 (2025-08-28)

### 🩹 Fixes

- **reactor-browser:** root issue is creating a new array every time getSnapshot was called, plus some cleanup ([d7b5c5636](https://github.com/powerhouse-inc/powerhouse/commit/d7b5c5636))
- **reactor-browser:** we need to better handle errors in the IDB implementation, this is throwing ([42fcaf7a8](https://github.com/powerhouse-inc/powerhouse/commit/42fcaf7a8))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.35 (2025-08-27)

### 🚀 Features

- replaced vetra icon svg ([bb61632ea](https://github.com/powerhouse-inc/powerhouse/commit/bb61632ea))
- **ph-cmd:** add dynamic package detection for use command ([#1792](https://github.com/powerhouse-inc/powerhouse/pull/1792))

### 🩹 Fixes

- linter fixes ([7dc6fac02](https://github.com/powerhouse-inc/powerhouse/commit/7dc6fac02))
- fixing push/pull tests ([fa3c8f8e7](https://github.com/powerhouse-inc/powerhouse/commit/fa3c8f8e7))
- **builder-tools:** fixes based on type changes ([61f95be48](https://github.com/powerhouse-inc/powerhouse/commit/61f95be48))
- **codegen:** updating codegen with type fix ([3dc9b5f2d](https://github.com/powerhouse-inc/powerhouse/commit/3dc9b5f2d))
- **common:** type refactor for common ([c52c700b9](https://github.com/powerhouse-inc/powerhouse/commit/c52c700b9))
- **reactor-api:** updates for type shuffle ([44da3c0c2](https://github.com/powerhouse-inc/powerhouse/commit/44da3c0c2))
- **reactor-mcp:** updates for type shuffle ([fc9d5c660](https://github.com/powerhouse-inc/powerhouse/commit/fc9d5c660))
- **switchboard, ph-cli:** slight type fixes ([b1bf76f1b](https://github.com/powerhouse-inc/powerhouse/commit/b1bf76f1b))
- **vetra:** regenerate and fix all document models ([b28d67aac](https://github.com/powerhouse-inc/powerhouse/commit/b28d67aac))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.34 (2025-08-26)

### 🩹 Fixes

- updated document editor templates ([470583a25](https://github.com/powerhouse-inc/powerhouse/commit/470583a25))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.33 (2025-08-21)

### 🚀 Features

- add configurable drive preservation strategy for vetra ([aa8676a13](https://github.com/powerhouse-inc/powerhouse/commit/aa8676a13))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 4.1.0-dev.32 (2025-08-21)

### 🚀 Features

- **vetra:** restrict document editor to single document type selection ([7280e5a26](https://github.com/powerhouse-inc/powerhouse/commit/7280e5a26))

### 🩹 Fixes

- updating the remainder of the projects with these breaking changes ([0d750fa6c](https://github.com/powerhouse-inc/powerhouse/commit/0d750fa6c))
- **ph-cli:** read reactor port from config file in vetra command ([efacf3ceb](https://github.com/powerhouse-inc/powerhouse/commit/efacf3ceb))
- **ph-cli:** resolve local document model loading in switchboard and vetra ([262f13035](https://github.com/powerhouse-inc/powerhouse/commit/262f13035))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.31 (2025-08-20)

### 🚀 Features

- added interactive mode to vetra command ([#1775](https://github.com/powerhouse-inc/powerhouse/pull/1775))

### 🩹 Fixes

- **codegen:** document drive templates ([0561a1991](https://github.com/powerhouse-inc/powerhouse/commit/0561a1991))
- **connect:** preserve built-in packages during hmr updates ([8398c0f06](https://github.com/powerhouse-inc/powerhouse/commit/8398c0f06))
- **reactor-browser:** get drive id from drive document ([82c785e67](https://github.com/powerhouse-inc/powerhouse/commit/82c785e67))
- **vetra:** improve error handling in document generation processors ([518c875f3](https://github.com/powerhouse-inc/powerhouse/commit/518c875f3))

### ❤️ Thank You

- Guillermo Puente @gpuente
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

- use patname secret instead of github token ([db9dfd5cd](https://github.com/powerhouse-inc/powerhouse/commit/db9dfd5cd))
- proper tag for docker images ([e73e10617](https://github.com/powerhouse-inc/powerhouse/commit/e73e10617))
- use github tag properly ([95ccff4b8](https://github.com/powerhouse-inc/powerhouse/commit/95ccff4b8))
- extract metadata tags and labels for docker ([bb9c81ce7](https://github.com/powerhouse-inc/powerhouse/commit/bb9c81ce7))
- **vetra:** document handling and module resolution ([0f686b5fb](https://github.com/powerhouse-inc/powerhouse/commit/0f686b5fb))

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
- **codegen:** update templates ([d789b7a48](https://github.com/powerhouse-inc/powerhouse/commit/d789b7a48))
- **connect:** remove unused dep ([ef492bc7a](https://github.com/powerhouse-inc/powerhouse/commit/ef492bc7a))
- **connect:** set selected drive with drive object where possible ([f1ea28672](https://github.com/powerhouse-inc/powerhouse/commit/f1ea28672))
- **connect:** remove useless useCallbacks ([316e5155f](https://github.com/powerhouse-inc/powerhouse/commit/316e5155f))
- **connect:** remove broken electron code ([3f28d6a46](https://github.com/powerhouse-inc/powerhouse/commit/3f28d6a46))
- **connect:** remove redundant global types ([48e8ed60b](https://github.com/powerhouse-inc/powerhouse/commit/48e8ed60b))
- **connect,reactor-browser:** remove more old electron garbage ([5cd255568](https://github.com/powerhouse-inc/powerhouse/commit/5cd255568))
- **connect,state,reactor-browser:** eliminate jotai ([53b1ab759](https://github.com/powerhouse-inc/powerhouse/commit/53b1ab759))
- **connect,state,renown:** add state hook for renown ([5beb1252b](https://github.com/powerhouse-inc/powerhouse/commit/5beb1252b))
- **reactor-browser:** organize events code ([3775bc01d](https://github.com/powerhouse-inc/powerhouse/commit/3775bc01d))
- **reactor-browser:** add app config hooks ([911800ba7](https://github.com/powerhouse-inc/powerhouse/commit/911800ba7))
- **reactor-browser,connect:** remove wasted code ([5a628b3fb](https://github.com/powerhouse-inc/powerhouse/commit/5a628b3fb))
- **reactor-browser,connect:** add dispatch function to state hooks ([46ba715ec](https://github.com/powerhouse-inc/powerhouse/commit/46ba715ec))
- **reactor-browser,connect:** simplify login ([975f04b93](https://github.com/powerhouse-inc/powerhouse/commit/975f04b93))
- **reactor-browser,connect:** move connect crypto to reactor browser ([c3c913892](https://github.com/powerhouse-inc/powerhouse/commit/c3c913892))
- **reactor-browser,connect,vetra:** move state hooks into reactor browser and eliminate redundant and dead code ([30fa16f1f](https://github.com/powerhouse-inc/powerhouse/commit/30fa16f1f))
- **state:** add ph packages atoms ([e7a0bc96f](https://github.com/powerhouse-inc/powerhouse/commit/e7a0bc96f))
- **state:** use ph packages atoms ([6421fbeea](https://github.com/powerhouse-inc/powerhouse/commit/6421fbeea))
- **state:** rename to vetra packages ([c415b7dc2](https://github.com/powerhouse-inc/powerhouse/commit/c415b7dc2))
- **state:** watch document models and add to reactor when changes ([21b7f51ac](https://github.com/powerhouse-inc/powerhouse/commit/21b7f51ac))
- **state:** add fallback editor ([69b5f93be](https://github.com/powerhouse-inc/powerhouse/commit/69b5f93be))
- **state:** use default drive editor module id ([3b3062dd3](https://github.com/powerhouse-inc/powerhouse/commit/3b3062dd3))
- **state:** update readme ([df04aa491](https://github.com/powerhouse-inc/powerhouse/commit/df04aa491))
- **state,connect,reactor-browser:** eliminate jotai ([#1754](https://github.com/powerhouse-inc/powerhouse/pull/1754))
- **vetra:** added debounce ([e58427b7f](https://github.com/powerhouse-inc/powerhouse/commit/e58427b7f))

### 🩹 Fixes

- today claude taught me I could mock a package to fix circular references ([dcb83174c](https://github.com/powerhouse-inc/powerhouse/commit/dcb83174c))
- **connect:** re-add removed renown hook ([8f26d5461](https://github.com/powerhouse-inc/powerhouse/commit/8f26d5461))
- **connect:** stray log ([31c1740a9](https://github.com/powerhouse-inc/powerhouse/commit/31c1740a9))
- **connect:** stray log ([078cd6f77](https://github.com/powerhouse-inc/powerhouse/commit/078cd6f77))
- **connect:** lint issue ([ee0bf5133](https://github.com/powerhouse-inc/powerhouse/commit/ee0bf5133))
- **connect:** fixing linter and type issue ([ba3603a96](https://github.com/powerhouse-inc/powerhouse/commit/ba3603a96))
- **document-drive:** fix sync push issue ([76d1b16f7](https://github.com/powerhouse-inc/powerhouse/commit/76d1b16f7))
- **monorepo:** numerous build issues ([04349dd25](https://github.com/powerhouse-inc/powerhouse/commit/04349dd25))
- **monorepo:** bugs from wrong usage of types ([f29fbd145](https://github.com/powerhouse-inc/powerhouse/commit/f29fbd145))
- **vetra:** document type selection ([8eb33d1a8](https://github.com/powerhouse-inc/powerhouse/commit/8eb33d1a8))
- **vetra,reactor-browser,builder-tools:** use base state type ([0ed258c14](https://github.com/powerhouse-inc/powerhouse/commit/0ed258c14))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Frank
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.23 (2025-08-19)

### 🚀 Features

- **vetra:** implement document type selection in editors ([bcd1879a1](https://github.com/powerhouse-inc/powerhouse/commit/bcd1879a1))

### 🩹 Fixes

- remove old commented out code ([9bb8d7665](https://github.com/powerhouse-inc/powerhouse/commit/9bb8d7665))
- apply refactoring to document-drive ([0175b6eff](https://github.com/powerhouse-inc/powerhouse/commit/0175b6eff))
- fix downstream consequences of getting rid of extended state ([2177d6e41](https://github.com/powerhouse-inc/powerhouse/commit/2177d6e41))
- **document-drive:** fixing misspelling in gql query ([35c5dc708](https://github.com/powerhouse-inc/powerhouse/commit/35c5dc708))
- **vetra:** prevent browser refresh when adding new document or editors ([ef979fc39](https://github.com/powerhouse-inc/powerhouse/commit/ef979fc39))
- **vetra:** handle optional author properties in package manifest generation ([39c64a30f](https://github.com/powerhouse-inc/powerhouse/commit/39c64a30f))
- **vetra:** build fixes for updates ([0a32b5570](https://github.com/powerhouse-inc/powerhouse/commit/0a32b5570))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.22 (2025-08-15)

### 🩹 Fixes

- **vetra:** use app id in editor app ([#1767](https://github.com/powerhouse-inc/powerhouse/pull/1767))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.21 (2025-08-15)

### 🚀 Features

- **academy:** hooks documentation ([a517eadce](https://github.com/powerhouse-inc/powerhouse/commit/a517eadce))
- **document-drive:** the DocumentAlreadyExistsErrors now tell you if it was the slug or id that is not unique ([2f1600b2d](https://github.com/powerhouse-inc/powerhouse/commit/2f1600b2d))
- **vetra:** update vetra document models with new status field ([#1765](https://github.com/powerhouse-inc/powerhouse/pull/1765))
- **vetra:** update manifest when new module is added ([#1766](https://github.com/powerhouse-inc/powerhouse/pull/1766))

### 🩹 Fixes

- fixed debug launch configuration now that source maps are in the proper locations ([c75d793ed](https://github.com/powerhouse-inc/powerhouse/commit/c75d793ed))
- **academy:** subgraphs documentation update ([4f3a024ab](https://github.com/powerhouse-inc/powerhouse/commit/4f3a024ab))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Callme-T
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.20 (2025-08-15)

### 🚀 Features

- added app document to vetra package ([#1762](https://github.com/powerhouse-inc/powerhouse/pull/1762))

### 🩹 Fixes

- fixing all the other projects so that they build with action / operation refactor ([c185b3552](https://github.com/powerhouse-inc/powerhouse/commit/c185b3552))
- linter ([158db2a21](https://github.com/powerhouse-inc/powerhouse/commit/158db2a21))
- **codegen:** codegen update for operations change ([689df960c](https://github.com/powerhouse-inc/powerhouse/commit/689df960c))
- **document-drive:** deleting loads of duplicate tests, fixing some document drive compatibility issues ([d7212e639](https://github.com/powerhouse-inc/powerhouse/commit/d7212e639))
- **document-drive:** fix major issue where operation needed submitted to reducer options ([30453f708](https://github.com/powerhouse-inc/powerhouse/commit/30453f708))
- **document-drive:** fix remaining document-drive tests ([8265f133c](https://github.com/powerhouse-inc/powerhouse/commit/8265f133c))
- **document-model:** unit tests need to use the same objects ([e9e176ab9](https://github.com/powerhouse-inc/powerhouse/commit/e9e176ab9))
- **document-model:** remaining tests follow the same format ([81ea445bf](https://github.com/powerhouse-inc/powerhouse/commit/81ea445bf))
- **vetra:** fixing compile issues due to operation action split ([73ff839ba](https://github.com/powerhouse-inc/powerhouse/commit/73ff839ba))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.19 (2025-08-14)

### 🩹 Fixes

- **academy:** subgraph example ([ae3e24458](https://github.com/powerhouse-inc/powerhouse/commit/ae3e24458))
- **connect:** deduplicate operations fix ([d226b4d7c](https://github.com/powerhouse-inc/powerhouse/commit/d226b4d7c))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 4.1.0-dev.18 (2025-08-14)

### 🚀 Features

- added subgraph module to vetra package ([#1757](https://github.com/powerhouse-inc/powerhouse/pull/1757))
- added processor document model in vetra package ([#1758](https://github.com/powerhouse-inc/powerhouse/pull/1758))
- **vetra:** initialize PH app and set selected node on document open ([ae5f1cf05](https://github.com/powerhouse-inc/powerhouse/commit/ae5f1cf05))

### 🩹 Fixes

- overly aggressive linter fixes ([e074de3df](https://github.com/powerhouse-inc/powerhouse/commit/e074de3df))
- **builder-tools:** use correct config path when regenerating external packages ([afbe7ea04](https://github.com/powerhouse-inc/powerhouse/commit/afbe7ea04))
- **builder-tools:** support cjs requires of react and react-dom on external packages and enable sourcemap ([d9b84a69f](https://github.com/powerhouse-inc/powerhouse/commit/d9b84a69f))
- **builder-tools:** use correct config path when regenerating external packages ([4e89c38f0](https://github.com/powerhouse-inc/powerhouse/commit/4e89c38f0))
- **document-drive:** disallow document creation with invalid names ([1abeeb108](https://github.com/powerhouse-inc/powerhouse/commit/1abeeb108))
- **document-drive:** whoops -- allow spaces as well ([edb3a5243](https://github.com/powerhouse-inc/powerhouse/commit/edb3a5243))
- **reactor-api:** forward auth token from gateway to subgraphs ([e2986955c](https://github.com/powerhouse-inc/powerhouse/commit/e2986955c))
- **reactor-api:** add missing actionId field to GraphQL operation types ([12060376c](https://github.com/powerhouse-inc/powerhouse/commit/12060376c))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.17 (2025-08-12)

### 🚀 Features

- refactor vetra command and remove vetra deps in connect and reactor ([#1753](https://github.com/powerhouse-inc/powerhouse/pull/1753))

### 🩹 Fixes

- downstream fixes in other package from signature change ([4048d4152](https://github.com/powerhouse-inc/powerhouse/commit/4048d4152))
- **ph-cli:** added port option to connect command ([19a84f950](https://github.com/powerhouse-inc/powerhouse/commit/19a84f950))
- **ph-cmd:** use --branch instead of --version on ph init ([29bd9b236](https://github.com/powerhouse-inc/powerhouse/commit/29bd9b236))
- **reactor-browser:** updated signature function call to new format ([4b1ce55c0](https://github.com/powerhouse-inc/powerhouse/commit/4b1ce55c0))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.16 (2025-08-12)

### 🚀 Features

- **codegen:** deduplicate operation errors and import them automatically with ts-morph ([e813b22b4](https://github.com/powerhouse-inc/powerhouse/commit/e813b22b4))

### 🩹 Fixes

- **codegen:** Unexpected BlockString ([00a31bba5](https://github.com/powerhouse-inc/powerhouse/commit/00a31bba5))

### ❤️ Thank You

- acaldas @acaldas
- Frank

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

### 🚀 Features

- **codegen,ph-cli:** add reducer code on codegen if it is set and allow --force option to overwrite reducers ([12751a8f5](https://github.com/powerhouse-inc/powerhouse/commit/12751a8f5))
- **vetra:** run switchboard in dev mode to load local document models ([741c2ceb3](https://github.com/powerhouse-inc/powerhouse/commit/741c2ceb3))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.12 (2025-08-08)

### 🩹 Fixes

- linter fixes ([56366e88d](https://github.com/powerhouse-inc/powerhouse/commit/56366e88d))
- **connect:** dynamically load vetra to avoid build issues ([98f8521c5](https://github.com/powerhouse-inc/powerhouse/commit/98f8521c5))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.11 (2025-08-07)

### 🚀 Features

- integrate package documents into reactor system ([939fe8e80](https://github.com/powerhouse-inc/powerhouse/commit/939fe8e80))
- add vetra drive editor support and fix preferredEditor handling ([bd0d9fe9f](https://github.com/powerhouse-inc/powerhouse/commit/bd0d9fe9f))
- added setSelectedNode to driveContext (remove this after integration with powerhousedao/state) ([69f0c6b3a](https://github.com/powerhouse-inc/powerhouse/commit/69f0c6b3a))
- vetra package documents and app integration ([0e4053302](https://github.com/powerhouse-inc/powerhouse/commit/0e4053302))
- **codegen:** implement generateManifest function for creating and updating Powerhouse manifests ([27b2f5650](https://github.com/powerhouse-inc/powerhouse/commit/27b2f5650))
- **connect:** integrate Vetra package documents and editors ([2ecb9bd15](https://github.com/powerhouse-inc/powerhouse/commit/2ecb9bd15))
- **ph-cli:** added verbose option to vetra command ([7310ec06c](https://github.com/powerhouse-inc/powerhouse/commit/7310ec06c))
- **switchboard:** added dev mode to switchboard where local document models are loaded ([449e730b6](https://github.com/powerhouse-inc/powerhouse/commit/449e730b6))
- **switchboard,reactor-local,reactor-api:** moved vite loader to reactor-api package ([c84f0a2a3](https://github.com/powerhouse-inc/powerhouse/commit/c84f0a2a3))
- **vetra:** add document-editor document model and refactor operations ([03017dcf2](https://github.com/powerhouse-inc/powerhouse/commit/03017dcf2))
- **vetra:** enabled support for new documents in codegen processor ([dd63103ac](https://github.com/powerhouse-inc/powerhouse/commit/dd63103ac))
- **vetra:** enabled codegen for document editors ([0f704353a](https://github.com/powerhouse-inc/powerhouse/commit/0f704353a))
- **vetra:** added vetra drive editor ([4ebafd143](https://github.com/powerhouse-inc/powerhouse/commit/4ebafd143))
- **vetra:** enhance logging and update ignored paths in server configuration ([4e1e0024b](https://github.com/powerhouse-inc/powerhouse/commit/4e1e0024b))

### 🩹 Fixes

- merge conflicts ([f003aeb76](https://github.com/powerhouse-inc/powerhouse/commit/f003aeb76))
- **document-drive:** implement documentType filter in listener manager ([5e801886e](https://github.com/powerhouse-inc/powerhouse/commit/5e801886e))
- **document-drive:** fix return value createDocument with documentType ([b4fcfecfc](https://github.com/powerhouse-inc/powerhouse/commit/b4fcfecfc))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

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

### 🚀 Features

- **ph-cli:** add functions to update and remove CSS imports in styles.css during install/uninstall ([3643a44c8](https://github.com/powerhouse-inc/powerhouse/commit/3643a44c8))
- **reactor-api:** add delete drive mutation on system subgraph ([97640da41](https://github.com/powerhouse-inc/powerhouse/commit/97640da41))
- **switchboard,config,reactor-api:** handle auth in reactor-api ([f33c921ee](https://github.com/powerhouse-inc/powerhouse/commit/f33c921ee))

### 🩹 Fixes

- **builder-tools:** update css bundling process and html head injection ([09b508038](https://github.com/powerhouse-inc/powerhouse/commit/09b508038))
- **connect:** fix document upload regression ([2f8c97fad](https://github.com/powerhouse-inc/powerhouse/commit/2f8c97fad))
- **reactor-mcp:** improved error message when remote drive is not available ([bb6861655](https://github.com/powerhouse-inc/powerhouse/commit/bb6861655))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente

## 4.1.0-dev.7 (2025-08-06)

### 🚀 Features

- **switchboard:** added readme ([fbadfca11](https://github.com/powerhouse-inc/powerhouse/commit/fbadfca11))

### ❤️ Thank You

- Frank

## 4.1.0-dev.6 (2025-08-06)

### 🚀 Features

- **codegen:** added generation of document model subgraphs to vetra processor ([0efa4b56e](https://github.com/powerhouse-inc/powerhouse/commit/0efa4b56e))
- **reactor-local,reactor-api,document-drive:** reload local document models when they change ([5d9af3951](https://github.com/powerhouse-inc/powerhouse/commit/5d9af3951))
- **reactor-mcp:** load local document models and reload when they change ([0408a017c](https://github.com/powerhouse-inc/powerhouse/commit/0408a017c))
- **state:** remove dishonest generics ([780ea4ed7](https://github.com/powerhouse-inc/powerhouse/commit/780ea4ed7))
- **state:** update readme docs ([5f060220d](https://github.com/powerhouse-inc/powerhouse/commit/5f060220d))
- **vetra:** do not include all json files in vetra ts config ([6178e7cdd](https://github.com/powerhouse-inc/powerhouse/commit/6178e7cdd))

### 🩹 Fixes

- **codegen:** added driveId to getDocuments Query ([7e84ce2df](https://github.com/powerhouse-inc/powerhouse/commit/7e84ce2df))
- **document-model:** added missing operation schemas ([5f5a7207f](https://github.com/powerhouse-inc/powerhouse/commit/5f5a7207f))
- **ph-cli:** restart services ([1c5016dd0](https://github.com/powerhouse-inc/powerhouse/commit/1c5016dd0))
- **reactor-api:** debounce updateRouter calls and improved logging ([d3ab9978c](https://github.com/powerhouse-inc/powerhouse/commit/d3ab9978c))
- **reactor/mcp:** improved mcp instructions ([c08155e7c](https://github.com/powerhouse-inc/powerhouse/commit/c08155e7c))
- **state:** formatting mistake ([d3ab58292](https://github.com/powerhouse-inc/powerhouse/commit/d3ab58292))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- ryanwolhuter @ryanwolhuter

## 4.1.0-dev.5 (2025-08-05)

### 🚀 Features

- **document-model:** updated document model module ([f8827bf9f](https://github.com/powerhouse-inc/powerhouse/commit/f8827bf9f))
- **reactor-mcp:** provide generic reactor mcp instead of document-model specific ([eaeb0065b](https://github.com/powerhouse-inc/powerhouse/commit/eaeb0065b))
- **reactor-mcp:** changed addAction tool to addActions for more efficient tool calling and reduced output result to optimize token usage ([1bf58fe6e](https://github.com/powerhouse-inc/powerhouse/commit/1bf58fe6e))
- **reactor-mcp:** allow setting remote drive to connect to ([6d0516ffc](https://github.com/powerhouse-inc/powerhouse/commit/6d0516ffc))

### 🩹 Fixes

- **reactor-mcp:** made action input non restrictive ([46d48b757](https://github.com/powerhouse-inc/powerhouse/commit/46d48b757))

### ❤️ Thank You

- acaldas @acaldas

## 4.1.0-dev.4 (2025-08-02)

### 🚀 Features

- ts morph integration ([#1729](https://github.com/powerhouse-inc/powerhouse/pull/1729))

### 🩹 Fixes

- **reactor-mcp:** make test:watch the test watcher, and test the single shot, so that the root test:all does not hang ([fcb997186](https://github.com/powerhouse-inc/powerhouse/commit/fcb997186))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente Sandoval @gpuente

## 4.1.0-dev.3 (2025-08-01)

### 🚀 Features

- **reactor-mcp:** setup of modular reactor tools ([ceab98b08](https://github.com/powerhouse-inc/powerhouse/commit/ceab98b08))
- **reactor-mcp:** implemented remaining reactor mcp tools ([aca00a96e](https://github.com/powerhouse-inc/powerhouse/commit/aca00a96e))

### 🩹 Fixes

- linter errors from refactor ([11e8a1b16](https://github.com/powerhouse-inc/powerhouse/commit/11e8a1b16))
- **codegen:** generate actions and documents without the third type parameter ([4bf98510c](https://github.com/powerhouse-inc/powerhouse/commit/4bf98510c))
- **connect:** fix document upload regression ([6743d0061](https://github.com/powerhouse-inc/powerhouse/commit/6743d0061))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)

## 4.1.0-dev.2 (2025-07-31)

### 🚀 Features

- **reactor-mcp,document/model:** initial implementation of reactor mcp ([4eaab9ab0](https://github.com/powerhouse-inc/powerhouse/commit/4eaab9ab0))

### 🩹 Fixes

- remove operation scope from codegen output ([3127fd20d](https://github.com/powerhouse-inc/powerhouse/commit/3127fd20d))
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

### 🩹 Fixes

- **connect:** fix fat finger mistake ([c315d95bc](https://github.com/powerhouse-inc/powerhouse/commit/c315d95bc))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 4.0.0-staging.7 (2025-07-26)

### 🚀 Features

- **reactor-api:** load auth config ([e1c90c4bd](https://github.com/powerhouse-inc/powerhouse/commit/e1c90c4bd))
- **state:** make all atom states derivative ([68a4bfece](https://github.com/powerhouse-inc/powerhouse/commit/68a4bfece))
- **state:** use initialized atoms to avoid exporting base atoms ([55f114672](https://github.com/powerhouse-inc/powerhouse/commit/55f114672))
- **state:** simplify hook names ([220bfbb90](https://github.com/powerhouse-inc/powerhouse/commit/220bfbb90))
- **state:** separate internal and external functions ([cd13a75aa](https://github.com/powerhouse-inc/powerhouse/commit/cd13a75aa))
- **state,connect:** remove unused code ([323155126](https://github.com/powerhouse-inc/powerhouse/commit/323155126))
- **state,connect:** cleanup hooks and clarify names ([#1710](https://github.com/powerhouse-inc/powerhouse/pull/1710))

### 🩹 Fixes

- **reactor-api:** add user to graphql context ([b20c94d03](https://github.com/powerhouse-inc/powerhouse/commit/b20c94d03))
- **reactor-api:** register pullresponder as guest ([abc323cc1](https://github.com/powerhouse-inc/powerhouse/commit/abc323cc1))
- **switchboard:** remove auth from switchboard config ([ff3410afc](https://github.com/powerhouse-inc/powerhouse/commit/ff3410afc))

### ❤️ Thank You

- Frank
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 4.0.0-staging.6 (2025-07-25)

### 🚀 Features

- use EventQueueManager by default ([0d367ea6a](https://github.com/powerhouse-inc/powerhouse/commit/0d367ea6a))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- sync new documents and push+pull api tests ([b81096640](https://github.com/powerhouse-inc/powerhouse/commit/b81096640))
- updated remaining packages with new reactor api and bug fixes ([f8045faa1](https://github.com/powerhouse-inc/powerhouse/commit/f8045faa1))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **connect:** updated connect with new reactor interface ([8a73b62c8](https://github.com/powerhouse-inc/powerhouse/commit/8a73b62c8))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **connect:** fix drive icon ([76492b996](https://github.com/powerhouse-inc/powerhouse/commit/76492b996))
- **connect:** add comments ([31c363f99](https://github.com/powerhouse-inc/powerhouse/commit/31c363f99))
- **connect:** update document drive server hook dependency array ([51a27489a](https://github.com/powerhouse-inc/powerhouse/commit/51a27489a))
- **connect:** remove legacy document drives hook ([179478755](https://github.com/powerhouse-inc/powerhouse/commit/179478755))
- **connect:** do instant navigation when creating drive or document ([bea7bae67](https://github.com/powerhouse-inc/powerhouse/commit/bea7bae67))
- **connect:** also dedupe operations by hash ([fb26a8aca](https://github.com/powerhouse-inc/powerhouse/commit/fb26a8aca))
- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **connect:** use atom hooks instead of navigate when deleting drives ([cbbb0e688](https://github.com/powerhouse-inc/powerhouse/commit/cbbb0e688))
- **connect:** remove redundant load data hook invocation ([fdb56a1ae](https://github.com/powerhouse-inc/powerhouse/commit/fdb56a1ae))
- **connect,reactor-browser,common,state:** use new state hooks ([#1703](https://github.com/powerhouse-inc/powerhouse/pull/1703))
- **document-drive:** removed document and sync units from drive document model ([c73b11c16](https://github.com/powerhouse-inc/powerhouse/commit/c73b11c16))
- **document-drive:** initial work on retrieving sync units from storage ([a81a8a4bf](https://github.com/powerhouse-inc/powerhouse/commit/a81a8a4bf))
- **document-drive:** sync unit refactor ([c9efef89a](https://github.com/powerhouse-inc/powerhouse/commit/c9efef89a))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))
- **document-drive:** implement storage unit getter in memory storage. Adde SyncManager unit tests ([b6ba106eb](https://github.com/powerhouse-inc/powerhouse/commit/b6ba106eb))
- **document-drive:** reimplement COPY_CHILD_DOCUMENT signal handler ([729bbba25](https://github.com/powerhouse-inc/powerhouse/commit/729bbba25))
- **document-drive:** updated browser and filesystem storage adapters ([7e98ab2e2](https://github.com/powerhouse-inc/powerhouse/commit/7e98ab2e2))
- **document-drive:** added fallbacks with deprecation warnings on legacy reactor methods ([0e10883cc](https://github.com/powerhouse-inc/powerhouse/commit/0e10883cc))
- **document-drive, document-model:** event-based queue manager and typed signal handler result ([52d42156c](https://github.com/powerhouse-inc/powerhouse/commit/52d42156c))
- **prisma:** updated prisma storage adapter ([1303a2395](https://github.com/powerhouse-inc/powerhouse/commit/1303a2395))
- **reactor-browser:** add comments ([e9adb7d56](https://github.com/powerhouse-inc/powerhouse/commit/e9adb7d56))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- **state:** add hooks for drive documents ([a80c72e51](https://github.com/powerhouse-inc/powerhouse/commit/a80c72e51))
- **state:** update documents when selected drive changes ([94b893d0a](https://github.com/powerhouse-inc/powerhouse/commit/94b893d0a))
- **state:** use more descriptive hook name ([78c2b1d38](https://github.com/powerhouse-inc/powerhouse/commit/78c2b1d38))
- **state:** update initialize reactor deps array ([157b73aee](https://github.com/powerhouse-inc/powerhouse/commit/157b73aee))
- **state:** remove unused hook ([27c2ee2a1](https://github.com/powerhouse-inc/powerhouse/commit/27c2ee2a1))
- **state:** add doc comments for setter hooks ([ffc6506a0](https://github.com/powerhouse-inc/powerhouse/commit/ffc6506a0))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **state:** update package json meta ([8e8a71749](https://github.com/powerhouse-inc/powerhouse/commit/8e8a71749))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state,connect:** use window events for setting selected items ([29cc997d2](https://github.com/powerhouse-inc/powerhouse/commit/29cc997d2))

### 🩹 Fixes

- update sync unit status for unchanged documents after first pull ([3220f69eb](https://github.com/powerhouse-inc/powerhouse/commit/3220f69eb))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))
- **common:** use name on drive state in home page ([b2449c2bc](https://github.com/powerhouse-inc/powerhouse/commit/b2449c2bc))
- **connect:** update import ([467e1a48f](https://github.com/powerhouse-inc/powerhouse/commit/467e1a48f))
- **connect:** remove logs ([3267e3d57](https://github.com/powerhouse-inc/powerhouse/commit/3267e3d57))
- **connect:** remove commented out code ([605c3e72e](https://github.com/powerhouse-inc/powerhouse/commit/605c3e72e))
- **connect:** do not use selected drive id when closing node ([8d50dfccd](https://github.com/powerhouse-inc/powerhouse/commit/8d50dfccd))
- **connect:** remove should navigate hook arg ([befb67ca9](https://github.com/powerhouse-inc/powerhouse/commit/befb67ca9))
- **connect:** remove unused hook ([34885a879](https://github.com/powerhouse-inc/powerhouse/commit/34885a879))
- **document-drive:** fixed listener revisions handling ([84a13171b](https://github.com/powerhouse-inc/powerhouse/commit/84a13171b))
- **document-drive:** code fixes on tests ([5fdd4a095](https://github.com/powerhouse-inc/powerhouse/commit/5fdd4a095))
- **document-drive:** allow adding unsigned documents and fix prisma regressions ([5f96462aa](https://github.com/powerhouse-inc/powerhouse/commit/5f96462aa))
- **document-drive:** delete document from parents when it's deleted ([a53c4093d](https://github.com/powerhouse-inc/powerhouse/commit/a53c4093d))
- **document-drive:** set documentType when queueing new document ([feccd16bd](https://github.com/powerhouse-inc/powerhouse/commit/feccd16bd))
- **document-drive:** fix regression when adding multiple operations ([3a8617e79](https://github.com/powerhouse-inc/powerhouse/commit/3a8617e79))
- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **document-drive,connect,common,reactor-api:** test fixes and interface improvements ([981b638bf](https://github.com/powerhouse-inc/powerhouse/commit/981b638bf))
- **document-drive,connect,common,reactor-browser:** reimplemented support for copy node action ([0e4da7a84](https://github.com/powerhouse-inc/powerhouse/commit/0e4da7a84))
- **state:** add build command ([92dc76abe](https://github.com/powerhouse-inc/powerhouse/commit/92dc76abe))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.19 (2025-07-25)

### 🚀 Features

- use EventQueueManager by default ([0d367ea6a](https://github.com/powerhouse-inc/powerhouse/commit/0d367ea6a))
- support initial strand without operations ([46698d2ff](https://github.com/powerhouse-inc/powerhouse/commit/46698d2ff))
- sync new documents and push+pull api tests ([b81096640](https://github.com/powerhouse-inc/powerhouse/commit/b81096640))
- updated remaining packages with new reactor api and bug fixes ([f8045faa1](https://github.com/powerhouse-inc/powerhouse/commit/f8045faa1))
- **common:** install storybook types ([c4d45bb7c](https://github.com/powerhouse-inc/powerhouse/commit/c4d45bb7c))
- **common:** add storybook react dev dep ([61404f414](https://github.com/powerhouse-inc/powerhouse/commit/61404f414))
- **connect:** updated connect with new reactor interface ([8a73b62c8](https://github.com/powerhouse-inc/powerhouse/commit/8a73b62c8))
- **connect:** use new hooks ([93a9eccfa](https://github.com/powerhouse-inc/powerhouse/commit/93a9eccfa))
- **connect:** fix drive icon ([76492b996](https://github.com/powerhouse-inc/powerhouse/commit/76492b996))
- **connect:** add comments ([31c363f99](https://github.com/powerhouse-inc/powerhouse/commit/31c363f99))
- **connect:** update document drive server hook dependency array ([51a27489a](https://github.com/powerhouse-inc/powerhouse/commit/51a27489a))
- **connect:** remove legacy document drives hook ([179478755](https://github.com/powerhouse-inc/powerhouse/commit/179478755))
- **connect:** do instant navigation when creating drive or document ([bea7bae67](https://github.com/powerhouse-inc/powerhouse/commit/bea7bae67))
- **connect:** also dedupe operations by hash ([fb26a8aca](https://github.com/powerhouse-inc/powerhouse/commit/fb26a8aca))
- **connect:** remove unused dep ([00d3f68c0](https://github.com/powerhouse-inc/powerhouse/commit/00d3f68c0))
- **connect:** use atom hooks instead of navigate when deleting drives ([cbbb0e688](https://github.com/powerhouse-inc/powerhouse/commit/cbbb0e688))
- **connect:** remove redundant load data hook invocation ([fdb56a1ae](https://github.com/powerhouse-inc/powerhouse/commit/fdb56a1ae))
- **connect,reactor-browser,common,state:** use new state hooks ([#1703](https://github.com/powerhouse-inc/powerhouse/pull/1703))
- **document-drive:** removed document and sync units from drive document model ([c73b11c16](https://github.com/powerhouse-inc/powerhouse/commit/c73b11c16))
- **document-drive:** initial work on retrieving sync units from storage ([a81a8a4bf](https://github.com/powerhouse-inc/powerhouse/commit/a81a8a4bf))
- **document-drive:** sync unit refactor ([c9efef89a](https://github.com/powerhouse-inc/powerhouse/commit/c9efef89a))
- **document-drive:** removed drive id where possible ([adcedc4f0](https://github.com/powerhouse-inc/powerhouse/commit/adcedc4f0))
- **document-drive:** implement storage unit getter in memory storage. Adde SyncManager unit tests ([b6ba106eb](https://github.com/powerhouse-inc/powerhouse/commit/b6ba106eb))
- **document-drive:** reimplement COPY_CHILD_DOCUMENT signal handler ([729bbba25](https://github.com/powerhouse-inc/powerhouse/commit/729bbba25))
- **document-drive:** updated browser and filesystem storage adapters ([7e98ab2e2](https://github.com/powerhouse-inc/powerhouse/commit/7e98ab2e2))
- **document-drive:** added fallbacks with deprecation warnings on legacy reactor methods ([0e10883cc](https://github.com/powerhouse-inc/powerhouse/commit/0e10883cc))
- **document-drive, document-model:** event-based queue manager and typed signal handler result ([52d42156c](https://github.com/powerhouse-inc/powerhouse/commit/52d42156c))
- **prisma:** updated prisma storage adapter ([1303a2395](https://github.com/powerhouse-inc/powerhouse/commit/1303a2395))
- **reactor-browser:** add comments ([e9adb7d56](https://github.com/powerhouse-inc/powerhouse/commit/e9adb7d56))
- **state:** move state code to own package ([605bd5d75](https://github.com/powerhouse-inc/powerhouse/commit/605bd5d75))
- **state:** add hooks for drive documents ([a80c72e51](https://github.com/powerhouse-inc/powerhouse/commit/a80c72e51))
- **state:** update documents when selected drive changes ([94b893d0a](https://github.com/powerhouse-inc/powerhouse/commit/94b893d0a))
- **state:** use more descriptive hook name ([78c2b1d38](https://github.com/powerhouse-inc/powerhouse/commit/78c2b1d38))
- **state:** update initialize reactor deps array ([157b73aee](https://github.com/powerhouse-inc/powerhouse/commit/157b73aee))
- **state:** remove unused hook ([27c2ee2a1](https://github.com/powerhouse-inc/powerhouse/commit/27c2ee2a1))
- **state:** add doc comments for setter hooks ([ffc6506a0](https://github.com/powerhouse-inc/powerhouse/commit/ffc6506a0))
- **state:** remove jotai optics dep ([dfc955a82](https://github.com/powerhouse-inc/powerhouse/commit/dfc955a82))
- **state:** update package json meta ([8e8a71749](https://github.com/powerhouse-inc/powerhouse/commit/8e8a71749))
- **state:** remove unused deps ([d681fff7a](https://github.com/powerhouse-inc/powerhouse/commit/d681fff7a))
- **state:** add state package reference to monorepo tsconfig ([93de86073](https://github.com/powerhouse-inc/powerhouse/commit/93de86073))
- **state:** use reactor on window object ([40321826e](https://github.com/powerhouse-inc/powerhouse/commit/40321826e))
- **state,connect:** use window events for setting selected items ([29cc997d2](https://github.com/powerhouse-inc/powerhouse/commit/29cc997d2))

### 🩹 Fixes

- update sync unit status for unchanged documents after first pull ([3220f69eb](https://github.com/powerhouse-inc/powerhouse/commit/3220f69eb))
- **common:** update storybook story type ([a84550281](https://github.com/powerhouse-inc/powerhouse/commit/a84550281))
- **common:** use name on drive state in home page ([b2449c2bc](https://github.com/powerhouse-inc/powerhouse/commit/b2449c2bc))
- **connect:** update import ([467e1a48f](https://github.com/powerhouse-inc/powerhouse/commit/467e1a48f))
- **connect:** remove logs ([3267e3d57](https://github.com/powerhouse-inc/powerhouse/commit/3267e3d57))
- **connect:** remove commented out code ([605c3e72e](https://github.com/powerhouse-inc/powerhouse/commit/605c3e72e))
- **connect:** do not use selected drive id when closing node ([8d50dfccd](https://github.com/powerhouse-inc/powerhouse/commit/8d50dfccd))
- **connect:** remove should navigate hook arg ([befb67ca9](https://github.com/powerhouse-inc/powerhouse/commit/befb67ca9))
- **connect:** remove unused hook ([34885a879](https://github.com/powerhouse-inc/powerhouse/commit/34885a879))
- **document-drive:** fixed listener revisions handling ([84a13171b](https://github.com/powerhouse-inc/powerhouse/commit/84a13171b))
- **document-drive:** code fixes on tests ([5fdd4a095](https://github.com/powerhouse-inc/powerhouse/commit/5fdd4a095))
- **document-drive:** allow adding unsigned documents and fix prisma regressions ([5f96462aa](https://github.com/powerhouse-inc/powerhouse/commit/5f96462aa))
- **document-drive:** delete document from parents when it's deleted ([a53c4093d](https://github.com/powerhouse-inc/powerhouse/commit/a53c4093d))
- **document-drive:** set documentType when queueing new document ([feccd16bd](https://github.com/powerhouse-inc/powerhouse/commit/feccd16bd))
- **document-drive:** fix regression when adding multiple operations ([bce76878e](https://github.com/powerhouse-inc/powerhouse/commit/bce76878e))
- **document-drive:** added deprecation warnings and release notes ([dbc86d172](https://github.com/powerhouse-inc/powerhouse/commit/dbc86d172))
- **document-drive,connect,common,reactor-api:** test fixes and interface improvements ([981b638bf](https://github.com/powerhouse-inc/powerhouse/commit/981b638bf))
- **document-drive,connect,common,reactor-browser:** reimplemented support for copy node action ([0e4da7a84](https://github.com/powerhouse-inc/powerhouse/commit/0e4da7a84))
- **state:** add build command ([92dc76abe](https://github.com/powerhouse-inc/powerhouse/commit/92dc76abe))

### ❤️ Thank You

- acaldas @acaldas
- Ryan Wolhuter @ryanwolhuter
- ryanwolhuter @ryanwolhuter

## 3.3.0-dev.18 (2025-07-24)

### 🩹 Fixes

- **document-drive:** fix regression when adding multiple operations ([3a8617e79](https://github.com/powerhouse-inc/powerhouse/commit/3a8617e79))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.17 (2025-07-23)

### 🩹 Fixes

- add release notes on correct branch ([a2d60a537](https://github.com/powerhouse-inc/powerhouse/commit/a2d60a537))
- update release notes ([f1b6a8e71](https://github.com/powerhouse-inc/powerhouse/commit/f1b6a8e71))
- **academy:** generate types command ([b8b883200](https://github.com/powerhouse-inc/powerhouse/commit/b8b883200))
- **codegen:** revert changes to resolvers template ([b96a7b899](https://github.com/powerhouse-inc/powerhouse/commit/b96a7b899))

### ❤️ Thank You

- acaldas @acaldas
- Callme-T
- Frank

## 3.3.0-dev.16 (2025-07-22)

### 🩹 Fixes

- **common,document-drive,reactor-api,reactor-browser:** revert undefined return on getDocument methods ([fc145a82a](https://github.com/powerhouse-inc/powerhouse/commit/fc145a82a))
- **connect,reactor-browser:** avoid memory leak on useDocumentDrives ([cdaba1dc3](https://github.com/powerhouse-inc/powerhouse/commit/cdaba1dc3))
- **reactor-api:** remove body-parser depecration warning ([4098ffedd](https://github.com/powerhouse-inc/powerhouse/commit/4098ffedd))

### ❤️ Thank You

- acaldas @acaldas

## 3.3.0-dev.15 (2025-07-17)

### 🩹 Fixes

- **academy:** update broken links ([cbbfe9b30](https://github.com/powerhouse-inc/powerhouse/commit/cbbfe9b30))
- **codegen:** updated subgraph template to deal with undefined return on getDocument ([7b2862a91](https://github.com/powerhouse-inc/powerhouse/commit/7b2862a91))
- **codegen:** updated processor factory to handle async processor factories ([8a562d95a](https://github.com/powerhouse-inc/powerhouse/commit/8a562d95a))
- **reactor-browser:** implement retry logic for live queries on relation errors ([7890e7d95](https://github.com/powerhouse-inc/powerhouse/commit/7890e7d95))

### ❤️ Thank You

- acaldas
- Callme-T
- Guillermo Puente @gpuente

## 3.3.0-dev.14 (2025-07-17)

### 🩹 Fixes

- **codegen:** run schema codegen without requiring kysely-pglite to be a direct dependency ([e9d901e00](https://github.com/powerhouse-inc/powerhouse/commit/e9d901e00))
- **codegen:** renamed folder to relationalDb ([42fb0ddff](https://github.com/powerhouse-inc/powerhouse/commit/42fb0ddff))

### ❤️ Thank You

- acaldas @acaldas
- Frank

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

- **codegen,document-drive,reactor-api:** use namespaces per drive and operational processor ([9f2280929](https://github.com/powerhouse-inc/powerhouse/commit/9f2280929))
- **document-drive:** anticipate undefined return values for documents and drives ([9bd1bba7b](https://github.com/powerhouse-inc/powerhouse/commit/9bd1bba7b))
- **document-drive,codegen:** updated operational processor factory ([39630bfd4](https://github.com/powerhouse-inc/powerhouse/commit/39630bfd4))
- **document-drive,reactor-browser:** hash processor namespaces when writing and when querying from the relational db ([db817eeab](https://github.com/powerhouse-inc/powerhouse/commit/db817eeab))
- **reactor-browser:** update useOperationalQuery and createTypedQuery to support operational processor classes and drive IDs ([70cfe6fef](https://github.com/powerhouse-inc/powerhouse/commit/70cfe6fef))

### 🩹 Fixes

- connect build issues ([9e92db6f7](https://github.com/powerhouse-inc/powerhouse/commit/9e92db6f7))
- **builder-tools:** enhance Vite server configuration to allow serving files from current project and linked packages ([#1700](https://github.com/powerhouse-inc/powerhouse/pull/1700))
- **document-drive,reactor-browser:** use underscore instead of dashes and update loading status when there is an error ([02720ab52](https://github.com/powerhouse-inc/powerhouse/commit/02720ab52))
- **reactor-browser:** catch live query error ([c8c8f5c21](https://github.com/powerhouse-inc/powerhouse/commit/c8c8f5c21))
- **reactor-browser:** simplify useOperationalQuery by utilizing processor's query method for namespaced database ([7a07ef35c](https://github.com/powerhouse-inc/powerhouse/commit/7a07ef35c))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
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

### 🩹 Fixes

- **codegen:** update codegen with new header changes ([a933f1829](https://github.com/powerhouse-inc/powerhouse/commit/a933f1829))
- **codegen:** fix broken test ([4135c4174](https://github.com/powerhouse-inc/powerhouse/commit/4135c4174))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.3.0-dev.7 (2025-07-10)

### 🩹 Fixes

- **connect:** enable external processors by default ([010bed4ce](https://github.com/powerhouse-inc/powerhouse/commit/010bed4ce))
- **reactor-api:** update document exopect revision ([#1680](https://github.com/powerhouse-inc/powerhouse/pull/1680))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 3.3.0-dev.6 (2025-07-10)

### 🚀 Features

- **codegen:** support loading migration typescript file ([d3cc1957b](https://github.com/powerhouse-inc/powerhouse/commit/d3cc1957b))

### 🩹 Fixes

- initialize external processors with operationalStore ([532cb1bbd](https://github.com/powerhouse-inc/powerhouse/commit/532cb1bbd))
- **academy:** build ([88681db3d](https://github.com/powerhouse-inc/powerhouse/commit/88681db3d))
- **codegen:** replaced kysely with OperationalStore ([b8def2efd](https://github.com/powerhouse-inc/powerhouse/commit/b8def2efd))
- **codegen:** use inmemory pglite instance to generate db schema types ([93b075965](https://github.com/powerhouse-inc/powerhouse/commit/93b075965))
- **codegen,ph-cli:** make schema-file optional and updated generate help text ([adad303a8](https://github.com/powerhouse-inc/powerhouse/commit/adad303a8))
- **document-drive:** return missing fields in document query ([ab00dc3c1](https://github.com/powerhouse-inc/powerhouse/commit/ab00dc3c1))
- **document-model:** sort operations before retrieving the latest operation ([3fafac2a6](https://github.com/powerhouse-inc/powerhouse/commit/3fafac2a6))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Guillermo Puente @gpuente

## 3.3.0-dev.5 (2025-07-09)

### 🩹 Fixes

- **codegen:** proper import path for document types ([11352d4ae](https://github.com/powerhouse-inc/powerhouse/commit/11352d4ae))

### ❤️ Thank You

- Frank

## 3.3.0-dev.4 (2025-07-09)

### 🚀 Features

- **codegen,ph-cli:** added generate schema command ([9a5e921fb](https://github.com/powerhouse-inc/powerhouse/commit/9a5e921fb))
- **document-drive:** initial work on BaseOperationalProcessor ([40fe0ec2f](https://github.com/powerhouse-inc/powerhouse/commit/40fe0ec2f))

### 🩹 Fixes

- **codegen:** imports and instantiation ([37e6ae9ab](https://github.com/powerhouse-inc/powerhouse/commit/37e6ae9ab))
- **codegen:** schema generation ([378a666b2](https://github.com/powerhouse-inc/powerhouse/commit/378a666b2))
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

### 🩹 Fixes

- **academy:** using the api ([833f1edde](https://github.com/powerhouse-inc/powerhouse/commit/833f1edde))
- **academy:** graphql at powerhouse update ([fea4eae24](https://github.com/powerhouse-inc/powerhouse/commit/fea4eae24))

### ❤️ Thank You

- Callme-T

## 3.3.0-dev.1 (2025-07-04)

### 🚀 Features

- renamed reactor-analytics to processor-manager ([22e7b245a](https://github.com/powerhouse-inc/powerhouse/commit/22e7b245a))
- **connect:** enable external processors ([274ca7251](https://github.com/powerhouse-inc/powerhouse/commit/274ca7251))
- **ph-cmd:** support shorthand package manager flags and fallback to lockfile resolver on ph use ([b915ccae6](https://github.com/powerhouse-inc/powerhouse/commit/b915ccae6))

### 🩹 Fixes

- **document-drive:** use async fs methods to avoid blocking the event loop ([795c486e4](https://github.com/powerhouse-inc/powerhouse/commit/795c486e4))
- **ph-cli,ph-cmd:** avoid lint error when import generated version file ([59fbddb3f](https://github.com/powerhouse-inc/powerhouse/commit/59fbddb3f))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente

## 3.3.0-dev.0 (2025-07-02)

### 🚀 Features

- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))
- updating signing interfaces to connect document-model and connect packages ([e9b64ae77](https://github.com/powerhouse-inc/powerhouse/commit/e9b64ae77))
- on load, discard key pairs that do not match the updated algorithm ([845728953](https://github.com/powerhouse-inc/powerhouse/commit/845728953))
- starting to stub out a complete example of the analytics processor ([a84ed2dcf](https://github.com/powerhouse-inc/powerhouse/commit/a84ed2dcf))
- **academy:** add Drive Analytics documentation and examples ([daedc28a3](https://github.com/powerhouse-inc/powerhouse/commit/daedc28a3))
- **common:** add doc comments ([f167e3f1b](https://github.com/powerhouse-inc/powerhouse/commit/f167e3f1b))
- **common:** add readme ([4c97e550d](https://github.com/powerhouse-inc/powerhouse/commit/4c97e550d))
- **common:** add reference links ([915b1ee4a](https://github.com/powerhouse-inc/powerhouse/commit/915b1ee4a))
- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))

### 🩹 Fixes

- fixing lots of unit tests ([91c1d4acf](https://github.com/powerhouse-inc/powerhouse/commit/91c1d4acf))
- header should be same format as all operation timestamps ([554ab41c2](https://github.com/powerhouse-inc/powerhouse/commit/554ab41c2))
- fixing issue with header not being applied to read file ([2e55c2ec2](https://github.com/powerhouse-inc/powerhouse/commit/2e55c2ec2))
- fixing some tests that need to compare state, fixing documentType on empty header creation ([7c6669a12](https://github.com/powerhouse-inc/powerhouse/commit/7c6669a12))
- lots of refactoring for moving header and making id a signature ([5651159e6](https://github.com/powerhouse-inc/powerhouse/commit/5651159e6))
- fix issue where we were creating bad headers ([6c1f7cbd7](https://github.com/powerhouse-inc/powerhouse/commit/6c1f7cbd7))
- baseReducer function needs updated to change header ([2568ea1ce](https://github.com/powerhouse-inc/powerhouse/commit/2568ea1ce))
- fixing document-drive tests, round 1 ([5316e4717](https://github.com/powerhouse-inc/powerhouse/commit/5316e4717))
- fix issue where state should have been compared rather than revisions ([bf33f2c49](https://github.com/powerhouse-inc/powerhouse/commit/bf33f2c49))
- adding some backward compat fixes for document model and document drive ([73d08a5b0](https://github.com/powerhouse-inc/powerhouse/commit/73d08a5b0))
- moving graphql transformations into a shared function so unit tests can reuse them ([68a380eba](https://github.com/powerhouse-inc/powerhouse/commit/68a380eba))
- export issues with header ([8f984d558](https://github.com/powerhouse-inc/powerhouse/commit/8f984d558))
- refactor storage layer to save header appropriately ([eafd9b2b6](https://github.com/powerhouse-inc/powerhouse/commit/eafd9b2b6))
- compile errors in reactor-api ([6274b8b77](https://github.com/powerhouse-inc/powerhouse/commit/6274b8b77))
- compile errors in reactor-browser ([1223c495a](https://github.com/powerhouse-inc/powerhouse/commit/1223c495a))
- compile errors in common package ([9c3e4faa4](https://github.com/powerhouse-inc/powerhouse/commit/9c3e4faa4))
- fixing issue with header rebuilding ([5ac7b91d3](https://github.com/powerhouse-inc/powerhouse/commit/5ac7b91d3))
- prisma had an issue with creation date ([c3e53354a](https://github.com/powerhouse-inc/powerhouse/commit/c3e53354a))
- a few more fixes for unit tests and making storage engines return the same stuff ([224535d66](https://github.com/powerhouse-inc/powerhouse/commit/224535d66))
- massive type bug in core base-server where header and document were conflated ([1960e1b01](https://github.com/powerhouse-inc/powerhouse/commit/1960e1b01))
- test all storage adapters with drive operations ([ceb4e8288](https://github.com/powerhouse-inc/powerhouse/commit/ceb4e8288))
- prisma should use update instead of updateMany for operations ([de2e17992](https://github.com/powerhouse-inc/powerhouse/commit/de2e17992))
- revert some bad changes to the core reducer ([d01050a73](https://github.com/powerhouse-inc/powerhouse/commit/d01050a73))
- conflict resolution should be tested on all storage layers since this is an integration test ([b58142dd7](https://github.com/powerhouse-inc/powerhouse/commit/b58142dd7))
- fix issues with signature migration tests ([5477f0388](https://github.com/powerhouse-inc/powerhouse/commit/5477f0388))
- graphql test fix now that id is on header ([6ccadb6c2](https://github.com/powerhouse-inc/powerhouse/commit/6ccadb6c2))
- backward compat fix ([3e31c429f](https://github.com/powerhouse-inc/powerhouse/commit/3e31c429f))
- goodby documentheader and thanks for all the fish ([214c6ba6c](https://github.com/powerhouse-inc/powerhouse/commit/214c6ba6c))
- did parsing is different with Ed25519 keys ([2f581ca35](https://github.com/powerhouse-inc/powerhouse/commit/2f581ca35))
- renaming parseDid to generateDid ([8bbc28ddd](https://github.com/powerhouse-inc/powerhouse/commit/8bbc28ddd))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))
- linting issues ([e7bd4117d](https://github.com/powerhouse-inc/powerhouse/commit/e7bd4117d))
- vitest issue with timers ([0fe5a125d](https://github.com/powerhouse-inc/powerhouse/commit/0fe5a125d))
- linter fixes ([197079a9a](https://github.com/powerhouse-inc/powerhouse/commit/197079a9a))
- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- added unique prefix to dimensions in drive and document processors ([3722a81c7](https://github.com/powerhouse-inc/powerhouse/commit/3722a81c7))
- adding a test for generating doc models, fixing a couple small pieces ([5f2edc53a](https://github.com/powerhouse-inc/powerhouse/commit/5f2edc53a))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))
- whoops, remove debug compile error ([40f1cc331](https://github.com/powerhouse-inc/powerhouse/commit/40f1cc331))
- add a longer timeout to the document model test ([5c8a9af00](https://github.com/powerhouse-inc/powerhouse/commit/5c8a9af00))
- fixing deprecated it usage ([e9d3bd4d8](https://github.com/powerhouse-inc/powerhouse/commit/e9d3bd4d8))
- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- nx should ignore this specific dependency issue, as it's just tests ([693cca500](https://github.com/powerhouse-inc/powerhouse/commit/693cca500))
- fix build ([c0cd6988d](https://github.com/powerhouse-inc/powerhouse/commit/c0cd6988d))
- **common:** fixing build and linter issues ([ef05830a4](https://github.com/powerhouse-inc/powerhouse/commit/ef05830a4))
- **connect:** added feature flag for diffs analytics ([161a3203b](https://github.com/powerhouse-inc/powerhouse/commit/161a3203b))
- **reactor-browser:** do not subscribe to query dimensions and debounce refetches triggered by subscriptions ([f6497eb30](https://github.com/powerhouse-inc/powerhouse/commit/f6497eb30))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 3.2.0-dev.9 (2025-07-02)

### 🩹 Fixes

- adding a test for generating doc models, fixing a couple small pieces ([5f2edc53a](https://github.com/powerhouse-inc/powerhouse/commit/5f2edc53a))
- added test to generate and compile a generated document-model ([17bbca3bb](https://github.com/powerhouse-inc/powerhouse/commit/17bbca3bb))
- whoops, remove debug compile error ([40f1cc331](https://github.com/powerhouse-inc/powerhouse/commit/40f1cc331))
- add a longer timeout to the document model test ([5c8a9af00](https://github.com/powerhouse-inc/powerhouse/commit/5c8a9af00))
- fixing deprecated it usage ([e9d3bd4d8](https://github.com/powerhouse-inc/powerhouse/commit/e9d3bd4d8))
- updated processor generator and added codegen test for it ([6af3bbcf7](https://github.com/powerhouse-inc/powerhouse/commit/6af3bbcf7))
- nx should ignore this specific dependency issue, as it's just tests ([693cca500](https://github.com/powerhouse-inc/powerhouse/commit/693cca500))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 3.2.0-dev.8 (2025-07-01)

### 🚀 Features

- **academy:** add Drive Analytics documentation and examples ([daedc28a3](https://github.com/powerhouse-inc/powerhouse/commit/daedc28a3))

### 🩹 Fixes

- added unique prefix to dimensions in drive and document processors ([3722a81c7](https://github.com/powerhouse-inc/powerhouse/commit/3722a81c7))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 3.2.0-dev.7 (2025-06-28)

### 🚀 Features

- starting to stub out a complete example of the analytics processor ([a84ed2dcf](https://github.com/powerhouse-inc/powerhouse/commit/a84ed2dcf))

### ❤️ Thank You

- Benjamin Jordan (@thegoldenmule)

## 3.2.0-dev.6 (2025-06-27)

### 🚀 Features

- added drive analytics processor ([#1607](https://github.com/powerhouse-inc/powerhouse/pull/1607))
- updating signing interfaces to connect document-model and connect packages ([e9b64ae77](https://github.com/powerhouse-inc/powerhouse/commit/e9b64ae77))
- on load, discard key pairs that do not match the updated algorithm ([845728953](https://github.com/powerhouse-inc/powerhouse/commit/845728953))
- **common:** add doc comments ([f167e3f1b](https://github.com/powerhouse-inc/powerhouse/commit/f167e3f1b))
- **common:** add readme ([4c97e550d](https://github.com/powerhouse-inc/powerhouse/commit/4c97e550d))
- **common:** add reference links ([915b1ee4a](https://github.com/powerhouse-inc/powerhouse/commit/915b1ee4a))
- **connect:** use atom store and provider from state library ([28f646636](https://github.com/powerhouse-inc/powerhouse/commit/28f646636))

### 🩹 Fixes

- fixing lots of unit tests ([91c1d4acf](https://github.com/powerhouse-inc/powerhouse/commit/91c1d4acf))
- header should be same format as all operation timestamps ([554ab41c2](https://github.com/powerhouse-inc/powerhouse/commit/554ab41c2))
- fixing issue with header not being applied to read file ([2e55c2ec2](https://github.com/powerhouse-inc/powerhouse/commit/2e55c2ec2))
- fixing some tests that need to compare state, fixing documentType on empty header creation ([7c6669a12](https://github.com/powerhouse-inc/powerhouse/commit/7c6669a12))
- lots of refactoring for moving header and making id a signature ([5651159e6](https://github.com/powerhouse-inc/powerhouse/commit/5651159e6))
- fix issue where we were creating bad headers ([6c1f7cbd7](https://github.com/powerhouse-inc/powerhouse/commit/6c1f7cbd7))
- baseReducer function needs updated to change header ([2568ea1ce](https://github.com/powerhouse-inc/powerhouse/commit/2568ea1ce))
- fixing document-drive tests, round 1 ([5316e4717](https://github.com/powerhouse-inc/powerhouse/commit/5316e4717))
- fix issue where state should have been compared rather than revisions ([bf33f2c49](https://github.com/powerhouse-inc/powerhouse/commit/bf33f2c49))
- adding some backward compat fixes for document model and document drive ([73d08a5b0](https://github.com/powerhouse-inc/powerhouse/commit/73d08a5b0))
- moving graphql transformations into a shared function so unit tests can reuse them ([68a380eba](https://github.com/powerhouse-inc/powerhouse/commit/68a380eba))
- export issues with header ([8f984d558](https://github.com/powerhouse-inc/powerhouse/commit/8f984d558))
- refactor storage layer to save header appropriately ([eafd9b2b6](https://github.com/powerhouse-inc/powerhouse/commit/eafd9b2b6))
- compile errors in reactor-api ([6274b8b77](https://github.com/powerhouse-inc/powerhouse/commit/6274b8b77))
- compile errors in reactor-browser ([1223c495a](https://github.com/powerhouse-inc/powerhouse/commit/1223c495a))
- compile errors in common package ([9c3e4faa4](https://github.com/powerhouse-inc/powerhouse/commit/9c3e4faa4))
- fixing issue with header rebuilding ([5ac7b91d3](https://github.com/powerhouse-inc/powerhouse/commit/5ac7b91d3))
- prisma had an issue with creation date ([c3e53354a](https://github.com/powerhouse-inc/powerhouse/commit/c3e53354a))
- a few more fixes for unit tests and making storage engines return the same stuff ([224535d66](https://github.com/powerhouse-inc/powerhouse/commit/224535d66))
- massive type bug in core base-server where header and document were conflated ([1960e1b01](https://github.com/powerhouse-inc/powerhouse/commit/1960e1b01))
- test all storage adapters with drive operations ([ceb4e8288](https://github.com/powerhouse-inc/powerhouse/commit/ceb4e8288))
- prisma should use update instead of updateMany for operations ([de2e17992](https://github.com/powerhouse-inc/powerhouse/commit/de2e17992))
- revert some bad changes to the core reducer ([d01050a73](https://github.com/powerhouse-inc/powerhouse/commit/d01050a73))
- conflict resolution should be tested on all storage layers since this is an integration test ([b58142dd7](https://github.com/powerhouse-inc/powerhouse/commit/b58142dd7))
- fix issues with signature migration tests ([5477f0388](https://github.com/powerhouse-inc/powerhouse/commit/5477f0388))
- graphql test fix now that id is on header ([6ccadb6c2](https://github.com/powerhouse-inc/powerhouse/commit/6ccadb6c2))
- backward compat fix ([3e31c429f](https://github.com/powerhouse-inc/powerhouse/commit/3e31c429f))
- goodby documentheader and thanks for all the fish ([214c6ba6c](https://github.com/powerhouse-inc/powerhouse/commit/214c6ba6c))
- did parsing is different with Ed25519 keys ([2f581ca35](https://github.com/powerhouse-inc/powerhouse/commit/2f581ca35))
- renaming parseDid to generateDid ([8bbc28ddd](https://github.com/powerhouse-inc/powerhouse/commit/8bbc28ddd))
- updated atoms with header changes ([2b557197a](https://github.com/powerhouse-inc/powerhouse/commit/2b557197a))
- linting issues ([e7bd4117d](https://github.com/powerhouse-inc/powerhouse/commit/e7bd4117d))
- vitest issue with timers ([0fe5a125d](https://github.com/powerhouse-inc/powerhouse/commit/0fe5a125d))
- linter fixes ([197079a9a](https://github.com/powerhouse-inc/powerhouse/commit/197079a9a))
- updated document-engineering ver ([3522179d6](https://github.com/powerhouse-inc/powerhouse/commit/3522179d6))
- **common:** fixing build and linter issues ([ef05830a4](https://github.com/powerhouse-inc/powerhouse/commit/ef05830a4))
- **connect:** added feature flag for diffs analytics ([161a3203b](https://github.com/powerhouse-inc/powerhouse/commit/161a3203b))
- **reactor-browser:** do not subscribe to query dimensions and debounce refetches triggered by subscriptions ([f6497eb30](https://github.com/powerhouse-inc/powerhouse/commit/f6497eb30))

### ❤️ Thank You

- acaldas
- Benjamin Jordan (@thegoldenmule)
- Guillermo Puente
- Guillermo Puente Sandoval
- ryanwolhuter

## 3.2.0-dev.5 (2025-06-26)

### 🚀 Features

- added document analytics processor ([2178e302d](https://github.com/powerhouse-inc/powerhouse/commit/2178e302d))
- **common:** add atoms library ([dbc8e8b44](https://github.com/powerhouse-inc/powerhouse/commit/dbc8e8b44))

### 🩹 Fixes

- adding id/slug resolution to document storage ([0c611fb1b](https://github.com/powerhouse-inc/powerhouse/commit/0c611fb1b))
- added new events for operations added ([7d89701b8](https://github.com/powerhouse-inc/powerhouse/commit/7d89701b8))
- **codegen:** update snapshot ([f77a6c03c](https://github.com/powerhouse-inc/powerhouse/commit/f77a6c03c))
- **common,design-system,reactor-browser:** fix drag and drop on generic drive explorer ([9b5113e74](https://github.com/powerhouse-inc/powerhouse/commit/9b5113e74))
- **connect,codegen,common,reactor-browser:** fix analytics query subscription ([6e9729739](https://github.com/powerhouse-inc/powerhouse/commit/6e9729739))
- **document-drive:** safer check for document.slug ([15883aa34](https://github.com/powerhouse-inc/powerhouse/commit/15883aa34))

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

### 🩹 Fixes

- **connect,builder-tools:** serve files at the root on nginx and enforce trailing slash on <base href> ([3c53390f6](https://github.com/powerhouse-inc/powerhouse/commit/3c53390f6))

### ❤️ Thank You

- acaldas @acaldas

## 3.2.0-dev.1 (2025-06-19)

### 🩹 Fixes

- **connect,builder-tools:** support base paths without ending slash ([1ee6d9d9f](https://github.com/powerhouse-inc/powerhouse/commit/1ee6d9d9f))

### ❤️ Thank You

- acaldas @acaldas

## 3.2.0-dev.0 (2025-06-18)

### 🚀 Features

- use document model subgraph when clicking on switchboard url button ([24cf6ad94](https://github.com/powerhouse-inc/powerhouse/commit/24cf6ad94))

### 🩹 Fixes

- (wip) remove reactor dependency from useSwitchboard ([88efbf957](https://github.com/powerhouse-inc/powerhouse/commit/88efbf957))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.41 (2025-06-18)

### 🩹 Fixes

- **builder-tools:** add base tag to the start of the head element in the connect prod html ([c84dcd458](https://github.com/powerhouse-inc/powerhouse/commit/c84dcd458))
- **connect:** remove redirect ([d1605708b](https://github.com/powerhouse-inc/powerhouse/commit/d1605708b))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 2.5.0-dev.40 (2025-06-18)

### 🩹 Fixes

- **connect:** nginx config ([db59bb69c](https://github.com/powerhouse-inc/powerhouse/commit/db59bb69c))

### ❤️ Thank You

- Frank

## 2.5.0-dev.39 (2025-06-18)

### 🩹 Fixes

- **connect:** redirect ([6729ec934](https://github.com/powerhouse-inc/powerhouse/commit/6729ec934))

### ❤️ Thank You

- Frank

## 2.5.0-dev.38 (2025-06-18)

### 🩹 Fixes

- **connect:** redirect to trailing slash ([b3df4e795](https://github.com/powerhouse-inc/powerhouse/commit/b3df4e795))

### ❤️ Thank You

- Frank

## 2.5.0-dev.37 (2025-06-18)

### 🚀 Features

- **connect:** redirect to proper base path ([9a24e5311](https://github.com/powerhouse-inc/powerhouse/commit/9a24e5311))
- **connect:** added cache control header ([ec9397e57](https://github.com/powerhouse-inc/powerhouse/commit/ec9397e57))

### ❤️ Thank You

- Frank

## 2.5.0-dev.36 (2025-06-18)

### 🩹 Fixes

- **connect:** assets not found ([92ec79305](https://github.com/powerhouse-inc/powerhouse/commit/92ec79305))

### ❤️ Thank You

- Frank

## 2.5.0-dev.35 (2025-06-18)

### 🩹 Fixes

- **builder-tools:** use relative path for external-packages.css ([e41a46b94](https://github.com/powerhouse-inc/powerhouse/commit/e41a46b94))
- **codegen:** removed stray import ([539cd017d](https://github.com/powerhouse-inc/powerhouse/commit/539cd017d))
- **connect:** nginx base path ([42428c4ae](https://github.com/powerhouse-inc/powerhouse/commit/42428c4ae))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 2.5.0-dev.34 (2025-06-18)

### 🚀 Features

- **connect:** added base path for nginx ([fd809c593](https://github.com/powerhouse-inc/powerhouse/commit/fd809c593))

### ❤️ Thank You

- Frank

## 2.5.0-dev.33 (2025-06-18)

### 🚀 Features

- **reactor:** added repository url to package.json ([662c90e89](https://github.com/powerhouse-inc/powerhouse/commit/662c90e89))

### 🩹 Fixes

- deploy powerhouse to available environments ([a45859a22](https://github.com/powerhouse-inc/powerhouse/commit/a45859a22))
- deploy not on push to main ([63eef7020](https://github.com/powerhouse-inc/powerhouse/commit/63eef7020))

### ❤️ Thank You

- Frank

## 2.5.0-dev.32 (2025-06-18)

### 🚀 Features

- **connect:** added support for basepath ([1d5d3580f](https://github.com/powerhouse-inc/powerhouse/commit/1d5d3580f))

### ❤️ Thank You

- Frank

## 2.5.0-dev.31 (2025-06-18)

### 🚀 Features

- **connect:** use relative imports and rely on <base href> ([fa9eba139](https://github.com/powerhouse-inc/powerhouse/commit/fa9eba139))
- **connect,builder-tools,ph-cli:** added support for path argument on ph connect build and preview ([fe049aae8](https://github.com/powerhouse-inc/powerhouse/commit/fe049aae8))
- **reactor:** initial event-bus implementation with tests and benchmarks ([ef5b3c42e](https://github.com/powerhouse-inc/powerhouse/commit/ef5b3c42e))
- **reactor:** job executor and queue implementations and tests ([c74bbc712](https://github.com/powerhouse-inc/powerhouse/commit/c74bbc712))
- **reactor:** proof-of-concept benchmarks for queue->event->job execution flow ([c297618b9](https://github.com/powerhouse-inc/powerhouse/commit/c297618b9))

### 🩹 Fixes

- **builder-tools:** enforce trailing slash on base path and read BASE_PATH env variable correctly ([93beeb00c](https://github.com/powerhouse-inc/powerhouse/commit/93beeb00c))
- **connect:** remove trailing slash from basepath when setting analytics database name ([7901889e2](https://github.com/powerhouse-inc/powerhouse/commit/7901889e2))
- **connect, design-system:** each list entry should have key field ([bf218c74c](https://github.com/powerhouse-inc/powerhouse/commit/bf218c74c))
- **ph-cli:** install and uninstall packages with and without version tag ([c2a4ad13f](https://github.com/powerhouse-inc/powerhouse/commit/c2a4ad13f))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan (@thegoldenmule)
- Frank

## 2.5.0-dev.30 (2025-06-17)

### 🩹 Fixes

- **codegen:** remove unnecessary docId from subgraph resolvers ([7217cd2d9](https://github.com/powerhouse-inc/powerhouse/commit/7217cd2d9))
- **connect:** set proper tag on docker build ([598c1b3fb](https://github.com/powerhouse-inc/powerhouse/commit/598c1b3fb))

### ❤️ Thank You

- Frank

## 2.5.0-dev.29 (2025-06-17)

### 🚀 Features

- removed scalars components ([#1574](https://github.com/powerhouse-inc/powerhouse/pull/1574))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 2.5.0-dev.28 (2025-06-16)

### 🚀 Features

- add app skeleton to html at build time ([1882bb820](https://github.com/powerhouse-inc/powerhouse/commit/1882bb820))

### 🩹 Fixes

- **document-drive:** ensure valid slug assignment in BrowserStorage ([891df972a](https://github.com/powerhouse-inc/powerhouse/commit/891df972a))

### 🔥 Performance

- bundle and accessibility improvements ([94ef22345](https://github.com/powerhouse-inc/powerhouse/commit/94ef22345))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 2.5.0-dev.27 (2025-06-16)

### 🚀 Features

- **connect:** eol ([42db87eb0](https://github.com/powerhouse-inc/powerhouse/commit/42db87eb0))

### ❤️ Thank You

- Frank

## 2.5.0-dev.26 (2025-06-16)

### 🚀 Features

- **connect:** updated readme ([0c34d6cc6](https://github.com/powerhouse-inc/powerhouse/commit/0c34d6cc6))

### ❤️ Thank You

- Frank

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
- **ci:** build and publish docker images on newly created tags ([ee930c4a4](https://github.com/powerhouse-inc/powerhouse/commit/ee930c4a4))
- **docker-compose:** work with published images ([9f31b70fb](https://github.com/powerhouse-inc/powerhouse/commit/9f31b70fb))

### 🩹 Fixes

- **switchboard:** entrypoint script ([a50e5eb06](https://github.com/powerhouse-inc/powerhouse/commit/a50e5eb06))

### ❤️ Thank You

- Frank

## 2.5.0-dev.23 (2025-06-13)

### 🩹 Fixes

- **switchboard:** added semicolons ([ce23c47f0](https://github.com/powerhouse-inc/powerhouse/commit/ce23c47f0))

### ❤️ Thank You

- Frank

## 2.5.0-dev.22 (2025-06-13)

### 🩹 Fixes

- **ci:** connect deployment ([8ac8e423b](https://github.com/powerhouse-inc/powerhouse/commit/8ac8e423b))
- **ci:** set proper tags for docker images ([3cab91969](https://github.com/powerhouse-inc/powerhouse/commit/3cab91969))

### ❤️ Thank You

- Frank

## 2.5.0-dev.21 (2025-06-12)

### 🩹 Fixes

- **builder-tools:** add function to find vite-plugin-node-polyfills directory ([9cba2bf41](https://github.com/powerhouse-inc/powerhouse/commit/9cba2bf41))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 2.5.0-dev.20 (2025-06-12)

### 🚀 Features

- **codegen:** updated editor template ([e2d654238](https://github.com/powerhouse-inc/powerhouse/commit/e2d654238))

### 🩹 Fixes

- --tag option definition on ph init ([2c8ec8823](https://github.com/powerhouse-inc/powerhouse/commit/2c8ec8823))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente @gpuente

## 2.5.0-dev.19 (2025-06-12)

### 🚀 Features

- **ph-cmd:** support --tag on ph init ([7912ab760](https://github.com/powerhouse-inc/powerhouse/commit/7912ab760))

### 🩹 Fixes

- ph connect build tweaks ([64058dbb6](https://github.com/powerhouse-inc/powerhouse/commit/64058dbb6))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.18 (2025-06-12)

### 🚀 Features

- added docker publish workflow ([adf65ef8a](https://github.com/powerhouse-inc/powerhouse/commit/adf65ef8a))
- **connect:** dockerfile based on ph-cmd install ([548e3228d](https://github.com/powerhouse-inc/powerhouse/commit/548e3228d))

### ❤️ Thank You

- Frank

## 2.5.0-dev.17 (2025-06-12)

### 🚀 Features

- use fixed versions of react to make use of caching ([26d8ebf72](https://github.com/powerhouse-inc/powerhouse/commit/26d8ebf72))
- show app skeleton while loading and accessibility fixes ([4f96e2472](https://github.com/powerhouse-inc/powerhouse/commit/4f96e2472))
- show cookie banner while loading app ([48ad9a8ad](https://github.com/powerhouse-inc/powerhouse/commit/48ad9a8ad))
- **connect:** update react version ([37c5beb43](https://github.com/powerhouse-inc/powerhouse/commit/37c5beb43))

### 🩹 Fixes

- sync localStorage based hooks with useSyncExternalStore ([be05d434a](https://github.com/powerhouse-inc/powerhouse/commit/be05d434a))
- **connect:** fix reactor not loaded error ([13e80e4bc](https://github.com/powerhouse-inc/powerhouse/commit/13e80e4bc))

### 🔥 Performance

- **connect:** added compressed avif for background image ([1c31889dd](https://github.com/powerhouse-inc/powerhouse/commit/1c31889dd))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.16 (2025-06-11)

### 🩹 Fixes

- **ph-cli:** remove connect build dir before building new one ([0b2ef09ee](https://github.com/powerhouse-inc/powerhouse/commit/0b2ef09ee))

### ❤️ Thank You

- Frank

## 2.5.0-dev.15 (2025-06-11)

### 🩹 Fixes

- **builder-tools:** polyfill process on connect build ([3b1079fe2](https://github.com/powerhouse-inc/powerhouse/commit/3b1079fe2))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.14 (2025-06-10)

### 🚀 Features

- improved analytics frontend integration ([269aed50c](https://github.com/powerhouse-inc/powerhouse/commit/269aed50c))

### 🩹 Fixes

- **builder-tools:** added node polyfills to studio build ([1d0fe1949](https://github.com/powerhouse-inc/powerhouse/commit/1d0fe1949))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.13 (2025-06-10)

### 🩹 Fixes

- **ph-cli:** proxy pass to proper switchboard instance ([0cd8a2be0](https://github.com/powerhouse-inc/powerhouse/commit/0cd8a2be0))

### ❤️ Thank You

- Frank

## 2.5.0-dev.12 (2025-06-10)

### 🩹 Fixes

- **document-drive:** queue strands to be transmitted to internal transmitters to avoid concurrency issues ([685e84483](https://github.com/powerhouse-inc/powerhouse/commit/685e84483))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.11 (2025-06-07)

### 🚀 Features

- **connect:** updated diff-analyzer processor ([ce5d1219f](https://github.com/powerhouse-inc/powerhouse/commit/ce5d1219f))

### 🩹 Fixes

- connect page load improvements ([addbb82d1](https://github.com/powerhouse-inc/powerhouse/commit/addbb82d1))
- analytics bundling ([5cca0d3bf](https://github.com/powerhouse-inc/powerhouse/commit/5cca0d3bf))
- **connect:** fixed waitForRenown timeout ([9bd3c4246](https://github.com/powerhouse-inc/powerhouse/commit/9bd3c4246))

### ❤️ Thank You

- acaldas @acaldas

## 2.5.0-dev.10 (2025-06-06)

### 🚀 Features

- run analytics db on web worker ([ecf79575f](https://github.com/powerhouse-inc/powerhouse/commit/ecf79575f))

### 🩹 Fixes

- **document-drive:** build internal transmitter updates without blocking the event loop ([01ec364b7](https://github.com/powerhouse-inc/powerhouse/commit/01ec364b7))
- **ph-cli:** duplicate gzip ([f74631ca8](https://github.com/powerhouse-inc/powerhouse/commit/f74631ca8))
- **ph-cli:** broken ci? ([bff9ca494](https://github.com/powerhouse-inc/powerhouse/commit/bff9ca494))

### ❤️ Thank You

- acaldas @acaldas
- Frank

## 2.5.0-dev.9 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** compression with multiple server blocks ([32728ad03](https://github.com/powerhouse-inc/powerhouse/commit/32728ad03))

### ❤️ Thank You

- Frank

## 2.5.0-dev.8 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** brotli compression on 2nd project ([9fde76a1c](https://github.com/powerhouse-inc/powerhouse/commit/9fde76a1c))

### ❤️ Thank You

- Frank

## 2.5.0-dev.7 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** added acme challenge ([38a20179d](https://github.com/powerhouse-inc/powerhouse/commit/38a20179d))

### ❤️ Thank You

- Frank

## 2.5.0-dev.6 (2025-06-05)

### 🩹 Fixes

- set node 22 in release branch workflow ([b33681938](https://github.com/powerhouse-inc/powerhouse/commit/b33681938))
- **ph-cli:** ssl in nginx ([5079d5479](https://github.com/powerhouse-inc/powerhouse/commit/5079d5479))

### ❤️ Thank You

- Frank

## 2.5.0-dev.5 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** duplicate brotli configurations ([32865bf99](https://github.com/powerhouse-inc/powerhouse/commit/32865bf99))

### ❤️ Thank You

- Frank

## 2.5.0-dev.4 (2025-06-05)

### 🩹 Fixes

- **builder-tools:** move esbuild dev dep to deps ([baa22be6f](https://github.com/powerhouse-inc/powerhouse/commit/baa22be6f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.3 (2025-06-05)

### 🚀 Features

- **builder-tools:** add node polyfills esbuild plugin for connect build ([43dd16b4d](https://github.com/powerhouse-inc/powerhouse/commit/43dd16b4d))

### 🩹 Fixes

- **ph-cli:** gzip compression ([d0d56f851](https://github.com/powerhouse-inc/powerhouse/commit/d0d56f851))

### ❤️ Thank You

- Frank
- ryanwolhuter @ryanwolhuter

## 2.5.0-dev.2 (2025-06-05)

### 🩹 Fixes

- **ph-cli:** brotli packages ([ede2fe16d](https://github.com/powerhouse-inc/powerhouse/commit/ede2fe16d))

### ❤️ Thank You

- Frank

## 2.5.0-dev.1 (2025-06-05)

### 🚀 Features

- **ph-cli:** added brotli and gzip compression to nginx ([f631747d3](https://github.com/powerhouse-inc/powerhouse/commit/f631747d3))

### ❤️ Thank You

- Frank

## 2.5.0-dev.0 (2025-06-04)

### 🚀 Features

- added sky-atlas-staging ([ac1658ce9](https://github.com/powerhouse-inc/powerhouse/commit/ac1658ce9))
- improved help commands and information for clis ([755a18f9e](https://github.com/powerhouse-inc/powerhouse/commit/755a18f9e))
- add version generation script and update CLI version handling ([66c4d98c0](https://github.com/powerhouse-inc/powerhouse/commit/66c4d98c0))
- add getDocumentModelModule and getEditor props to drive explorer ([a40f5e6a2](https://github.com/powerhouse-inc/powerhouse/commit/a40f5e6a2))
- added setup environment tutorial ([2b3e80642](https://github.com/powerhouse-inc/powerhouse/commit/2b3e80642))
- removed scalars dependencies ([596aedbd5](https://github.com/powerhouse-inc/powerhouse/commit/596aedbd5))
- enabled switchboard command ([5a9c467bf](https://github.com/powerhouse-inc/powerhouse/commit/5a9c467bf))
- add switchboard command documentation ([41f3542e5](https://github.com/powerhouse-inc/powerhouse/commit/41f3542e5))
- removed scalars package ([d6f7059a7](https://github.com/powerhouse-inc/powerhouse/commit/d6f7059a7))
- remove JWT handler on logout ([9c6c32015](https://github.com/powerhouse-inc/powerhouse/commit/9c6c32015))
- set JWT handlers in useLogin ([30a25a4c0](https://github.com/powerhouse-inc/powerhouse/commit/30a25a4c0))
- enforce conventional commits ([faa49da40](https://github.com/powerhouse-inc/powerhouse/commit/faa49da40))
- **academy:** added authorization docs ([470231bfd](https://github.com/powerhouse-inc/powerhouse/commit/470231bfd))
- **academy:** centralize husky & auto-update cli docs ([8c92e0bb1](https://github.com/powerhouse-inc/powerhouse/commit/8c92e0bb1))
- **builder-tools:** fix wrong value used for field id ([a6c6142e0](https://github.com/powerhouse-inc/powerhouse/commit/a6c6142e0))
- **builder-tools:** remove redundant helpers ([0f82c2d1f](https://github.com/powerhouse-inc/powerhouse/commit/0f82c2d1f))
- **builder-tools:** handle recursive objects in initial state generator ([c9eedcc43](https://github.com/powerhouse-inc/powerhouse/commit/c9eedcc43))
- **builder-tools:** added readme ([e5ffe3139](https://github.com/powerhouse-inc/powerhouse/commit/e5ffe3139))
- **builder-tools:** make external packages file live in connect build dir ([6014ded73](https://github.com/powerhouse-inc/powerhouse/commit/6014ded73))
- **config:** added switchboard auth ([3437c4835](https://github.com/powerhouse-inc/powerhouse/commit/3437c4835))
- **config:** added new switchboard params ([80cd1e43a](https://github.com/powerhouse-inc/powerhouse/commit/80cd1e43a))
- **connect:** send authorization token with each request ([fee2916e6](https://github.com/powerhouse-inc/powerhouse/commit/fee2916e6))
- **connect:** wait for renown initialization before start the reactor ([a301acb15](https://github.com/powerhouse-inc/powerhouse/commit/a301acb15))
- **connect:** remove file node document and ui nodes context from hook ([ecaa84fe5](https://github.com/powerhouse-inc/powerhouse/commit/ecaa84fe5))
- **connect:** remove user permissions and selected document drive from hook ([c1c85e947](https://github.com/powerhouse-inc/powerhouse/commit/c1c85e947))
- **connect:** remove node options and document models from hook ([877094c8e](https://github.com/powerhouse-inc/powerhouse/commit/877094c8e))
- **connect:** remove drive nodes by sharing type from hook ([3f12bd2a4](https://github.com/powerhouse-inc/powerhouse/commit/3f12bd2a4))
- **connect:** remove modal and debug handlers from hook ([9c6d26ef9](https://github.com/powerhouse-inc/powerhouse/commit/9c6d26ef9))
- **connect:** use explicit props for ui nodes values ([ad1a40806](https://github.com/powerhouse-inc/powerhouse/commit/ad1a40806))
- **connect:** added PH_CONNECT_DISABLE_ADD_DRIVE env var ([7445ebe1d](https://github.com/powerhouse-inc/powerhouse/commit/7445ebe1d))
- **connect:** use of new switchboard hook ([4dc99b453](https://github.com/powerhouse-inc/powerhouse/commit/4dc99b453))
- **design-system:** remove new folder default dropdown option ([6b61d5efa](https://github.com/powerhouse-inc/powerhouse/commit/6b61d5efa))
- **document-drive:** regenerated document drive model ([9819d8481](https://github.com/powerhouse-inc/powerhouse/commit/9819d8481))
- **document-drive:** use bearer token if handler is set ([dbdf025a8](https://github.com/powerhouse-inc/powerhouse/commit/dbdf025a8))
- **document-drive:** made defaultDrives optional on reactor options ([566791c56](https://github.com/powerhouse-inc/powerhouse/commit/566791c56))
- **monorepo:** regenerate lockfile ([a6c390b4e](https://github.com/powerhouse-inc/powerhouse/commit/a6c390b4e))
- **monorepo:** handle updating monorepo build deps ([db2ac2316](https://github.com/powerhouse-inc/powerhouse/commit/db2ac2316))
- **monorepo:** bump graphql lib ([ba9d5d338](https://github.com/powerhouse-inc/powerhouse/commit/ba9d5d338))
- **ph-cli:** add --base-path option for API endpoint configuration ([efc533a97](https://github.com/powerhouse-inc/powerhouse/commit/efc533a97))
- **ph-cli:** improved readme ([85eb76808](https://github.com/powerhouse-inc/powerhouse/commit/85eb76808))
- **ph-cli:** added setup-service command ([dfa082aa6](https://github.com/powerhouse-inc/powerhouse/commit/dfa082aa6))
- **ph-cli:** improved setup environment script with checks and features ([bf60911af](https://github.com/powerhouse-inc/powerhouse/commit/bf60911af))
- **ph-cli:** added manage environment script ([2f70b27cb](https://github.com/powerhouse-inc/powerhouse/commit/2f70b27cb))
- **ph-cli:** improved service status output ([ca31a0d78](https://github.com/powerhouse-inc/powerhouse/commit/ca31a0d78))
- **ph-cmd:** added staging env and --force option ([ef5a9695c](https://github.com/powerhouse-inc/powerhouse/commit/ef5a9695c))
- **ph-cmd:** update version command help text ([ffe8ff397](https://github.com/powerhouse-inc/powerhouse/commit/ffe8ff397))
- **ph-cmd:** fix version command for global projects ([8792434b1](https://github.com/powerhouse-inc/powerhouse/commit/8792434b1))
- **ph-cmd:** add "switchboard" to the PACKAGES list in use command ([ab98cec4f](https://github.com/powerhouse-inc/powerhouse/commit/ab98cec4f))
- **ph-cmd:** improved readme ([fbc325779](https://github.com/powerhouse-inc/powerhouse/commit/fbc325779))
- **ph-cmd:** added version command ([2c7145eba](https://github.com/powerhouse-inc/powerhouse/commit/2c7145eba))
- **reactor:** added auth headers for pull responder and switchboard push ([89ad3b111](https://github.com/powerhouse-inc/powerhouse/commit/89ad3b111))
- **reactor:** added optional headers param to requestPublicDrive ([24f2aeab2](https://github.com/powerhouse-inc/powerhouse/commit/24f2aeab2))
- **reactor-api:** removed auth subgraph and added new auth implementation part1 ([55e54aa10](https://github.com/powerhouse-inc/powerhouse/commit/55e54aa10))
- **reactor-api,reactor-local:** updated analytics dependencies ([cbeace573](https://github.com/powerhouse-inc/powerhouse/commit/cbeace573))
- **reactor-api,reactor-local,switchboard:** wait initial timeout before start listening to requests ([409f1e316](https://github.com/powerhouse-inc/powerhouse/commit/409f1e316))
- **reactor-browser:** handle duplicate node where parent is drive ([bedf4818a](https://github.com/powerhouse-inc/powerhouse/commit/bedf4818a))
- **reactor-browser:** added useSwitchboard hook ([eeab8e9b2](https://github.com/powerhouse-inc/powerhouse/commit/eeab8e9b2))
- **renown:** added create and verify Bearer token functions ([d5e404084](https://github.com/powerhouse-inc/powerhouse/commit/d5e404084))
- **renown:** output js build ([d93a3111a](https://github.com/powerhouse-inc/powerhouse/commit/d93a3111a))
- **renown:** added getIssuer helper ([f1eaf9376](https://github.com/powerhouse-inc/powerhouse/commit/f1eaf9376))
- **scripts:** updated setup scripts ([9f7fa7644](https://github.com/powerhouse-inc/powerhouse/commit/9f7fa7644))
- **switchboard:** added authenticated user and role check to graphql context ([8c5699998](https://github.com/powerhouse-inc/powerhouse/commit/8c5699998))
- **switchboard:** added authentication middleware ([7cab35e96](https://github.com/powerhouse-inc/powerhouse/commit/7cab35e96))
- **switchboard:** added auth params from powerhouse config ([5ad2becdd](https://github.com/powerhouse-inc/powerhouse/commit/5ad2becdd))
- **switchboard:** new dockerfile based on ph-cmd ([fafff7143](https://github.com/powerhouse-inc/powerhouse/commit/fafff7143))
- **switchboard:** deploy with new dockerfile ([54f65af17](https://github.com/powerhouse-inc/powerhouse/commit/54f65af17))
- **switchboard, connect:** auth list with eth addresses ([c61a36108](https://github.com/powerhouse-inc/powerhouse/commit/c61a36108))

### 🩹 Fixes

- remove filter ([842a93a75](https://github.com/powerhouse-inc/powerhouse/commit/842a93a75))
- made ph packages env var ([df93611b7](https://github.com/powerhouse-inc/powerhouse/commit/df93611b7))
- remove .env and add to .gitignore ([0d2d48684](https://github.com/powerhouse-inc/powerhouse/commit/0d2d48684))
- docker build with PH_PACKAGES ([856ac1187](https://github.com/powerhouse-inc/powerhouse/commit/856ac1187))
- added missing dep to academy ([4ec6c8278](https://github.com/powerhouse-inc/powerhouse/commit/4ec6c8278))
- **academy:** deployment ([36e5f194d](https://github.com/powerhouse-inc/powerhouse/commit/36e5f194d))
- **academy:** clean up husky script ([e18e26cd8](https://github.com/powerhouse-inc/powerhouse/commit/e18e26cd8))
- **academy:** fix frozen lockfile issue ([bfc3dcd21](https://github.com/powerhouse-inc/powerhouse/commit/bfc3dcd21))
- **academy:** fix frozen lockfile issue' ([80f18ec73](https://github.com/powerhouse-inc/powerhouse/commit/80f18ec73))
- **academy:** lockfile issue second time' ([6208fe614](https://github.com/powerhouse-inc/powerhouse/commit/6208fe614))
- **academy:** docker build ([58e83be09](https://github.com/powerhouse-inc/powerhouse/commit/58e83be09))
- **auth:** some error handling ([1b3d6a38d](https://github.com/powerhouse-inc/powerhouse/commit/1b3d6a38d))
- **builder-tools:** replace usages of isDocumentString graphql tool ([3e12cfc93](https://github.com/powerhouse-inc/powerhouse/commit/3e12cfc93))
- **builder-tools,design-system:** removed ts references to scalars ([48af32702](https://github.com/powerhouse-inc/powerhouse/commit/48af32702))
- **codegen:** use with instead of assert ([b1685d492](https://github.com/powerhouse-inc/powerhouse/commit/b1685d492))
- **codegen:** subgraphs export type ([fa8eb8810](https://github.com/powerhouse-inc/powerhouse/commit/fa8eb8810))
- **codegen:** subgraph resolvers type ([1054400fa](https://github.com/powerhouse-inc/powerhouse/commit/1054400fa))
- **connect:** update default atlas switchboard url ([8cc09a8f9](https://github.com/powerhouse-inc/powerhouse/commit/8cc09a8f9))
- **connect:** correct atlas switchboard url ([7a76ba1e7](https://github.com/powerhouse-inc/powerhouse/commit/7a76ba1e7))
- **connect:** use static entry point for external-packages.js so it can be overriden by studio ([36c9557eb](https://github.com/powerhouse-inc/powerhouse/commit/36c9557eb))
- **connect:** navigate to home screen and reload after clearing storage ([1714782d7](https://github.com/powerhouse-inc/powerhouse/commit/1714782d7))
- **connect:** wait for local drive to be created on initial setup ([3935179b2](https://github.com/powerhouse-inc/powerhouse/commit/3935179b2))
- **connect:** redirect to homepage if drive doesn't exist ([958313f32](https://github.com/powerhouse-inc/powerhouse/commit/958313f32))
- **connect:** useAsyncReactor was not getting the reactor value ([933e343ee](https://github.com/powerhouse-inc/powerhouse/commit/933e343ee))
- **connect:** build issues ([3d3aafbad](https://github.com/powerhouse-inc/powerhouse/commit/3d3aafbad))
- **connect:** disable add drive flag ([4cc0cac3c](https://github.com/powerhouse-inc/powerhouse/commit/4cc0cac3c))
- **connect, switchboard:** signing and verification issues ([3aa76e9e6](https://github.com/powerhouse-inc/powerhouse/commit/3aa76e9e6))
- **document-drive:** delete drive slug when drive is deleted ([fa1a05509](https://github.com/powerhouse-inc/powerhouse/commit/fa1a05509))
- **document-drive:** fix type issue on browser storage ([240a78b41](https://github.com/powerhouse-inc/powerhouse/commit/240a78b41))
- **document-drive:** do not use read mode if no access level is set ([f8a3c0dcf](https://github.com/powerhouse-inc/powerhouse/commit/f8a3c0dcf))
- **document-drive:** fixed fetchDocument graphql query ([b3fc988e8](https://github.com/powerhouse-inc/powerhouse/commit/b3fc988e8))
- **ph-cli:** ph add does not remove installed packages ([aedfbf56e](https://github.com/powerhouse-inc/powerhouse/commit/aedfbf56e))
- **ph-cli:** fixed merge conflict ([d1a666d6e](https://github.com/powerhouse-inc/powerhouse/commit/d1a666d6e))
- **ph-cli:** optimize ph init, build connect after installing packages and do not install switchboard ([2cf986320](https://github.com/powerhouse-inc/powerhouse/commit/2cf986320))
- **ph-cli:** setup-environment fixes on windows script ([314b4c241](https://github.com/powerhouse-inc/powerhouse/commit/314b4c241))
- **ph-cli:** improved service command ([fe740599f](https://github.com/powerhouse-inc/powerhouse/commit/fe740599f))
- **ph-cli:** script paths ([041030185](https://github.com/powerhouse-inc/powerhouse/commit/041030185))
- **ph-cli:** remove project init from service setup ([110f141ab](https://github.com/powerhouse-inc/powerhouse/commit/110f141ab))
- **ph-cli:** manage environment arguments ([2d76c9659](https://github.com/powerhouse-inc/powerhouse/commit/2d76c9659))
- **ph-cli:** check for database configuration ([db07a8f68](https://github.com/powerhouse-inc/powerhouse/commit/db07a8f68))
- **ph-cli:** check setup issues with project dir ([e4ab93798](https://github.com/powerhouse-inc/powerhouse/commit/e4ab93798))
- **ph-cli:** projectpath in nginx location ([b570973f3](https://github.com/powerhouse-inc/powerhouse/commit/b570973f3))
- **ph-cli:** added restart to allowed service actions ([c4e299a2d](https://github.com/powerhouse-inc/powerhouse/commit/c4e299a2d))
- **ph-cli:** permissions for nginx to access connect build ([3d6918b23](https://github.com/powerhouse-inc/powerhouse/commit/3d6918b23))
- **ph-cli:** nginx permission denied ([40bfbe75f](https://github.com/powerhouse-inc/powerhouse/commit/40bfbe75f))
- **ph-cli:** mem and uptime stats for connect ([72859691f](https://github.com/powerhouse-inc/powerhouse/commit/72859691f))
- **ph-cli:** hyphens not allowed in db name ([9948a2063](https://github.com/powerhouse-inc/powerhouse/commit/9948a2063))
- **ph-cli:** db name generation ([e885e108a](https://github.com/powerhouse-inc/powerhouse/commit/e885e108a))
- **ph-cli:** db name when projectname starts with a dot ([3da84dce2](https://github.com/powerhouse-inc/powerhouse/commit/3da84dce2))
- **ph-cmd:** fixed options check ([ddd206e90](https://github.com/powerhouse-inc/powerhouse/commit/ddd206e90))
- **ph-cmd:** update mocked test return values for getProjectInfo ([31793d503](https://github.com/powerhouse-inc/powerhouse/commit/31793d503))
- **ph-cmd:** postinstall script ([8197db5ee](https://github.com/powerhouse-inc/powerhouse/commit/8197db5ee))
- **ph-cmd:** handle help command when no global project is available ([62d64e06a](https://github.com/powerhouse-inc/powerhouse/commit/62d64e06a))
- **ph-cmd:** update ph-cmd description ([17ece8bb3](https://github.com/powerhouse-inc/powerhouse/commit/17ece8bb3))
- **ph-cmd:** simplify command handling with help utilities ([97aa888cd](https://github.com/powerhouse-inc/powerhouse/commit/97aa888cd))
- **ph-cmd:** enhance project initialization by defaulting package manager used in global installation ([d6de20249](https://github.com/powerhouse-inc/powerhouse/commit/d6de20249))
- **ph-cmd:** improve error handling for version command and output ([5f3cc44b8](https://github.com/powerhouse-inc/powerhouse/commit/5f3cc44b8))
- **ph-cmd:** use tag as versions in project package.json ([c543a9d55](https://github.com/powerhouse-inc/powerhouse/commit/c543a9d55))
- **pre-commit:** use bash syntax and shebang ([da00ff581](https://github.com/powerhouse-inc/powerhouse/commit/da00ff581))
- **reactor:** sync should loop pulls while there is more data available ([ee016a3b5](https://github.com/powerhouse-inc/powerhouse/commit/ee016a3b5))
- **reactor:** all storage implementations should throw the same errors on document not found ([1c07564fc](https://github.com/powerhouse-inc/powerhouse/commit/1c07564fc))
- **reactor:** do not let processor creation kill the application ([72420113d](https://github.com/powerhouse-inc/powerhouse/commit/72420113d))
- **reactor-api:** added resolver for DocumentDrive_Node ([68913cd8d](https://github.com/powerhouse-inc/powerhouse/commit/68913cd8d))
- **reactor-api:** proper resolution of prefixed file and foldertypes ([2b4297655](https://github.com/powerhouse-inc/powerhouse/commit/2b4297655))
- **reactor-api:** use getDrive instead of getDocument when driveId is requested ([bd0d1bfa3](https://github.com/powerhouse-inc/powerhouse/commit/bd0d1bfa3))
- **reactor-api:** enable introspection on supergraph ([eb6af4c55](https://github.com/powerhouse-inc/powerhouse/commit/eb6af4c55))
- **reactor-api:** wrong graphql type ([ee7813b7f](https://github.com/powerhouse-inc/powerhouse/commit/ee7813b7f))
- **reactor-api:** optional isAdmin on context ([12ff7a87c](https://github.com/powerhouse-inc/powerhouse/commit/12ff7a87c))
- **reactor-api:** permission helper not available ([4e42a0598](https://github.com/powerhouse-inc/powerhouse/commit/4e42a0598))
- **reactor-api:** isAuth helper ([a478ad6c4](https://github.com/powerhouse-inc/powerhouse/commit/a478ad6c4))
- **reactor-api:** removed protection for option requests ([ba37db4d4](https://github.com/powerhouse-inc/powerhouse/commit/ba37db4d4))
- **reactor-api:** allow unauthorized GET requests if auth is enabled ([b0ca34491](https://github.com/powerhouse-inc/powerhouse/commit/b0ca34491))
- **reactor-api:** add preferredEditor argument to addDrive method ([dbd425fa2](https://github.com/powerhouse-inc/powerhouse/commit/dbd425fa2))
- **reactor-api,reactor-local,document-drive:** import processors from packages ([2c6054850](https://github.com/powerhouse-inc/powerhouse/commit/2c6054850))
- **reactor-local,reactor-api:** update router after loading local subgraphs ([9cf1b2130](https://github.com/powerhouse-inc/powerhouse/commit/9cf1b2130))
- **scripts:** merged install tools and setup environment into one script ([2a7bd3c97](https://github.com/powerhouse-inc/powerhouse/commit/2a7bd3c97))
- **setup-environment:** updated install tools ([d91e08137](https://github.com/powerhouse-inc/powerhouse/commit/d91e08137))
- **switchboard:** use config ([28b994a9e](https://github.com/powerhouse-inc/powerhouse/commit/28b994a9e))
- **switchboard:** docker build ([7052e39e1](https://github.com/powerhouse-inc/powerhouse/commit/7052e39e1))
- **switchboard:** improved dockerfile ([130fc5535](https://github.com/powerhouse-inc/powerhouse/commit/130fc5535))
- **switchboard:** damn heroku ([fb95e9adc](https://github.com/powerhouse-inc/powerhouse/commit/fb95e9adc))
- **switchboard:** entrypoint ([472d6fa11](https://github.com/powerhouse-inc/powerhouse/commit/472d6fa11))
- **switchboard:** set port in entrypoint ([c09677ec9](https://github.com/powerhouse-inc/powerhouse/commit/c09677ec9))
- **switchboard,reactor-local:** latest version of sky atlas was not being installed ([72bf72fd4](https://github.com/powerhouse-inc/powerhouse/commit/72bf72fd4))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Callme-T
- Frank
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter