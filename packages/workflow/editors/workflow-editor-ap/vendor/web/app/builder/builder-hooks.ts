import { QueryClient } from '@tanstack/react-query';
import { createContext, useContext, useRef } from 'react';
import { type Socket } from '../../../../shims/socket.js';
import { create, useStore } from 'zustand';
import { shallow } from 'zustand/shallow';

import { type CanvasState, createCanvasState } from './state/canvas-state.js';
import { type ChatState, createChatState } from './state/chat-state.js';
import { createFlowState, type FlowState } from './state/flow-state.js';
import { createNotesState, type NotesState } from './state/notes-state.js';
import {
  createPieceSelectorState,
  type PieceSelectorState,
} from './state/piece-selector-state.js';
import { createRunState, type RunState } from './state/run-state.js';
import { createStepFormState, type StepFormState } from './state/step-form-state.js';

export const BuilderStateContext = createContext<BuilderStore | null>(null);

export function useBuilderStore(): BuilderStore {
  const store = useContext(BuilderStateContext);
  if (!store)
    throw new Error('Missing BuilderStateContext.Provider in the tree');
  return store;
}

// ph: upstream's zustand v4 cached selector snapshots; v5 re-runs selectors
// per getSnapshot, looping React on fresh-array results — cache shallowly.
export function useBuilderStateContext<T>(
  selector: (state: BuilderState) => T,
): T {
  const store = useBuilderStore();
  const cache = useRef<{ has: boolean; value: T }>({
    has: false,
    value: undefined as T,
  });
  return useStore(store, (state) => {
    const next = selector(state);
    if (cache.current.has && shallow(cache.current.value, next)) {
      return cache.current.value;
    }
    cache.current = { has: true, value: next };
    return next;
  });
}

export type BuilderState = FlowState &
  PieceSelectorState &
  RunState &
  ChatState &
  CanvasState &
  StepFormState &
  NotesState;
export type BuilderInitialState = Pick<
  BuilderState,
  | 'flow'
  | 'flowVersion'
  | 'readonly'
  | 'hideTestWidget'
  | 'run'
  | 'outputSampleData'
  | 'inputSampleData'
> & {
  socket: Socket;
  queryClient: QueryClient;
};

export type BuilderStore = ReturnType<typeof createBuilderStore>;
export const createBuilderStore = (initialState: BuilderInitialState) =>
  create<BuilderState>((set, get) => {
    const flowState = createFlowState(initialState, get, set);
    const pieceSelectorState = createPieceSelectorState(get, set);
    const runState = createRunState(initialState, get, set);
    const chatState = createChatState(set);
    const canvasState = createCanvasState(initialState, set);
    const stepFormState = createStepFormState(set);
    const notesState = createNotesState(get, set);
    return {
      ...flowState,
      ...notesState,
      ...runState,
      ...pieceSelectorState,
      ...chatState,
      ...canvasState,
      ...stepFormState,
    };
  });
