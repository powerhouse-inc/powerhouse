import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import {
  setSubgraphName,
  setSubgraphStatus,
} from "@powerhousedao/vetra/document-models/subgraph-module";
import { useCallback } from "react";
import { useSelectedSubgraphModuleDocument } from "../hooks/useVetraDocument.js";
import { SubgraphEditorForm } from "./components/SubgraphEditorForm.js";
import { editorConfig } from "./config.js";

export default function Editor() {
  useSetPHDocumentEditorConfig(editorConfig);
  const [document, dispatch] = useSelectedSubgraphModuleDocument();

  const onNameChange = useCallback(
    (name: string) => {
      if (name === document.state.global.name) return;
      dispatch(setSubgraphName({ name }));
    },
    [document.state.global.name, dispatch],
  );

  const onConfirm = useCallback(() => {
    dispatch(setSubgraphStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div className="bg-gray-50 p-6">
      <DocumentToolbar />
      <SubgraphEditorForm
        subgraphName={document.state.global.name ?? ""}
        status={document.state.global.status}
        onNameChange={onNameChange}
        onConfirm={onConfirm}
      />
    </div>
  );
}
