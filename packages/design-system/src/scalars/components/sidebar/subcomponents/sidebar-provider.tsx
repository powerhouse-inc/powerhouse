import React, {
  createContext,
  useReducer,
  useContext,
  useCallback,
} from "react";
import { SidebarNode } from "../types";

interface SidebarState {
  items: SidebarNode[];
  itemsState: { [nodeId: string]: boolean };
}

enum SidebarActionType {
  SET_ITEMS = "SET_ITEMS",
  OPEN_ITEM = "OPEN_ITEM",
  CLOSE_ITEM = "CLOSE_ITEM",
  TOGGLE_ITEM = "TOGGLE_ITEM",
  OPEN_LEVEL = "OPEN_LEVEL",
}

type SidebarAction =
  | {
      type: SidebarActionType.SET_ITEMS;
      items: SidebarNode[];
      defaultLevel?: number;
    }
  | {
      type: SidebarActionType.OPEN_ITEM;
      nodeId: string;
    }
  | {
      type: SidebarActionType.CLOSE_ITEM;
      nodeId: string;
    }
  | {
      type: SidebarActionType.TOGGLE_ITEM;
      nodeId: string;
    }
  | {
      type: SidebarActionType.OPEN_LEVEL;
      level: number;
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

const reducer = (state: SidebarState, action: SidebarAction): SidebarState => {
  switch (action.type) {
    case SidebarActionType.SET_ITEMS:
      return {
        items: action.items,
        itemsState: getOpenLevels(action.items, action.defaultLevel ?? -1),
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
    default:
      return state;
  }
};

type SidebarContextType = {
  state: SidebarState;
  setItems: (items: SidebarNode[], defaultLevel?: number) => void;
  openItem: (nodeId: string) => void;
  closeItem: (nodeId: string) => void;
  toggleItem: (nodeId: string) => void;
  openLevel: (level: number) => void;
};

const SidebarContext = createContext<SidebarContextType>({
  state: { items: [], itemsState: {} },
  setItems: () => null,
  openItem: () => null,
  closeItem: () => null,
  toggleItem: () => null,
  openLevel: () => null,
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
  });

  const setItems = useCallback(
    (items: SidebarNode[]) => {
      dispatch({ type: SidebarActionType.SET_ITEMS, items });
    },
    [dispatch],
  );
  const openItem = useCallback(
    (nodeId: string) => {
      dispatch({ type: SidebarActionType.OPEN_ITEM, nodeId });
    },
    [dispatch],
  );
  const closeItem = useCallback(
    (nodeId: string) => {
      dispatch({ type: SidebarActionType.CLOSE_ITEM, nodeId });
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

  return (
    <SidebarContext.Provider
      value={{
        state,
        setItems,
        openItem,
        closeItem,
        toggleItem,
        openLevel,
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

export { SidebarProvider, useSidebar, useSidebarNodeState };
export type { SidebarState };
