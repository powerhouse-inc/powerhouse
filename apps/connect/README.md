# Powerhouse Connect

Open-source desktop and web application for document model management.
Interact, create, edit and manage documents with ease.

- Connect functions as a private editor & contributor tool for contributors of open organisations. It allows teams to manage internal documents with full control over the data ownership. Connect is available as stand-alone desktop application or in the cloud.
- Connect offers a navigation menu for adding, synchronising and browsing document drives that are shared within an organisation or are private to the contributor.
- Connect allows contributors to edit and work on different 'document model types' selected or defined by the organisation.

![app](./.github/app.png)

## Prerequisites

You can follow these instructions to setup a dev environment:

- Install [**Node (LTS)**](https://nodejs.org/en/download/)
- Clone this repository
- Run `npm install` to install dependencies

**Starting Connect**

```bash
pnpm start # start desktop app
# OR
pnpm run dev # start web app
```

After initialized, you can access the web app at `http://localhost:5173`.

**Create a packaged version of the desktop app**

```bash
pnpm run make # Create package for the current platform
pnpm run make:mac # Create package for Mac OSX
pnpm run make:linux # Create package for Linux
pnpm run make:windows # Create package for Windows
```

**Test Connect production deployment**

You can test the production deployment of Connect by running it in a Docker container linked to your local packages.

```bash
pnpm run docker:build # Build the Docker image, only needs to run once
```

Build the Monorepo packages before starting a container

```bash
pnpm build:all # Build the packages, needs to run before running the Docker container
```

Run the Docker container from `apps/connect/`:

```bash
pnpm docker:run # Run the Docker container
```

Connect will be available at: `http://localhost:4000/develop/powerhouse/connect`

## Runtime configuration

Connect's runtime settings (renown URL, package registry, default drives, log level, etc.) live in `powerhouse.config.json` rather than environment variables. See [runtime-config.md](./skills/customize-connect/references/runtime-config.md) for the full overview of how values are set, merged, and read by the SPA.

## Routes

Connect routes with [TanStack Router](https://tanstack.com/router) file routes. Core's routes live in `@powerhousedao/connect-core` (`packages/connect-core/src/routes/`): the root route, the pathless `_app` layout, and `/`, `/d/$driveSlug/{-$nodeSlug}`, `/settings` with its Appearance and Packages tabs, and the 404 catch-all `$` inside it. Connect's `src/routes/` has one file per core route: it spreads core's `options` and shows core's view, which the active plugins' UI replaces (the generic plugin draws the sidebar, home, drive views and its own settings tabs). `src/routeTree.gen.ts` is generated from them (`pnpm exec tsr generate`, or `vite dev`) and committed.

A project customizes Connect with file routes in `hosts/connect/routes/`, which `ph vetra`, `ph connect studio`, `ph connect build` and `ph build` mount beside Connect's routes in one router:

```
hosts/connect/routes/
├── _app.tsx                 optional: replaces Connect's layout
├── _app/
│   ├── reports.tsx          /reports, inside the layout
│   ├── d/$driveSlug.tsx     overrides Connect's drive view
│   └── settings/
│       └── reports.tsx      /settings/reports, a settings tab
└── hello.tsx                /hello, a full page without the layout
```

- A file in `_app/` renders inside the layout; its id starts with `/_app`, e.g. `createFileRoute("/_app/reports")`, and its URL does not.
- A file at one of Connect's route paths overrides it by spreading that route's `options` (`@powerhousedao/connect/routes/...`). A route outside `_app/` at one of Connect's URLs fails the build.
- `staticData.nav` lists a route in the sidebar, `staticData.settings` makes it a settings tab, and `staticData.sidebar` hides or collapses the sidebar on its page.
- `ph connect build` prerenders the project's layout into `index.html` as the loading screen, with `_app`'s `pendingComponent` as its content.
- The tree is generated into `.ph/connect-routes.gen.ts`, which types `createFileRoute`, `Link` and `useNavigate` with the project's routes.
- Without a routes folder, Connect uses its prebuilt route tree.

The [customize-connect skill](./skills/customize-connect/SKILL.md) indexes the task-by-task guides in [`references/`](./skills/customize-connect/references/), for people and coding agents. Contributor notes (UI screenshots and the files behind the customization surface) are in `apps/connect/CUSTOMIZING.md` in the Powerhouse monorepo; the published package leaves them out.

Code that does not build with Vite adds code routes with `registerConnectRoutes` from `@powerhousedao/connect/router`: it receives Connect's routes (`appRoute` for the layout, `rootRoute` for a full page, `settingsRoute` for a tab) and returns the routes to add; see [Extend Connect from a package](./skills/customize-connect/references/packages.md#register-routes-from-code).

## Troubleshooting

- For a complete list of _Electron Forge_ options and requirements, visit the [official docs](https://github.com/electron-userland/electron-forge#usage).

- If you're experiencing troubles with node-gyp on Windows 11, follow [this guide](https://devkimchi.com/2021/11/26/troubleshooting-node-gyp-package-on-windows11/).

- If you're experiencing troubles with node-gyp on older versions, check out [this guide](https://spin.atomicobject.com/2019/03/27/node-gyp-windows/).

- To use yarn via Windows PowerShell, check [this guide](https://bobbyhadz.com/blog/yarn-cannot-be-loaded-running-scripts-disabled)

- For any other issues, reach out to our discord server [`#ask-powerhouse-team`](https://discord.com/channels/815917281728659516/883285185595047937) channel for help.
