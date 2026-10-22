# Customizing Connect: contributor notes

Working on Connect's customization surface in this monorepo: the tools and the files behind it.

To customize Connect from a project, start from the [customize-connect skill](./skills/customize-connect/SKILL.md): its table maps each change to a guide in [`docs/customizing/`](./docs/customizing/), for people and coding agents alike. The skill is what ships with the package; keep it, not this file, as the index of the guides.

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
