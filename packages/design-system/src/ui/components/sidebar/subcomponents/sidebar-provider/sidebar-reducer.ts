import type { NodeSortOrder, NodeSortType, SidebarNode } from "../../types.js";

// State interface
export interface SidebarState {
  nodes: SidebarNode[];
  expandedNodes: Set<string>;
  pinnedNodePath: SidebarNode[];
  searchTerm: string;
  searchResults: SidebarNode[];
  isSearching: boolean;
  activeSearchIndex: number;
  activeNodeId?: string;
  isStatusFilterEnabled: boolean;
  nodeSortType?: NodeSortType;
  nodeSortOrder: NodeSortOrder;
}

// Initial state
export const initialSidebarState: SidebarState = {
  nodes: [],
  expandedNodes: new Set<string>(),
  pinnedNodePath: [],
  searchTerm: "",
  searchResults: [],
  isSearching: false,
  activeSearchIndex: 0,
  activeNodeId: undefined,
  isStatusFilterEnabled: false,
  nodeSortType: undefined,
  nodeSortOrder: "asc",
};

// Action types
export enum SidebarActionType {
  SET_NODES = "SET_NODES",
  TOGGLE_NODE = "TOGGLE_NODE",
  OPEN_NODE = "OPEN_NODE",
  CLOSE_NODE = "CLOSE_NODE",
  CHANGE_SEARCH_TERM = "CHANGE_SEARCH_TERM",
  SET_SEARCH_RESULTS = "SET_SEARCH_RESULTS",
  SET_IS_SEARCHING = "SET_IS_SEARCHING",
  SYNC_ACTIVE_NODE_ID = "SYNC_ACTIVE_NODE_ID",
  TOGGLE_STATUS_FILTER = "TOGGLE_STATUS_FILTER",
  SET_PINNED_NODE_PATH = "SET_PINNED_NODE_PATH",
  SET_EXPANDED_NODES = "SET_EXPANDED_NODES",
  SET_NODES_SORT_TYPE = "SET_NODES_SORT_TYPE",
  SET_NODES_SORT_ORDER = "SET_NODES_SORT_ORDER",
}

// Action interfaces
interface SetNodesAction {
  type: SidebarActionType.SET_NODES;
  payload: {
    nodes: SidebarNode[];
    sortType?: NodeSortType;
    sortOrder?: NodeSortOrder;
  };
}

interface ToggleNodeAction {
  type: SidebarActionType.TOGGLE_NODE;
  payload: string; // nodeId
}

interface OpenNodeAction {
  type: SidebarActionType.OPEN_NODE;
  payload: string; // nodeId
}

interface CloseNodeAction {
  type: SidebarActionType.CLOSE_NODE;
  payload: string; // nodeId
}

interface ChangeSearchTermAction {
  type: SidebarActionType.CHANGE_SEARCH_TERM;
  payload: string;
}

interface SetSearchResultsAction {
  type: SidebarActionType.SET_SEARCH_RESULTS;
  payload: SidebarNode[];
}

interface SetIsSearchingAction {
  type: SidebarActionType.SET_IS_SEARCHING;
  payload: boolean;
}

interface SyncActiveNodeIdAction {
  type: SidebarActionType.SYNC_ACTIVE_NODE_ID;
  payload: string | undefined;
}

interface ToggleStatusFilterAction {
  type: SidebarActionType.TOGGLE_STATUS_FILTER;
}

interface SetPinnedNodePathAction {
  type: SidebarActionType.SET_PINNED_NODE_PATH;
  payload: SidebarNode[];
}

interface SetExpandedNodesAction {
  type: SidebarActionType.SET_EXPANDED_NODES;
  payload: Set<string>;
}

interface SetNodeSortTypeAction {
  type: SidebarActionType.SET_NODES_SORT_TYPE;
  payload: NodeSortType | undefined;
}

interface SetNodeSortOrderAction {
  type: SidebarActionType.SET_NODES_SORT_ORDER;
  payload: NodeSortOrder;
}

// Union type for all actions
export type SidebarAction =
  | SetNodesAction
  | ToggleNodeAction
  | OpenNodeAction
  | CloseNodeAction
  | ChangeSearchTermAction
  | SetSearchResultsAction
  | SetIsSearchingAction
  | SyncActiveNodeIdAction
  | ToggleStatusFilterAction
  | SetPinnedNodePathAction
  | SetExpandedNodesAction
  | SetNodeSortTypeAction
  | SetNodeSortOrderAction;

// Reducer function
export const sidebarReducer = (
  state: SidebarState = initialSidebarState,
  action: SidebarAction,
): SidebarState => {
  switch (action.type) {
    case SidebarActionType.SET_NODES: {
      return {
        ...state,
        pinnedNodePath: [],
        nodes: action.payload.nodes,
        nodeSortType: action.payload.sortType ?? state.nodeSortType,
        nodeSortOrder: action.payload.sortOrder ?? state.nodeSortOrder,
      };
    }

    case SidebarActionType.TOGGLE_NODE: {
      const newExpandedNodes = new Set(state.expandedNodes);
      if (newExpandedNodes.has(action.payload)) {
        newExpandedNodes.delete(action.payload);
      } else {
        newExpandedNodes.add(action.payload);
      }
      return {
        ...state,
        expandedNodes: newExpandedNodes,
      };
    }

    case SidebarActionType.OPEN_NODE: {
      const newExpandedNodes = new Set(state.expandedNodes);
      newExpandedNodes.add(action.payload);
      return {
        ...state,
        expandedNodes: newExpandedNodes,
      };
    }

    case SidebarActionType.CLOSE_NODE: {
      const newExpandedNodes = new Set(state.expandedNodes);
      newExpandedNodes.delete(action.payload);
      return {
        ...state,
        expandedNodes: newExpandedNodes,
      };
    }

    case SidebarActionType.CHANGE_SEARCH_TERM:
      return {
        ...state,
        searchTerm: action.payload,
      };

    case SidebarActionType.SET_SEARCH_RESULTS:
      return {
        ...state,
        searchResults: action.payload,
      };

    case SidebarActionType.SET_IS_SEARCHING:
      return {
        ...state,
        isSearching: action.payload,
      };

    case SidebarActionType.SYNC_ACTIVE_NODE_ID:
      return {
        ...state,
        activeNodeId: action.payload,
      };

    case SidebarActionType.TOGGLE_STATUS_FILTER:
      return {
        ...state,
        isStatusFilterEnabled: !state.isStatusFilterEnabled,
      };

    case SidebarActionType.SET_PINNED_NODE_PATH: {
      return {
        ...state,
        pinnedNodePath: action.payload,
      };
    }

    case SidebarActionType.SET_EXPANDED_NODES:
      return {
        ...state,
        expandedNodes: action.payload,
      };

    case SidebarActionType.SET_NODES_SORT_TYPE:
      return {
        ...state,
        nodeSortType: action.payload,
      };

    case SidebarActionType.SET_NODES_SORT_ORDER:
      return {
        ...state,
        nodeSortOrder: action.payload,
      };

    default:
      return state;
  }
};
