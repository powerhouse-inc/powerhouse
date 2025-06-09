import type { DocumentDriveDocument, FileNode } from "document-drive";
import { type EditorProps } from "document-model";
import { type FC } from "react";

export type DriveEditorProps = EditorProps<DocumentDriveDocument> & {
  addFile: (
    file: string | File,
    driveId: string,
    name?: string,
    parentFolderId?: string,
  ) => Promise<FileNode>;
  className?: string;
  children?: React.ReactNode;
};
export type DriveEditorModule = {
  Component: FC<DriveEditorProps>;
  documentTypes: string[];
  config: {
    id: string;
    disableExternalControls?: boolean;
    documentToolbarEnabled?: boolean;
    showSwitchboardLink?: boolean;
  };
};
