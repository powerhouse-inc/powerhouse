"use client";

/* eslint-disable prettier/prettier */
import React, {
  createContext,
  useReducer,
  useContext,
  useCallback,
  useState,
  useEffect,
} from "react";
import { SidebarNode } from "../types";
import { SidebarActionType, sidebarReducer, SidebarState } from "./sidebar-reducer";
import { nodesSearch } from "../utils";

type SidebarContextType = {
  state: SidebarState;
  searchTerm: string;
  searchLoading: boolean;
  searchResults: SidebarNode[];
  setItems: (items: SidebarNode[], defaultLevel?: number) => void;
  toggleItem: (nodeId: string) => void;
  openLevel: (level: number) => void;
  togglePin: (nodeId: string) => void;
  changeSearchTerm: (newSearchTerm: string) => void;
  activeSearchIndex: number;
  nextSearchResult: () => void;
  previousSearchResult: () => void;
  /**
   * To set the active node id in the provider state. This is intended to be used internally by the sidebar
   * component to sync the active node id with the provider state.
   * 
   * @param nodeId The id of the node to be set as active.
   */
  setActiveNodeId: (nodeId?: string) => void;
  /**
   * To set the callback internally in the provider to create the actual callback wrapper that
   * is going to be invoked safely by the sidebar. This callback should be wrapped in a useCallback
   * to avoid unnecessary re-renders.
   * 
   * @param callback The callback to be invoked when the active node changes.
   */
  setActiveNodeChangeCallback: (callback: (nodeId: string) => void) => void;
  /**
   * To handle the active node change from the sidebar. This is invoked by the sidebar items every time
   * they are clicked/touched.
   * 
   * @param nodeId The id of the node that is being clicked/touched.
   */
  handleActiveNodeChange: (nodeId: string) => void;
};

const SidebarContext = createContext<SidebarContextType>({
  state: { items: [], itemsState: {}, pinnedItems: [] },
  searchTerm: "",
  searchLoading: false,
  searchResults: [],
  setItems: () => null,
  toggleItem: () => null,
  openLevel: () => null,
  togglePin: () => null,
  changeSearchTerm: () => null,
  activeSearchIndex: 0,
  nextSearchResult: () => null,
  previousSearchResult: () => null,
  setActiveNodeId: () => null,
  setActiveNodeChangeCallback: () => null,
  handleActiveNodeChange: () => null,
});

interface SidebarProviderProps extends React.PropsWithChildren {
  nodes?: SidebarNode[];
}

const SidebarProvider: React.FC<SidebarProviderProps> = ({
  children,
  nodes,
}) => {
  const [state, dispatch] = useReducer(sidebarReducer, {
    items: nodes || [],
    itemsState: {},
    pinnedItems: [],
    activeNodeId: undefined,
  });

  const setItems = useCallback(
    (items: SidebarNode[]) => {
      dispatch({ type: SidebarActionType.SET_ITEMS, items });
    },
    [dispatch],
  );
  const toggleItem = useCallback(
    (nodeId: string) => {
      dispatch({ type: SidebarActionType.TOGGLE_ITEM, nodeId });
    },
    [dispatch],
  );
  const openLevel = useCallback(
    (level: number) => {
      dispatch({ type: SidebarActionType.OPEN_LEVEL, level });
    },
    [dispatch],
  );
  const togglePin = useCallback(
    (nodeId: string) => {
      dispatch({ type: SidebarActionType.TOGGLE_PIN, nodeId });
    },
    [dispatch],
  );
  const changeSearchTerm = useCallback((newSearchTerm: string) => {
    setSearchTerm(newSearchTerm);
  }, []);

  // TODO: move search logic to the reducer
  // search state
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<SidebarNode[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState<number>(0);
  useEffect(() => {
    let searchTimeout: NodeJS.Timeout;
    if (searchTerm) {
      setSearchLoading(true);

      // callback to search the nodes
      const search = () => {
        const nodesToSearch = state.pinnedItems.length > 0 ? state.pinnedItems[state.pinnedItems.length - 1].childrens ?? [] : state.items;
        const results = nodesSearch(nodesToSearch, searchTerm, "dfs");
        setSearchResults(results);
        setSearchLoading(false);
        setActiveSearchIndex(0);
      };

      // trigger the search
      searchTimeout = setTimeout(search, 250);
    } else {
      setSearchResults([]);
      setSearchLoading(false);
    }

    return () => {
      // clear the timeout if the user changes the search term
      clearTimeout(searchTimeout);
    };
  }, [searchTerm, state.items, state.pinnedItems]);

  useEffect(() => {
    // set the active index in the search results range
    if (activeSearchIndex > searchResults.length - 1) {
      setActiveSearchIndex(Math.max(0, searchResults.length - 1));
    }
  }, [activeSearchIndex, searchResults]);

  const nextSearchResult = useCallback(() => {
    const nextIndex = Math.min(searchResults.length - 1, activeSearchIndex + 1);
    if (nextIndex !== activeSearchIndex) {
      dispatch({ type: SidebarActionType.OPEN_PATH_TO_NODE, nodeId: searchResults[nextIndex].id });
      setActiveSearchIndex(nextIndex);
    }
  }, [searchResults, activeSearchIndex, dispatch]);

  const previousSearchResult = useCallback(() => {
    const previousIndex = Math.max(0, activeSearchIndex - 1);
    if (previousIndex !== activeSearchIndex) {
      dispatch({ type: SidebarActionType.OPEN_PATH_TO_NODE, nodeId: searchResults[previousIndex].id });
      setActiveSearchIndex(previousIndex);
    }
  }, [searchResults, activeSearchIndex, dispatch]);

  const setActiveNodeId = useCallback((nodeId?: string) => {
    dispatch({ type: SidebarActionType.SET_ACTIVE_NODE_ID, nodeId });
  }, [dispatch]);

  const [onActiveNodeChangeCallback, setOnActiveNodeChangeCallback] = useState<((nodeId: string) => void) | null>(null);
  const setActiveNodeChangeCallback = useCallback((callback: (nodeId: string) => void) => {
    setOnActiveNodeChangeCallback(() => callback);
  }, [setOnActiveNodeChangeCallback]);

  const handleActiveNodeChange = useCallback((nodeId: string) => {
    // we don't change the active node id here, it should be changed by the callback, triggering a re-render
    // when the new updated id is passed to the sidebar component and the sidebar update the provider state.
    onActiveNodeChangeCallback?.(nodeId);
  }, [onActiveNodeChangeCallback]);

  return (
    <SidebarContext.Provider
      value={{
        state,
        setItems,
        toggleItem,
        openLevel,
        togglePin,
        searchTerm,
        changeSearchTerm,
        searchLoading,
        searchResults,
        activeSearchIndex,
        nextSearchResult,
        previousSearchResult,
        setActiveNodeId,
        setActiveNodeChangeCallback,
        handleActiveNodeChange,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

// TODO: move hooks to separate file
const useSidebar = () => useContext(SidebarContext);
const useSidebarNodeState = (nodeId: string): boolean => {
  const { state } = useSidebar();
  return !!state.itemsState[nodeId];
};
const useSidebarItemPinned = (nodeId: string): boolean => {
  const { state } = useSidebar();
  return (
    state.pinnedItems.length > 0 &&
    state.pinnedItems[state.pinnedItems.length - 1].id === nodeId
  );
};
const useSidebarIsNodeSearchActive = (nodeId: string): boolean => {
  const { searchResults, activeSearchIndex } = useSidebar();
  return searchResults.length > 0 && searchResults[activeSearchIndex].id === nodeId;
};

const useSidebarIsNodeActive = (nodeId: string): boolean => {
  const { state } = useSidebar();
  return state.activeNodeId === nodeId;
};

export {
  SidebarProvider,
  useSidebar,
  useSidebarNodeState,
  useSidebarItemPinned,
  useSidebarIsNodeSearchActive,
  useSidebarIsNodeActive,
};
export type { SidebarState };
