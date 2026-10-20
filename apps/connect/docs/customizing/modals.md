# Modals

Editors, drive apps and Connect open modals with `showPHModal(modal)` from `@powerhousedao/reactor-browser`; the open modal's view reads it with `usePHModal()` and closes it with `closePHModal()`.

**Routed modals live in the URL:** `?modal=<id>` plus their fields. A link opens them (`modalHref(modal)` gives the href) and a reload keeps them open. Opening and closing replace the current history entry, so a modal is never a step of its own: Back leaves the page, not the modal.

| Modal | `?modal=` | Owner |
| --- | --- | --- |
| `createDocument` | `create-document&documentType=…[&documentModelVersion=…]` | core |
| `login` | `login` | core |
| `addDrive` | `add-drive` | generic |
| `driveSettings` | `drive-settings&driveId=…` | generic |
| `debugSettings`, `inspector` | `debug-settings`, `inspector` | generic |
| `disclaimer` | `disclaimer` | generic |
| `cookiesPolicy` | `cookies-policy` | Connect (analytics consent) |

**Confirmations and notices stay out of the URL:** `deleteItem`, `confirmDocumentUpgrade`, `downloadDocumentWithErrors`, `documentVersionUnsupported` and `driveAuthRequired` (core's), `deleteDrive`, `upgradeDrive` and `clearStorage` (generic's), and `openFileDocuments` (Connect's file handler).

- **Core** has a plain view for each of its modals, so every host can show what editors and drive apps open.
- **With the generic plugin**, Connect shows its design-system views for all of them; without it, core's.

## Replace a modal's view

A route's `staticData.modals` replaces the host's view of a modal while the route matches; the deepest matched route wins. The view reads the modal with `usePHModal()`:

```tsx
// hosts/connect/routes/_app.tsx
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";

export const Route = createFileRoute("/_app")({
  component: Layout,
  staticData: { modals: { createDocument: CreateTodoList } },
});

function CreateTodoList() {
  const modal = usePHModal();
  if (modal?.type !== "createDocument") return null;
  return (
    <dialog open>
      New {modal.documentType}
      <button onClick={closePHModal}>Cancel</button>
    </dialog>
  );
}
```

- On an override of one of Connect's routes, spread `options.staticData` first if it has any.
- A view that throws closes quietly; the error is logged.

## Frame every modal

A route's `staticData.modalFrame` lays out every core modal while the route matches, so one component restyles all of them. Each modal passes its title, content and buttons; `ModalDialog` keeps the dialog's behaviour (modal, Escape and the backdrop close it):

```tsx
// hosts/connect/routes/_app.tsx
import type { ModalFrameProps } from "@powerhousedao/connect/layout";
import { ModalDialog } from "@powerhousedao/connect/layout";

export const Route = createFileRoute("/_app")({
  component: Layout,
  staticData: { modalFrame: Frame },
});

function Frame({ title, titleId, actions, children }: ModalFrameProps) {
  return (
    <ModalDialog labelledBy={titleId} className="rounded-xl p-0 shadow-2xl">
      <h2 id={titleId}>{title}</h2>
      <div>{children}</div>
      <footer>{actions}</footer>
    </ModalDialog>
  );
}
```

- The deepest matched route's frame wins, as with `staticData.modals`. On `_app` it frames the modals opened inside the layout; on the root route, all of them.
- It frames core's modals. The generic plugin's design-system modals, and views a route gives in `staticData.modals`, draw their own.
- The content and buttons keep core's markup; style them from the frame, e.g. with `[&_button]:…` classes.

