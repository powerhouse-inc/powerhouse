/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { FeatureGlobalState } from "../types.js";
import type {
  AddEvidenceAction,
  RemoveEvidenceAction,
  UpdateEvidenceAction,
} from "./actions.js";

export interface FeatureEvidenceOperations {
  addEvidenceOperation: (
    state: FeatureGlobalState,
    action: AddEvidenceAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateEvidenceOperation: (
    state: FeatureGlobalState,
    action: UpdateEvidenceAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeEvidenceOperation: (
    state: FeatureGlobalState,
    action: RemoveEvidenceAction,
    dispatch?: SignalDispatch,
  ) => void;
}
