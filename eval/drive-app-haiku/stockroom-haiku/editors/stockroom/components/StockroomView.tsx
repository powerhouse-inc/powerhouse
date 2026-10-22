import { generateId } from "document-model";
import { addFolder, moveNode } from "@powerhousedao/shared/document-drive";
import type { Node } from "@powerhousedao/shared/document-drive";
import {
  isFileNodeKind,
  isFolderNodeKind,
  setSelectedNode,
  showPHModal,
  useDocumentLinkProps,
  useNodesInSelectedDrive,
  useSelectedDrive,
  useSelectedFolder,
} from "@powerhousedao/reactor-browser";
import type { InventoryItemDocument } from "document-models/inventory-item";
import { useInventoryItemDocumentsInSelectedDrive } from "document-models/inventory-item";
import { useState } from "react";
import { driveName } from "./drive-name.js";

const ITEM_TYPE = "stockroom/inventory-item";

/** The drive view with no document open: items, folders and a total for the selected folder. */
export function StockroomView() {
  const [drive, dispatch] = useSelectedDrive();
  const folder = useSelectedFolder();
  const allNodes = useNodesInSelectedDrive() ?? [];
  const allItems = useInventoryItemDocumentsInSelectedDrive() ?? [];
  // The selected-folder hooks return nothing at the drive root, so filter the drive by parent instead.
  const currentParent = folder?.id ?? null;
  const inCurrentFolder = (node: Node | undefined) => (node?.parentFolder ?? null) === currentParent;
  const folderNodes = allNodes.filter(inCurrentFolder);
  const items = allItems.filter((doc) => inCurrentFolder(allNodes.find((n) => n.id === doc.header.id)));
  const [folderName, setFolderName] = useState("");

  const subfolders = folderNodes.filter(isFolderNodeKind);
  const otherDocs = folderNodes.filter(
    (node) => isFileNodeKind(node) && node.documentType !== ITEM_TYPE,
  );
  const allFolders = allNodes.filter(isFolderNodeKind);
  const total = items.reduce((sum, doc) => sum + doc.state.global.quantity, 0);
  const place = folder?.name ?? driveName(drive);

  function handleAddFolder(event: React.FormEvent) {
    event.preventDefault();
    const name = folderName.trim();
    if (!name) return;
    dispatch(addFolder({ id: generateId(), name, parentFolder: folder?.id }));
    setFolderName("");
  }

  function handleNewItem() {
    showPHModal({
      type: "createDocument",
      documentType: ITEM_TYPE,
      driveId: drive.header.id,
    });
  }

  const empty =
    items.length === 0 && subfolders.length === 0 && otherDocs.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{place}</h2>
        <button type="button" onClick={handleNewItem}>
          New inventory item
        </button>
      </header>

      <form className="flex flex-wrap items-center gap-2" onSubmit={handleAddFolder}>
        <input
          aria-label="New folder name"
          placeholder="Folder name"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
        />
        <button type="submit">Add folder</button>
      </form>

      {subfolders.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Folders</h3>
          <ul className="flex flex-wrap gap-2">
            {subfolders.map((node) => (
              <li key={node.id}>
                <button type="button" onClick={() => setSelectedNode(node.id)}>
                  {node.name}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {items.length > 0 && (
        <section className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="p-2">Item</th>
                <th className="p-2">Quantity</th>
                <th className="p-2">Location</th>
                <th className="p-2">Folder</th>
              </tr>
            </thead>
            <tbody>
              {items.map((doc) => (
                <ItemRow
                  key={doc.header.id}
                  doc={doc}
                  node={allNodes.find((n) => n.id === doc.header.id)}
                  folders={allFolders}
                />
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="p-2">Total</td>
                <td className="p-2">{total}</td>
                <td className="p-2" />
                <td className="p-2" />
              </tr>
            </tfoot>
          </table>
        </section>
      )}

      {otherDocs.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Other documents</h3>
          <ul className="flex flex-col gap-1">
            {otherDocs.map((node) => (
              <OtherDocRow key={node.id} node={node} />
            ))}
          </ul>
        </section>
      )}

      {empty && (
        <p className="text-muted-foreground">
          Nothing in {place} yet. Create an inventory item or a folder to get started.
        </p>
      )}
    </div>
  );
}

function ItemRow({
  doc,
  node,
  folders,
}: {
  doc: InventoryItemDocument;
  node: Node | undefined;
  folders: Node[];
}) {
  const [, dispatch] = useSelectedDrive();
  const link = useDocumentLinkProps(doc.header.id);
  const parent = node?.parentFolder ?? "";

  return (
    <tr
      className={link ? "cursor-pointer border-t hover:bg-muted/50" : "border-t"}
      onClick={(event) => {
        // A click on the folder picker moves the item; any other click opens it.
        if (!link || (event.target as HTMLElement).closest("select")) return;
        link.onClick(event);
      }}
    >
      <td className="p-2">
        {link ? <a {...link}>{doc.header.name}</a> : doc.header.name}
      </td>
      <td className="p-2">{doc.state.global.quantity}</td>
      <td className="p-2">{doc.state.global.location ?? "-"}</td>
      <td className="p-2">
        <select
          aria-label={`Folder for ${doc.header.name}`}
          value={parent}
          onChange={(e) =>
            dispatch(
              moveNode({
                srcFolder: doc.header.id,
                targetParentFolder: e.target.value || undefined,
              }),
            )
          }
        >
          <option value="">Drive root</option>
          {folders.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      </td>
    </tr>
  );
}

function OtherDocRow({ node }: { node: Node }) {
  const link = useDocumentLinkProps(node.id);
  const type = isFileNodeKind(node) ? node.documentType : "";
  return (
    <li className="flex flex-wrap items-center gap-2">
      {link ? <a {...link}>{node.name}</a> : node.name}
      <span className="text-xs text-muted-foreground">{type}</span>
    </li>
  );
}
