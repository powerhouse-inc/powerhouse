import { type SidebarNode } from "../../types";

// State interface
export interface SidebarState {
  nodes: SidebarNode[];
  expandedNodes: Set<string>;
  pinnedNodePath: SidebarNode[];
  maxDepth: number;
  searchTerm: string;
  searchResults: SidebarNode[];
  isSearching: boolean;
  activeSearchIndex: number;
  activeNodeId?: string;
  isStatusFilterEnabled: boolean;
}

// Initial state
export const initialSidebarState: SidebarState = {
  nodes: [],
  expandedNodes: new Set<string>(),
  pinnedNodePath: [],
  maxDepth: 4,
  searchTerm: "",
  searchResults: [],
  isSearching: false,
  activeSearchIndex: 0,
  activeNodeId: undefined,
  isStatusFilterEnabled: false,
};

// Action types
export enum SidebarActionType {
  SET_NODES = "SET_NODES",
  TOGGLE_NODE = "TOGGLE_NODE",
  OPEN_NODE = "OPEN_NODE",
  CLOSE_NODE = "CLOSE_NODE",
  TOGGLE_PIN = "TOGGLE_PIN",
  OPEN_LEVEL = "OPEN_LEVEL",
  CHANGE_SEARCH_TERM = "CHANGE_SEARCH_TERM",
  SET_SEARCH_RESULTS = "SET_SEARCH_RESULTS",
  SET_IS_SEARCHING = "SET_IS_SEARCHING",
  NEXT_SEARCH_RESULT = "NEXT_SEARCH_RESULT",
  PREVIOUS_SEARCH_RESULT = "PREVIOUS_SEARCH_RESULT",
  SYNC_ACTIVE_NODE_ID = "SYNC_ACTIVE_NODE_ID",
  TOGGLE_STATUS_FILTER = "TOGGLE_STATUS_FILTER",
  SET_FLATTENED_NODES = "SET_FLATTENED_NODES",
  SET_PINNED_NODE_PATH = "SET_PINNED_NODE_PATH",
  SET_EXPANDED_NODES = "SET_EXPANDED_NODES",
}

// Action interfaces
interface SetNodesAction {
  type: SidebarActionType.SET_NODES;
  payload: SidebarNode[];
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

interface TogglePinAction {
  type: SidebarActionType.TOGGLE_PIN;
  payload: string; // nodeId
}

interface OpenLevelAction {
  type: SidebarActionType.OPEN_LEVEL;
  payload: number; // level
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

interface NextSearchResultAction {
  type: SidebarActionType.NEXT_SEARCH_RESULT;
}

interface PreviousSearchResultAction {
  type: SidebarActionType.PREVIOUS_SEARCH_RESULT;
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

// Union type for all actions
export type SidebarAction =
  | SetNodesAction
  | ToggleNodeAction
  | OpenNodeAction
  | CloseNodeAction
  | TogglePinAction
  | OpenLevelAction
  | ChangeSearchTermAction
  | SetSearchResultsAction
  | SetIsSearchingAction
  | NextSearchResultAction
  | PreviousSearchResultAction
  | SyncActiveNodeIdAction
  | ToggleStatusFilterAction
  | SetPinnedNodePathAction
  | SetExpandedNodesAction;

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
        nodes: action.payload,
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

    case SidebarActionType.TOGGLE_PIN:
      // The actual logic for toggling pin will be handled in the provider
      // This is just a placeholder for the action
      return state;

    case SidebarActionType.OPEN_LEVEL:
      // The actual logic for opening levels will be handled in the provider
      // This is just a placeholder for the action
      return state;

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

    case SidebarActionType.NEXT_SEARCH_RESULT: {
      const nextIndex = Math.min(
        state.searchResults.length - 1,
        state.activeSearchIndex + 1,
      );
      return {
        ...state,
        activeSearchIndex: nextIndex,
      };
    }

    case SidebarActionType.PREVIOUS_SEARCH_RESULT: {
      const previousIndex = Math.max(0, state.activeSearchIndex - 1);
      return {
        ...state,
        activeSearchIndex: previousIndex,
      };
    }

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

    default:
      return state;
  }
};
