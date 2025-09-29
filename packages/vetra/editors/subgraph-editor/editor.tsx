import type { EditorProps } from "document-model";
import { useCallback } from "react";
import { actions } from "../../document-models/subgraph-module/index.js";
import { useSubgraphModuleDocument } from "../hooks/useVetraDocument.js";
import { SubgraphEditorForm } from "./components/SubgraphEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const [document, dispatch] = useSubgraphModuleDocument(props.documentId);

  const onNameChange = useCallback(
    (name: string) => {
      if (name === document.state.global.name) return;
      dispatch(actions.setSubgraphName({ name }));
    },
    [document.state.global.name, dispatch],
  );

  const onConfirm = useCallback(() => {
    dispatch(actions.setSubgraphStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div>
      <SubgraphEditorForm
        subgraphName={document.state.global.name ?? ""}
        status={document.state.global.status}
        onNameChange={onNameChange}
        onConfirm={onConfirm}
      />
    </div>
  );
}
