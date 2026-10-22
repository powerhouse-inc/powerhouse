import {
  actions,
  useSelectedInventoryItemDocument,
} from "document-models/inventory-item";
import { useState } from "react";

const input =
  "border-border bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm";
const button =
  "bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50";

export function ItemForm() {
  const [document, dispatch] = useSelectedInventoryItemDocument();
  const { name, quantity, location } = document.state.global;
  const registered = name !== null;

  const [draftName, setDraftName] = useState(document.header.name);
  const [draftQty, setDraftQty] = useState("0");
  const [draftLocation, setDraftLocation] = useState("");
  const [delta, setDelta] = useState("1");
  const [newLocation, setNewLocation] = useState("");

  // Connect's documents don't carry their operations (operations.global is
  // undefined at runtime), so validate here instead of reading op errors.
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 p-4 sm:p-6">
      {registered ? (
        <dl
          className="border-border grid grid-cols-3 gap-2 rounded-lg border p-4"
          data-testid="item-summary"
        >
          <dt className="text-muted-foreground text-xs">Name</dt>
          <dt className="text-muted-foreground text-xs">Quantity</dt>
          <dt className="text-muted-foreground text-xs">Location</dt>
          <dd className="font-semibold">{name}</dd>
          <dd className="font-semibold" data-testid="item-quantity">
            {quantity}
          </dd>
          <dd className="font-semibold">{location}</dd>
        </dl>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            dispatch(
              actions.addItem({
                name: draftName.trim() || document.header.name,
                quantity: Number.parseInt(draftQty, 10) || 0,
                location: draftLocation.trim() || "Unassigned",
              }),
            );
          }}
        >
          <h2 className="text-lg font-semibold">Register item</h2>
          <input
            className={input}
            aria-label="Item name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
          />
          <input
            className={input}
            aria-label="Starting quantity"
            type="number"
            value={draftQty}
            onChange={(e) => setDraftQty(e.target.value)}
          />
          <input
            className={input}
            aria-label="Location"
            placeholder="Location, e.g. Shelf A1"
            value={draftLocation}
            onChange={(e) => setDraftLocation(e.target.value)}
          />
          <button className={button} type="submit">
            Add item
          </button>
        </form>
      )}

      {registered && (
        <>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const d = Number.parseInt(delta, 10);
              if (!d) return;
              if (quantity + d < 0) {
                setError(`Cannot remove ${-d}; only ${quantity} on hand`);
                return;
              }
              setError(null);
              dispatch(actions.adjustQuantity({ delta: d }));
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Adjust by
              <input
                className={input}
                type="number"
                value={delta}
                onChange={(e) => setDelta(e.target.value)}
              />
            </label>
            <button className={button} type="submit">
              Adjust
            </button>
          </form>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newLocation.trim()) {
                setError("Location cannot be empty");
                return;
              }
              setError(null);
              dispatch(actions.moveItem({ location: newLocation.trim() }));
              setNewLocation("");
            }}
          >
            <label className="flex flex-1 flex-col gap-1 text-sm">
              Move to
              <input
                className={input}
                value={newLocation}
                placeholder="New location"
                onChange={(e) => setNewLocation(e.target.value)}
              />
            </label>
            <button className={button} type="submit">
              Move
            </button>
          </form>
        </>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
