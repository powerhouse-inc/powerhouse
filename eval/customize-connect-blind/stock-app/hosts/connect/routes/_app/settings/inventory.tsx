import { createFileRoute } from "@tanstack/react-router";
import { Boxes } from "lucide-react";
import type { FormEvent } from "react";
import { useState } from "react";
import {
  DEFAULT_SETTINGS,
  saveSettings,
  useStockSettings,
} from "../../-components/settings-store.js";

export const Route = createFileRoute("/_app/settings/inventory")({
  staticData: {
    settings: { label: "Inventory", icon: Boxes, order: 50 },
  },
  component: InventorySettings,
});

function InventorySettings() {
  const settings = useStockSettings();
  const [threshold, setThreshold] = useState(
    String(settings.lowStockThreshold),
  );
  const [pageSize, setPageSize] = useState(String(settings.pageSize));
  const [saved, setSaved] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    saveSettings({
      lowStockThreshold: Math.max(0, Number.parseInt(threshold, 10) || 0),
      pageSize: Math.max(
        1,
        Number.parseInt(pageSize, 10) || DEFAULT_SETTINGS.pageSize,
      ),
    });
    setSaved(true);
  }

  return (
    <form
      onSubmit={submit}
      className="flex max-w-md flex-col gap-4"
      aria-label="Inventory settings"
    >
      <p className="text-muted-foreground text-sm">
        These settings are kept in this browser.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Low-stock threshold
        <input
          type="number"
          min={0}
          className="border-input bg-background rounded-md border px-3 py-2"
          value={threshold}
          onChange={(e) => {
            setThreshold(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Items per page
        <input
          type="number"
          min={1}
          className="border-input bg-background rounded-md border px-3 py-2"
          value={pageSize}
          onChange={(e) => {
            setPageSize(e.target.value);
            setSaved(false);
          }}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium"
        >
          Save
        </button>
        {saved && (
          <span role="status" className="text-sm">
            Saved.
          </span>
        )}
      </div>
    </form>
  );
}
