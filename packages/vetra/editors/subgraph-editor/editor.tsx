import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import type { EditorProps } from "@powerhousedao/shared/document-model";
import type {
  SubgraphModuleAction,
  SubgraphModuleDocument,
} from "../../document-models/subgraph-module/index.js";
import { useSetPHDocumentEditorConfig } from "@powerhousedao/reactor-browser";
import {
  setSubgraphName,
  setSubgraphStatus,
} from "@powerhousedao/vetra/document-models/subgraph-module";
import { useCallback } from "react";
import { SubgraphEditorForm } from "./components/SubgraphEditorForm.js";
import { editorConfig } from "./config.js";

export default function Editor({
  document,
  dispatch,
}: EditorProps<SubgraphModuleDocument, SubgraphModuleAction>) {
  useSetPHDocumentEditorConfig(editorConfig);

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
    <div className="bg-background p-6">
      <DocumentToolbar document={document} />
      <SubgraphEditorForm
        subgraphName={document.state.global.name ?? ""}
        status={document.state.global.status}
        onNameChange={onNameChange}
        onConfirm={onConfirm}
      />
    </div>
  );
}
