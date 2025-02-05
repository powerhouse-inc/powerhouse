export type EditorConfig = {
  id: string;
  disableExternalControls: boolean;
  documentToolbarEnabled?: boolean;
  showSwitchboardLink?: boolean;
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
