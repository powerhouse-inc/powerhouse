import { type SignalDispatch } from "document-model";
import {
  type SetPackageNameAction,
  type SetPackageDescriptionAction,
  type SetPackageCategoryAction,
  type SetPackagePublisherAction,
  type SetPackagePublisherUrlAction,
  type SetPackageKeywordsAction,
  type SetPackageGithubUrlAction,
  type SetPackageNpmUrlAction,
} from "./actions.js";
import { type VetraPackageState } from "../types.js";

export interface VetraPackagePackageOperationsOperations {
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
  setPackagePublisherOperation: (
    state: VetraPackageState,
    action: SetPackagePublisherAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackagePublisherUrlOperation: (
    state: VetraPackageState,
    action: SetPackagePublisherUrlAction,
    dispatch?: SignalDispatch,
  ) => void;
  setPackageKeywordsOperation: (
    state: VetraPackageState,
    action: SetPackageKeywordsAction,
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
