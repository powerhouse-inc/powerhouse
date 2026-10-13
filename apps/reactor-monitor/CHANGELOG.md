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