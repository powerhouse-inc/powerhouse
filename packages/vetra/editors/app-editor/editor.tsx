import { useDocumentById } from "@powerhousedao/reactor-browser";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import {
  type AppModuleDocument,
  actions,
} from "../../document-models/app-module/index.js";
import { AppEditorForm } from "./components/AppEditorForm.js";

export type IProps = EditorProps;

export default function Editor(props: IProps) {
  const { document: initialDocument } = props;
  const [document, dispatch] = useDocumentById(initialDocument.header.id);
  const unsafeCastOfDocument = document as AppModuleDocument;

  const onNameChange = useCallback(
    (name: string) => {
      if (name === unsafeCastOfDocument.state.global.name) return;
      dispatch(actions.setAppName({ name }));
    },
    [unsafeCastOfDocument.state.global.name, dispatch],
  );

  const onConfirm = useCallback(() => {
    dispatch(actions.setAppStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div>
      <AppEditorForm
        appName={unsafeCastOfDocument.state.global.name ?? ""}
        status={unsafeCastOfDocument.state.global.status}
        onNameChange={onNameChange}
        onConfirm={onConfirm}
      />
    </div>
  );
}
