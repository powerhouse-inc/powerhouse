import { InventoryItem } from "document-models/inventory-item";
import { loadDocumentsOfType, useDocumentsOfType } from "@powerhousedao/reactor-browser";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Suspense } from "react";

// A full page outside _app: no sidebar, for printing a stock list.
export const Route = createFileRoute("/inventory-print")({
  loader: () => loadDocumentsOfType(InventoryItem, { limit: 50 }),
  component: InventoryPrint,
});

function InventoryPrint() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-xl font-bold">Stock list</h1>
      <Suspense fallback={<p>Loading…</p>}>
        <PrintTable />
      </Suspense>
      <p className="mt-6 text-sm">
        <Link to="/">Back to Connect</Link>
      </p>
    </main>
  );
}

function PrintTable() {
  const { documents } = useDocumentsOfType(InventoryItem, { limit: 50 });
  return (
    <ul className="mt-4 list-disc pl-6">
      {documents.map((doc) => (
        <li key={doc.header.id}>{doc.header.name}</li>
      ))}
    </ul>
  );
}
