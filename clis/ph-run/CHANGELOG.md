## 6.2.3-dev.94 (2026-11-05)

### 🚀 Features

- **reactor-monitor-app:** make and drop Postgres databases on a server ([21859fbdc1](https://github.com/powerhouse-inc/powerhouse/commit/21859fbdc1))

### 🩹 Fixes

- **ph-run:** warn when Connect can't keep the declared browser store ([7a7341a20c](https://github.com/powerhouse-inc/powerhouse/commit/7a7341a20c))
- **ph-run:** point a missing default build at the project it belongs to ([9ea76f2029](https://github.com/powerhouse-inc/powerhouse/commit/9ea76f2029))
- **ph-run:** show an outDir named ..x relative to the project ([dd7e8b2ab7](https://github.com/powerhouse-inc/powerhouse/commit/dd7e8b2ab7))
- **ph-run:** show a missing build outside the project by its absolute path ([11d2a97bd3](https://github.com/powerhouse-inc/powerhouse/commit/11d2a97bd3))
- **ph-run:** refuse a Postgres store that no url names ([793d565ea5](https://github.com/powerhouse-inc/powerhouse/commit/793d565ea5))
- **ph-run:** refuse a missing build under vite preview too ([b134bb4584](https://github.com/powerhouse-inc/powerhouse/commit/b134bb4584))
- **ph-run:** name the missing build with forward slashes and a quoted outDir ([962364043f](https://github.com/powerhouse-inc/powerhouse/commit/962364043f))
- **ph-run:** refuse to serve Connect without a build ([72475d8597](https://github.com/powerhouse-inc/powerhouse/commit/72475d8597))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5

## 6.2.3-dev.93 (2026-11-04)

This was a version bump only for @powerhousedao/ph-run to align it with other projects, there were no code changes.

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
- **workflow:** the workflow editors undo a base-reducer 3 document by retracting the last edit ([973f28a193](https://github.com/powerhouse-inc/powerhouse/commit/973f28a193))

### 🩹 Fixes

- **ph-run:** a bare Connect host keeps the Renown instance from the env ([1f989e5445](https://github.com/powerhouse-inc/powerhouse/commit/1f989e5445))
- **ph-run:** a Connect host's reactor namespace alone still reaches Connect ([265365bcaf](https://github.com/powerhouse-inc/powerhouse/commit/265365bcaf))

### ❤️ Thank You

- Benjamin Jordan
- Claude Opus 5.5
- Yasiel Cabrera @YasielCabrera

## 6.2.3-dev.90 (2026-11-02)

### 🚀 Features

- **desktop:** fold a stack into a few thousand files ([9ff7083857](https://github.com/powerhouse-inc/powerhouse/commit/9ff7083857))
- **ph-run:** run a host with none of the tools that build one ([ff0ac7910f](https://github.com/powerhouse-inc/powerhouse/commit/ff0ac7910f))
- **desktop:** a sign-in page and a local key for generated shells ([7cce4b7316](https://github.com/powerhouse-inc/powerhouse/commit/7cce4b7316))
- **desktop:** grant generated shells the system browser opener ([db0642a856](https://github.com/powerhouse-inc/powerhouse/commit/db0642a856))
- **switchboard:** verify delegated signers with authEnforcement off ([b896f23cfe](https://github.com/powerhouse-inc/powerhouse/commit/b896f23cfe))

### 🩹 Fixes

- **desktop:** the stack ships the packages its hosts' plugins come from ([faa1168ba4](https://github.com/powerhouse-inc/powerhouse/commit/faa1168ba4))
- **desktop:** pack and test the stack on Windows ([c6317e2c15](https://github.com/powerhouse-inc/powerhouse/commit/c6317e2c15))
- **reactor:** keep the trust context optional for direct callers ([1760590c37](https://github.com/powerhouse-inc/powerhouse/commit/1760590c37))

### ❤️ Thank You

- Claude Opus 5.5
- Wouter Kampmann