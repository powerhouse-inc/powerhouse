import { apId } from '../../../../core-utils/index.js';
import { type StoreApi } from 'zustand';

import { ChatDrawerSource } from '../types/index.js';
import { type Messages } from '../../../../../shims/chat.js';

import { type BuilderState } from '../builder-hooks.js';

export type ChatState = {
  chatDrawerOpenSource: ChatDrawerSource | null;
  chatSessionMessages: Messages;
  chatSessionId: string | null;
  setChatDrawerOpenSource: (source: ChatDrawerSource | null) => void;
  setChatSessionMessages: (messages: Messages) => void;
  addChatMessage: (message: Messages[0]) => void;
  clearChatSession: () => void;
  setChatSessionId: (sessionId: string | null) => void;
};

export const createChatState = (
  set: StoreApi<BuilderState>['setState'],
): ChatState => {
  return {
    chatDrawerOpenSource: null,
    chatSessionMessages: [],
    chatSessionId: apId(),
    setChatDrawerOpenSource: (source: ChatDrawerSource | null) =>
      set({ chatDrawerOpenSource: source }),
    setChatSessionMessages: (messages: Messages) =>
      set({ chatSessionMessages: messages }),
    addChatMessage: (message: Messages[0]) =>
      set((state) => ({
        chatSessionMessages: [...state.chatSessionMessages, message],
      })),
    clearChatSession: () =>
      set({ chatSessionMessages: [], chatSessionId: null }),
    setChatSessionId: (sessionId: string | null) =>
      set({ chatSessionId: sessionId }),
  };
};
