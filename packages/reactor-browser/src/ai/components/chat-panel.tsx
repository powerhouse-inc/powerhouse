import { ArrowUp, Check, ImagePlus, Square, X } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
} from "react";
import { CHAT_IMAGE_TYPES, readChatImage } from "../images.js";
import type { ChatImage, ChatMessage, ChatPart } from "../types.js";
import type { UseReactorChatResult } from "../use-reactor-chat.js";
import { ApprovalCard } from "./approval-card.js";
import { Markdown } from "./markdown.js";

const cx = (...parts: (string | false | undefined)[]) =>
  parts.filter(Boolean).join(" ");

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
    <div className="ph-chat-tool rounded-lg border border-border bg-background p-2">
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
    const text = message.parts
      .filter(
        (p): p is Extract<ChatPart, { type: "text" }> => p.type === "text",
      )
      .map((p) => p.text)
      .join("");
    const images = message.parts.filter(
      (p): p is Extract<ChatPart, { type: "image" }> => p.type === "image",
    );
    return (
      <div className="ph-chat-user flex justify-end">
        <div className="ph-chat-bubble max-w-[85%] space-y-2 whitespace-pre-wrap rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
          {images.map((image, index) => (
            <img
              key={index}
              src={image.dataUrl}
              alt={image.name ?? "Attached image"}
              className="ph-chat-image max-h-48 rounded"
            />
          ))}
          {text}
        </div>
      </div>
    );
  }
  return (
    <div className="ph-chat-assistant space-y-2">
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <div key={index} className="text-sm text-foreground">
              <Markdown text={part.text} />
            </div>
          );
        }
        if (part.type === "image") return null;
        return (
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
        );
      })}
      {message.parts.length === 0 && (
        <div className="ph-chat-thinking text-sm text-muted-foreground">
          Thinking…
        </div>
      )}
    </div>
  );
}

export interface ChatPanelProps {
  chat: UseReactorChatResult;
  className?: string;
  /** What shows while the conversation is empty. */
  emptyState?: ReactNode;
  /** One-click starting points, shown while the conversation is empty. */
  suggestions?: readonly string[];
  /** Lets the user attach images by paste, drop or the file picker. */
  allowImages?: boolean;
}

/**
 * The conversation and its composer, with no position of its own: it fills
 * whatever the host gives it (see `ChatWindow` for the floating one). Tailwind
 * utilities style it for Connect; the `ph-chat-*` classes are for hosts that
 * bring their own styles.
 */
export function ChatPanel({
  chat,
  className,
  emptyState,
  suggestions,
  allowImages = false,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<ChatImage[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight });
    }
  }, [chat.messages]);

  const attach = async (files: File[]) => {
    setImageError(null);
    try {
      const read = await Promise.all(files.map(readChatImage));
      setImages((current) => [...current, ...read]);
    } catch (error) {
      setImageError(error instanceof Error ? error.message : String(error));
    }
  };

  const onPaste = (event: ClipboardEvent) => {
    if (!allowImages) return;
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    void attach(files);
  };

  const onDrop = (event: DragEvent) => {
    if (!allowImages) return;
    event.preventDefault();
    void attach(Array.from(event.dataTransfer.files));
  };

  const submit = () => {
    const text = draft;
    const attached = images;
    setDraft("");
    setImages([]);
    setImageError(null);
    chat.send(text, attached);
  };

  const canSend = draft.trim() !== "" || images.length > 0;

  return (
    <div
      className={cx(
        "ph-chat flex min-h-0 flex-1 flex-col overflow-hidden",
        className,
      )}
      onDragOver={allowImages ? (event) => event.preventDefault() : undefined}
      onDrop={onDrop}
    >
      <div
        ref={listRef}
        className="ph-chat-list flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {chat.messages.length === 0 && (
          <div className="ph-chat-empty pt-8 text-center text-sm text-muted-foreground">
            {emptyState ??
              (chat.configured ? (
                <p>
                  Ask the assistant to create or change documents, manage
                  drives, or inspect read models.
                </p>
              ) : (
                <p>
                  Add your OpenAI-compatible endpoint under Settings → AI
                  Assistant, then start a conversation.
                </p>
              ))}
            {suggestions && suggestions.length > 0 && (
              <div className="ph-chat-suggestions mt-3 flex flex-wrap justify-center gap-2">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    disabled={!chat.configured}
                    onClick={() => chat.send(suggestion)}
                    className="ph-chat-suggestion rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
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
        {(chat.error ?? imageError) && (
          <div className="ph-chat-error rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            {chat.error ?? imageError}
          </div>
        )}
      </div>

      <div className="ph-chat-composer border-t border-border p-3">
        {images.length > 0 && (
          <div className="ph-chat-attachments mb-2 flex flex-wrap gap-2">
            {images.map((image, index) => (
              <div
                key={index}
                className="ph-chat-attachment relative size-14 overflow-hidden rounded-md border border-border"
              >
                <img
                  src={image.dataUrl}
                  alt={image.name ?? "Attached image"}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  aria-label={`Remove ${image.name ?? "image"}`}
                  onClick={() =>
                    setImages((current) =>
                      current.filter((_, at) => at !== index),
                    )
                  }
                  className="ph-chat-attachment-remove absolute right-0 top-0 rounded-bl bg-background p-0.5 text-foreground"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="ph-chat-compose-row flex items-end gap-2">
          {allowImages && (
            <>
              <input
                ref={pickerRef}
                type="file"
                accept={CHAT_IMAGE_TYPES.join(",")}
                multiple
                hidden
                aria-label="Attach images"
                onChange={(event) => {
                  void attach(Array.from(event.target.files ?? []));
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                aria-label="Attach an image"
                title="Attach an image"
                disabled={chat.isStreaming}
                onClick={() => pickerRef.current?.click()}
                className="ph-chat-attach flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ImagePlus size={15} />
              </button>
            </>
          )}
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPaste={onPaste}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (canSend) submit();
              }
            }}
            placeholder={
              chat.configured
                ? "Ask the assistant… (Enter to send)"
                : "Configure the endpoint in settings first"
            }
            className="ph-chat-input max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-md border border-border bg-background p-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            disabled={chat.isStreaming}
          />
          {chat.isStreaming ? (
            <button
              type="button"
              aria-label="Stop generating"
              title="Stop"
              onClick={chat.stop}
              className="ph-chat-send flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              type="button"
              aria-label="Send message"
              title="Send"
              onClick={submit}
              disabled={!canSend || !chat.configured}
              className="ph-chat-send flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:disabled-effect"
            >
              <ArrowUp size={15} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
