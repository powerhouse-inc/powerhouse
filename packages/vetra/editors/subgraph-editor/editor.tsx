import type { EditorProps } from "document-model";
import {
  type SubgraphModuleDocument,
  actions,
} from "../../document-models/subgraph-module/index.js";
import { SubgraphEditorForm } from "./components/SubgraphEditorForm.js";
import { useCallback } from "react";

export type IProps = EditorProps<SubgraphModuleDocument>;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;

  const onConfirm = useCallback((name: string) => {
    if (!document.state.global.name && !name) return;
    if (name === document.state.global.name) return;

    dispatch(actions.setSubgraphName({ name }));
  }, [document.state.global.name, dispatch]);

  return (
    <div>
      <SubgraphEditorForm
        subgraphName={document.state.global.name ?? ""}
        onConfirm={onConfirm}
      />
    </div>
  );
}
