import { PowerhouseButton } from "@powerhousedao/design-system";
import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "document-model";

interface CreateDocumentProps {
  documentModels?: DocumentModelModule[];
  createDocument: (doc: DocumentModelModule) => void;
}

function getDocumentSpec(doc: DocumentModelModule): DocumentModelGlobalState {
  return doc.documentModel.global;
}

export const CreateDocument: React.FC<CreateDocumentProps> = ({
  documentModels,
  createDocument,
}) => {
  return (
    <div className="px-6 py-4">
      <h3 className="mb-3 text-xl font-bold text-gray-600">New document</h3>
      <div className="flex w-full flex-wrap gap-4">
        {documentModels?.map((doc) => {
          const spec = getDocumentSpec(doc);
          return (
            <PowerhouseButton
              key={spec.id}
              color="light"
              title={spec.name}
              aria-description={spec.description}
              onClick={() => createDocument(doc)}
            >
              <span className="text-sm">{spec.name}</span>
            </PowerhouseButton>
          );
        })}
      </div>
    </div>
  );
};
