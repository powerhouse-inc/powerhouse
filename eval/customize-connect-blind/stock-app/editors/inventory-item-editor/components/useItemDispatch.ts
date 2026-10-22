import type { InventoryItemAction } from "document-models/inventory-item";
import { useSelectedInventoryItemDocument } from "document-models/inventory-item";

/** Dispatches to the open item. Reducer errors show in the activity log. */
export function useItemDispatch() {
  const [, dispatch] = useSelectedInventoryItemDocument();
  function send(action: InventoryItemAction, onSuccess?: () => void) {
    dispatch(action, undefined, () => onSuccess?.());
  }
  return { send };
}
