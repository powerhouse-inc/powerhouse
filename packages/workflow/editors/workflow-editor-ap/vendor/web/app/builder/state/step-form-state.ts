import { type StoreApi } from 'zustand';

import { type BuilderState } from '../builder-hooks.js';

type InsertMentionHandler = (propertyPath: string) => void;
export type StepFormState = {
  insertMention: InsertMentionHandler | null;
  setInsertMentionHandler: (handler: InsertMentionHandler | null) => void;
  isFocusInsideListMapperModeInput: boolean;
  setIsFocusInsideListMapperModeInput: (
    isFocusInsideListMapperModeInput: boolean,
  ) => void;
};

export const createStepFormState = (
  set: StoreApi<BuilderState>['setState'],
): StepFormState => {
  return {
    setInsertMentionHandler: (insertMention: InsertMentionHandler | null) => {
      set({ insertMention });
    },
    insertMention: null,
    isFocusInsideListMapperModeInput: false,
    setIsFocusInsideListMapperModeInput: (
      isFocusInsideListMapperModeInput: boolean,
    ) => {
      return set(() => ({
        isFocusInsideListMapperModeInput,
      }));
    },
  };
};
