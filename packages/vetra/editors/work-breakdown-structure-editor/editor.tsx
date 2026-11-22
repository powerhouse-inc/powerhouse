import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedWorkBreakdownStructureDocument } from "document-models/work-breakdown-structure";
import { WorkBreakdownStructureEditor } from "./WorkBreakdownStructureEditor.js";

export default function Editor() {
  const [document, dispatch] = useSelectedWorkBreakdownStructureDocument();
  return (
    <div className="mx-auto max-w-4xl bg-accent p-6">
      <DocumentToolbar />
      <WorkBreakdownStructureEditor document={document} dispatch={dispatch} />
    </div>
  );
}
