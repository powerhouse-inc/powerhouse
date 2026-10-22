# Drive-app eval (Opus) on `fix/connect-field-test` @ `e51daa8`

This is the report the Opus subagent returned, saved by the main session. `REPORT.draft.md` is a draft found in its transcript.

I built everything asked for, and it works in Studio (`ph vetra`) and in the built Connect (`ph connect build` + `ph connect preview`). The docs never explain how to make a drive app or how to give one to an existing drive: I found both by reading the CLI help, the MCP schemas, the UI and package type files.

`tsc`, `lint`, the tests (100% reducer coverage) and `ph build` pass.
- **Time:** about 27 minutes in total (13:51 to 14:18 UTC).
- **Project:** `/tmp/connect-eval-drive-opus/stockroom-opus`, with 7 commits on top of `init`.
- **Files:** screenshots are in `shots/`, scripts in `scripts/` (`mcp.mjs` is the HTTP MCP client, `drive.mjs` the Playwright runner), and logs in `logs/`.
- **Servers:** Vetra and the preview server were stopped by PID. Port 8080 was not touched.

## What was built
- **Inventory item model** (`document-models/inventory-item/`, type `stockroom/inventory-item`): add, adjust and move operations, each with one error, and a scenario test.
- **Document editor** (`editors/inventory-item-editor/`): a form to register the item, then forms to adjust the quantity and move it.
- **Drive app** (`editors/stockroom-app/components/`):
  - a folder tree with a "new folder" form;
  - a table of the selected folder's items with a quantity total, and a "move to folder" select on each row;
  - a "+ New inventory item" button that opens Connect's create-document modal;
  - a list of other documents in the folder, and empty states;
  - the open document shown in place, with a back button. On phones the tree hides while a document is open.
- **Connect page** at `/stockroom` (`hosts/connect/routes/_app/stockroom.tsx`, with a sidebar link): it lists the drives and each one's app, has a "Use Stockroom app" button per drive, and can create an item from outside any drive.

## Step by step

### 1. Document model (~5 min, 1 attempt)
- **Docs:** the MCP workflow in `AGENTS.md` was right and enough. Code generation and tests passed first time.
- **Paper cuts:**
  - One batched `addActions` call printed 9 "⚠️ Skipped code generation … validation errors" blocks, one per intermediate operation. It reads like a failure.
  - Every `vitest` run warns that `vite-tsconfig-paths` is no longer needed. The warning comes from the template's `vitest.config.ts`.
  - `AGENTS.md` says to add documents with `addActions`/`ADD_FILE`, while the MCP tool's own description says `createDocument` with `driveId` is atomic. Both work; the docs disagree.

### 2. Editor (~3 min, plus one runtime fix later)
- **Docs:** the editor flow in `AGENTS.md` was right (MCP `powerhouse/document-editor`, set to CONFIRMED, then code generation).
- **Bug (`document-model` types / `reactor-browser`):** in Connect, `document.operations.global` is `undefined` at runtime but typed as never undefined.
  - I followed `AGENTS.md`'s error-testing pattern to show reducer errors.
  - oxlint's `no-unnecessary-condition` made me remove the `?.`, and the editor then crashed on open: `TypeError: Cannot read properties of undefined (reading 'at') at ItemForm`.
  - Repro: render `document.operations.global.length` in any editor.
  - Workaround: I validate in the form instead. No doc says how an editor should show reducer errors; `useDocumentOperations` exists but isn't documented.
- **Paper cut:** the generated `editor.tsx` starts with a blank line and isn't formatted.

### 3. Drive app (~12 min, ~5 of it looking for docs)
- **Docs, missing:** `AGENTS.md` never mentions drive apps. The customize-connect skill and its guides say only "Drive apps and editors come from packages, not routes" (`overrides.md`) and give fragments in `data-and-navigation.md` (props, `DriveProvider`).
- **How I found the way:** `ph-cli generate --help` (it lists `app`) and the MCP model list (it has a `powerhouse/app` "App Module"). I then followed the editor flow with MCP: name, document types, CONFIRMED.
- **Docs, wrong:** the App Module's description says the scaffold goes "under `apps/`"; it went to `editors/stockroom-app/`.
- **Undocumented contract:** the open document's editor reaches the drive app as `children`. I learned this from a comment in the scaffold.
- **Read from `.d.ts` files in `node_modules`:**
  - `addFolder` and `moveNode` from `@powerhousedao/shared/document-drive`, dispatched through `useSelectedDrive()`. `MOVE_NODE`'s `srcFolder` field actually takes any node's id, which is confusing.
  - `useNodeTarget` with `useLinkProps` for row links, `useDocumentsByIds`, and `DriveContextValue`.
  - The `reactor-browser` README has some of these hooks but isn't linked from the skill.
- **Bug (codegen scaffold):**
  - `FolderTree.tsx` labels the drive with `header.name`, which is `""` for drives created in the UI (their name is in `state.global.name`), so the tree root shows only an icon.
  - The scaffold also has 3 oxlint warnings, odd indentation, and a search box cut off at the bottom.
- **Confusing:** the generated `editor.tsx` says "DO NOT EDIT" but is the app's root component, and `AGENTS.md` says to edit the generated editor. I left it alone and worked in `components/`.
- **Worked as documented:**
  - Selecting folders and rows (`setSelectedNode`) navigates without a page reload; Back and Forward work.
  - `showCreateDocumentModal` creates the item in the open folder and opens it in place.
  - The toolbar's close (X) returns to the folder, and a reloaded deep link lands on the right folder.
  - Changes sync both ways: a move sent through MCP showed in the open app within 3 s, and moves and folders made in the UI reached the reactor.

### 4. Attaching the app to drives (~8 min, 4 failed attempts)
None of the docs (`AGENTS.md`, the skill, the guides) explain how a user picks a drive's app. What I found:
- **New drive in the UI:** the Create Drive modal has a "Drive App" picker. Stockroom App was preselected because it is listed first, ahead of Connect's own Drive Explorer. Picking Drive Explorer explicitly also works.
- **New drive through the reactor:** MCP `addDrive` accepts `driveInput.preferredEditor: "stockroom-app"`, stored as `header.meta.preferredEditor`. Connect doesn't list switchboard drives by itself; after I added it (Create New Drive → "Add Drive" tab, `http://localhost:7082/d/<id>`), Connect rendered our app.
- **Existing drive:** there is no UI for it.
  - Drive settings has only sharing, location and delete, and the Default Editors settings tab shows only "V2".
  - I found `baseActions.setPreferredEditor` in `@powerhousedao/shared`'s type files and built the `/stockroom` page to dispatch it.
  - Using it on "Vetra Preview" switched that drive from Drive Explorer to our app; the change synced to the switchboard, and Connect's drive route rendered our app.
- **Preferred app:** it is the same `preferredEditor` setting. The home cards show each drive's app name.
- **Bug (`reactor-mcp` `addActions`):** base actions are rejected.
  - Command: `addActions {documentId:"preview-10729350", actions:[{type:"SET_PREFERRED_EDITOR", scope:"global", input:{preferredEditor:"stockroom-app"}}]}`.
  - Error: `Operation "SET_PREFERRED_EDITOR" is not defined in any module of the document model`. The same happens with scopes `header` and `document`, and `SET_NAME` fails the same way.
  - So an agent following `AGENTS.md`'s "use MCP for everything" cannot rename a document or change a drive's app.
- **Bug (`reactor-mcp` `addDrive`):** `addDrive {driveInput:{global:{name:"Stockroom North"}}}` sets `header.name` but leaves `state.global.name` as `""`.
  - Connect's home card and sidebar then show the drive with no name.
  - The UI path does the opposite (`header.name` empty, `state.global.name` set).
  - I fixed it with `SET_DRIVE_NAME`. Repro: run that `addDrive`, then `getDrive`.
- **Paper cut:** `/stockroom` was a 404, and `tsc` failed with `TS2345 "/_app/stockroom" not assignable to undefined`, until I restarted Vetra. That matches what the docs say, but it is still surprising.

### 5. Creating an item from outside a drive (~2 min)
- **Docs:** `modals.md` was right.
- From `/stockroom`, the button opened `?modal=create-document&documentType=stockroom%2Finventory-item`.
  - With 4 drives the modal showed a "Drive" select starting at "Choose a drive"; with one drive (in the built Connect) it was preselected.
- After Create, Connect navigated without a reload to `/d/<drive-slug>/<doc-slug>`, at the drive's root, showing the drive's app with the new item's editor inside.

### 6. Checks (~8 min)
- `ph build`: 5 s, exit 0.
- `ph connect build`: 34 s, exit 0, but **2,912 lines** of output, including more than 260 third-party warnings (privy, ox, pglite) that would hide a real problem.
- In the built Connect (`ph connect preview --port 4182`, fresh browser profile) every flow passed: drive with the app, folders, items through the modal, row click, adjust, Back/Forward, X, name link, move, deep-link reload, and the outside-drive page.
- **Drives used:** Scaffold Test (created in the UI), Stockroom North (made through MCP, nested folders, 5 items plus a document of another type), Vetra Preview (existing, switched), Plain Drive (Drive Explorer), Built Stockroom (built Connect).
- **Light, dark and 390×844:** `shots/80-light-*`, `81-dark-*`, `82-phone-*` and `84-phone-v2-strip.png`. No horizontal page scroll.
- **Other bugs:**
  - **Connect home:** opening "Create New Drive" draws the drive cards' subtitles over the modal's tabs (`shots/03-zoom-overlap.png`).
  - **`ph-cli generate app`:**
    - `--dir stockroom-app` fails with "Path doesn't exist", and `--dir editors/stockroom-app` with "Failed to get data for app in dir".
    - `--all` prints nothing but **removes the app from `powerhouse.manifest.json`** (I reverted it).
    - `--extract` prints nothing and writes nothing.
  - **Vetra code generator, likely bug:** a document-model document in a *non-Vetra* drive (Stockroom North) triggered a generation attempt ("Skipped code generation for 'Spec sheet'"). A valid model there would be generated into the project. Just opening that document in its editor also sent operations.
- **Minor:**
  - On a phone, Connect's bottom bar shows 2 of 5 drives, and an icon overlaps the divider.
  - The cookie banner comes back on fresh pages.
  - Every Vetra start prints a `MetadataLookupWarning … 502` and a `PH_ATTACHMENT_URL_SIGNING_SECRET` warning.
  - `/ready` returns 200 about 4 s before the "MCP server available" log line.

## Ranked fixes

### Docs
1. **`AGENTS.md`: add a "Drive app creation flow".**
   - Create it with MCP `powerhouse/app` (name, document types, CONFIRMED); it lands in `editors/<name>/`.
   - Say which files to edit, given that `editor.tsx` says DO NOT EDIT.
   - The props: the drive, `dispatch`, and `children` for the open document.
   - Navigation: `useSelectedDrive`, `useSelectedFolder`, `setSelectedNode`.
   - Drive changes: `addFolder` and `moveNode` (and what `srcFolder` really means), and `showCreateDocumentModal`.
2. **The skill, plus a new guide `drive-apps.md`, on how a drive's app is chosen.**
   - The Create Drive picker, and the default app.
   - `preferredEditor`: MCP `addDrive`, `header.meta`, `baseActions.setPreferredEditor` and `setPreferredEditorOnNode`.
   - That no UI changes an existing drive's app.
   - Add it as a row in `SKILL.md`'s table, which has none for drive apps today.
3. **`data-and-navigation.md`:** document `children` for drive apps, `useNodeTarget`, `useDocumentsByIds`, and that documents in Connect don't carry their operations (or how to read errors with `useDocumentOperations`).
4. **App Module description:** say `editors/`, not `apps/`. Explain the manifest's `apps[].documentTypes` versus the module's `allowedDocumentTypes`.
5. **`AGENTS.md`:**
   - Use `createDocument` with `driveId` in the editor flow.
   - Note that MCP can't send `SET_NAME` or `SET_PREFERRED_EDITOR`.
6. **Connect `README.md`:** it links `CUSTOMIZING.md`, which isn't in the package.

### Code
1. **`@powerhousedao/reactor-mcp`:** accept base actions in `addActions`, and have `addDrive` set `state.global.name`.
2. **`document-model` types / `@powerhousedao/reactor-browser`:** `operations.global` should match runtime: either load the operations or type them as optional. Today the linter pushes you into the crash.
3. **`@powerhousedao/codegen` app scaffold:**
   - Use `state.global.name` for the drive's name.
   - Fix the lint warnings and formatting.
   - Drop "DO NOT EDIT" from the root component.
   - Make `ph generate app --dir/--all/--extract` work for apps made through MCP, and never drop them from the manifest.
4. **`@powerhousedao/connect`:**
   - Add a UI to change an existing drive's app, e.g. in drive settings.
   - Fix the home cards drawing over the add-drive modal.
   - Don't preselect a package's app ahead of the default in Create Drive.
5. **Vetra code generator (in `ph-cli`):** only react to documents in the Vetra drive. Print one "skipped" message per batch, not per operation.
6. **`ph connect build`:** filter the third-party Rolldown `INVALID_ANNOTATION`/`EVAL` warnings.

---

## Main session: verification

Reproduced on the agent's project after it finished, at `e51daa8`:

- **MCP `addActions` rejects base actions.** `addActions {documentId:"preview-10729350", actions:[{type:"SET_NAME", scope:"global", input:"Preview renamed"}]}` returns `Invalid action … Operation "SET_NAME" is not defined in any module of the document model`.
- **MCP `addDrive` doesn't set the drive's display name.** `addDrive {driveInput:{global:{name:"Verify Drive"}}}`, then `getDrive`, gives `header.name: "Verify Drive"` and `state.global.name: ""`.
- **`ph-cli generate app --all` silently drops the app.** It prints nothing and exits 0, and the manifest's `apps` goes from `[{"name":"Stockroom App","id":"stockroom-app",…}]` to `[]`. Reverted in the project afterwards.
- **The drive-app scaffold names the drive from `header.name`.** The first commit's `FolderTree.tsx` has `const driveName = selectedDrive?.header.name ?? ""`, which is empty for drives made in the UI.
- **The Create Drive modal is drawn under the home's drive cards** (`shots/03-zoom-overlap.png`): the cards' titles and subtitles paint over the modal's tabs. This is likely a regression from the home-parts fix that lifted the cards above the home background.

Not re-checked: the other claims, including the E1 crash (already reported by both earlier blind runs), the missing UI to change an existing drive's app, the Create Drive preselection, and the code generator reacting outside the Vetra drive.
