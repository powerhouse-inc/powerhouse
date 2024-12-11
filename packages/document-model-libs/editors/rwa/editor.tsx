import { actions, EditorProps } from "document-model/document";
import {
  RealWorldAssetsAction,
  RealWorldAssetsLocalState,
  RealWorldAssetsState,
} from "document-models/real-world-assets";
import { useEditorDispatcher } from "./hooks/useEditorDispatcher";
import { useCallback } from "react";
import {
  RWAEditor,
  RWAEditorContextProps,
  RWAEditorContextProvider,
} from "@powerhousedao/design-system";

export type IProps = EditorProps<
  RealWorldAssetsState,
  RealWorldAssetsAction,
  RealWorldAssetsLocalState
> &
  RWAEditorContextProps;

function Editor(props: IProps) {
  const {
    document,
    dispatch,
    isAllowedToCreateDocuments,
    isAllowedToEditDocuments,
    onExport,
    onClose,
    onSwitchboardLinkClick,
    onShowRevisionHistory,
  } = props;
  const state = document.state.global;

  const undo = useCallback(() => dispatch(actions.undo()), [dispatch]);
  const redo = useCallback(() => dispatch(actions.redo()), [dispatch]);
  const canUndo = document.revision.global > 0 || document.revision.local > 0;
  const canRedo = document.clipboard.length > 0;

  const editorDispatcher = useEditorDispatcher({
    dispatch,
    state,
  });

  return (
    <RWAEditorContextProvider
      canRedo={canRedo}
      canUndo={canUndo}
      editorDispatcher={editorDispatcher}
      isAllowedToCreateDocuments={isAllowedToCreateDocuments}
      isAllowedToEditDocuments={isAllowedToEditDocuments}
      onClose={onClose}
      onExport={onExport}
      onShowRevisionHistory={onShowRevisionHistory}
      onSwitchboardLinkClick={onSwitchboardLinkClick}
      redo={redo}
      state={state}
      undo={undo}
    >
      <RWAEditor />
    </RWAEditorContextProvider>
  );
}

export default Editor;
