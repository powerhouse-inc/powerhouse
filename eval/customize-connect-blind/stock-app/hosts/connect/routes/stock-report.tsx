import { useDocumentsOfType } from "@powerhousedao/reactor-browser";
import { createFileRoute, Link } from "@tanstack/react-router";
import { InventoryItem } from "document-models/inventory-item";
import { Suspense, useEffect } from "react";

export const Route = createFileRoute("/stock-report")({
  head: ({ match }) => ({
    meta: [{ title: `Stock report · ${match.context.appName ?? "Connect"}` }],
  }),
  component: StockReport,
});

function StockReport() {
  return (
    <div className="bg-background text-foreground min-h-screen p-8">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Stock report</h1>
        <Link to="/inventory" className="text-primary hover:underline">
          ← Back to inventory
        </Link>
      </header>
      <Suspense fallback={<p role="status">Loading report…</p>}>
        <ReportTable />
      </Suspense>
    </div>
  );
}

function ReportTable() {
  const { documents, hasNextPage, isLoadingNextPage, loadNextPage } =
    useDocumentsOfType(InventoryItem, { limit: 50 });
  // A report shows every item: keep loading pages.
  useEffect(() => {
    if (hasNextPage && !isLoadingNextPage) loadNextPage();
  }, [hasNextPage, isLoadingNextPage, loadNextPage]);

  const byLocation = new Map<string, { items: number; units: number }>();
  for (const doc of documents) {
    const key = doc.state.global.location ?? "Unassigned";
    const row = byLocation.get(key) ?? { items: 0, units: 0 };
    row.items += 1;
    row.units += doc.state.global.quantity;
    byLocation.set(key, row);
  }
  const rows = [...byLocation].sort(([a], [b]) => a.localeCompare(b));
  return (
    <table
      className="w-full max-w-2xl text-left"
      aria-label="Stock by location"
    >
      <thead className="border-border border-b">
        <tr>
          <th className="py-2">Location</th>
          <th className="text-right">Items</th>
          <th className="text-right">Units</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([location, row]) => (
          <tr key={location} className="border-border border-b">
            <td className="py-2">{location}</td>
            <td className="text-right tabular-nums">{row.items}</td>
            <td className="text-right tabular-nums">{row.units}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
