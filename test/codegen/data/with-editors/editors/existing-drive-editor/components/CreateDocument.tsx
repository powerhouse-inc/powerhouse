import type { VetraDocumentModelModule } from "@powerhousedao/reactor-browser";
import {
  showCreateDocumentModal,
  useAllowedDocumentModelModules,
} from "@powerhousedao/reactor-browser";

/**
 * Document creation UI component.
 * Displays available document types as clickable buttons.
 */
export function CreateDocument() {
  const allowedDocumentModelModules = useAllowedDocumentModelModules();

  return (
    <div>
      {/* Customize section title here */}
      <h3 className="mb-3 mt-4 text-sm font-bold text-gray-600">
        Create document
      </h3>
      {/* Customize layout by changing flex-wrap, gap, or grid layout */}
      <div className="flex w-full flex-wrap gap-4">
        {allowedDocumentModelModules?.map((documentModelModule) => {
          return (
            <CreateDocumentButton
              key={documentModelModule.documentModel.global.id}
              documentModelModule={documentModelModule}
            />
          );
        })}
      </div>
    </div>
  );
}

type Props = {
  documentModelModule: VetraDocumentModelModule;
};
function CreateDocumentButton({ documentModelModule }: Props) {
  const documentType = documentModelModule.documentModel.global.id;
  const documentModelName =
    documentModelModule.documentModel.global.name || documentType;
  const documentModelDescription =
    documentModelModule.documentModel.global.description;
  return (
    <button
      className="cursor-pointer rounded-md bg-gray-200 py-2 px-3 hover:bg-gray-300"
      title={documentModelName}
      aria-description={documentModelDescription}
      onClick={() => showCreateDocumentModal(documentType)}
    >
      {documentModelName}
    </button>
  );
}
