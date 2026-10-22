import { InventoryItem } from "document-models/inventory-item";
import {
  loadDocumentsOfType,
  useDocumentLinkProps,
  useDocumentsOfType,
  useModalLinkProps,
} from "@powerhousedao/reactor-browser";
import { createFileRoute } from "@tanstack/react-router";
import { Suspense } from "react";

export const Route = createFileRoute("/_app/inventory")({
  staticData: { nav: { label: "Inventory", order: 10 } },
  loader: () => loadDocumentsOfType(InventoryItem, { limit: 10 }),
  pendingComponent: () => <p className="p-6">Loading inventory…</p>,
  component: InventoryPage,
});

function InventoryPage() {
  const createLink = useModalLinkProps({
    type: "createDocument",
    documentType: "parts/inventory-item",
  });
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <a
          {...createLink}
          className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground"
        >
          New inventory item
        </a>
      </header>
      <Suspense fallback={<p>Loading items…</p>}>
        <InventoryList />
      </Suspense>
    </div>
  );
}

function InventoryList() {
  const { documents, invalid, hasNextPage, isLoadingNextPage, loadNextPage, error } =
    useDocumentsOfType(InventoryItem, { limit: 10 });

  if (documents.length === 0) {
    return <p className="text-muted-foreground">No inventory items yet.</p>;
  }

  return (
    <>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Document</th>
            <th className="py-2">Drive document id</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <InventoryRow key={doc.header.id} id={doc.header.id} name={doc.header.name} />
          ))}
        </tbody>
      </table>
      {invalid.length > 0 && (
        <p className="text-sm text-amber-700">{invalid.length} item(s) could not be read.</p>
      )}
      {error ? <p className="text-sm text-red-700">Could not load more: {error instanceof Error ? error.message : "unknown error"}</p> : null}
      {hasNextPage && (
        <button
          type="button"
          disabled={isLoadingNextPage}
          onClick={loadNextPage}
          className="rounded border px-3 py-1.5 text-sm"
        >
          {isLoadingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </>
  );
}

function InventoryRow({ id, name }: { id: string; name: string }) {
  const link = useDocumentLinkProps(id);
  return (
    <tr className="border-b">
      <td className="py-2">
        {link ? (
          <a {...link} className="text-primary underline">
            {name || "Untitled item"}
          </a>
        ) : (
          name || "Untitled item"
        )}
      </td>
      <td className="py-2 font-mono text-xs">{id}</td>
    </tr>
  );
}
