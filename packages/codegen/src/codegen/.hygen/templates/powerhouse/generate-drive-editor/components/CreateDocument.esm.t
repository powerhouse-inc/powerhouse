---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/CreateDocument.tsx"
unless_exists: true
---
import { Button } from "@powerhousedao/design-system";
import {
  showCreateDocumentModal,
  useAllowedDocumentModelModules,
  useDocumentModelModules,
  useSelectedDriveId,
  type VetraDocumentModelModule,
} from "@powerhousedao/reactor-browser";

/**
 * Document creation UI component.
 * Displays available document types as clickable buttons.
 */
export function CreateDocument() {
  const selectedDriveId = useSelectedDriveId();
  const allowedDocumentModelModules = useAllowedDocumentModelModules();

  function handleAddDocument(module: VetraDocumentModelModule) {
    if (!selectedDriveId) {
      return;
    }

    // Display the Create Document modal on the host app
    showCreateDocumentModal(module.documentModel.global.id);
  }

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
            <Button
              key={documentModelModule.documentModel.global.id}
              color="light" // Customize button appearance
              className="cursor-pointer bg-gray-200 p-2 hover:bg-gray-300"
              title={documentModelModule.documentModel.global.name}
              aria-description={
                documentModelModule.documentModel.global.description
              }
              onClick={() => handleAddDocument(documentModelModule)}
            >
              {/* Customize document type display format */}
              <span className="text-sm">
                {documentModelModule.documentModel.global.name}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}
