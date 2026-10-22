# Targeted re-check: `fix/connect-field-test` @ `a4abd20`

This checks the fixes made since the Haiku run (`f304cbb` → `a4abd20`: 14 files, +101/−18), against the findings they target.

**Setup:**
- Rebuilt the monorepo at `a4abd20` and republished the 38 workspace packages (still `6.2.3-dev.69`) and `stock-app@1.0.0` to the local registry.
- Reinstalled `parts-app` (the Haiku eval's project) and `consumer-app` (the runtime-package eval's project) from scratch: lockfiles deleted, so they pick up the new content at the same version.
- Confirmed that the installed `@powerhousedao/connect` contains `isConnectSidebar`, and that the installed `builder-tools` contains `devUrlOf` and the `**/coverage/**` ignore.

## Results

| # | Check | Result |
| --- | --- | --- |
| 1 | Phone layout (390×844) with the project's `_app.tsx` (`AppLayout` + `ConnectSidebar` + `extraItems`, layout.md's pattern) | **Fixed.** Nav is `0,780 259×64`, a bar at the bottom; the heading is at x=24 (before: a full-height nav and the heading at x=414) |
| 1a | Same, with `ConnectSidebar` rendered by a project component (`sidebar={<MySidebar />}`, where `MySidebar` returns `<ConnectSidebar …/>`) | **Still broken.** Nav is `0,0 224×844`; the heading is at x=414, off-screen |
| 1b | Same, with a project's own `<nav>` as `sidebar` | As documented: it keeps its place (a left column, heading at x=184) |
| 2 | `pnpm test:coverage` while Vetra runs | **Fixed.** `coverage/` was written, and Studio logged no reload |
| 3 | `useDocumentsOfType`: load every page (10 + 10 = 20), then create a document through GraphQL | **Fixed.** 21 rows, the new item present, no row dropped |
| 4 | `FEATURE_UNIFORM_RUNNERS_ENABLED=1 ph init` | **Writes the hosts:** `hosts/README.md`, plus `host.js` for `connect`, `switchboard`, `vetra`, `cli`, `desktop` and `assistant`. Drives are declared under `reactor.drives`. `.gitignore` has `backup-documents` and `coverage` |
| 5 | `ph run switchboard` without the IPv4 preload (R1) | **Still broken.** `listen EAFNOSUPPORT: address family not supported :::4415`. Nothing addressed it |
| 6 | `ph run connect dev` loading `stock-app@1.0.0` from the registry (R2) | **The React shim is fixed** (no `.vite/deps/react.js` 404), **but the package still doesn't load:** see N1 |
| 7 | The dev `node_modules` probe (R6) | **Partly fixed.** It probes the bare name (`/node_modules/stock-app/…`) and logs "isn't in node_modules; loading it from the registry" at debug level, but the browser still logs `Failed to load resource: … 404` as a console error |
| 8 | `ph run connect build` + `serve` on the new code | **Still works.** No 4xx at all. Package, routes, editor and styles all load. An edit reached Switchboard (Hex bolts 100 → 80), and all three settings tabs, the stock report and the cross-drive list render |

## New finding

### N1 (high). No dev server loads a runtime registry package that imports `document-model`

- **Symptom:** in both `ph run connect dev` (host runner) and the classic `ph connect studio`:
  ```
  [Connect][PackageManager] Failed to install package "stock-app@1.0.0": Failed to resolve module specifier "document-model". Relative references must start with either "/", "./", or "../".
  ```
- **Cause:**
  - The dev server's import map maps only React: `react`, `react-dom`, `react/jsx-runtime`, `react/jsx-dev-runtime` and `react-dom/client`.
  - The built Connect's import map also maps `document-model`, `zod`, `@powerhousedao/reactor-browser` and the design system's entry points.
  - A package's browser build imports `document-model` and `zod` as bare specifiers (here from `document-models-*.js`), so the browser can't resolve them in dev.
  - Before `a4abd20`, the React 404 (R2) failed first and hid this.
- **Effect:** a registry package works in a built Connect but in no dev server. That covers every editor package, since editors import `document-model`.
- **Package:** `builder-tools`, the dev import map (`dev-external-react.ts` maps React only). The dev server should map the same shared externals the build maps, presumably through the same pre-bundled vendor or Vite's optimized deps.

## Still open from earlier reports (not targeted by these commits)

- **R1:** Switchboard can't start without IPv6. `@powerhousedao/switchboard`'s `isPortAvailable` probes `host: "::"`.
- **Phone layout with a wrapped `ConnectSidebar`** (1a). The new check compares the element's `type` with `Sidebar`, so any wrapper component fails it. A wrapper is a common pattern for reading hooks (e.g. `useSidebarMode`) before rendering `ConnectSidebar`.

  Fix options: let `ConnectSidebar` carry its own phone placement (e.g. `max-sm:order-last` on itself); or mark it with a data attribute that `AppLayout` styles from CSS (`max-sm:has-[>[data-connect-sidebar]]:flex-col-reverse`); or document that the element must be `ConnectSidebar` itself.
- **E1/E2** (both blind runs): an editor can't see reducer errors (`document.operations` is `{}`, and `onErrors` doesn't fire).
- **`AGENTS.md`'s MCP gaps:** the `SET_EDITOR_STATUS: CONFIRMED` step, the tool names, and `scope` on `addActions` actions.
- **Noise:** Vetra's `MetadataLookupWarning … 502`, and the `ph connect build` warnings.
- **Hosts:** the flag-only scaffold above (`hosts/README.md` and the switchboard and compound hosts) answers most of R3. A project created without the flag gets none of it, and the shipped guides still don't describe the Switchboard or compound hosts beyond "under the flag".

## Files

- `shots/phone-*`: the phone checks. `-custom` is the project's layout; `wrapped` and `ownnav` are the two edge cases, printed as JSON only.
- `shots/rows-after-create.png`: the row check.
- `shots/light-*`: the served Connect walk-through.
- `scripts/`:
  - `phone.mjs`;
  - `rows.mjs`;
  - `fail2.mjs`: failed requests and package-manager console lines;
  - `full.mjs`: the served walk-through.
