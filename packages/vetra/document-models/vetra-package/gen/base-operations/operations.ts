import { type SignalDispatch } from "document-model";
import {
  type SetPackageNameAction,
  type SetPackageDescriptionAction,
  type SetPackageCategoryAction,
  type SetPackageAuthorAction,
  type SetPackageAuthorNameAction,
  type SetPackageAuthorWebsiteAction,
  type AddPackageKeywordAction,
  type RemovePackageKeywordAction,
  type SetPackageGithubUrlAction,
  type SetPackageNpmUrlAction,
} from "./actions.js";
import { type VetraPackageState } from "../types.js";

export interface VetraPackageBaseOperationsOperations {
  setPackageNameOperation: (
    state: VetraPackageState,
    action: SetPackageNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageDescriptionOperation: (
    state: VetraPackageState,
    action: SetPackageDescriptionAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageCategoryOperation: (
    state: VetraPackageState,
    action: SetPackageCategoryAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageAuthorOperation: (
    state: VetraPackageState,
    action: SetPackageAuthorAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageAuthorNameOperation: (
    state: VetraPackageState,
    action: SetPackageAuthorNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageAuthorWebsiteOperation: (
    state: VetraPackageState,
    action: SetPackageAuthorWebsiteAction,
    dispatch?: SignalDispatch,
  ) => void;
  addPackageKeywordOperation: (
    state: VetraPackageState,
    action: AddPackageKeywordAction,
    dispatch?: SignalDispatch,
  ) => void;
  removePackageKeywordOperation: (
    state: VetraPackageState,
    action: RemovePackageKeywordAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageGithubUrlOperation: (
    state: VetraPackageState,
    action: SetPackageGithubUrlAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageNpmUrlOperation: (
    state: VetraPackageState,
    action: SetPackageNpmUrlAction,
    dispatch?: SignalDispatch,
  ) => void;
}
