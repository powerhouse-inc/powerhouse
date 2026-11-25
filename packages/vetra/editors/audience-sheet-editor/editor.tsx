import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedAudienceSheetDocument } from "document-models/audience-sheet";
import { AudienceSheetEditor } from "./AudienceSheetEditor.js";

export default function Editor() {
  const [document, dispatch] = useSelectedAudienceSheetDocument();
  return (
    <div className="mx-auto max-w-4xl bg-accent p-6">
      <DocumentToolbar />
      <AudienceSheetEditor document={document} dispatch={dispatch} />
    </div>
  );
}
