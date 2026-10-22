import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type {
  InventoryItemAction,
  InventoryItemDocument,
} from "document-models/inventory-item";
import { ItemForm } from "./components/ItemForm.js";

export default function Editor({
  document,
}: EditorProps<InventoryItemDocument, InventoryItemAction>) {
  return (
    <div className="bg-background text-foreground min-h-full">
      <DocumentToolbar document={document} />
      <ItemForm />
    </div>
  );
}
