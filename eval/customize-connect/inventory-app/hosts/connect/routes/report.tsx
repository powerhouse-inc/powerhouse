import { useDocumentsOfType } from "@powerhousedao/reactor-browser";
import { createFileRoute, Link } from "@tanstack/react-router";
import { InventoryItem } from "document-models/inventory-item";
import { Suspense } from "react";

export const Route = createFileRoute("/report")({
  head: () => ({ meta: [{ title: "Stock report" }] }),
  component: Report,
});

function Totals() {
  const { documents } = useDocumentsOfType(InventoryItem, { limit: 100 });
  const total = documents.reduce((n, d) => n + d.state.global.quantity, 0);
  return (
    <p data-testid="report-total">
      {documents.length} items, {total} units
    </p>
  );
}

function Report() {
  return (
    <div
      className="min-h-screen bg-background p-10 text-foreground"
      data-testid="report-page"
    >
      <h1 className="text-2xl font-bold">Stock report</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <Totals />
      </Suspense>
      <Link to="/" className="text-primary underline">
        Back to Connect
      </Link>
    </div>
  );
}
