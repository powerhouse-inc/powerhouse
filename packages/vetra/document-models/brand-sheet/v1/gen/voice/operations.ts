/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import { type SignalDispatch } from "document-model";
import type { BrandSheetGlobalState } from "../types.js";
import type {
  ClearVoiceAction,
  SetVoiceAction,
  SetVoiceVocabularyAction,
  UpdateVoiceAction,
} from "./actions.js";

export interface BrandSheetVoiceOperations {
  setVoiceOperation: (
    state: BrandSheetGlobalState,
    action: SetVoiceAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateVoiceOperation: (
    state: BrandSheetGlobalState,
    action: UpdateVoiceAction,
    dispatch?: SignalDispatch,
  ) => void;
  setVoiceVocabularyOperation: (
    state: BrandSheetGlobalState,
    action: SetVoiceVocabularyAction,
    dispatch?: SignalDispatch,
  ) => void;
  clearVoiceOperation: (
    state: BrandSheetGlobalState,
    action: ClearVoiceAction,
    dispatch?: SignalDispatch,
  ) => void;
}
