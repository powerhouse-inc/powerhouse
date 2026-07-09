import { PowerhouseButton } from "@powerhousedao/design-system";
import {
  preloadEditorModule,
  showCreateDocumentModal,
  useAllowedDocumentModelModules,
  useDisabledEditors,
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
  // Respect Connect config: allowedDocumentTypes (allowlist) via the hook,
  // disabledEditors (denylist) subtracted below.
  const allowedDocumentModelModules = useAllowedDocumentModelModules();
  const editorModules = useEditorModules();
  const disabledEditors = useDisabledEditors() ?? [];
  // Drive containers are never documents-in-a-drive; hide them structurally so
  // this shared editor can't fail open when disabledEditors is unset.
  const DRIVE_CONTAINER_TYPES = [
    "powerhouse/document-drive",
    "powerhouse/reactor-drive",
  ];
  const visibleDocumentModelModules = allowedDocumentModelModules?.filter(
    (module) => {
      const id = module.documentModel.global.id;
      return (
        !DRIVE_CONTAINER_TYPES.includes(id) && !disabledEditors.includes(id)
      );
    },
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
