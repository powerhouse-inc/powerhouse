# Connect

## Runtime configuration
Connect reads all its runtime settings from a single `powerhouse.config.json`
(fetched once at boot, no env vars in the SPA). To **add or change a
`connect.*` config field**, follow "Runtime config fields" in
[`CUSTOMIZING.md`](./CUSTOMIZING.md#runtime-config-fields) — the TS
types/defaults and the two committed `*.schema.json` files must stay in
lockstep, which means rebuilding `@powerhousedao/shared` +
`@powerhousedao/builder-tools` and running `pnpm tsx scripts/emit-schemas.ts`.
The operator-facing side, including the precedence ladder
(`defaults < source < CLI override`, plus deploy-time env), is
[`runtime-config.md`](./skills/customize-connect/references/runtime-config.md).
