"use client";

import {
  createContext,
  createRef,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { type SidebarNode, type FlattenedNode, NodeStatus } from "../../types";
import {
  filterStatuses,
  getMaxDepth,
  getNodePath,
  getOpenLevels,
  isOpenLevel,
  nodesSearch,
} from "../../utils";
import { List } from "react-virtualized";
import {
  initialSidebarState,
  SidebarActionType,
  sidebarReducer,
  type SidebarState,
} from "./sidebar-reducer";

type SidebarContextType = {
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
  virtualListRef: RefObject<List>;
  toggleNode: (nodeId: string) => void;
  openNode: (nodeId: string, openPath?: boolean, scrollTo?: boolean) => void;
  closeNode: (nodeId: string) => void;
  togglePin: (nodeId: string) => void;
  openLevel: (level: number) => void;
  changeSearchTerm: (newTerm: string) => void;
  nextSearchResult: () => void;
  previousSearchResult: () => void;
  setNodes: (newNodes: SidebarNode[]) => void;
  syncActiveNodeId: (nodeId?: string) => void;
  onActiveNodeChange: (node: SidebarNode) => void;
  setActiveNodeChangeCallback: (callback: (node: SidebarNode) => void) => void;
  toggleStatusFilter: () => void;
};

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
  // use a ref to store the state to avoid re-rendering when having the
  // state as a dependency in memorized values reducing re-renders
  // and unwanted side effects
  const stateRef = useRef<SidebarState>(_state);
  const flattenedNodesRef = useRef<FlattenedNode[]>([]);
  useEffect(() => {
    // update the ref when the state changes
    stateRef.current = _state;
  }, [_state]);

  const virtualListRef = useRef<List>(null);
  const [onActiveNodeChange, setOnActiveNodeChange] = useState<
    (nodeId: SidebarNode) => void
  >(() => () => undefined);

  // TODO: update currentRoots in reducer when an item is pinned/unpinned
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
    return roots;
  }, [_state.nodes, _state.pinnedNodePath, _state.isStatusFilterEnabled]);

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

  // TODO: update flattenedNodes in reducer
  const flattenedNodes = useMemo(() => {
    const flattened = flattenTree(currentRoots);
    flattenedNodesRef.current = flattened;
    return flattened;
  }, [currentRoots, flattenTree]);

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

  // TODO: update maxDepth in reducer
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

  // search logic
  const [activeSearchIndex, setActiveSearchIndex] = useState<number>(0);

  useEffect(() => {
    const debounceTimeout = 300; // Adjust the debounce delay as needed
    let timeoutId: NodeJS.Timeout;

    if (_state.searchTerm) {
      // Set isSearching to true when starting the search
      dispatch({
        type: SidebarActionType.SET_IS_SEARCHING,
        payload: true,
      });

      // callback to search the nodes
      const searchAction = () => {
        const results = nodesSearch(currentRoots, _state.searchTerm, "dfs");
        dispatch({
          type: SidebarActionType.SET_SEARCH_RESULTS,
          payload: results,
        });
        setActiveSearchIndex(0);
        if (results.length > 0) {
          openPathToNode(results[0].id);
        }
        // Set isSearching to false after search completes
        dispatch({
          type: SidebarActionType.SET_IS_SEARCHING,
          payload: false,
        });
      };

      // trigger the search with a debounce
      timeoutId = setTimeout(searchAction, debounceTimeout);
    } else {
      dispatch({
        type: SidebarActionType.SET_SEARCH_RESULTS,
        payload: [],
      });
      dispatch({
        type: SidebarActionType.SET_IS_SEARCHING,
        payload: false,
      });
    }

    // Cleanup the timeout on component unmount or when dependencies change
    return () => clearTimeout(timeoutId);
  }, [currentRoots, _state.searchTerm, openPathToNode]);

  useEffect(() => {
    // set the active index in the search results range
    if (activeSearchIndex > _state.searchResults.length - 1) {
      setActiveSearchIndex(Math.max(0, _state.searchResults.length - 1));
    }
  }, [activeSearchIndex, _state.searchResults]);

  // scroll into view when navigating between search results
  useEffect(() => {
    if (
      stateRef.current.searchResults.length > 0 &&
      activeSearchIndex >= 0 &&
      activeSearchIndex < stateRef.current.searchResults.length
    ) {
      const { id } = stateRef.current.searchResults[activeSearchIndex];
      // scroll into view
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
    (newNodes: SidebarNode[]) =>
      dispatch({ type: SidebarActionType.SET_NODES, payload: newNodes }),
    [dispatch],
  );

  const changeSearchTerm = useCallback(
    (newTerm: string) =>
      dispatch({
        type: SidebarActionType.CHANGE_SEARCH_TERM,
        payload: newTerm,
      }),
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
