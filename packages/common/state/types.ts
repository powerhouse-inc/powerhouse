import type {
  DocumentDriveDocument,
  FileNode,
  IDocumentDriveServer,
} from "document-drive";
import { type EditorProps } from "document-model";
import { type FC } from "react";
import { type NOT_SET } from "./utils.js";
export type Reactor = IDocumentDriveServer;

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

export type SharingType = "LOCAL" | "CLOUD" | "PUBLIC";

export type NodeKind = "DRIVE" | "FOLDER" | "FILE";

export type Theme = "light" | "dark";

export type ConnectConfig = {
  appVersion: string | undefined;
  studioMode: boolean;
  warnOutdatedApp: boolean;
  routerBasename: string | undefined;
  analyticsDatabaseName: string | undefined;
  sentry: {
    dsn: string | undefined;
    env: string | undefined;
    tracing: boolean | undefined;
  };
  content: {
    showSearchBar: boolean;
    showDocumentModelSelectionSetting: boolean;
  };
  drives: {
    addDriveEnabled: boolean;
    sections: {
      LOCAL: {
        enabled: boolean;
        allowAdd: boolean;
        allowDelete: boolean;
      };
      CLOUD: {
        enabled: boolean;
        allowAdd: boolean;
        allowDelete: boolean;
      };
      PUBLIC: {
        enabled: boolean;
        allowAdd: boolean;
        allowDelete: boolean;
      };
    };
  };
  gaTrackingId: string | undefined;
  phCliVersion: string | undefined;
};

export type UnsetAtomValue = typeof NOT_SET;
