# customize-connect eval: `fix/connect-field-test` @ 190eb31, installed from a local registry

**Verdict.** The skill and its guides got every requested piece built and passing `ph build`, `ph connect build` and Studio (`ph vetra`) on the first attempt, with no restarts and no guessed APIs for the Connect parts. Two real bugs showed up only in the browser:

- **Create from a page outside a drive does nothing.** The create-document modal opened from `/inventory` closes on "Create" without creating anything and without any message.
- **A custom home card is invisible.** A card added to Connect's home, written the way `overrides.md` shows, is painted over by the home's background.

The biggest docs gaps:

- how to write a document-model spec for `ph generate` without MCP;
- how to link a `useDocumentsOfType` result to its document;
- the `lucide-react` dependency the skill's first example needs.

**Scope caveat.** Steps 1 and 2 used `ph generate`, as the task asked, not the `reactor-mcp` flow that `AGENTS.md` prescribes. The MCP tools weren't loaded in this session, and Vetra wasn't running yet at step 1. So the MCP path is untested here: `getDocumentModelSchema`, `addActions`, confirming an editor document, and Vetra's codegen. `ph generate editor` also goes against AGENTS.md's rule that editors are created only through MCP. Steps 3 and 4 don't depend on this.

Project: `/tmp/connect-eval/inventory-app` (scaffolded with `ph init inventory-app --pnpm --dev`). Screenshots: `/tmp/connect-eval/shots/`. Playwright scripts: `/tmp/connect-eval/pw/`. Logs: `/tmp/connect-eval/*.log`.

## Setup (not part of the eval, but it cost time)

| Step | Result | Time |
| --- | --- | --- |
| `pnpm install` with the preinstalled pnpm 10.28 | **failed**: `ERR_INVALID_URL Invalid URL … while installing the dependencies of @mastra/core@1.67.0` | — |
| `npm i -g pnpm@12.10.1` (the version CI pins), `pnpm install` | ok | 36 s |
| `pnpm build` (root script) | ok, on Node 22 | 1 m 20 s |
| `startRegistry(...)` with `WORKSPACE_PUBLISH_PACKAGES`, then `scripts/publish-workspace.ts` | 38 packages at `6.2.3-dev.69` | 6 s |
| `createTestUser`, fake HOME `.npmrc`, `ph-cli init inventory-app --pnpm --dev` | **failed**: `Node version 24.0.0 or higher is required` | — |
| Same, on Node 24.22.1 (nvm) | "succeeded", but installed from **npmjs** (see S2) | 27 s |
| Same, with `NPM_CONFIG_USERCONFIG` pointing at the fake HOME's `.npmrc` | ok: every `@powerhousedao/*` and `document-model` at `6.2.3-dev.69`; `skills/customize-connect/SKILL.md` is byte-identical to the branch and mentions `useDocumentsOfType` | 1 m 24 s |
| `writeNpmrc(project, token)` | ok | — |

- **S1 (monorepo DX).** The root `package.json` has no `packageManager` field. With any pnpm other than 12, `pnpm install` dies with a bare `Invalid URL`. `engines.node >=24` isn't enforced either: the whole build runs on Node 22, and only `ph init` rejects it.
- **S2 (test harness, `test/package-e2e/scripts/publish-package.ts` and `@powerhousedao/e2e-utils`).** `prepareFakeHome` relies on pnpm reading `$HOME/.npmrc`. If `NPM_CONFIG_USERCONFIG` is set in the environment (it is in this container), pnpm 12 honours it, and `ph init` silently installs from npmjs. The code comments say "pnpm 11 ignores NPM_CONFIG_USERCONFIG", which no longer holds for pnpm 12.
  - That install mixed versions: `document-model` and `@powerhousedao/shared` at `6.2.3-dev.70`, everything else at `6.2.3-dev.69`.
  - So `ph init --dev` against npmjs can produce a project whose `@powerhousedao/*` and `document-model` versions don't match.
  - Fix: set `NPM_CONFIG_USERCONFIG` to the fake `.npmrc` alongside `HOME`.

## Step 1: document model (≈4 min, 1 attempt)

**What the docs said.** `AGENTS.md` describes the document-model flow only through `reactor-mcp` (`ADD_MODULE`, `SET_OPERATION_SCHEMA` and so on, against a running Vetra). It never mentions `ph generate doc --document <spec.json>`. `ph-cli generate doc --help` says it takes "a document model spec (.phd or .json)" but not what the JSON looks like.

**What I had to do.** Read `node_modules/@powerhousedao/shared/dist/*.d.ts` for `DocumentModelGlobalState`, `DocumentSpecification`, `ModuleSpecification` and `OperationSpecification`, then write the spec by hand (`inventory-item.json`: `acme/inventory-item`, ops `SET_ITEM_DETAILS`, `ADD_STOCK`, `ADJUST_QUANTITY`, `MOVE_ITEM`, three errors).

**Result.** Everything after that was right on the first try:

- `ph generate doc --document ./inventory-item.json` (7.7 s) wrote reducers from the spec's `reducer` strings, with the error imports.
- I added one scenario test file; `pnpm test:coverage` gave 10 tests and 100 % coverage on statements, branches, functions and lines.
- `pnpm tsc` and `pnpm lint:fix` were clean.

Paper cuts:

- Every vitest run prints `The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively…`. It comes from the scaffold's `vitest.config.ts`.

## Step 2: editor (<1 min, 1 attempt)

`ph generate editor --name inventory-item-editor --document-type acme/inventory-item` produced `editor.tsx` and `module.ts` and registered the editor in `editors/editors.ts`. `AGENTS.md`'s editor section was enough: `EditorProps`, `useSelected<Model>Document`, `actions.*` from the barrel, and `DocumentToolbar`.

I wrote `ItemDetails`, `StockControls` and `History` components. tsc and lint were clean on the first try. In Studio, the editor rendered and dispatched (Remove 5: 1040 → 1035).

Paper cuts:

- The generated `editor.tsx` starts with an empty line.

## Step 3: custom Connect (≈2 min of reading and writing, then green on the first build)

I read `SKILL.md` and then `pages.md`, `data-and-navigation.md`, `overrides.md`, `modals.md`, `layout.md`, `styles-and-branding.md` and `types-and-troubleshooting.md`. The SKILL table pointed me to the right guide for every piece.

Files written:

| Piece | File | Guidance | Worked first try? |
| --- | --- | --- | --- |
| Page in the layout, `staticData.nav`, `useDocumentsOfType` + `loadDocumentsOfType` loader, paging (limit 5), `head` title | `routes/_app/inventory.tsx` | pages.md, data-and-navigation.md | yes; paging and live updates work (see step 4) |
| Settings tab | `routes/_app/settings/inventory.tsx` | pages.md | yes: listed between Default Editors and Danger Zone; title `Settings · Inventory · Acme Inventory` |
| Home override with drive cards and a card of my own | `routes/_app/index.tsx` | overrides.md "Build on the home page" | builds, but **the card is invisible** (B2) |
| Create-document modal in place | `useModalLinkProps({type:"createDocument", documentType})` in `inventory.tsx` | modals.md | opens in place with no reload, but **Create does nothing** on this page (B1) |
| Full-page route | `routes/report.tsx` | pages.md | yes: no sidebar, no reload from the sidebar link |
| `_app.tsx` with `AppLayout` + `ConnectSidebar extraItems` + `pendingComponent` | `routes/_app.tsx` | layout.md | yes; the loading screen is prerendered into `index.html` |
| Light and dark tokens, SVG favicon, app name | `hosts/connect/style.css`, `hosts/connect/icon.svg`, `connect.branding.{appName,favicon}` | styles-and-branding.md | yes |
| `staticData.sidebar: "hidden"` (extra) | `routes/_app/focus.tsx`, added while Studio ran | pages.md | yes, picked up without a restart |

Commands:

- `pnpm add -D @tanstack/react-router@1.170.45 lucide-react` (4 s). The router version is the one the lockfile resolves, as pages.md says. `lucide-react` I had to work out myself (D2).
- `pnpm tsc` before the first build gave the expected unknown-route-id errors, plus one that wasn't expected:
  ```
  hosts/connect/routes/_app.tsx(11,14): error TS2883: The inferred type of 'Route' cannot be named without a reference to 'ConnectRouterContext' from '.pnpm/@powerhousedao+connect-core@…/node_modules/@powerhousedao/connect-core'. This is likely not portable. A type annotation is necessary.
  ```
  It disappears after the first `ph build`. types-and-troubleshooting.md only mentions route-id errors, so this one looks like a real problem until you build (D7).
- `pnpm build` (`ph build`): ok in 7 s. It generated `.ph/connect-routes.gen.ts` and `.ph/connect-routes.package.ts`, which offers `/report`, `/inventory` and the settings tab, and type-checked the routes. tsdown printed `Detected dependencies in bundle: - lucide-react` with a `deps.onlyBundle` hint.
- `ph connect build`: ok in 33 s, then 23 s. `index.html` has `<title>Acme Inventory</title>`, `<link rel="icon" type="image/svg+xml" href="/icon.svg">`, the "Loading inventory…" pending view, and both `--primary` values inlined. The output is **2,914 lines**, one per asset, plus `node:fs/promises … externalized for browser compatibility` warnings.

## Step 4: checks in Studio (`ph vetra --strictPort --watch`) with headless Chromium (≈25 min, most of it on B1 and B2)

Studio was ready in 16 s (switchboard on 7189, Connect on 2189). The routes folder existed before the first start, so no restart was needed. Documents:

- 1 created through the UI: the create modal inside the preview drive.
- 7 created through the reactor's GraphQL API (`InventoryItem.createDocument`, `setItemDetails`, `moveItem`, `addStock`), spread over the preview and Vetra drives.

Results:

- **`useDocumentsOfType`.** The first page showed 5 rows with "Load more"; after clicking it, 8 rows and no button. An `addStock` of 1000 sent through GraphQL while the page was open updated the total (176 → 1176 units) with no reload.
- **Sidebar.** Nav links (`/inventory`) and the extra `SidebarItem` (`/report`) navigate without a full reload; I checked with a `window` marker.
- **Theme.** Light: `--primary #0f766e`, `--primary-foreground #fff`, button `rgb(15,118,110)`. Dark (`.dark` on `<html>`): `--primary #5eead4`, `--primary-foreground #042f2e`, button `rgb(94,234,212)`.
- **Favicon and title.** Studio links `/icon.svg` and titles the page "Acme Inventory".
- **Failure checks the skill claims:**
  - a `pendingComponent` that reads `window.innerWidth` gets a Studio overlay and an `ERROR` log line, and `ph connect build` exits 1 (but the location is wrong, B3);
  - an override without `...options` gets a `ph build` WARN whose fix text is exact (but Studio only warns at startup, B4).
- **`ph connect preview` (extra).** It serves every route from the build (home card, `/inventory`, `/report`, settings tab), but `--default-drives-url` has no effect (B6).

All servers are stopped: Vetra, preview and the registry. The monorepo working tree is unchanged.

## Bugs

### B1 (high). The create-document modal from a page outside a drive closes and creates nothing, silently

- **Package:** probably `@powerhousedao/connect-core` (the routed `createDocument` modal and its handler); the doc side is in `modals.md`.
- **Repro:**
  ```tsx
  // hosts/connect/routes/_app/inventory.tsx
  const modal = { type: "createDocument", documentType: "acme/inventory-item" } as const;
  <a {...useModalLinkProps(modal)}>New inventory item</a>
  ```
  Open `/inventory` and click the link: the URL becomes `/inventory?modal=create-document&documentType=acme%2Finventory-item` and the "Create a new document" dialog opens in place. Type a name and click **Create**: the dialog closes and the URL goes back to `/inventory`.
- **What happens:**
  - No document is created: `findDocuments(search:{type:"acme/inventory-item"})` on the switchboard returns nothing new, and the list keeps its count.
  - Nothing is reported: no console error, no warning, no toast.
- **Same flow inside a drive works.** At `/d/preview-8e909e2c?modal=create-document&documentType=acme%2Finventory-item`, Create makes the document and opens it.
- **Expected:**
  - The dialog asks for a drive, or says one is needed and disables Create.
  - The modal accepts a drive id (`&driveId=`).
  - modals.md says that `createDocument` creates in the open drive.

  Today modals.md's own example, `NewTodoListLink`, would be broken anywhere outside a drive.

### B2 (medium). Children of `ConnectHomeScreen` that aren't positioned are painted over by the home background

- **Package:** `@powerhousedao/connect`, the generic plugin's `ConnectHomeScreen`; the doc side is overrides.md "Build on the home page".
- **What happens:**
  - The home's first child is `<div class="pointer-events-none fixed top-0 z-0 size-full bg-background">`, with an `absolute inset-0 bg-primary opacity-15` layer inside it.
  - `HomeDriveItem` gets `relative` and so paints above it.
  - A card written as the guide suggests (`<OpenOrdersCard />` next to the drive items) is in the DOM, 164×96 at (323, 80), but `document.elementFromPoint` at its centre returns the background layer, so the card doesn't show.
  - Adding `relative` to the card fixes it.
- **Fixes, either one:**
  - give `ConnectHomeScreen`'s grid `relative z-10`, or `isolate` the background;
  - export a `HomeItem`/`HomeCard` wrapper with the drive card's classes, and use it in the guide's example.

  The guide's example also never defines `OpenOrdersCard`, so there is nothing to copy the drive card's look from. I copied the classes out of the DOM: `relative flex h-24 w-40 … hover:hover-effect`.

### B3 (low). The prerender error points at the wrong line

`window` is used on line 15 of `_app.tsx`, but:

- Studio reports `window is not defined (at pendingComponent (…/hosts/connect/routes/_app.tsx:21:37))`;
- `ph connect build` reports `…/_app.tsx:20:37`.

Neither line exists as the cause: line 21 is inside `Layout`. The column is right. Probably the TanStack code-split transform (`?tsr-split`) or the shell bundle is missing source maps in the `ph-connect-app-shell` plugin (`@powerhousedao/connect` / `builder-tools`).

### B4 (low). Studio warns about an override without `options` only at startup

`SKILL.md` and overrides.md say "`ph build` and Studio warn". `ph build` warns every time. Studio printed the WARN only after a restart: while it ran, removing `...options` from `_app/index.tsx` gave only `hmr update` lines, and `touch` didn't help either. Package: the Studio Vite plugin (`builder-tools` or `connect`).

### B5 (low). `makeDriveSlug` and `findDriveBySlug` are typed `any`

`@powerhousedao/reactor-browser/dist/*.d.ts` has `export declare function makeDriveSlug(drive: DocumentDriveDocument): any;`, and the same for `findDriveBySlug`. Callers lose type checking, and `useLinkProps({ driveSlug: makeDriveSlug(d) })` needs an `as string` to read well. The fix is an explicit return type in `reactor-browser`.

### B6 (low, not investigated). `ph connect preview --default-drives-url <url>` is accepted and ignored

The served `powerhouse.config.json` still has `"defaultDrives": []`, and no drive appears. Either the flag should apply at preview, or preview shouldn't offer it (`ph-cli`).

### B7 (low). Branding stops at the tab icon

With `connect.branding.appName = "Acme Inventory"` and `favicon = "hosts/connect/icon.svg"`, `ph connect build` still writes:

- `manifest.webmanifest` with `"name":"Powerhouse Connect","short_name":"Connect"`;
- the Powerhouse `pwa-*.png` icons.

`RUNTIME-CONFIG.md` (line 210) says the favicon is "built as `icon.ico`", but the build writes `icon.svg`. That matches styles-and-branding.md, so RUNTIME-CONFIG.md is out of date. Package: `ph-cli`/`builder-tools` for the manifest; docs: `RUNTIME-CONFIG.md`.

## Docs gaps and paper cuts

- **D1. Document models without MCP** (generated `AGENTS.md`, `ph-cli`/`codegen` template).
  - Nothing explains `ph generate doc --document spec.json`, or the spec's shape (`specifications[].state.global.{schema,initialValue,examples}`, `modules[].operations[].{schema,reducer,errors,scope}`). I had to read `@powerhousedao/shared` types.
  - A short example spec, or a `ph generate doc --example`, would remove the guess.
  - `AGENTS.md` assumes the agent is an MCP client; an agent driving a shell isn't.
  - Weight: low. With MCP connected, `getDocumentModelSchema` supplies the shape, so this only matters to agents without MCP.
- **D2. `lucide-react` is missing** (`SKILL.md` "A first page", pages.md).
  - The first example imports `lucide-react`, which isn't in the scaffold, so `tsc` fails until it is added.
  - When it is added, `ph build` bundles it into the package (`Detected dependencies in bundle: - lucide-react`) and prints a tsdown hint.
  - The docs should say to `pnpm add` it and as what (`dependency` or `devDependency`), or the examples should use an icon the project already has (the design system).
- **D3. Wrong import path in the `useDocumentsOfType` example** (data-and-navigation.md).
  - `import { ProductionLedger } from "../../document-models/production-ledger";` is the wrong depth from `hosts/connect/routes/_app/` (that needs `../../../../`), and it has no `.js` under `nodenext`. Use the `document-models/<name>` alias, which works.
  - It also doesn't say which export is "the document model module": the `PascalCase` const from `v1/module.ts` (`InventoryItem`).
- **D4. No way to open a listed document** (data-and-navigation.md, `reactor-browser`).
  - `useDocumentsOfType` returns documents but not their drive, and nothing explains how to link one to its editor.
  - What I did: scan `useDrives()` for the node with that id, then `useLinkProps({ driveSlug: makeDriveSlug(drive), nodeSlug: makeNodeSlug(node) })`. Neither helper is mentioned in the guides.
  - A `{ documentId }` navigation target, or a drive id on each result, would make this a one-liner.
  - The order of results isn't stated either; it came back grouped by drive.
- **D5. `createDocument` needs an open drive** (modals.md). Not stated; see B1.
- **D6. Home example** (overrides.md "Build on the home page"). The card component is never defined, nothing says how to match the drive cards, and nothing warns about `relative` (B2). The not-found example also uses `createFileRoute` without importing it.
- **D7. TS2883 before the first build** (types-and-troubleshooting.md). The "Types" section and the troubleshooting table cover unknown route ids before the first build, but not the `TS2883 … ConnectRouterContext … A type annotation is necessary` error `_app.tsx` gets. One row would do: "run `ph build` once".
- **D8. Scaffold theming hint** (`hosts/connect/style.css` template from `ph init`). It says "Override Connect's theme variables here, e.g. `--color-primary`" inside `@theme static`. A literal `--color-primary` there would apply in both themes, while styles-and-branding.md says to set the semantic `--primary` on `:root` and `.dark`. The comment points to the approach that breaks dark mode.
- **D9. `RUNTIME-CONFIG.md`** is linked as the user guide from `SKILL.md`, but its end is contributor notes: `packages/shared/document-model/schemas.ts`, `emit-schemas.ts`, "the sixth artefact". A project developer can't act on those paths.
- **D10. Small gaps that cost a guess, not a failure.**
  - layout.md doesn't give `SidebarItem`'s `icon` type; an element worked.
  - pages.md's settings-tab `icon` takes a component; `nav.icon` is a component too, so the two differ from `SidebarItem`.
- **D11. Noise.**
  - `ph connect build`: 2,914 lines per run.
  - Vetra logs `ERROR (node:…) MetadataLookupWarning: received unexpected error = Request failed with status code 502`. This is likely a GCP metadata probe through this container's proxy, but it is logged at ERROR.
  - Vetra also logs the `PH_ATTACHMENT_URL_SIGNING_SECRET is not set` WARN on every start.
  - The vitest `vite-tsconfig-paths` notice.
- **D12. The TanStack Router devtools badge in Studio** sits on the sidebar's bottom-left corner, where Connect's settings gear is (at y=820 in a 860 px viewport).

### What the skill got right

- The routing table in `SKILL.md`.
- The "Rules that break builds" list: router version, spreading `options`, plain `href`, one Tailwind build, `window` in the shell.
- The `staticData` (`nav`, `settings`, `sidebar`) examples.
- The `pendingComponent` and loading-screen explanation.
- The two-file style model with `:root` and `.dark` tokens.
- `useModalLinkProps` and `useDocumentsOfType` behave exactly as described where they work.
- Studio picked up edited and new route files with HMR, with no restarts needed.

## Time and attempts

| Step | Wall time | Attempts | Blocked by |
| --- | --- | --- | --- |
| Setup | ≈15 min | pnpm 2, Node 2, `ph init` 3 | S1, S2 (environment and harness) |
| 1. Document model | ≈4 min | spec 1, generate 1, tests 1 | D1: read package types for the spec shape |
| 2. Editor | <1 min | 1 | — |
| 3. Routes + theme | ≈2 min writing; `ph build` 7 s and `ph connect build` 33 s, both first try | 1 (+ `lucide-react`) | D2, D3; the TS2883 scare (D7) |
| 4. Studio + browser checks | ≈25 min | — | investigating B1 and B2, building a document link (D4) |

## Ranked fixes

### Docs

1. **modals.md:** say that `createDocument` creates in the open drive, and show the link on a drive page or with a drive id (B1/D5).
2. **overrides.md "Build on the home page":** define the custom card, give it `relative` and the drive card's classes, or use an exported card component (B2/D6).
3. **data-and-navigation.md, "Documents of one type":**
   - fix the import to `document-models/<name>`;
   - say which export is the module;
   - show how to link a result to its document (`makeDriveSlug`/`makeNodeSlug`, or a new target);
   - state the result order (D3, D4).
4. **`SKILL.md` and pages.md:** add `pnpm add lucide-react` (and whether it is a dependency or a devDependency) next to the router step, or use design-system icons (D2).
5. **types-and-troubleshooting.md:** a row for `TS2883 … ConnectRouterContext` before the first build (D7).
6. **`ph init`'s `hosts/connect/style.css` comment:** point at `:root` and `.dark` semantic tokens, not `--color-primary` (D8).
7. **`RUNTIME-CONFIG.md`:** move the contributor notes out, and fix "built as `icon.ico`" (D9, B7).
8. **`SKILL.md`:** note that Studio's options warning appears at startup only, or fix B4.
9. **Generated `AGENTS.md`:** for agents without MCP, a fallback path for document models, `ph generate doc --document spec.json`, with a minimal example spec (D1).

### Code

1. **`@powerhousedao/connect-core`, `createDocument` modal:** never close silently without creating. Ask for or accept a drive, or disable Create with a reason (B1).
2. **`@powerhousedao/connect`, generic `ConnectHomeScreen`:** stack its children above the fixed background, e.g. `relative z-10` on the grid, and export a home-card component (B2).
3. **`@powerhousedao/reactor-browser`:**
   - a navigation target, or a link-props helper, that opens a document by id;
   - include each document's drive in `useDocumentsOfType` results (D4);
   - give `makeDriveSlug` and `findDriveBySlug` real return types (B5).
4. **`ph-connect-app-shell` plugin (`connect` / `builder-tools`):** correct source locations in prerender errors (B3); re-run the options-override check on HMR in Studio (B4).
5. **`ph-cli`:**
   - `connect build` should derive the PWA manifest's `name`/`short_name` from `branding.appName` (B7);
   - `connect preview --default-drives-url` should work or be removed (B6);
   - a quieter `connect build` that summarises assets (D11).
6. **Monorepo and harness:**
   - add `packageManager: "pnpm@12.10.1"` to the root `package.json` (S1);
   - set `NPM_CONFIG_USERCONFIG` with the fake HOME in `test/package-e2e/scripts/publish-package.ts`, so `ph init` can't fall back to npmjs (S2);
   - check why `ph init --dev` can resolve mixed `dev.69`/`dev.70` versions across Powerhouse packages (S2).
