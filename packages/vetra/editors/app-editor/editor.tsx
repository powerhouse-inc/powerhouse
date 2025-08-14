import type { EditorProps } from "document-model";
import {
  type AppModuleDocument,
  actions,
} from "../../document-models/app-module/index.js";
import { AppEditorForm } from "./components/AppEditorForm.js";
import { useCallback } from "react";

export type IProps = EditorProps<AppModuleDocument>;

export default function Editor(props: IProps) {
  const { document, dispatch } = props;

  const onNameChange = useCallback((name: string) => {
    if (name === document.state.global.name) return;
    dispatch(actions.setAppName({ name }));
  }, [document.state.global.name, dispatch]);

  const onConfirm = useCallback(() => {
    dispatch(actions.setAppStatus({ status: "CONFIRMED" }));
  }, [dispatch]);

  return (
    <div>
      <AppEditorForm
        appName={document.state.global.name ?? ""}
        status={document.state.global.status}
        onNameChange={onNameChange}
        onConfirm={onConfirm}
      />
    </div>
  );
}
