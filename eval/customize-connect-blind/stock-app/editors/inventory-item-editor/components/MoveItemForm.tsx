import { actions } from "document-models/inventory-item";
import type { FormEvent } from "react";
import { useState } from "react";
import { button, card, input, label } from "./styles.js";
import { useItemDispatch } from "./useItemDispatch.js";

export function MoveItemForm() {
  const { send } = useItemDispatch();
  const [location, setLocation] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    send(actions.moveItem({ location }), () => setLocation(""));
  }

  return (
    <form className={card} onSubmit={submit} aria-label="Move item">
      <h3 className="mb-3 font-semibold">Move to another location</h3>
      <label className={label}>
        New location
        <input
          className={input}
          value={location}
          required
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      <button className={`${button} mt-4`} type="submit">
        Move
      </button>
    </form>
  );
}
