import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedBrandSheetDocument } from "document-models/brand-sheet";
import { BrandSheetEditor } from "./BrandSheetEditor.js";

export default function Editor() {
  const [document, dispatch] = useSelectedBrandSheetDocument();
  return (
    <div className="mx-auto max-w-4xl bg-accent p-6">
      <DocumentToolbar />
      <BrandSheetEditor document={document} dispatch={dispatch} />
    </div>
  );
}
