import {
  isFileNodeKind,
  isFolderNodeKind,
  showCreateDocumentModal,
  useSelectedDrive,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import { Suspense, useMemo } from "react";
import { ItemsTable } from "./ItemsTable.js";
import { OtherDocuments } from "./OtherDocuments.js";

export const INVENTORY_TYPE = "stockroom/inventory-item";

/** The selected folder: its inventory items as a table, and its other documents. */
export function FolderContents() {
  const [drive] = useSelectedDrive();
  const folder = useSelectedFolder();
  const folderId = folder?.id ?? null;
  const nodes = drive.state.global.nodes;

  const { items, others } = useMemo(() => {
    const files = nodes
      .filter(isFileNodeKind)
      .filter((n) => (n.parentFolder ?? null) === folderId);
    return {
      items: files.filter((n) => n.documentType === INVENTORY_TYPE),
      others: files.filter((n) => n.documentType !== INVENTORY_TYPE),
    };
  }, [nodes, folderId]);
  const driveHasItems = nodes.some(
    (n) => isFileNodeKind(n) && n.documentType === INVENTORY_TYPE,
  );
  const folders = nodes.filter(isFolderNodeKind);

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-muted-foreground text-xs">
            {drive.state.global.name || drive.header.name}
          </p>
          <h1 className="text-xl font-semibold" data-testid="folder-title">
            {folder?.name ?? "All stock (drive root)"}
          </h1>
        </div>
        <button
          type="button"
          className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium"
          onClick={() => showCreateDocumentModal(INVENTORY_TYPE)}
        >
          + New inventory item
        </button>
      </header>

      {items.length > 0 ? (
        <Suspense
          fallback={<p className="text-muted-foreground text-sm">Loading…</p>}
        >
          <ItemsTable nodes={items} folders={folders} />
        </Suspense>
      ) : (
        <EmptyItems driveHasItems={driveHasItems} inFolder={!!folder} />
      )}

      {others.length > 0 && <OtherDocuments nodes={others} />}
    </div>
  );
}

function EmptyItems(props: { driveHasItems: boolean; inFolder: boolean }) {
  return (
    <div
      className="border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center"
      data-testid="empty-items"
    >
      <p className="text-foreground font-medium">
        {props.driveHasItems
          ? `No inventory items in this ${props.inFolder ? "folder" : "drive's root"}`
          : "This stockroom has no inventory items yet"}
      </p>
      <p className="mt-1 text-sm">
        Use “New inventory item” to add one here
        {props.driveHasItems ? ", or pick another folder." : "."}
      </p>
    </div>
  );
}
