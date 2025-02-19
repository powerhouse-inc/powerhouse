import {
  DRIVE,
  FILE,
  LOCAL,
  SharingType,
  UiDriveNode,
  UiFileNode,
  UiFolderNode,
  type UiNode,
} from "@powerhousedao/design-system";
import {
  DocumentDriveDocument,
  isFolderNode,
  Node,
} from "document-models/document-drive";

export function sortUiNodesByName(a: UiNode, b: UiNode) {
  return a.name.localeCompare(b.name);
}

export function makeNodeSlugFromNodeName(name: string) {
  return name.replaceAll(/\s/g, "-");
}

export function makeUiNode(
  node: Node | undefined,
  drive: DocumentDriveDocument,
  withChildren: boolean,
): UiNode {
  const { id, name, icon, slug, nodes } = drive.state.global;
  const { sharingType: _sharingType, availableOffline } = drive.state.local;
  const __sharingType = _sharingType?.toUpperCase();
  const sharingType = (
    __sharingType === "PRIVATE" ? LOCAL : __sharingType
  ) as SharingType;

  // TODO: handle sync status
  // const normalizedDriveSyncStatus =
  //               syncStatus === 'INITIAL_SYNC'
  //                   ? 'SYNCING'
  //                   : syncStatus;

  if (node) {
    const uiNode = {
      ...node,
      slug: makeNodeSlugFromNodeName(node.name),
      driveId: id,
      parentFolder: node.parentFolder || id,
      kind: node.kind.toUpperCase(),
      syncStatus: undefined,
      sharingType,
    };
    if (uiNode.kind === FILE) {
      return uiNode as UiFileNode;
    } else if (isFolderNode(node)) {
      return {
        ...uiNode,
        children: withChildren
          ? nodes
              .filter((n) => n.parentFolder === node.id)
              .map((n) => makeUiNode(n, drive, false))
          : [],
      } as UiFolderNode;
    }
  }

  return {
    id,
    name,
    slug: slug || null,
    kind: DRIVE,
    nodeMap: {},
    sharingType,
    syncStatus: undefined,
    availableOffline,
    icon,
    parentFolder: null,
    driveId: id,
    children: nodes
      .filter((n) => n.parentFolder)
      .map((n) => makeUiNode(n, drive, false)),
  } as UiDriveNode;
}

export function makeUiDriveNode(drive: DocumentDriveDocument): UiDriveNode {
  const driveNode = makeUiNode(undefined, drive, true) as UiDriveNode;
  driveNode.nodeMap = drive.state.global.nodes.reduce(
    (acc, node) => {
      acc[node.id] = makeUiNode(node, drive, true);
      return acc;
    },
    {} as Record<string, UiNode>,
  );
  return driveNode;
}
