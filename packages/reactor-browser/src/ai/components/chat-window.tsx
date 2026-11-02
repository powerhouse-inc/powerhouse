import { Maximize2, Minimize2, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { UseReactorChatResult } from "../use-reactor-chat.js";
import { ChatPanel } from "./chat-panel.js";

/** The chat window panel, anchored above the FAB in the bottom-right. */
export function ChatWindow({
  chat,
  onClose,
}: {
  chat: UseReactorChatResult;
  onClose: () => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  return (
    <div
      className={
        fullscreen
          ? "fixed inset-0 z-50 flex flex-col overflow-hidden bg-background"
          : "fixed bottom-24 right-6 z-40 flex max-h-[min(28rem,calc(100vh-8rem))] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
      }
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold text-foreground">
          AI Assistant
        </span>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button
            type="button"
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            title={fullscreen ? "Exit fullscreen (Esc)" : "Fullscreen"}
            onClick={() => setFullscreen((f) => !f)}
            className="rounded p-1 hover:bg-muted hover:text-foreground"
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            type="button"
            aria-label="Clear conversation"
            title="New chat"
            onClick={chat.clear}
            className="rounded p-1 hover:bg-muted hover:text-foreground"
          >
            <Trash2 size={15} />
          </button>
          <button
            type="button"
            aria-label="Close AI chat"
            title="Close"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted hover:text-foreground"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <ChatPanel chat={chat} />
    </div>
  );
}
