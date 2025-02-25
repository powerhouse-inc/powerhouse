import { DriveContextProvider } from "#editors/hooks/useDriveContext";
import {
  createDocumentStory,
  DocumentStory,
  EditorStoryArgs,
  EditorStoryComponent,
  type EditorStoryProps,
} from "@powerhousedao/builder-tools/editor-utils";
import {
  DRIVE,
  UiDriveNode,
  UiNodesContextProvider,
  useUiNodesContext,
} from "@powerhousedao/design-system";
import { Decorator, Meta } from "@storybook/react";
import {
  DocumentDriveDocument,
  DocumentDriveLocalState,
  DocumentDriveState,
  driveDocumentModelModule,
  Node,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  DocumentModelModule,
  ExtendedState,
  PartialState,
} from "document-model";
import { PropsWithChildren, useEffect, useState } from "react";
import { makeUiDriveNode } from "./uiNodes";

// Sets the ui drive nodes for the story
function UINodesSetter(
  props: PropsWithChildren<{
    document: DocumentDriveDocument;
  }>,
) {
  const { document } = props;
  const { setDriveNodes, selectedNode, setSelectedNode } = useUiNodesContext();

  const [uiDriveNode, setUiDriveNode] = useState<UiDriveNode | null>(null);

  useEffect(() => {
    const node = makeUiDriveNode(document);
    setUiDriveNode((prev) => {
      if (JSON.stringify(prev) !== JSON.stringify(node)) {
        return node;
      } else {
        return prev;
      }
    });
  }, [document]);

  useEffect(() => {
    if (
      !selectedNode ||
      (selectedNode.kind === DRIVE && selectedNode.id !== uiDriveNode?.id)
    ) {
      setSelectedNode(uiDriveNode);
    }
  }, [uiDriveNode, selectedNode, setSelectedNode]);

  useEffect(() => {
    setDriveNodes(uiDriveNode ? [uiDriveNode] : []);
  }, [uiDriveNode, setDriveNodes]);

  return null;
}

const UiNodesContextDecorator: Decorator<
  EditorStoryProps<DocumentDriveDocument>
> = (Story, context) => {
  const { document } = context.args;
  return (
    <UiNodesContextProvider>
      <UINodesSetter document={document} />
      <Story />
    </UiNodesContextProvider>
  );
};

const DriveContextDecorator: Decorator<
  EditorStoryProps<DocumentDriveDocument>
> = (Story, context) => {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  return (
    <DriveContextProvider
      value={{
        showSearchBar: false,
        isAllowedToCreateDocuments: true,
        documentModels: [
          documentModelDocumentModelModule as DocumentModelModule,
        ],
        selectedNode,
        selectNode: setSelectedNode,
        addFile() {
          throw new Error("addFile not implemented");
        },
        showCreateDocumentModal(documentModel: DocumentModelModule) {
          return Promise.resolve({
            name: `New ${documentModel.documentModelName}`,
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
  return createDocumentStory(
    Editor,
    driveDocumentModelModule.reducer,
    initialState ??
      driveDocumentModelModule.utils.createExtendedState({
        state: { global: { id: "powerhouse", name: "Powerhouse" }, local: {} },
      }),
    additionalStoryArgs,
    [DriveContextDecorator, ...(decorators ?? [])],
  );
}

export function createDriveStoryWithUINodes(
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
  return createDocumentStory(
    Editor,
    driveDocumentModelModule.reducer,
    initialState ??
      driveDocumentModelModule.utils.createExtendedState({
        state: { global: { id: "powerhouse", name: "Powerhouse" }, local: {} },
      }),
    additionalStoryArgs,
    [DriveContextDecorator, UiNodesContextDecorator, ...(decorators ?? [])],
  );
}
