import { WagmiContext } from "@powerhousedao/design-system";
import { type DriveEditorProps } from "@powerhousedao/reactor-browser";
import { AnalyticsProvider } from "@powerhousedao/reactor-browser/analytics/context";
import { DriveContextProvider, useDriveContext } from "@powerhousedao/reactor-browser/hooks/useDriveContext";
import { useInitializePHApp, useSetSelectedNode } from '@powerhousedao/state';
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

  const setSelectedNode = useSetSelectedNode();

  const fileNodes = document.state.global.nodes.filter((node) => node.kind === 'file') as Array<FileNode>
  const packageDocumentId = fileNodes.find((node) => node.documentType === DOCUMENT_TYPES.documentPackage)?.id;

  const docModelsNodes = fileNodes.filter((node) => node.documentType === DOCUMENT_TYPES.documentModel);
  const docEditorsNodes = fileNodes.filter((node) => node.documentType === DOCUMENT_TYPES.documentEditor);
  const docSubgraphsNodes = fileNodes.filter((node) => node.documentType === DOCUMENT_TYPES.documentSubgraph);
  const docProcessorsNodes = fileNodes.filter((node) => node.documentType === DOCUMENT_TYPES.documentProcessor);

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
      setSelectedNode(node.id)
    },
    [setSelectedNode],
  );

  return (
    <div className="bg-white" style={{ height: "100%" }}>
      <DriveExplorer
        documentModels={docModelsNodes}
        editors={docEditorsNodes}
        apps={[]}
        subgraphs={docSubgraphsNodes}
        processors={docProcessorsNodes}
        codegenProcessors={[]}
        onAddDocumentModel={() => onCreateDocument(DOCUMENT_TYPES.documentModel)}
        onAddEditor={() => onCreateDocument(DOCUMENT_TYPES.documentEditor)}
        onAddApp={() => console.log('add app')}
        onAddSubgraph={() => onCreateDocument(DOCUMENT_TYPES.documentSubgraph)}
        onAddProcessor={() => onCreateDocument(DOCUMENT_TYPES.documentProcessor)}
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
  useInitializePHApp();

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
