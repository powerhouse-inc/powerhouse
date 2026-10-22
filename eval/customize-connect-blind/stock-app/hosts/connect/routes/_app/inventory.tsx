import {
  loadDocumentsOfType,
  useDocumentsOfType,
} from "@powerhousedao/reactor-browser";
import { createFileRoute, Link } from "@tanstack/react-router";
import { InventoryItem } from "document-models/inventory-item";
import { Boxes } from "lucide-react";
import { Suspense } from "react";
import {
  OpenDocumentLink,
  NewItemInDriveLinks,
  useDocumentLocations,
} from "../-components/inventory-links.js";
import {
  getStockSettings,
  useStockSettings,
} from "../-components/settings-store.js";

export const Route = createFileRoute("/_app/inventory")({
  staticData: { nav: { label: "Inventory", icon: Boxes, order: 10 } },
  head: ({ match }) => ({
    meta: [{ title: `Inventory · ${match.context.appName ?? "Connect"}` }],
  }),
  // The first page arrives with the route, so the list doesn't suspend.
  loader: () =>
    loadDocumentsOfType(InventoryItem, { limit: getStockSettings().pageSize }),
  component: InventoryPage,
});

function InventoryPage() {
  const { pageSize } = useStockSettings();
  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Inventory</h1>
          <p className="text-muted-foreground text-sm">
            Every inventory item, from every drive.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/stock-report"
            className="border-border rounded-md border px-4 py-2 text-sm"
          >
            Stock report
          </Link>
        </div>
      </header>
      <NewItemInDriveLinks />
      <Suspense fallback={<p role="status">Loading items…</p>}>
        <ItemList key={pageSize} pageSize={pageSize} />
      </Suspense>
    </div>
  );
}

function ItemList({ pageSize }: { pageSize: number }) {
  const { documents, invalid, hasNextPage, isLoadingNextPage, loadNextPage } =
    useDocumentsOfType(InventoryItem, { limit: pageSize });
  const locations = useDocumentLocations();
  const { lowStockThreshold } = useStockSettings();

  if (documents.length === 0) {
    return (
      <p className="text-muted-foreground">
        No inventory items yet. Pick a drive above to create one.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <table
        className="w-full text-left text-sm [&_td]:px-3 [&_th]:px-3"
        aria-label="Inventory items"
      >
        <thead className="text-muted-foreground border-border border-b">
          <tr>
            <th className="py-2">Item</th>
            <th>SKU</th>
            <th className="text-right">On hand</th>
            <th>Location</th>
            <th>Drive</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => {
            const { name, sku, quantity, location } = doc.state.global;
            const where = locations.get(doc.header.id);
            const low = name !== null && quantity <= lowStockThreshold;
            const label = name ?? `${doc.header.name} (not added yet)`;
            return (
              <tr key={doc.header.id} className="border-border border-b">
                <td className="py-2">
                  {where ? (
                    <OpenDocumentLink
                      driveSlug={where.driveSlug}
                      nodeSlug={where.nodeSlug}
                    >
                      {label}
                    </OpenDocumentLink>
                  ) : (
                    label
                  )}
                </td>
                <td>{sku ?? "—"}</td>
                <td
                  className={`text-right tabular-nums ${low ? "text-destructive font-semibold" : ""}`}
                >
                  {quantity}
                  {low && <span className="sr-only"> (low stock)</span>}
                </td>
                <td>{location ?? "—"}</td>
                <td className="text-muted-foreground">
                  {where?.driveName ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground" data-testid="shown-count">
          Showing {documents.length}
          {hasNextPage ? "+" : ""} items
        </span>
        {hasNextPage && (
          <button
            type="button"
            className="border-border rounded-md border px-3 py-1"
            disabled={isLoadingNextPage}
            onClick={() => loadNextPage()}
          >
            {isLoadingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
        {invalid.length > 0 && (
          <span className="text-destructive">
            {invalid.length} item(s) failed the schema
          </span>
        )}
      </div>
    </div>
  );
}
