import { WagmiContext, withDropZone } from "@powerhousedao/design-system";
import {
  addDocument,
  AnalyticsProvider,
  setSelectedNode,
  showCreateDocumentModal,
  showDeleteNodeModal,
  useAnalyticsDatabaseName,
  useDocumentModelModules,
  useFileNodesInSelectedDrive,
  useSelectedDrive,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "document-drive";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import { DriveExplorer } from "./DriveExplorer.js";

export function BaseEditor({ children }: EditorProps) {
  const [document] = useSelectedDrive();
  const driveId = document.header.id;
  const documentModels = useDocumentModelModules();
  const fileNodes = useFileNodesInSelectedDrive() ?? [];

  const packageNode = fileNodes.find(
    (node) => node.documentType === "powerhouse/package",
  );
  const packageDocumentId = packageNode?.id;

  const docModelsNodes = fileNodes.filter(
    (node) => node.documentType === "powerhouse/document-model",
  );
  const docEditorsNodes = fileNodes.filter(
    (node) => node.documentType === "powerhouse/document-editor",
  );
  const docSubgraphsNodes = fileNodes.filter(
    (node) => node.documentType === "powerhouse/subgraph",
  );
  const docProcessorsNodes = fileNodes.filter(
    (node) => node.documentType === "powerhouse/processor",
  );
  const docAppsNodes = fileNodes.filter(
    (node) => node.documentType === "powerhouse/app",
  );

  const onCreateDocument = useCallback(
    (documentType: string) => {
      const documentModel = documentModels?.find(
        (model) => model.documentModel.global.id === documentType,
      );

      if (documentModel) {
        showCreateDocumentModal(documentModel.documentModel.global.id);
      }
    },
    [showCreateDocumentModal, documentModels?.length],
  );

  const onCreatePackageFile = useCallback(() => {
    addDocument(driveId, "vetra-package", "powerhouse/package").catch(
      console.error,
    );
  }, [driveId]);

  const onDeleteDocument = useCallback((node: FileNode) => {
    showDeleteNodeModal(node.id);
  }, []);

  const onOpenPackageDocument = useCallback(() => {
    if (packageNode) {
      setSelectedNode(packageNode);
    }
  }, [packageNode]);

  const showDocumentEditor = !!children;

  return showDocumentEditor ? (
    children
  ) : (
    <div
      style={{ height: "100%" }}
      className="bg-white after:pointer-events-none after:absolute after:inset-0 after:bg-blue-500 after:opacity-0 after:transition after:content-['']"
    >
      <DriveExplorer
        documentModels={docModelsNodes}
        editors={docEditorsNodes}
        apps={docAppsNodes}
        subgraphs={docSubgraphsNodes}
        processors={docProcessorsNodes}
        codegenProcessors={[]}
        onAddDocumentModel={() => onCreateDocument("powerhouse/document-model")}
        onAddEditor={() => onCreateDocument("powerhouse/document-editor")}
        onAddApp={() => onCreateDocument("powerhouse/app")}
        onAddSubgraph={() => onCreateDocument("powerhouse/subgraph")}
        onAddProcessor={() => onCreateDocument("powerhouse/processor")}
        onAddCodegenProcessor={() => console.log("add codegen processor")}
        packageDocumentId={packageDocumentId}
        onAddPackageDocument={onCreatePackageFile}
        onOpenPackageDocument={onOpenPackageDocument}
        onOpenDocument={(node) => setSelectedNode(node)}
        onDelete={onDeleteDocument}
      />
    </div>
  );
}

const BaseEditorWithDropZone = withDropZone(BaseEditor);

export function Editor(props: EditorProps) {
  const analyticsDatabaseName = useAnalyticsDatabaseName();
  return (
    <WagmiContext>
      <AnalyticsProvider databaseName={analyticsDatabaseName}>
        <BaseEditorWithDropZone {...props} />
      </AnalyticsProvider>
    </WagmiContext>
  );
}
