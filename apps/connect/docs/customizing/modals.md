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

A plain `<a href={modalHref(modal)}>` reloads the app. To open a routed modal in the app, show it on a plain click and leave new tabs to the browser:

```tsx
import { isPlainClick, modalHref, showPHModal } from "@powerhousedao/reactor-browser";

const modal = { type: "createDocument", documentType: "powerhouse/todo" } as const;

<a
  href={modalHref(modal)}
  onClick={(event) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    showPHModal(modal);
  }}
>
  New todo list
</a>;
```

## Replace a modal's view

A route's `staticData.modals` replaces the host's view of a modal while the route matches; the deepest matched route wins. The view reads the modal with `usePHModal()`:

```tsx
// hosts/connect/routes/_app.tsx
import { ModalDialog } from "@powerhousedao/connect/layout";
import { closePHModal, usePHModal } from "@powerhousedao/reactor-browser";

export const Route = createFileRoute("/_app")({
  component: Layout,
  staticData: { modals: { createDocument: CreateTodoList } },
});

function CreateTodoList() {
  const modal = usePHModal();
  if (modal?.type !== "createDocument") return null;
  return (
    <ModalDialog labelledBy="new-todo-list" className="rounded-xl p-6">
      <h2 id="new-todo-list">New {modal.documentType}</h2>
      <button onClick={closePHModal}>Cancel</button>
    </ModalDialog>
  );
}
```

- `ModalDialog` opens the view as a modal, centred, with a backdrop; Escape and a click on the backdrop close it. A plain `<dialog open>` gets none of that.

- On an override of one of Connect's routes, spread `options.staticData` first if it has any.
- A view that throws closes quietly; the error is logged.

## Frame every modal

A frame applies only in a host whose composition leaves out the generic plugin: the generic plugin, active in a default Connect, draws every modal with the design system.

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
- It frames core's modals only. Views a route gives in `staticData.modals` draw their own.
- The content and buttons keep core's markup; style them from the frame, e.g. with `[&_button]:…` classes.

