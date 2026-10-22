# Changes at `e51daa8`: a diff review, not tested

`fix/connect-field-test` was force-pushed again, after the targeted re-check of `a4abd20` (`../targeted-recheck/`). Against `a4abd20`, the content changed in 6 files (+22/−5). This is a review of that diff; nothing here was rebuilt or run.

## What changed

| Change | Finding it answers | Where |
| --- | --- | --- |
| After Create, the create-document modal opens the new document in its drive (`openTarget(getNodeTarget(node, drive))`, replacing `setSelectedNode(node)`), wherever the modal was opened. A test covers a modal opened on home. | Haiku run: "Modal create worked in place but stayed on /inventory afterwards" | `packages/connect-core/src/views/modals.tsx`, `apps/connect/src/generic/modals/CreateDocumentModal.tsx`, `packages/connect-core/test/core-views.test.tsx`; `modals.md` updated |
| layout.md's replaced `_app.tsx` example imports `options` from `@powerhousedao/connect/routes/_app` and spreads them ("Empty today; spread so an option Connect adds later isn't dropped") | Haiku run: layout.md and overrides.md disagreed on spreading `options` | `apps/connect/docs/customizing/layout.md` |
| `SKILL.md`: "`ph` is the global Powerhouse CLI (`ph-cmd`). A project without it runs the same commands with `pnpm exec ph-cli`" | Haiku run: `pnpm exec ph` fails in the project; the docs say `ph` | `apps/connect/skills/customize-connect/SKILL.md` |

Only the first change alters behaviour. To check it: rebuild and republish at `e51daa8`, reinstall `parts-app`, create from `/inventory` through the modal, and confirm the browser lands on `/d/<drive>/<new document>`.

## Not addressed yet (from `../targeted-recheck/REPORT.md` and earlier)

- **N1 (high):** no dev server (`ph run connect dev` or `ph connect studio`) loads a runtime registry package that imports `document-model`. The dev import map maps only React (`builder-tools`).
- **Phone layout with a wrapped `ConnectSidebar`:** `AppLayout`'s `isConnectSidebar` compares the element's type, so a project component that renders `ConnectSidebar` still loses the phone layout.
- **R1:** Switchboard can't start without IPv6 (`@powerhousedao/switchboard`'s `isPortAvailable` probes `host: "::"`).
- **E1/E2** (both blind runs): an editor can't see reducer errors. `document.operations` is `{}` in Connect editors, and `dispatch`'s `onErrors` doesn't fire.
- **`AGENTS.md`'s MCP gaps:** the `SET_EDITOR_STATUS: CONFIRMED` step, the tool names, and `scope` on `addActions` actions.
- **Noise:** Vetra's `MetadataLookupWarning … 502`, and the `ph connect build` warnings.
