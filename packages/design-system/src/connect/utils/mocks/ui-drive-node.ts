import {
  CLOUD,
  defaultDriveOptions,
  defaultFileOptions,
  defaultFolderOptions,
  DRIVE,
  ERROR,
  FILE,
  FOLDER,
  LOCAL,
  PUBLIC,
  SUCCESS,
} from "@/connect/constants";
import {
  type DocumentDriveDocument,
  type FileNode,
  type FolderNode,
  type SharingType,
  type SyncStatus,
  type UiDriveNode,
  type UiFileNode,
  type UiFolderNode,
} from "@/connect/types";

const mockDriveId = "mock-drive-id";

export const mockUiFileNode: UiFileNode = {
  kind: FILE,
  documentType: "makerdao/rwa-portfolio",
  id: "file-1",
  name: "Mock file in drive",
  slug: "mock-file-in-drive",
  parentFolder: mockDriveId,
  driveId: mockDriveId,
  syncStatus: SUCCESS,
  synchronizationUnits: [{ syncId: "1", scope: "global", branch: "main" }],
  sharingType: LOCAL,
};

export const mockUiFolderNode: UiFolderNode = {
  kind: FOLDER,
  id: "folder-1",
  name: "Mock folder in drive",
  slug: "mock-folder-in-drive",
  parentFolder: mockDriveId,
  driveId: mockDriveId,
  syncStatus: SUCCESS,
  children: [],
  sharingType: LOCAL,
};

export const mockNodes: (driveId: string) => (FileNode | FolderNode)[] = (
  driveId,
) => [
  {
    kind: FILE,
    documentType: "makerdao/rwa-portfolio",
    id: "file-1",
    name: "Mock file in drive that has a very significantly long name",
    parentFolder: driveId,
    synchronizationUnits: [{ syncId: "1" }],
  },
  {
    kind: FOLDER,
    id: "folder-1",
    name: "Mock folder in drive 1",
    parentFolder: driveId,
  },
  {
    kind: FOLDER,
    id: "folder-2",
    name: "Mock folder in drive 2",
    parentFolder: driveId,
  },
  {
    kind: FILE,
    documentType: "template",
    id: "folder-1-file-1",
    name: "Mock file in folder 1",
    parentFolder: "folder-1",
    synchronizationUnits: [{ syncId: "1" }],
  },
  {
    kind: FILE,
    documentType: "global",
    id: "folder-2-file-2",
    name: "Mock file in folder 2",
    parentFolder: "folder-2",
    synchronizationUnits: [{ syncId: "1" }],
  },
  {
    kind: FOLDER,
    id: "folder-1-folder-1",
    name: "Mock folder in folder 1",
    parentFolder: "folder-1",
  },
  {
    kind: FOLDER,
    id: "folder-2-folder-1",
    name: "Mock folder in folder 2",
    parentFolder: "folder-2",
  },
  {
    kind: FILE,
    documentType: "legal",
    id: "folder-1-folder-1-file-1",
    name: "Mock file in folder 1 folder 1",
    parentFolder: "folder-1-folder-1",
    synchronizationUnits: [{ syncId: "1" }],
  },
  {
    kind: FILE,
    documentType: "budget",
    id: "folder-2-folder-1-file-1",
    name: "Mock file in folder 2 folder 1",
    parentFolder: "folder-2",
    synchronizationUnits: [{ syncId: "1" }],
  },
  {
    kind: FOLDER,
    id: "folder-1-folder-1-folder-1",
    name: "Mock folder in folder 1 folder 1",
    parentFolder: "folder-1-folder-1",
  },
  {
    kind: FOLDER,
    id: "folder-2-folder-1-folder-1",
    name: "Mock folder in folder 2 folder 1",
    parentFolder: "folder-2-folder-1",
  },
];

export function makeMockDriveDocument(state?: {
  global?: { id?: string } & Record<string, any>;
  local?: Record<string, any>;
}) {
  const mockDocumentDriveDocument: DocumentDriveDocument = {
    state: {
      global: {
        id: state?.global?.id ?? mockDriveId,
        slug: "mock-drive",
        name: "Mock Drive",
        icon: "",
        nodes: mockNodes(state?.global?.id ?? mockDriveId),
        ...state?.global,
      },
      local: {
        sharingType: LOCAL,
        availableOffline: false,
        ...state?.local,
      },
    },
  };

  return mockDocumentDriveDocument;
}
export const mockLocalDrive = makeDriveNode(
  makeMockDriveDocument({
    global: {
      id: "local-drive",
      name: "Local drive",
    },
    local: { sharingType: LOCAL, availableOffline: false },
  }),
);

export const mockPublicDrive = makeDriveNode(
  makeMockDriveDocument({
    global: {
      id: "public-drive",
      name: "Public drive",
    },
    local: { sharingType: PUBLIC, availableOffline: true },
  }),
);

export const mockCloudDrive = makeDriveNode(
  makeMockDriveDocument({
    global: {
      id: "cloud-drive",
      name: "Cloud drive",
    },
    local: { sharingType: CLOUD, availableOffline: true },
  }),
);

export const mockDriveNodes = [mockPublicDrive, mockCloudDrive, mockLocalDrive];

export const mockNodeOptions = {
  [PUBLIC]: {
    [DRIVE]: [...defaultDriveOptions],
    [FOLDER]: [...defaultFolderOptions],
    [FILE]: [...defaultFileOptions],
  },
  [CLOUD]: {
    [DRIVE]: [...defaultDriveOptions],
    [FOLDER]: [...defaultFolderOptions],
    [FILE]: [...defaultFileOptions],
  },
  [LOCAL]: {
    [DRIVE]: [...defaultDriveOptions],
    [FOLDER]: [...defaultFolderOptions],
    [FILE]: [...defaultFileOptions],
  },
};
function getSyncStatus(
  syncId: string,
  type: SharingType,
): SyncStatus | undefined {
  if (type === LOCAL) return;
  try {
    return SUCCESS;
  } catch (error) {
    console.error(error);
    return ERROR;
  }
}

export function makeDriveNode(drive: DocumentDriveDocument) {
  const { id, name, icon, slug } = drive.state.global;
  const { sharingType, availableOffline } = drive.state.local;
  const driveSyncStatus = getSyncStatus(id, sharingType);

  const driveNode: UiDriveNode = {
    id,
    name,
    slug: slug || null,
    kind: DRIVE,
    children: [],
    nodeMap: {},
    sharingType,
    syncStatus: driveSyncStatus,
    availableOffline,
    icon,
    parentFolder: null,
    driveId: id,
  };

  const nodes = drive.state.global.nodes.map((n) => {
    const node = {
      ...n,
      slug: n.name.toLowerCase().replace(/\s/g, "-"),
      driveId: id,
      parentFolder: n.parentFolder || id,
      syncStatus: driveSyncStatus,
      sharingType,
    };

    if (node.kind === DRIVE) {
      throw new Error("Drive nodes should not be nested");
    }

    if (node.kind === FILE) {
      return node as UiFileNode;
    }

    return {
      ...node,
      children: [],
    } as UiFolderNode;
  });

  for (const node of nodes) {
    driveNode.nodeMap[node.id] = node;
  }

  for (const node of nodes) {
    if (node.kind === FILE) {
      node.syncStatus = getSyncStatus(
        node.synchronizationUnits[0].syncId,
        sharingType,
      );
    }

    if (node.parentFolder === id) {
      driveNode.children.push(node);
      continue;
    }
    const parent = driveNode.nodeMap[node.parentFolder];

    if (parent.kind === FILE) {
      throw new Error(
        `Parent node ${node.parentFolder} is a file, not a folder`,
      );
    }

    parent.children.push(node);

    if (node.syncStatus !== SUCCESS) {
      parent.syncStatus = node.syncStatus;
    }
  }

  return driveNode;
}
