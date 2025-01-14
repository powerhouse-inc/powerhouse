import React, {
  createContext,
  useReducer,
  useContext,
  useCallback,
} from "react";
import { SidebarNode } from "../types";

interface SidebarState {
  items: Array<SidebarNode>;
  itemsState: { [nodeId: string]: boolean };
  pinnedItems: Array<SidebarNode>;
}

enum SidebarActionType {
  SET_ITEMS = "SET_ITEMS",
  TOGGLE_ITEM = "TOGGLE_ITEM",
  OPEN_LEVEL = "OPEN_LEVEL",
  TOGGLE_PIN = "TOGGLE_PIN",
}

type SidebarAction =
  | {
      type: SidebarActionType.SET_ITEMS;
      items: SidebarNode[];
      defaultLevel?: number;
    }
  | {
      type: SidebarActionType.TOGGLE_ITEM;
      nodeId: string;
    }
  | {
      type: SidebarActionType.OPEN_LEVEL;
      level: number;
    }
  | {
      type: SidebarActionType.TOGGLE_PIN;
      nodeId: string;
    };

const getOpenLevels = (
  items: SidebarNode[],
  level: number,
): { [nodeId: string]: boolean } => {
  const result: { [nodeId: string]: boolean } = {};

  function traverse(nodes: SidebarNode[], currentLevel: number) {
    for (const node of nodes) {
      if (currentLevel <= level) {
        result[node.id] = true;
      }
      if (node.childrens) {
        traverse(node.childrens, currentLevel + 1);
      }
    }
  }

  traverse(items, 1); // Start from level 1
  return result;
};

const getPinnedPath = (
  items: SidebarNode[],
  nodeId: string,
): Array<SidebarNode> | null => {
  // Helper function to recursively search for the path in a single node
  function findPath(
    node: SidebarNode,
    id: string,
    path: SidebarNode[],
  ): SidebarNode[] | null {
    // Add the current node to the path
    path.push(node);

    // Check if the current node is the target
    if (node.id === id) {
      return path;
    }

    // Recursively search in the children
    if (node.childrens) {
      for (const child of node.childrens) {
        const result = findPath(child, id, path);
        if (result) {
          return result;
        }
      }
    }

    // Backtrack if not found in this path
    path.pop();
    return null;
  }

  // Iterate through each node in the array of nodes
  for (const root of items) {
    const result = findPath(root, nodeId, []);
    if (result) {
      return result; // Return as soon as a path is found
    }
  }

  // Return an empty array if no path is found
  return null;
};

const reducer = (state: SidebarState, action: SidebarAction): SidebarState => {
  switch (action.type) {
    case SidebarActionType.SET_ITEMS:
      return {
        items: action.items,
        itemsState: getOpenLevels(action.items, action.defaultLevel ?? -1),
        pinnedItems: [],
      };
    case SidebarActionType.TOGGLE_ITEM:
      return {
        ...state,
        itemsState: {
          ...state.itemsState,
          [action.nodeId]: !state.itemsState[action.nodeId],
        },
      };
    case SidebarActionType.OPEN_LEVEL:
      return {
        ...state,
        itemsState: getOpenLevels(state.items, action.level),
      };
    case SidebarActionType.TOGGLE_PIN: {
      const isPinned =
        state.pinnedItems.length > 0 &&
        state.pinnedItems[state.pinnedItems.length - 1].id === action.nodeId;
      return {
        ...state,
        pinnedItems: isPinned
          ? [] // unpin
          : (getPinnedPath(state.items, action.nodeId) ?? []),
      };
    }
    default:
      return state;
  }
};

type SidebarContextType = {
  state: SidebarState;
  setItems: (items: SidebarNode[], defaultLevel?: number) => void;
  toggleItem: (nodeId: string) => void;
  openLevel: (level: number) => void;
  togglePin: (nodeId: string) => void;
};

const SidebarContext = createContext<SidebarContextType>({
  state: { items: [], itemsState: {}, pinnedItems: [] },
  setItems: () => null,
  toggleItem: () => null,
  openLevel: () => null,
  togglePin: () => null,
});

interface SidebarProviderProps extends React.PropsWithChildren {
  nodes?: SidebarNode[];
}

const SidebarProvider: React.FC<SidebarProviderProps> = ({
  children,
  nodes,
}) => {
  const [state, dispatch] = useReducer(reducer, {
    items: nodes || [],
    itemsState: {},
    pinnedItems: [],
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

  return (
    <SidebarContext.Provider
      value={{
        state,
        setItems,
        toggleItem,
        openLevel,
        togglePin,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

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

export {
  SidebarProvider,
  useSidebar,
  useSidebarNodeState,
  useSidebarItemPinned,
};
export type { SidebarState };
