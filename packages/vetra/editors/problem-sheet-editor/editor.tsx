import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedProblemSheetDocument } from "document-models/problem-sheet";
import { ProblemSheetEditor } from "./ProblemSheetEditor.js";

export default function Editor() {
  const [document, dispatch] = useSelectedProblemSheetDocument();
  return (
    <div className="mx-auto max-w-4xl bg-accent p-6">
      <DocumentToolbar />
      <ProblemSheetEditor document={document} dispatch={dispatch} />
    </div>
  );
}
