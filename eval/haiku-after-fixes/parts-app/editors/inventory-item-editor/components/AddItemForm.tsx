import type { FormEvent } from "react";
import { useState } from "react";
import {
  actions,
  useSelectedInventoryItemDocument,
} from "document-models/inventory-item";
import { errorMessage, globalStateOf, rejectionFor } from "./rejection.js";

export function AddItemForm({
  onRejected,
}: {
  onRejected: (message: string | null) => void;
}) {
  const [document, dispatch] = useSelectedInventoryItemDocument();
  const before = JSON.stringify(document.state.global);
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [location, setLocation] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    dispatch(
      actions.addItem({
        name: name.trim(),
        quantity: Math.trunc(Number(quantity) || 0),
        location: location.trim(),
      }),
      (errors) => onRejected(errorMessage(errors)),
      (result) => onRejected(rejectionFor(before, globalStateOf(result.state))),
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <h2 className="text-lg font-semibold">Add item</h2>
      <label className="block">
        <span className="text-sm">Name</span>
        <input
          className="mt-1 block w-full rounded border px-2 py-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm">Quantity</span>
        <input
          type="number"
          className="mt-1 block w-full rounded border px-2 py-1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />
      </label>
      <label className="block">
        <span className="text-sm">Location</span>
        <input
          className="mt-1 block w-full rounded border px-2 py-1"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      <button
        type="submit"
        className="rounded bg-slate-800 px-3 py-1.5 text-sm text-white dark:bg-slate-200 dark:text-slate-900"
      >
        Add item
      </button>
    </form>
  );
}
