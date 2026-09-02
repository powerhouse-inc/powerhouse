import { FlowTriggerType } from '../../../../shared/index.js';
import { type StoreApi } from 'zustand';

import { RightSideBarType } from '../types/index.js';
import { type StepMetadataWithSuggestions } from '../../../features/pieces/index.js';

import { type BuilderState } from '../builder-hooks.js';

export type PieceSelectorState = {
  openedPieceSelectorStepNameOrAddButtonId: string | null;
  setOpenedPieceSelectorStepNameOrAddButtonId: (
    stepNameOrAddButtonId: string | null,
  ) => void;
  selectedPieceMetadataInPieceSelector: StepMetadataWithSuggestions | null;
  setSelectedPieceMetadataInPieceSelector: (
    metadata: StepMetadataWithSuggestions | null,
  ) => void;
};

export const createPieceSelectorState = (
  _: StoreApi<BuilderState>['getState'],
  set: StoreApi<BuilderState>['setState'],
): PieceSelectorState => {
  return {
    openedPieceSelectorStepNameOrAddButtonId: null,
    setOpenedPieceSelectorStepNameOrAddButtonId: (
      stepNameOrAddButtonId: string | null,
    ) => {
      return set((state) => {
        const isReplacingEmptyTrigger =
          state.flowVersion.trigger.type === FlowTriggerType.EMPTY &&
          stepNameOrAddButtonId === 'trigger';
        return {
          openedPieceSelectorStepNameOrAddButtonId: stepNameOrAddButtonId,
          rightSidebar: isReplacingEmptyTrigger
            ? RightSideBarType.NONE
            : state.rightSidebar,
        };
      });
    },
    selectedPieceMetadataInPieceSelector: null,
    setSelectedPieceMetadataInPieceSelector: (
      metadata: StepMetadataWithSuggestions | null,
    ) => {
      return set(() => ({
        selectedPieceMetadataInPieceSelector: metadata,
      }));
    },
  };
};
