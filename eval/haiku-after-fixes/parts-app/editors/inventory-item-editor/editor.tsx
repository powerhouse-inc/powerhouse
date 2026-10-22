import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type {
  InventoryItemAction,
  InventoryItemDocument,
} from "document-models/inventory-item";
import { useState } from "react";
import { AddItemForm } from "./components/AddItemForm.js";
import { RejectionBanner } from "./components/RejectionBanner.js";
import { StockPanel } from "./components/StockPanel.js";

export default function Editor({
  document,
}: EditorProps<InventoryItemDocument, InventoryItemAction>) {
  const hasItem = document.state.global.name !== null;
  // Set when the reducer rejects a dispatched change; cleared on the next success.
  const [rejection, setRejection] = useState<string | null>(null);

  return (
    <div className="inventory-item-editor mx-auto max-w-3xl space-y-6 p-6">
      <DocumentToolbar document={document} />
      {rejection && (
        <RejectionBanner message={rejection} onDismiss={() => setRejection(null)} />
      )}
      {hasItem ? (
        <StockPanel onRejected={setRejection} />
      ) : (
        <AddItemForm onRejected={setRejection} />
      )}
    </div>
  );
}
