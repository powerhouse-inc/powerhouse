import { SignalDispatch } from "document-model/document";
import {
  SetRootPathAction,
  AddElementAction,
  UpdateElementTypeAction,
  UpdateElementNameAction,
  UpdateElementComponentsAction,
  RemoveElementAction,
  ReorderElementsAction,
  MoveElementAction,
} from "./actions";
import { ScopeFrameworkState } from "../types";

export interface ScopeFrameworkMainOperations {
  setRootPathOperation: (
    state: ScopeFrameworkState,
    action: SetRootPathAction,
    dispatch?: SignalDispatch,
  ) => void;
  addElementOperation: (
    state: ScopeFrameworkState,
    action: AddElementAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateElementTypeOperation: (
    state: ScopeFrameworkState,
    action: UpdateElementTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateElementNameOperation: (
    state: ScopeFrameworkState,
    action: UpdateElementNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateElementComponentsOperation: (
    state: ScopeFrameworkState,
    action: UpdateElementComponentsAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeElementOperation: (
    state: ScopeFrameworkState,
    action: RemoveElementAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderElementsOperation: (
    state: ScopeFrameworkState,
    action: ReorderElementsAction,
    dispatch?: SignalDispatch,
  ) => void;
  moveElementOperation: (
    state: ScopeFrameworkState,
    action: MoveElementAction,
    dispatch?: SignalDispatch,
  ) => void;
}
