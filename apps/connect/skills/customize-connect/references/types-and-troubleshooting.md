# Types, troubleshooting and upgrading

## Types

The build generates `.ph/connect-routes.gen.ts`: the route tree of Connect's routes and the project's. It registers the router type, so `createFileRoute` ids, `Link`, `useNavigate`, loader data and search params are typed.

- `ph connect build`, `ph connect studio`, `ph connect preview` and `ph build` generate it. `ph connect studio` regenerates it as route files change.
- The project's `tsconfig.json` includes `.ph/connect-routes.gen.ts` and maps both `"@powerhousedao/connect-core/route-tree"` and `"@powerhousedao/connect/route-tree"` to `["./.ph/connect-routes.gen.ts"]` in `paths`. New projects are scaffolded with them. In an older project, add them by hand, and drop `.ph` from `exclude`. Core's router types name the tree by `@powerhousedao/connect-core/route-tree`; without that path they use core's own routes.
- Until the first build, both specifiers resolve to core's own tree. Project routes show type errors (unknown route ids) until `ph connect build` or `ph connect studio` has run.
- `ph connect build` type-checks the routes and fails on errors. `--ignore-type-errors` skips the check.
- `@tanstack/react-router` is the project's own copy, which Connect uses too: keep the version `ph init` or `ph migrate` set. The routes and Connect share one router, and its types come from that copy.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Connect could not mount the routes in hosts/connect/routes/` | A route outside `_app/` collides with one of Connect's, or two project files have one path. The message names the files. |
| `tsc` reports `TS2883: The inferred type of 'Route' cannot be named without a reference to 'ConnectRouterContext'` | The route tree hasn't been generated yet. Run `ph build` (or start Studio) once; the error goes with the unknown route ids. |
| `createFileRoute("/_app/x")` is a type error | The tree is not generated yet, or the tsconfig lacks the `route-tree` path. See [Types](#types). |
| A sidebar link reloads the whole app | It is a plain `href`. Navigate through the router; see [Replace the sidebar](./layout.md#replace-the-sidebar). |
| A `staticData.nav` route is missing from the sidebar | Its path has a param, or it is not in `_app/`, or a replaced layout does not render `SidebarNavItems`/`useNavRoutes`. |
| A route's search param is gone after navigating | Only global params survive a navigation. Pass the param in `search` on the link. |
| A loader sees no drive on a deep link | The drive has not arrived yet; see [Load data](./data-and-navigation.md#load-data). |
| A class has no effect, e.g. `pl-7` next to `px-3` | `style.css` imports a second Tailwind build, such as `@powerhousedao/connect/style.css`. Import `@powerhousedao/connect/tailwind.css` instead, or run `ph migrate`; see [Styles](./styles-and-branding.md#styles). |
| A package's `dist/style.css` is hundreds of KB, or a host's `@theme` values revert to the defaults once the package loads | The package was built before packages left Connect's CSS out: its stylesheet is a full Tailwind build, whose tokens outrank the host's. Rebuild it with `ph build` and publish it; see [A package's styles](./styles-and-branding.md#a-packages-styles). |
| A package's token or rule works in its own Connect but not in another | It is in `hosts/connect/style.css`, which `ph build` leaves out. Move what the package's editors and routes need to `style.css`. |
| A host's token override doesn't reach a package's classes | The page emits only the tokens its own classes use. Override it in `@theme static` in the host's stylesheet; see [Styles](./styles-and-branding.md#styles). |
| Installing a package re-themes Connect | The package's `style.css` sets Connect's tokens or global rules, which ship in its stylesheet. Move them to its `hosts/connect/style.css`; `ph migrate` moves Connect's token overrides, or warns about what it can't move. |
| `ph build` fails: `./theme.css` is not exported from `@powerhousedao/connect` | The project's `@powerhousedao/connect` is older than `ph-cli`. Update it to the same version. |
| You want to see the route tree, matches and loader state | Studio shows TanStack's router devtools when the page has `?devtools=1`, or after `localStorage.setItem("ph:router-devtools", "1")`. They are off by default and never in a build. |

## Upgrading

`ph migrate` updates a project for this version:

- `style.css` imports `@powerhousedao/connect/tailwind.css` instead of `@powerhousedao/design-system/theme.css` and `@powerhousedao/connect/style.css`. The project's own rules stay.
- `tsconfig.json` includes `.ph/connect-routes.gen.ts`, the generated tree that types the project's routes.
- `style.css` drops the `@import './node_modules/<package>/dist/style.css'` lines that `ph install --local` added. Connect loads a bundled package's stylesheet with its code.
- `hosts/connect/style.css` holds this Connect's theme; `ph migrate` creates it. A project that themed Connect in `style.css` (`--primary` on `:root` and `.dark`, say) re-themes every Connect that installs its package until the overrides move. `ph migrate` moves Connect's token overrides there when the host's file is new or empty, and otherwise warns with the rules and tokens to move by hand; see [Styles](./styles-and-branding.md#styles).
- A Tailwind host that imported `@powerhousedao/connect-core/theme.css` for core's classes imports `@powerhousedao/connect-core/tailwind.css`. `theme.css` now holds only core's tokens. `@powerhousedao/connect/tailwind.css` does this already.

A package rebuilt with `ph build` ships only its own classes and rules (see [A package's styles](./styles-and-branding.md#a-packages-styles)). Republish packages so the Connects that load them keep one Tailwind build per page.

Two `@powerhousedao/reactor-browser` types lost a member, which a project that used them updates by hand:

- `PHModal` has no `missingPackage` modal.
- `PHGlobal` has no `revisionHistoryVisible`. `useRevisionHistoryVisible`, `showRevisionHistory` and `hideRevisionHistory` work as before.

Editors receive `document` and `dispatch` as props. For TypeScript users this is breaking:

- `EditorModule`'s type parameters are now `<TDocument, TAction, TProps>`. A module typed `EditorModule<{ ...props }>` moves its props to the third parameter.
- A host that renders an `EditorModule`'s `Component` must pass `document` and `dispatch`, and should wrap it in `EditorDocumentProvider` (see [Render an editor or a drive app yourself](./data-and-navigation.md#render-an-editor-or-a-drive-app-yourself)).
- An editor whose component takes only its own props must share one with what hosts pass (`documentId`, `context`, `displayToolbar`), or take `EditorProps`.
- `ph generate` writes editors that read `document` and `dispatch` from props. A package with such an editor needs a Connect with this change: older Connects pass neither prop. Editors that use the `useSelected<Model>Document()` hooks keep working in every Connect.

In 6.2.3 dev prereleases only, `RouteSelection` and scoped PH stores (`createScopedPHStore`, `isScopedPHStore`) are gone. Drive apps read the route through `DriveProvider`, editors through `EditorDocumentProvider`, both from `@powerhousedao/reactor-browser`.

The generic plugin's UI moved behind the plugin, which a project's routes follow by hand:

- `AppLayout`, `ConnectSidebar`, `SidebarDriveItems`, `SidebarNavItems` and `OpenDocument` import from `@powerhousedao/connect/generic`, not `/layout`.
- `@powerhousedao/connect/route-views` exports only `ConnectRoot`; `Home` (and its parts), `DriveLayout`, `NodeView`, `DrivePending` and `SettingsPage` import from `/generic`.
- `generic()`, `genericActive`, `IfPlugin` and `useIsPluginActive` are gone; a plugin's `ui()` provides its views.
- Connect's About, AI Assistant, Danger Zone, Default Editors and Package Manager tabs are the generic plugin's code routes, so `@powerhousedao/connect/routes/_app/settings/<tab>` no longer exists for them. An override imports the tab's options as `genericSettingsTabs["<tab>"]` from `@powerhousedao/connect/generic` instead; links to these tabs are untyped, so use `useLinkProps({ settings: "<tab>" })`.

