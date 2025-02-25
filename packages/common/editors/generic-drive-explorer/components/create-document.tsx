import { Button } from "@powerhousedao/design-system";
import { DocumentModelModule } from "document-model";

interface CreateDocumentProps {
  documentModels?: DocumentModelModule[];
  createDocument: (doc: DocumentModelModule) => void;
}

export const CreateDocument: React.FC<CreateDocumentProps> = ({
  documentModels,
  createDocument,
}) => {
  return (
    <>
      <h3 className="mb-3 mt-4 text-xl font-bold text-gray-600">
        New document
      </h3>
      <div className="flex w-full flex-wrap gap-4">
        {documentModels?.map((doc) => (
          <Button
            key={doc.documentType}
            aria-details={doc.documentModelState.description}
            className="bg-gray-200 text-slate-800"
            onClick={() => createDocument(doc)}
          >
            <span className="text-sm">{doc.documentModelName}</span>
          </Button>
        ))}
      </div>
    </>
  );
};
