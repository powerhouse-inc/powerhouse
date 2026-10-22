import { showPHModal } from "@powerhousedao/reactor-browser";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/inventory")({
  staticData: { nav: { label: "Inventory", order: 10 } },
  component: Inventory,
});

function Inventory() {
  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-lg font-semibold">Inventory</h1>
      <p className="text-muted-foreground">Create an inventory item in any drive.</p>
      <button
        type="button"
        className="w-fit"
        onClick={() =>
          showPHModal({ type: "createDocument", documentType: "stockroom/inventory-item" })
        }
      >
        New inventory item
      </button>
    </div>
  );
}
