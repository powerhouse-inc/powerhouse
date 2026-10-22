import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type {
  InventoryItemAction,
  InventoryItemDocument,
} from "document-models/inventory-item";
import { AddItemForm, StockControls } from "./components/item-forms.js";

export default function Editor({
  document,
}: EditorProps<InventoryItemDocument, InventoryItemAction>) {
  const stocked = Boolean(document.state.global.name);
  return (
    <div className="mx-auto max-w-3xl bg-background p-6 text-foreground">
      <DocumentToolbar document={document} />
      <div className="mt-6">
        <h2 className="text-lg font-semibold">
          {document.state.global.name ?? document.header.name}
        </h2>
        <div className="mt-4">
          {stocked ? <StockControls /> : <AddItemForm />}
        </div>
      </div>
    </div>
  );
}
