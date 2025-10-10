---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/CreateDocument.tsx"
unless_exists: true
---
import { Button } from "@powerhousedao/design-system";
import {
  isDocumentTypeSupported,
  showPHModal,
  useDocumentModelModules,
  useSelectedDriveId,
  type VetraDocumentModelModule,
} from "@powerhousedao/reactor-browser";

interface CreateDocumentProps {
  documentTypes?: string[];
}

/**
 * Document creation UI component.
 * Displays available document types as clickable buttons.
 */
export const CreateDocument = (props: CreateDocumentProps) => {
  const { documentTypes = [] } = props;

  const selectedDriveId = useSelectedDriveId();
  const documentModelModules = useDocumentModelModules();

  const filteredDocumentModelModules = documentModelModules?.filter((module) =>
    isDocumentTypeSupported(module.documentModel.global.id, documentTypes),
  );

  function handleAddDocument(module: VetraDocumentModelModule) {
    if (!selectedDriveId) {
      return;
    }

    // Display the Create Document modal on the host app
    showPHModal({
      type: "createDocument",
      documentType: module.documentModel.global.id,
    });
  }

  return (
    <div>
      {/* Customize section title here */}
      <h3 className="mb-3 mt-4 text-sm font-bold text-gray-600">
        Create document
      </h3>
      {/* Customize layout by changing flex-wrap, gap, or grid layout */}
      <div className="flex w-full flex-wrap gap-4">
        {filteredDocumentModelModules?.map((documentModelModule) => {
          return (
            <Button
              key={documentModelModule.documentModel.global.id}
              color="light" // Customize button appearance
              className="cursor-pointer bg-gray-200 p-2 hover:bg-gray-300"
              title={documentModelModule.documentModel.global.name}
              aria-description={documentModelModule.documentModel.global.description}
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
};
