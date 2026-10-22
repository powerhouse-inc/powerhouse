import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type {
  InventoryItemAction,
  InventoryItemDocument,
} from "document-models/inventory-item";
import { ItemDetails } from "./components/ItemDetails.js";
import { StockControls } from "./components/StockControls.js";
import { History } from "./components/History.js";

export default function Editor({
  document,
}: EditorProps<InventoryItemDocument, InventoryItemAction>) {
  return (
    <div className="mx-auto max-w-3xl bg-background p-6 text-foreground">
      <DocumentToolbar document={document} />
      <div className="mt-6 flex flex-col gap-6">
        <ItemDetails />
        <StockControls />
        <History />
      </div>
    </div>
  );
}
