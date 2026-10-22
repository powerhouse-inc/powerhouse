import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/inventory")({
  staticData: {
    settings: {
      label: "Inventory",
      order: 50,
    },
  },
  component: InventorySettings,
});

function InventorySettings() {
  return (
    <div className="max-w-xl space-y-2 p-6">
      <h2 className="text-lg font-semibold">Inventory</h2>
      <p className="text-sm">
        Inventory items use the document type <code>parts/inventory-item</code>.
        Create them from the Inventory page in the sidebar.
      </p>
    </div>
  );
}
