# Connect customization eval: stock-app

**Project:** `/tmp/connect-eval2/stock-app`, scaffolded with `ph init stock-app --pnpm --dev`, packages at `6.2.3-dev.69`.

**Result:** everything listed in the brief is built and checked in Studio, `ph build` and `ph connect build`:

* an inventory-item document model, at 100% reducer coverage;
* an editor for it;
* a custom Connect with:
  * an `/inventory` page across drives, with paging;
  * a settings tab;
  * a home override with its own card;
  * a create-document modal link that opens in place;
  * a full-page `/stock-report`;
  * a custom `_app.tsx` with a `pendingComponent`;
  * a light/dark theme and an SVG favicon.

**Git history:** `ae3dfdc` (model), `4bf5b5c` (editor), `d566758` (Connect).

**Screenshots:** `/tmp/connect-eval2/shots/`.

**Scripts:** `/tmp/connect-eval2/scripts/`. `mcp.mjs` is the MCP-over-HTTP client and `pw.mjs` the Playwright runner; the `s-*.mjs` files are the UI checks.

**Logs:** `/tmp/connect-eval2/logs/`.

**Total wall time:** about 41 minutes, 11:12 to 11:53.

**What went smoothly:**
* MCP over HTTP.
* Vetra codegen.
* Most of the customize-connect skill and its guides.
* `ph build` and `ph connect build`, whose failures were clear when I broke things on purpose.

**Most of the time went to:**
* Five bugs:
  * editors can't see reducer errors through `dispatch` or `document.operations`;
  * the create-document modal silently creates nothing outside a drive route;
  * a custom card on the home page is hidden under the background;
  * the documented sidebar replacement breaks at phone width;
  * the Studio devtools badge covers the Settings gear.
* Gaps in the guides around those five areas.

---

## Step 0: Reading the docs and starting Vetra (about 2 min)

**What the docs said:**
* `AGENTS.md`: start Vetra with `ph vetra --strictPort --watch`, then poll `/ready` on the `.mcp.json` port.
* The "Customizing Connect" section points to `node_modules/@powerhousedao/connect/skills/customize-connect/SKILL.md`.
* The skill's table links one guide per task. I read all 9 guides plus the branding parts of `RUNTIME-CONFIG.md`.

**Right and enough:**
* The startup steps worked first time. `/ready` returned 200 after 8 s.
* `.ph/vetra-runtime.json` didn't exist yet, so the "check for a running instance" step was clear.

**MCP over HTTP:** worked first try.
* The sequence was `initialize`, `notifications/initialized`, `tools/list`, then `tools/call`, with the `mcp-session-id` header carried between calls.
* I wrote a 40-line node client: `/tmp/connect-eval2/scripts/mcp.mjs`.
* Nothing in the product made this hard.

**Paper cuts:**
* **"Reading Connect's source" points to a path that doesn't exist.** The skill names `node_modules/@powerhousedao/connect-core/src/...`. Under pnpm, `connect-core` isn't hoisted, so it exists only under `node_modules/.pnpm/@powerhousedao+connect-core@.../`. The skill's last section therefore points at nothing.
* **AGENTS.md's approval rule conflicts with autonomous runs.** It says "MANDATORY: Present your proposal … NEVER proceed without explicit user approval". For an agent given a complete spec, as here, this conflicts with the task. A sentence saying the rule is waived when the user already supplied the design would help.

---

## Step 1: Document model, reducers, tests (about 2 min, 1 attempt)

**Model:**
* Type `stock-app/inventory-item`, extension `.inv`.
* State: `name: String`, `sku: String`, `quantity: Int!`, `location: String`.
* Module `inventory` with three operations:
  * `ADD_ITEM`, with errors `ItemAlreadyAdded`, `EmptyItemName` and `NegativeStartingQuantity`;
  * `ADJUST_QUANTITY` (a delta), with errors `AdjustBeforeAdd`, `ZeroAdjustment` and `InsufficientStock`;
  * `MOVE_ITEM`, with errors `MoveBeforeAdd`, `EmptyLocation` and `SameLocation`.

**How it was built:** through MCP.
* `getDocumentModelSchema` for `powerhouse/document-model`.
* `createDocument` in `vetra-362e4525`.
* One `addActions` call with 24 actions: header, state schema, initial state, module, operations with reducer code, errors and examples.

**What happened:**
* Codegen ran about 3 s after `addActions`.
* The reducer code from `ADD_OPERATION.reducer` landed in `document-models/inventory-item/v1/src/reducers/inventory.ts`, with the error classes auto-imported, as AGENTS.md promises.
* The generated tests only check that actions are dispatched: coverage was 40% statements and 27% branches, and the 95% threshold failed.
* I added `tests/inventory-scenarios.test.ts`: 5 scenario tests that hit every error code through the operation-index pattern. Coverage reached **100% on all four metrics**.
* `npm run tsc` and `npm run lint:fix` were clean.

**What the docs said, and whether it was right:**
* The coverage strategy section in AGENTS.md was good and was enough.
* **Wrong path:** AGENTS.md line 78 says reducers go in `document-models/<name>/src/reducers/<module>.ts`. The real path is `document-models/<name>/v1/src/reducers/`. Line 86 has the `v<n>` right.
* **Extension format:** AGENTS.md says "File extension: 2-4 characters with leading dot (e.g. `.inv`)". The built-in model uses `phdm` with no dot. With the dot, Vetra writes `backup-documents/InventoryItem.inv.phd`. That works, but it is ambiguous.
* **Conflicting `null` handling:** AGENTS.md recommends `|| null` for optional inputs ("Handling Nullable Input Types"). The coverage section, two screens earlier, calls `||` a "wrong coercion operator". The two pieces of advice contradict each other for strings.

**Paper cuts:**
* Every `vitest` run prints: `The plugin "vite-tsconfig-paths" is detected. Vite now supports tsconfig paths resolution natively…`. This comes from the template's `vitest.config.ts`.
* Vetra creates `backup-documents/` at the project root, and it isn't in `.gitignore`. It got committed with my first commit.
* Running `test:coverage` while Vetra runs makes Studio's Vite reload on `coverage/index.html` changes. The log shows `[vite] (client) page reload coverage/index.html`.

---

## Step 2: Editor (about 8 min, 3 attempts)

**Phase 1, through MCP:**
* `getDocumentModelSchema` for `powerhouse/document-editor`.
* `createDocument` (type `powerhouse/document-editor`, `driveId` vetra).
* `addActions` with `SET_EDITOR_NAME`, `ADD_DOCUMENT_TYPE` and `SET_EDITOR_STATUS: CONFIRMED`.
* Codegen produced `editors/inventory-item-editor/{module.ts,editor.tsx}` and registered it in `editors/editors.ts`.
* AGENTS.md's warning that the editor must be CONFIRMED was accurate.
* **Docs drift:** AGENTS.md step 3 says to create the editor "using `addActions` with the `ADD_FILE` action". The MCP `createDocument` tool, given `driveId`, creates the document and adds it to the drive in one call, and its own description says so. AGENTS.md should say to use that.

**Phase 2, the UI:**
* A `DocumentToolbar`, an item summary, an add form, an adjust form, a move form and an activity log.
* The components use `useSelectedInventoryItemDocument()` from the barrel, as documented.

### Bug E1: `document.operations` is `{}` in Connect, but its type says it is never missing

* **Package:** `document-model` types vs. the `@powerhousedao/reactor-browser` document cache.
* **What I did:** following AGENTS.md's "How Errors Work in Operations" (the error is in `operation.error`), I showed the last error with `document.operations.global.at(-1)?.error`. The first version had `?.` after `global`, but `oxlint` (`no-unnecessary-condition`) flagged it, because `operations.global` is typed as never missing, so I removed it.
* **What happened:** the editor crashed in Studio:
  ```
  TypeError: Cannot read properties of undefined (reading 'at')
      at LastError (…/editors/inventory-item-editor/components/LastError.tsx:8:42)
  ```
* **What's actually there:** at runtime, `document.operations` is `{}` for the document Connect passes an editor. Its type, `{ global: Operation[]; local: … }`, says the keys are always present, and the lint rule pushes you to trust that type.
* **Smallest repro:** in any generated editor, render `{document.operations.global.length}` and open a document in Studio.

### Bug E2: `dispatch`'s `onErrors` never fires for reducer errors; `onSuccess` fires instead

* **Package:** `@powerhousedao/reactor-browser`, the dispatch Connect gives editors.
* **What I tried:** I looked for another way to see errors. `DispatchFn` takes `(action, onErrors?, onSuccess?)`. I found that only in `reactor-browser/dist/*.d.ts`; no guide mentions it.
* **Repro, inside an editor:**
  ```ts
  dispatch(actions.adjustQuantity({ delta: -500 }),          // quantity is 70
    (errs) => console.warn("ONERRORS", errs.map(e => e.message)),
    (res)  => console.warn("ONSUCCESS", JSON.stringify(res.operations)));
  ```
* **Result:** `ONSUCCESS {}`, and `ONERRORS` never runs. The state is correctly unchanged, but the UI can't tell the user why. A form that resets on success wipes the user's input on a rejected change.
* **Workaround:**
  * I found `useDocumentOperations(documentId, "global")` in the `.d.ts`; it isn't in any guide. Its operations do carry `error`.
  * My `ActivityLog` component pages through them and shows "Last change was rejected: Only 70 in stock". Screenshot: `05-editor-errors.png`.
* **Docs gap:** neither AGENTS.md nor the guides say how an editor should surface reducer errors. AGENTS.md's error section is true only for unit tests.

### Other notes

* **Editor check:** done in Studio by creating "Bolts M8" through the drive's **Create New Document** modal, then add, adjust (-30) and move. Screenshots: `05-editor-used.png` (light), `52-editor-light.png` and `52-editor-dark.png`. The tokens `bg-card`, `text-primary` and `border-input` follow the theme.
* **Studio paper cut:** the TanStack Router devtools badge sits at the bottom left of every Studio page. See bug C5.

---

## Step 3: Custom Connect in `hosts/connect/routes/` (about 22 min)

### Files

| Piece | File | Status |
|---|---|---|
| Inventory page in the layout, sidebar link via `staticData.nav`, `useDocumentsOfType` across drives, "Load more" paging, live updates, per-drive "New item in…" links | `_app/inventory.tsx`, `-components/inventory-links.tsx` | works |
| Settings tab: low-stock threshold and page size, kept in localStorage, used by the inventory page | `_app/settings/inventory.tsx`, `-components/settings-store.ts` | works |
| Home override: drive cards plus an Inventory card with item and unit counts | `_app/index.tsx` | works after a fix (C2) |
| Link that opens the create-document modal in place (`useModalLinkProps`) | `editors/inventory-item-editor/components/NewItemLink.tsx` | works in a drive route only (C1) |
| Full-page route outside the layout: stock totals by location | `stock-report.tsx` | works |
| `_app.tsx`: `AppLayout` and `ConnectSidebar` with an extra "Stock report" `SidebarItem` (router navigation); `pendingComponent` loading screen | `_app.tsx` | works on desktop; broken at phone width (C3) |
| Theme tokens for light and dark, SVG favicon, `appName: "Stock App"` | `hosts/connect/style.css`, `hosts/connect/favicon.svg`, `powerhouse.config.json` | works after a Vetra restart (C7) |

### Setup

* **Router:** I added `@tanstack/react-router@1.170.45`, the version the lockfile resolves for Connect, as pages.md says. That was clear.
* **`lucide-react`:** the skill's first example imports it, but the project doesn't depend on it.
  * I had to add it myself.
  * My first pick from the lockfile was `0.554.0`, which another dependency pulls in. The right one is `1.61.0`, which matches Connect's `^1.16.0`.
  * The guides should say "add `lucide-react` at Connect's version" or use an icon the project already has.
* **Before the first build, `tsc` on `_app.tsx` fails with an error the troubleshooting page doesn't cover:**
  ```
  hosts/connect/routes/_app.tsx(11,14): error TS2883: The inferred type of 'Route' cannot be named without a reference to 'ConnectRouterContext' from '.pnpm/@powerhousedao+connect-core@…'. This is likely not portable. A type annotation is necessary.
  ```
  * This is the layout.md example, verbatim, under the template's `declaration: true` tsconfig.
  * It disappears after `ph build` generates `.ph/connect-routes.gen.ts`.
  * types-and-troubleshooting.md only mentions "unknown route ids" before the first build.
* **Restart:** after creating the routes folder I restarted Vetra, as the skill says. Every route then appeared.

### Bug C1: the create-document modal opened outside a drive route creates nothing, silently

* **Package:** `@powerhousedao/connect-core`'s create-document modal, and the `PHModal` type in `@powerhousedao/reactor-browser`.
* **What I did:** I put `<a {...useModalLinkProps({ type: "createDocument", documentType: "stock-app/inventory-item" })}>` on `/inventory`, as modals.md's example does.
* **What happened:**
  * The link opens the modal in place (no reload; href `/inventory?modal=create-document&documentType=…`). The modal shows only a name field, because the type is preset.
  * On **Create** it closes, and nothing is created anywhere: no document in the browser, no toast, nothing on the switchboard (checked with MCP `getDocuments` on every drive).
  * The result was the same after visiting a drive first and then client-navigating to `/inventory`.
* **Repro:** open `http://localhost:2987/inventory?modal=create-document&documentType=stock-app%2Finventory-item`, type a name, click Create. Screenshots: `23-create-modal-from-inventory.png`, `24-after-create-from-inventory.png`.
* **Cause, as far as I can see:** the modal adds the document to the drive of the current route, and `PHModal`'s `createDocument` has no `driveId`.
* **`setSelectedDrive` didn't help:** I found it in the `.d.ts` and tried it as a drive picker. It *navigates* to the drive, so it can't be used to pick a target from another page.
* **Workarounds I shipped:**
  * `/inventory` shows "New item in [Vetra Preview] [Warehouse B] [Vetra]". Each button is a router `Link` to `/d/$driveSlug/{-$nodeSlug}` with `search={{ modal: "create-document", documentType }}`. This opens the routed modal on that drive with no reload, and Create works.
  * The in-place `useModalLinkProps` link lives in the editor ("+ New item in this drive"). It opens in place with 0 full page loads and creates in the same drive. Screenshot: `28-editor-modal-in-place.png`.
  * I verified both by creating "Anchor bolts" and "Cable ties".
* **Docs gap:** modals.md presents `useModalLinkProps(createDocument)` as context-free and says nothing about where the document goes.

### Bug C2: a custom home card is invisible under `ConnectHomeScreen`'s background

* **Package:** `@powerhousedao/connect`, generic `ConnectHomeScreen`. The doc example in overrides.md is affected too.
* **What happened:** the overrides.md pattern, `<ConnectHomeScreen><MyCard/>{drives…}<HomeAddDriveItem/></ConnectHomeScreen>`, rendered my card's text in the DOM but not on screen.
* **Cause:**
  * `ConnectHomeScreen` renders its gradient as a sibling: `<div class="pointer-events-none fixed top-0 z-0 size-full bg-background">`.
  * `HomeDriveItem` is `relative`, so it paints above. A static card paints below.
* **Repro:** any child without `position` set. Fix: add `relative`.
* **Docs:** overrides.md uses `<OpenOrdersCard />` without defining it or mentioning this.
* Screenshots: `10-home.png` (fixed) and `51-home-dark.png`.

### Bug C3: the documented sidebar replacement breaks at phone width

* **Package:** `@powerhousedao/connect`, generic `AppLayout`.
* **What happened:** at 390×844, the custom `_app.tsx` makes the sidebar take the whole viewport. Its icons are spread vertically and the content area has width 0 (`80-phone-inventory.png`).
* **The minimal layout breaks the same way** (`82-phone-minimal-applayout.png`):
  ```tsx
  export const Route = createFileRoute("/_app")({ component: () =>
    <AppLayout sidebar={<ConnectSidebar collapsed={useSidebarMode()==="collapsed"} />} /> });
  ```
* **The default layout is correct** (`81-phone-inventory-default-layout.png`): a bottom bar, with the content above it.
* **Cause:** with the default sidebar, `AppLayout`'s wrapper is `flex h-full items-stretch overflow-auto max-sm:flex-col-reverse`. With a `sidebar` prop it lacks `max-sm:flex-col-reverse`.
* **Docs:** layout.md promises "On a phone, `ConnectSidebar` is a bar under the page".

### Bug C4: `useDocumentsOfType` drops a loaded row when another document of the type is created

* **Package:** `@powerhousedao/reactor-browser`, the document-type cache.
* **Repro:**
  1. Page size 5, 13 documents, all pages loaded: "Showing 13 items".
  2. Create a 14th item through MCP `createDocument`.
  3. The list updates live and the new item appears, but now shows 13 rows and "13+".
  4. **"Steel bolt M8" disappeared** until "Load more" was clicked.
* **Effect:** the reload seems to keep the number of documents loaded rather than the number of pages, and an existing row vanishes.
* **What did work:** live state updates from the reactor showed within 2 s (Washer M8 went from 8 to 50; `70-live-update.png`).
* Script: `scripts/s-live2.mjs`.

### Bug C5: in Studio, the TanStack Router devtools badge covers the Settings gear

* **Package:** Studio (`@powerhousedao/connect` dev or builder-tools).
* **Evidence:**
  * At the gear's centre (17,860 + 12), `elementFromPoint` returns the devtools `<button>`. Screenshot: `41-gear-overlap.png`.
  * Clicking the gear opens the devtools panel instead, and the state persists (`localStorage.tanstackRouterDevtoolsOpen=true`; `40-settings-tab.png`).
* **Effect:** a user can't reach Settings by clicking in Studio.

### Bug C6: `makeDriveSlug()` and `findDriveBySlug()` are typed `any`

* **Package:** `@powerhousedao/reactor-browser`.
* I wrapped the result in `String(...)` to stay lint-clean.

### Bug C7: branding changes in `powerhouse.config.json` aren't picked up by a running Vetra

* **Package:** `ph-cli` (vetra/studio).
* **What happened:** after I set `connect.branding.appName` and `connect.branding.favicon`, Studio still showed "Powerhouse Connect" and `/icon.ico`.
* **What fixed it:** a Vetra restart. After that the title read `Inventory · Stock App` and the icon was `/icon.svg`, `image/svg+xml`.
* **Docs:** nothing says a restart is needed.

### Bug C8 (UX, minor): the "Add drive" button in the add-drive modal ignores fast clicks

* **Package:** `@powerhousedao/connect`, the generic add-drive modal.
* Clicking "Add drive" within about 1 s of typing the URL does nothing, with no feedback. After about 3 s it works.
* I first suspected my script.

### Bug C9 (observed once, not reproduced): a document didn't sync from a tab closed right after creating it

* **Package:** `@powerhousedao/reactor-browser` sync.
* **What happened:**
  * "Cable ties" was created in the editor modal, and the browser closed within about 1 s.
  * The document showed in that profile's drive but stayed off the switchboard through two later sessions, one 8 s idle and one 30 s.
  * It reached the switchboard only during a later session that created another document.
* **Second try:** a quick close followed by a reopen synced fine.

### Docs findings for step 3

* **data-and-navigation.md: no way to link from a listed document to where it lives.**
  * `useDocumentsOfType` returns documents with no drive or node, so it doesn't say how to link to a listed document.
  * I built a map from `useDrives()` → `state.global.nodes` (kind `file`), then used `makeDriveSlug` and `makeNodeSlug` + `useLinkProps`. I found `makeNodeSlug` only in the `.d.ts`.
  * This is the most common thing to do with such a list.
* **layout.md: import paths don't match.** The table says `SidebarItem` and `useSidebarMode` come from `/layout`, but the sidebar example imports them from `/generic`. Both work.
* **layout.md: `SidebarItem`'s `icon` type isn't shown.** I passed a React element and it worked.
* **RUNTIME-CONFIG.md contradicts styles-and-branding.md.** RUNTIME-CONFIG says `branding.favicon` is "built as `icon.ico` by `ph connect build`". styles-and-branding.md says it keeps its type. The build wrote `icon.svg` with `<link rel="icon" type="image/svg+xml" href="/icon.svg">`, so styles-and-branding.md is right.
* **pages.md vs AGENTS.md:** pages.md says "Run `ph connect studio`", while AGENTS.md says to run Vetra. Both work, but agents should be told which one to use when Vetra is already up. Two instances would mean two reactors.
* **Right and enough:**
  * `staticData.nav`, `staticData.settings` (title `Settings · Inventory · Stock App`), `head` titles (`Inventory · Stock App`), full pages outside `_app/`, spreading `options` on overrides, `-components/` for shared code, the `@theme static` plus `:root` / `:root.dark` token guidance, and `?theme=dark`.
  * I checked every router link for full page loads: there were 0 for the sidebar nav, the sidebar extra item, the home card, drive cards, list document links, the per-drive modal links, the back link and the settings tabs.

---

## Step 4: Checks (about 8 min, plus about 10 min of extra UI testing)

**`ph build`:** exit 0 in 6.6 s.
* It generated `.ph/connect-routes.gen.ts` and `.ph/connect-routes.package.ts`.
* That second file offers `/stock-report`, `/inventory` and the settings tab to other Connects. It correctly excludes `_app.tsx` and the `_app/index.tsx` override, as packages.md says.
* **Negative check:** I changed a `Link` to `to="/inventoryy"`. The build exited 1 with:
  ```
  error TS2820: Type '"/inventoryy"' is not assignable to type '"." | ".." | "/" | …'
  ```
  and "✘ tsc reported the type errors above …". That's a clear message.
* **Noise:** `ℹ Hint: consider adding deps.onlyBundle option … Detected dependencies in bundle: - lucide-react`.

**`ph connect build`:** exit 0 in **35 s**.
* **Very noisy:** 2,914 output lines, 272 of them `WARN`:
  * `INVALID_ANNOTATION /*#__PURE__*/` in `@privy-io/react-auth`;
  * "Module node:fs/promises has been externalized" from `@powerhousedao/shared` and pglite-tools;
  * chunk size warnings.
  A real warning would be lost in this.
* **The output was correct:**
  * `index.html` has `<title>Stock App</title>`, `<link rel="icon" type="image/svg+xml" href="/icon.svg">`, my "Opening the stockroom…" `pendingComponent`, and the Inventory and Stock report sidebar items prerendered.
  * Served with `ph connect preview --port 4173` and JavaScript disabled, the shell shows the layout, my loading content and the themed icon (`60-loading-shell-light.png`).
  * With JavaScript on and a dark scheme, the inline `data-ph-theme-boot` script sets `.dark` before first paint (`61-loading-shell-dark-js.png`).
* **Negative check:** I added `{window.innerWidth}` to the `pendingComponent`. The build exited 1 with:
  ```
  AggregateError: The app shell failed to prerender:
   - window is not defined (at StockLoading (…/hosts/connect/routes/_app.tsx:61:42))
  ```
  That's a good message. The line was actually 60.
* **Studio's side of the same check:** the error is in its log and in an overlay (`63-studio-shell-error.png`), but it says **`_app.tsx:90:42` for a 63-line file**. Studio's shell render has no usable source map. **Package:** builder-tools `ph-connect-app-shell` plugin.
  * Two `<vite-error-overlay>` elements were stacked.
  * The overlay suggests editing `vite.config.js`, which this project doesn't have.

**Studio checks, all in headless Chromium:**
* **Real documents:** 15 inventory items across 3 drives. They were created through the drive's Create New Document modal, the routed and in-place modals, MCP `createDocument` + `addActions`, and a new "Warehouse B" drive made with MCP `addDrive` and added to Studio through the add-drive modal. They cover 12 of the 15 screenshots under `shots/`.
* **Light and dark:**
  * Inventory: `30-inventory-light/dark.png`.
  * Stock report: `50-stock-report-*.png`.
  * Home: `51-home-*.png`.
  * Editor: `52-editor-*.png`.
  * Settings tab: `40-settings-tab.png`.
  * `--primary` resolves to `#0f766e` in light and `#5eead4` in dark, and `--background` is overridden in dark only.
* **Paging:** at page size 5, the first page showed "5+" and "Load more" reached 7 items. At page size 3 (changed in the settings tab), the first page showed 3 rows and "3+".

**Studio paper cuts:**
* The cookie banner appears on every fresh profile and covers modals; my first add-drive attempt was blocked by it.
* Studio's first load to the drive list takes 3 to 8 s.

---

## Bugs, by package

| # | Package | Bug | Severity |
|---|---|---|---|
| E2 | `@powerhousedao/reactor-browser` (Connect dispatch) | Reducer errors call `onSuccess` (with `operations: {}`), never `onErrors` | High: editors can't report rejected changes |
| E1 | `document-model` types / reactor-browser document cache | `document.operations` is `{}` in Connect but typed as always having `global`, so the code lint pushes you to write crashes | High |
| C1 | `@powerhousedao/connect-core` create-document modal / `PHModal` | Outside a drive route, Create closes the modal and creates nothing, silently; no `driveId` on the modal | High |
| C3 | `@powerhousedao/connect` generic `AppLayout` | A custom `sidebar` loses `max-sm:flex-col-reverse`, so the phone layout is unusable | High for mobile |
| C2 | `@powerhousedao/connect` generic `ConnectHomeScreen` | Its fixed `z-0` background hides unpositioned custom cards | Medium |
| C4 | `@powerhousedao/reactor-browser` `useDocumentsOfType` | A create elsewhere reloads N documents instead of N pages, so a loaded row disappears | Medium |
| C5 | Studio (connect dev / builder-tools) | The TanStack devtools badge covers the Settings gear | Medium in Studio |
| C7 | `ph-cli` vetra/studio | `connect.branding` edits need a restart; Studio doesn't reload | Low |
| S1 | builder-tools app-shell plugin | Wrong line numbers in Studio's shell-render error | Low |
| — | template tsconfig / connect-core types | TS2883 on the layout.md `_app.tsx` before the first build | Low |
| C6 | `@powerhousedao/reactor-browser` | `makeDriveSlug` and `findDriveBySlug` return `any` | Low |
| C8 | connect generic add-drive modal | A fast "Add drive" click is ignored silently | Low |
| C9 | reactor-browser sync | Seen once: a document from a quickly closed tab synced only after the next write | Unconfirmed |

## Ranked fixes that would help most

### Docs

1. **AGENTS.md and data-and-navigation.md: how an editor shows reducer errors.**
   * Today the only working path is `useDocumentOperations(id, "global")` plus `op.error`.
   * Once E1 and E2 are fixed, document `dispatch(action, onErrors)`.
   * Say clearly that `document.operations` is not loaded in Connect editors; AGENTS.md's error section is true only for unit tests.
2. **modals.md: where `createDocument` creates.**
   * State that the modal adds to the current route's drive and does nothing elsewhere, until C1 is fixed.
   * Show the working pattern from a page outside a drive: a `Link` to `/d/$driveSlug/{-$nodeSlug}` with `search={{ modal: "create-document", documentType }}`.
3. **data-and-navigation.md: link a document from `useDocumentsOfType` to where it lives.** Show the `useDrives()` → file node → `makeDriveSlug` / `makeNodeSlug` → `useLinkProps` pattern, or a helper that does it.
4. **overrides.md, "Build on the home page": a complete card.** Define the custom card in full, with `relative` (or note the background), until C2 is fixed.
5. **The skill and pages.md: add `lucide-react` at Connect's version.** Name the version (`^1.x`) or use an icon that is already installed.
6. **types-and-troubleshooting.md: add the TS2883 "not portable" error** to the "before the first build" list, with "run `ph build` / `ph connect studio` first".
7. **AGENTS.md fixes:**
   * the reducer path should include `v<n>`;
   * prefer MCP `createDocument` with `driveId` over `ADD_FILE`;
   * clarify the extension format, with or without the dot;
   * reconcile `|| null` with the "wrong coercion operator" advice;
   * waive the approval step when the user already supplied the design.
8. **The skill's "Check your work": note that `powerhouse.config.json` changes need a Vetra or Studio restart.** Fix the `connect-core` source path, which doesn't exist at the top level under pnpm.
9. **RUNTIME-CONFIG.md: favicon output.** Say the favicon keeps its type (`icon.svg`), not "built as `icon.ico`".
10. **layout.md:** make the `/layout` vs `/generic` imports consistent, and show `SidebarItem`'s `icon` type.

### Code

1. **`@powerhousedao/reactor-browser`: call `onErrors` with the reducer's error when a dispatched operation fails** (E2). Either load `operations` for editor documents or type them as optional (E1).
2. **`@powerhousedao/connect-core`: give the `createDocument` modal a target drive.** Either a `driveId` / `parentFolder` field on `PHModal`, or a drive picker when no drive route matches. Never close silently without creating (C1).
3. **`@powerhousedao/connect` generic `AppLayout`: keep `max-sm:flex-col-reverse` when a custom `sidebar` is passed** (C3).
4. **`@powerhousedao/connect` generic `ConnectHomeScreen`:** put the background at `-z-10` or `isolate` the grid, so custom children show (C2).
5. **`@powerhousedao/reactor-browser` `useDocumentsOfType`: reload the same number of pages after a create or delete** (C4).
6. **Studio:** move or hide the TanStack Router devtools badge so it doesn't cover the Settings gear (C5). Watch `powerhouse.config.json` for branding changes (C7). Map the shell-render error to source lines (S1).
7. **`ph connect build`: cut the WARN noise.** Filter the known third-party warnings: privy `PURE` annotations, Node built-ins externalized from `shared` and pglite-tools, and chunk size.
8. **Template:**
   * `.gitignore` `backup-documents/`;
   * stop Vite watching `coverage/`;
   * drop `vite-tsconfig-paths` from `vitest.config.ts` in favour of `resolve.tsconfigPaths`;
   * annotate the `Route` type, or set `declaration: false` for `hosts/`, to avoid TS2883.
9. **`@powerhousedao/reactor-browser`: type `makeDriveSlug` and `findDriveBySlug`** (C6).

## Time and attempts per step

| Step | Wall time | Attempts and notes |
|---|---|---|
| 0. Read AGENTS.md, the skill and 9 guides; start Vetra; MCP client | about 2 min | 1 |
| 1. Model through MCP, codegen, scenario tests to 100% | about 2 min | 1 for codegen, 2 coverage runs |
| 2. Editor through MCP, UI | about 8 min | 3: crash on `operations.global` (E1); `onErrors` never fired (E2); then `useDocumentOperations` |
| 3. Connect routes, theme, favicon | about 22 min | Home card: 2 (C2). Create modal: 4 (outside a drive, after visiting a drive, the `setSelectedDrive` picker, then per-drive routed links plus the in-place link in the editor) (C1). Add drive in the UI: 4 (cookie banner, click timing C8, script truncation). Branding: 1 restart (C7). Settings gear: devtools overlap (C5) |
| 4. `ph build`, `ph connect build`, preview shell, Studio light/dark, live updates, phone, negative checks | about 8 min, plus about 10 min of extra testing | `ph build` 1; `ph connect build` 1 (35 s); found C3 and C4 here |

## Environment notes

* **Servers I started, each stopped by PID:**
  * Vetra three times: PIDs 2349, 10030 and 18500, each with its child processes;
  * `ph connect preview` once: PID 21469.
* **Port 8080:** the registry was never touched and still answered 200 at the end.
* **Browser profile:** Playwright used a persistent profile (`scripts/profile`), because drives added in the UI live in the browser's own reactor.