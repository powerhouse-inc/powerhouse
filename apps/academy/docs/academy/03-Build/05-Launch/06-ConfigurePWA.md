# Configure the PWA

Connect ships as a **Progressive Web App**: users can install it, and a precaching **service worker** keeps the app shell — along with its in-browser database assets and registry-loaded editors — available offline. It's built on [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) and [Workbox](https://developer.chrome.com/docs/workbox/), configured through `powerhouse.config.json` — with packages contributing their own defaults via their manifests (see below). The worker also serves the web-app manifest **dynamically**, so packages installed at runtime can extend it — see [Runtime-installed packages extend the manifest](#runtime-installed-packages-extend-the-manifest). For how config values reach Connect (precedence, CLI, Docker), see [Configure your environment](./04-ConfigureEnvironment.md).

## Enable or disable

Offline support is controlled by `connect.app.offline` (default `true`):

```json
{
  "connect": {
    "app": {
      "offline": false
    }
  }
}
```

From the CLI, use the positional flag form or `--json`:

```bash
ph connect config connect.app.offline false
ph connect build --json '{"app":{"offline":false}}'
```

Disabling emits a self-destroying worker, so any worker installed by an earlier build unregisters itself and clears its caches on the browser's next update check — no stale workers are left behind.

The service worker is only built for production. During local development it is always disabled, regardless of `connect.app.offline`, so hot-reload isn't intercepted by a cache.

## Customize with `connect.pwa`

`connect.pwa` overrides Connect's built-in PWA defaults, and only applies when `offline` is `true`. Set only the fields you want to change. It has two parts: the [manifest](#manifest) (how the app looks and what the OS lets it do) and [caching](#caching) (what stays available offline).

## Manifest

`connect.pwa.manifest` overrides the [web app manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest) — the app's identity (name, colors, icons) and how the OS treats it once installed. Set only the fields you want; everything else keeps Connect's default. Scalar fields take your value, the array members are **added** to Connect's built-ins (so a package extends but never drops them), and the singular `share_target` is replaced.

| Field                                                                                                                          | Default / what it does                                            | Your value                    |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ----------------------------- |
| `name`                                                                                                                         | `"Powerhouse Connect"`                                            | replaces                      |
| `short_name`                                                                                                                   | `"Connect"`                                                       | replaces                      |
| `theme_color` / `background_color`                                                                                             | `"#ffffff"`                                                       | replaces                      |
| `display`                                                                                                                      | `"standalone"`                                                    | replaces                      |
| `start_url` / `scope`                                                                                                          | `"."`                                                             | replaces                      |
| `launch_handler`                                                                                                               | `{ "client_mode": "focus-existing" }`                            | replaces                      |
| [`icons`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons)                          | bundled 192 / 512 + maskable                                      | appended (de-duped by `src`)  |
| [`file_handlers`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/file_handlers)          | opens `.phd` / `.phdm` files ([File handling](#file-handling))    | appended after the built-ins  |
| [`shortcuts`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts)                  | jump-list / long-press menu entries (`name` + in-scope `url`)     | appended (de-duped by `url`)  |
| [`protocol_handlers`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/protocol_handlers)  | handle a custom `web+…` link ([Protocol handlers](#protocol-handlers)) | appended (de-duped by `protocol`) |
| [`share_target`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/share_target)            | receive files from the OS share sheet ([Share target](#share-target))  | replaced (last wins)          |
| [`screenshots`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/screenshots)              | previews for the richer install UI (`form_factor` `narrow`/`wide`) | appended (de-duped by `src`)  |
| [`categories`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/categories)                | app-store category hints                                          | unioned                       |
| [`display_override`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/display_override)    | ordered display-mode fallback, tried before `display`             | unioned                       |

To replace the browser-tab favicon too, pass `ph connect build --favicon ./icon.ico`.

```json
{
  "connect": {
    "pwa": {
      "manifest": {
        "name": "Acme Connect",
        "theme_color": "#00aaff",
        "shortcuts": [{ "name": "New document", "url": "new" }],
        "categories": ["productivity", "business"],
        "display_override": ["window-controls-overlay", "standalone"]
      }
    }
  }
}
```

Three members hand Connect an **OS launch** — `file_handlers`, `protocol_handlers` and `share_target` (detailed below). They declare only **what** they accept, never **where** or **how** it opens: those routes belong to Connect (so a package can't point the OS at an arbitrary URL, and consuming the launch runs Connect's own code). A fragment that sets `action`, `url`, `method` or `enctype` fails validation. All three take effect only for an **installed** PWA on a production build — never through `ph connect dev` — and browser/OS support varies (where it's unsupported the association is simply never registered, and Connect keeps working normally).

### File handling

Opening a `.phd` or `.phdm` file from the file system launches Connect, which asks which drive to import into and imports the file(s) there. A single file then opens in its editor; several opened at once are imported together, each with an "Open document" link in the upload panel. Because `launch_handler` is `focus-existing`, an already-running window is focused and receives the files instead of a new window opening per file — the files arrive through the [`LaunchQueue`](https://developer.mozilla.org/en-US/docs/Web/API/LaunchQueue) API.

A package or the project can associate **additional file types**:

```json
{
  "connect": {
    "pwa": {
      "manifest": {
        "file_handlers": [
          {
            "accept": { "application/x-acme+zip": [".acme"] },
            "icons": [{ "src": "acme-192.png", "sizes": "192x192", "type": "image/png" }]
          }
        ]
      }
    }
  }
}
```

Each entry declares `accept` (MIME type → extensions), optional per-type `icons`, and optional `launch_type`. Extensions must start with a dot — browsers ignore dotless ones, so the build rejects them. Contributed entries are appended after the built-in handler, and browsers give each extension to the **first** handler that claims it, so a package can't take over the built-in `.phd`/`.phdm` association.

### Protocol handlers

Register the installed app as the OS handler for a custom `web+…` URL scheme, so opening e.g. `web+ph://drive/abc` from another app launches Connect at the matching in-app route (`<basePath>/drive/abc`). The scheme must be `web+<lowercase letters>` (browsers reject anything else); declare just the scheme:

```json
{
  "connect": {
    "pwa": {
      "manifest": {
        "protocol_handlers": [
          {
            "protocol": "web+ph"
          }
        ]
      }
    }
  }
}
```

Product code can listen for the `ph:protocolLaunch` event and call `preventDefault()` to route the link itself.

### Share target

Let the OS share sheet send files (or text) to Connect. Shared files arrive on the next load through the same flow as an opened file — the drive picker, then import. Declare the accepted shape under `params`:

```json
{
  "connect": {
    "pwa": {
      "manifest": {
        "share_target": {
          "params": {
            "files": [
              {
                "name": "documents",
                "accept": [
                  "application/vnd.powerhouse.document+zip"
                ]
              }
            ]
          }
     
        }
      }
    }
  }
}
```

## Caching

`connect.pwa` also exposes the Workbox knobs. Connect's offline-enabled build uses Workbox's [`injectManifest`](https://developer.chrome.com/docs/workbox/modules/workbox-build) mode with a hand-written service worker, so your precache globs feed the injected precache and your `runtimeCaching` rules ([strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies)) are registered by that worker after its built-ins. Connect combines them with its defaults like this:

| Field                           | Combined with Connect's defaults |
| ------------------------------- | -------------------------------- |
| `globPatterns` / `globIgnores`  | Unioned                          |
| `maximumFileSizeToCacheInBytes` | The **max** wins                 |
| `runtimeCaching`                | **Appended after** the built-ins |
| `navigateFallbackDenylist`      | Unioned                          |

Workbox is first-match-wins, and your `runtimeCaching` rules come after Connect's built-ins (Google Fonts, the `/-/cdn/` registry assets, `powerhouse.config.json`) — so they add coverage but can't override a built-in rule for the same URL. A rule's `urlPattern` is a string (matched verbatim) or `{ source, flags }` (rebuilt into a `RegExp`); function patterns aren't supported. For `NetworkFirst` rules, set `options.networkTimeoutSeconds` so a slow network falls back to the cache instead of stalling.

`navigateFallbackDenylist` entries use the same two pattern shapes, with one difference: Workbox only accepts regular expressions there, so a plain string is escaped and matched as a literal substring of the URL path.

`connect.pwa` is validated at build time: an invalid block (unknown field, bad handler, non-compiling regex) fails `ph connect build` with a message naming the offending field.

For example, to brand the app and cache its API offline:

```json
{
  "connect": {
    "pwa": {
      "manifest": { "name": "Acme Connect", "theme_color": "#00aaff" },
      "maximumFileSizeToCacheInBytes": 8388608,
      "runtimeCaching": [
        {
          "urlPattern": { "source": "^https://api\\.acme\\.io/" },
          "handler": "NetworkFirst",
          "options": { "cacheName": "acme-api", "networkTimeoutSeconds": 5 }
        }
      ]
    }
  }
}
```

`connect.pwa` is an object, so the positional `ph connect config` form can't set it — edit `powerhouse.config.json` (its `$schema` gives autocomplete) or pass `ph connect build --json '{ "pwa": … }'`.

## Packages can contribute PWA config

A package can ship PWA defaults in its **`powerhouse.manifest.json`** ([the manifest you publish](./02-PublishYourProject.md)) using the same shape, so installing it works offline out of the box:

```json
{
  "name": "@acme/todos",
  "pwa": {
    "runtimeCaching": [
      { "urlPattern": { "source": "^https://api\\.acme\\.io/" }, "handler": "NetworkFirst" }
    ]
  }
}
```

The build reads `pwa` fragments from every package it knows about at build time:

- **The project's own manifest** — `powerhouse.manifest.json` at the project root (the `dist/` copy is a fallback).
- **Bundled packages** (`provider: "local"`) — read from `node_modules`.
- **Registry packages** (`provider: "registry"`) — fetched from the registry CDN, using the same version-pinned spec Connect loads at runtime. If the registry is unreachable the build still succeeds; it warns and skips the fragment.

A malformed package fragment is never fatal: the build warns (naming the package and field) and continues without it. A package installed **later, at runtime** isn't baked into the worker — but it isn't ignored either: Connect feeds its `pwa` fragment to the dynamically-served manifest, and its editor assets are runtime-cached by the built-in `/-/cdn/` rule so it works offline. See [Runtime-installed packages extend the manifest](#runtime-installed-packages-extend-the-manifest).

## How the layers merge

Precedence is `Connect defaults < package fragments (declared order) < the project's own manifest < project connect.pwa`:

| Field type                                                                                                                                     | Strategy                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| Manifest scalars, including `launch_handler` and the singular `share_target`                                                                   | Deep-merge — **project wins** |
| `icons`, `file_handlers`, `shortcuts`, `protocol_handlers`, `screenshots`, `categories`, `display_override`, globs, `runtimeCaching`, denylist | **Additive**                  |
| `maximumFileSizeToCacheInBytes`                                                                                                                | The **max** across layers     |

Additive fields let a package always add offline coverage without a later layer dropping it. If two packages set the same scalar to different values and the project doesn't settle it, the build warns and the last-loaded wins — set that field in `connect.pwa` to decide it explicitly (packages agreeing on the same value is fine and doesn't warn).

## Runtime-installed packages extend the manifest

Everything above happens at build time. But Connect's service worker also serves the web-app manifest **dynamically**: it merges the manifest baked in at build time with the `pwa` fragments of packages you install **at runtime** through the package manager. So an installed package's icons, shortcuts, file handlers, protocol handlers and the rest show up in the live manifest without rebuilding Connect. Connect validates each fragment before it takes effect and mirrors the merged result where the worker can read it; a malformed fragment is skipped with a console warning.

Runtime fragments are treated as **untrusted**, so the rules are stricter than for build-time `connect.pwa`:

- **Scalars are base-wins.** A runtime package can _add_ members, but it can't rename or re-theme Connect — `name`, `theme_color`, `display` and the other scalars keep the values the build baked. (Build-time `connect.pwa` still wins those; see [How the layers merge](#how-the-layers-merge).)
- **Built-ins stay first.** Connect's `.phd`/`.phdm` file association is registered first and can't be displaced, exactly as for build-time contributions.

**This is best-effort for OS integrations.** Browsers capture `file_handlers`, `protocol_handlers` and `launch_handler` at the moment the PWA is _installed_. A package installed afterward updates the manifest Connect serves immediately, but the OS only picks up a newly-added file or protocol association on the browser's own periodic manifest re-check (Chromium-only, on its own schedule) — never mid-session for the running window. Extra `runtimeCaching` rules a runtime package contributes register on the worker's next activation; `navigateFallbackDenylist` is build-time-only (the navigation route must be ready the instant the worker starts, so it can't wait on a runtime read). Opening that package's `.phd`/`.phdm` documents, however, works right away — those route on content, not on the OS association.

## Apply and verify

Rebuild and restart, as with any config change (see [Applying your changes](./04-ConfigureEnvironment.md#applying-your-changes)):

```bash
ph connect build
ph service restart
```

Then confirm the emitted `manifest.webmanifest` and `service-worker.js` carry your values, and check **DevTools → Application → Manifest / Service Workers** in the browser.

## Reference

- [MDN — Web app manifest](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest), with member pages for [`icons`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons), [`file_handlers`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/file_handlers) and [`launch_handler`](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/launch_handler).
- [MDN — `LaunchQueue`](https://developer.mozilla.org/en-US/docs/Web/API/LaunchQueue) — how launched files reach the app at runtime.
- [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) and Workbox — [`injectManifest`](https://developer.chrome.com/docs/workbox/modules/workbox-build), [strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies).
- [Configure your environment](./04-ConfigureEnvironment.md) — precedence, CLI, Docker.
- [Publish your package](./02-PublishYourProject.md).
