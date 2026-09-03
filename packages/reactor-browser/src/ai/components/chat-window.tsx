import { ArrowUp, Check, Settings2, Square, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { UseReactorChatResult } from "../use-reactor-chat.js";
import type { ChatMessage, ChatPart } from "../types.js";
import { ApprovalCard } from "./approval-card.js";
import { AiSettingsPanel } from "./settings-panel.js";

function formatArgs(args: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(args);
  } catch {
    return String(args);
  }
  return json.length > 200 ? `${json.slice(0, 200)}…` : json;
}

function ToolCard({ part }: { part: Extract<ChatPart, { type: "tool" }> }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="rounded-lg border border-border bg-background p-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="flex w-full items-center gap-2 text-left text-xs text-foreground"
      >
        {part.state === "done" && (
          <Check size={13} className="shrink-0 text-info" />
        )}
        {part.state === "error" && (
          <X size={13} className="shrink-0 text-destructive" />
        )}
        {part.state === "rejected" && (
          <X size={13} className="shrink-0 text-muted-foreground" />
        )}
        {part.state === "executing" && (
          <span className="shrink-0 text-muted-foreground">⋯</span>
        )}
        <span className="font-mono text-muted-foreground">
          {part.name}({formatArgs(part.args)})
        </span>
      </button>
      {expanded && (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-muted p-2 text-xs text-foreground">
          {JSON.stringify(
            { args: part.args, result: part.result, error: part.error },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}

function MessageView({
  message,
  onApprove,
  onReject,
}: {
  message: ChatMessage;
  onApprove: (toolCallId: string) => void;
  onReject: (toolCallId: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          {message.parts
            .filter(
              (p): p is Extract<ChatPart, { type: "text" }> =>
                p.type === "text",
            )
            .map((p) => p.text)
            .join("")}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {message.parts.map((part, index) =>
        part.type === "text" ? (
          <div
            key={index}
            className="whitespace-pre-wrap text-sm text-foreground"
          >
            {part.text}
          </div>
        ) : (
          <div key={part.toolCallId} className="space-y-2">
            <ToolCard part={part} />
            {part.state === "awaiting-approval" && (
              <ApprovalCard
                approval={{
                  toolCallId: part.toolCallId,
                  name: part.name,
                  args: part.args,
                }}
                onApprove={onApprove}
                onReject={onReject}
              />
            )}
          </div>
        ),
      )}
      {message.parts.length === 0 && (
        <div className="text-sm text-muted-foreground">Thinking…</div>
      )}
    </div>
  );
}

/** The chat window panel, anchored above the FAB in the bottom-right. */
export function ChatWindow({
  chat,
  onClose,
}: {
  chat: UseReactorChatResult;
  onClose: () => void;
}) {
  const [settingsOpen, setSettingsOpen] = useState(!chat.configured);
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight });
    }
  }, [chat.messages]);

  const submit = () => {
    const text = draft;
    setDraft("");
    chat.send(text);
  };

  return (
    <div className="fixed bottom-24 right-6 z-40 flex max-h-[min(28rem,calc(100vh-8rem))] w-[min(24rem,calc(100vw-3rem))] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-sm font-semibold text-foreground">
          AI Assistant
        </span>
        <div className="flex items-center gap-1 text-muted-foreground">
          <button
            type="button"
            aria-label="Toggle AI settings"
            title="Settings"
            onClick={() => setSettingsOpen((o) => !o)}
            className="rounded p-1 hover:bg-muted hover:text-foreground"
          >
            {settingsOpen ? <X size={15} /> : <Settings2 size={15} />}
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

      {settingsOpen && <AiSettingsPanel settings={chat.settings} />}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {chat.messages.length === 0 && (
          <div className="pt-8 text-center text-sm text-muted-foreground">
            {chat.configured ? (
              <p>
                Ask the assistant to create or change documents, manage drives,
                or inspect read models.
              </p>
            ) : (
              <p>
                Configure your OpenAI-compatible endpoint above, then start a
                conversation.
              </p>
            )}
          </div>
        )}
        {chat.messages.map((message) => (
          <MessageView
            key={message.id}
            message={message}
            onApprove={chat.approve}
            onReject={chat.reject}
          />
        ))}
        {chat.error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {chat.error}
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={
              chat.configured
                ? "Ask the assistant… (Enter to send)"
                : "Configure the endpoint in settings first"
            }
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-md border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            disabled={chat.isStreaming}
          />
          {chat.isStreaming ? (
            <button
              type="button"
              aria-label="Stop generating"
              title="Stop"
              onClick={chat.stop}
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              title="Send"
              onClick={submit}
              disabled={!draft.trim() || !chat.configured}
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:disabled-effect"
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
