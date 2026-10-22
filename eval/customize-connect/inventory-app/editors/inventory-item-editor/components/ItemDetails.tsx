import {
  actions,
  useSelectedInventoryItemDocument,
} from "document-models/inventory-item";

export function ItemDetails() {
  const [document, dispatch] = useSelectedInventoryItemDocument();
  const { name, sku, quantity, location } = document.state.global;

  return (
    <section className="grid grid-cols-2 gap-4" data-testid="item-details">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          className="rounded border border-border bg-background px-2 py-1"
          aria-label="Item name"
          defaultValue={name ?? ""}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value !== (name ?? ""))
              dispatch(actions.setItemDetails({ name: value }));
          }}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        SKU
        <input
          className="rounded border border-border bg-background px-2 py-1"
          aria-label="SKU"
          defaultValue={sku ?? ""}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value !== (sku ?? ""))
              dispatch(actions.setItemDetails({ sku: value }));
          }}
        />
      </label>
      <div className="text-sm">
        On hand: <strong data-testid="quantity">{quantity}</strong>
      </div>
      <div className="text-sm">
        Location: <strong data-testid="location">{location ?? "—"}</strong>
      </div>
    </section>
  );
}
