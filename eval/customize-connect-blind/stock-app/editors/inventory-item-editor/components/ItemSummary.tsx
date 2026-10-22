import { useSelectedInventoryItemDocument } from "document-models/inventory-item";
import { card } from "./styles.js";

export function ItemSummary() {
  const [document] = useSelectedInventoryItemDocument();
  const { name, sku, quantity, location } = document.state.global;
  return (
    <section className={card} aria-label="Item summary">
      <h2 className="text-xl font-semibold">{name}</h2>
      {sku && <p className="text-muted-foreground text-sm">SKU {sku}</p>}
      <dl className="mt-4 grid grid-cols-2 gap-4">
        <div>
          <dt className="text-muted-foreground text-xs uppercase">On hand</dt>
          <dd className="text-3xl font-bold" data-testid="quantity">
            {quantity}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs uppercase">Location</dt>
          <dd className="text-lg" data-testid="location">
            {location ?? "Unassigned"}
          </dd>
        </div>
      </dl>
    </section>
  );
}
