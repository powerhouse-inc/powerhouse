# Extend Connect from a package

## Offer a package's routes

A package's `hosts/connect/routes/` also adds routes to every Connect that loads the package, e.g. a Reports page or a settings tab, without code:

- Offered: every route file but `_app.tsx` and the files that override Connect's `_app/` routes. Those two only apply to the package's own host. A child of an override joins the loading Connect's route with that id.
- `ph build` builds them as `./connect-routes` (`dist/browser/connect-routes.js`), in the same build as the package, and sets `connectRoutes: true` in the package's manifest. A module both import, e.g. a store or a React context an editor and a route share, is one chunk, so they share its state. Connect loads the module when it loads a package with the flag, and takes the routes out when the package is removed, replaced or reinstalled.
- They join the loading Connect's routes by id (`/_app`, `/_app/settings`, `/_app/d/$driveSlug`, ...). A route at an id that Connect already serves is skipped with a warning; `staticData.nav` and `staticData.settings` list them as for a project's routes.
- A deep link or reload on a package's page waits for the package: Connect holds unknown paths while packages and their routes load (see [Not found](./overrides.md#not-found)).
- Removing a package while one of its pages is open takes the app home first.
- Bundled packages (`ph install --local`, `provider: "local"`) register in a production build through the page's import map, as on the dev server.
- An offered route imports `@powerhousedao/connect-core` (`ContentOutlet`, `useDriveRouteData`, `ModalDialog`), `@tanstack/react-router` and `@powerhousedao/reactor-browser`, which Connect shares with packages. `@powerhousedao/connect` is not shared, so `ph build` fails, naming the file, if an offered route imports it, or reaches a module that does. The rest of the package gets a warning: its build would bundle a copy of the Connect modules it uses, apart from the app's state.
- The project's own package is the exception: its host build already has its routes.
- The package's stylesheet styles its routes, as it does its editors; see [A package's styles](./styles-and-branding.md#a-packages-styles).

## Register routes from code

A package that Connect loads can also register routes from its own module. The registrations live in one registry per page, on `globalThis`, so a package bundled with its own copy of `@powerhousedao/connect-core` still reaches the app. A production build also shares `@powerhousedao/connect-core` and `@tanstack/react-router` through the import map, so the package and Connect use one router.

```tsx
import { registerConnectRoutes } from "@powerhousedao/connect-core/router";
import { createRoute } from "@tanstack/react-router";

// A settings tab; a router already running takes it in.
registerConnectRoutes(({ settingsRoute }) => [
  createRoute({
    getParentRoute: () => settingsRoute,
    path: "inventory",
    staticData: { settings: { label: "Inventory", order: 50 } },
    component: InventorySettings,
  }),
]);
```

- It returns the unregister.
- A route at a path a route already serves is skipped with a warning.
- Core's views are styled with Tailwind classes and `theme.css` tokens (`bg-core-bg`, `text-core-fg`, ...). Core ships no compiled CSS: its host builds with Tailwind 4 and imports `@powerhousedao/connect-core/tailwind.css`, which imports the tokens (`theme.css`) and makes Tailwind scan core's sources. `@powerhousedao/connect/tailwind.css` does this; see [Styles](./styles-and-branding.md#styles).

