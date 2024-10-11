import { DRIVE, FILE, UiDriveNode, UiFolderNode, UiNode } from "@/connect";
import {
  createContext,
  FC,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

export type TUiNodesContext = {
  driveNodes: UiDriveNode[];
  selectedNode: UiNode | null;
  selectedNodePath: UiNode[];
  selectedDriveNode: UiDriveNode | null;
  selectedParentNode: UiDriveNode | UiFolderNode | null;
  setDriveNodes: (driveNodes: UiDriveNode[]) => void;
  setSelectedNode: (node: UiNode | null) => void;
  getNodeById: (id: string) => UiNode | null;
  getParentNode: (uiNode: UiNode) => UiNode | null;
  getIsSelected: (node: UiNode) => boolean;
  getIsInSelectedNodePath: (node: UiNode) => boolean;
  getSiblings: (node: UiNode) => UiNode[];
};

const defaultTreeItemContextValue: TUiNodesContext = {
  driveNodes: [],
  selectedNode: null,
  selectedNodePath: [],
  selectedDriveNode: null,
  selectedParentNode: null,
  setDriveNodes: () => {},
  setSelectedNode: () => {},
  getNodeById: () => null,
  getParentNode: () => null,
  getIsSelected: () => false,
  getIsInSelectedNodePath: () => false,
  getSiblings: () => [],
};

export const UiNodesContext = createContext<TUiNodesContext>(
  defaultTreeItemContextValue,
);

export interface UiNodesContextProviderProps {
  readonly children: ReactNode;
}

export const UiNodesContextProvider: FC<UiNodesContextProviderProps> = ({
  children,
}) => {
  const [driveNodes, setDriveNodes] = useState<UiDriveNode[]>([]);
  const [selectedNode, _setSelectedNode] = useState<UiNode | null>(null);
  const [selectedNodePath, setSelectedNodePath] = useState<UiNode[]>([]);
  const [selectedDriveNode, setSelectedDriveNode] =
    useState<UiDriveNode | null>(null);
  const [selectedParentNode, setSelectedParentNode] = useState<
    UiDriveNode | UiFolderNode | null
  >(null);

  /*
        This internal function that uses `driveNodes` as an argument to prevent stale objects being used in the closure.
        External `getNodeById` for use by other components doesn't need to do this because it is only invoked by external functions, and can therefore omit this argument for convenience.
     */
  const _getNodeById = useCallback(
    (id: string, driveNodes: UiDriveNode[] | null) => {
      if (!driveNodes?.length) return null;

      for (const driveNode of driveNodes) {
        if (driveNode.id === id) return driveNode;

        const node = driveNode.nodeMap[id];

        if (node) return node;
      }

      return null;
    },
    [],
  );

  const getNodeById = useCallback(
    (id: string) => {
      return _getNodeById(id, driveNodes);
    },
    [_getNodeById, driveNodes],
  );

  const getSelectedDriveNode = useCallback(
    (selectedNode: UiNode | null, driveNodes: UiDriveNode[] | null) => {
      if (!selectedNode || !driveNodes?.length) return null;

      if (selectedNode.kind === DRIVE) return selectedNode;

      return driveNodes.find((d) => d.id === selectedNode.driveId) ?? null;
    },
    [],
  );

  /*
        This internal function that uses `driveNodes` as an argument to prevent stale objects being used in the closure.
        External `getNodeById` for use by other components doesn't need to do this because it is only invoked by external functions, and can therefore omit this argument for convenience.
     */
  const _getParentNode = useCallback(
    (node: UiNode, driveNodes: UiDriveNode[] | null) => {
      if (!driveNodes?.length || node.kind === DRIVE) return null;

      const parentNode = _getNodeById(node.parentFolder, driveNodes);

      if (!parentNode) return null;

      if (parentNode.kind === FILE) {
        throw new Error(
          `Parent node ${node.parentFolder} is a file, not a folder`,
        );
      }

      return parentNode;
    },
    [_getNodeById],
  );

  const getParentNode = useCallback(
    (uiNode: UiNode) => {
      return _getParentNode(uiNode, driveNodes);
    },
    [_getParentNode, driveNodes],
  );

  const getSelectedParentNode = useCallback(
    (selectedNode: UiNode | null, driveNodes: UiDriveNode[] | null) => {
      if (!selectedNode || !driveNodes?.length) return null;

      if (selectedNode.kind === FILE)
        return _getParentNode(selectedNode, driveNodes);

      return selectedNode;
    },
    [_getParentNode],
  );

  const getPathToNode = useCallback(
    (uiNode: UiNode, driveNodes: UiDriveNode[]) => {
      const path: UiNode[] = [];

      const driveNode = driveNodes.find((d) => d.id === uiNode.driveId);

      let current: UiNode | undefined = uiNode;

      while (current) {
        path.push(current);
        current =
          current.parentFolder === driveNode?.id
            ? driveNode
            : current.parentFolder
              ? driveNode?.nodeMap[current.parentFolder]
              : undefined;
      }

      return path.reverse();
    },
    [],
  );

  /*
     _setSelectedNode from `useState` is kept internal so that we can instead expose this function, which also manages the selectedDriveNode, selectedParentNode, and selectedNodePath states.
    */
  const setSelectedNode = useCallback(
    (uiNode: UiNode | null) => {
      if (!uiNode) return;

      _setSelectedNode(uiNode);
      setSelectedDriveNode(getSelectedDriveNode(uiNode, driveNodes));
      setSelectedParentNode(getSelectedParentNode(uiNode, driveNodes));

      if (uiNode.kind === DRIVE) {
        setSelectedNodePath([uiNode]);
        return;
      }

      const newSelectedNodePath = getPathToNode(uiNode, driveNodes);

      setSelectedNodePath(newSelectedNodePath);
    },
    [driveNodes, getPathToNode, getSelectedDriveNode, getSelectedParentNode],
  );

  const getIsSelected = useCallback(
    (node: UiNode) => {
      return selectedNode === node;
    },
    [selectedNode],
  );

  const getIsInSelectedNodePath = useCallback(
    (node: UiNode) => {
      if (node.kind === FILE) return false;
      return selectedNodePath.includes(node);
    },
    [selectedNodePath],
  );

  const getSiblings = useCallback(
    (node: UiNode) => {
      if (node.kind === DRIVE) {
        console.warn(
          "Drive nodes do not have siblings, as they are top-level nodes",
        );
        return [];
      }

      const parent = _getParentNode(node, driveNodes);

      return parent?.children ?? [];
    },
    [_getParentNode, driveNodes],
  );

  useEffect(() => {
    if (!selectedNode) return;

    const updatedSelectedNode = _getNodeById(selectedNode.id, driveNodes);

    if (updatedSelectedNode) {
      setSelectedNode(updatedSelectedNode);
    }
  }, [driveNodes, _getNodeById, selectedNode, setSelectedNode]);

  const value = useMemo(
    () => ({
      driveNodes,
      selectedNode,
      selectedNodePath,
      selectedDriveNode,
      selectedParentNode,
      getNodeById,
      getParentNode,
      setDriveNodes,
      setSelectedNode,
      getIsSelected,
      getIsInSelectedNodePath,
      getSiblings,
    }),
    [
      driveNodes,
      selectedNode,
      selectedNodePath,
      selectedDriveNode,
      selectedParentNode,
      getNodeById,
      getParentNode,
      setSelectedNode,
      getIsSelected,
      getIsInSelectedNodePath,
      getSiblings,
    ],
  );

  return (
    <UiNodesContext.Provider value={value}>{children}</UiNodesContext.Provider>
  );
};

export const useUiNodesContext = () => {
  const contextValue = useContext(UiNodesContext);
  return contextValue;
};
