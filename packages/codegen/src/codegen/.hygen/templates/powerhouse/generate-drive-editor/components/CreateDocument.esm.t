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
  type VetraDocumentModelModule
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
    isDocumentTypeSupported(module.documentModel.id, documentTypes),
  );

  async function handleAddDocument(module: VetraDocumentModelModule) {
    if (!selectedDriveId) {
      return;
    }
    
    // Display the Create Document modal on the host app
    showPHModal({ type:"createDocument", documentType: module.documentModel.id });
  }

  return (
    <div className="px-6">
      {/* Customize section title here */}
      <h3 className="mb-3 mt-4 text-sm font-bold text-gray-600">
        New document
      </h3>
      {/* Customize layout by changing flex-wrap, gap, or grid layout */}
      <div className="flex w-full flex-wrap gap-4">
        {filteredDocumentModelModules?.map((documentModelModule) => {
          return (
            <Button
              key={documentModelModule.documentModel.id}
              color="light" // Customize button appearance
              size="small"
              className="cursor-pointer"
              title={documentModelModule.documentModel.name}
              aria-description={documentModelModule.documentModel.description}
              onClick={() => handleAddDocument(documentModelModule)}
            >
              {/* Customize document type display format */}
              <span className="text-sm">
                {documentModelModule.documentModel.name}
              </span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};
