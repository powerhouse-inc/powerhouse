import { useDispatch } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import {
    type SubgraphModuleDocument,
    actions
} from "../../document-models/subgraph-module/index.js";
import { SubgraphEditorForm } from "./components/SubgraphEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document: initialDocument } = props;
  const [document, dispatch] = useDispatch(initialDocument);
  const unsafeCastOfDocument = document as SubgraphModuleDocument;
  const onConfirm = useCallback((name: string) => {
    if (!unsafeCastOfDocument.state.global.name && !name) return;
    if (name === unsafeCastOfDocument.state.global.name) return;

    dispatch(actions.setSubgraphName({ name }));
  }, [unsafeCastOfDocument.state.global.name, dispatch]);

  return (
    <div>
      <SubgraphEditorForm
        subgraphName={unsafeCastOfDocument.state.global.name ?? ""}
        onConfirm={onConfirm}
      />
    </div>
  );
}
