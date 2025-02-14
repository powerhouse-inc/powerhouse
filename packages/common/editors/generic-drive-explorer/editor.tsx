import { Breadcrumbs } from "@powerhousedao/design-system";
import { EditorProps } from "document-model/document";
import { useDriveSettings } from "editors/hooks/use-drive-settings";
import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "../../document-models/document-drive";
import { CreateDocument } from "./components/create-document";
import { DriveLayout } from "./components/layout";
import { SearchBar } from "./components/search-bar";

export type IProps = EditorProps<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
>;

export default function Editor(props: IProps) {
  // generate a random id
  // const id = documentModelUtils.hashKey();
  const { showSearchBar, isAllowedToCreateDocuments, documentModels } =
    useDriveSettings();

  return (
    <DriveLayout>
      <DriveLayout.Header>
        <Breadcrumbs {...uiNodes} />
        {showSearchBar && <SearchBar />}
      </DriveLayout.Header>
      <DriveLayout.Content>
        <FolderView {...uiNodes} />
      </DriveLayout.Content>
      <DriveLayout.Footer>
        {isAllowedToCreateDocuments && (
          <CreateDocument
            documentModels={documentModels}
            createDocument={() => {}}
            getDocumentModelName={() => ""}
          />
        )}
      </DriveLayout.Footer>
    </DriveLayout>
  );
}
