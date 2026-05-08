/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { VetraPackageGlobalState } from "../types.js";
import type {
  AddPackageKeywordAction,
  RemovePackageKeywordAction,
  SetPackageAuthorAction,
  SetPackageAuthorNameAction,
  SetPackageAuthorWebsiteAction,
  SetPackageCategoryAction,
  SetPackageDescriptionAction,
  SetPackageGithubUrlAction,
  SetPackageNameAction,
  SetPackageNpmUrlAction,
} from "./actions.js";

export interface VetraPackageBaseOperationsOperations {
  setPackageNameOperation: (
    state: VetraPackageGlobalState,
    action: SetPackageNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageDescriptionOperation: (
    state: VetraPackageGlobalState,
    action: SetPackageDescriptionAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageCategoryOperation: (
    state: VetraPackageGlobalState,
    action: SetPackageCategoryAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageAuthorOperation: (
    state: VetraPackageGlobalState,
    action: SetPackageAuthorAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageAuthorNameOperation: (
    state: VetraPackageGlobalState,
    action: SetPackageAuthorNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageAuthorWebsiteOperation: (
    state: VetraPackageGlobalState,
    action: SetPackageAuthorWebsiteAction,
    dispatch?: SignalDispatch,
  ) => void;
  addPackageKeywordOperation: (
    state: VetraPackageGlobalState,
    action: AddPackageKeywordAction,
    dispatch?: SignalDispatch,
  ) => void;
  removePackageKeywordOperation: (
    state: VetraPackageGlobalState,
    action: RemovePackageKeywordAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageGithubUrlOperation: (
    state: VetraPackageGlobalState,
    action: SetPackageGithubUrlAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageNpmUrlOperation: (
    state: VetraPackageGlobalState,
    action: SetPackageNpmUrlAction,
    dispatch?: SignalDispatch,
  ) => void;
}
