import { useDocumentById } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import {
  type SubgraphModuleDocument,
  actions,
} from "../../document-models/subgraph-module/index.js";
import { SubgraphEditorForm } from "./components/SubgraphEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document: initialDocument } = props;
  const [document, dispatch] = useDocumentById(initialDocument.header.id);
  const unsafeCastOfDocument = document as SubgraphModuleDocument;

  const onNameChange = useCallback(
    (name: string) => {
      if (name === unsafeCastOfDocument.state.global.name) return;
      dispatch(actions.setSubgraphName({ name }));
    },
    [unsafeCastOfDocument.state.global.name, dispatch],
  );

  const onConfirm = useCallback(() => {
    dispatch(actions.setSubgraphStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div>
      <SubgraphEditorForm
        subgraphName={unsafeCastOfDocument.state.global.name ?? ""}
        status={unsafeCastOfDocument.state.global.status}
        onNameChange={onNameChange}
        onConfirm={onConfirm}
      />
    </div>
  );
}
