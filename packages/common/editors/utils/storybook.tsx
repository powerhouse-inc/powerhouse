import {
  createDocumentStory,
  type DocumentStory,
  type EditorStoryArgs,
  type EditorStoryComponent,
  type EditorStoryProps,
} from "@powerhousedao/builder-tools/editor-utils";
import { DriveContextProvider } from "@powerhousedao/reactor-browser";
import { type Decorator, type Meta } from "@storybook/react";
import {
  type DocumentDriveDocument,
  type DocumentDriveLocalState,
  type DocumentDriveState,
  driveDocumentModelModule,
  type IDocumentDriveServer,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  type DocumentModelModule,
  type ExtendedState,
  type PartialState,
} from "document-model";

const DriveContextDecorator: Decorator<
  EditorStoryProps<DocumentDriveDocument>
> = (Story, context) => {
  return (
    <DriveContextProvider
      value={{
        selectedDrive: context.args.document,
        selectedFolder: undefined,
        selectedDocument: context.args.document,
        parentFolder: undefined,
        analyticsDatabaseName: "test",
        setSelectedNode: () => {},
        setSelectedDrive: () => {},
        onAddFile: () => Promise.resolve(),
        onAddFolder: () => Promise.resolve(undefined),
        onRenameNode: () => Promise.resolve(undefined),
        onCopyNode: () => Promise.resolve(),
        onMoveNode: () => Promise.resolve(),
        onDuplicateNode: () => Promise.resolve(),
        onAddAndSelectNewFolder: () => Promise.resolve(),
        getSyncStatusSync: () => undefined,
        showDeleteNodeModal: () => {},
        getDocumentModelModule: () => undefined,
        getEditor: () => undefined,
        reactor: {} as unknown as IDocumentDriveServer,
        useDocumentEditorProps: () => ({
          dispatch: () => {},
          document: context.args.document,
          error: undefined,
        }),
        showSearchBar: false,
        isAllowedToCreateDocuments: true,
        documentModels: [
          documentModelDocumentModelModule as DocumentModelModule,
        ],
        addFile() {
          throw new Error("addFile not implemented");
        },
        addDocument() {
          throw new Error("addDocument not implemented");
        },
        showCreateDocumentModal(documentModel: DocumentModelModule) {
          return Promise.resolve({
            name: `New ${documentModel.documentModel.name}`,
          });
        },
      }}
    >
      <Story />
    </DriveContextProvider>
  );
};

export function createDriveStory(
  Editor: EditorStoryComponent<DocumentDriveDocument>,
  initialState?: ExtendedState<
    PartialState<DocumentDriveState>,
    PartialState<DocumentDriveLocalState>
  >,
  additionalStoryArgs?: EditorStoryArgs<DocumentDriveDocument>,
  decorators?: Decorator<EditorStoryProps<DocumentDriveDocument>>[],
): {
  meta: Meta<typeof Editor>;
  CreateDocumentStory: DocumentStory<DocumentDriveDocument>;
} {
  const story = createDocumentStory(
    Editor,
    driveDocumentModelModule.reducer,
    initialState ?? {
      ...driveDocumentModelModule.utils.createExtendedState({
        state: { global: { name: "Powerhouse" }, local: {} },
      }),
    },
    additionalStoryArgs,
    [DriveContextDecorator, ...(decorators ?? [])],
  );
  story.meta.id = "powerhouse";
  return story;
}
