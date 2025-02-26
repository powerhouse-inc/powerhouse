import { Button } from "@powerhousedao/design-system";
import { DocumentModelModule } from "document-model";

interface CreateDocumentProps {
  documentModels?: DocumentModelModule[];
  createDocument: (doc: DocumentModelModule) => void;
}

function getDocumentSpec(doc: DocumentModelModule) {
  if ("documentModelState" in doc) {
    return doc.documentModelState;
  }

  return (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    (doc as any).documentModel as DocumentModelModule["documentModelState"]
  );
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
        {documentModels?.map((doc) => {
          const spec = getDocumentSpec(doc);
          return (
            <Button
              key={doc.documentType}
              aria-details={spec.description}
              className="bg-gray-200 text-slate-800"
              onClick={() => createDocument(doc)}
            >
              <span className="text-sm">{spec.name}</span>
            </Button>
          );
        })}
      </div>
    </>
  );
};
