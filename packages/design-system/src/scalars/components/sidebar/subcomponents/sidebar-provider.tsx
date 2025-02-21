"use client";

import {
  createContext,
  createRef,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type SidebarNode, type FlattenedNode, NodeStatus } from "../types";
import {
  filterStatuses,
  getMaxDepth,
  getNodePath,
  getOpenLevels,
  isOpenLevel,
  nodesSearch,
} from "../utils";
import { List } from "react-virtualized";

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
  const [nodes, setNodes] = useState<SidebarNode[]>(initialNodes || []);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [pinnedNodePath, setPinnedNodePath] = useState<SidebarNode[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string | undefined>();
  const virtualListRef = useRef<List>(null);
  const [isStatusFilterEnabled, setIsStatusFilterEnabled] =
    useState<boolean>(false);
  const [onActiveNodeChange, setOnActiveNodeChange] = useState<
    (nodeId: SidebarNode) => void
  >(() => () => undefined);

  const currentRoots = useMemo(() => {
    let roots = nodes;
    if (pinnedNodePath.length > 0) {
      roots = pinnedNodePath[pinnedNodePath.length - 1].children ?? [];
    }
    if (isStatusFilterEnabled) {
      roots = filterStatuses(roots, [
        NodeStatus.CREATED,
        NodeStatus.MODIFIED,
        NodeStatus.REMOVED,
        NodeStatus.MOVED,
        NodeStatus.DUPLICATED,
      ]);
    }
    return roots;
  }, [nodes, pinnedNodePath, isStatusFilterEnabled]);

  const flattenTree = useCallback(
    (nodes: SidebarNode[]): FlattenedNode[] => {
      const flattened: FlattenedNode[] = [];

      const dfs = (node: SidebarNode, depth: number) => {
        const flatNode: FlattenedNode = {
          ...node,
          depth,
          isExpanded: expandedNodes.has(node.id),
        };
        flattened.push(flatNode);

        if (Array.isArray(node.children) && expandedNodes.has(node.id)) {
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
    [expandedNodes],
  );

  const flattenedNodes = useMemo(
    () => flattenTree(currentRoots),
    [currentRoots, flattenTree],
  );

  const setActiveNodeChangeCallback = useCallback(
    (callback: (node: SidebarNode) => void) => {
      setOnActiveNodeChange(() => callback);
    },
    [],
  );

  const syncActiveNodeId = useCallback((nodeId?: string) => {
    setActiveNodeId(nodeId);
  }, []);

  const openPathToNode = useCallback(
    (nodeId: string) => {
      const nodePath = getNodePath(currentRoots, nodeId);
      if (nodePath) {
        for (const node of nodePath) {
          setExpandedNodes((prev) => {
            const next = new Set(prev);
            next.add(node.id);
            return next;
          });
        }
      }
    },
    [currentRoots],
  );

  const toggleNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const openNode = useCallback(
    (nodeId: string, openPath?: boolean, scrollTo?: boolean) => {
      setExpandedNodes((prev) => {
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      });
      if (openPath) {
        openPathToNode(nodeId);
      }
      if (scrollTo) {
        const nodeIndex = flattenedNodes.findIndex(
          (node) => node.id === nodeId,
        );
        setTimeout(() => {
          virtualListRef.current?.scrollToRow(nodeIndex);
        }, 100);
      }
    },
    [flattenedNodes, openPathToNode],
  );

  const closeNode = useCallback((nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      next.delete(nodeId);
      return next;
    });
  }, []);

  const maxDepth = useMemo(() => {
    if (pinnedNodePath.length > 0) {
      return getMaxDepth(
        pinnedNodePath[pinnedNodePath.length - 1].children ?? [],
      );
    }
    return getMaxDepth(nodes);
  }, [nodes, pinnedNodePath]);

  const togglePin = useCallback(
    (nodeId: string) => {
      const isPinned =
        pinnedNodePath.length > 0 &&
        pinnedNodePath[pinnedNodePath.length - 1].id === nodeId;

      const nodePath = isPinned
        ? [] // unpin
        : (getNodePath(nodes, nodeId) ?? []);
      setPinnedNodePath(nodePath);
    },
    [nodes, pinnedNodePath],
  );

  const openLevel = useCallback(
    (targetLevel: number) => {
      const isTargetLevelOpen = isOpenLevel(
        currentRoots,
        expandedNodes,
        targetLevel - 1,
      );

      if (isTargetLevelOpen) {
        setExpandedNodes(new Set());
      } else {
        setExpandedNodes(getOpenLevels(currentRoots, targetLevel));
      }
    },
    [currentRoots, expandedNodes],
  );

  const toggleStatusFilter = useCallback(() => {
    setIsStatusFilterEnabled((prev) => !prev);
  }, []);

  // search logic
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchResults, setSearchResults] = useState<SidebarNode[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number>(0);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const debounceTimeout = 300; // Adjust the debounce delay as needed
    let timeoutId: NodeJS.Timeout;

    if (searchTerm) {
      // Set isSearching to true when starting the search
      setIsSearching(true);

      // callback to search the nodes
      const searchAction = () => {
        const results = nodesSearch(currentRoots, searchTerm, "dfs");
        setSearchResults(results);
        setActiveSearchIndex(0);
        if (results.length > 0) {
          openPathToNode(results[0].id);
        }
        // Set isSearching to false after search completes
        setIsSearching(false);
      };

      // trigger the search with a debounce
      timeoutId = setTimeout(searchAction, debounceTimeout);
    } else {
      setSearchResults([]);
      setIsSearching(false); // Ensure isSearching is false if there's no search term
    }

    // Cleanup the timeout on component unmount or when dependencies change
    return () => clearTimeout(timeoutId);
  }, [currentRoots, searchTerm, openPathToNode]);

  useEffect(() => {
    // set the active index in the search results range
    if (activeSearchIndex > searchResults.length - 1) {
      setActiveSearchIndex(Math.max(0, searchResults.length - 1));
    }
  }, [activeSearchIndex, searchResults]);

  const nextSearchResult = useCallback(() => {
    const nextIndex = Math.min(searchResults.length - 1, activeSearchIndex + 1);
    if (nextIndex !== activeSearchIndex) {
      openPathToNode(searchResults[nextIndex].id);
      setActiveSearchIndex(nextIndex);
    }
  }, [searchResults, activeSearchIndex, openPathToNode]);

  const previousSearchResult = useCallback(() => {
    const previousIndex = Math.max(0, activeSearchIndex - 1);
    if (previousIndex !== activeSearchIndex) {
      openPathToNode(searchResults[previousIndex].id);
      setActiveSearchIndex(previousIndex);
    }
  }, [activeSearchIndex, openPathToNode, searchResults]);

  return (
    <SidebarContext.Provider
      value={{
        nodes,
        flattenedNodes,
        expandedNodes,
        pinnedNodePath,
        maxDepth,
        searchTerm,
        searchResults,
        isSearching,
        activeSearchIndex,
        isStatusFilterEnabled,
        virtualListRef,
        toggleNode,
        openNode,
        closeNode,
        togglePin,
        openLevel,
        changeSearchTerm: setSearchTerm,
        nextSearchResult,
        previousSearchResult,
        setNodes,
        activeNodeId,
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
