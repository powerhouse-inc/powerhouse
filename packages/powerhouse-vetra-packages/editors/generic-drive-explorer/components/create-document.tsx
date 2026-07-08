import { PowerhouseButton } from "@powerhousedao/design-system";
import {
  preloadEditorModule,
  showCreateDocumentModal,
  useDocumentModelModules,
  useEditorModules,
  useUserPermissions,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";

function getDocumentSpec(doc: DocumentModelModule): DocumentModelGlobalState {
  return doc.documentModel.global;
}

export function CreateDocument() {
  const { isAllowedToCreateDocuments } = useUserPermissions();
  const documentModelModules = useDocumentModelModules();
  const editorModules = useEditorModules();
  // Hide "document-drive" (drive root) and vetra builder-spec types (App Module,
  // Document Editor, Processor Module, Subgraph Module, Vetra Package) from the
  // generic explorer's "New document" section.
  const HIDDEN_DOCUMENT_TYPES = [
    "powerhouse/document-drive",
    "powerhouse/app",
    "powerhouse/document-editor",
    "powerhouse/processor",
    "powerhouse/subgraph",
    "powerhouse/package",
  ];
  const visibleDocumentModelModules = documentModelModules?.filter(
    (module) => !HIDDEN_DOCUMENT_TYPES.includes(module.documentModel.global.id),
  );
  const preloadEditorsForType = (documentType: string) =>
    editorModules
      ?.filter((editorModule) =>
        editorModule.documentTypes.includes(documentType),
      )
      .forEach((editorModule) => {
        void preloadEditorModule(editorModule);
      });
  if (!isAllowedToCreateDocuments) return null;
  return (
    <div className="px-6 py-4">
      <h3 className="mb-3 text-xl font-bold text-foreground">New document</h3>
      <div className="flex w-full flex-wrap gap-4">
        {visibleDocumentModelModules?.map((doc) => {
          const spec = getDocumentSpec(doc);
          const versionLabel = doc.version ? ` v${doc.version}` : "";
          return (
            <PowerhouseButton
              key={`${spec.id}-v${doc.version ?? 1}`}
              color="light"
              title={`${spec.name}${versionLabel}`}
              aria-description={spec.description}
              onMouseEnter={() => preloadEditorsForType(spec.id)}
              onFocus={() => preloadEditorsForType(spec.id)}
              onClick={() => showCreateDocumentModal(spec.id)}
            >
              <span className="text-sm">
                {spec.name}
                {versionLabel}
              </span>
            </PowerhouseButton>
          );
        })}
      </div>
    </div>
  );
}
