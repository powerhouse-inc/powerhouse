import React from "react";
import { Action, EditorProps } from "document-model/document";

export type EditorConfig = {
  id: string;
  disableExternalControls: boolean;
  documentToolbarEnabled?: boolean;
};

export type EditorContextProps = {
  readonly isAllowedToCreateDocuments: boolean;
  readonly isAllowedToEditDocuments: boolean;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly onSwitchboardLinkClick: (() => void) | undefined;
  readonly onExport: () => void;
  readonly onClose: () => void;
  readonly onShowRevisionHistory: () => void;
};

export type ExtendedEditor<
  S = unknown,
  A extends Action = Action,
  L = unknown,
  CustomProps = unknown,
> = {
  Component: React.FC<
    EditorProps<S, A, L> & CustomProps & Record<string, unknown>
  >;
  documentTypes: string[];
  config?: Partial<EditorConfig>;
};
