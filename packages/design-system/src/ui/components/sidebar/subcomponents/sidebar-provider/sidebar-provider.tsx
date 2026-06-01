import {
  createContext,
  createRef,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type { List } from "react-virtualized";
import {
  type FlattenedNode,
  type NodeSortOrder,
  type NodeSortType,
  NodeStatus,
  type SidebarNode,
} from "../../types.js";
import {
  filterStatuses,
  getMaxDepth,
  getNodePath,
  getOpenLevels,
  isOpenLevel,
  nodesSearch,
  sortNodes,
} from "../../utils.js";
import {
  initialSidebarState,
  SidebarActionType,
  sidebarReducer,
  type SidebarState,
} from "./sidebar-reducer.js";

interface SidebarContextType {
  nodes: SidebarNode[];
  flattenedNodes: FlattenedNode[];
  expandedNodes: Set<string>;
  pinnedNodePath: SidebarNode[];
  maxDepth: number;
  searchTerm: string;
  searchResults: SidebarNode[];
  isSearching: boolean;
  activeSearchIndex: number;
  activeNodeId?: string;
  isStatusFilterEnabled: boolean;
  nodeSortType?: NodeSortType;
  nodeSortOrder: NodeSortOrder;
  virtualListRef: RefObject<List | null>;
  toggleNode: (nodeId: string) => void;
  openNode: (nodeId: string, openPath?: boolean, scrollTo?: boolean) => void;
  closeNode: (nodeId: string) => void;
  togglePin: (nodeId: string) => void;
  openLevel: (level: number) => void;
  changeSearchTerm: (newTerm: string) => void;
  nextSearchResult: () => void;
  previousSearchResult: () => void;
  setNodes: (
    newNodes: SidebarNode[],
    sortType?: NodeSortType,
    sortOrder?: NodeSortOrder,
  ) => void;
  syncActiveNodeId: (nodeId?: string) => void;
  onActiveNodeChange: (node: SidebarNode) => void;
  setActiveNodeChangeCallback: (callback: (node: SidebarNode) => void) => void;
  toggleStatusFilter: () => void;
}

const SidebarContext = createContext<SidebarContextType>({
  nodes: [],
  flattenedNodes: [],
  expandedNodes: new Set<string>(),
  pinnedNodePath: [],
  maxDepth: 4,
  searchTerm: "",
  searchResults: [],
  isSearching: false,
  activeSearchIndex: 0,
  activeNodeId: undefined,
  isStatusFilterEnabled: false,
  nodeSortType: undefined,
  nodeSortOrder: "asc",
  virtualListRef: createRef<List>(),
  toggleNode: () => undefined,
  openNode: () => undefined,
  closeNode: () => undefined,
  togglePin: () => undefined,
  openLevel: () => undefined,
  changeSearchTerm: () => undefined,
  nextSearchResult: () => undefined,
  previousSearchResult: () => undefined,
  setNodes: () => undefined,
  syncActiveNodeId: () => undefined,
  onActiveNodeChange: () => undefined,
  setActiveNodeChangeCallback: () => undefined,
  toggleStatusFilter: () => undefined,
});

interface SidebarProviderProps extends React.PropsWithChildren {
  nodes?: SidebarNode[];
}

const SidebarProvider = ({
  children,
  nodes: initialNodes,
}: SidebarProviderProps) => {
  const [_state, dispatch] = useReducer(sidebarReducer, {
    ...initialSidebarState,
    nodes: initialNodes || [],
  });
  // Stable snapshots for callbacks that read state without triggering re-renders
  const stateRef = useRef<SidebarState>(_state);
  const flattenedNodesRef = useRef<FlattenedNode[]>([]);
  useEffect(() => {
    stateRef.current = _state;
  }, [_state]);

  const virtualListRef = useRef<List>(null);
  const [onActiveNodeChange, setOnActiveNodeChange] = useState<
    (nodeId: SidebarNode) => void
  >(() => () => undefined);

  const currentRoots = useMemo(() => {
    let roots = _state.nodes;
    if (_state.pinnedNodePath.length > 0) {
      roots =
        _state.pinnedNodePath[_state.pinnedNodePath.length - 1].children ?? [];
    }
    if (_state.isStatusFilterEnabled) {
      roots = filterStatuses(roots, [
        NodeStatus.CREATED,
        NodeStatus.MODIFIED,
        NodeStatus.REMOVED,
        NodeStatus.MOVED,
        NodeStatus.DUPLICATED,
      ]);
    }
    if (_state.nodeSortType !== undefined) {
      return sortNodes(roots, _state.nodeSortType, _state.nodeSortOrder);
    }
    return roots;
  }, [
    _state.nodes,
    _state.pinnedNodePath,
    _state.isStatusFilterEnabled,
    _state.nodeSortType,
    _state.nodeSortOrder,
  ]);

  const flattenTree = useCallback(
    (nodes: SidebarNode[]): FlattenedNode[] => {
      const flattened: FlattenedNode[] = [];

      const dfs = (node: SidebarNode, depth: number) => {
        const flatNode: FlattenedNode = {
          ...node,
          depth,
          isExpanded: _state.expandedNodes.has(node.id),
        };
        flattened.push(flatNode);

        if (Array.isArray(node.children) && _state.expandedNodes.has(node.id)) {
          for (const child of node.children) {
            dfs(child, depth + 1);
          }
        }
      };

      for (const node of nodes) {
        dfs(node, 0);
      }

      return flattened;
    },
    [_state.expandedNodes],
  );

  const flattenedNodes = useMemo(() => {
    return flattenTree(currentRoots);
  }, [currentRoots, flattenTree]);

  useEffect(() => {
    flattenedNodesRef.current = flattenedNodes;
  }, [flattenedNodes]);

  const setActiveNodeChangeCallback = useCallback(
    (callback: (node: SidebarNode) => void) => {
      setOnActiveNodeChange(() => callback);
    },
    [],
  );

  const syncActiveNodeId = useCallback((nodeId?: string) => {
    dispatch({
      type: SidebarActionType.SYNC_ACTIVE_NODE_ID,
      payload: nodeId,
    });
  }, []);

  const openPathToNode = useCallback(
    (nodeId: string) => {
      const nodePath = getNodePath(currentRoots, nodeId);
      if (nodePath) {
        for (const node of nodePath) {
          dispatch({
            type: SidebarActionType.OPEN_NODE,
            payload: node.id,
          });
        }
      }
    },
    [currentRoots],
  );

  const toggleNode = useCallback((nodeId: string) => {
    dispatch({
      type: SidebarActionType.TOGGLE_NODE,
      payload: nodeId,
    });
  }, []);

  const openNode = useCallback(
    (nodeId: string, openPath?: boolean, scrollTo?: boolean) => {
      dispatch({
        type: SidebarActionType.OPEN_NODE,
        payload: nodeId,
      });
      if (openPath) {
        openPathToNode(nodeId);
      }
      if (scrollTo) {
        const nodeIndex = flattenedNodesRef.current.findIndex(
          (node) => node.id === nodeId,
        );
        setTimeout(() => {
          virtualListRef.current?.scrollToRow(nodeIndex);
        }, 100);
      }
    },
    [openPathToNode],
  );

  const closeNode = useCallback((nodeId: string) => {
    dispatch({
      type: SidebarActionType.CLOSE_NODE,
      payload: nodeId,
    });
  }, []);

  const maxDepth = useMemo(() => {
    if (_state.pinnedNodePath.length > 0) {
      return getMaxDepth(
        _state.pinnedNodePath[_state.pinnedNodePath.length - 1].children ?? [],
      );
    }
    return getMaxDepth(_state.nodes);
  }, [_state.nodes, _state.pinnedNodePath]);

  const togglePin = useCallback((nodeId: string) => {
    const isPinned =
      stateRef.current.pinnedNodePath.length > 0 &&
      stateRef.current.pinnedNodePath[
        stateRef.current.pinnedNodePath.length - 1
      ].id === nodeId;

    const nodePath = isPinned
      ? [] // unpin
      : (getNodePath(stateRef.current.nodes, nodeId) ?? []);
    dispatch({
      type: SidebarActionType.SET_PINNED_NODE_PATH,
      payload: nodePath,
    });
  }, []);

  const openLevel = useCallback(
    (targetLevel: number) => {
      const isTargetLevelOpen = isOpenLevel(
        currentRoots,
        stateRef.current.expandedNodes,
        targetLevel - 1,
      );

      if (isTargetLevelOpen) {
        dispatch({
          type: SidebarActionType.SET_EXPANDED_NODES,
          payload: new Set(),
        });
      } else {
        dispatch({
          type: SidebarActionType.SET_EXPANDED_NODES,
          payload: getOpenLevels(currentRoots, targetLevel),
        });
      }
    },
    [currentRoots],
  );

  const toggleStatusFilter = useCallback(() => {
    dispatch({
      type: SidebarActionType.TOGGLE_STATUS_FILTER,
    });
  }, []);

  const [activeSearchIndex, setActiveSearchIndex] = useState(0);

  useEffect(() => {
    const DEBOUNCE_MS = 300;
    let timeoutId: NodeJS.Timeout;

    if (_state.searchTerm) {
      dispatch({ type: SidebarActionType.SET_IS_SEARCHING, payload: true });

      timeoutId = setTimeout(() => {
        const results = nodesSearch(currentRoots, _state.searchTerm, "dfs");
        dispatch({
          type: SidebarActionType.SET_SEARCH_RESULTS,
          payload: results,
        });
        setActiveSearchIndex(0);
        if (results.length > 0) {
          openPathToNode(results[0].id);
        }
        dispatch({ type: SidebarActionType.SET_IS_SEARCHING, payload: false });
      }, DEBOUNCE_MS);
    } else {
      dispatch({ type: SidebarActionType.SET_SEARCH_RESULTS, payload: [] });
      dispatch({ type: SidebarActionType.SET_IS_SEARCHING, payload: false });
    }

    return () => {
      clearTimeout(timeoutId);
    };
  }, [currentRoots, _state.searchTerm, openPathToNode]);

  useEffect(() => {
    if (
      stateRef.current.searchResults.length > 0 &&
      activeSearchIndex >= 0 &&
      activeSearchIndex < stateRef.current.searchResults.length
    ) {
      const { id } = stateRef.current.searchResults[activeSearchIndex];
      for (let i = 0; i < flattenedNodesRef.current.length; i++) {
        if (flattenedNodesRef.current[i].id === id) {
          virtualListRef.current?.scrollToRow(i);
          break;
        }
      }
    }
  }, [activeSearchIndex]);

  const nextSearchResult = useCallback(() => {
    const nextIndex = Math.min(
      stateRef.current.searchResults.length - 1,
      activeSearchIndex + 1,
    );
    if (nextIndex !== activeSearchIndex) {
      openPathToNode(stateRef.current.searchResults[nextIndex].id);
      setActiveSearchIndex(nextIndex);
    }
  }, [activeSearchIndex, openPathToNode]);

  const previousSearchResult = useCallback(() => {
    const previousIndex = Math.max(0, activeSearchIndex - 1);
    if (previousIndex !== activeSearchIndex) {
      openPathToNode(stateRef.current.searchResults[previousIndex].id);
      setActiveSearchIndex(previousIndex);
    }
  }, [activeSearchIndex, openPathToNode]);

  const setNodes = useCallback(
    (
      newNodes: SidebarNode[],
      sortType?: NodeSortType,
      sortOrder?: NodeSortOrder,
    ) => {
      dispatch({
        type: SidebarActionType.SET_NODES,
        payload: { nodes: newNodes, sortType, sortOrder },
      });
    },
    [dispatch],
  );

  const changeSearchTerm = useCallback(
    (newTerm: string) => {
      dispatch({
        type: SidebarActionType.CHANGE_SEARCH_TERM,
        payload: newTerm,
      });
    },
    [dispatch],
  );

  return (
    <SidebarContext.Provider
      value={{
        nodes: _state.nodes,
        flattenedNodes,
        expandedNodes: _state.expandedNodes,
        pinnedNodePath: _state.pinnedNodePath,
        maxDepth,
        searchTerm: _state.searchTerm,
        searchResults: _state.searchResults,
        isSearching: _state.isSearching,
        activeSearchIndex,
        isStatusFilterEnabled: _state.isStatusFilterEnabled,
        nodeSortType: _state.nodeSortType,
        nodeSortOrder: _state.nodeSortOrder,
        virtualListRef,
        toggleNode,
        openNode,
        closeNode,
        togglePin,
        openLevel,
        changeSearchTerm,
        nextSearchResult,
        previousSearchResult,
        setNodes,
        activeNodeId: _state.activeNodeId,
        syncActiveNodeId,
        onActiveNodeChange,
        setActiveNodeChangeCallback,
        toggleStatusFilter,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

const useSidebar = () => useContext(SidebarContext);

export { SidebarProvider, useSidebar };
