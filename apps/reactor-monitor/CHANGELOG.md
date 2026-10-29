## 6.2.3-dev.82 (2026-10-29)

### 🚀 Features

- **reactor-router:** a backend's document types may read as open ([df1583eab1](https://github.com/powerhouse-inc/powerhouse/commit/df1583eab1))
- **apps-reactor-monitor:** name a drive added to a switchboard, saved in this host ([804c4f2115](https://github.com/powerhouse-inc/powerhouse/commit/804c4f2115))
- **apps-reactor-monitor:** "Where this app keeps its drives" card for Connect ([48c8d4b6ac](https://github.com/powerhouse-inc/powerhouse/commit/48c8d4b6ac))
- **apps-reactor-monitor:** link a Connect to switchboard drives in the host rules ([9b7a19066f](https://github.com/powerhouse-inc/powerhouse/commit/9b7a19066f))
- **apps-reactor-monitor:** policy for drive links, drive lists and placement ([ffa8b1ecb0](https://github.com/powerhouse-inc/powerhouse/commit/ffa8b1ecb0))
- **apps-reactor-monitor:** import refuses a placement key that names no drive ([01652396c1](https://github.com/powerhouse-inc/powerhouse/commit/01652396c1))
- **reactor-browser:** createSwitchboardBackend, a Switchboard as a router backend ([f2b6b608af](https://github.com/powerhouse-inc/powerhouse/commit/f2b6b608af))

### 🩹 Fixes

- **apps-reactor-monitor:** refuse a drive name a switchboard plugin already uses ([ff831b7d25](https://github.com/powerhouse-inc/powerhouse/commit/ff831b7d25))
- **reactor-browser:** a switchboard that loads models on demand gets no create pre-check ([cd57ceec10](https://github.com/powerhouse-inc/powerhouse/commit/cd57ceec10))
- **apps-reactor-monitor:** copy an env link into a wrapper as it is ([935da0a9e2](https://github.com/powerhouse-inc/powerhouse/commit/935da0a9e2))
- **apps-reactor-monitor:** name the folder for a placement key a wrapper's plugins hide ([43cab375b7](https://github.com/powerhouse-inc/powerhouse/commit/43cab375b7))
- **apps-reactor-monitor:** link a second drive for a Connect that declares no drives ([44edf4ab1e](https://github.com/powerhouse-inc/powerhouse/commit/44edf4ab1e))
- **apps-reactor-monitor:** show a switchboard's drive address in Use it ([ddb1199c35](https://github.com/powerhouse-inc/powerhouse/commit/ddb1199c35))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.81 (2026-10-29)

### 🚀 Features

- **workflow:** multi-provider AI piece ([59cea966ff](https://github.com/powerhouse-inc/powerhouse/commit/59cea966ff))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.80 (2026-10-29)

### 🚀 Features

- **vetra-studio:** publish @powerhousedao/vetra-studio ([8bf7e24674](https://github.com/powerhouse-inc/powerhouse/commit/8bf7e24674))
- **vetra-studio:** studio sign-in, an agent logs the studio Connect in with an access token ([da56737a56](https://github.com/powerhouse-inc/powerhouse/commit/da56737a56))
- **reactor-monitor:** give a copy's Connect a fixed port of its own ([2302f04f24](https://github.com/powerhouse-inc/powerhouse/commit/2302f04f24))
- **reactor-monitor:** link to the running Connect from a builder copy ([2b418ff13d](https://github.com/powerhouse-inc/powerhouse/commit/2b418ff13d))
- **reactor-monitor:** report a started Connect's app URL ([ceb1bb14c7](https://github.com/powerhouse-inc/powerhouse/commit/ceb1bb14c7))
- **apps-reactor-monitor:** link switchboards by a drive address ([2059829ebc](https://github.com/powerhouse-inc/powerhouse/commit/2059829ebc))
- **reactor-monitor:** start, stop and save builder drafts from Use it ([0a228efa74](https://github.com/powerhouse-inc/powerhouse/commit/0a228efa74))
- **reactor-monitor:** copy the project into a draft and list it per switchboard ([5ac8af6cff](https://github.com/powerhouse-inc/powerhouse/commit/5ac8af6cff))
- **reactor-monitor:** open the host builder from the views ([65d66d91d4](https://github.com/powerhouse-inc/powerhouse/commit/65d66d91d4))
- **reactor-monitor:** host builder stepper and its steps ([02665ec029](https://github.com/powerhouse-inc/powerhouse/commit/02665ec029))
- **reactor-monitor:** one managed descriptor per compound member ([63bd4580cb](https://github.com/powerhouse-inc/powerhouse/commit/63bd4580cb))
- **reactor-monitor:** client methods for capabilities, export and drafts ([fdb84fa3f2](https://github.com/powerhouse-inc/powerhouse/commit/fdb84fa3f2))
- **reactor-monitor:** serve capabilities, export and draft routes ([3633418a4a](https://github.com/powerhouse-inc/powerhouse/commit/3633418a4a))
- **reactor-monitor:** start a draft host from a throwaway copy of its project ([4abb04b4b2](https://github.com/powerhouse-inc/powerhouse/commit/4abb04b4b2))
- **reactor-monitor:** materialize a draft host into a throwaway project ([adf31afe72](https://github.com/powerhouse-inc/powerhouse/commit/adf31afe72))
- **reactor-monitor:** builder draft, persistence and engine hook ([1b2f65fdc9](https://github.com/powerhouse-inc/powerhouse/commit/1b2f65fdc9))
- **reactor-monitor:** host-files writes the host.js files an export stands for ([8ea300e746](https://github.com/powerhouse-inc/powerhouse/commit/8ea300e746))
- **reactor-monitor:** carry host-rules issues on the controller wire ([df9b116a52](https://github.com/powerhouse-inc/powerhouse/commit/df9b116a52))
- **reactor-monitor:** let setters change a host's display name ([4743cf5b12](https://github.com/powerhouse-inc/powerhouse/commit/4743cf5b12))
- **reactor-monitor:** add the host builder's controller contract ([8a5d8a752d](https://github.com/powerhouse-inc/powerhouse/commit/8a5d8a752d))
- **reactor-monitor:** add setter_denied and base_changed controller errors ([3a8797a980](https://github.com/powerhouse-inc/powerhouse/commit/3a8797a980))
- **document-model,codegen,reactor-api,ph-cli:** projects define their own GraphQL scalars ([968fa45a44](https://github.com/powerhouse-inc/powerhouse/commit/968fa45a44))

### 🩹 Fixes

- **reactor-monitor:** stopping a starting copy is not a failed start ([ab5dd17e33](https://github.com/powerhouse-inc/powerhouse/commit/ab5dd17e33))
- **reactor-monitor:** follow a builder copy by its status, across reloads and set switches ([60ae8debc0](https://github.com/powerhouse-inc/powerhouse/commit/60ae8debc0))
- **reactor-monitor:** browser reactors a copy brought go when the copy does ([1f4e8ed72a](https://github.com/powerhouse-inc/powerhouse/commit/1f4e8ed72a))
- **reactor-monitor:** keep why an import row has no remote URL ([c5fab52dd2](https://github.com/powerhouse-inc/powerhouse/commit/c5fab52dd2))
- **reactor-monitor:** keep PH_PACKAGES out of a draft's env ([2daedfa771](https://github.com/powerhouse-inc/powerhouse/commit/2daedfa771))
- **reactor-monitor:** load a draft's own project package from its source root ([aac6201584](https://github.com/powerhouse-inc/powerhouse/commit/aac6201584))
- **reactor-monitor:** confirm a rebase only against the current draft ([edc70d920a](https://github.com/powerhouse-inc/powerhouse/commit/edc70d920a))
- **reactor-monitor:** preview a rebase before saving it ([7de6790d4d](https://github.com/powerhouse-inc/powerhouse/commit/7de6790d4d))
- **reactor-monitor:** recover a draft whose project host changed ([e9364bae75](https://github.com/powerhouse-inc/powerhouse/commit/e9364bae75))
- **reactor-monitor:** no sideways scroll in the sidebar; attach the download link ([98287fc0d8](https://github.com/powerhouse-inc/powerhouse/commit/98287fc0d8))
- **reactor-monitor:** keep the builder in the viewport on every step ([b294b89a08](https://github.com/powerhouse-inc/powerhouse/commit/b294b89a08))
- **reactor-monitor:** allow only a safe file name in a name setter ([66cd1a4970](https://github.com/powerhouse-inc/powerhouse/commit/66cd1a4970))
- **ci:** install academy lint dependencies and restore codegen test cwd ([c99d5e4fe4](https://github.com/powerhouse-inc/powerhouse/commit/c99d5e4fe4))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5
- Wouter Kampmann
- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.79 (2026-10-28)

### 🚀 Features

- **reactor-monitor-app:** offer workers per switchboard and add switchboards with their own folders ([bfa70ab9c5](https://github.com/powerhouse-inc/powerhouse/commit/bfa70ab9c5))
- **reactor-monitor-app:** lift one switchboard per host; each needs its own store, search data folder and port ([8d1f6ea16b](https://github.com/powerhouse-inc/powerhouse/commit/8d1f6ea16b))
- **reactor-monitor-app:** let the builder write a switchboard's own settings and its search data folder ([32a7e9280a](https://github.com/powerhouse-inc/powerhouse/commit/32a7e9280a))
- **reactor-monitor-app:** read each member's runner config like its reactor block ([289eb3f679](https://github.com/powerhouse-inc/powerhouse/commit/289eb3f679))
- ⚠️  **switchboard:** startSwitchboard(config, deps) reads only its config ([29d223ebff](https://github.com/powerhouse-inc/powerhouse/commit/29d223ebff))
- **ph-cli,codegen:** ph mcp, a stdio launcher for reactor-mcp that starts vetra on the first tool call, and generated mcp configs that run it ([c64883e693](https://github.com/powerhouse-inc/powerhouse/commit/c64883e693))
- **reactor-monitor-app:** hot reload and add options, with ids unique per member ([fa0a0903f8](https://github.com/powerhouse-inc/powerhouse/commit/fa0a0903f8))
- **codegen,vetra,ph-cli,connect:** project agent guidance as a managed AGENTS.md block and skills, and eval fixes ([#3303](https://github.com/powerhouse-inc/powerhouse/pull/3303))
- **reactor-monitor-app:** judge a host builder's options with reasons ([33a2121428](https://github.com/powerhouse-inc/powerhouse/commit/33a2121428))
- **reactor-monitor-app:** validate a draft host per member and backend ([ba2012b616](https://github.com/powerhouse-inc/powerhouse/commit/ba2012b616))
- **reactor-monitor-app:** matrix owner and error codes on the controller wire ([c3b4305e33](https://github.com/powerhouse-inc/powerhouse/commit/c3b4305e33))

### 🩹 Fixes

- **reactor-monitor-app:** resolve output links as the compound does, and pair access control by them ([58d8dfc005](https://github.com/powerhouse-inc/powerhouse/commit/58d8dfc005))
- **reactor-monitor-app:** read a missing host env key as unset when selecting options ([f797a8d5a9](https://github.com/powerhouse-inc/powerhouse/commit/f797a8d5a9))
- **reactor-monitor-app:** one environment per host, and one switchboard for now ([f0f59bd646](https://github.com/powerhouse-inc/powerhouse/commit/f0f59bd646))
- **reactor-monitor-app:** a search data folder is remove-only and reported as storage ([28a3cba311](https://github.com/powerhouse-inc/powerhouse/commit/28a3cba311))
- **reactor-monitor-app:** one switchboard per host, process-wide env, and hot reload off that overrides the folder ([ce03482a3e](https://github.com/powerhouse-inc/powerhouse/commit/ce03482a3e))
- **reactor-monitor-app:** keep builder storage folders under .ph or user data ([0bf33d297c](https://github.com/powerhouse-inc/powerhouse/commit/0bf33d297c))
- **reactor-monitor-app:** check placement, shared stores, nested compounds and env as the switchboard reads it ([6dec50d38f](https://github.com/powerhouse-inc/powerhouse/commit/6dec50d38f))
- **reactor-monitor-app:** keep builder folders inside the project and allow removing a member folder ([e114dc3821](https://github.com/powerhouse-inc/powerhouse/commit/e114dc3821))
- **codegen,shared,vetra,ph-cli,document-model,reactor,reactor-api:** scaffolds get their dependencies, migration-file works, new documents count 0 per scope, subgraphs filter plain ids, and vetra sets the preview drive's app ([6fe1ead94c](https://github.com/powerhouse-inc/powerhouse/commit/6fe1ead94c))

### ⚠️  Breaking Changes

- **switchboard:** startSwitchboard(config, deps) reads only its config  ([29d223ebff](https://github.com/powerhouse-inc/powerhouse/commit/29d223ebff))
  startSwitchboard(options) is now startSwitchboard(config, deps).
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.78 (2026-10-27)

### 🚀 Features

- **reactor-monitor-app:** mount the switchboards panel and gate managed remotes ([b1f656af9c](https://github.com/powerhouse-inc/powerhouse/commit/b1f656af9c))
- **reactor-monitor-app:** switchboards panel over the controller ([ed242d12b5](https://github.com/powerhouse-inc/powerhouse/commit/ed242d12b5))
- **reactor-monitor-app:** controller client and managed remote descriptors ([ae148ecf90](https://github.com/powerhouse-inc/powerhouse/commit/ae148ecf90))
- **portle:** scaffold @powerhousedao/portle, the switchboard plugin that gates publication through Portle ([68ab561f7d](https://github.com/powerhouse-inc/powerhouse/commit/68ab561f7d))
- **reactor-monitor-app:** host the controller in vite dev and a serve script ([8eb1ef41a5](https://github.com/powerhouse-inc/powerhouse/commit/8eb1ef41a5))
- **reactor-monitor-app:** wire host import into App ([40eb392822](https://github.com/powerhouse-inc/powerhouse/commit/40eb392822))
- **reactor-monitor-app:** controller HTTP routes behind host, origin and token guards ([67b653a0ba](https://github.com/powerhouse-inc/powerhouse/commit/67b653a0ba))
- **reactor-monitor-app:** host import panel and drop zone ([a805ea0b3b](https://github.com/powerhouse-inc/powerhouse/commit/a805ea0b3b))
- **reactor-monitor-app:** node controller over spawnHost and checkHost ([7066d843cb](https://github.com/powerhouse-inc/powerhouse/commit/7066d843cb))
- **reactor-monitor-app:** controller wire schemas ([a9c71bf980](https://github.com/powerhouse-inc/powerhouse/commit/a9c71bf980))
- **reactor-monitor-app:** importSet with provenance ([ccbfff454b](https://github.com/powerhouse-inc/powerhouse/commit/ccbfff454b))
- **reactor-monitor-app:** parse and plan exported hosts ([8438ab491a](https://github.com/powerhouse-inc/powerhouse/commit/8438ab491a))
- **reactor-api,switchboard:** vacuum full policy knob, no forced rewrite under load by default ([d6dcbf5cd0](https://github.com/powerhouse-inc/powerhouse/commit/d6dcbf5cd0))

### 🩹 Fixes

- **reactor-monitor-app:** back off the panel poll and forget vanished starts ([c398d4daa7](https://github.com/powerhouse-inc/powerhouse/commit/c398d4daa7))
- **reactor-monitor-app:** re-probe managed remotes when their set returns ([70e1d0b111](https://github.com/powerhouse-inc/powerhouse/commit/70e1d0b111))
- **reactor-monitor-app:** require an address for the admin preset's ADMINS ([aaceb8b9d4](https://github.com/powerhouse-inc/powerhouse/commit/aaceb8b9d4))
- **reactor-monitor-app:** forget a probe whose descriptor left the active set ([c91edade73](https://github.com/powerhouse-inc/powerhouse/commit/c91edade73))
- **reactor-monitor-app:** pick a project with hosts and keep the log tail in view ([e698ca2112](https://github.com/powerhouse-inc/powerhouse/commit/e698ca2112))
- **reactor-monitor-app:** test the dev plugin's gates; operator env for both hosts ([2c4b3436c1](https://github.com/powerhouse-inc/powerhouse/commit/2c4b3436c1))
- **reactor-monitor-app:** allowlist browser env and harden the controller ([ac2c23e6a4](https://github.com/powerhouse-inc/powerhouse/commit/ac2c23e6a4))
- **reactor-monitor-app:** catch unreadable exports and require http(s) URLs ([eb37b2aba1](https://github.com/powerhouse-inc/powerhouse/commit/eb37b2aba1))
- **reactor-monitor-app:** plan nested and malformed exports correctly ([f71159430b](https://github.com/powerhouse-inc/powerhouse/commit/f71159430b))
- **reactor-monitor-app:** stop reading reactor.auth, which main removed ([982743f145](https://github.com/powerhouse-inc/powerhouse/commit/982743f145))
- **reactor-monitor-app:** track page drags by enter/leave depth ([ee1aa95318](https://github.com/powerhouse-inc/powerhouse/commit/ee1aa95318))
- **reactor-monitor-app:** type the origin cases and drop an always-true host test ([1493e70608](https://github.com/powerhouse-inc/powerhouse/commit/1493e70608))
- **registry:** a failed tarball write no longer records its attachment ([5d3ae94bd8](https://github.com/powerhouse-inc/powerhouse/commit/5d3ae94bd8))
- **reactor-api:** the one-time VACUUM FULL is off by default; quiet and forced are opt-ins ([fd7c19e313](https://github.com/powerhouse-inc/powerhouse/commit/fd7c19e313))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.77 (2026-10-26)

### 🚀 Features

- **reactor-monitor:** routing panel reads and writes through the halves ([742c1500de](https://github.com/powerhouse-inc/powerhouse/commit/742c1500de))

### ❤️ Thank You

- Claude Fable 5.1
- Wouter Kampmann

## 6.2.3-dev.76 (2026-10-25)

### 🚀 Features

- **reactor-monitor:** read and set the catch-up priority ([864588a7f5](https://github.com/powerhouse-inc/powerhouse/commit/864588a7f5))
- **reactor,reactor-monitor-app:** a factory's bar averages all its processors, projects first, rows collapse ([67017e5f73](https://github.com/powerhouse-inc/powerhouse/commit/67017e5f73))
- **reactor-monitor-app:** select processors to rerun, and show progress in the tables ([464a6b86d6](https://github.com/powerhouse-inc/powerhouse/commit/464a6b86d6))
- **reactor,ph-cli,reactor-monitor-app:** one short name per processor factory ([bc865c2a85](https://github.com/powerhouse-inc/powerhouse/commit/bc865c2a85))
- **reactor-monitor-app:** show replay progress bars for processors and read models ([429baaf1d3](https://github.com/powerhouse-inc/powerhouse/commit/429baaf1d3))

### 🩹 Fixes

- **reactor-monitor:** ignore a priority read begun before a setting landed ([ce749cdd84](https://github.com/powerhouse-inc/powerhouse/commit/ce749cdd84))
- **reactor-monitor-app:** progress cells span their column, and the rerun form reads cleanly ([76c6b31aa4](https://github.com/powerhouse-inc/powerhouse/commit/76c6b31aa4))

### ❤️ Thank You

- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.75 (2026-10-24)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** ph host check behind FEATURE_UNIFORM_RUNNERS_ENABLED ([3a41a17991](https://github.com/powerhouse-inc/powerhouse/commit/3a41a17991))
- **codegen:** ph migrate moves connect's theme overrides from style.css to the host stylesheet ([b113414352](https://github.com/powerhouse-inc/powerhouse/commit/b113414352))
- **reactor-monitor:** read and set the catch-up priority ([864588a7f5](https://github.com/powerhouse-inc/powerhouse/commit/864588a7f5))
- **reactor,reactor-monitor-app:** a factory's bar averages all its processors, projects first, rows collapse ([67017e5f73](https://github.com/powerhouse-inc/powerhouse/commit/67017e5f73))
- **reactor-monitor-app:** select processors to rerun, and show progress in the tables ([464a6b86d6](https://github.com/powerhouse-inc/powerhouse/commit/464a6b86d6))
- **reactor,ph-cli,reactor-monitor-app:** one short name per processor factory ([bc865c2a85](https://github.com/powerhouse-inc/powerhouse/commit/bc865c2a85))
- **reactor-monitor-app:** show replay progress bars for processors and read models ([429baaf1d3](https://github.com/powerhouse-inc/powerhouse/commit/429baaf1d3))
- **reactor-monitor-app:** keep a remote's bearer for the tab's session ([ebc3e715b3](https://github.com/powerhouse-inc/powerhouse/commit/ebc3e715b3))
- **reactor,reactor-api,reactor-monitor:** rerun a processor, cleared or from an ordinal ([279342d614](https://github.com/powerhouse-inc/powerhouse/commit/279342d614))
- **reactor-monitor-app:** paste an admin bearer into a remote's gate note ([e04afd8e23](https://github.com/powerhouse-inc/powerhouse/commit/e04afd8e23))

### 🩹 Fixes

- **reactor-monitor:** ignore a priority read begun before a setting landed ([ce749cdd84](https://github.com/powerhouse-inc/powerhouse/commit/ce749cdd84))
- **reactor-monitor-app:** progress cells span their column, and the rerun form reads cleanly ([76c6b31aa4](https://github.com/powerhouse-inc/powerhouse/commit/76c6b31aa4))
- **builder-tools:** the worker-safe vendor check parses imports, so import-like text in strings and comments no longer counts ([9d3e167f4b](https://github.com/powerhouse-inc/powerhouse/commit/9d3e167f4b))
- **reactor-browser,connect,reactor-monitor:** the worker reactor loads a registry package's module graph, and packages added or updated after boot ([5348ffa792](https://github.com/powerhouse-inc/powerhouse/commit/5348ffa792))
- **powerhouse-vetra-packages:** the document-model editor writes nothing on open unless the model is blank ([f5dc33dd0a](https://github.com/powerhouse-inc/powerhouse/commit/f5dc33dd0a))
- **reactor-monitor-app:** a remote restored from a saved set takes a pasted bearer ([1630dc21bf](https://github.com/powerhouse-inc/powerhouse/commit/1630dc21bf))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.74 (2026-10-24)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** ph host check behind FEATURE_UNIFORM_RUNNERS_ENABLED ([3a41a17991](https://github.com/powerhouse-inc/powerhouse/commit/3a41a17991))
- **codegen:** ph migrate moves connect's theme overrides from style.css to the host stylesheet ([b113414352](https://github.com/powerhouse-inc/powerhouse/commit/b113414352))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.73 (2026-10-23)

### 🚀 Features

- **reactor-monitor-app:** keep a remote's bearer for the tab's session ([ebc3e715b3](https://github.com/powerhouse-inc/powerhouse/commit/ebc3e715b3))
- **reactor,reactor-api,reactor-monitor:** rerun a processor, cleared or from an ordinal ([279342d614](https://github.com/powerhouse-inc/powerhouse/commit/279342d614))
- **reactor-monitor-app:** paste an admin bearer into a remote's gate note ([e04afd8e23](https://github.com/powerhouse-inc/powerhouse/commit/e04afd8e23))

### 🩹 Fixes

- **builder-tools:** the worker-safe vendor check parses imports, so import-like text in strings and comments no longer counts ([9d3e167f4b](https://github.com/powerhouse-inc/powerhouse/commit/9d3e167f4b))
- **reactor-browser,connect,reactor-monitor:** the worker reactor loads a registry package's module graph, and packages added or updated after boot ([5348ffa792](https://github.com/powerhouse-inc/powerhouse/commit/5348ffa792))
- **powerhouse-vetra-packages:** the document-model editor writes nothing on open unless the model is blank ([f5dc33dd0a](https://github.com/powerhouse-inc/powerhouse/commit/f5dc33dd0a))
- **reactor-monitor-app:** a remote restored from a saved set takes a pasted bearer ([1630dc21bf](https://github.com/powerhouse-inc/powerhouse/commit/1630dc21bf))

### ❤️ Thank You

- acaldas
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.72 (2026-10-23)

### 🚀 Features

- **shared,connect,codegen:** ph init and ph migrate give a project the router as a peer at connect's version, and the host stylesheet shows light and dark tokens ([0829546eaf](https://github.com/powerhouse-inc/powerhouse/commit/0829546eaf))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.71 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))
- **desktop:** vendor local package tarballs into the stack (PH_DESKTOP_LOCAL_PACKAGES) ([000bc39d10](https://github.com/powerhouse-inc/powerhouse/commit/000bc39d10))
- **codegen:** pure builders for generated outputs.js/.d.ts and the hosts typing files ([be3c35122f](https://github.com/powerhouse-inc/powerhouse/commit/be3c35122f))
- **connect,desktop:** layered backgrounds for the home screen and the loading page ([9ffe4915b4](https://github.com/powerhouse-inc/powerhouse/commit/9ffe4915b4))
- **host-core,ph-cli,switchboard,connect,codegen:** workflow plugins declare the drive and the link ([ab37f30600](https://github.com/powerhouse-inc/powerhouse/commit/ab37f30600))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Fable 5.1
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.70 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.69 (2026-10-21)

This was a version bump only for @powerhousedao/reactor-monitor-app to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-monitor-app to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-monitor-app to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/reactor-monitor-app to align it with other projects, there were no code changes.

## 6.2.3-dev.64 (2026-10-20)

### 🩹 Fixes

- **reactor-api:** complete a removed subgraph's supergraph SSE streams ([9eac161e3c](https://github.com/powerhouse-inc/powerhouse/commit/9eac161e3c))
- **reactor-api:** complete a replaced or removed subgraph's SSE streams ([2cacef8d1d](https://github.com/powerhouse-inc/powerhouse/commit/2cacef8d1d))
- **releases:** parse pnpm publish output when packed paths contain braces ([a30562aeca](https://github.com/powerhouse-inc/powerhouse/commit/a30562aeca))

### 🔥 Performance

- **ph-cli,docker:** serve precompressed wasm and data in connect preview and nginx ([85db6ff307](https://github.com/powerhouse-inc/powerhouse/commit/85db6ff307))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.63 (2026-10-18)

### 🚀 Features

- **connect,builder-tools:** prerendered app shell, self-hosted font and module warm-up ([cf9b61ef86](https://github.com/powerhouse-inc/powerhouse/commit/cf9b61ef86))

### 🩹 Fixes

- **ph-cli,docker,codegen:** serve connect under a base path ([fe07684e12](https://github.com/powerhouse-inc/powerhouse/commit/fe07684e12))

### 🔥 Performance

- **connect:** trim connect's boot imports and break its barrel cycles ([dde9430d74](https://github.com/powerhouse-inc/powerhouse/commit/dde9430d74))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.62 (2026-10-16)

### 🚀 Features

- **connect,builder-tools:** prerendered app shell, self-hosted font and module warm-up ([cf9b61ef86](https://github.com/powerhouse-inc/powerhouse/commit/cf9b61ef86))

### 🩹 Fixes

- **ph-cli,docker,codegen:** serve connect under a base path ([fe07684e12](https://github.com/powerhouse-inc/powerhouse/commit/fe07684e12))

### 🔥 Performance

- **connect:** trim connect's boot imports and break its barrel cycles ([dde9430d74](https://github.com/powerhouse-inc/powerhouse/commit/dde9430d74))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.61 (2026-10-16)

### 🚀 Features

- **desktop:** builder-owned desktop identity via a generated tauri shell ([8b87d55db7](https://github.com/powerhouse-inc/powerhouse/commit/8b87d55db7))

### ❤️ Thank You

- Claude Opus 4.8
- Wouter Kampmann

## 6.2.3-dev.60 (2026-10-15)

This was a version bump only for @powerhousedao/reactor-monitor-app to align it with other projects, there were no code changes.

## 6.2.3-dev.59 (2026-10-15)

### 🚀 Features

- **connect,vetra-studio:** browser plugin pipeline over the served composition (R3.2) + the studio plugins (R4 start) ([8fb91868da](https://github.com/powerhouse-inc/powerhouse/commit/8fb91868da))
- **switchboard:** plugin pipeline scaffold for the subsystem carve (R2.1) ([042cd5a93c](https://github.com/powerhouse-inc/powerhouse/commit/042cd5a93c))

### ❤️ Thank You

- Claude Fable 5
- Wouter Kampmann

## 6.2.3-dev.58 (2026-10-14)

### 🩹 Fixes

- **registry:** declare reactor-workflow — undeclared dep broke test shard 1 ([37660d7b04](https://github.com/powerhouse-inc/powerhouse/commit/37660d7b04))
- **release:** the desktop build filter belongs in scripts.build — the prior commit amended test:ci ([2cbbff231c](https://github.com/powerhouse-inc/powerhouse/commit/2cbbff231c))
- **release:** build @powerhousedao/desktop — dev.57 shipped an empty tarball; guard the filter list ([9103896840](https://github.com/powerhouse-inc/powerhouse/commit/9103896840))
- **clint:** powerhousedao packages are regular deps, not peers — npm ERESOLVE on scaffold install ([6de7d0d7c6](https://github.com/powerhouse-inc/powerhouse/commit/6de7d0d7c6))

### ❤️ Thank You

- Claude Fable 5
- Wouter Kampmann

## 6.2.3-dev.57 (2026-10-14)

### 🚀 Features

- **desktop:** @powerhousedao/desktop — the desktop runner productized (P6.1-P6.5) ([58ce9a0d4a](https://github.com/powerhouse-inc/powerhouse/commit/58ce9a0d4a))
- **clint,ph-cli:** one static-serve implementation — connect-server deleted (P5.7) ([c35b0341c6](https://github.com/powerhouse-inc/powerhouse/commit/c35b0341c6))
- **clint:** mastra-runner — remote reactor attach + OpenAI-compatible agent API (P5.5, P5.6) ([532cb2128f](https://github.com/powerhouse-inc/powerhouse/commit/532cb2128f))
- **clint:** port the ph-clint framework — core, integrations, TUI, testing + full suite (P5.2, P5.3) ([d1ace0688e](https://github.com/powerhouse-inc/powerhouse/commit/d1ace0688e))
- **clint:** scaffold @powerhousedao/clint — the ph-clint port lands here (P5.1) ([c7a3435588](https://github.com/powerhouse-inc/powerhouse/commit/c7a3435588))
- **host-core,ph-cli:** structural multi-reactor — backends drive the routing client (P4.1-P4.3) ([e7c71ca7ac](https://github.com/powerhouse-inc/powerhouse/commit/e7c71ca7ac))
- **host-core:** shared zod host schemas; bridges adopt strict reactor/profile (P2.1, P2.2) ([1bd9db67be](https://github.com/powerhouse-inc/powerhouse/commit/1bd9db67be))
- **vetra:** lint project subgraphs for types core or the package's models own ([6855c0ed91](https://github.com/powerhouse-inc/powerhouse/commit/6855c0ed91))
- **host-core:** generic run records and pid-probe (P1.3, P1.5, P1.6 foundation) ([9a6affd46e](https://github.com/powerhouse-inc/powerhouse/commit/9a6affd46e))
- **host-core:** move drive projection primitives; add projectDrivesIntoConnect (P1.4) ([6cd1d8ee6e](https://github.com/powerhouse-inc/powerhouse/commit/6cd1d8ee6e))
- **host-core:** scaffold @powerhousedao/host-core (P1.1) ([c7d9b415b5](https://github.com/powerhouse-inc/powerhouse/commit/c7d9b415b5))
- **reactor-monitor-app:** restart a worker reactor from the Overview tab ([1a66b39330](https://github.com/powerhouse-inc/powerhouse/commit/1a66b39330))
- **reactor-monitor-app:** create a drive from the Drives tab ([586f081c3b](https://github.com/powerhouse-inc/powerhouse/commit/586f081c3b))
- **ph-cli:** uniform-runners flag helper and host.js loader (P0.1, P0.2, P0.12) ([4c04163009](https://github.com/powerhouse-inc/powerhouse/commit/4c04163009))

### 🩹 Fixes

- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **tsconfig:** dedup host-core from root references now that ph-cli references it (P1.2) ([988cbc574c](https://github.com/powerhouse-inc/powerhouse/commit/988cbc574c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.56 (2026-10-14)

### 🚀 Features

- **desktop:** @powerhousedao/desktop — the desktop runner productized (P6.1-P6.5) ([58ce9a0d4a](https://github.com/powerhouse-inc/powerhouse/commit/58ce9a0d4a))
- **clint,ph-cli:** one static-serve implementation — connect-server deleted (P5.7) ([c35b0341c6](https://github.com/powerhouse-inc/powerhouse/commit/c35b0341c6))
- **clint:** mastra-runner — remote reactor attach + OpenAI-compatible agent API (P5.5, P5.6) ([532cb2128f](https://github.com/powerhouse-inc/powerhouse/commit/532cb2128f))
- **clint:** port the ph-clint framework — core, integrations, TUI, testing + full suite (P5.2, P5.3) ([d1ace0688e](https://github.com/powerhouse-inc/powerhouse/commit/d1ace0688e))
- **clint:** scaffold @powerhousedao/clint — the ph-clint port lands here (P5.1) ([c7a3435588](https://github.com/powerhouse-inc/powerhouse/commit/c7a3435588))
- **host-core,ph-cli:** structural multi-reactor — backends drive the routing client (P4.1-P4.3) ([e7c71ca7ac](https://github.com/powerhouse-inc/powerhouse/commit/e7c71ca7ac))
- **host-core:** shared zod host schemas; bridges adopt strict reactor/profile (P2.1, P2.2) ([1bd9db67be](https://github.com/powerhouse-inc/powerhouse/commit/1bd9db67be))
- **vetra:** lint project subgraphs for types core or the package's models own ([6855c0ed91](https://github.com/powerhouse-inc/powerhouse/commit/6855c0ed91))
- **host-core:** generic run records and pid-probe (P1.3, P1.5, P1.6 foundation) ([9a6affd46e](https://github.com/powerhouse-inc/powerhouse/commit/9a6affd46e))
- **host-core:** move drive projection primitives; add projectDrivesIntoConnect (P1.4) ([6cd1d8ee6e](https://github.com/powerhouse-inc/powerhouse/commit/6cd1d8ee6e))
- **host-core:** scaffold @powerhousedao/host-core (P1.1) ([c7d9b415b5](https://github.com/powerhouse-inc/powerhouse/commit/c7d9b415b5))
- **reactor-monitor-app:** restart a worker reactor from the Overview tab ([1a66b39330](https://github.com/powerhouse-inc/powerhouse/commit/1a66b39330))
- **reactor-monitor-app:** create a drive from the Drives tab ([586f081c3b](https://github.com/powerhouse-inc/powerhouse/commit/586f081c3b))
- **ph-cli:** uniform-runners flag helper and host.js loader (P0.1, P0.2, P0.12) ([4c04163009](https://github.com/powerhouse-inc/powerhouse/commit/4c04163009))

### 🩹 Fixes

- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **tsconfig:** dedup host-core from root references now that ph-cli references it (P1.2) ([988cbc574c](https://github.com/powerhouse-inc/powerhouse/commit/988cbc574c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.55 (2026-10-13)

### 🚀 Features

- **reactor-monitor-app:** send an unpersisted bearer to a remote reactor ([0232756142](https://github.com/powerhouse-inc/powerhouse/commit/0232756142))
- **reactor-monitor:** build remote inspection queries from the wire fields ([d16699f94e](https://github.com/powerhouse-inc/powerhouse/commit/d16699f94e))

### 🩹 Fixes

- **reactor-monitor-app:** start the SharedWorker explicitly and assert its chunk ([1161861eff](https://github.com/powerhouse-inc/powerhouse/commit/1161861eff))
- **reactor-monitor-app:** stop saying no refs were seen once all are held ([0a57ca0eb2](https://github.com/powerhouse-inc/powerhouse/commit/0a57ca0eb2))
- **reactor-monitor-app:** show failed sync reads on the Sync tab ([1061f5df83](https://github.com/powerhouse-inc/powerhouse/commit/1061f5df83))
- **reactor-monitor-app:** keep the bearer field out of password managers ([2167f24ba2](https://github.com/powerhouse-inc/powerhouse/commit/2167f24ba2))
- **reactor-monitor-app:** never offer a remote reactor as a local-link end ([12c88118f2](https://github.com/powerhouse-inc/powerhouse/commit/12c88118f2))
- **reactor-monitor-app:** keep a failed processor retry on screen past the next poll ([61984b2c62](https://github.com/powerhouse-inc/powerhouse/commit/61984b2c62))
- **reactor-monitor-app:** repair sync through ISyncAdmin, cut rewind, show tracked storage health ([c8618d7e70](https://github.com/powerhouse-inc/powerhouse/commit/c8618d7e70))
- **reactor-monitor-app:** gate workflows on the reactor's info ([cee0d352a3](https://github.com/powerhouse-inc/powerhouse/commit/cee0d352a3))
- **reactor-monitor-app:** type the modules and drives tabs against the monitor inspector ([ee56228591](https://github.com/powerhouse-inc/powerhouse/commit/ee56228591))
- **reactor-monitor-app:** query the store only where the reactor serves SQL ([b67718c060](https://github.com/powerhouse-inc/powerhouse/commit/b67718c060))
- **reactor-monitor-app:** retry, sweep and rebuild through the admin levers ([fa5f989a44](https://github.com/powerhouse-inc/powerhouse/commit/fa5f989a44))
- **reactor-monitor-app:** render queue jobs as wire records and pause through the admin levers ([ea8b78b9b4](https://github.com/powerhouse-inc/powerhouse/commit/ea8b78b9b4))
- **reactor-monitor-app:** gate levers, SQL and operational reads on the reactor's info ([6c03222e60](https://github.com/powerhouse-inc/powerhouse/commit/6c03222e60))
- **reactor-monitor-app:** gate local sync links on the reactor's info ([670b8182ec](https://github.com/powerhouse-inc/powerhouse/commit/670b8182ec))
- **reactor-monitor-app:** route over local reactors as routable backends ([b3cd0e6c83](https://github.com/powerhouse-inc/powerhouse/commit/b3cd0e6c83))
- **reactor-workflow:** upload a step's output as a file-backed Blob ([8c943bfbeb](https://github.com/powerhouse-inc/powerhouse/commit/8c943bfbeb))
- **reactor-attachments:** hash and upload attachments without reading the whole file into memory ([f6532d6449](https://github.com/powerhouse-inc/powerhouse/commit/f6532d6449))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5