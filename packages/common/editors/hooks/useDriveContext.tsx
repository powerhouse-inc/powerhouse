import { DocumentModel } from "document-model/document";
import { DocumentDriveDocument, Node } from "document-models/document-drive";
import { createContext, PropsWithChildren, useContext } from "react";

export interface IDriveContext {
  showSearchBar: boolean;
  isAllowedToCreateDocuments: boolean;
  documentModels: DocumentModel[];
  selectedNode: Node | null;
  selectNode: (node: Node) => void;
  drive: DocumentDriveDocument;
  addFile: (
    file: string | File,
    drive: string,
    name?: string,
    parentFolder?: string,
  ) => Promise<Node>;
  showCreateDocumentModal: (
    documentModel: DocumentModel,
  ) => Promise<{ name: string }>;
}

const DriveContext = createContext<IDriveContext | undefined>(undefined);

export const DriveContextProvider: React.FC<
  PropsWithChildren<{ value: IDriveContext }>
> = ({ value, children }) => (
  <DriveContext.Provider value={value}>{children}</DriveContext.Provider>
);

export function useDriveContext() {
  const context = useContext(DriveContext);

  if (!context) {
    throw new Error("useDriveContext must be used within a DriveProvider");
  }
  return context;
}
