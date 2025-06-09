import {
  useDocumentModelModules,
  useIsAllowedToCreateDocuments,
  useModal,
} from "#state";
import { Button } from "@powerhousedao/design-system";
import { type DocumentModelModule } from "document-model";
import { useCallback } from "react";

function getDocumentSpec(doc: DocumentModelModule) {
  if ("documentModelState" in doc) {
    return doc.documentModelState as DocumentModelModule["documentModel"];
  }

  return doc.documentModel;
}

export const CreateDocument: React.FC = () => {
  const documentModelModules = useDocumentModelModules();
  const isAllowedToCreateDocuments = useIsAllowedToCreateDocuments();
  const { show } = useModal("addDocument");
  const onClick = useCallback(
    (documentModelModule: DocumentModelModule) => {
      show({ documentModelModule });
    },
    [show],
  );

  if (!isAllowedToCreateDocuments) {
    return null;
  }

  return (
    <div className="px-6">
      <h3 className="mb-3 mt-4 text-xl font-bold text-gray-600">
        New document
      </h3>
      <div className="flex w-full flex-wrap gap-4">
        {documentModelModules?.map((documentModelModule) => {
          const spec = getDocumentSpec(documentModelModule);
          return (
            <Button
              key={spec.id}
              color="light"
              aria-details={spec.description}
              onClick={() => onClick(documentModelModule)}
            >
              <span className="text-sm">{spec.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );
};
