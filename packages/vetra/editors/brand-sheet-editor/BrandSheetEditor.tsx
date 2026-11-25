import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type {
  BrandSheetAction,
  BrandSheetDocument,
} from "document-models/brand-sheet";
import {
  BrandHeader,
  ColorPalette,
  ConceptSection,
  ImagerySection,
  LogoConcept,
  TypographySection,
  VoiceSection,
} from "./components/sections.js";

export function BrandSheetEditor({
  document,
  dispatch,
}: {
  document: BrandSheetDocument;
  dispatch: DocumentDispatch<BrandSheetAction>;
}) {
  const state = document.state.global;
  return (
    <div className="flex flex-col gap-8 text-foreground">
      <BrandHeader state={state} dispatch={dispatch} />
      <ConceptSection state={state} dispatch={dispatch} />
      <LogoConcept state={state} dispatch={dispatch} />
      <ColorPalette state={state} dispatch={dispatch} />
      <TypographySection state={state} dispatch={dispatch} />
      <VoiceSection state={state} dispatch={dispatch} />
      <ImagerySection state={state} dispatch={dispatch} />
    </div>
  );
}
