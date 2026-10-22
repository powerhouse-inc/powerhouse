import { useModalLinkProps } from "@powerhousedao/reactor-browser";

const newItemModal = {
  type: "createDocument",
  documentType: "stock-app/inventory-item",
} as const;

/** Opens the create-document modal in place; the item goes into this drive. */
export function NewItemLink() {
  return (
    <a
      {...useModalLinkProps(newItemModal)}
      className="text-primary text-sm font-medium hover:underline"
    >
      + New item in this drive
    </a>
  );
}
