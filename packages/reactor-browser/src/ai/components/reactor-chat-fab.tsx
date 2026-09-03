import { MessageCircle, X } from "lucide-react";
import { useState } from "react";
import type { AiToolsProvider } from "../types.js";
import { useReactorChat } from "../use-reactor-chat.js";
import { ChatWindow } from "./chat-window.js";

/**
 * Bottom-right floating action button that opens the reactor AI chat window.
 *
 * `getTools` lazily resolves the reactor tool descriptors (from
 * `createReactorMcpProvider` bound to the browser reactor client) when the
 * user sends a message.
 */
export function ReactorChatFab({ getTools }: { getTools?: AiToolsProvider }) {
  const [open, setOpen] = useState(false);
  const chat = useReactorChat(getTools);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Close AI chat" : "Open AI chat"}
        title={open ? "Close AI chat" : "AI chat"}
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 disabled:disabled-effect"
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
      </button>
      {open && <ChatWindow chat={chat} onClose={() => setOpen(false)} />}
    </>
  );
}
