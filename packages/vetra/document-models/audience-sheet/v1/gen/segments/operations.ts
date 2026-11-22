/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { AudienceSheetGlobalState } from "../types.js";
import type {
  AddOutcomePriorityAction,
  AddSegmentAction,
  AddSegmentEvidenceAction,
  AddSegmentRoleAction,
  RemoveOutcomePriorityAction,
  RemoveSegmentAction,
  RemoveSegmentEvidenceAction,
  RemoveSegmentRoleAction,
  ReorderOutcomePrioritiesAction,
  ReorderSegmentRolesAction,
  ReorderSegmentsAction,
  UpdateOutcomePriorityAction,
  UpdateOutcomePrioritySnippetAction,
  UpdateSegmentAction,
  UpdateSegmentEvidenceAction,
  UpdateSegmentRoleSnippetAction,
} from "./actions.js";

export interface AudienceSheetSegmentsOperations {
  addSegmentOperation: (
    state: AudienceSheetGlobalState,
    action: AddSegmentAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateSegmentOperation: (
    state: AudienceSheetGlobalState,
    action: UpdateSegmentAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSegmentOperation: (
    state: AudienceSheetGlobalState,
    action: RemoveSegmentAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderSegmentsOperation: (
    state: AudienceSheetGlobalState,
    action: ReorderSegmentsAction,
    dispatch?: SignalDispatch,
  ) => void;
  addSegmentRoleOperation: (
    state: AudienceSheetGlobalState,
    action: AddSegmentRoleAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateSegmentRoleSnippetOperation: (
    state: AudienceSheetGlobalState,
    action: UpdateSegmentRoleSnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSegmentRoleOperation: (
    state: AudienceSheetGlobalState,
    action: RemoveSegmentRoleAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderSegmentRolesOperation: (
    state: AudienceSheetGlobalState,
    action: ReorderSegmentRolesAction,
    dispatch?: SignalDispatch,
  ) => void;
  addOutcomePriorityOperation: (
    state: AudienceSheetGlobalState,
    action: AddOutcomePriorityAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateOutcomePriorityOperation: (
    state: AudienceSheetGlobalState,
    action: UpdateOutcomePriorityAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateOutcomePrioritySnippetOperation: (
    state: AudienceSheetGlobalState,
    action: UpdateOutcomePrioritySnippetAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeOutcomePriorityOperation: (
    state: AudienceSheetGlobalState,
    action: RemoveOutcomePriorityAction,
    dispatch?: SignalDispatch,
  ) => void;
  reorderOutcomePrioritiesOperation: (
    state: AudienceSheetGlobalState,
    action: ReorderOutcomePrioritiesAction,
    dispatch?: SignalDispatch,
  ) => void;
  addSegmentEvidenceOperation: (
    state: AudienceSheetGlobalState,
    action: AddSegmentEvidenceAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateSegmentEvidenceOperation: (
    state: AudienceSheetGlobalState,
    action: UpdateSegmentEvidenceAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeSegmentEvidenceOperation: (
    state: AudienceSheetGlobalState,
    action: RemoveSegmentEvidenceAction,
    dispatch?: SignalDispatch,
  ) => void;
}
