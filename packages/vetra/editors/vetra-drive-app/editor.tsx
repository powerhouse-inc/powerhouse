import { WagmiContext } from "@powerhousedao/design-system";
import type { DriveEditorProps } from "@powerhousedao/reactor-browser";
import {
  addDocument,
  DriveContextProvider,
  setSelectedNode,
  useAnalyticsDatabaseName,
  useDocumentModelModules,
  useDriveContext,
} from "@powerhousedao/reactor-browser";
import { AnalyticsProvider } from "@powerhousedao/reactor-browser/analytics";
import type { DocumentDriveDocument, FileNode } from "document-drive";
import { useCallback } from "react";
import { DriveExplorer } from "./DriveExplorer.js";
import { DOCUMENT_TYPES } from "./document-types.js";

export type IProps = DriveEditorProps;

export function BaseEditor(props: IProps) {
  const { context, document } = props;
  const unsafeCastOfDocument = document as DocumentDriveDocument;
  const { showCreateDocumentModal } = useDriveContext();
  const driveId = unsafeCastOfDocument.header.id;
  const documentModels = useDocumentModelModules();
  const fileNodes = unsafeCastOfDocument.state.global.nodes.filter(
    (node) => node.kind === "file",
  ) as Array<FileNode>;
  const packageDocumentId = fileNodes.find(
    (node) => node.documentType === DOCUMENT_TYPES.documentPackage,
  )?.id;

  const docModelsNodes = fileNodes.filter(
    (node) => node.documentType === DOCUMENT_TYPES.documentModel,
  );
  const docEditorsNodes = fileNodes.filter(
    (node) => node.documentType === DOCUMENT_TYPES.documentEditor,
  );
  const docSubgraphsNodes = fileNodes.filter(
    (node) => node.documentType === DOCUMENT_TYPES.documentSubgraph,
  );
  const docProcessorsNodes = fileNodes.filter(
    (node) => node.documentType === DOCUMENT_TYPES.documentProcessor,
  );
  const docAppsNodes = fileNodes.filter(
    (node) => node.documentType === DOCUMENT_TYPES.documentApp,
  );

  const onCreateDocument = useCallback(
    (documentType: string) => {
      const documentModel = documentModels?.find(
        (model) => model.documentModel.id === documentType,
      );

      if (documentModel) {
        showCreateDocumentModal(documentModel);
      }
    },
    [showCreateDocumentModal, documentModels?.length],
  );

  const onCreatePackageFile = useCallback(() => {
    addDocument(driveId, "vetra-package", DOCUMENT_TYPES.documentPackage);
  }, [driveId]);

  return (
    <div className="bg-white" style={{ height: "100%" }}>
      <DriveExplorer
        documentModels={docModelsNodes}
        editors={docEditorsNodes}
        apps={docAppsNodes}
        subgraphs={docSubgraphsNodes}
        processors={docProcessorsNodes}
        codegenProcessors={[]}
        onAddDocumentModel={() =>
          onCreateDocument(DOCUMENT_TYPES.documentModel)
        }
        onAddEditor={() => onCreateDocument(DOCUMENT_TYPES.documentEditor)}
        onAddApp={() => onCreateDocument(DOCUMENT_TYPES.documentApp)}
        onAddSubgraph={() => onCreateDocument(DOCUMENT_TYPES.documentSubgraph)}
        onAddProcessor={() =>
          onCreateDocument(DOCUMENT_TYPES.documentProcessor)
        }
        onAddCodegenProcessor={() => console.log("add codegen processor")}
        context={context}
        packageDocumentId={packageDocumentId}
        onAddPackageDocument={onCreatePackageFile}
        driveId={document.header.id}
        onOpenDocument={(node) => setSelectedNode(node)}
      />
    </div>
  );
}

export default function Editor(props: IProps) {
  const analyticsDatabaseName = useAnalyticsDatabaseName();
  return (
    <DriveContextProvider value={props.context}>
      <WagmiContext>
        <AnalyticsProvider databaseName={analyticsDatabaseName}>
          <BaseEditor {...props} />
        </AnalyticsProvider>
      </WagmiContext>
    </DriveContextProvider>
  );
}
