# Connect eval 4: parts-app report

Project: `/tmp/connect-eval4/parts-app` (git: `init` e5e0fc4, then 8 commits, last `f5be7f8`).
Screenshots: `/tmp/connect-eval4/shots/`. Scripts: `/tmp/connect-eval4/scripts/`.
Vetra was started and stopped by PID (9656/9658/9673 in the final run; pnpm 6253 and node 6270 in the first run). Registry on 8080 (PID 4883) was not touched.

## What was built and verified

| Piece | Where | Verified |
| --- | --- | --- |
| Document model `parts/inventory-item` (`InventoryItem`), state `name`, `quantity`, `location`; ops `ADD_ITEM`, `ADJUST_QUANTITY`, `MOVE_ITEM`, 10 named errors | `document-models/inventory-item/v1/` (reducers in `src/reducers/stock.ts`) | 18 tests pass, coverage 100% on lines, branches, functions, statements; `tsc` and `lint:fix` clean |
| Editor `Inventory Item Editor` (confirmed via MCP) | `editors/inventory-item-editor/` | Add form for empty docs, stock panel with adjust and move, rejection banner. Browser-tested |
| Inventory page (`_app/inventory.tsx`, `staticData.nav`, `useDocumentsOfType`, pagination, row links, `useModalLinkProps`) | `hosts/connect/routes/_app/inventory.tsx` | Sidebar link, 10-row page then "Load more" to 13, row click opens the document, modal creates a document in place |
| Settings tab | `hosts/connect/routes/_app/settings/inventory.tsx` | Tab appears and opens at `/settings/inventory` |
| Home override (drive cards plus an Inventory card) | `hosts/connect/routes/_app/index.tsx` | Card click opens `/inventory` |
| Layout override with sidebar `extraItems` and `pendingComponent` | `hosts/connect/routes/_app.tsx` | `ph connect build` prerenders "Loading Parts Connect" into `index.html` |
| Full-page route outside the layout | `hosts/connect/routes/inventory-print.tsx` (`/inventory-print`) | Renders without sidebar, "Back to Connect" works |
| Theme tokens, light and dark | `hosts/connect/style.css` (`:root`, `:root.dark`, `@theme static`) | Dark screenshot shows the overridden background and primary |
| SVG favicon | `hosts/connect/favicon.svg`, `connect.branding.favicon` in `powerhouse.config.json` | Build `index.html` links `icon.svg`, title `Parts Connect` |

Checks run: `pnpm test:coverage`, `pnpm tsc`, `pnpm lint:fix` (all exit 0), `pnpm exec ph-cli build` (exit 0), `pnpm exec ph-cli connect build` (exit 0, 272 warning lines, see paper cuts). Studio was loaded in headless Chromium. Documents were created through the reactor (3 at first, 10 more for pagination, all in both drives) and through the create modal. Light, dark, and 390x844 viewports were checked.

## Step by step

### 0. Reading the docs (about 10 min)
- `AGENTS.md` was read in full. Its "Customizing Connect" pointer and the skill's table were correct and the guide paths resolved (`node_modules/@powerhousedao/connect/docs/customizing/*.md`).
- I read `pages.md`, `overrides.md`, `layout.md`, `data-and-navigation.md`, `modals.md`, `styles-and-branding.md` before writing the matching pieces. They were right for everything I used except the points under Docs below.
- Docs were enough to write the Connect routes without reading package source. I did read `connect/src/routes/_app.tsx` and `reactor-browser/dist/index.d.ts` to confirm export names and signatures. Nothing in the docs names the operations shape of a document in the editor, so that required guessing and reading `.d.ts` files (see Bug 1).

### 1. Document model (about 15 min, 3 attempts)
- The MCP-over-HTTP client works: `initialize`, `notifications/initialized`, `tools/call` with the `mcp-session-id` header. Tool names are plain (`getDocumentModelSchema`, `createDocument`, `addActions`), not `mcp__reactor-mcp__*`.
- Created `powerhouse/document-model` on `vetra-cea183c0`, one `addActions` batch of 27 actions. Codegen ran within a few seconds and wrote `document-models/inventory-item/` including reducer files (`src/reducers/stock.ts`) with my bodies, the error classes, and a stub `tests/stock.test.ts`.
- Paper cuts: `addActions` requires `scope` on every action, and this is not in `AGENTS.md`. The `SET_AUTHOR_NAME` input is `authorName`, and the operation input shapes are only in the 35 KB schema. Error ids must be unique per document, which I did not confirm.
- First attempt with a typo-free batch succeeded. The tests and coverage took one run each, and I needed no fix-ups.

### 2. Editor (about 15 min for the UI, about 30 min for the rejection feature, 5 attempts)
- Created the editor document (`powerhouse/document-editor`), added `SET_EDITOR_NAME`, `ADD_DOCUMENT_TYPE`, and `SET_EDITOR_STATUS` `CONFIRMED` in one batch. Codegen then wrote `editors/inventory-item-editor/` and registered it in `editors/editors.ts`. `SET_EDITOR_STATUS` is not named in `AGENTS.md`. I found it in the editor schema.
- The rejection requirement failed on the first design and took several rounds (see Bug 1 and Bug 2). The final approach compares the state before and after a dispatch.
- A `RejectionBanner` first keyed off `document.operations.global`. That crashed the editor with `TypeError: Cannot read properties of undefined (reading 'length')` because the editor's document has no `global` key. I fixed the crash with `?? []`, then found the array was always empty.

### 3. Connect customization (about 10 min to write, one lint fix)
- `ph-cli build` and `ph-cli connect build` both passed after one lint fix. The lint error was `String(error)` on an `unknown`, which `AGENTS.md` covers with a helper but my route code didn't use.
- Overwrote the scaffold `hosts/connect/style.css` without reading it first (its guidance comments were lost). Restored from git in a separate commit.
- Restarted Vetra after creating `hosts/connect/routes/` (the skill says it is detected at startup). Restart took about 60-90 s and `/ready` returned 503 until it finished, with no message on the page. I did not test whether a restart was actually required.

### 4. Browser checks (about 35 min, many attempts)
- Studio home loads after about 15 s on first start, behind Connect's cookie prompt. Each script had to click "Reject all cookies".
- Each flow was run by Playwright with screenshots. Clicks checked: each inventory row, the create modal link, the modal create, the Adjust and Move forms, the banner Dismiss, the sidebar Inventory item, the Settings Inventory tab, the home card, the print page's "Back to Connect".
- Pagination: first page is 10 rows, "Load more" appends the rest.
- Modal create: it worked in place, but after creating it stayed on `/inventory` and the list updated. It did not open the new document.
- Dark mode works via `prefers-color-scheme: dark`, which sets `html.dark`.
- Phone 390x844: content is off-screen (see Bug 3).

## Bugs

### Bug 1: Connect's editor document has no operation history, so reducer errors can't be read from `operation.error`
- Symptom: `document.operations` in the editor is `{}`. `document.operations.global` is `undefined`. My first banner read `document.operations.global`, which crashed with `TypeError: Cannot read properties of undefined (reading 'length')`. After the `?? []` fallback it was always empty, even after a rejected change.
- Repro: open any InventoryItem in Studio, `Adjust by -100` on an item with quantity 5. The dispatch's `onSuccess` result has `operations` with no keys. The reactor does record the error: `documentOperations` GraphQL on `http://localhost:7867/graphql` returns `{"action":{"type":"ADJUST_QUANTITY","input":{"delta":-10}},"error":"Cannot remove more than the 5 units in stock"}`.
- Package: most likely `@powerhousedao/reactor-browser` or the Connect document cache. Uncertain, because I did not read that code. Also the type `DocumentOperations = Record<string, Operation[]>` in `@powerhousedao/shared` says every scope is an array, which is false at runtime.
- Workaround used: the editor compares the state before and after each dispatch (`globalStateOf` and `rejectionFor` in `editors/inventory-item-editor/components/rejection.ts`). It shows a generic message, not the reducer's text.

### Bug 2: dispatch does not report reducer errors through `onErrors`
- Repro: `dispatch(actions.adjustQuantity({ delta: -100 }), (errors) => ..., (result) => ...)`. `onErrors` never fires for a reducer error. `onSuccess` fires with the state unchanged.
- The `DocumentDispatch` type in `@powerhousedao/shared` documents `onErrors` and `onSuccess` but not which errors go where. Package: unclear, probably `reactor-browser`. The doc gap is in the editor docs (see Docs).

### Bug 3: phone layout (390px) pushes the content off-screen
- Repro: open `/inventory` at 390x844 (with or without `isMobile`). `nav` is 259x844 at (0,0). The page heading is at x=414 and the table at x=414, both outside the viewport. `scrollWidth` reports 390, so the overflow is hidden, not scrolled.
- The same happens on core `/settings/appearance`, with `nav` 259px wide and the heading at x=406.
- The layout guide says that on a phone `ConnectSidebar` is "a bar under the page". I did not see that.
- Package: most likely `@powerhousedao/connect` generic `AppLayout`/`ConnectSidebar` (`/generic`). My `_app.tsx` uses the same two components and only adds `extraItems` and a `pendingComponent`. I did not test a default project for comparison, so this is not confirmed as a generic-only bug.

### Bug 4: a document opened right after creation shows "Document not found"
- Repro (once, not reproducible on the second attempt): create a document through the create modal, then navigate to its row link. The page showed `Document not found: <id>` and a PAGEERROR `DocumentNotFoundError ... KyselyDocumentView.resolveIdOrSlug`. Reloading the same URL about 8 s later worked. The same document id existed in the reactor throughout (`getDocument` returned it).
- Package: `reactor-browser`/Connect sync, most likely. Intermittent, so the cause is unconfirmed.

### Bug 5: the reactor's error text is not reachable from Connect and there is no documented fallback (covered by Bugs 1-2)

## Paper cuts and doc issues

Docs
- `AGENTS.md` says `ph vetra --strictPort --watch`, and the skill says `ph build` / `ph connect build`. The package provides only `ph-cli`. `pnpm exec ph` fails with `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL: Command "ph" not found`. The eval note to use `pnpm exec ph-cli` is correct; the docs are not.
- `AGENTS.md` says the MCP tools are `mcp__reactor-mcp__getDocumentModelSchema` and so on. Over HTTP, the names are `getDocumentModelSchema`, `createDocument`, `addActions`, `getDocument`, `getDocuments`, `getDrives`, `addDrive`, and others. Nothing documents the HTTP handshake or the `mcp-session-id` header.
- `addActions` actions need `type`, `input`, and `scope`. The tool description does not say this. Nothing shows an example action.
- `getDocument` over MCP returns only `header` and `state`. The operation history (and `error`) is only in the GraphQL `documentOperations` query, which is not documented anywhere I read.
- `AGENTS.md` says there are 37 operations and that versioning is "DO NOT USE". The schema has more operations than that, including `RELEASE_NEW_VERSION` and changelog operations.
- Editor publishing: `AGENTS.md` says to confirm the editor, but not which action. It is `SET_EDITOR_STATUS` with `status: "CONFIRMED"`.
- `AGENTS.md` says "Reducer errors surface as `operation.error`". That is true for the reactor and tests, but the docs say nothing about how an editor shows them (see Bugs 1-2).
- Modal guide: the `createDocument` modal does not say where the app goes after creation. In my run it stayed on the current page.
- Layout guide example for a replaced `_app.tsx` uses `createFileRoute("/_app")({ component: Layout })` without `...options`. The overrides guide says an override must spread `options`, or it loses its loader and title. The two disagree.
- `AGENTS.md` says `npm run tsc`, `npm run lint:fix`, and `npm run test:coverage`. The project uses pnpm, and I used `pnpm`.
- The document-model guide does not say what state type name to use for a model name with spaces. I used `InventoryItem` (no space) to match `<DocumentModelName>State`.
- The data guide's `useDocumentsOfType` example uses `ProductionLedger`. It was easy to map to `InventoryItem` from `document-models/inventory-item`, but the export name rule is only implied.
- The `_app` route's `pendingComponent` example works as documented. The `ph connect build` prerender output matched.
- The skill's "restart Vetra after creating the routes folder" is correct in practice, but I did not measure whether it is needed. Restart takes 60-90 s, and `/ready` returns 503 during it with no hint.

Tooling and output
- `ph-cli vetra` at startup logs `ERROR ... MetadataLookupWarning: received unexpected error = Request failed with status code 502` even when the rest is fine.
- `ph-cli connect build` prints 272 warning lines. 254 are `/*#__PURE__*/` comments from `@privy-io/react-auth`. Others are `node:fs/promises externalized`, `direct eval`, and `inlineDynamicImports option is deprecated`.
- Vetra writes `backup-documents/InventoryItem.inv.phd` into the project root, and the scaffold `.gitignore` does not ignore it. Codegen also rewrites `powerhouse.manifest.json` on every model or editor change, so that file shows up in every commit.
- Vite reloads the browser when `coverage/` is written during `test:coverage` while Vetra runs. Noise.
- A created document's operation list starts with `CREATE_DOCUMENT`, then an `UPGRADE_DOCUMENT` from version 0 to 1 at index 1, before my `ADD_ITEM` at index 0. Nothing explains the upgrade. I did not investigate it.
- Connect's create modal creates two docs with the same name as `gasket-tray` and `gasket-tray-copy-1`, and the copy slug shows in the URL with no hint.
- Studio home has a cookie prompt that blocks clicks. Every script had to dismiss it.

My own mistakes (not docs)
- Overwrote `hosts/connect/style.css` without reading it (fixed in a commit).
- Assumed `operations.global` always existed (crash, then Bug 1).
- A rejection banner keyed off an effect on operation count missed the error (Bugs 1-2).
- My first Studio test script clicked the wrong element, and an item that was on page 2 (fixed).

## Time and attempts (estimates)
| Step | Time | Attempts |
| --- | --- | --- |
| 0. Read AGENTS and guides | ~10 min | 1 |
| 1. Document model | ~15 min | 3 (MCP client, schema, batch) |
| 2. Editor | ~45 min | 5 (rejection design changed three times) |
| 3. Connect routes and checks | ~15 min | 2 (lint fix, Vetra restart) |
| 4. Browser flows and screenshots | ~40 min | ~12 script runs |
| Report | ~5 min | 1 |

## Ranked fixes

Docs (most helpful first)
1. `AGENTS.md`: correct the command names to `pnpm exec ph-cli` (or add a `ph` bin), and document the HTTP MCP handshake, tool names, and the action shape (`type`, `input`, `scope`).
2. An editor section in `AGENTS.md` or a guide: how an editor shows reducer errors. Name the `dispatch` callbacks and say which errors reach which (Bug 2). Say that the editor document has no operations today (Bug 1), or point at the GraphQL `documentOperations` query.
3. `customize-connect` layout guide: add `...options` to the replaced `_app.tsx` example, and fix the phone-sidebar claim (Bug 3).
4. `AGENTS.md`: name `SET_EDITOR_STATUS` / `CONFIRMED` in the editor publish step, and fix the operation count and versioning note.
5. The modal guide: say where the app navigates after a `createDocument` modal create.

Code (most helpful first)
1. Connect / `@powerhousedao/reactor-browser`: the editor's document should include operations, or expose a hook for operation errors. Also make `DocumentOperations` match runtime (Bug 1).
2. Connect / `dispatch`: report reducer errors through `onErrors` (or document that they don't) (Bug 2).
3. Connect generic `AppLayout` / `ConnectSidebar`: a 390px layout should show the sidebar as a bar and keep content in view (Bug 3). Confirm on a default project first.
4. Connect / sync: a document created in the browser should open right away (Bug 4).
5. `ph-cli`: the `ph` bin (or docs), quieter Vetra startup (502 noise), and fewer `connect build` warnings. Add `backup-documents/` to the scaffold `.gitignore`.

---

## Main session: verification and comparison with the earlier evals

This run used `fix/connect-field-test` @ `f304cbb`, which includes the fixes. The earlier evals used 190eb31. I re-checked the Haiku agent's main claims, because it reports with less certainty than the earlier runs.

### Confirmed: the phone layout still breaks with the layout guide's sidebar (Bug 3)

Measured in Studio at 390×844 (`isMobile`):

| `_app.tsx` | Nav | Page heading |
| --- | --- | --- |
| The project's (layout.md's pattern: `AppLayout` + `ConnectSidebar` + `extraItems`) | `0,0 259×844` | at x=414, off-screen |
| None (Connect's default) | `0,780 224×64`, a bar at the bottom | at x=24 |

- **Cause:** `AppLayout` in `@powerhousedao/connect/dist` uses `twMerge("flex h-full items-stretch overflow-auto", !sidebar && "max-sm:flex-col-reverse")`. Any `sidebar` prop, including `ConnectSidebar` itself, loses the column-reverse.
- **The doc says otherwise:** layout.md line 57 says "On a phone, `ConnectSidebar` is a bar under the page".
- **Fix options:** keep `max-sm:flex-col-reverse` when the sidebar is a `ConnectSidebar` (or always, letting a custom sidebar opt out), or let `ConnectSidebar` carry the phone layout itself.
- **Screenshots:** `verify/custom-inventory.png` and `verify/default-inventory.png`.

### Fixed since the earlier evals (from this run's screenshots and results)

- **Create modal from a page outside a drive** (B1/C1): items created from `/inventory` ("Gasket Tray" twice; `shots/06-created-via-modal.png`).
- **Custom home card hidden under the background** (B2/C2): the "Inventory" card shows next to the drive cards (`shots/11-home-light.png`).
- **The TanStack devtools badge over the Settings gear** (D12/C5): gone.
- **Router version:** `ph init` now adds `@tanstack/react-router` to the project.
- **Not reported this time:** a missing `lucide-react` or TS2883.
- **Row links:** they worked (the agent built them itself). `useDocumentLinkProps` now exists in reactor-browser.
- **Favicon:** the build links `icon.svg`, and the title is "Parts Connect".

### Still open, now reported by both blind runs independently

- **Editor errors:** `document.operations` is `{}` in Connect editors although typed as present (E1), and `dispatch`'s `onErrors` never fires for reducer errors (E2). An editor still can't show why a change was rejected; this agent fell back to diffing state before and after each dispatch.
- **Scaffold:** `backup-documents/` isn't in the scaffold's `.gitignore`.
- **Vite** reloads Studio when `coverage/` is written.
- **Noise:** Vetra's `ERROR MetadataLookupWarning … 502`, and about 270 `ph connect build` warnings (mostly `@privy-io` `/*#__PURE__*/`).
- **`AGENTS.md`'s MCP path:**
  - the confirm step doesn't name `SET_EDITOR_STATUS: CONFIRMED`;
  - tool names are given in `mcp__reactor-mcp__*` form;
  - `addActions` needs `scope` on every action, which isn't documented.

### New in this run, not verified by me

- After creating a document, the create modal stays on the current page rather than opening the new document. The doc doesn't say which happens.
- A document opened right after creation once showed "Document not found" (`KyselyDocumentView.resolveIdOrSlug`). It wasn't reproduced on a second try.
- MCP `getDocument` returns no operations; only GraphQL `documentOperations` has the errors.
- `ph` isn't a bin in the project, only `ph-cli`, so `pnpm exec ph …` fails. Docs say `ph …`, which assumes `ph-cmd` is installed globally; the docs could say so.
- **Docs inconsistency:** layout.md's replaced `_app.tsx` doesn't spread `options`, while overrides.md says overrides must, and `@powerhousedao/connect/routes/_app` does export `options`. In my first eval, `ph build` didn't warn about an `_app.tsx` without `options`. The docs should say whether the layout needs them.

### Not covered by this run

The runtime-package findings: R1 (Switchboard can't bind without IPv6) and R2 (`ph run connect dev` resolves the React shim to the wrong Vite cache). Commit faa1a32 ("a vite cache per server") may address R2; it needs a re-run of the runtime-package eval.
