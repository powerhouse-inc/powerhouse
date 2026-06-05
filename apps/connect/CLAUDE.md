# Connect

## Runtime configuration
Connect reads all its runtime settings from a single `powerhouse.config.json`
(fetched once at boot, no env vars in the SPA). To **add or change a
`connect.*` config field**, follow the developer steps in
[`RUNTIME-CONFIG.md`](./RUNTIME-CONFIG.md) — the TS types/defaults and the two
committed `*.schema.json` files must stay in lockstep, which means rebuilding
`@powerhousedao/shared` + `@powerhousedao/builder-tools` and running
`pnpm tsx scripts/emit-schemas.ts`. That doc also covers the operator-facing
precedence ladder (`defaults < source < CLI override`, plus deploy-time env).
