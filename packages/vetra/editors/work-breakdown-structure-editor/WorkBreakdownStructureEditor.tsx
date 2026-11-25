import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type {
  WorkBreakdownStructureAction,
  WorkBreakdownStructureDocument,
} from "document-models/work-breakdown-structure";
import { WbsHeader, WorkSection } from "./components/sections.js";

export function WorkBreakdownStructureEditor({
  document,
  dispatch,
}: {
  document: WorkBreakdownStructureDocument;
  dispatch: DocumentDispatch<WorkBreakdownStructureAction>;
}) {
  const state = document.state.global;
  return (
    <div className="flex flex-col gap-8 text-foreground">
      <WbsHeader state={state} dispatch={dispatch} />
      <WorkSection state={state} dispatch={dispatch} />
    </div>
  );
}
