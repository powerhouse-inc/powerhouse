import type {
  DocumentDriveAction,
  DocumentDriveDocument,
  FolderNode,
  Node,
} from "@powerhousedao/shared/document-drive";
import type { DocumentDispatch } from "@powerhousedao/shared/document-model";
import type { ReactNode } from "react";
import { createContext, useContext } from "react";
import type { PHNavigateOptions } from "../types/global.js";

/** The drive a drive app shows. `open`/`preload` replace the app's navigation,
 * e.g. for a host that keeps the open node in local state. */
export type DriveContextValue = {
  drive: DocumentDriveDocument;
  dispatch: DocumentDispatch<DocumentDriveAction>;
  /** The open folder; undefined at the drive's root or on a document. */
  folder?: FolderNode;
  /** The open node, a folder or a document. */
  nodeId?: string;
  open?: (node: Node | undefined, options?: PHNavigateOptions) => void;
  preload?: (node: Node | undefined) => void;
};

const DriveContext = createContext<DriveContextValue | undefined>(undefined);

/** Hosts render a drive app inside this; `useSelectedDrive`, `useSelectedNode`
 * and `useSelectedFolder` below read it, and opening nodes calls its `open`. */
export function DriveProvider(props: {
  value: DriveContextValue;
  children: ReactNode;
}) {
  return (
    <DriveContext.Provider value={props.value}>
      {props.children}
    </DriveContext.Provider>
  );
}

/** The nearest drive app's drive, or undefined outside one. */
export function useDriveContext() {
  return useContext(DriveContext);
}
