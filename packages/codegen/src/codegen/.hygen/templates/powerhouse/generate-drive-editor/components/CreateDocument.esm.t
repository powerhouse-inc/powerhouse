---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/CreateDocument.tsx"
unless_exists: true
---
import { Button } from "@powerhousedao/design-system";
import { type DocumentModelModule } from "document-model";

interface CreateDocumentProps {
  documentModels?: DocumentModelModule[];
  createDocument: (doc: DocumentModelModule) => void;
}

// Helper function to extract document specification from different module formats
function getDocumentSpec(doc: DocumentModelModule) {
  if ("documentModelState" in doc) {
    return doc.documentModelState as DocumentModelModule["documentModel"];
  }

  return doc.documentModel;
}

/**
 * Document creation UI component.
 * Displays available document types as clickable buttons.
 * Customize available document types by filtering documentModels prop.
 */
export const CreateDocument: React.FC<CreateDocumentProps> = ({
  documentModels,
  createDocument,
}) => {
  return (
    <div className="px-6">
      {/* Customize section title here */}
      <h3 className="mb-3 mt-4 text-sm font-bold text-gray-600">
        New document
      </h3>
      {/* Customize layout by changing flex-wrap, gap, or grid layout */}
      <div className="flex w-full flex-wrap gap-4">
        {documentModels?.map((doc) => {
          const spec = getDocumentSpec(doc);
          return (
            <Button
              key={spec.id}
              color="light" // Customize button appearance
              size="small"
              className="cursor-pointer"
              title={spec.name}
              aria-description={spec.description}
              onClick={() => createDocument(doc)}
            >
              {/* Customize document type display format */}
              <span className="text-sm">{spec.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}; 