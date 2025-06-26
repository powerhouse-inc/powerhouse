import { Button } from "@powerhousedao/design-system";
import { type DocumentModelModule } from "document-model";
import { useUnwrappedDocumentModelModules } from "../../../state/document-model-modules.js";
import { useModal } from "../../../state/modals.js";
import { useIsAllowedToCreateDocuments } from "../../../state/permissions.js";

function getDocumentSpec(doc: DocumentModelModule) {
  if ("documentModelState" in doc) {
    return doc.documentModelState as DocumentModelModule["documentModel"];
  }

  return doc.documentModel;
}

export const CreateDocument: React.FC = () => {
  const documentModelModules = useUnwrappedDocumentModelModules();
  const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();
  const { show: showAddDocumentModal } = useModal("addDocument");

  if (!isAllowedToCreateDocuments || !documentModelModules) {
    return null;
  }

  return (
    <div className="px-6">
      <h3 className="mb-3 mt-4 text-xl font-bold text-gray-600">
        New document
      </h3>
      <div className="flex w-full flex-wrap gap-4">
        {documentModelModules
          .filter((doc) => doc.documentModel.id !== "powerhouse/document-drive")
          .map((documentModelModule) => {
            const spec = getDocumentSpec(documentModelModule);
            return (
              <Button
                key={spec.id}
                color="light"
                aria-details={spec.description}
                onClick={() =>
                  showAddDocumentModal({
                    documentModelId: documentModelModule.documentModel.id,
                  })
                }
              >
                <span className="text-sm">{spec.name}</span>
              </Button>
            );
          })}
      </div>
    </div>
  );
};
