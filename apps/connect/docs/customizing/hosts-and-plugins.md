# Hosts and plugins

A project runs Connect as one or more hosts (`hosts/<name>/host.js`). Each host picks its routes folder, its config and its plugins.

## Routes per host

Every host of a project mounts `hosts/connect/routes/` by default. A host picks another folder, or none, with `runner.routes`:

```js
// hosts/lab/host.js
export default {
  name: "lab",
  runner: {
    module: "@powerhousedao/ph-cli/runners/connect",
    routes: "hosts/lab/routes", // or false: Connect's routes only
  },
};
```

- The folder works like `hosts/connect/routes/`: `_app.tsx`, `_app/` and overrides of Connect's routes apply to that host only.
- `ph run lab dev` and `ph run lab build` generate its tree in `.ph/hosts/lab/routes.gen.ts`; `hosts/connect/routes/` keeps `.ph/connect-routes.gen.ts`.
- Only `hosts/connect/routes/` is offered to other Connects (see [Offer a package's routes](./packages.md#offer-a-packages-routes)) and type-checked by `ph build`.
- To type-check a host's folder, exclude it from the project's `tsconfig.json` and give it its own, which maps the route tree to its generated file:

  ```jsonc
  // hosts/lab/routes/tsconfig.json
  {
    "extends": "../../../tsconfig.json",
    "compilerOptions": {
      "noEmit": true,
      "incremental": false,
      // Replaces the project's paths: copy any others the routes import.
      "paths": {
        "@powerhousedao/connect/route-tree": ["../../../.ph/hosts/lab/routes.gen.ts"],
        "@powerhousedao/connect-core/route-tree": ["../../../.ph/hosts/lab/routes.gen.ts"]
      }
    },
    "include": [".", "../../../.ph/hosts/lab/routes.gen.ts"]
  }
  ```

## Host plugins

`hosts/connect/host.js` also lists `runner.plugins`, read by `ph run connect`. They transform the served runtime config through the plugin host in `@powerhousedao/connect-core` (its `src/plugins/plugin-host.ts`), which runs the built-in plugins Connect registers ([`apps/connect/src/plugins/`](https://github.com/powerhouse-inc/powerhouse/tree/main/apps/connect/src/plugins)): `@powerhousedao/connect/plugins/generic` (`allowAddDrive`, drive sections), `.../sentry`, `.../openpanel` and `.../assistant`. A listed plugin switches its slice of the config on, and an unlisted one switches it off. Other modules are skipped with a warning.

The generic plugin is also Connect's chrome: its sidebar, home screen and settings page. A composition that leaves it out shows core's views instead: a header, an index of the drives, a directory listing for a drive without a drive app, and a JSON view for a document without an editor. Without a declared composition, Connect is classic: every built-in plugin is active.

## A plugin's UI

A plugin definition's `ui()` loads what the plugin shows, only while the plugin is active (`ConnectPluginUi` in `@powerhousedao/connect-core/plugins`):

| Field | What it does |
| --- | --- |
| `routes` | Route options by route id, e.g. `"/_app/": { component: Home }`. They apply only while the route shows core's view, so a project's own route file wins. `staticData` merges over the route's. |
| `addRoutes` | Code routes, e.g. the generic plugin's settings tabs; a route at a path the tree already serves is skipped. |
| `modals` | Modal views by type, over core's. |
| `Root` | Rendered once beside the app. |
| `errorComponent` | Any route's loader or render error. |
| `commonEditors` | Keeps common's drive explorer and editors, which core leaves out. |
| `consent` | Needs the viewer's consent to analytics cookies; Connect shows one banner when any active plugin needs it (Sentry and OpenPanel do). |

- `loadRuntimeConfig` loads the active plugins' UI before the router exists; the router applies it once. Later plugins in the composition win.
- `shell` on a definition names the prerendered loading screen that shows its UI; a composition picks the shell of its first plugin that has one, else core's.
- The generic plugin's code lives in [`apps/connect/src/generic/`](https://github.com/powerhouse-inc/powerhouse/tree/main/apps/connect/src/generic), reached only through its `ui()`, so a composition without it doesn't download it. A project's route builds on it through `@powerhousedao/connect/generic` (or `/layout`).

