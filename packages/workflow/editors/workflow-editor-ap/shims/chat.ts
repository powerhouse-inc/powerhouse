// Shim for @/features/chat: only the message list type the store needs.
export interface ChatMessage {
  id: string;
  role: string;
  content: unknown;
}

export type Messages = ChatMessage[];
