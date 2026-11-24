# ADR 0009 — DevTools: a development-only dock, added as a dev-server plugin

- **Status:** Proposed
- **Date:** 2026-11-19
- **Deciders:** Yasiel Cabrera
- **Implements:** branch `vetra/devtools-base-phase-one`, the dev-server plugin contract, the package, the shell, the loopback API and the read-only Build pages

## Context

DevTools is a dock that floats over a running Connect and shows the project it serves. It is
separate from the Vetra Studio drive app, which stays as it is.

Facts about the current code that the decision depends on:

- **Hosts already have plugins.** A host lists entries in `runner.plugins`, each with a module, an
  `enabled` switch and the verbs it is active for. `resolveHostPlugins` in host-core loads them from
  the project's dependencies, and the switchboard runner calls their hooks. The Connect runner did
  not load them in Node: it handed the list to the browser, which runs only the plugins Connect
  itself contains.
- **A Connect composition changes the app.** A declared `runner.plugins` replaces Connect's default
  composition. An entry added there for a tool would switch the app from the default composition to
  a declared one.
- **Nothing let a package add to the dev server.** `runConnectStudio` builds its Vite config from
  `getConnectBaseViteConfig` and does not read a project's own Vite config.
- **Project code shares the app's modules.** A module of the project that imports React,
  `@powerhousedao/reactor-browser` or `@powerhousedao/connect/router` gets the app's own copies in a
  dev server: a project's editors and routes depend on it.
- **Connect has a public route registry.** `registerConnectRoutes` in connect-core adds routes to a
  running router, and reactor-browser's hooks read the app's state from `window.ph` outside
  Connect's React tree.
- **A served config can be changed after the build.** `docker/connect-entrypoint.sh` merges
  `PH_CONNECT_CONFIG_JSON` into the built `powerhouse.config.json`, and any static server can serve
  an edited copy. A switch in that file is a switch an operator can turn.
- **A project can build with its own Vite config.** It calls `getConnectBaseViteConfig` and passes
  Vite's mode through, so a build is not always in `production` mode.
- **Every Connect dev server starts in `runConnectStudio`.** `ph vetra`, `ph connect studio` and the
  Connect runner of `ph run <host> dev` all call it. Until hosts get a production runtime, the
  runner's `run` verb starts the same dev server as `dev`.
- **A build precaches every script.** The service worker's `BASE_PRECACHE.globPatterns` in
  `packages/builder-tools/connect-utils/vite-plugins/pwa.ts` match every `.js` and `.css` file of the
  output, lazy chunks included.
- **The design system maps tokens with `@theme inline`.** Utilities such as `bg-background` read
  `var(--background)` where they are used, so a scoped value of the same variable restyles them.
  `packages/design-system/theme.css` declares `@custom-variant dark (&:where(.dark, .dark *))`.
- **Router hooks need the router provider.** reactor-browser's `setSearchParams` goes through the
  app's navigation instead, so it works outside the provider.
- **Connect already reads `?devtools=1`.** `apps/connect/src/components/router.tsx` shows TanStack's
  router devtools for it.
- **Vite reloads every open tab at once.** `ph generate` causes such reloads while it writes files.

A spike on 2026-11-19 tested the points marked "Tested" below, in `test/vetra-e2e` and
`test/versioned-documents`.

## Decision

Core gets one extension point: a Connect dev server loads dev-server plugins. DevTools is a new
package, `@powerhousedao/devtools`, that is one such plugin. No core package holds DevTools code,
and another tool is added the same way, without a change to core.

### 1. Dev-server plugins: the extension point

A dev-server plugin is a host plugin, as host-core defines one, with one hook:

```ts
interface ConnectDevHooks<TVitePlugin> {
  devServer(context: ConnectDevServerContext): TVitePlugin[] | Promise<TVitePlugin[]>;
}

interface ConnectDevServerContext {
  projectRoot: string;
  run: () => ConnectDevRun; // read at each call
}

interface ConnectDevRun {
  tool: { name: string; version: string }; // the tool that runs the dev server
  startedAt: string | null;
  services: Record<string, string>; // a URL by service name, for example `switchboard`
}
```

The hook returns Vite plugins, so a plugin can add middleware, tags in the page and modules the
page loads. The contract is in host-core (`src/connect-dev.ts`, exported from the package root),
which does not depend on Vite. The
context holds only what the CLI knows and a plugin cannot find out: the project's folder and the
facts of the run. It names no tool and carries no tool's types. ph-cli fills `run` with
`readDevRun`.

A host lists these plugins in `runner.devPlugins`, with the entry shape of `runner.plugins`. They
are a list of their own because a Connect composition changes the app, and a tool of the dev server
must not. `resolveConnectDevPlugins` in ph-cli resolves the entries with `resolveHostPlugins`:

- A host's entries resolve from the project's dependencies.
- `DEFAULT_CONNECT_DEV_PLUGINS`, which names `@powerhousedao/devtools/connect`, resolves from the
  CLI's own dependencies. That list is the one place in core's code that names DevTools.
- A host entry with a default plugin's module replaces it, so `enabled: false` turns it off. Such
  an entry still resolves from the CLI's dependencies.
- A default plugin that cannot load, or whose hook fails, is left out with a warning, and the dev
  server starts without it. A host's own plugin that fails stops the start and names the host
  file.
- Only `runConnectStudio` calls the resolver, and it hands the plugins to Vite's `createServer`.
  So a hook's Vite plugins reach a dev server and never a build or a preview.

Every Connect dev server gets DevTools this way, a custom Connect host included, with no change to
a host file and no migration. A project that runs Vite with its own config adds DevTools' Vite
plugin itself (section 5).

### 2. Only the `dev` verb

In the Connect runner, `dev` and `run` start the same Studio through `startStudio`. `dev` passes
the host's `devPlugins` to `runConnectStudio` and `run` passes none, so `run` loads no dev-server
plugin. `ph vetra` and `ph connect studio` load the default ones. `PH_DEVTOOLS=0` turns DevTools off
for one run, and so does `NODE_ENV=production`: its Vite plugin's `apply` reads both through
`devtoolsRequested`.

### 3. Development only, by construction

A DevTools in production is a security risk, as in other frameworks, so it ships in development
only (decided on 2026-11-19).

No build and no production server loads a dev-server plugin, and nothing else refers to DevTools:
Connect, builder-tools and ph-run do not import it, list it or style it. So a build cannot contain
it, and there is nothing to strip. Within the dev server:

- The DevTools Vite plugin applies to Vite's `serve` command, not to a build and not to
  `vite preview`, so a project that lists it in its own Vite config builds without it. The
  resolver runs only for a dev server (section 1).
- Under `NODE_ENV=production` the Vite plugin does not apply, whatever the command.
- The page shows DevTools only when it carries the token the plugin put there (section 7). The
  token is also the API's key, so a page with DevTools always has an API to ask.
- `createDevtoolsServer`, for a dev server that is not Vite's, throws under
  `NODE_ENV=production`.

### 4. The page side comes with the plugin

The Vite plugin adds a module script to the page. The dev server serves that module as one of the
project's own, so its imports resolve as the project's code does. For a Connect host the module:

- Calls `mountDevtools()`, which draws the dock.
- Registers the standalone page's path with `registerConnectPage`, a helper connect-core gained
  for any tool: a page below the root route, outside the app's layout. The route renders nothing
  itself: it tells the mounted DevTools to show the page while Connect's router is on it.
- Tells the mounted DevTools how far the assistant's button reaches into the corner the launcher
  rests in.

What the app knows does not come through this module (section 5).

DevTools renders in its own React root, inside an error boundary, so a DevTools failure cannot
replace the app: DevTools goes away and the console says why.

### 5. One way to mount: `mountDevtools`

`mountDevtools` from `@powerhousedao/devtools/mount` renders in a shadow root, with DevTools' own
compiled stylesheet and its own copy of React. The page's styles and DevTools' do not reach each
other, and the page needs neither React nor Tailwind. It shows the dock, and the standalone page
when the location is that page's path. It returns undefined and does nothing on a page without a
token. Its handle takes later options through `update`. `surface: "page"` among them shows the
page wherever the location is, for an app whose router keeps the location to itself.

A page has one DevTools. The mount is kept on the page under a `Symbol.for` key, because the
module can load twice: once as the dev server serves it and once as the app's own bundler does.
The dev server's module mounts DevTools before the app's code runs, so a later
`mountDevtools(options)` lays its options over that mount and returns the same handle. An app
that is not Connect passes its `appSource` or its `target` that way.

The token tag also names the dev server's base path, so `mountDevtools()` needs no option. The API
path, the page path and the open-in-editor path follow from that base. A `base` option goes ahead
of the tag's.

The links between the app and the standalone page do not load the page again. "Open standalone"
pushes the page's path and "Back to app" goes back one entry, so the app keeps running and returns
to where it was, with the dock as it was. A router that patches `pushState` follows, as TanStack
Router does. An app with another router gives `navigate`, which may answer a promise when the URL
changes later. A click with a modifier is left to the browser, for a new tab.

The dock and the page are one element with one state. What DevTools holds, such as the project it
read or a launcher put away until reload, stays when it moves between the two.

`DevtoolsApp` is what the app around DevTools offers: `loadedModules`, `notifyError`,
`removeSearchParam` and `navigate`. Each has a fallback. The pages read it from the shell and from
nowhere else.

DevTools gets it from an `AppSource`: a `read` and a `subscribe`. The default one,
`powerhouseAppSource`, reads `window.ph` and listens for the page's `ph:<key>Updated` events. That
is the contract reactor-browser keeps for a second copy of itself on a page, so the source imports
no app code and works on any page of a Powerhouse app, Connect or not. A page without `window.ph`
gives nothing, and DevTools falls back. Another kind of app passes its own `appSource`, or an `app`
object whose members go ahead of the source's.

| Host | How it gets DevTools |
| --- | --- |
| A Connect dev server started by `ph` | Nothing to do (section 1) |
| A Connect project with its own Vite config | `devtoolsVitePlugin({ client: "connect" })` from `@powerhousedao/devtools/server` in its `plugins` |
| A Vite app that is not Connect | `devtoolsVitePlugin()` from `@powerhousedao/devtools/server` |
| Any other dev server | `createDevtoolsServer()` on the server, `mountDevtools()` in the page |

Tested: on a plain page with its own `button` and `*` rules, served by a bare Node server,
DevTools renders with its styles, its popups and its dark theme, and the page's button keeps its
own.

### 6. Location in browser storage, one per tab, and a share link

Each tab saves where DevTools is and whether the dock is open. DevTools writes nothing to the URL
and adds no history entry.

`stored` in `packages/devtools/src/lib/stored.ts` keeps one value under `ph-devtools:<key>`, in one
of two scopes:

- **`preference`** is one value for every tab, in localStorage. A change in one tab shows in the
  others through the `storage` event. The dock side, the dock sizes, the list widths, the
  launcher corner and the panels pinned to the launcher use it.
- **`tab`** is the tab's own value, in sessionStorage, so it survives a reload of that tab. Each
  write also saves it in localStorage, and a tab with no value starts from that one. The view uses
  it: `ph-devtools:view` holds the open flag, the panel, the tab and the focus.

The view is per tab because of the Vite reloads: with one value for every tab, each reload would
bring every tab back as the last one left it. A value that does not parse reads as the fallback.
Where storage is blocked or full, the value lives in memory until the page reloads.

`?ph-devtools=<panel-id>` is the share link. On load, DevTools opens on that panel and saves it as
the tab's view. It then removes the param through `app.removeSearchParam`, which Connect fills with
a replace through `setSearchParams`, so Connect's router stays in sync and the tab's history gets
no entry. Without it, DevTools replaces the URL itself.

- An unknown panel opens the default one.
- A bare `?ph-devtools` opens DevTools where the tab left it.
- The link names a panel, not a tab or a focus.
- In Connect, like every search write through the router, the replace drops the URL's hash.
- The param is not in `GLOBAL_SEARCH_PARAMS`, so Connect drops it on its next navigation when
  DevTools does not load.

Tested in `test/vetra-e2e/tests/devtools-shell.spec.ts`: opening, changing page and closing leave
the URL and the history alone. Reload, Connect navigation and Back keep the dock open. A new tab
starts where the last one was, and after that each tab keeps its own. The share link works on `/`,
on a drive's page and on the standalone page.

### 7. A loopback API on the dev server

The dev server answers `/__ph/devtools/api/*` (`DEVTOOLS_API_PATH`), below its base path and at the
bare path. The package's `./server` entry owns the routes and the guards in
`createDevtoolsApiHandler`, and the two ways to serve them:

- **`devtoolsVitePlugin()`** is the Vite plugin: the API as middleware, the token tag and the
  page's module. The Connect plugin (`./connect`) returns it from its `devServer` hook.
- **`createDevtoolsServer()`** is for a dev server that is not Vite's. It returns a Node
  `(req, res, next)` handler and the tag for the page's `<head>`.

Both need only the project's folder, and make the project reader themselves (section 13). A
server that knows more passes it: `run`, with the shape of `ConnectDevRun`, and for
`createDevtoolsServer` the app's address. Both also take a `project` reader in place of their own,
for a test or a host that reads a project another way. The package depends on no CLI package.

The API reads project files, so it answers only the page this dev server served, in a browser on
this machine. Every route checks three things, modelled on the Reactor Monitor's controller in
`apps/reactor-monitor/src/server/http.ts`:

| Guard | Check | What it stops |
| --- | --- | --- |
| `loopbackHost` | A loopback socket, no header a proxy adds, and a loopback host on the port that socket accepted on. The host is `Host`, or `:authority` over HTTP/2 | DNS rebinding, a LAN client when the server listens on every interface (`--host`), and a proxy or tunnel on this machine that forwards for a client elsewhere |
| `sameOrigin` | `Origin` and `Sec-Fetch-Site` name the page's own origin | A script on another local origin, another loopback port included |
| `tokenMatches` | `x-ph-devtools-token` equals a per-process token | A caller that never loaded the page |

The plugin makes the token once per process with `createDevtoolsToken` and delivers it in a
`<meta name="ph-devtools-token">` tag. A restart after a config change keeps the token, so an open
tab keeps working. The tag is the only way a page gets a token: `DevtoolsProps` has no token prop,
so there is one way to turn DevTools on. A page the Vite plugin sends over a socket that is not
loopback gets neither the tag nor the module, so a device on the LAN sees the app without
DevTools.

Every route is a `GET`. `info` returns `DevStackInfo`, and four `project` routes return what the
project's code holds (section 12). Behind a forwarded port, a proxy or another name for this
machine the API refuses, and the page says to open the app at `localhost`. The page stops asking
after that refusal: the address it was reached at does not change while it stays open.

### 8. Its own stylesheet, in a shadow root

DevTools does not use the host's Tailwind build. `standalone.css` builds its whole stylesheet at
package build time: Tailwind's reset and utilities, the design system's token map, and
`tailwind.css`, which sets the values of those tokens under `.ph-devtools` for light and
`.dark .ph-devtools` for dark. `mountDevtools` adopts it in its shadow root. A shadow root's
stylesheet cannot register `@property` rules, so the build (`css-text.mjs`) gives each registered
property its initial value on every element of the shadow tree, in Tailwind's `properties` layer,
as Tailwind's own fallback does. DevTools adds nothing to the document's stylesheets: registering
its `--tw-*` properties there would change an app that uses the same names another way. Base UI
popups mount in a portal container inside that root, through `DevtoolsPortalProvider` and
`useDevtoolsPortal`.

So the app's stylesheet holds no DevTools CSS, in development or in a build, and neither side's
rules reach the other.

DevTools follows a `dark` class on `<html>`, as Connect sets it, or the `theme` option. It has no
toggle of its own.

### 9. UI stack

- **Base UI** (`@base-ui/react`) is the one new dependency, kept inside the package.
- **No state library.** Data comes from hooks and the API. Shell state is a context over `stored`
  values (section 6).
- **Its own types.** The API's and the snapshot's types are in the package (`src/api.ts`,
  `src/project-types.ts`). From host-core it takes only the plugin contract (section 1). What it
  needs from the app comes through `DevtoolsProps.app` (section 5).
- **Layers that point one way.** `lib`, then `ui`, then `shell`, then `build`, then `overview`.
  The shell knows no panel: `src/registry.tsx` gives it the panels, the provider they share and
  why they have nothing to show. `test/layers.test.ts` fails on an import that points up.
- **One poller.** The project and the stack are each asked through `Poller` (`src/lib/`): one
  request at a time, none while the page is hidden.
- **Animations are CSS in the package.** Transitions key off Base UI's `data-[starting-style]` and
  `data-[ending-style]` attributes. The package does not use `tw-animate-css`.

### 10. Shortcuts

`Alt+Shift+D` toggles DevTools, and `Alt+Shift+K` opens its palette. DevTools does not listen for
`Cmd+K` or `Ctrl+K`, so the app and a project's own shortcuts keep them. A key typed into a field
of the app is left to the field: on macOS these keys type characters. A key typed into a field of
DevTools stops at its shadow root, so the app's listeners do not take it for a key typed outside
any field. The shortcuts listen in the capture phase and still see it. The shortcuts are constants
in 6.3.

### 11. Pages

Project › Overview shows `GET info`. The Build section has Document models, Editors, Drive Apps,
Subgraphs and Processors. The registry is a static list in the package (`src/registry.tsx`); the panel API
that lets a project add its own waits for 6.4.

### 12. Build reads the project's code, and only reads it

Build shows the modules whose code is in the project folder. It does not read the Vetra drive, the
spec documents or the switchboard, and it has no control that creates, edits or deletes a module.
A developer does that with `ph generate`, by hand, or in Vetra Studio, and the page shows the
result. An empty page names the `ph generate` command for its kind.

An earlier iteration listed and edited the spec documents of the Vetra drive, embedded the
document-model editor, and read generation status from a studio subgraph. It was dropped before
merge: it tied DevTools to Vetra Studio, which is due to be removed, and it showed what the specs
said, not what the code was.

Four routes carry the data. Their types are in `packages/devtools/src/api.ts`.

| Route | Answers |
| --- | --- |
| `GET project` | `ProjectSnapshot`: every document model, editor, drive app, subgraph and processor, each with its checks, and the diagnostics that belong to no one module |
| `GET project/document-models/<type>` | `ProjectDocumentModelDetail`: every version's state, modules, and operations with input schema, errors and examples |
| `GET project/files` | `ProjectFileList`: the files of each editor, drive app, subgraph and processor |
| `GET project/files/<path>` | `ProjectFileText`: the text of one file, up to 256 KiB |

The text route answers only a path that `project/files` lists at the same revision. Any other
path, `package.json` or `../x` included, is `not_found`, and so is a listed file whose real path
leaves the project.

Each section of the snapshot is read on its own. One that fails answers `{ ok: false, message }`,
and the others still answer.

### 13. The reader lives in DevTools

Reading a project's modules for the Build pages is DevTools' own work. `createProjectReader`
(`packages/devtools/src/server/project/`) implements `ProjectReader`, and the snapshot types are in
`packages/devtools/src/project-types.ts`. The `./server` entry exports the reader. It loads
ts-morph and the definition tooling on the first request, which the launcher makes when a page
loads, so a dev server no page was opened on does not pay for them. A read that failed stays the
answer for its revision: it is tried again when the files change or after a few seconds, not at
every poll.

The reader is built on two loaders that ph-cli's own commands also use. They are in the packages
that own what they read, so DevTools and ph-cli share one copy and DevTools does not depend on
ph-cli:

- `readProjectDefinitions` is in `@powerhousedao/codegen/utils`.
- `schemaFirstSource` is in `document-model/tooling`.

An earlier iteration kept the reader in ph-cli and its types in host-core, as a service for every
dev-server plugin. It was dropped before merge: the service had one user, its types were shaped by
that user's pages, and another tool would have had to take that shape or change core.

What the reader reads:

- **Document models** come from `readProjectDefinitions`, the loader behind `ph model check` and
  `ph model inspect`. It reads both layouts: a stored `<name>.json` specification and a code-first
  `index.ts`. A code-first model is evaluated in the dev server's process, in a private Vite
  server, with a time limit.
- **Editors, drive apps, processors and subgraphs** come from the ts-morph readers in
  `@powerhousedao/codegen/utils` (`getEditorMetadata`, `getProcessorMetadata`,
  `getSubgraphMetadata`). A drive app is an editor for one of the drive document types, which
  `src/drive-types.ts` lists as reactor-browser does. A field the code does not state is null; the
  reader does not guess it.
- **Files** are listed per module, without dot-files, keys or certificates, which Vite's own
  `server.fs.deny` keeps from the browser too. A symlink is listed only when its target passes the
  same filters. A file's text is served only for a listed path.
- **Checks** say whether a module is registered in its barrel file, listed in
  `powerhouse.manifest.json` under the same name, and names document types the project has. A
  model also carries the result of the document model checks. The manifest is only checked, never
  used as the source: `ph generate` is its one writer, so it can be stale.

The reader writes nothing and prints nothing.

### 14. Fresh by polling a revision

The reader fingerprints the module folders, the manifest and the config (path, size and
modification time of each file). That revision is the `ETag` of every `project` answer. The handler
asks for it before it answers `GET project` and returns `304` to a caller that already has it, so an
unchanged project costs one directory walk and no read. The reader builds once per revision. A read
stopped at its time limit is not started again while the module it was evaluating still runs; a
change to the files starts a new one.

The page polls `GET project` every two seconds while it is visible. It keeps the last good answer
when a poll fails. A module written by `ph generate` shows about a second after the command ends,
with no reload.

A file watcher was rejected. It has a lifecycle to manage across dev server restarts and can miss
an event. The walk is stateless and cannot be stale.

"Loaded in this tab" is joined in the browser, from `app.loadedModules`. A host that does not
give it gets no such check. A file's path
opens the file in the developer's editor through Vite's own `/__open-in-editor`, or through the
host's `openInEditorUrl`.

A page served before the dev server restarted holds a token the new server refuses. Such a page
stops polling and asks for a reload. A server that cannot be reached is polled until it answers.

## Consequences

### Positive

- A project gets DevTools on `ph vetra`, `ph connect studio` and `ph run <host> dev` with no change
  to its files, a custom Connect host included.
- Core holds no DevTools code. Removing DevTools is one entry in `DEFAULT_CONNECT_DEV_PLUGINS`, one
  dependency of ph-cli and its tsconfig reference, and the lists every workspace package is in.
- Another tool is a new entry in `runner.devPlugins`. It gets the project's folder, the facts of
  the run and the same ways into the page, with no change to core. It reads what it needs itself.
- ph-cli holds no code that reads a project for DevTools. What it has for DevTools is the generic
  plugin resolver and one entry in a list.
- DevTools shows what a Powerhouse app knows on any page that has `window.ph`, with no code that
  is Connect's.
- A build cannot carry DevTools: nothing a build resolves refers to it.
- DevTools never shows without its API: the token is both the switch and the API's key.
- A host turns DevTools off in its host file, with `enabled: false`.
- Build works in every Connect dev server. It needs no Vetra drive and no switchboard.
- Build shows the code that runs, with its registration and manifest checked, for stored and
  code-first document models alike.
- A DevTools failure leaves the app running.
- The app's stylesheet and DevTools' do not reach each other.
- DevTools leaves the app's URL and history alone, apart from removing its share param.

### Negative / risks

- **The desktop window gets no DevTools.** `ph run desktop dev` opens the native window, and the
  `ph-desktop-shell` crate starts the stack with `ph run <host>`, where the Connect member serves
  the built Connect. Showing DevTools there needs the crate to start Connect at `dev`. Until then
  a desktop project develops in a browser with `ph run connect dev`.
- **A link cannot point inside a panel.** The share link names a panel, not a tab or a selected
  module.
- **Apps on one origin share the saved values.** Two projects served at the same `localhost` port
  share the last view. An unknown panel or focus falls back to the default.
- **ph-cli depends on `@powerhousedao/devtools`.** The default plugin resolves from the CLI's
  dependencies, so every install of the CLI has the package.
- **A dev-server plugin runs in the dev server's process.** A plugin a host lists runs with the
  developer's rights, as a Vite plugin in a project's own config does.
- **The launcher's room for the assistant's button is a copy.** `src/client/connect.tsx` keeps
  the button's reach (4.5rem) from the classes of reactor-browser's `ReactorChatFab`. A change to
  the button needs the same change there, or the launcher overlaps it.
- **The page module depends on Connect's public router.** It imports
  `@powerhousedao/connect/router`, so a change to that export breaks it at the next dev server
  start, not at build time.
- **The API is unavailable off loopback.** A forwarded port, a proxy, a tunnel, a container or a
  page loaded from `file://` shows DevTools without project data. A device on the LAN gets no
  DevTools at all. The guards cannot tell a browser from a proxy on this machine that rewrites
  the host to `localhost` and adds no forwarding header: such a proxy gets the page, the token
  and the API, as it already gets what Vite serves.
- **DevTools loads a second React.** The mount's bundle is about 690 kB, in development only. It
  needs a browser with shadow roots and constructable stylesheets.
- **Panels see one process.** A panel for the switchboard's logs or its reactor needs a plugin of
  the switchboard host too; the Connect dev server's hook reaches only its own process.
- **Build cannot change the project.** Creating or editing a module means a terminal, an editor
  or Vetra Studio.
- **A spec without code does not show.** A draft in the Vetra drive appears only after
  `ph generate` writes its module.
- **Build does not know what the switchboard loaded.** A subgraph or a switchboard processor that
  fails to load there still passes its checks.
- **A code-first subgraph shows no schema.** Its schema exists only when its module runs.
- **The readers assume the layout `ph generate` writes.** A module written by hand in another shape reads as
  partial.
- **A code-first model runs in the dev server's process** when Build reads it, as it does for
  `ph model` and for the switchboard of `ph vetra`. The read has a time limit and is not started
  again at every poll, but a module that exits the process, or blocks its thread, takes the dev
  server with it. Reading in a child process would contain that, and is not done yet.
- **The document model tooling is marked experimental.** `models.ts` is its only caller here.
- **The Vite dependency cache goes stale.** The per-host cache from `viteCacheOf` prebundles
  workspace packages, `@powerhousedao/devtools` among them. After a dist rebuild it serves the old
  bundle until the cache is cleared.

Confidence: high for the saved location and the share link, which unit and E2E tests cover, and
for the plugin contract, the switch and the guards, which tests cover. Revisit when the 6.4 panel API and `ph dev` arrive, when the desktop
shell can start Connect at `dev`, if a model's module is seen to stop a dev server, or when an API
route writes to the project.

## Alternatives considered

- **Build as an editor of the Vetra drive's specs.** Built first and dropped (section 12).
- **Read the modules the tab has loaded.** It needs no API, but it mixes in installed packages,
  misses subgraphs and processors, and cannot see a module that failed to load.
- **Do nothing and keep the Vetra Studio drive app.** It lives in a drive and cannot float over the
  running app.
- **DevTools wired into core by name.** Built first and dropped. Connect imported the package
  behind a gate, builder-tools resolved it to empty files in a build, Connect's stylesheet imported
  its CSS, and ph-cli held its server. Each was a place to edit to remove DevTools, and another
  tool could not be added without the same edits.
- **A separate DevTools server, with the UI in an iframe.** A host of its own serves the API and
  the UI, and a script in each app's page adds a launcher and an iframe. It gives full isolation
  and a page that outlives the app's. It was not chosen: the UI could not read `window.ph` or the
  reactor, so each of those would cross as messages through a second protocol, and a built
  Connect's content security policy refuses a script from another address, so the app's server
  would still have to add one. The reactor's `IInspector` already answers in the page and over
  GraphQL, so a page in the app can inspect a switchboard's reactor too.
- **A config field, `app.devtools`, set by the dev server.** Built first and dropped. The dev
  server overrode an authored `false`, an authored `true` showed the dock with no API on a server
  that did not inject DevTools, and the container entrypoint could serve `true` from a build.
- **An entry in `runner.plugins`.** One list for every plugin. A declared `runner.plugins` replaces
  Connect's default composition, so a host that added only a tool would lose the app's own plugins.
- **Loading outside plugins in the browser.** Connect would load a plugin's UI from a package, as
  it does for its built-ins. It serves production plugins too, but it needs a build step, a
  development-only rule for that step and a way to add CSS, where the dev-server hook needs none.
- **A page module that shares the app's React for its UI.** No second React, but DevTools would
  then depend on the app's React version and on the host's Tailwind build.
- **A token prop.** A second way to turn DevTools on. The API answers only the origin that served
  the page, so that server can always put the tag in the page.
- **Selector-scoped CSS.** Rules prefixed with the DevTools root still lose to a page's own
  unlayered rules, such as `button { … }`. A shadow root keeps both sides apart.
- **Mount through the Vetra Studio plugin.** A custom Connect host does not compose that plugin, so
  it would get no DevTools.
- **A separate app served by the switchboard.** It needs its own build and its own reactor client,
  and it cannot float over the running app.
- **A lazy chunk without build stripping.** The service worker precaches every `.js` file, so the
  code ships to production anyway.
- **A file route for the page.** A host with its own `runner.routes` folder would not have it.
- **A DevTools theme toggle.** Connect's `dark` variant matches any descendant of `.dark`, so a
  light DevTools inside a dark Connect cannot opt out.
- **Location in URL params** (`devtools`, `devtools.tab`, `devtools.focus`). Built first and
  dropped. `devtools` collided with Connect's `?devtools=1`, each page change added an entry to the
  app's history, a project route saw params that were not its own, and a shared link carried the
  sender's whole DevTools state. Keeping the params across Connect's navigation needed them in
  `GLOBAL_SEARCH_PARAMS`, and removing them needed a change to Connect's `setSearch`.
- **One localStorage value for every tab.** Simpler, but each Vite reload would bring every tab
  back as the last one left it.

## Implementation footprint

- `packages/host-core`: the dev-server plugin contract in `src/connect-dev.ts`, exported from the
  package root.
- `clis/ph-cli`: `resolveConnectDevPlugins` and `DEFAULT_CONNECT_DEV_PLUGINS`, the `devPlugins`
  option of `runConnectStudio`, `readDevRun`, and the generated `runner-connect.schema.json`.
- `packages/codegen`: `readProjectDefinitions` in `src/utils/`, moved from ph-cli.
- `packages/document-model`: `schemaFirstSource` in its tooling, moved from ph-cli.
- `clis/ph-run`: `runner.devPlugins` in the Connect host schema.
- `packages/connect-core`: `registerConnectPage`.
- `packages/devtools`: the plugin in `src/connect/`, the Vite plugin, the API and the project
  reader in `src/server/`, the page modules in `src/client/`, the mount, the app source,
  `standalone.css`, the shell, the Build pages and the registry that puts them together.
- The lists every workspace package is in: `packages/shared/constants.ts`, the root
  `package.json` scripts, `scripts/test-weights.json`, `.github/ghx.json`, the E2E workspace
  helper and ph-cli's `tsconfig.json` references.
