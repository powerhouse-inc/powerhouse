import { Button } from "@powerhousedao/design-system";
import { EditorProps } from "document-model/document";
import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "../../document-models/document-drive";
import { DriveLayout } from "./components/layout";

export type IProps = EditorProps<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
>;

export default function Editor(props: IProps) {
  // generate a random id
  // const id = documentModelUtils.hashKey();

  return (
    <DriveLayout>
      <FolderView {...uiNodes} />
      {isAllowedToCreateDocuments && (
        <>
          <h3 className="mb-3 mt-4 text-xl font-bold text-gray-600">
            New document
          </h3>
          <div className="flex w-full flex-wrap gap-4">
            {documentModels?.map((doc) => (
              <Button
                key={doc.documentModel.id}
                aria-details={doc.documentModel.description}
                className="bg-gray-200 text-slate-800"
                onClick={() => createDocument(doc)}
              >
                <span className="text-sm">
                  {getDocumentModelName(doc.documentModel.name)}
                </span>
              </Button>
            ))}
          </div>
        </>
      )}
    </DriveLayout>
  );
}
