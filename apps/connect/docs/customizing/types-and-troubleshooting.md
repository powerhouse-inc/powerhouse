# Types, troubleshooting and upgrading

## Types

The build generates `.ph/connect-routes.gen.ts`: the route tree of Connect's routes and the project's. It registers the router type, so `createFileRoute` ids, `Link`, `useNavigate`, loader data and search params are typed.

- `ph connect build`, `ph connect studio`, `ph connect preview` and `ph build` generate it. `ph connect studio` regenerates it as route files change.
- The project's `tsconfig.json` includes `.ph/connect-routes.gen.ts` and maps both `"@powerhousedao/connect-core/route-tree"` and `"@powerhousedao/connect/route-tree"` to `["./.ph/connect-routes.gen.ts"]` in `paths`. New projects are scaffolded with them. In an older project, add them by hand, and drop `.ph` from `exclude`. Core's router types name the tree by `@powerhousedao/connect-core/route-tree`; without that path they use core's own routes.
- Until the first build, both specifiers resolve to core's own tree. Project routes show type errors (unknown route ids) until `ph connect build` or `ph connect studio` has run.
- `ph connect build` type-checks the routes and fails on errors. `--ignore-type-errors` skips the check.
- `@tanstack/react-router` must be the version Connect uses. The routes and Connect share one router, and its types come from the project's copy.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `Connect could not mount the routes in hosts/connect/routes/` | A route outside `_app/` collides with one of Connect's, or two project files have one path. The message names the files. |
| A new routes folder is ignored by a running `ph connect studio` | Connect checks for the folder at startup. Restart it. |
| `createFileRoute("/_app/x")` is a type error | The tree is not generated yet, or the tsconfig lacks the `route-tree` path. See [Types](#types). |
| A sidebar link reloads the whole app | It is a plain `href`. Navigate through the router; see [Replace the sidebar](./layout.md#replace-the-sidebar). |
| A `staticData.nav` route is missing from the sidebar | Its path has a param, or it is not in `_app/`, or a replaced layout does not render `SidebarNavItems`/`useNavRoutes`. |
| A route's search param is gone after navigating | Only global params survive a navigation. Pass the param in `search` on the link. |
| A loader sees no drive on a deep link | The drive has not arrived yet; see [Load data](./data-and-navigation.md#load-data). |
| A class has no effect, e.g. `pl-7` next to `px-3` | `style.css` imports a second Tailwind build, such as `@powerhousedao/connect/style.css`. Import `@powerhousedao/connect/tailwind.css` instead, or run `ph migrate`; see [Styles](./styles-and-branding.md#styles). |

## Upgrading

`ph migrate` updates a project for this version:

- `style.css` imports `@powerhousedao/connect/tailwind.css` instead of `@powerhousedao/design-system/theme.css` and `@powerhousedao/connect/style.css`. The project's own rules stay.
- `tsconfig.json` includes `.ph/connect-routes.gen.ts`, the generated tree that types the project's routes.

Two `@powerhousedao/reactor-browser` types lost a member, which a project that used them updates by hand:

- `PHModal` has no `missingPackage` modal.
- `PHGlobal` has no `revisionHistoryVisible`. `useRevisionHistoryVisible`, `showRevisionHistory` and `hideRevisionHistory` work as before.

The generic plugin's UI moved behind the plugin, which a project's routes follow by hand:

- `AppLayout`, `ConnectSidebar`, `SidebarDriveItems`, `SidebarNavItems` and `OpenDocument` import from `@powerhousedao/connect/generic`, not `/layout`.
- `@powerhousedao/connect/route-views` exports only `ConnectRoot`; `Home`, `DriveLayout`, `NodeView`, `DrivePending` and `SettingsPage` import from `/generic`.
- `generic()`, `genericActive`, `IfPlugin` and `useIsPluginActive` are gone; a plugin's `ui()` provides its views.
- Connect's About, AI Assistant, Danger Zone, Default Editors and Package Manager tabs are the generic plugin's code routes, so `@powerhousedao/connect/routes/_app/settings/<tab>` no longer exists for them. An override imports the tab's options as `genericSettingsTabs["<tab>"]` from `@powerhousedao/connect/generic` instead; links to these tabs are untyped, so use `useLinkProps({ settings: "<tab>" })`.

