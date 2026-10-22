import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "document-model";
import type {
  InventoryItemAction,
  InventoryItemDocument,
} from "document-models/inventory-item";
import { ActivityLog } from "./components/ActivityLog.js";
import { AddItemForm } from "./components/AddItemForm.js";
import { AdjustQuantityForm } from "./components/AdjustQuantityForm.js";
import { ItemSummary } from "./components/ItemSummary.js";
import { MoveItemForm } from "./components/MoveItemForm.js";
import { NewItemLink } from "./components/NewItemLink.js";

export default function Editor({
  document,
}: EditorProps<InventoryItemDocument, InventoryItemAction>) {
  const added = !!document.state.global.name;
  return (
    <div className="bg-background text-foreground min-h-full">
      <DocumentToolbar document={document} />
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <div className="flex justify-end">
          <NewItemLink />
        </div>
        {added ? (
          <>
            <ItemSummary />
            <div className="grid gap-6 md:grid-cols-2">
              <AdjustQuantityForm />
              <MoveItemForm />
            </div>
            <ActivityLog />
          </>
        ) : (
          <AddItemForm />
        )}
      </div>
    </div>
  );
}
