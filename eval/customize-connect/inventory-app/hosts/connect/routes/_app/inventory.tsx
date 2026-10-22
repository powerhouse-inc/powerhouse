import {
  loadDocumentsOfType,
  makeDriveSlug,
  makeNodeSlug,
  useDocumentsOfType,
  useDrives,
  useLinkProps,
  useModalLinkProps,
} from "@powerhousedao/reactor-browser";
import type { InventoryItemDocument } from "document-models/inventory-item";
import { createFileRoute } from "@tanstack/react-router";
import { InventoryItem } from "document-models/inventory-item";
import { Box } from "lucide-react";

const PAGE_SIZE = 5;

export const Route = createFileRoute("/_app/inventory")({
  staticData: { nav: { label: "Inventory", icon: Box, order: 10 } },
  head: ({ match }) => ({
    meta: [{ title: `Inventory · ${match.context.appName ?? "Connect"}` }],
  }),
  loader: () => loadDocumentsOfType(InventoryItem, { limit: PAGE_SIZE }),
  component: Inventory,
});

const newItemModal = {
  type: "createDocument",
  documentType: "acme/inventory-item",
} as const;

function NewItemLink() {
  return (
    <a
      {...useModalLinkProps(newItemModal)}
      className="rounded bg-primary px-3 py-1 text-sm text-primary-foreground"
      data-testid="new-item"
    >
      New inventory item
    </a>
  );
}

function Inventory() {
  const { documents, invalid, hasNextPage, isLoadingNextPage, loadNextPage } =
    useDocumentsOfType(InventoryItem, { limit: PAGE_SIZE });
  const total = documents.reduce((n, d) => n + d.state.global.quantity, 0);

  return (
    <div className="flex flex-col gap-4 p-6" data-testid="inventory-page">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Inventory</h1>
        <NewItemLink />
      </header>
      <p
        className="text-sm text-muted-foreground"
        data-testid="inventory-summary"
      >
        {documents.length} items loaded, {total} units
        {invalid.length > 0 && `, ${invalid.length} invalid`}
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left">
            <th>Document</th>
            <th>Name</th>
            <th>Quantity</th>
            <th>Location</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <Row key={doc.header.id} doc={doc} />
          ))}
        </tbody>
      </table>
      {hasNextPage && (
        <button
          type="button"
          className="self-start rounded border border-border px-3 py-1"
          disabled={isLoadingNextPage}
          onClick={() => loadNextPage()}
          data-testid="load-more"
        >
          {isLoadingNextPage ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}

// useDocumentsOfType doesn't say which drive a document is in: look it up in the drives' nodes.
function useDocumentTarget(documentId: string) {
  const drives = useDrives();
  for (const drive of drives ?? []) {
    const node = drive.state.global.nodes.find((n) => n.id === documentId);
    if (node)
      return {
        driveSlug: makeDriveSlug(drive) as string,
        nodeSlug: makeNodeSlug(node),
      };
  }
  return undefined;
}

function Row({ doc }: { doc: InventoryItemDocument }) {
  const target = useDocumentTarget(doc.header.id);
  const link = useLinkProps(target);
  return (
    <tr data-testid="inventory-row">
      <td>
        {target ? (
          <a {...link} className="text-primary underline">
            {doc.header.name}
          </a>
        ) : (
          doc.header.name
        )}
      </td>
      <td>{doc.state.global.name ?? "—"}</td>
      <td>{doc.state.global.quantity}</td>
      <td>{doc.state.global.location ?? "—"}</td>
    </tr>
  );
}
