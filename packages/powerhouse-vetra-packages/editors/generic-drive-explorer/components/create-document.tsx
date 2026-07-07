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
  const nonDriveDocumentModelModules = documentModelModules?.filter(
    (module) => module.documentModel.global.id !== "powerhouse/document-drive",
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
        {nonDriveDocumentModelModules?.map((doc) => {
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
