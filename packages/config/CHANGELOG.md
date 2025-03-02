## 1.18.1 (2025-03-02)

### 🩹 Fixes

- **connect,design-system:** fix tailwind theme ([0a05af92](https://github.com/powerhouse-inc/powerhouse/commit/0a05af92))
- **reactor-api:** added missing dependency ([e5c5c981](https://github.com/powerhouse-inc/powerhouse/commit/e5c5c981))
- **builder-tools:** added missing dependencies ([540b7913](https://github.com/powerhouse-inc/powerhouse/commit/540b7913))

### ❤️ Thank You

- acaldas

## 1.18.0 (2025-02-28)

### 🚀 Features

- **connect:** use import maps ([18a467df](https://github.com/powerhouse-inc/powerhouse/commit/18a467df))
- **connect:** support custom drives ([5803fdd7](https://github.com/powerhouse-inc/powerhouse/commit/5803fdd7))
- **config:** added https config for switchboard ([f48e19dc](https://github.com/powerhouse-inc/powerhouse/commit/f48e19dc))
- **ph-cli:** fix tsconfig ([2c55fb74](https://github.com/powerhouse-inc/powerhouse/commit/2c55fb74))
- **design-system:** remove use of expand collapse animation ([a12f7130](https://github.com/powerhouse-inc/powerhouse/commit/a12f7130))
- **monorepo:** unify linting and build ([542313e9](https://github.com/powerhouse-inc/powerhouse/commit/542313e9))
- **monorepo:** remove global dev deps ([ac51963c](https://github.com/powerhouse-inc/powerhouse/commit/ac51963c))
- **builder-tools:** add tailwind vite plugin and cli ([c65240a1](https://github.com/powerhouse-inc/powerhouse/commit/c65240a1))
- **common:** fix exports field ([139fa8fc](https://github.com/powerhouse-inc/powerhouse/commit/139fa8fc))
- **common:** use document drive document model from document drive ([131c6ce0](https://github.com/powerhouse-inc/powerhouse/commit/131c6ce0))
- **monorepo:** resolve type errors from merge ([2fac6737](https://github.com/powerhouse-inc/powerhouse/commit/2fac6737))
- **document-drive:** child loggers, ability to follow env in connect and reactor ([af3e68a8](https://github.com/powerhouse-inc/powerhouse/commit/af3e68a8))
- **connect:** load apps ([06632e3d](https://github.com/powerhouse-inc/powerhouse/commit/06632e3d))
- **connect:** initial support for drive editor container ([3cd39099](https://github.com/powerhouse-inc/powerhouse/commit/3cd39099))
- **monorepo:** update test exclude in eslint config ([fc95bade](https://github.com/powerhouse-inc/powerhouse/commit/fc95bade))
- **ph-cmd:** add references to ph cmd tsconfig ([50381e1e](https://github.com/powerhouse-inc/powerhouse/commit/50381e1e))
- **monorepo:** let acaldas try ([351cdc55](https://github.com/powerhouse-inc/powerhouse/commit/351cdc55))
- **monorepo:** fix top level type errors ([c2d93580](https://github.com/powerhouse-inc/powerhouse/commit/c2d93580))
- **monorepo:** include global check-types ([f4b04222](https://github.com/powerhouse-inc/powerhouse/commit/f4b04222))
- **builder-tools:** remove redundant deps ([fdf091df](https://github.com/powerhouse-inc/powerhouse/commit/fdf091df))
- **connect:** finish type rename ([865be799](https://github.com/powerhouse-inc/powerhouse/commit/865be799))
- **document-model-editor:** move editor to builder tooling ([c4616ffc](https://github.com/powerhouse-inc/powerhouse/commit/c4616ffc))
- **common:** improved drive story ([ec96a6b7](https://github.com/powerhouse-inc/powerhouse/commit/ec96a6b7))
- **common:** document drive generic layout ([e7518094](https://github.com/powerhouse-inc/powerhouse/commit/e7518094))
- **common:** initial commit ([f561b8c9](https://github.com/powerhouse-inc/powerhouse/commit/f561b8c9))
- **codegen:** handle codegen location ([4a9ba97d](https://github.com/powerhouse-inc/powerhouse/commit/4a9ba97d))
- **builder-tools:** move editor utils to builder tools ([d115e257](https://github.com/powerhouse-inc/powerhouse/commit/d115e257))
- **monorepo:** allow emit on error ([b29fafab](https://github.com/powerhouse-inc/powerhouse/commit/b29fafab))
- **document-model:** revert change utils file names ([cc2c1805](https://github.com/powerhouse-inc/powerhouse/commit/cc2c1805))
- **builder-tools:** move connect studio ([1a6011ea](https://github.com/powerhouse-inc/powerhouse/commit/1a6011ea))
- **reactor-api:** fix document drive importsx ([e65f4c6d](https://github.com/powerhouse-inc/powerhouse/commit/e65f4c6d))
- **document-model:** replace usages of Document ([0c3b5b81](https://github.com/powerhouse-inc/powerhouse/commit/0c3b5b81))
- **scalars:** add the firts iteration of time-fiel component ([c3dc89af](https://github.com/powerhouse-inc/powerhouse/commit/c3dc89af))
- **codegen:** handle codegen path ([39b0aca8](https://github.com/powerhouse-inc/powerhouse/commit/39b0aca8))
- **document-model:** update generics ([211dfe95](https://github.com/powerhouse-inc/powerhouse/commit/211dfe95))
- **document-model:** simplify generics ([572eecd5](https://github.com/powerhouse-inc/powerhouse/commit/572eecd5))
- **document-drive:** move drive document model to drive package ([d6bb69f0](https://github.com/powerhouse-inc/powerhouse/commit/d6bb69f0))
- **document-model-libs:** update config and deps ([bf250ef6](https://github.com/powerhouse-inc/powerhouse/commit/bf250ef6))
- **document-model:** rename types ([73bdc1f0](https://github.com/powerhouse-inc/powerhouse/commit/73bdc1f0))
- **monorepo:** add imports eslint plugin ([807602f6](https://github.com/powerhouse-inc/powerhouse/commit/807602f6))
- **monorepo:** bump deps ([7a898f66](https://github.com/powerhouse-inc/powerhouse/commit/7a898f66))

### 🩹 Fixes

- **connect:** fix bundling ([78dbf0e4](https://github.com/powerhouse-inc/powerhouse/commit/78dbf0e4))
- **connect:** fix ph connect ([a640ce86](https://github.com/powerhouse-inc/powerhouse/commit/a640ce86))
- **config:** use reactor object instead of switchboard ([371529f7](https://github.com/powerhouse-inc/powerhouse/commit/371529f7))
- **connect:** fixed ph connect ([c30b530e](https://github.com/powerhouse-inc/powerhouse/commit/c30b530e))
- **connect:** connect bundling fixes ([a56c4e62](https://github.com/powerhouse-inc/powerhouse/commit/a56c4e62))
- **document-drive:** added bench to package.json but removed from github workflow ([8114c807](https://github.com/powerhouse-inc/powerhouse/commit/8114c807))
- **document-drive:** ci should run benchmarks too ([e087b908](https://github.com/powerhouse-inc/powerhouse/commit/e087b908))
- revert nx build dependencies ([3e8de163](https://github.com/powerhouse-inc/powerhouse/commit/3e8de163))
- adding labels and specifying ubuntu version ([7ee6ccfc](https://github.com/powerhouse-inc/powerhouse/commit/7ee6ccfc))
- full revert of this workflow ([f3813d65](https://github.com/powerhouse-inc/powerhouse/commit/f3813d65))
- re-adding setup node action ([f3d5e201](https://github.com/powerhouse-inc/powerhouse/commit/f3d5e201))
- try moving NX command lower ([ab965457](https://github.com/powerhouse-inc/powerhouse/commit/ab965457))
- nx cycle ([19b7a296](https://github.com/powerhouse-inc/powerhouse/commit/19b7a296))
- apparently github does not tell you when they don't support a label ([39de6f1e](https://github.com/powerhouse-inc/powerhouse/commit/39de6f1e))
- both github workflows that affect document-drive should use the same versions ([3c15a16b](https://github.com/powerhouse-inc/powerhouse/commit/3c15a16b))
- project.json caused an nx cycle, so just check types before building ([875da7d8](https://github.com/powerhouse-inc/powerhouse/commit/875da7d8))

### ❤️ Thank You

- acaldas @acaldas
- alejandrocabriales
- Benjamin Jordan
- Frank
- ryanwolhuter @ryanwolhuter

## 1.17.0 (2025-02-14)

### 🚀 Features

- testing prettier config and extension ([f62bc03d](https://github.com/powerhouse-inc/powerhouse/commit/f62bc03d))
- adding initial benchmark for reactor import ([a34d51a6](https://github.com/powerhouse-inc/powerhouse/commit/a34d51a6))
- export id of external packages ([967f076b](https://github.com/powerhouse-inc/powerhouse/commit/967f076b))
- **connect:** support removing external packages ([a9b1d59c](https://github.com/powerhouse-inc/powerhouse/commit/a9b1d59c))
- **design-system:** add danger zone settings page ([572345bc](https://github.com/powerhouse-inc/powerhouse/commit/572345bc))

### 🩹 Fixes

- **ph-cli:** review comments ([2536bb71](https://github.com/powerhouse-inc/powerhouse/commit/2536bb71))
- **connect:** set / as default base path ([4992a62d](https://github.com/powerhouse-inc/powerhouse/commit/4992a62d))
- **connect:** use base path on build ([c62574c9](https://github.com/powerhouse-inc/powerhouse/commit/c62574c9))
- **reactor-api:** use pascal case for document model schema prefix ([835da67d](https://github.com/powerhouse-inc/powerhouse/commit/835da67d))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Frank
- ryanwolhuter

## 1.16.0 (2025-02-06)

### 🚀 Features

- **ph-cli:** added commands alias ([6fddb07a](https://github.com/powerhouse-inc/powerhouse/commit/6fddb07a))
- **reactor-local:** watch config file for external packages ([40dc9c3c](https://github.com/powerhouse-inc/powerhouse/commit/40dc9c3c))
- **connect:** improved loading of external packages ([7ea94ee5](https://github.com/powerhouse-inc/powerhouse/commit/7ea94ee5))
- **scalars:** improve sidebar performance ([c7a03809](https://github.com/powerhouse-inc/powerhouse/commit/c7a03809))
- **ph-cli:** enable uninstall command ([#965](https://github.com/powerhouse-inc/powerhouse/pull/965))
- **config:** added import scripts dir ([66995ca1](https://github.com/powerhouse-inc/powerhouse/commit/66995ca1))
- **scalars:** preserve react directives ([b15888e7](https://github.com/powerhouse-inc/powerhouse/commit/b15888e7))
- merge main into dspot-branch ([#769](https://github.com/powerhouse-inc/powerhouse/pull/769))
- **scalars:** add support to include dependent areas ([b0b385d8](https://github.com/powerhouse-inc/powerhouse/commit/b0b385d8))
- **scalars:** generate nanoids by default in id fields ([445ff4bf](https://github.com/powerhouse-inc/powerhouse/commit/445ff4bf))
- **design-system:** update github actions ([b0d86f4c](https://github.com/powerhouse-inc/powerhouse/commit/b0d86f4c))
- **scalars:** add CountryCodeField with configs, tests & base stories ([503b2408](https://github.com/powerhouse-inc/powerhouse/commit/503b2408))
- **scalars:** improve protocols and url field ([6a965cf6](https://github.com/powerhouse-inc/powerhouse/commit/6a965cf6))
- **scalars:** add last styles to SelectField, improve fragments & refactor ([9f03f005](https://github.com/powerhouse-inc/powerhouse/commit/9f03f005))
- **scalars:** add strings styles ([58f38f9a](https://github.com/powerhouse-inc/powerhouse/commit/58f38f9a))
- **scalars:** add EnumField with configs & tests ([31386853](https://github.com/powerhouse-inc/powerhouse/commit/31386853))
- **scalars:** add single/multi select fields with all props & base styles ([e38ef055](https://github.com/powerhouse-inc/powerhouse/commit/e38ef055))
- **scalars:** add tooltip ([e3635ed4](https://github.com/powerhouse-inc/powerhouse/commit/e3635ed4))
- **scalars:** added exports for codegen ([#434](https://github.com/powerhouse-inc/powerhouse/pull/434))
- **scalars:** boolean fields scafolding ([217683de](https://github.com/powerhouse-inc/powerhouse/commit/217683de))

### 🩹 Fixes

- **reactor-api:** type error ([df877b9e](https://github.com/powerhouse-inc/powerhouse/commit/df877b9e))
- **scalars:** update pnpm and commit the .yaml ([6152f641](https://github.com/powerhouse-inc/powerhouse/commit/6152f641))
- **scalars:** try to generate the lock.ymal ([49a69907](https://github.com/powerhouse-inc/powerhouse/commit/49a69907))
- **scalars:** generate the .yaml ([34d8fffd](https://github.com/powerhouse-inc/powerhouse/commit/34d8fffd))
- **scalars:** solving conflict with .yaml file ([3a83b86b](https://github.com/powerhouse-inc/powerhouse/commit/3a83b86b))
- **connect:** docker build ([3b679117](https://github.com/powerhouse-inc/powerhouse/commit/3b679117))
- **scalars:** add the .yaml ([33eecd8c](https://github.com/powerhouse-inc/powerhouse/commit/33eecd8c))
- update docker publish action ([956236a1](https://github.com/powerhouse-inc/powerhouse/commit/956236a1))
- **connect:** setup npm release ([650f0888](https://github.com/powerhouse-inc/powerhouse/commit/650f0888))
- **connect:** lint ([4ada2650](https://github.com/powerhouse-inc/powerhouse/commit/4ada2650))
- **connect:** updated dependencies ([de205722](https://github.com/powerhouse-inc/powerhouse/commit/de205722))
- **scalars:** change warning colors ([c1405294](https://github.com/powerhouse-inc/powerhouse/commit/c1405294))
- **monorepo:** remove nx cloud id ([2b728067](https://github.com/powerhouse-inc/powerhouse/commit/2b728067))
- **scalars:** update pnpm-lock.yaml ([787f0962](https://github.com/powerhouse-inc/powerhouse/commit/787f0962))
- **design-system:** added missing deps after rebase ([04f00323](https://github.com/powerhouse-inc/powerhouse/commit/04f00323))
- **switchboard-gui:** restore prev vite version ([57273e5d](https://github.com/powerhouse-inc/powerhouse/commit/57273e5d))
- **scalars:** update pnpm-lock.yaml ([d0ace5e5](https://github.com/powerhouse-inc/powerhouse/commit/d0ace5e5))
- **scalars:** fix snapshot tests after conflict resolution ([0fbe8a20](https://github.com/powerhouse-inc/powerhouse/commit/0fbe8a20))
- **scalars:** code improvements in Radio and Radio Group components ([bd05bd49](https://github.com/powerhouse-inc/powerhouse/commit/bd05bd49))
- **scalars:** missing dependency ([ef058160](https://github.com/powerhouse-inc/powerhouse/commit/ef058160))

### ❤️ Thank You

- acaldas @acaldas
- alejandrocabriales
- Frank
- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- nestor
- ryanwolhuter @ryanwolhuter
- Yasiel Cabrera @YasielCabrera

## 1.15.0 (2025-01-29)

### 🚀 Features

- **monorepo:** move ph-cmd to clis directory ([8182595c](https://github.com/powerhouse-inc/powerhouse/commit/8182595c))
- **monorepo:** move ph cli to clis directory ([5b677ebd](https://github.com/powerhouse-inc/powerhouse/commit/5b677ebd))
- **ph-cli:** rename reactor to switchboard ([#947](https://github.com/powerhouse-inc/powerhouse/pull/947))

### 🩹 Fixes

- **ph-cmd:** inject ph-cmd version in build time ([#934](https://github.com/powerhouse-inc/powerhouse/pull/934))

### ❤️ Thank You

- Frank @froid1911
- Guillermo Puente Sandoval
- ryanwolhuter

## 1.14.0 (2025-01-24)

### 🚀 Features

- **reactor-local:** load document models from installed packages ([3d434fd7](https://github.com/powerhouse-inc/powerhouse/commit/3d434fd7))
- **config:** allow passing path to read config ([f3923c01](https://github.com/powerhouse-inc/powerhouse/commit/f3923c01))
- **ph-cli:** use getConfig in connect command ([#917](https://github.com/powerhouse-inc/powerhouse/pull/917))
- **ph-cli:** trigger release ([6624a561](https://github.com/powerhouse-inc/powerhouse/commit/6624a561))

### 🩹 Fixes

- **ph-cmd:** read version from package.json ([#920](https://github.com/powerhouse-inc/powerhouse/pull/920))
- **ph-cli:** update connect dep ([#919](https://github.com/powerhouse-inc/powerhouse/pull/919))

### ❤️ Thank You

- acaldas
- Frank @froid1911
- Guillermo Puente Sandoval

## 1.13.0 (2025-01-23)

### 🚀 Features

- push release ([642449fb](https://github.com/powerhouse-inc/powerhouse/commit/642449fb))

### ❤️ Thank You

- Frank @froid1911

## 1.12.0 (2025-01-23)

### 🚀 Features

- **ph-cli:** added https support for connect ([a9335a4d](https://github.com/powerhouse-inc/powerhouse/commit/a9335a4d))
- **ph-cli:** update connect ver ([#901](https://github.com/powerhouse-inc/powerhouse/pull/901))

### ❤️ Thank You

- acaldas
- Guillermo Puente Sandoval

## 1.11.0 (2025-01-22)

### 🚀 Features

- **config:** added host in ph config ([#899](https://github.com/powerhouse-inc/powerhouse/pull/899))
- **ph-cmd:** add scalars as dep ([#897](https://github.com/powerhouse-inc/powerhouse/pull/897))
- **ph-cli:** added pm2 process manager ([7866ce9d](https://github.com/powerhouse-inc/powerhouse/commit/7866ce9d))
- **ph-cli:** updated connect ver ([#886](https://github.com/powerhouse-inc/powerhouse/pull/886))

### ❤️ Thank You

- Frank
- Guillermo Puente Sandoval @gpuente

## 1.10.0 (2025-01-21)

### 🚀 Features

- update ph-cli connect ver ([#884](https://github.com/powerhouse-inc/powerhouse/pull/884))
- **ph-cli:** added configFile support ([#883](https://github.com/powerhouse-inc/powerhouse/pull/883))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 1.9.0 (2025-01-21)

### 🚀 Features

- update install command ([#881](https://github.com/powerhouse-inc/powerhouse/pull/881))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 1.8.0 (2025-01-21)

### 🚀 Features

- split ph-cmd ([#876](https://github.com/powerhouse-inc/powerhouse/pull/876))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 1.7.0 (2025-01-17)

### 🚀 Features

- **ph-cli:** default to root project when installing a dep globally ([#840](https://github.com/powerhouse-inc/powerhouse/pull/840))

### ❤️ Thank You

- Guillermo Puente Sandoval

## 1.6.0 (2025-01-16)

### 🚀 Features

- **ph-cli:** added install command ([#831](https://github.com/powerhouse-inc/powerhouse/pull/831))
- **ph-cli:** added connect command ([dd20da14](https://github.com/powerhouse-inc/powerhouse/commit/dd20da14))
- **design-system:** merge dspot into main ([bef482f9](https://github.com/powerhouse-inc/powerhouse/commit/bef482f9))
- **react-reactor:** updated build config ([#759](https://github.com/powerhouse-inc/powerhouse/pull/759))

### 🩹 Fixes

- **codegen:** readded config dependency ([289bdaf4](https://github.com/powerhouse-inc/powerhouse/commit/289bdaf4))
- **codegen:** fixed create-lib build ([d5523d1e](https://github.com/powerhouse-inc/powerhouse/commit/d5523d1e))
- **codegen:** added prettier dependency ([b104d473](https://github.com/powerhouse-inc/powerhouse/commit/b104d473))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente Sandoval

## 1.5.0 (2025-01-06)

### 🚀 Features

- removed document-model editor v1 ([#745](https://github.com/powerhouse-inc/powerhouse/pull/745))
- **reactor-browser:** initial package setup ([ad637dcb](https://github.com/powerhouse-inc/powerhouse/commit/ad637dcb))
- **renown:** added initial renown sdk package ([2864fbc6](https://github.com/powerhouse-inc/powerhouse/commit/2864fbc6))

### 🩹 Fixes

- **reactor-api:** update graphql dependency ([ed063402](https://github.com/powerhouse-inc/powerhouse/commit/ed063402))

### ❤️ Thank You

- acaldas
- Frank
- Guillermo Puente Sandoval

## 1.4.0 (2024-12-16)

### 🚀 Features

- updated nx version ([c9690c35](https://github.com/powerhouse-inc/powerhouse/commit/c9690c35))

### ❤️ Thank You

- Frank

## 1.3.0 (2024-12-16)

### 🚀 Features

- **config:** trigger release ([9df86bc4](https://github.com/powerhouse-inc/powerhouse/commit/9df86bc4))
- **document-model:** export generateId method ([71d945b2](https://github.com/powerhouse-inc/powerhouse/commit/71d945b2))

### 🩹 Fixes

- **switchboard:** subgraph manager and db instantiation ([874bdc4b](https://github.com/powerhouse-inc/powerhouse/commit/874bdc4b))

### ❤️ Thank You

- acaldas
- Frank

## 1.2.0 (2024-12-11)

### 🚀 Features

- **reactor-api:** Added support for processors ([#655](https://github.com/powerhouse-inc/powerhouse/pull/655))
- **design-system:** release dspot-scalars components ([881b8995](https://github.com/powerhouse-inc/powerhouse/commit/881b8995))

### 🩹 Fixes

- **monorepo:** remove nx cloud id ([45da8784](https://github.com/powerhouse-inc/powerhouse/commit/45da8784))

### ❤️ Thank You

- acaldas
- Guillermo Puente Sandoval
- ryanwolhuter

## 1.1.1 (2024-12-09)

### 🩹 Fixes

- **config:** added build ([aaeb785f](https://github.com/powerhouse-inc/powerhouse/commit/aaeb785f))

### ❤️ Thank You

- Guillermo Puente @gpuente

## 1.1.0 (2024-12-09)

### 🚀 Features

- **monorepo:** handle project references ([3b6c046f](https://github.com/powerhouse-inc/powerhouse/commit/3b6c046f))

### ❤️ Thank You

- ryanwolhuter @ryanwolhuter