import {
  showCreateDocumentModal,
  useDocumentById,
  useDrives,
  useLinkProps,
} from "@powerhousedao/reactor-browser";
import { createFileRoute } from "@tanstack/react-router";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { baseActions } from "document-model";

const APP_ID = "stockroom-app";

export const Route = createFileRoute("/_app/stockroom")({
  staticData: { nav: { label: "Stockroom", order: 10 } },
  head: ({ match }) => ({
    meta: [{ title: `Stockroom · ${match.context.appName ?? "Connect"}` }],
  }),
  component: StockroomPage,
});

/** Outside any drive: lists drives, sets the Stockroom app on them, creates items. */
function StockroomPage() {
  const drives = useDrives();
  return (
    <div className="bg-background text-foreground flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Stockroom</h1>
        <button
          type="button"
          className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
          onClick={() => showCreateDocumentModal("stockroom/inventory-item")}
        >
          + New inventory item
        </button>
      </header>
      <section>
        <h2 className="text-muted-foreground mb-2 text-xs font-semibold uppercase">
          Drives
        </h2>
        <ul className="border-border divide-border divide-y rounded-lg border">
          {drives?.map((drive) => (
            <DriveRow key={drive.header.id} drive={drive} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function DriveRow({ drive }: { drive: DocumentDriveDocument }) {
  // useDrives() gives the drives; useDocumentById gives a dispatch bound to one.
  const [, dispatch] = useDocumentById(drive.header.id);
  const link = useLinkProps({ driveSlug: drive.header.slug });
  const name = drive.state.global.name || drive.header.name;
  const app = drive.header.meta?.preferredEditor;
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
      <a {...link} className="font-medium hover:underline">
        {name || drive.header.id}
      </a>
      <span className="text-muted-foreground font-mono text-xs">
        app: {app ?? "(default)"}
      </span>
      {app === APP_ID ? (
        <span className="text-xs">Stockroom app ✓</span>
      ) : (
        <button
          type="button"
          className="bg-secondary text-secondary-foreground rounded-md px-2 py-1 text-xs"
          onClick={() => dispatch(baseActions.setPreferredEditor(APP_ID))}
        >
          Use Stockroom app
        </button>
      )}
    </li>
  );
}
