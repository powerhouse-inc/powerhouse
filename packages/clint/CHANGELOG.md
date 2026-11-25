## 6.4.0-next.6 (2026-11-25)

### 🩹 Fixes

- **clint:** a cli's reactor client holds the drive and document-model models ([1580a4759a](https://github.com/powerhouse-inc/powerhouse/commit/1580a4759a))

### ❤️ Thank You

- Claude Opus 5.5
- Wouter Kampmann

## 6.4.0-next.5 (2026-11-25)

### 🚀 Features

- **devtools:** show a model's state schema as a diagram ([fba4774787](https://github.com/powerhouse-inc/powerhouse/commit/fba4774787))
- **ph-cli:** generate --name creates the new authoring form, remove --code-first ([d15cb4f627](https://github.com/powerhouse-inc/powerhouse/commit/d15cb4f627))
- **ph-cli:** ph mcp signs an mcp client's writes as the client's own session ([56e89cb281](https://github.com/powerhouse-inc/powerhouse/commit/56e89cb281))
- **clint:** mcp endpoints an agent discovers carry the bearer its consumer gives ([1a3418e488](https://github.com/powerhouse-inc/powerhouse/commit/1a3418e488))
- **clint:** a cli's own signer may open at its first write; uploads bear as writes do ([462bcf6e5a](https://github.com/powerhouse-inc/powerhouse/commit/462bcf6e5a))
- **clint:** a forwarded command signs as the person who typed it ([a88446954d](https://github.com/powerhouse-inc/powerhouse/commit/a88446954d))
- **devtools:** add DevTools as a Connect dev-server plugin ([979e32758a](https://github.com/powerhouse-inc/powerhouse/commit/979e32758a))
- **clint:** a service's -ps shows what the supervisor knows of it ([0649a43d07](https://github.com/powerhouse-inc/powerhouse/commit/0649a43d07))
- **host-core:** the supervisor applies the restart policy to the instances it holds ([5c345bda8c](https://github.com/powerhouse-inc/powerhouse/commit/5c345bda8c))
- **clint:** start host services through the user's supervisor when one runs ([675845ac9e](https://github.com/powerhouse-inc/powerhouse/commit/675845ac9e))
- **clint:** run commands that need the reactor or the agent in the running instance ([14ad8e0ad2](https://github.com/powerhouse-inc/powerhouse/commit/14ad8e0ad2))
- **host-core:** control protocol 2 with streamed output, cancel and owner-only access ([72bd0e46f3](https://github.com/powerhouse-inc/powerhouse/commit/72bd0e46f3))
- **clint:** keep service state under the data folder ([5e3704da8d](https://github.com/powerhouse-inc/powerhouse/commit/5e3704da8d))

### 🩹 Fixes

- write credential and key files readable by their user only ([f48508f643](https://github.com/powerhouse-inc/powerhouse/commit/f48508f643))
- **clint:** direct prints of a forwarded command reach its caller ([d506becebb](https://github.com/powerhouse-inc/powerhouse/commit/d506becebb))
- **clint:** load the markdown renderer when the interactive session starts ([2b1049cec1](https://github.com/powerhouse-inc/powerhouse/commit/2b1049cec1))

### 🔥 Performance

- **clint:** load templating, markdown and the proxy on first use ([3c848d3a98](https://github.com/powerhouse-inc/powerhouse/commit/3c848d3a98))

### ❤️ Thank You

- Claude
- Claude Opus 5.5
- Wouter Kampmann
- Yasiel Cabrera @YasielCabrera

## 6.4.0-next.3 (2026-11-23)

### 🚀 Features

- ⚠️  **switchboard,connect:** no built-in vetra package ([1e9b9ba2c6](https://github.com/powerhouse-inc/powerhouse/commit/1e9b9ba2c6))
- ⚠️  **ph-cli:** generate stubs only, no dependency on the vetra package ([329d9de807](https://github.com/powerhouse-inc/powerhouse/commit/329d9de807))
- **clint:** give a command the control record of the cli it runs beside ([30fdb322a8](https://github.com/powerhouse-inc/powerhouse/commit/30fdb322a8))
- **clint,host-core:** control channel so service commands reach the running cli ([2f08407d7e](https://github.com/powerhouse-inc/powerhouse/commit/2f08407d7e))

### ⚠️  Breaking Changes

- **switchboard,connect:** no built-in vetra package  ([1e9b9ba2c6](https://github.com/powerhouse-inc/powerhouse/commit/1e9b9ba2c6))
  switchboard dev mode and Connect studio mode no longer
  load @powerhousedao/vetra by themselves.
  Co-Authored-By: Claude <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016fHjTMdimGetqa3JnGXsnE
- **ph-cli:** generate stubs only, no dependency on the vetra package  ([329d9de807](https://github.com/powerhouse-inc/powerhouse/commit/329d9de807))
  ph generate --document and --extract are removed.
  Co-Authored-By: Claude <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016fHjTMdimGetqa3JnGXsnE

### ❤️ Thank You

- Claude
- Wouter Kampmann

## 6.4.0-next.2 (2026-11-23)

### 🚀 Features

- **clint:** give a command the control record of the cli it runs beside ([30fdb322a8](https://github.com/powerhouse-inc/powerhouse/commit/30fdb322a8))
- **clint,host-core:** control channel so service commands reach the running cli ([2f08407d7e](https://github.com/powerhouse-inc/powerhouse/commit/2f08407d7e))

### ❤️ Thank You

- Claude
- Wouter Kampmann

## 6.4.0-next.1 (2026-11-22)

### 🚀 Features

- **vetra:** move the ideate and build spec documents from vetra-cli ([bfc530d0f3](https://github.com/powerhouse-inc/powerhouse/commit/bfc530d0f3))

### ❤️ Thank You

- Claude
- Wouter Kampmann

## 6.4.0-next.0 (2026-11-22)

### 🚀 Features

- **clint:** a service may be a host run through spawnHost ([4a210ca632](https://github.com/powerhouse-inc/powerhouse/commit/4a210ca632))
- **clint:** a remote attach carries the switchboard's attachment service ([54cf8dc188](https://github.com/powerhouse-inc/powerhouse/commit/54cf8dc188))
- **clint:** remote attach carries the Cli's identity and a remote built at attach ([4585da6b7c](https://github.com/powerhouse-inc/powerhouse/commit/4585da6b7c))
- **codegen,ph-cli,shared:** a package with a cli declares clint as a versioned peer ([40936957cb](https://github.com/powerhouse-inc/powerhouse/commit/40936957cb))
- **ph-cli,shared:** the cli of a package is its own build, with declared packages external ([8504275af5](https://github.com/powerhouse-inc/powerhouse/commit/8504275af5))
- **host-core:** an installed package supplies hosts, addressed as <package>/<host> ([677b136c62](https://github.com/powerhouse-inc/powerhouse/commit/677b136c62))
- **clint:** the proxy as a member of a generic compound ([ea12e76b93](https://github.com/powerhouse-inc/powerhouse/commit/ea12e76b93))
- **clint:** the skill build reads the package's cli metadata ([698ffc7842](https://github.com/powerhouse-inc/powerhouse/commit/698ffc7842))
- **clint-common:** port the chat-session package from ph-clint dev.113 ([d21119c6a9](https://github.com/powerhouse-inc/powerhouse/commit/d21119c6a9))
- **host-core,clint,ph-run:** own-process compound members and a foreground cli member ([6447402ebe](https://github.com/powerhouse-inc/powerhouse/commit/6447402ebe))
- **clint:** add the ./cli package export and the cli runner ([64bb9f10c9](https://github.com/powerhouse-inc/powerhouse/commit/64bb9f10c9))
- ⚠️  **clint:** catch up with ph-clint dev.113 for a remote reactor ([7863d7ef3f](https://github.com/powerhouse-inc/powerhouse/commit/7863d7ef3f))
- **clint:** export the mastra, powerhouse and testing surfaces ([bcec896ac9](https://github.com/powerhouse-inc/powerhouse/commit/bcec896ac9))
- ⚠️  **reactor-attachments:** remove PreprocessResult.data and stream ([afe219c5a6](https://github.com/powerhouse-inc/powerhouse/commit/afe219c5a6))
- **ph-cli:** ph run connect build takes --base and --packages-registry ([894d5a7f31](https://github.com/powerhouse-inc/powerhouse/commit/894d5a7f31))
- ⚠️  **switchboard:** the plugin host is the only boot path ([fc8ba25655](https://github.com/powerhouse-inc/powerhouse/commit/fc8ba25655))
- ⚠️  **ph-cli:** a project without hosts is an error ([33b90cff3d](https://github.com/powerhouse-inc/powerhouse/commit/33b90cff3d))

### 🩹 Fixes

- **host-core,ph-run:** linux failures in the next/6.4 checks ([0fdc5a4797](https://github.com/powerhouse-inc/powerhouse/commit/0fdc5a4797))
- **clint-common,clint:** chat-session attachment fields are attachment refs ([ebbfda2bed](https://github.com/powerhouse-inc/powerhouse/commit/ebbfda2bed))
- **clint,clint-common:** attachment reads name the document that references the attachment ([c26c9ce1eb](https://github.com/powerhouse-inc/powerhouse/commit/c26c9ce1eb))
- **clint:** folder operations use only calls the remote client has ([76ca656864](https://github.com/powerhouse-inc/powerhouse/commit/76ca656864))
- **clint,clint-common:** close the gaps the vetra-cli port found ([b9b8c7c477](https://github.com/powerhouse-inc/powerhouse/commit/b9b8c7c477))
- **clint:** the proxy member binds 127.0.0.1 by default ([80d6d7c224](https://github.com/powerhouse-inc/powerhouse/commit/80d6d7c224))

### ⚠️  Breaking Changes

- **clint:** catch up with ph-clint dev.113 for a remote reactor  ([7863d7ef3f](https://github.com/powerhouse-inc/powerhouse/commit/7863d7ef3f))
  ensureDrive takes the reactor client, not the reactor
  module, and creates a drive in one write with its name set at creation.
  Co-Authored-By: Claude <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_016fHjTMdimGetqa3JnGXsnE
- **reactor-attachments:** remove PreprocessResult.data and stream  ([afe219c5a6](https://github.com/powerhouse-inc/powerhouse/commit/afe219c5a6))
  PreprocessResult no longer has `data` or `stream()`. Read `blob` and
  pass it to `send()`, which accepts a Blob.
  Co-Authored-By: Claude <noreply@anthropic.com>
- **switchboard:** the plugin host is the only boot path  ([fc8ba25655](https://github.com/powerhouse-inc/powerhouse/commit/fc8ba25655))
  FEATURE_PLUGIN_HOST_ENABLED=false refuses to start, and
  FEATURE_PLUGIN_HOST_ENABLED=1 without declared plugins no longer boots
  every built-in plugin. reactor.workflows in a host file fails validation.
  A host with only readModel.url must name its reactor store. The config
  file's workflows.enabled no longer turns workflows on in Switchboard.
  Co-Authored-By: Claude <noreply@anthropic.com>
- **ph-cli:** a project without hosts is an error  ([33b90cff3d](https://github.com/powerhouse-inc/powerhouse/commit/33b90cff3d))
  the classic commands need a hosts/ folder; run ph migrate.
  Co-Authored-By: Claude <noreply@anthropic.com>
## 6.3.0-dev.11 (2026-11-24)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.3.0-dev.10 (2026-11-23)

### 🚀 Features

- **ph-cmd,ph-cli,shared:** next release tag ([ec65d6e6f4](https://github.com/powerhouse-inc/powerhouse/commit/ec65d6e6f4))
- **releases:** next channel from version_prefix ([1f9a926b5a](https://github.com/powerhouse-inc/powerhouse/commit/1f9a926b5a))
- **releases:** next-version function for branch releases ([83ffbebba7](https://github.com/powerhouse-inc/powerhouse/commit/83ffbebba7))

### ❤️ Thank You

- Claude
- Wouter Kampmann

## 6.3.0-dev.9 (2026-11-22)

### 🚀 Features

- **ph-cmd,ph-cli,shared:** next release tag ([ec65d6e6f4](https://github.com/powerhouse-inc/powerhouse/commit/ec65d6e6f4))
- **releases:** next channel from version_prefix ([1f9a926b5a](https://github.com/powerhouse-inc/powerhouse/commit/1f9a926b5a))
- **releases:** next-version function for branch releases ([83ffbebba7](https://github.com/powerhouse-inc/powerhouse/commit/83ffbebba7))

### ❤️ Thank You

- Claude
- Wouter Kampmann

## 6.3.0-dev.8 (2026-11-22)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.3.0-dev.7 (2026-11-21)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.3.0-dev.6 (2026-11-20)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.3.0-dev.5 (2026-11-19)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.3.0-dev.4 (2026-11-18)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.3.0-dev.3 (2026-11-17)

### 🚀 Features

- **ph-cli:** ph migrate converts schema-first document models to code-first ([054952452c](https://github.com/powerhouse-inc/powerhouse/commit/054952452c))

### ❤️ Thank You

- Yasiel Cabrera @YasielCabrera

## 6.3.0-dev.2 (2026-11-16)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.3.0-dev.1 (2026-11-16)

### 🚀 Features

- **codegen:** new projects run their hosts from the package scripts ([801495395a](https://github.com/powerhouse-inc/powerhouse/commit/801495395a))

### ❤️ Thank You

- Claude
- Wouter Kampmann

## 6.2.3-dev.106 (2026-11-15)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.105 (2026-11-14)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.104 (2026-11-13)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.103 (2026-11-12)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.102 (2026-11-11)

### 🚀 Features

- **document-model:** add the code-first subgraph definition layer and checks ([ed3a0ddb00](https://github.com/powerhouse-inc/powerhouse/commit/ed3a0ddb00))

### ❤️ Thank You

- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.101 (2026-11-10)

### 🩹 Fixes

- **ci:** avoid competing package test processes ([2c2dee4745](https://github.com/powerhouse-inc/powerhouse/commit/2c2dee4745))
- **ci:** bound workers within concurrent test suites ([50a6722880](https://github.com/powerhouse-inc/powerhouse/commit/50a6722880))

### 🔥 Performance

- **ci:** overlap test suites and cache dependency downloads ([6bd75d0db4](https://github.com/powerhouse-inc/powerhouse/commit/6bd75d0db4))

### ❤️ Thank You

- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.100 (2026-11-09)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.99 (2026-11-08)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.98 (2026-11-07)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.97 (2026-11-07)

### 🩹 Fixes

- **document-model,reactor-api,reactor-mcp,switchboard,workflow,ph-cli:** code-first models work on every host, and ph build and ph publish keep their guarantees ([1d7aeb5727](https://github.com/powerhouse-inc/powerhouse/commit/1d7aeb5727))

### ❤️ Thank You

- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.96 (2026-11-06)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.95 (2026-11-06)

### 🚀 Features

- **ph-cli:** stage ph build, record release approvals, verify ph publish ([aaed86bf24](https://github.com/powerhouse-inc/powerhouse/commit/aaed86bf24))

### ❤️ Thank You

- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.94 (2026-11-05)

### 🚀 Features

- **reactor-monitor-app:** make and drop Postgres databases on a server ([21859fbdc1](https://github.com/powerhouse-inc/powerhouse/commit/21859fbdc1))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.93 (2026-11-04)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.92 (2026-11-04)

### 🚀 Features

- **ph-cli:** add experimental ph model check and inspect ([9973f75d0d](https://github.com/powerhouse-inc/powerhouse/commit/9973f75d0d))
- **document-model:** load projects for check and inspect ([a018f5f129](https://github.com/powerhouse-inc/powerhouse/commit/a018f5f129))

### ❤️ Thank You

- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.91 (2026-11-03)

### 🚀 Features

- **codegen:** scaffold code-first model projects ([6d2d5d2bfb](https://github.com/powerhouse-inc/powerhouse/commit/6d2d5d2bfb))
- **document-model:** compile code-first declarations into a stored document model ([cd5900328a](https://github.com/powerhouse-inc/powerhouse/commit/cd5900328a))
- **host-core:** accept undoV3 in a host's reactor protocol ([0c01d5f2fb](https://github.com/powerhouse-inc/powerhouse/commit/0c01d5f2fb))
- **workflow:** the workflow editors undo a base-reducer 3 document by retracting the last edit ([973f28a193](https://github.com/powerhouse-inc/powerhouse/commit/973f28a193))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5
- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.90 (2026-11-02)

### 🚀 Features

- **desktop:** fold a stack into a few thousand files ([9ff7083857](https://github.com/powerhouse-inc/powerhouse/commit/9ff7083857))
- **ph-run:** run a host with none of the tools that build one ([ff0ac7910f](https://github.com/powerhouse-inc/powerhouse/commit/ff0ac7910f))
- **desktop:** a sign-in page and a local key for generated shells ([7cce4b7316](https://github.com/powerhouse-inc/powerhouse/commit/7cce4b7316))
- **switchboard:** ensureDrive, by slug ([8ae38afcb6](https://github.com/powerhouse-inc/powerhouse/commit/8ae38afcb6))
- **desktop:** grant generated shells the system browser opener ([db0642a856](https://github.com/powerhouse-inc/powerhouse/commit/db0642a856))
- **switchboard:** verify delegated signers with authEnforcement off ([b896f23cfe](https://github.com/powerhouse-inc/powerhouse/commit/b896f23cfe))

### 🩹 Fixes

- **desktop:** the stack ships the packages its hosts' plugins come from ([faa1168ba4](https://github.com/powerhouse-inc/powerhouse/commit/faa1168ba4))
- **desktop:** pack and test the stack on Windows ([c6317e2c15](https://github.com/powerhouse-inc/powerhouse/commit/c6317e2c15))
- **reactor:** keep the trust context optional for direct callers ([1760590c37](https://github.com/powerhouse-inc/powerhouse/commit/1760590c37))

### ❤️ Thank You

- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.89 (2026-11-02)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.88 (2026-11-01)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.87 (2026-10-31)

### 🚀 Features

- **host-core:** warn when two compound members declare one port ([493216cf65](https://github.com/powerhouse-inc/powerhouse/commit/493216cf65))
- **document-model:** add the code-first definition kernel ([5cf4c8ec4b](https://github.com/powerhouse-inc/powerhouse/commit/5cf4c8ec4b))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5
- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.86 (2026-10-30)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.85 (2026-10-30)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.84 (2026-10-30)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.83 (2026-10-30)

### 🩹 Fixes

- **connect:** a kept copy is ready once it holds the switchboard's revision ([f327ce1fa6](https://github.com/powerhouse-inc/powerhouse/commit/f327ce1fa6))
- **connect:** wait for the copy in every tab, and re-read moves before reconciling at boot ([243e0813d7](https://github.com/powerhouse-inc/powerhouse/commit/243e0813d7))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.82 (2026-10-29)

### 🚀 Features

- **reactor-router:** a backend's document types may read as open ([df1583eab1](https://github.com/powerhouse-inc/powerhouse/commit/df1583eab1))
- **reactor-browser:** createSwitchboardBackend, a Switchboard as a router backend ([f2b6b608af](https://github.com/powerhouse-inc/powerhouse/commit/f2b6b608af))

### 🩹 Fixes

- **reactor-browser:** a switchboard that loads models on demand gets no create pre-check ([cd57ceec10](https://github.com/powerhouse-inc/powerhouse/commit/cd57ceec10))

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
- **clint:** the mastra runner attaches through a switchboard drive address ([0d34a3c2eb](https://github.com/powerhouse-inc/powerhouse/commit/0d34a3c2eb))
- **document-model,codegen,reactor-api,ph-cli:** projects define their own GraphQL scalars ([968fa45a44](https://github.com/powerhouse-inc/powerhouse/commit/968fa45a44))

### 🩹 Fixes

- **host-core:** keep host names to one safe file-name segment ([d347e09c10](https://github.com/powerhouse-inc/powerhouse/commit/d347e09c10))
- **ci:** install academy lint dependencies and restore codegen test cwd ([c99d5e4fe4](https://github.com/powerhouse-inc/powerhouse/commit/c99d5e4fe4))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5
- Wouter Kampmann
- Yasiel Cabrera

## 6.2.3-dev.79 (2026-10-28)

### 🚀 Features

- **clint:** start the switchboard with config and deps ([0262b45d4a](https://github.com/powerhouse-inc/powerhouse/commit/0262b45d4a))
- ⚠️  **switchboard:** startSwitchboard(config, deps) reads only its config ([29d223ebff](https://github.com/powerhouse-inc/powerhouse/commit/29d223ebff))
- **ph-cli,codegen:** ph mcp, a stdio launcher for reactor-mcp that starts vetra on the first tool call, and generated mcp configs that run it ([c64883e693](https://github.com/powerhouse-inc/powerhouse/commit/c64883e693))
- **codegen,vetra,ph-cli,connect:** project agent guidance as a managed AGENTS.md block and skills, and eval fixes ([#3303](https://github.com/powerhouse-inc/powerhouse/pull/3303))

### 🩹 Fixes

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

- **portle:** scaffold @powerhousedao/portle, the switchboard plugin that gates publication through Portle ([68ab561f7d](https://github.com/powerhouse-inc/powerhouse/commit/68ab561f7d))
- **reactor-api,switchboard:** vacuum full policy knob, no forced rewrite under load by default ([d6dcbf5cd0](https://github.com/powerhouse-inc/powerhouse/commit/d6dcbf5cd0))

### 🩹 Fixes

- **registry:** a failed tarball write no longer records its attachment ([5d3ae94bd8](https://github.com/powerhouse-inc/powerhouse/commit/5d3ae94bd8))
- **reactor-api:** the one-time VACUUM FULL is off by default; quiet and forced are opt-ins ([fd7c19e313](https://github.com/powerhouse-inc/powerhouse/commit/fd7c19e313))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5.1
- Claude Opus 5.5
- Wouter Kampmann

## 6.2.3-dev.77 (2026-10-26)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.76 (2026-10-25)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.75 (2026-10-24)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** ph host check behind FEATURE_UNIFORM_RUNNERS_ENABLED ([3a41a17991](https://github.com/powerhouse-inc/powerhouse/commit/3a41a17991))
- **codegen:** ph migrate moves connect's theme overrides from style.css to the host stylesheet ([b113414352](https://github.com/powerhouse-inc/powerhouse/commit/b113414352))

### 🩹 Fixes

- **builder-tools:** the worker-safe vendor check parses imports, so import-like text in strings and comments no longer counts ([9d3e167f4b](https://github.com/powerhouse-inc/powerhouse/commit/9d3e167f4b))
- **reactor-browser,connect,reactor-monitor:** the worker reactor loads a registry package's module graph, and packages added or updated after boot ([5348ffa792](https://github.com/powerhouse-inc/powerhouse/commit/5348ffa792))
- **powerhouse-vetra-packages:** the document-model editor writes nothing on open unless the model is blank ([f5dc33dd0a](https://github.com/powerhouse-inc/powerhouse/commit/f5dc33dd0a))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.74 (2026-10-24)

### 🚀 Features

- **ph-cli,ph-cmd,shared:** ph host check behind FEATURE_UNIFORM_RUNNERS_ENABLED ([3a41a17991](https://github.com/powerhouse-inc/powerhouse/commit/3a41a17991))
- **codegen:** ph migrate moves connect's theme overrides from style.css to the host stylesheet ([b113414352](https://github.com/powerhouse-inc/powerhouse/commit/b113414352))

### ❤️ Thank You

- acaldas
- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.73 (2026-10-23)

### 🩹 Fixes

- **builder-tools:** the worker-safe vendor check parses imports, so import-like text in strings and comments no longer counts ([9d3e167f4b](https://github.com/powerhouse-inc/powerhouse/commit/9d3e167f4b))
- **reactor-browser,connect,reactor-monitor:** the worker reactor loads a registry package's module graph, and packages added or updated after boot ([5348ffa792](https://github.com/powerhouse-inc/powerhouse/commit/5348ffa792))
- **powerhouse-vetra-packages:** the document-model editor writes nothing on open unless the model is blank ([f5dc33dd0a](https://github.com/powerhouse-inc/powerhouse/commit/f5dc33dd0a))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.72 (2026-10-23)

### 🚀 Features

- **clint:** give the Mastra agent read tools over the attached reactor ([80899e7f30](https://github.com/powerhouse-inc/powerhouse/commit/80899e7f30))
- **shared,connect,codegen:** ph init and ph migrate give a project the router as a peer at connect's version, and the host stylesheet shows light and dark tokens ([0829546eaf](https://github.com/powerhouse-inc/powerhouse/commit/0829546eaf))

### ❤️ Thank You

- acaldas
- Claude Fable 5.1
- Wouter Kampmann

## 6.2.3-dev.71 (2026-10-22)

### 🚀 Features

- **shared,design-system,workflow,vetra,powerhouse-vetra-packages,connect:** bundled packages leave their dependencies to Connect's build, which includes each once ([74bf2d8b37](https://github.com/powerhouse-inc/powerhouse/commit/74bf2d8b37))
- **desktop:** vendor local package tarballs into the stack (PH_DESKTOP_LOCAL_PACKAGES) ([000bc39d10](https://github.com/powerhouse-inc/powerhouse/commit/000bc39d10))
- **clint:** resolve the shell's own tokens through host-core deferSelf ([15011891e9](https://github.com/powerhouse-inc/powerhouse/commit/15011891e9))
- **clint:** resolve the shell's own agent/proxy fields after its members start ([7992b685a5](https://github.com/powerhouse-inc/powerhouse/commit/7992b685a5))
- **codegen:** pure builders for generated outputs.js/.d.ts and the hosts typing files ([be3c35122f](https://github.com/powerhouse-inc/powerhouse/commit/be3c35122f))
- **clint:** agent urls and proxy upstreams are ref() fields; sibling resolvers deleted ([ac3a884674](https://github.com/powerhouse-inc/powerhouse/commit/ac3a884674))
- **clint:** mastra-runner reads the resolved remote.url and takes apiKey from config ([2bdc19463a](https://github.com/powerhouse-inc/powerhouse/commit/2bdc19463a))
- **clint:** typed host contracts for mastra-runner and clint-runner ([f3729a9d59](https://github.com/powerhouse-inc/powerhouse/commit/f3729a9d59))
- **host-core:** zod single source for host types, kind-aware validateHost, v2 run records ([66e4bcaccd](https://github.com/powerhouse-inc/powerhouse/commit/66e4bcaccd))
- **connect,desktop:** layered backgrounds for the home screen and the loading page ([9ffe4915b4](https://github.com/powerhouse-inc/powerhouse/commit/9ffe4915b4))
- **host-core,ph-cli,switchboard,connect,codegen:** workflow plugins declare the drive and the link ([ab37f30600](https://github.com/powerhouse-inc/powerhouse/commit/ab37f30600))

### 🩹 Fixes

- **clint:** wait for the run record of a member re-attached by port ([7ac55c2aa5](https://github.com/powerhouse-inc/powerhouse/commit/7ac55c2aa5))
- **clint:** start compound members in token-dependency order ([219fe31438](https://github.com/powerhouse-inc/powerhouse/commit/219fe31438))
- **clint:** wait for a member's run record before reading its outputs ([1c57387b1f](https://github.com/powerhouse-inc/powerhouse/commit/1c57387b1f))
- **clint:** start-run is the only standalone run-record writer ([4ce6fafcb3](https://github.com/powerhouse-inc/powerhouse/commit/4ce6fafcb3))
- **clint:** tear the shell down when its outputs fail validation ([94473002b9](https://github.com/powerhouse-inc/powerhouse/commit/94473002b9))

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

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.68 (2026-10-20)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.67 (2026-10-20)

### 🚀 Features

- **connect-core,connect,builder-tools,ph-cli:** plugins provide their UI; the generic plugin's UI moves to apps/connect/src/generic, and dev renders a routed project's loading shell ([e6ce70abce](https://github.com/powerhouse-inc/powerhouse/commit/e6ce70abce))

### 🩹 Fixes

- **design-system,connect:** tailwind-scrollbar is a dependency, since a project's Tailwind build loads tailwind.css's plugin; the stylesheet test builds a fixture project's stylesheet ([8abc9b0476](https://github.com/powerhouse-inc/powerhouse/commit/8abc9b0476))

### ❤️ Thank You

- acaldas

## 6.2.3-dev.66 (2026-10-20)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.65 (2026-10-20)

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

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

This was a version bump only for @powerhousedao/clint to align it with other projects, there were no code changes.

## 6.2.3-dev.59 (2026-10-15)

### 🚀 Features

- **clint:** compound proxy plugin + mastra agent-card/settings split (R5) ([5f90d78cfa](https://github.com/powerhouse-inc/powerhouse/commit/5f90d78cfa))
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
- **clint:** clint-runner — children as clint services, agents manager, lifecycle, build forwarding (P5.4) ([fb78468352](https://github.com/powerhouse-inc/powerhouse/commit/fb78468352))
- **clint:** mastra-runner — remote reactor attach + OpenAI-compatible agent API (P5.5, P5.6) ([532cb2128f](https://github.com/powerhouse-inc/powerhouse/commit/532cb2128f))
- **clint:** port the ph-clint framework — core, integrations, TUI, testing + full suite (P5.2, P5.3) ([d1ace0688e](https://github.com/powerhouse-inc/powerhouse/commit/d1ace0688e))
- **clint:** scaffold @powerhousedao/clint — the ph-clint port lands here (P5.1) ([c7a3435588](https://github.com/powerhouse-inc/powerhouse/commit/c7a3435588))
- **host-core,ph-cli:** structural multi-reactor — backends drive the routing client (P4.1-P4.3) ([e7c71ca7ac](https://github.com/powerhouse-inc/powerhouse/commit/e7c71ca7ac))
- **host-core:** shared zod host schemas; bridges adopt strict reactor/profile (P2.1, P2.2) ([1bd9db67be](https://github.com/powerhouse-inc/powerhouse/commit/1bd9db67be))
- **vetra:** lint project subgraphs for types core or the package's models own ([6855c0ed91](https://github.com/powerhouse-inc/powerhouse/commit/6855c0ed91))
- **host-core:** generic run records and pid-probe (P1.3, P1.5, P1.6 foundation) ([9a6affd46e](https://github.com/powerhouse-inc/powerhouse/commit/9a6affd46e))
- **host-core:** move drive projection primitives; add projectDrivesIntoConnect (P1.4) ([6cd1d8ee6e](https://github.com/powerhouse-inc/powerhouse/commit/6cd1d8ee6e))
- **host-core:** scaffold @powerhousedao/host-core (P1.1) ([c7d9b415b5](https://github.com/powerhouse-inc/powerhouse/commit/c7d9b415b5))
- **ph-cli:** uniform-runners flag helper and host.js loader (P0.1, P0.2, P0.12) ([4c04163009](https://github.com/powerhouse-inc/powerhouse/commit/4c04163009))

### 🩹 Fixes

- **clint,desktop:** repository field for npm provenance ([7df6953a2a](https://github.com/powerhouse-inc/powerhouse/commit/7df6953a2a))
- **clint:** deflake the REPL /exit frame assertion on loaded runners ([5664e2daef](https://github.com/powerhouse-inc/powerhouse/commit/5664e2daef))
- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **clint:** clint-runner readiness + layered re-attach + suite teardown (P5.9) ([6dddb4108c](https://github.com/powerhouse-inc/powerhouse/commit/6dddb4108c))
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
- **clint:** clint-runner — children as clint services, agents manager, lifecycle, build forwarding (P5.4) ([fb78468352](https://github.com/powerhouse-inc/powerhouse/commit/fb78468352))
- **clint:** mastra-runner — remote reactor attach + OpenAI-compatible agent API (P5.5, P5.6) ([532cb2128f](https://github.com/powerhouse-inc/powerhouse/commit/532cb2128f))
- **clint:** port the ph-clint framework — core, integrations, TUI, testing + full suite (P5.2, P5.3) ([d1ace0688e](https://github.com/powerhouse-inc/powerhouse/commit/d1ace0688e))
- **clint:** scaffold @powerhousedao/clint — the ph-clint port lands here (P5.1) ([c7a3435588](https://github.com/powerhouse-inc/powerhouse/commit/c7a3435588))
- **host-core,ph-cli:** structural multi-reactor — backends drive the routing client (P4.1-P4.3) ([e7c71ca7ac](https://github.com/powerhouse-inc/powerhouse/commit/e7c71ca7ac))
- **host-core:** shared zod host schemas; bridges adopt strict reactor/profile (P2.1, P2.2) ([1bd9db67be](https://github.com/powerhouse-inc/powerhouse/commit/1bd9db67be))
- **vetra:** lint project subgraphs for types core or the package's models own ([6855c0ed91](https://github.com/powerhouse-inc/powerhouse/commit/6855c0ed91))
- **host-core:** generic run records and pid-probe (P1.3, P1.5, P1.6 foundation) ([9a6affd46e](https://github.com/powerhouse-inc/powerhouse/commit/9a6affd46e))
- **host-core:** move drive projection primitives; add projectDrivesIntoConnect (P1.4) ([6cd1d8ee6e](https://github.com/powerhouse-inc/powerhouse/commit/6cd1d8ee6e))
- **host-core:** scaffold @powerhousedao/host-core (P1.1) ([c7d9b415b5](https://github.com/powerhouse-inc/powerhouse/commit/c7d9b415b5))
- **ph-cli:** uniform-runners flag helper and host.js loader (P0.1, P0.2, P0.12) ([4c04163009](https://github.com/powerhouse-inc/powerhouse/commit/4c04163009))

### 🩹 Fixes

- **clint:** deflake the REPL /exit frame assertion on loaded runners ([5664e2daef](https://github.com/powerhouse-inc/powerhouse/commit/5664e2daef))
- **ci:** read duration-watch timings from check runs and warn on API errors ([239683c51d](https://github.com/powerhouse-inc/powerhouse/commit/239683c51d))
- **clint:** clint-runner readiness + layered re-attach + suite teardown (P5.9) ([6dddb4108c](https://github.com/powerhouse-inc/powerhouse/commit/6dddb4108c))
- **tsconfig:** dedup host-core from root references now that ph-cli references it (P1.2) ([988cbc574c](https://github.com/powerhouse-inc/powerhouse/commit/988cbc574c))

### ❤️ Thank You

- Benjamin Jordan
- Claude Fable 5
- Claude Opus 5.5
- Wouter Kampmann