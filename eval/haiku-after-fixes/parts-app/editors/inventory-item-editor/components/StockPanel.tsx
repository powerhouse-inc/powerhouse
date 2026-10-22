import type { FormEvent } from "react";
import { useState } from "react";
import {
  actions,
  useSelectedInventoryItemDocument,
} from "document-models/inventory-item";
import { errorMessage, globalStateOf, rejectionFor } from "./rejection.js";

export function StockPanel({
  onRejected,
}: {
  onRejected: (message: string | null) => void;
}) {
  const [document, dispatch] = useSelectedInventoryItemDocument();
  const { name, quantity, location } = document.state.global;
  const before = JSON.stringify(document.state.global);
  const [delta, setDelta] = useState("1");
  const [target, setTarget] = useState("");

  function handleAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch(
      actions.adjustQuantity({ delta: Math.trunc(Number(delta) || 0) }),
      (errors) => onRejected(errorMessage(errors)),
      (result) => onRejected(rejectionFor(before, globalStateOf(result.state))),
    );
  }

  function handleMove(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch(
      actions.moveItem({ location: target.trim() }),
      (errors) => onRejected(errorMessage(errors)),
      (result) => onRejected(rejectionFor(before, globalStateOf(result.state))),
    );
    setTarget("");
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold">{name}</h2>
        <p className="text-sm">
          Quantity: <strong data-testid="quantity">{quantity}</strong>
        </p>
        <p className="text-sm">
          Location: <strong data-testid="location">{location ?? "-"}</strong>
        </p>
      </section>

      <form onSubmit={handleAdjust} className="flex items-end gap-2">
        <label className="block">
          <span className="text-sm">Adjust by</span>
          <input
            type="number"
            className="mt-1 block w-28 rounded border px-2 py-1"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5 text-sm">
          Adjust
        </button>
      </form>

      <form onSubmit={handleMove} className="flex items-end gap-2">
        <label className="block">
          <span className="text-sm">Move to</span>
          <input
            className="mt-1 block w-48 rounded border px-2 py-1"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </label>
        <button type="submit" className="rounded border px-3 py-1.5 text-sm">
          Move
        </button>
      </form>
    </div>
  );
}
