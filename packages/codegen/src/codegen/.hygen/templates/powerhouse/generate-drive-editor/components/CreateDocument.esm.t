---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/components/CreateDocument.tsx"
unless_exists: true
---
import { Button } from "@powerhousedao/design-system";
import { type DocumentModelModule } from "document-model";
import { TypeFormatFlags } from "typescript";

interface CreateDocumentProps {
  documentModels?: DocumentModelModule[];
  createDocument: (doc: DocumentModelModule) => void;
}

function getDocumentSpec(doc: DocumentModelModule) {
  if ("documentModelState" in doc) {
    return doc.documentModelState as DocumentModelModule["documentModel"];
  }

  return doc.documentModel;
}

export const CreateDocument: React.FC<CreateDocumentProps> = ({
  documentModels,
  createDocument,
}) => {
  return (
    <div className="px-6">
      <h3 className="mb-3 mt-4 text-sm font-bold text-gray-600">
        New document
      </h3>
      <div className="flex w-full flex-wrap gap-4">
        {documentModels?.map((doc) => {
          const spec = getDocumentSpec(doc);
          return (
            <Button
              key={spec.id}
              color="light"
              size="small"
              className="cursor-pointer"
              title={spec.name}
              aria-description={spec.description}
              onClick={() => createDocument(doc)}
            >
              <span className="text-sm">{spec.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
}; 