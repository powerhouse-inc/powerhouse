import { WagmiContext } from "@powerhousedao/design-system";
import { type DriveEditorProps } from "@powerhousedao/reactor-browser";
import { AnalyticsProvider } from "@powerhousedao/reactor-browser/analytics/context";
import { DriveContextProvider, useDriveContext } from "@powerhousedao/reactor-browser/hooks/useDriveContext";
import {
  type DocumentDriveDocument,
  type FileNode
} from "document-drive";
import { useCallback } from "react";

import { DriveExplorer } from "./DriveExplorer.js";
import { DOCUMENT_TYPES } from "./document-types.js";

export type IProps = DriveEditorProps<DocumentDriveDocument>;

export function BaseEditor(props: IProps) {
  const { dispatch, context, document } = props;

  const {
    documentModels,
    showCreateDocumentModal,
    addDocument,
  } = useDriveContext();
  const driveId = document.header.id;

  const fileNodes = document.state.global.nodes.filter((node) => node.kind === 'file') as Array<FileNode>
  const packageDocumentId = fileNodes.find((node) => node.documentType === DOCUMENT_TYPES.documentPackage)?.id;

  const docModelsNodes = fileNodes.filter((node) => node.documentType === DOCUMENT_TYPES.documentModel);
  const docEditorsNodes = fileNodes.filter((node) => node.documentType === DOCUMENT_TYPES.documentEditor);

  const onCreateDocument = useCallback(
    (documentType: string) => {
      const documentModel = documentModels.find((model) => model.documentModel.id === documentType);

      if (documentModel) {
        showCreateDocumentModal(documentModel);
      }
    },
    [showCreateDocumentModal, documentModels.length],
  );

  const onCreatePackageFile = useCallback(
    () => {
      addDocument(driveId, 'vetra-package', DOCUMENT_TYPES.documentPackage)
    },
    [addDocument, driveId],
  );

  // TODO: set selected document from @powerhousedao/state
  const onOpenDocument = useCallback(
    (node: FileNode) => {
      console.log('onOpenDocument', node);
    },
    [],
  );

  return (
    <div className="bg-white" style={{ height: "100%" }}>
      <DriveExplorer
        documentModels={docModelsNodes}
        editors={docEditorsNodes}
        apps={[]}
        subgraphs={[]}
        processors={[]}
        codegenProcessors={[]}
        onAddDocumentModel={() => onCreateDocument(DOCUMENT_TYPES.documentModel)}
        onAddEditor={() => onCreateDocument(DOCUMENT_TYPES.documentEditor)}
        onAddApp={() => console.log('add app')}
        onAddSubgraph={() => console.log('add subgraph')}
        onAddProcessor={() => console.log('add processor')}
        onAddCodegenProcessor={() => console.log('add codegen processor')}
        context={context}
        packageDocumentId={packageDocumentId}
        onAddPackageDocument={onCreatePackageFile}
        driveId={document.header.id}
        onOpenDocument={onOpenDocument}
      />
    </div>
  );
}

export default function Editor(props: IProps) {
  return (
    <DriveContextProvider value={props.context}>
      <WagmiContext>
        <AnalyticsProvider databaseName={props.context.analyticsDatabaseName}>
          <BaseEditor {...props} />
        </AnalyticsProvider>
      </WagmiContext>
    </DriveContextProvider>
  );
}
