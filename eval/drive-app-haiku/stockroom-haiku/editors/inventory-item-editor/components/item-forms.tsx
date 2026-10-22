import {
  actions,
  useSelectedInventoryItemDocument,
} from "document-models/inventory-item";
import { useState } from "react";

export function AddItemForm() {
  const [, dispatch] = useSelectedInventoryItemDocument();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState(0);
  const [location, setLocation] = useState("");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    dispatch(
      actions.addItem({
        name: name.trim(),
        quantity,
        location: location.trim(),
      }),
    );
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={handleSubmit}>
      <h3 className="text-base font-semibold">Stock this item</h3>
      <label className="flex flex-col gap-1">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1">
        Quantity
        <input
          type="number"
          min={0}
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>
      <label className="flex flex-col gap-1">
        Location
        <input value={location} onChange={(e) => setLocation(e.target.value)} />
      </label>
      <button type="submit" className="w-fit">
        Add item
      </button>
    </form>
  );
}

export function StockControls() {
  const [document, dispatch] = useSelectedInventoryItemDocument();
  const { quantity, location } = document.state.global;
  const [delta, setDelta] = useState(1);
  const [newLocation, setNewLocation] = useState(location ?? "");
  // The reducer rejects these too, but the editor's document has no operation
  // history to show that rejection, so the controls refuse them up front.
  const canAdjust = Number.isInteger(delta) && quantity + delta >= 0;
  const canMove = newLocation.trim() !== "";

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Quantity: {quantity}</h3>
        <div className="flex items-center gap-2">
          <input
            type="number"
            aria-label="Adjust by"
            value={delta}
            onChange={(e) => setDelta(Number(e.target.value))}
            className="w-24"
          />
          <button
            type="button"
            disabled={!canAdjust}
            onClick={() => dispatch(actions.adjustQuantity({ delta }))}
          >
            Adjust
          </button>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-base font-semibold">Location: {location}</h3>
        <div className="flex items-center gap-2">
          <input
            aria-label="New location"
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />
          <button
            type="button"
            disabled={!canMove}
            onClick={() =>
              dispatch(actions.moveItem({ location: newLocation.trim() }))
            }
          >
            Move
          </button>
        </div>
      </section>
    </div>
  );
}
