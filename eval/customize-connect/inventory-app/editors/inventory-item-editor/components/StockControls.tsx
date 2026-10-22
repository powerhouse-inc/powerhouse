import { generateId } from "document-model";
import {
  actions,
  useSelectedInventoryItemDocument,
} from "document-models/inventory-item";
import { useState } from "react";

export function StockControls() {
  const [, dispatch] = useSelectedInventoryItemDocument();
  const [amount, setAmount] = useState(1);
  const [location, setLocation] = useState("");
  const at = () => new Date().toISOString();

  return (
    <section className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Amount
        <input
          type="number"
          aria-label="Amount"
          className="w-24 rounded border border-border bg-background px-2 py-1"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </label>
      <button
        type="button"
        className="rounded bg-primary px-3 py-1 text-primary-foreground"
        onClick={() =>
          dispatch(actions.addStock({ id: generateId(), amount, at: at() }))
        }
      >
        Add stock
      </button>
      <button
        type="button"
        className="rounded border border-border px-3 py-1"
        onClick={() =>
          dispatch(
            actions.adjustQuantity({
              id: generateId(),
              delta: -amount,
              reason: "count",
              at: at(),
            }),
          )
        }
      >
        Remove
      </button>
      <label className="flex flex-col gap-1 text-sm">
        Location
        <input
          aria-label="New location"
          className="rounded border border-border bg-background px-2 py-1"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      <button
        type="button"
        className="rounded border border-border px-3 py-1"
        disabled={!location}
        onClick={() => {
          dispatch(actions.moveItem({ id: generateId(), location, at: at() }));
          setLocation("");
        }}
      >
        Move
      </button>
    </section>
  );
}
