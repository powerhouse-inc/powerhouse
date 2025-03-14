## 1.29.1 (2025-03-13)

### 🩹 Fixes

- updated sky atlas demo deployment action ([066f97ff](https://github.com/powerhouse-inc/powerhouse/commit/066f97ff))
- **document-drive:** do not export prisma factory on index ([a32ef36a](https://github.com/powerhouse-inc/powerhouse/commit/a32ef36a))
- **ph-cli:** lazy import each command action ([b18c1217](https://github.com/powerhouse-inc/powerhouse/commit/b18c1217))

### ❤️ Thank You

- acaldas
- Frank

## 1.29.0 (2025-03-12)

### 🚀 Features

- return fetch documents ([#1270](https://github.com/powerhouse-inc/powerhouse/pull/1270))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 1.28.0 (2025-03-12)

### 🚀 Features

- include addDocument in driveContext ([#1269](https://github.com/powerhouse-inc/powerhouse/pull/1269))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 1.27.0 (2025-03-12)

### 🚀 Features

- **builder-tools:** add editors css link in studio plugin ([ca0edbdd](https://github.com/powerhouse-inc/powerhouse/commit/ca0edbdd))
- **connect:** support setting PH_PACKAGES when building ([6ba01dd1](https://github.com/powerhouse-inc/powerhouse/commit/6ba01dd1))
- **monorepo:** fix merge conflicts ([b58117b7](https://github.com/powerhouse-inc/powerhouse/commit/b58117b7))
- **design-system:** add allow default project for vitest config ([36197d08](https://github.com/powerhouse-inc/powerhouse/commit/36197d08))
- **ph-cli:** add .ph dir to lint ignore ([9fcdadff](https://github.com/powerhouse-inc/powerhouse/commit/9fcdadff))
- **design-system:** add setup tests ([08c49075](https://github.com/powerhouse-inc/powerhouse/commit/08c49075))
- **connect:** handle imports ([d22b0813](https://github.com/powerhouse-inc/powerhouse/commit/d22b0813))
- **monorepo:** enable type import lint rule ([5fd80202](https://github.com/powerhouse-inc/powerhouse/commit/5fd80202))
- **design-system:** use design system styles from src instead of dist ([e866c3f6](https://github.com/powerhouse-inc/powerhouse/commit/e866c3f6))
- **switchboard-gui:** use tailwind v4 ([ee3d4175](https://github.com/powerhouse-inc/powerhouse/commit/ee3d4175))
- **connect:** atlas import route ([2021bc20](https://github.com/powerhouse-inc/powerhouse/commit/2021bc20))
- **design-system:** update snapshots ([77b8c05c](https://github.com/powerhouse-inc/powerhouse/commit/77b8c05c))
- **common:** migrate to tailwind v4 ([50c39373](https://github.com/powerhouse-inc/powerhouse/commit/50c39373))
- **connect:** migrate to tailwind v4 ([8e749cc0](https://github.com/powerhouse-inc/powerhouse/commit/8e749cc0))
- **connect:** use css based design system theme ([edda9470](https://github.com/powerhouse-inc/powerhouse/commit/edda9470))
- **design-system:** use prettier tw plugin ([2de64bd7](https://github.com/powerhouse-inc/powerhouse/commit/2de64bd7))
- **design-system:** bump tailwind deps ([ca847fdf](https://github.com/powerhouse-inc/powerhouse/commit/ca847fdf))
- **design-system:** port preset to css vars ([b0c3b51d](https://github.com/powerhouse-inc/powerhouse/commit/b0c3b51d))

### 🩹 Fixes

- **connect,builder-tools:** fix studio imports ([9f3628e7](https://github.com/powerhouse-inc/powerhouse/commit/9f3628e7))
- **document-drive:** no password for redis testing ([1519c3d5](https://github.com/powerhouse-inc/powerhouse/commit/1519c3d5))
- **document-drive:** re-enabling redis queue tests, fixing them, making them non-optional ([532e0603](https://github.com/powerhouse-inc/powerhouse/commit/532e0603))
- **switchboard:** heroku deployment missing sky ph dep ([d47dc3f8](https://github.com/powerhouse-inc/powerhouse/commit/d47dc3f8))
- **switchboard:** small optimizations on build and runtime ([63ef21b8](https://github.com/powerhouse-inc/powerhouse/commit/63ef21b8))
- **ph-cmd:** build with tsc ([26965361](https://github.com/powerhouse-inc/powerhouse/commit/26965361))
- **ph-cli:** cleanup dependencies ([c1fb1b63](https://github.com/powerhouse-inc/powerhouse/commit/c1fb1b63))
- **switchboard:** updated sky-ph dependency ([39ddbfdf](https://github.com/powerhouse-inc/powerhouse/commit/39ddbfdf))
- **connect:** fixed importmap generation ([cffcb97b](https://github.com/powerhouse-inc/powerhouse/commit/cffcb97b))

### ❤️ Thank You

- acaldas @acaldas
- Benjamin Jordan
- Frank
- ryanwolhuter @ryanwolhuter

## 1.26.0 (2025-03-05)

### 🚀 Features

- regenerate lockfile ([6c70fbfc](https://github.com/powerhouse-inc/powerhouse/commit/6c70fbfc))
- **monorepo:** regenerate lockfile ([258eefbd](https://github.com/powerhouse-inc/powerhouse/commit/258eefbd))
- **atlas:** add atlas subgraphs to switchboard ([777434d6](https://github.com/powerhouse-inc/powerhouse/commit/777434d6))

### 🩹 Fixes

- **switchboard:** added outdated deployment ([339d7b8e](https://github.com/powerhouse-inc/powerhouse/commit/339d7b8e))
- **common:** fixed missing useDocumentState hooks in storybook ([0af73b9a](https://github.com/powerhouse-inc/powerhouse/commit/0af73b9a))
- **codegen,document-drive,reactor-api:** fix ph generate command for GraphQL mutations ([2aa75720](https://github.com/powerhouse-inc/powerhouse/commit/2aa75720))
- **document-drive:** copy prisma schema to dist folder ([5c7f7635](https://github.com/powerhouse-inc/powerhouse/commit/5c7f7635))
- **document-drive:** run prisma generate before build ([17ce0913](https://github.com/powerhouse-inc/powerhouse/commit/17ce0913))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- ryanwolhuter @ryanwolhuter
- Wouter Kampmann

## 1.25.1 (2025-03-04)

### 🩹 Fixes

- keep consistent zod version across projects ([97cdadab](https://github.com/powerhouse-inc/powerhouse/commit/97cdadab))
- **codegen,document-model,document-drive:** updated codegen templates ([5e41b78f](https://github.com/powerhouse-inc/powerhouse/commit/5e41b78f))
- **document-drive:** fixing some more compiler errors ([345be42a](https://github.com/powerhouse-inc/powerhouse/commit/345be42a))
- **switchboard:** use tsc instead up tsup and vite node ([de2e7104](https://github.com/powerhouse-inc/powerhouse/commit/de2e7104))
- **document-drive:** fixing some document-helpers tests by fixing imports ([a41ef5f8](https://github.com/powerhouse-inc/powerhouse/commit/a41ef5f8))
- adding vitest as dev dependency ([8c9cac84](https://github.com/powerhouse-inc/powerhouse/commit/8c9cac84))
- **reactor-api:** added missing dependency ([e5c5c981](https://github.com/powerhouse-inc/powerhouse/commit/e5c5c981))
- **builder-tools:** added missing dependencies ([540b7913](https://github.com/powerhouse-inc/powerhouse/commit/540b7913))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- ryanwolhuter

## 1.25.0 (2025-02-28)

### 🚀 Features

- **connect:** use import maps ([18a467df](https://github.com/powerhouse-inc/powerhouse/commit/18a467df))
- **connect:** support custom drives ([5803fdd7](https://github.com/powerhouse-inc/powerhouse/commit/5803fdd7))
- **ph-cli:** fix tsconfig ([2c55fb74](https://github.com/powerhouse-inc/powerhouse/commit/2c55fb74))
- **design-system:** remove use of expand collapse animation ([a12f7130](https://github.com/powerhouse-inc/powerhouse/commit/a12f7130))
- **monorepo:** unify linting and build ([542313e9](https://github.com/powerhouse-inc/powerhouse/commit/542313e9))
- **monorepo:** remove global dev deps ([ac51963c](https://github.com/powerhouse-inc/powerhouse/commit/ac51963c))
- **builder-tools:** add tailwind vite plugin and cli ([c65240a1](https://github.com/powerhouse-inc/powerhouse/commit/c65240a1))
- **common:** fix exports field ([139fa8fc](https://github.com/powerhouse-inc/powerhouse/commit/139fa8fc))
- **common:** use document drive document model from document drive ([131c6ce0](https://github.com/powerhouse-inc/powerhouse/commit/131c6ce0))
- **monorepo:** resolve type errors from merge ([2fac6737](https://github.com/powerhouse-inc/powerhouse/commit/2fac6737))
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
- **scalars:** add sidebar item status ([59438113](https://github.com/powerhouse-inc/powerhouse/commit/59438113))
- **document-drive:** move drive document model to drive package ([d6bb69f0](https://github.com/powerhouse-inc/powerhouse/commit/d6bb69f0))
- **scalars:** added sidebar provider extra functions ([266b53c5](https://github.com/powerhouse-inc/powerhouse/commit/266b53c5))
- **document-model-libs:** park for now ([36a2fcc3](https://github.com/powerhouse-inc/powerhouse/commit/36a2fcc3))
- **scalars:** pinned items hover ([55929ebc](https://github.com/powerhouse-inc/powerhouse/commit/55929ebc))
- **document-model-libs:** update config and deps ([bf250ef6](https://github.com/powerhouse-inc/powerhouse/commit/bf250ef6))
- **document-model:** rename types ([73bdc1f0](https://github.com/powerhouse-inc/powerhouse/commit/73bdc1f0))
- **monorepo:** add imports eslint plugin ([807602f6](https://github.com/powerhouse-inc/powerhouse/commit/807602f6))
- **monorepo:** bump deps ([7a898f66](https://github.com/powerhouse-inc/powerhouse/commit/7a898f66))

### 🩹 Fixes

- **connect:** fix bundling ([78dbf0e4](https://github.com/powerhouse-inc/powerhouse/commit/78dbf0e4))
- **connect:** fix ph connect ([a640ce86](https://github.com/powerhouse-inc/powerhouse/commit/a640ce86))
- **connect:** fixed ph connect ([c30b530e](https://github.com/powerhouse-inc/powerhouse/commit/c30b530e))
- **connect:** connect bundling fixes ([a56c4e62](https://github.com/powerhouse-inc/powerhouse/commit/a56c4e62))
- **document-drive:** added bench to package.json but removed from github workflow ([8114c807](https://github.com/powerhouse-inc/powerhouse/commit/8114c807))
- **document-drive:** ci should run benchmarks too ([e087b908](https://github.com/powerhouse-inc/powerhouse/commit/e087b908))
- **document-drive:** unit test failure from zod fixes ([d31367cc](https://github.com/powerhouse-inc/powerhouse/commit/d31367cc))
- revert nx build dependencies ([3e8de163](https://github.com/powerhouse-inc/powerhouse/commit/3e8de163))
- **scalars:** sidebar test snapshot ([51cfa4ee](https://github.com/powerhouse-inc/powerhouse/commit/51cfa4ee))
- adding labels and specifying ubuntu version ([7ee6ccfc](https://github.com/powerhouse-inc/powerhouse/commit/7ee6ccfc))
- full revert of this workflow ([f3813d65](https://github.com/powerhouse-inc/powerhouse/commit/f3813d65))
- re-adding setup node action ([f3d5e201](https://github.com/powerhouse-inc/powerhouse/commit/f3d5e201))
- try moving NX command lower ([ab965457](https://github.com/powerhouse-inc/powerhouse/commit/ab965457))
- nx cycle ([19b7a296](https://github.com/powerhouse-inc/powerhouse/commit/19b7a296))
- apparently github does not tell you when they don't support a label ([39de6f1e](https://github.com/powerhouse-inc/powerhouse/commit/39de6f1e))
- both github workflows that affect document-drive should use the same versions ([3c15a16b](https://github.com/powerhouse-inc/powerhouse/commit/3c15a16b))
- project.json caused an nx cycle, so just check types before building ([875da7d8](https://github.com/powerhouse-inc/powerhouse/commit/875da7d8))
- **scalars:** ensure that onchange is called with the latest value ([70da875a](https://github.com/powerhouse-inc/powerhouse/commit/70da875a))
- **scalars:** prevent multiple unnecessary  calls to onChange ([1779dd36](https://github.com/powerhouse-inc/powerhouse/commit/1779dd36))

### ❤️ Thank You

- acaldas @acaldas
- alejandrocabriales
- Benjamin Jordan
- ryanwolhuter @ryanwolhuter
- Yasiel Cabrera

## 1.24.0 (2025-02-19)

### 🚀 Features

- **common:** improved drive story ([ec96a6b7](https://github.com/powerhouse-inc/powerhouse/commit/ec96a6b7))
- **common:** document drive generic layout ([e7518094](https://github.com/powerhouse-inc/powerhouse/commit/e7518094))
- **common:** initial commit ([f561b8c9](https://github.com/powerhouse-inc/powerhouse/commit/f561b8c9))

### ❤️ Thank You

- acaldas @acaldas

## 1.23.0 (2025-02-14)

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

## 1.22.0 (2025-02-06)

### 🚀 Features

- **ph-cli:** added commands alias ([6fddb07a](https://github.com/powerhouse-inc/powerhouse/commit/6fddb07a))
- **connect:** improved loading of external packages ([7ea94ee5](https://github.com/powerhouse-inc/powerhouse/commit/7ea94ee5))
- **scalars:** improve sidebar performance ([c7a03809](https://github.com/powerhouse-inc/powerhouse/commit/c7a03809))
- **ph-cli:** enable uninstall command ([#965](https://github.com/powerhouse-inc/powerhouse/pull/965))
- **scalars:** allow to use custom icons in the sidebar items ([cc95e0ff](https://github.com/powerhouse-inc/powerhouse/commit/cc95e0ff))
- **scalars:** preserve react directives ([b15888e7](https://github.com/powerhouse-inc/powerhouse/commit/b15888e7))
- **scalars:** allow to collapse/expand the sidebar ([617c4168](https://github.com/powerhouse-inc/powerhouse/commit/617c4168))
- **scalars:** add sidebar base ([16fc4630](https://github.com/powerhouse-inc/powerhouse/commit/16fc4630))
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
- **scalars:** add form example ([91e9fa31](https://github.com/powerhouse-inc/powerhouse/commit/91e9fa31))
- **scalars:** added built-in form & fields validation ([8cf3a995](https://github.com/powerhouse-inc/powerhouse/commit/8cf3a995))
- **scalars:** add tooltip ([e3635ed4](https://github.com/powerhouse-inc/powerhouse/commit/e3635ed4))
- **scalars:** add checkbox support for warnings and errors messages ([3279c8d8](https://github.com/powerhouse-inc/powerhouse/commit/3279c8d8))
- **scalars:** add a checkbox field ([2d9e11fb](https://github.com/powerhouse-inc/powerhouse/commit/2d9e11fb))
- **scalars:** added exports for codegen ([#434](https://github.com/powerhouse-inc/powerhouse/pull/434))
- **scalars:** boolean fields scafolding ([217683de](https://github.com/powerhouse-inc/powerhouse/commit/217683de))

### 🩹 Fixes

- **reactor-api:** type error ([df877b9e](https://github.com/powerhouse-inc/powerhouse/commit/df877b9e))
- **scalars:** lint ([1dd6dd5a](https://github.com/powerhouse-inc/powerhouse/commit/1dd6dd5a))
- **scalars:** update pnpm and commit the .yaml ([6152f641](https://github.com/powerhouse-inc/powerhouse/commit/6152f641))
- **scalars:** try to generate the lock.ymal ([49a69907](https://github.com/powerhouse-inc/powerhouse/commit/49a69907))
- **scalars:** generate the .yaml ([34d8fffd](https://github.com/powerhouse-inc/powerhouse/commit/34d8fffd))
- **scalars:** solving conflict with .yaml file ([3a83b86b](https://github.com/powerhouse-inc/powerhouse/commit/3a83b86b))
- **connect:** docker build ([3b679117](https://github.com/powerhouse-inc/powerhouse/commit/3b679117))
- **scalars:** add the .yaml ([33eecd8c](https://github.com/powerhouse-inc/powerhouse/commit/33eecd8c))
- update docker publish action ([956236a1](https://github.com/powerhouse-inc/powerhouse/commit/956236a1))
- **scalars:** change warning colors ([c1405294](https://github.com/powerhouse-inc/powerhouse/commit/c1405294))
- **scalars:** validate on blur when specified dynamically ([5e0c621d](https://github.com/powerhouse-inc/powerhouse/commit/5e0c621d))
- **scalars:** revalidate field on required prop change ([41d2f7d7](https://github.com/powerhouse-inc/powerhouse/commit/41d2f7d7))
- **scalars:** merge branch 'dspot-scalars' into feat/amount-with-currencies-token ([bb8118f8](https://github.com/powerhouse-inc/powerhouse/commit/bb8118f8))
- **monorepo:** remove nx cloud id ([2b728067](https://github.com/powerhouse-inc/powerhouse/commit/2b728067))
- **scalars:** update pnpm-lock.yaml ([787f0962](https://github.com/powerhouse-inc/powerhouse/commit/787f0962))
- **design-system:** added missing deps after rebase ([04f00323](https://github.com/powerhouse-inc/powerhouse/commit/04f00323))
- **switchboard-gui:** restore prev vite version ([57273e5d](https://github.com/powerhouse-inc/powerhouse/commit/57273e5d))
- **scalars:** update pnpm-lock.yaml ([d0ace5e5](https://github.com/powerhouse-inc/powerhouse/commit/d0ace5e5))
- **scalars:** fix snapshot tests after conflict resolution ([0fbe8a20](https://github.com/powerhouse-inc/powerhouse/commit/0fbe8a20))
- **scalars:** import path ([44ed009d](https://github.com/powerhouse-inc/powerhouse/commit/44ed009d))
- **scalars:** windows paths ([2bbe727b](https://github.com/powerhouse-inc/powerhouse/commit/2bbe727b))
- **scalars:** tests ([5a5a4a58](https://github.com/powerhouse-inc/powerhouse/commit/5a5a4a58))
- **scalars:** windows paths ([c7c21bfe](https://github.com/powerhouse-inc/powerhouse/commit/c7c21bfe))
- **scalars:** generic validation ([a7c80ba8](https://github.com/powerhouse-inc/powerhouse/commit/a7c80ba8))
- **scalars:** fix the test when change type to number ([453348ed](https://github.com/powerhouse-inc/powerhouse/commit/453348ed))
- **scalars:** tests ([21bf584b](https://github.com/powerhouse-inc/powerhouse/commit/21bf584b))
- **scalars:** move Radio & Radio Group to Fragments & add warnings support ([33b09173](https://github.com/powerhouse-inc/powerhouse/commit/33b09173))
- **scalars:** package.json windows paths ([0a50b7a2](https://github.com/powerhouse-inc/powerhouse/commit/0a50b7a2))
- **scalars:** test & lint ([cfb050b8](https://github.com/powerhouse-inc/powerhouse/commit/cfb050b8))
- **scalars:** package.json exports paths ([366a66e5](https://github.com/powerhouse-inc/powerhouse/commit/366a66e5))
- **scalars:** package.json exports paths ([f8900284](https://github.com/powerhouse-inc/powerhouse/commit/f8900284))
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

## 1.21.1 (2025-01-29)

### 🚀 Features

- **monorepo:** move ph-cmd to clis directory ([8182595c](https://github.com/powerhouse-inc/powerhouse/commit/8182595c))
- **monorepo:** move ph cli to clis directory ([5b677ebd](https://github.com/powerhouse-inc/powerhouse/commit/5b677ebd))

### 🩹 Fixes

- **connect:** setup npm release ([650f0888](https://github.com/powerhouse-inc/powerhouse/commit/650f0888))
- **connect:** lint ([4ada2650](https://github.com/powerhouse-inc/powerhouse/commit/4ada2650))
- **connect:** updated dependencies ([de205722](https://github.com/powerhouse-inc/powerhouse/commit/de205722))
- **ph-cmd:** inject ph-cmd version in build time ([#934](https://github.com/powerhouse-inc/powerhouse/pull/934))

### ❤️ Thank You

- Guillermo Puente @gpuente
- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 1.21.0 (2025-01-24)

### 🚀 Features

- **document-model-libs:** remove rwa ([0516b2e7](https://github.com/powerhouse-inc/powerhouse/commit/0516b2e7))
- **reactor-local:** load document models from installed packages ([3d434fd7](https://github.com/powerhouse-inc/powerhouse/commit/3d434fd7))
- **ph-cli:** use getConfig in connect command ([#917](https://github.com/powerhouse-inc/powerhouse/pull/917))
- **ph-cli:** trigger release ([6624a561](https://github.com/powerhouse-inc/powerhouse/commit/6624a561))

### 🩹 Fixes

- **ph-cmd:** read version from package.json ([#920](https://github.com/powerhouse-inc/powerhouse/pull/920))
- **ph-cli:** update connect dep ([#919](https://github.com/powerhouse-inc/powerhouse/pull/919))

### ❤️ Thank You

- acaldas
- Frank @froid1911
- Guillermo Puente Sandoval
- ryanwolhuter

## 1.20.0 (2025-01-23)

### 🚀 Features

- push release ([642449fb](https://github.com/powerhouse-inc/powerhouse/commit/642449fb))
- **ph-cli:** added https support for connect ([a9335a4d](https://github.com/powerhouse-inc/powerhouse/commit/a9335a4d))

### ❤️ Thank You

- acaldas @acaldas
- Frank @froid1911

## 1.19.0 (2025-01-22)

### 🚀 Features

- **ph-cli:** setup improvements ([0d52ebea](https://github.com/powerhouse-inc/powerhouse/commit/0d52ebea))
- **ph-cli:** update connect ver ([#901](https://github.com/powerhouse-inc/powerhouse/pull/901))
- **ph-cmd:** add scalars as dep ([#897](https://github.com/powerhouse-inc/powerhouse/pull/897))
- **ph-cli:** added pm2 process manager ([7866ce9d](https://github.com/powerhouse-inc/powerhouse/commit/7866ce9d))
- **ph-cli:** updated connect ver ([#886](https://github.com/powerhouse-inc/powerhouse/pull/886))

### ❤️ Thank You

- acaldas @acaldas
- Frank
- Guillermo Puente Sandoval

## 1.18.0 (2025-01-21)

### 🚀 Features

- update ph-cli connect ver ([#884](https://github.com/powerhouse-inc/powerhouse/pull/884))
- **ph-cli:** added configFile support ([#883](https://github.com/powerhouse-inc/powerhouse/pull/883))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 1.17.0 (2025-01-21)

### 🚀 Features

- split ph-cmd ([#876](https://github.com/powerhouse-inc/powerhouse/pull/876))
- **ph-cli:** added connect command ([dd20da14](https://github.com/powerhouse-inc/powerhouse/commit/dd20da14))
- **design-system:** merge dspot into main ([bef482f9](https://github.com/powerhouse-inc/powerhouse/commit/bef482f9))
- **react-reactor:** updated build config ([#759](https://github.com/powerhouse-inc/powerhouse/pull/759))

### 🩹 Fixes

- **codegen:** readded config dependency ([289bdaf4](https://github.com/powerhouse-inc/powerhouse/commit/289bdaf4))
- **codegen:** fixed create-lib build ([d5523d1e](https://github.com/powerhouse-inc/powerhouse/commit/d5523d1e))
- **codegen:** added prettier dependency ([b104d473](https://github.com/powerhouse-inc/powerhouse/commit/b104d473))

### ❤️ Thank You

- acaldas @acaldas
- Guillermo Puente Sandoval @gpuente

## 1.16.0 (2025-01-06)

### 🚀 Features

- removed document-model editor v1 ([#745](https://github.com/powerhouse-inc/powerhouse/pull/745))
- **reactor-browser:** initial package setup ([ad637dcb](https://github.com/powerhouse-inc/powerhouse/commit/ad637dcb))

### ❤️ Thank You

- Guillermo Puente Sandoval

## 1.15.0 (2024-12-19)

### 🚀 Features

- **renown:** added initial renown sdk package ([2864fbc6](https://github.com/powerhouse-inc/powerhouse/commit/2864fbc6))
- **scalars:** added missing resolvers ([#578](https://github.com/powerhouse-inc/powerhouse/pull/578))

### 🩹 Fixes

- **reactor-api:** update graphql dependency ([ed063402](https://github.com/powerhouse-inc/powerhouse/commit/ed063402))

### ❤️ Thank You

- acaldas
- Frank
- Guillermo Puente Sandoval

## 1.14.0 (2024-12-16)

### 🚀 Features

- updated nx version ([c9690c35](https://github.com/powerhouse-inc/powerhouse/commit/c9690c35))
- **document-model:** export generateId method ([71d945b2](https://github.com/powerhouse-inc/powerhouse/commit/71d945b2))

### 🩹 Fixes

- **switchboard:** subgraph manager and db instantiation ([874bdc4b](https://github.com/powerhouse-inc/powerhouse/commit/874bdc4b))

### ❤️ Thank You

- acaldas
- Frank

## 1.13.0 (2024-12-11)

### 🚀 Features

- **reactor-api:** Added support for processors ([#655](https://github.com/powerhouse-inc/powerhouse/pull/655))
- **design-system:** release dspot-scalars components ([881b8995](https://github.com/powerhouse-inc/powerhouse/commit/881b8995))

### 🩹 Fixes

- **monorepo:** remove nx cloud id ([45da8784](https://github.com/powerhouse-inc/powerhouse/commit/45da8784))
- **config:** added build ([aaeb785f](https://github.com/powerhouse-inc/powerhouse/commit/aaeb785f))

### ❤️ Thank You

- acaldas
- Guillermo Puente
- Guillermo Puente Sandoval
- ryanwolhuter

## 1.12.0 (2024-12-09)

### 🚀 Features

- **monorepo:** simplify check action ([a22745f4](https://github.com/powerhouse-inc/powerhouse/commit/a22745f4))
- **monorepo:** simplify parallel task execution ([0ed8df13](https://github.com/powerhouse-inc/powerhouse/commit/0ed8df13))
- **monorepo:** handle merge conflicts ([bfa6f0a0](https://github.com/powerhouse-inc/powerhouse/commit/bfa6f0a0))
- **monorepo:** handle project references ([3b6c046f](https://github.com/powerhouse-inc/powerhouse/commit/3b6c046f))
- **document-model-libs:** move tailwind config to workspace root ([74b9869a](https://github.com/powerhouse-inc/powerhouse/commit/74b9869a))
- **document-model-libs:** remove wrong peer deps ([5fd7ef67](https://github.com/powerhouse-inc/powerhouse/commit/5fd7ef67))
- use unified deps ([38c759a9](https://github.com/powerhouse-inc/powerhouse/commit/38c759a9))
- **monorepo:** fix export declarations ([58908779](https://github.com/powerhouse-inc/powerhouse/commit/58908779))

### ❤️ Thank You

- ryanwolhuter

## 1.11.0 (2024-12-05)

### 🚀 Features

- merge dspot-scalars into main ([5ca898fc](https://github.com/powerhouse-inc/powerhouse/commit/5ca898fc))

### 🩹 Fixes

- **switchboard-gui:** restore prev vite version ([#614](https://github.com/powerhouse-inc/powerhouse/pull/614))

### ❤️ Thank You

- Guillermo Puente Sandoval @gpuente

## 1.10.0 (2024-12-03)

### 🚀 Features

- **design-system:** bump storybook deps ([f21d9539](https://github.com/powerhouse-inc/powerhouse/commit/f21d9539))
- **monorepo:** remove eslint args ([4677e343](https://github.com/powerhouse-inc/powerhouse/commit/4677e343))
- **monorepo:** remove . in eslint invocation ([935f18ea](https://github.com/powerhouse-inc/powerhouse/commit/935f18ea))
- **monorepo:** readd vite for reactor local ([24a9e56b](https://github.com/powerhouse-inc/powerhouse/commit/24a9e56b))
- **monorepo:** add linting for switchboard gui ([dc56c561](https://github.com/powerhouse-inc/powerhouse/commit/dc56c561))
- **monorepo:** make scalar package linting match rest of monorepo ([af80a4a1](https://github.com/powerhouse-inc/powerhouse/commit/af80a4a1))
- **monorepo:** gitignore tsbuildinfo files ([d676a703](https://github.com/powerhouse-inc/powerhouse/commit/d676a703))
- **monorepo:** unify typescript and linting ([24b9a205](https://github.com/powerhouse-inc/powerhouse/commit/24b9a205))
- **monorepo:** do not skip nx cache ([dfadd970](https://github.com/powerhouse-inc/powerhouse/commit/dfadd970))
- **monorepo:** uncomment test ([dbd42350](https://github.com/powerhouse-inc/powerhouse/commit/dbd42350))
- **monorepo:** readd special check pr for document drive ([f1b9f7fe](https://github.com/powerhouse-inc/powerhouse/commit/f1b9f7fe))
- **monorepo:** use explicit paths ([ce5deb4c](https://github.com/powerhouse-inc/powerhouse/commit/ce5deb4c))
- **monorepo:** remove set dir as safe ([e8033645](https://github.com/powerhouse-inc/powerhouse/commit/e8033645))
- **monorepo:** handle document drive separately ([a94d4c26](https://github.com/powerhouse-inc/powerhouse/commit/a94d4c26))
- **monorepo:** add debug info ([ee1b7cab](https://github.com/powerhouse-inc/powerhouse/commit/ee1b7cab))
- **monorepo:** add read permissions ([ee6397d2](https://github.com/powerhouse-inc/powerhouse/commit/ee6397d2))
- **monorepo:** use set shas lib ([769e74a6](https://github.com/powerhouse-inc/powerhouse/commit/769e74a6))
- **monorepo:** add base ([22a5fffd](https://github.com/powerhouse-inc/powerhouse/commit/22a5fffd))
- **monorepo:** simplify commands ([75000bb4](https://github.com/powerhouse-inc/powerhouse/commit/75000bb4))
- **monorepo:** fix yaml syntax error ([5c82fcec](https://github.com/powerhouse-inc/powerhouse/commit/5c82fcec))
- **monorepo:** use workflow dispatch ([d1b4bde9](https://github.com/powerhouse-inc/powerhouse/commit/d1b4bde9))
- **monorepo:** still run on pushes ([86998628](https://github.com/powerhouse-inc/powerhouse/commit/86998628))
- **monorepo:** add if statements to prevent redundant runs ([193c5df5](https://github.com/powerhouse-inc/powerhouse/commit/193c5df5))
- **monorepo:** prevent duplicate runs ([1ce210b9](https://github.com/powerhouse-inc/powerhouse/commit/1ce210b9))
- **monorepo:** remove package manager config ([f177433b](https://github.com/powerhouse-inc/powerhouse/commit/f177433b))
- **monorepo:** install pnpm before doing node cache ([ab1cc5a6](https://github.com/powerhouse-inc/powerhouse/commit/ab1cc5a6))
- **monorepo:** simplify pr checks ([40d0cb59](https://github.com/powerhouse-inc/powerhouse/commit/40d0cb59))
- **monorepo:** add dry run version of release package action for testing ([323807f8](https://github.com/powerhouse-inc/powerhouse/commit/323807f8))
- **monorepo:** update release package manual ([405b6877](https://github.com/powerhouse-inc/powerhouse/commit/405b6877))
- **monorepo:** use workspace protocol in package deps ([2584e9dd](https://github.com/powerhouse-inc/powerhouse/commit/2584e9dd))
- **monorepo:** add preserve local dependency protocols to nx config ([b1902311](https://github.com/powerhouse-inc/powerhouse/commit/b1902311))
- **powerhouse:** regenerate lockfile ([#588](https://github.com/powerhouse-inc/powerhouse/pull/588))
- **reactor-local:** added automatic loading and activation of proces… ([#574](https://github.com/powerhouse-inc/powerhouse/pull/574))
- **document-model-libs:** regenerate lockfile ([04f0b0e6](https://github.com/powerhouse-inc/powerhouse/commit/04f0b0e6))
- **monorepo:** fix eslint config for react files ([019fa584](https://github.com/powerhouse-inc/powerhouse/commit/019fa584))
- **monorepo:** regenerate lockfile ([869134c5](https://github.com/powerhouse-inc/powerhouse/commit/869134c5))
- **codegen:** generate actions exceptions ([#499](https://github.com/powerhouse-inc/powerhouse/pull/499))
- **document-model-libs:** remove unused deps ([f102bd86](https://github.com/powerhouse-inc/powerhouse/commit/f102bd86))
- **document-model-libs:** move error handling to linter ([4eed29d6](https://github.com/powerhouse-inc/powerhouse/commit/4eed29d6))
- **document-model-libs:** leverage codemirror linting ([a5dca60a](https://github.com/powerhouse-inc/powerhouse/commit/a5dca60a))
- **document-model-libs:** update name in type ([3fa1bd41](https://github.com/powerhouse-inc/powerhouse/commit/3fa1bd41))
- **design-system:** extract entry time label to component ([032be787](https://github.com/powerhouse-inc/powerhouse/commit/032be787))
- **design-system:** use intl format for datetime inputs ([d51f8099](https://github.com/powerhouse-inc/powerhouse/commit/d51f8099))
- **reactor-api, reactor-local:** support local document models on local reactor ([a9a2d27f](https://github.com/powerhouse-inc/powerhouse/commit/a9a2d27f))

### ❤️ Thank You

- acaldas
- frankp.eth @froid1911
- Guillermo Puente Sandoval
- Ryan Wolhuter
- ryanwolhuter

## 1.9.0 (2024-11-11)

### 🚀 Features

- **ph-cli,reactor-local:** integrate local reactor into ph-cli ([92f2f530](https://github.com/powerhouse-inc/powerhouse/commit/92f2f530))
- **codegen:** regenerate lockfile ([31c2d0c5](https://github.com/powerhouse-inc/powerhouse/commit/31c2d0c5))
- **ph-cli:** update cli to format by default ([7418e777](https://github.com/powerhouse-inc/powerhouse/commit/7418e777))
- **codegen:** remove format generated from action ([5d7e1c48](https://github.com/powerhouse-inc/powerhouse/commit/5d7e1c48))
- **codegen:** use prettier api to format typescript from gql ([8896d86e](https://github.com/powerhouse-inc/powerhouse/commit/8896d86e))

### 🩹 Fixes

- **design-system:** fix scalars import ([#506](https://github.com/powerhouse-inc/powerhouse/pull/506))

### ❤️  Thank You

- acaldas
- Guillermo Puente Sandoval
- ryanwolhuter

## 1.8.0 (2024-11-11)

### 🚀 Features

- **scalars, design-system:** added EthereumAddress and AmountTokens scalars ([e5124e19](https://github.com/powerhouse-inc/powerhouse/commit/e5124e19))

### ❤️  Thank You

- Guillermo Puente Sandoval

## 1.7.0 (2024-11-06)

### 🚀 Features

- **document-model-libs:** regenerate lockfile ([0effee2e](https://github.com/powerhouse-inc/powerhouse/commit/0effee2e))
- qa updates 4 ([50ac4eb5](https://github.com/powerhouse-inc/powerhouse/commit/50ac4eb5))
- **document-model-libs:** add more inputs ([37db4561](https://github.com/powerhouse-inc/powerhouse/commit/37db4561))

### ❤️  Thank You

- ryanwolhuter @ryanwolhuter

## 1.6.0 (2024-11-05)

### 🚀 Features

- **document-model-libs:** regenerate lockfile ([cf76e91d](https://github.com/powerhouse-inc/powerhouse/commit/cf76e91d))
- **document-model-libs:** address initial QA feedback ([7513155e](https://github.com/powerhouse-inc/powerhouse/commit/7513155e))

### ❤️  Thank You

- ryanwolhuter @ryanwolhuter

## 1.5.1 (2024-11-01)

### 🚀 Features

- **codegen:** changed bundle to esm ([24b33b50](https://github.com/powerhouse-inc/powerhouse/commit/24b33b50))
- **switchboard-gui:** updated gitignore ([1fd60a3b](https://github.com/powerhouse-inc/powerhouse/commit/1fd60a3b))
- **reactor-api:** init project ([#388](https://github.com/powerhouse-inc/powerhouse/pull/388))
- **document-model-libs:** bump deps ([68a98ee6](https://github.com/powerhouse-inc/powerhouse/commit/68a98ee6))
- **document-model-libs:** re-add prevent default and handle operation initial schema ([ae010779](https://github.com/powerhouse-inc/powerhouse/commit/ae010779))
- **document-model-libs:** add json editors with sync ([76acd807](https://github.com/powerhouse-inc/powerhouse/commit/76acd807))
- **document-model-libs:** include typedefs in initial hidden schema state ([88e184fd](https://github.com/powerhouse-inc/powerhouse/commit/88e184fd))

### 🩹 Fixes

- **ph-cli:** bundle cli as esm package and added missing dependencies ([a5a665ef](https://github.com/powerhouse-inc/powerhouse/commit/a5a665ef))
- **codegen:** fixed bad import ([eefb7b2f](https://github.com/powerhouse-inc/powerhouse/commit/eefb7b2f))
- bad package reference was breaking build -- also a readme update ([4121e51b](https://github.com/powerhouse-inc/powerhouse/commit/4121e51b))
- **switchboard:** startup ([#469](https://github.com/powerhouse-inc/powerhouse/pull/469))

### ❤️  Thank You

- acaldas @acaldas
- Benjamin Jordan
- frankp.eth @froid1911
- Guillermo Puente @gpuente
- ryanwolhuter @ryanwolhuter

## 1.5.0 (2024-10-28)

### 🚀 Features

- **scalars:** added default scalars ([#444](https://github.com/powerhouse-inc/powerhouse/pull/444))
- **document-model-libs:** add initial state editor ([#443](https://github.com/powerhouse-inc/powerhouse/pull/443))
- **codegen:** integrate scalars into code generation ([#436](https://github.com/powerhouse-inc/powerhouse/pull/436))

### ❤️  Thank You

- Guillermo Puente Sandoval @gpuente
- Ryan Wolhuter @ryanwolhuter

## 1.4.0 (2024-10-25)

### 🚀 Features

- **document-model-libs:** added scalars as a peerDep ([#435](https://github.com/powerhouse-inc/powerhouse/pull/435))
- **scalars:** added exports for codegen ([#434](https://github.com/powerhouse-inc/powerhouse/pull/434))

### ❤️  Thank You

- Guillermo Puente Sandoval @gpuente

## 1.3.0 (2024-10-25)

### 🚀 Features

- **scalars:** added amount percentage scalar ([#433](https://github.com/powerhouse-inc/powerhouse/pull/433))
- **document-model-libs:** simplify editor ([1725f876](https://github.com/powerhouse-inc/powerhouse/commit/1725f876))

### ❤️  Thank You

- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 1.2.0 (2024-10-22)

### 🚀 Features

- **document-model-libs:** fix lint error ([37d4061d](https://github.com/powerhouse-inc/powerhouse/commit/37d4061d))
- **document-model-libs:** port code from private repo ([11ef336a](https://github.com/powerhouse-inc/powerhouse/commit/11ef336a))
- **ph-cli:** Support for dev and generate command ([#406](https://github.com/powerhouse-inc/powerhouse/pull/406))
- **ph-cli:** added base ph-cli package setup ([#404](https://github.com/powerhouse-inc/powerhouse/pull/404))
- **switchboard-gui:** init ([#405](https://github.com/powerhouse-inc/powerhouse/pull/405))
- **codegen:** bundle with tsup ([3cccbdf9](https://github.com/powerhouse-inc/powerhouse/commit/3cccbdf9))
- **document-model-libs:** update codegen dependency ([f5330139](https://github.com/powerhouse-inc/powerhouse/commit/f5330139))

### 🩹 Fixes

- **document-model-libs:** added type annotation for createDocumentStory ([6c5441f3](https://github.com/powerhouse-inc/powerhouse/commit/6c5441f3))

### ❤️  Thank You

- acaldas @acaldas
- frankp.eth @froid1911
- Guillermo Puente Sandoval @gpuente
- ryanwolhuter @ryanwolhuter

## 1.1.0 (2024-10-14)

### 🚀 Features

- added codegen build step ([66523278](https://github.com/powerhouse-inc/powerhouse/commit/66523278))

### ❤️  Thank You

- acaldas @acaldas

# 1.0.0 (2024-10-11)

### 🚀 Features

- **scalars:** setup scalars project ([#370](https://github.com/powerhouse-inc/powerhouse/pull/370))

### ❤️  Thank You

- Guillermo Puente Sandoval @gpuente