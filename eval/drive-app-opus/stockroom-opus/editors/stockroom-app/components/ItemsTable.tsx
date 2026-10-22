import {
  setSelectedNode,
  useDocumentsByIds,
  useLinkProps,
  useNodeTarget,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import type {
  FileNode,
  FolderNode,
} from "@powerhousedao/shared/document-drive";
import { moveNode } from "@powerhousedao/shared/document-drive";
import { isInventoryItemDocument } from "document-models/inventory-item";
import type { InventoryItemDocument } from "document-models/inventory-item";

type Row = { node: FileNode; doc: InventoryItemDocument | undefined };

/** Inventory items of one folder, with a quantity total. Suspends while loading. */
export function ItemsTable(props: {
  nodes: FileNode[];
  folders: FolderNode[];
}) {
  const docs = useDocumentsByIds(props.nodes.map((n) => n.id));
  const byId = new Map(
    docs.filter(isInventoryItemDocument).map((d) => [d.header.id, d]),
  );
  const rows: Row[] = props.nodes.map((node) => ({
    node,
    doc: byId.get(node.id),
  }));
  const total = rows.reduce(
    (sum, r) => sum + (r.doc?.state.global.quantity ?? 0),
    0,
  );

  return (
    <div className="border-border overflow-x-auto rounded-lg border">
      <table className="w-full text-sm" data-testid="items-table">
        <thead className="bg-muted text-muted-foreground text-left text-xs uppercase">
          <tr>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="hidden px-3 py-2 sm:table-cell">Location</th>
            <th className="px-3 py-2">Folder</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <ItemRow key={row.node.id} row={row} folders={props.folders} />
          ))}
        </tbody>
        <tfoot>
          <tr className="border-border border-t font-semibold">
            <td className="px-3 py-2">
              Total ({rows.length} {rows.length === 1 ? "item" : "items"})
            </td>
            <td className="px-3 py-2 text-right" data-testid="qty-total">
              {total}
            </td>
            <td className="hidden sm:table-cell" />
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function ItemRow({ row, folders }: { row: Row; folders: FolderNode[] }) {
  const [, dispatch] = useSelectedDrive();
  const link = useLinkProps(useNodeTarget(row.node));
  const state = row.doc?.state.global;
  return (
    <tr
      className="border-border hover:bg-muted cursor-pointer border-t"
      onClick={() => setSelectedNode(row.node)}
      data-testid="item-row"
    >
      <td className="px-3 py-2 font-medium">
        <a
          {...link}
          onClick={(e) => {
            e.stopPropagation();
            link.onClick(e);
          }}
          className="hover:underline"
        >
          {state?.name ?? row.node.name}
        </a>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {state?.quantity ?? "–"}
      </td>
      <td className="hidden px-3 py-2 sm:table-cell">
        {state?.location ?? "—"}
      </td>
      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
        <select
          aria-label={`Move ${row.node.name} to folder`}
          value={row.node.parentFolder ?? ""}
          onChange={(e) =>
            dispatch(
              moveNode({
                srcFolder: row.node.id,
                targetParentFolder: e.target.value || null,
              }),
            )
          }
          className="border-border bg-background rounded-md border px-1 py-1 text-xs"
        >
          <option value="">(drive root)</option>
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
