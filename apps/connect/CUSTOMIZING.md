# Customizing Connect: contributor notes

Working on Connect's customization surface in this monorepo: the tools and the files behind it.

To customize Connect from a project, start from the [customize-connect skill](./skills/customize-connect/SKILL.md): its table maps each change to a guide in [`references/`](./skills/customize-connect/references/), for people and coding agents alike. The skill is what ships with the package; keep it, not this file, as the index of the guides.

## UI screenshots of core's views

`ui:shots` in `@powerhousedao/connect-core` renders core's views in a real Connect and saves one PNG per scene to `packages/connect-core/.ui-shots/` (gitignored):

```sh
pnpm --filter @powerhousedao/connect-core ui:serve    # Connect plus a browser window on seeded drives
pnpm --filter @powerhousedao/connect-core ui:shots    # every scene
pnpm --filter @powerhousedao/connect-core ui:shots document-json --theme dark
pnpm --filter @powerhousedao/connect-core ui:shots --list
```

- Connect is a production build of `test/versioned-documents` (`ph connect build --outDir .ph/ui-shots/dist`), served by `ph connect preview` on `:4350` (`UI_SHOTS_CONNECT_PORT`, 4350-4359). The stack starts it unless the port answers, stops what it started, and rebuilds when the connect-core, Connect, builder-tools or project sources are newer than the build. `UI_CONNECT_DEV=1` runs `ph connect studio` instead.
- Each browser context overrides the served `powerhouse.config.json` with `connect.composition: []`, so the generic plugin is absent and core's views show. `--generic` keeps the classic chrome, for comparison.
- Each run seeds local drives through Connect's reactor: folders, a Todo document, Reactor Group documents (no editor, so the JSON view) and a drive whose `preferredEditor` is a drive app.
- Flags: `--width`, `--height`, `--out`; `UI_SHOTS_VERBOSE=1` prints the server logs. Scenes live in `SCENES` in `packages/connect-core/scripts/ui-shots.ts`.

## Reference: key files

| File | What it holds |
| --- | --- |
| `apps/connect/src/routes/` | Connect's routes, which a project's files override: core's `options` and core's views, which plugins' UI replaces. |
| `packages/connect-core/src/routes/` | Core's routes: each file's `options` and core's view. |
| `packages/connect-core/src/plugins/plugin-ui.ts` | Loading, merging and applying plugins' UI. |
| `apps/connect/src/generic/ui.tsx` | The generic plugin's UI. |
| `apps/connect/src/layout/index.ts` | The `@powerhousedao/connect/layout` exports: core's layout parts. |
| `apps/connect/src/generic/index.ts` | The `@powerhousedao/connect/generic` exports: the generic plugin's parts, with core's. |
| `packages/connect-core/src/router/sidebar.ts` | `staticData.nav` and `staticData.sidebar`. |
| `packages/connect-core/src/router/settings.ts` | `staticData.settings`. |
| `packages/connect-core/src/router/drive-route-loader.ts` | `ConnectRouterContext`. |
| `packages/connect-core/src/router/search.ts` | Search param parsing and the global params. |
| `packages/connect-core/src/router/titles.ts` | Connect's titles. |
| `packages/builder-tools/connect-utils/vite-plugins/connect-routes.ts` | Routes folder lookup and tree generation. |
| `apps/connect/tailwind.css` | Connect's Tailwind source, which a project's `style.css` imports. |
| `apps/connect/theme.css` | Connect's tokens without its classes, which a package's stylesheet references. |
| `packages/codegen/src/file-builders/boilerplate/migrate-style.ts` | `style.css` on `ph migrate`, and the package stylesheet `ph build` compiles. |
| `packages/builder-tools/connect-utils/vite-plugins/host-stylesheet.ts` | The host's `style.css`, added to the project's in the page's build. |
| `apps/connect/src/prerender/shell-css.ts` | The loading screen's CSS, built by Tailwind's compiler. |
| `packages/reactor-browser/src/hooks/navigation.ts`, `link-props.ts` | The navigation API for editors. |
| `test/versioned-documents/hosts/connect/routes/` | A working example project. |

## Runtime config fields

The developer side of [runtime-config.md](./skills/customize-connect/references/runtime-config.md).

### Adding or changing a field

A `connect.*` field is declared once, in zod; everything else is derived from
it. The `PHConnect*` TS types are `z.infer` of the schemas, the JSON Schema
fragment Ajv uses (`phConnectRuntimeConfigSchema`) is emitted from them, and
the two committed `*.schema.json` files are generated from that fragment.

1. **Schema** — `packages/shared/connect/connect-config-schema.ts`. Declare the
   field in the relevant `connect*Schema` section (e.g. `connectPackagesSchema`),
   with its description and `default` in `.meta({ description, default })`.
   Never use `.default(x)` (it fills values on parse) or `.meta({ id })` (it
   emits `$defs`). The matching `PHConnect*` type in
   `packages/shared/clis/types.ts` picks the field up through `z.infer`, and the
   emitted fragment in `packages/shared/connect/schema-fragments.ts` through
   `z.toJSONSchema`; neither is edited by hand. The drift test
   `connect-config-schema.test.ts` pins the emitted fragment: update its
   snapshot (`vitest -u`) after reviewing the diff.
2. **Default** — `packages/shared/connect/runtime-config.ts`. Add the field's
   default to `DEFAULT_CONNECT_CONFIG` so the SPA never sees it undefined.
3. **Rebuild** the source-of-truth packages so the emit script sees the change:
   ```bash
   pnpm --filter=@powerhousedao/shared --filter=@powerhousedao/builder-tools build
   ```
4. **Regenerate** the committed JSON schemas:
   ```bash
   pnpm tsx scripts/emit-schemas.ts
   ```
   This rewrites `packages/builder-tools/connect-utils/runtime-config.schema.json`
   and `packages/shared/clis/source-config.schema.json`. Commit both.

**`connect.pwa.*` fields have a second, hand-kept zod schema.** `PwaConfigSchema` /
`PwaManifestOverrideSchema` in `packages/shared/document-model/schemas.ts` is
the validator `ph connect build` actually runs against `connect.pwa` (via
`validateProjectPwaConfig`), and it is hand-maintained: `emit-schemas.ts` does
not regenerate it, and the coverage test below does not cover it (there is no
`pwa` default). It mirrors `connectPwaSchema`; its `z.ZodType<PHConnectPwa>`
annotation pins it to the inferred type, but does not force it to gain a
newly-added optional field. So when you add a `connect.pwa.*` field, declare it there too —
the objects are strict (`z.strictObject`), so a field the schema doesn't know
fails the build as an unrecognized key rather than being silently dropped.

Then consume it in the SPA via `getRuntimeConfig().connect?.<block>?.<field>`
(or add a typed accessor in `apps/connect/src/connect.config.ts`).

Optional, depending on the field:

- **CLI flag** — to expose `ph connect config/build --<field>`, wire it through
  `packages/shared/clis/args/connect.ts` and `clis/ph-cli/src/utils/cli-connect-override.ts`
  (see `externalEnabled` → `--external-packages` for the pattern).
- **Scaffold default** — if new projects should ship the field, add it to the
  `ph init` template at `packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts`.

The `runtime-config-schema.test.ts` coverage test asserts every key emitted from
`DEFAULT_CONNECT_CONFIG` has a matching schema declaration — it fails loudly if
you add a default (step 2) but skip the schema (step 1).

### Key files

```
packages/shared/connect/
  ├ connect-config-schema.ts      zod schemas: the single source of connect.* fields
  ├ schema-fragments.ts           JSON Schema fragments emitted from the zod schemas
  ├ runtime-config.ts             DEFAULT_CONNECT_CONFIG, types, buildRuntimeConfig
  ├ config-loader.ts              ConfigLoader, ConfigAdapter, deepMerge
  └ json-adapter.ts               JsonConfigAdapter (browser fetch | Node fs)

packages/builder-tools/connect-utils/
  ├ runtime-config-schema.ts      JSON Schema (Ajv), composed from the emitted fragment
  └ vite-plugins/ph-config.ts     Emits dist file & serves /powerhouse.config.json in dev

clis/ph-cli/src/
  ├ utils/cli-connect-override.ts  buildConnectFlagPatch, wasFlagExplicitlyPassed, buildCliConnectOverride
  ├ utils/connect-config-validation.ts  validateConnectPatch (Ajv)
  ├ services/connect-config.ts    `ph connect config` handler
  ├ services/connect-studio.ts    `ph connect studio` (accepts callerOverride)
  ├ services/vetra.ts             `ph vetra` (constructs callerOverride)
  ├ commands/install.ts           `ph install` (writes packageRegistryUrl)
  └ utils.ts                      updateConfigFile

apps/connect/
  ├ main.tsx                      top-level await + dynamic import (boot race fix)
  └ src/runtime-config.ts         loadRuntimeConfig, getRuntimeConfig

packages/codegen/src/templates/boilerplate/powerhouse.config.json.ts
  └ `ph init` boilerplate template

docker/connect-entrypoint.sh
  └ PH_CONNECT_CONFIG_JSON → dist overrides (jq deep-merge, operator-wins)
```
