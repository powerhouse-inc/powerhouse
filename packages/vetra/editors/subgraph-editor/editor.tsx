import { useCallback } from "react";
import { actions } from "../../document-models/subgraph-module/index.js";
import { useSelectedSubgraphModuleDocument } from "../hooks/useVetraDocument.js";
import { SubgraphEditorForm } from "./components/SubgraphEditorForm.js";

export function Editor() {
  const [document, dispatch] = useSelectedSubgraphModuleDocument();

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
