import { makeUiDriveNode } from "@editors/utils";
import {
  UiDriveNode,
  UiNodesContextProvider,
  useUiNodesContext,
} from "@powerhousedao/design-system";
import { Decorator } from "@storybook/react";
import { StoryFn } from "@storybook/types";
import { createDocumentStory } from "document-model-libs/utils";
import { DocumentModel } from "document-model/document";
import { module as DocumentModelModule } from "document-model/document-model";
import * as DocumentDriveModule from "document-models/document-drive";
import { Node } from "document-models/document-drive";
import { DriveContextProvider } from "editors/hooks/useDriveContext";
import { PropsWithChildren, useEffect, useState } from "react";
import Editor, { IProps } from "./editor";

const UINodesSetter = (props: PropsWithChildren<IProps>) => {
  const { document, children } = props;
  const context = useUiNodesContext();

  useEffect(() => {
    const uiDriveNode = makeUiDriveNode(document);
    context.setDriveNodes([uiDriveNode] as UiDriveNode[]);
  }, [document]);

  return children;
};

const UiNodesContextDecorator: Decorator<IProps> = (
  Story: StoryFn,
  context,
) => {
  const drive = context.args.document;
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  return (
    <DriveContextProvider
      value={{
        drive,
        showSearchBar: false,
        isAllowedToCreateDocuments: true,
        documentModels: [DocumentModelModule as DocumentModel],
        selectedNode,
        selectNode: setSelectedNode,
        addFile() {
          throw new Error("addFile not implemented");
        },
        showCreateDocumentModal(documentModel: DocumentModel) {
          return Promise.resolve({
            name: `New ${documentModel.documentModel.id}`,
          });
        },
      }}
    >
      <UiNodesContextProvider>
        <UINodesSetter {...context.args} />
        <Story />
      </UiNodesContextProvider>
    </DriveContextProvider>
  );
};

const { meta, CreateDocumentStory: DocumentDrive } = createDocumentStory(
  Editor,
  DocumentDriveModule.reducer,
  DocumentDriveModule.utils.createDocument(),
  {
    decorators: [UiNodesContextDecorator],
  },
);
export { DocumentDrive };

export default { ...meta, title: "Generic Drive Explorer" };
