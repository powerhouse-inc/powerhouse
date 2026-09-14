// How this editor renders the reactor piece's props.

// The piece declares what any host could serve: DROPDOWNs with options() and
// a JSON list of actions. This editor has richer controls for both — an
// autocomplete that also takes an expression, and a per-action editor — so it
// substitutes them by prop name. The piece stays portable; the mapping is the
// one place that knows this editor can do better.
import { REACTOR_PIECE } from "../../../subgraphs/workflow-runtime/reactor-piece.js";
import type { BlockFormProp } from "./forms.js";

export { REACTOR_PIECE };

// Values that name a document or a model: a step is as likely to feed one
// from an upstream expression as to pick it, which a select cannot express.
const AUTOCOMPLETE_PROPS = new Set([
  "documentType",
  "documentId",
  "actionType",
  "parentId",
  "driveId",
]);

export function isReactorPieceBlock(blockType: string): boolean {
  return (
    blockType.startsWith(`${REACTOR_PIECE}#`) ||
    blockType.startsWith(`${REACTOR_PIECE}@`)
  );
}

export function adaptReactorProps(props: BlockFormProp[]): BlockFormProp[] {
  const hasActionList = props.some((prop) => prop.name === "actions");
  return props.flatMap((prop): BlockFormProp[] => {
    if (prop.name === "actions") {
      return [{ ...prop, type: "PH_ACTIONS", hasDynamicResolver: true }];
    }
    // Beside an action list this prop is not a field of its own: it is where
    // the list's action types come from.
    if (prop.name === "actionType" && hasActionList) return [];
    if (AUTOCOMPLETE_PROPS.has(prop.name)) {
      return [{ ...prop, type: "PH_AUTOCOMPLETE", hasDynamicResolver: true }];
    }
    return [prop];
  });
}
