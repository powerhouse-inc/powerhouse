import { actions } from "document-models/inventory-item";
import type { FormEvent } from "react";
import { useState } from "react";
import { button, card, input, label } from "./styles.js";
import { useItemDispatch } from "./useItemDispatch.js";

export function AdjustQuantityForm() {
  const { send } = useItemDispatch();
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const value = Number.parseInt(delta, 10);
    if (Number.isNaN(value)) return;
    send(
      actions.adjustQuantity({ delta: value, reason: reason || undefined }),
      () => {
        setDelta("");
        setReason("");
      },
    );
  }

  return (
    <form className={card} onSubmit={submit} aria-label="Adjust quantity">
      <h3 className="mb-3 font-semibold">Adjust quantity</h3>
      <label className={label}>
        Change (+ received, − shipped)
        <input
          className={input}
          type="number"
          value={delta}
          required
          onChange={(e) => setDelta(e.target.value)}
        />
      </label>
      <label className={`${label} mt-3`}>
        Reason
        <input
          className={input}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button className={`${button} mt-4`} type="submit">
        Adjust
      </button>
    </form>
  );
}
