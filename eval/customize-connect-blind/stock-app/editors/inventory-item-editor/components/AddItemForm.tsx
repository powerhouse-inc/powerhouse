import { actions } from "document-models/inventory-item";
import type { FormEvent } from "react";
import { useState } from "react";
import { button, card, input, label } from "./styles.js";
import { useItemDispatch } from "./useItemDispatch.js";

export function AddItemForm() {
  const { send } = useItemDispatch();
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState("0");
  const [location, setLocation] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    send(
      actions.addItem({
        name,
        sku: sku || undefined,
        quantity: Number.parseInt(quantity, 10) || 0,
        location: location || undefined,
      }),
    );
  }

  return (
    <form className={card} onSubmit={submit} aria-label="Add item">
      <h2 className="mb-4 text-lg font-semibold">Add this item to stock</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <label className={label}>
          Name
          <input
            className={input}
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className={label}>
          SKU
          <input
            className={input}
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </label>
        <label className={label}>
          Starting quantity
          <input
            className={input}
            type="number"
            min={0}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
        </label>
        <label className={label}>
          Location
          <input
            className={input}
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
      </div>
      <button className={`${button} mt-4`} type="submit">
        Add item
      </button>
    </form>
  );
}
