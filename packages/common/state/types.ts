import type {
  DocumentDriveDocument,
  FileNode,
  IDocumentDriveServer,
} from "document-drive";
import { type EditorProps } from "document-model";
import { type FC } from "react";
import { type NOT_SET } from "./utils.js";

/** The type for the reactor instance.
 * Alias for the legacy IDocumentDriveServer type.
 */
export type Reactor = IDocumentDriveServer;

/** The type for the unset atom (sentinel) value. */
export type UnsetAtomValue = typeof NOT_SET;

/** Alias for the Loadable type from Jotai. */
export { type Loadable } from "jotai/vanilla/utils/loadable";

/** The type for the drive editor props.
 *
 * TODO: update so that these props are the same as any other editor and the `addFile` prop is removed.
 */
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

export type NodeKind = "FOLDER" | "FILE";

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
