import {
  addDocument,
  setSelectedNode,
  showCreateDocumentModal,
  showDeleteNodeModal,
  useDocumentModelModules,
  useSelectedDrive,
  useSetPHDriveEditorConfig,
} from "@powerhousedao/reactor-browser";
import type { FileNode } from "document-drive";
import type { EditorProps } from "document-model";
import { useCallback } from "react";
import { editorConfig } from "./config.js";
import { DOCUMENT_TYPES } from "./document-types.js";
import { DriveExplorer } from "./DriveExplorer.js";

export function BaseEditor(props: EditorProps) {
  const { children } = props;

  const [document] = useSelectedDrive();

  const driveId = document.header.id;
  const driveName = document.state.global.name ?? "";
  const driveUrl =
    document.state.local.triggers.find((t) => t.type === "PullResponder")?.data
      ?.url ??
    document.state.local.listeners.find((l) => l.callInfo?.data)?.callInfo
      ?.data ??
    "";
  const documentModels = useDocumentModelModules();
  const fileNodes = document.state.global.nodes.filter(
    (node) => node.kind === "file",
  ) as Array<FileNode>;
  const packageNode = fileNodes.find(
    (node) => node.documentType === DOCUMENT_TYPES.documentPackage,
  );
  const packageDocumentId = packageNode?.id;

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
        (model) => model.documentModel.global.id === documentType,
      );

      if (documentModel) {
        showCreateDocumentModal(documentModel.documentModel.global.id);
      }
    },
    [showCreateDocumentModal, documentModels?.length],
  );

  const onCreatePackageFile = useCallback(() => {
    addDocument(driveId, "vetra-package", DOCUMENT_TYPES.documentPackage).catch(
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
      className="bg-gray-50 p-6 after:pointer-events-none after:absolute after:inset-0 after:bg-blue-500 after:opacity-0 after:transition after:content-['']"
    >
      <DriveExplorer
        driveId={driveId}
        driveName={driveName}
        driveUrl={driveUrl}
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
        packageDocumentId={packageDocumentId}
        onAddPackageDocument={onCreatePackageFile}
        onOpenPackageDocument={onOpenPackageDocument}
        onOpenDocument={(node) => setSelectedNode(node)}
        onDelete={onDeleteDocument}
      />
    </div>
  );
}

export default function Editor(props: EditorProps) {
  useSetPHDriveEditorConfig(editorConfig);
  return <BaseEditor {...props} />;
}
