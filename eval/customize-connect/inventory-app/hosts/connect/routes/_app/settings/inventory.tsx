import { createFileRoute } from "@tanstack/react-router";
import { Box } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_app/settings/inventory")({
  staticData: {
    settings: { label: "Inventory", icon: Box, order: 50 },
  },
  component: InventorySettings,
});

function InventorySettings() {
  const [threshold, setThreshold] = useState(5);
  return (
    <div className="flex flex-col gap-2" data-testid="inventory-settings">
      <h2 className="text-lg font-semibold">Inventory</h2>
      <label className="flex items-center gap-2 text-sm">
        Low-stock threshold
        <input
          type="number"
          className="w-20 rounded border border-border px-2 py-1"
          value={threshold}
          onChange={(e) => setThreshold(Number(e.target.value))}
        />
      </label>
    </div>
  );
}
