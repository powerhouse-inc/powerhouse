## 6.0.2-staging.10 (2026-05-20)

### 🩹 Fixes

- add @tokens to logger calls across packages ([b70070ae2](https://github.com/powerhouse-inc/powerhouse/commit/b70070ae2))
- **reactor-api:** pass args to logger.error calls in reactor subgraph ([b34dcf7dc](https://github.com/powerhouse-inc/powerhouse/commit/b34dcf7dc))

### ❤️ Thank You

- acaldas

## 6.0.2-staging.9 (2026-05-18)

### 🚀 Features

- **reactor-api:** main integration tests now run on both reactor-drive and document-drive, includes reshuffle fix ([4f370a63f](https://github.com/powerhouse-inc/powerhouse/commit/4f370a63f))
- add dark mode script ([#2619](https://github.com/powerhouse-inc/powerhouse/pull/2619))
- single-document contention integration tests are switchable between document-drive and reactor-drive ([68b59b492](https://github.com/powerhouse-inc/powerhouse/commit/68b59b492))
- **reactor-drive:** initial commit ([d6b7c4f8c](https://github.com/powerhouse-inc/powerhouse/commit/d6b7c4f8c))

### 🩹 Fixes

- wiring up reactor-drive dependency ([8c22b1658](https://github.com/powerhouse-inc/powerhouse/commit/8c22b1658))
- **merge:** restore main contents on release branch (keep only version bumps and changelogs) ([6b981a6f1](https://github.com/powerhouse-inc/powerhouse/commit/6b981a6f1))
- **deps:** drop orphan catalog refs in analytics-engine lost in main merge ([c16fa9085](https://github.com/powerhouse-inc/powerhouse/commit/c16fa9085))

### ❤️ Thank You

- Benjamin Jordan
- Guillermo Puente @gpuente
- Ryan Wolhuter @ryanwolhuter

## 6.0.2-staging.8 (2026-05-11)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.2-staging.6 (2026-05-04)

This was a version bump only for @powerhousedao/reactor-attachments to align it with other projects, there were no code changes.

## 6.0.2-staging.5 (2026-05-04)

### 🚀 Features

- **switchboard:** adding pglite migration flag ([952075b11](https://github.com/powerhouse-inc/powerhouse/commit/952075b11))
- **reactor-api:** added system subgraph which returns version and hash information ([248fc1e92](https://github.com/powerhouse-inc/powerhouse/commit/248fc1e92))
- **reactor-attachments:** switchboard implementation fixes ([3b320d01c](https://github.com/powerhouse-inc/powerhouse/commit/3b320d01c))
- initial switchboard endpoints and implementation ([01b20cede](https://github.com/powerhouse-inc/powerhouse/commit/01b20cede))
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

- so much linting that it kills my computer ([d6b6ff143](https://github.com/powerhouse-inc/powerhouse/commit/d6b6ff143))
- **reactor-attachments:** force octet-stream content-type for remote uploads ([fc45afccb](https://github.com/powerhouse-inc/powerhouse/commit/fc45afccb))
- **reactor-attachments:** fix the tsdown config ([8485b54be](https://github.com/powerhouse-inc/powerhouse/commit/8485b54be))

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