"use client";

import type { SidebarNode } from "../types";
import { getNodePath, getOpenLevels, isOpenLevel } from "../utils";

export interface SidebarState {
  activeNodeId?: string;
  items: Array<SidebarNode>;
  itemsState: { [nodeId: string]: boolean };
  pinnedItems: Array<SidebarNode>;
}

export enum SidebarActionType {
  SET_ITEMS = "SET_ITEMS",
  TOGGLE_ITEM = "TOGGLE_ITEM",
  OPEN_LEVEL = "OPEN_LEVEL",
  TOGGLE_PIN = "TOGGLE_PIN",
  OPEN_PATH_TO_NODE = "OPEN_PATH_TO_NODE",
  SET_ACTIVE_NODE_ID = "SET_ACTIVE_NODE_ID",
}

export type SidebarAction =
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
    }
  | {
      type: SidebarActionType.OPEN_PATH_TO_NODE;
      nodeId: string;
    }
  | {
      type: SidebarActionType.SET_ACTIVE_NODE_ID;
      nodeId?: string;
    };

export const sidebarReducer = (
  state: SidebarState,
  action: SidebarAction,
): SidebarState => {
  switch (action.type) {
    case SidebarActionType.SET_ITEMS:
      return {
        items: action.items,
        itemsState: getOpenLevels(action.items, action.defaultLevel ?? -1),
        pinnedItems: [],
        activeNodeId: undefined,
      };
    case SidebarActionType.TOGGLE_ITEM:
      return {
        ...state,
        itemsState: {
          ...state.itemsState,
          [action.nodeId]: !state.itemsState[action.nodeId],
        },
      };
    case SidebarActionType.OPEN_LEVEL: {
      const targetLevel = action.level; // it comes from the UI, so it is 1-indexed
      const isTargetLevelOpen = isOpenLevel(
        state.items,
        state.itemsState,
        targetLevel - 1,
      );

      if (isTargetLevelOpen) {
        // if it is open, then we close all levels
        return {
          ...state,
          itemsState: {},
        };
      }

      // if it is not open, then we open all levels
      return {
        ...state,
        itemsState: getOpenLevels(state.items, action.level),
      };
    }
    case SidebarActionType.TOGGLE_PIN: {
      const isPinned =
        state.pinnedItems.length > 0 &&
        state.pinnedItems[state.pinnedItems.length - 1].id === action.nodeId;
      return {
        ...state,
        pinnedItems: isPinned
          ? [] // unpin
          : (getNodePath(state.items, action.nodeId) ?? []),
      };
    }
    case SidebarActionType.OPEN_PATH_TO_NODE: {
      const itemsState = {
        ...state.itemsState,
      };
      const nodePath = getNodePath(state.items, action.nodeId);
      if (nodePath) {
        for (const node of nodePath) {
          itemsState[node.id] = true;
        }
      }
      return {
        ...state,
        itemsState,
      };
    }
    case SidebarActionType.SET_ACTIVE_NODE_ID:
      return {
        ...state,
        itemsState: {
          ...state.itemsState,
        },
        activeNodeId: action.nodeId,
      };
    default:
      return state;
  }
};
