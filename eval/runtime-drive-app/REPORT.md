# Runtime drive app through hosts, and re-check of N1 and the wrapped sidebar: `fix/connect-field-test` @ `97c5300`

This is step 3 of the drive-app eval, run by the main session. Opus's drive-app package (`stockroom-opus`) was rebuilt against `97c5300`, published to the local registry, and loaded at runtime by a project scaffolded with `FEATURE_UNIFORM_RUNNERS_ENABLED=1 ph init` (`flagged-app`), through its own scaffolded hosts.

The consumer's `powerhouse.config.json` only adds the package to `packages` and points `packageRegistryUrl` at the local registry. The package offers a drive app ("Stockroom App"), an editor, the `stockroom/inventory-item` model, and a `/stockroom` page.

The Switchboard host still needed the IPv4 preload (R1, unchanged), loaded with `NODE_OPTIONS`.

## Results

| # | Check | Result |
| --- | --- | --- |
| 1 | **N1:** `ph run connect dev` loads a registry package that imports `document-model` | **Fixed.** `[Connect][PackageManager] Registered "stockroom-opus"`; the package's drive app, editor and `/stockroom` page all load in dev |
| 2 | **Wrapped `ConnectSidebar`** on a phone (`sidebar={<MySidebar />}`, where `MySidebar` returns `<ConnectSidebar …/>`), 390×844 | **Fixed.** The sidebar (`[data-connect-sidebar]`) is a `390×64` bar at y=780 and the content starts at the top; no horizontal scroll (`views-phone-drive.png`) |
| 3 | Switchboard host loads the package | Works: `[HttpPackageLoader] Loaded document models from package stockroom-opus: ["stockroom/inventory-item"]`. The declared drive (`reactor.drives: [{ slug: "powerhouse" }]`) is seeded: `GET /d/powerhouse` → "flagged-app" |
| 4 | Create Drive in Connect with the package's app | Works: the new drive opens in the package's drive app. The picker preselects the package's app, as both drive-app runs reported |
| 5 | **Use the drive app** with the scaffolded Connect host (`reactor.backends.main: { kind: "worker" }`) | **Broken (D1)**, in dev and in the built Connect (`ph run connect build` + `serve`) alike |
| 6 | The same with the Connect host's backend changed to `in-process` | Works: <ul><li>create an item through the drive app's "+ New inventory item" (the create modal); it opens in place in the package's editor</li><li>Back returns to the drive view</li><li>add the folder "Shelf A" and move the item into it</li><li>no console errors</li><li>light, dark and phone screenshots: `views-*`</li></ul> |
| 7 | Standalone Connect host + Switchboard host, adding the Switchboard's drive by URL | **Diverges (D2).** The item reaches the Switchboard, but the drive's operations are dead-lettered |
| 8 | **The `cli` compound** (`ph run cli`: Switchboard + Connect as a remote client) | Works end to end: <ul><li>the package's `/stockroom` page sets the drive's app, and it syncs (`preferredEditor: "stockroom-app"` on the Switchboard)</li><li>the drive opens in the package's app</li><li>"CLI crate", created through it, is in the Switchboard drive's `nodes`</li><li>no errors</li></ul> |

## New findings

### D1 (high). With the scaffold's default worker reactor, Connect can't create documents of a runtime package's model

- **Symptom:** in the package's drive app, "+ New inventory item" → Create logs:
  ```
  Error adding document: Error: Failed to load document model for type: stockroom/inventory-item
  Error: There was an error adding document
  ```
  Nothing is created.
- **When:** the scaffolded `hosts/connect/host.js` (`reactor.backends.main: { kind: "worker" }`), in both `ph run connect dev` and the built Connect (`build` + `serve`).
- **When not:** the same flow works with `kind: "in-process"`, and with the `cli` compound (a remote backend).
- **Connect's own log on that path:** `Skipping processor factory …: processors are not supported on the worker reactor path yet`.
- **Likely cause:** the worker reactor doesn't receive the document models of packages installed at runtime from the registry. The drive app and editor register on the page, but the model never reaches the worker.
- **Packages:** `@powerhousedao/connect` (package manager → worker reactor) and `reactor-browser`.
- **Why it matters:** a fresh `ph init` under the flag, plus a registry package, can't create that package's documents in the default Connect host.

### D2 (medium). Standalone Connect and Switchboard hosts share a drive id, and adding the Switchboard's drive diverges

- **How it happens:** the scaffolded `hosts/connect/host.js` and `hosts/switchboard/host.js` both declare `drives: [{ slug: "powerhouse", … }]`, so each creates its own drive with the id `powerhouse`. Adding `http://localhost:7607/d/powerhouse` to the standalone Connect lists one `/d/powerhouse`, and then:
  ```
  [reactor] Remote dead letter on …: document powerhouse failed with: ChannelError[inbox]: Failed to apply operations: Document powerhouse already exists
  ```
- **Effect:** the new item document reached the Switchboard, but its drive's `nodes` stayed `[]`, and the drive's app choice didn't sync. Connect shows the item in the drive; the server doesn't.
- **What the docs say:** `hosts/README.md` says the `cli` and `desktop` compounds are how Connect uses the Switchboard's drive, and `cli` works (check 8).
- **Still a trap:** adding a drive whose id already exists locally should be refused with a message, not accepted and dead-lettered.

### Smaller

- **`/__vendor__/shared-deps.js?import` 404 in dev.** Connect's package manager probes for the production vendor table, and fails softly by design. The browser still logs it as a console error, next to the `node_modules` probe's 404 (R6).
- **The Switchboard host still needs the IPv4 preload** (R1): `listen EAFNOSUPPORT :::7607` without it.
- **Test data changed by my mistake:** a misdirected click on the `/stockroom` page set the Switchboard's "Workflows" drive's app to `stockroom-app`, in the consumer's Switchboard storage. This was a test-only data change.

## State left for review

- **`consumer/`:** `flagged-app` as tested.
  - `hosts/connect/host.js` has `main: { kind: "in-process" }`; the scaffold's original line was `kind: "worker"`.
  - `hosts/connect/routes/_app.tsx` is the wrapped-sidebar layout.
  - `powerhouse.config.json` lists `stockroom-opus` and the local registry.
- **`scripts/`:**
  - `driveapp.mjs`, `driveapp2.mjs`: the drive app in dev, built and in-process;
  - `phone-views.mjs`: light, dark and phone;
  - `sync.mjs`: the standalone + Switchboard divergence;
  - `cli.mjs`: the `cli` compound.
- **`shots/`:**
  - `dev-*`, `serve-*`: the worker failure;
  - `inproc-*`, `views-*`: working;
  - `cli-*`: the compound.
