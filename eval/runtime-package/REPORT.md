# Runtime package eval: `stock-app@1.0.0` loaded by a fresh project's Connect and Switchboard hosts

The package is the one the blind eval built (`/tmp/connect-eval2/stock-app`). It was published to the local registry. A new project, `/tmp/connect-eval3/consumer-app` (`ph init consumer-app --pnpm --dev`), loads it at runtime through two hosts. Packages: `6.2.3-dev.69` from the local registry, branch `fix/connect-field-test` @ 190eb31.

**Verdict.** The production path works end to end:

- Switchboard loads the package's model from the registry and serves its GraphQL mutations.
- The built Connect (`ph run connect build`, then `serve`) installs the package from the registry's CDN, including its editor, its three routes and its stylesheet. Items created and edited in Connect reach Switchboard.
- The package's styles apply correctly in light and dark mode, and the eval's host theme correctly doesn't ship.

Two bugs block the other paths:

- **R1.** Switchboard can't start at all on a machine without IPv6.
- **R2.** `ph run connect dev` can't load any runtime package.

The Switchboard host and its configuration are also undocumented.

## Steps

| Step | What I did | Result | Time |
| --- | --- | --- | --- |
| Publish | In `stock-app`: `pnpm lint`, `tsc`, `test` (11 pass), `pnpm build`, `ph-cli publish --registry http://localhost:8080` (the manifest already had its name) | `stock-app@1.0.0` published. `dist/style.css` is 6.4 KB, holding only the package's classes, in `@layer external-packages` | 1 min |
| Consumer | `ph init consumer-app --pnpm --dev`, then `writeNpmrc` | ok | ~1 min |
| Config | `powerhouse.config.json`: `"packages": [{ "packageName": "stock-app", "version": "1.0.0", "provider": "registry" }]` and `"packageRegistryUrl": "http://localhost:8080"`, as `RUNTIME-CONFIG.md` describes. `hosts/connect/host.js` written by hand (R3); `hosts/switchboard/host.js` written from the runner's `.d.ts` (R3) | | 10 min, most of it on R3 |
| Switchboard host | `FEATURE_UNIFORM_RUNNERS_ENABLED=1 ph run switchboard` | **failed** (R1). With an IPv4 preload as a workaround: up in 10 s; log shows `[HttpPackageLoader] Loaded document models from package stock-app: ["stock-app/inventory-item"]` | |
| Drive and data | `DocumentDrive.createDocument` (the `slug` was ignored, R5), then 3 items through `InventoryItem.createDocument` and `addItem` | The package's reducers run on the server | |
| Connect host, dev | `hosts/connect/host.js` with `config.drives.defaultDrives` → the switchboard drive; `ph run connect dev` | **The package fails to load** (R2). The drive syncs, but there's no editor and no routes | |
| Connect host, build and serve | `ph run connect build` (26 s, 2,883 lines), then `ph run connect serve` | Works: the host's `config` (default drive, app name) and the top-level `packages` are baked into `dist/powerhouse.config.json` | |
| Browser checks | Headless Chromium, light and dark | All pass; see below | |

## What works in the served Connect (screenshots in `shots/`)

**Package installed from the CDN.** These came from `http://localhost:8080/-/cdn/stock-app@1.0.0/…`, all 200:

- `browser/index.js` and its chunks;
- `package.json`;
- `style.css`;
- `browser/connect-routes.js`.

**The package's routes are in this Connect:**

- `/inventory`: the sidebar link, the title `Inventory · Consumer Connect`, 3 rows read from the switchboard drive, no full reload;
- `/stock-report`: a full page;
- the Inventory settings tab, between Default Editors and Danger Zone.

**The package's editor works:**

- Opening "Hex bolts" from the list loads it.
- "Adjust −20" changed 120 to 100 in Connect and on Switchboard.
- The routed create modal on the drive made "Cable ties", and the editor's "Add item" form set it to 250 at Aisle 3. Switchboard returned `{"sku":"CBL","name":"Cable ties","location":"Aisle 3","quantity":250}`.

**What shouldn't ship didn't.** The eval's home override (its inventory card) and its `_app.tsx` layout (the "Stock report" sidebar item) are absent, as packages.md says. `.ph/connect-routes.package.ts` offers only `/stock-report`, `/inventory` and the settings tab.

**Styles:**

- **How the stylesheet is attached.** Connect adds it as `<style>@import url("http://localhost:8080/-/cdn/stock-app@1.0.0/style.css") layer(external-packages)</style>`. It doesn't appear in `document.styleSheets` on its own (it hangs off the `@import` rule); Chrome DevTools lists it as a separate sheet.
- **It is applied.**
  - Only 3 of the package's 69 class selectors aren't also in Connect's CSS: `.text-3xl`, `.border-input` and `.text-card-foreground`.
  - `h1.text-3xl` on `/stock-report` is 30 px.
  - DevTools traces that rule to the package sheet's own form, `font-size: var(--text-3xl, 1.875rem)`.
- **It follows the consumer's theme.**

  | Mode | Card | Button | Input border |
  | --- | --- | --- | --- |
  | Light | `rgb(255,255,255)`, `rounded-xl`, `p-5` | `bg-primary` `rgb(64,67,69)` on white | `rgb(240,240,240)` |
  | Dark (`.dark`) | `rgb(26,29,31)` | `rgb(243,245,247)` on `rgb(14,16,16)` | `rgb(49,54,58)` |

- **It doesn't re-theme Connect.** `--primary` is Connect's default (`#404345` in light, `#f3f5f7` in dark). The eval's teal comes from its own `hosts/connect/style.css`, which correctly doesn't ship.
  - `shots/light-03-editor.png` and `/tmp/connect-eval2/shots/52-editor-light.png` (the same editor in the eval's own Studio) have identical layout, spacing and radii; only the primary colour differs, which is the expected result.
- **No second Tailwind build.** No duplicate reset, and the package's utilities sit in `external-packages`, below Connect's `utilities`.

## Bugs

### R1 (high in containers). Switchboard fails to start on a host without IPv6

- **Package:** `@powerhousedao/switchboard`, `isPortAvailable` in `dist/server-*.mjs`.
- **Commands:** `FEATURE_UNIFORM_RUNNERS_ENABLED=1 ph run switchboard` and the classic `ph switchboard --port 4416` both fail. The only output is:
  ```
  listen EAFNOSUPPORT: address family not supported :::4415
  ```
- **Cause:** the port probe calls `tester.listen({ port, host: "::" })` and rejects on any error other than `EADDRINUSE` or `EACCES`. Node's default bind (no host) works on the same machine (`0.0.0.0`).
  - `ph vetra`'s switchboard is unaffected.
  - The switchboard runner's schema has no `host` option, and `runner.host: "0.0.0.0"` is silently ignored.
- **Fix:** probe without a host, or fall back to `0.0.0.0` on `EAFNOSUPPORT`/`EADDRNOTAVAIL`. Name the port and the probe in the error.
- **Workaround used here:** a `NODE_OPTIONS=--require` preload that maps `listen({ host: "::" })` to `0.0.0.0` (`ipv4-shim.cjs`).

### R2 (high). `ph run connect dev` can't load runtime packages

- **Package:** `ph-cli`/`builder-tools`, the dev React shim used with the host runner.
- **Symptom:**
  ```
  [Connect][PackageManager] Failed to install package "stock-app@1.0.0": Failed to fetch dynamically imported module: http://localhost:8080/-/cdn/stock-app@1.0.0/browser/index.js
  ```
  Network: `404 http://localhost:3415/node_modules/.vite/deps/react.js?v=…`.
- **Cause:**
  - The import map sends `react` to `/__ph/dev-react-shim/react.js`, which re-exports `"/node_modules/.vite/deps/react.js"`.
  - The host dev server keeps its Vite cache in `node_modules/.vite-connect`, as hosts-and-plugins.md says, and `/node_modules/.vite-connect/deps/react.js` returns 200.
  - The classic `ph connect studio` (cache `.vite`) has no such 404.
- **Effect:** any package from the registry that imports React (every editor) fails in a host's dev server.
- **Fix:** build the shim's path from the server's `cacheDir`.

### R3 (docs, medium). Hosts beyond Connect are undocumented, and the docs refer to a file `ph init` doesn't create

- hosts-and-plugins.md says "the scaffolded `hosts/connect/host.js` reads `studio.port`", but `ph init` creates only `hosts/connect/style.css`.
- `@powerhousedao/ph-cli` exports `./runners/switchboard` and `./runners/compound`, but no shipped doc mentions them. Their config came from `dist/runners/*.d.mts` and `@powerhousedao/host-core`'s `.d.mts`:
  - `reactor` and `profile` blocks;
  - a `drives` declaration schema;
  - `children` for a compound.
- **Drive declarations:**
  - `ph run switchboard --explain drives` prints "(no drives declared)".
  - Adding a top-level `drives: [{ slug, name }]` to the host changed nothing.
  - I couldn't find where declarations go, and fell back to GraphQL.
- **The compound runner** reads as the intended way to run Connect and Switchboard together: its handle mentions "projected into a connect member's defaultDrives". I didn't try it because there was nothing to go on.
- A "Run Connect and Switchboard as hosts" section would have saved most of this step. It needs a `hosts/switchboard/host.js` example, how packages and drives are declared for each, and the compound host.

### R4 (low). `--explain drives` ignores Connect's default drives

`ph run connect --explain drives` prints "(no drives declared)" while `hosts/connect/host.js` sets `config.drives.defaultDrives` and the build bakes it in. Package: `ph-cli`.

### R5 (low). `DocumentDrive.createDocument(slug: "warehouse")` ignores the slug

The drive came back with `slug` equal to its id. Connect then shows it at `/d/warehouse-<id>`, built from the name. Package: the `reactor-api` document-drive subgraph.

### R6 (low, noise). The dev server tries `node_modules` first for every registry package

`404 /node_modules/stock-app@1.0.0/browser/index.js?import`, followed by `[warning] Failed to load package "stock-app@1.0.0" from node_modules`, comes before the CDN load on every page load.

### Other notes

- `ph run connect serve` listens on `127.0.0.1` only (`Local: http://127.0.0.1:3415/`).
- `ph run connect build`: 2,883 lines, including `INVALID_ANNOTATION /*#__PURE__*/` warnings from `@privy-io/react-auth`.

## How the two eval reports compare (`/tmp/connect-eval/REPORT.md` = mine, `/tmp/connect-eval2/REPORT.md` = blind subagent)

**Found by both, independently.** Highest confidence:

- the create-document modal outside a drive creates nothing (B1 / C1);
- the home card is hidden under `ConnectHomeScreen`'s background (B2 / C2);
- `lucide-react` is missing from the skill's example (D2);
- TS2883 before the first build (D7);
- no way to link a `useDocumentsOfType` result to its drive (D4);
- `makeDriveSlug` is typed `any` (B5 / C6);
- prerender errors give the wrong line (B3 / S1);
- the devtools badge covers the Settings gear (D12 / C5): the subagent showed that clicking the gear opens the devtools;
- `RUNTIME-CONFIG.md`'s "built as `icon.ico`" (B7);
- `ph connect build` noise and the `vite-tsconfig-paths` notice.

**Found only by the subagent.** I haven't reproduced these:

- **High.**
  - E1: `document.operations` is `{}` in Connect editors, but typed as always present.
  - E2: `dispatch`'s `onErrors` never fires for reducer errors; `onSuccess` fires instead.
- **The rest.**
  - C3: a custom `sidebar` loses the phone layout.
  - C4: `useDocumentsOfType` drops a loaded row when a document is created.
  - C7: branding edits need a Vetra restart.
  - C8: the add-drive modal ignores fast clicks.
  - C9: one unconfirmed sync delay.
  - `AGENTS.md`'s MCP path: the reducer path is missing `v<n>`, it says `ADD_FILE` where `createDocument` with a `driveId` is what works, the extension format is ambiguous, and its `|| null` advice conflicts with its coverage advice. Its approval rule also blocks autonomous runs.
  - The skill's "Reading Connect's source" path doesn't exist under pnpm.
  - `backup-documents/` isn't in `.gitignore`.
  - Vite reloads on `coverage/` changes.

**Found only by me:**

- B4: Studio's options warning appears at startup only.
- B6: `ph connect preview --default-drives-url` is ignored.
- The PWA manifest keeps the "Powerhouse Connect" name.
- D3: the wrong import path in the `useDocumentsOfType` example.
- D8: the `hosts/connect/style.css` template comment points to `--color-primary`.
- D9: contributor notes in `RUNTIME-CONFIG.md`.
- S1/S2 in the harness.
- D1 (the document-model spec format) is moot on the MCP path.

## Files

- `consumer-app/`: the consumer project, including `hosts/connect/host.js`, `hosts/switchboard/host.js` and its `powerhouse.config.json`.
- `ipv4-shim.cjs`: the R1 workaround.
- `seed.mjs`: creates the drive's items through GraphQL.
- `pw/`: Playwright checks:
  - `full.mjs light|dark`: the full walk-through;
  - `create.mjs`: create through the UI, then check Switchboard;
  - `cdp.mjs`: which stylesheet sets which rule;
  - `fail.mjs`: failed requests.
- `shots/`: `light-*` and `dark-*` for the home, inventory, editor, stock report and settings; `light-06` and `light-07` for the created item.
- Logs: `switchboard.log`, `connect.log` (the dev failure), `connect-build.log`, `connect-serve.log`.
