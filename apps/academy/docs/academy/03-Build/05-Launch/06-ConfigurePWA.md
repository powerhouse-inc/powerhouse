# Configure the PWA

Connect ships as a **Progressive Web App**: users can install it, and a precaching **service worker** keeps the app shell — along with its in-browser database assets and registry-loaded editors — available offline. It's built on [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) and [Workbox](https://developer.chrome.com/docs/workbox/), configured through `powerhouse.config.json` — with packages contributing their own defaults via their manifests (see below). For how config values reach Connect (precedence, CLI, Docker), see [Configure your environment](./04-ConfigureEnvironment.md).

## Enable or disable

Offline support is controlled by `connect.app.offline` (default `true`):

```json
{ "connect": { "app": { "offline": false } } }
```

There's no dedicated flag, so from the CLI use the positional form or `--json`:

```bash
ph connect config connect.app.offline false
ph connect build --json '{"app":{"offline":false}}'
```

Disabling emits a self-destroying worker, so any worker installed by an earlier build unregisters itself and clears its caches on the browser's next update check — no stale workers are left behind.

The service worker is only built for production. During local development it is always disabled, regardless of `connect.app.offline`, so hot-reload isn't intercepted by a cache.

## Customize with `connect.pwa`

`connect.pwa` overrides Connect's built-in PWA defaults, and only applies when `offline` is `true`. Set only the fields you want to change.

### Manifest

`connect.pwa.manifest` overrides the [web app manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest). Scalars deep-merge over the defaults (yours win); `icons` append to the built-in set.

| Field                              | Default                      |
| ---------------------------------- | ---------------------------- |
| `name`                             | `"Powerhouse Connect"`       |
| `short_name`                       | `"Connect"`                  |
| `theme_color` / `background_color` | `"#ffffff"`                  |
| `display`                          | `"standalone"`               |
| `start_url` / `scope`              | `"."`                        |
| `icons`                            | bundled 192 / 512 + maskable |

To replace the browser-tab favicon too, pass `ph connect build --favicon ./icon.ico`.

### Caching

`connect.pwa` also exposes the Workbox knobs. See the Workbox docs for what each does ([`generateSW`](https://developer.chrome.com/docs/workbox/modules/workbox-build), [strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies)); Connect combines them with its defaults like this:

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

A malformed package fragment is never fatal: the build warns (naming the package and field) and continues without it. A package installed later at runtime can't alter an already-built worker, but its editor assets are already runtime-cached by the built-in `/-/cdn/` rule, so it still works offline.

## How the layers merge

Precedence is `Connect defaults < package fragments (declared order) < the project's own manifest < project connect.pwa`:

| Field type                                   | Strategy                       |
| -------------------------------------------- | ------------------------------ |
| Manifest scalars                             | Deep-merge — **project wins**  |
| `icons`, globs, `runtimeCaching`, denylist   | **Additive**                   |
| `maximumFileSizeToCacheInBytes`              | The **max** across layers      |

Additive fields let a package always add offline coverage without a later layer dropping it. If two packages set the same scalar to different values and the project doesn't settle it, the build warns and the last-loaded wins — set that field in `connect.pwa` to decide it explicitly (packages agreeing on the same value is fine and doesn't warn).

## Apply and verify

Rebuild and restart, as with any config change (see [Applying your changes](./04-ConfigureEnvironment.md#applying-your-changes)):

```bash
ph connect build
ph service restart
```

Then confirm the emitted `manifest.webmanifest` and `service-worker.js` carry your values, and check **DevTools → Application → Manifest / Service Workers** in the browser.

## Reference

- [`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) and Workbox — [`generateSW`](https://developer.chrome.com/docs/workbox/modules/workbox-build), [strategies](https://developer.chrome.com/docs/workbox/modules/workbox-strategies).
- [MDN — Web app manifest](https://developer.mozilla.org/en-US/docs/Web/Manifest).
- [Configure your environment](./04-ConfigureEnvironment.md) — precedence, CLI, Docker.
- [Publish your package](./02-PublishYourProject.md).
