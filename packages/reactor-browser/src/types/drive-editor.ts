import type { ComponentType } from "react";

export type DriveEditorConfig = {
  id: string;
  name?: string;
  disableExternalControls?: boolean;
  documentToolbarEnabled?: boolean;
  showSwitchboardLink?: boolean;
  documentTypes?: string[];
  dragAndDrop?: {
    enabled?: boolean;
  };
};

export type DriveEditorProps = {
  children?: React.ReactNode;
  editorConfig?: DriveEditorConfig;
};

export type DriveEditorModule = {
  Component: ComponentType<DriveEditorProps>;
  documentTypes: string[];
  config: DriveEditorConfig;
};
