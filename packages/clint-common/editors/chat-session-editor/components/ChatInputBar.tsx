import type { IAttachmentService } from "@powerhousedao/reactor-attachments";
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { usePHToast } from "@powerhousedao/reactor-browser";
import type {
  ChatSessionAction,
  UserContentPartInput,
} from "document-models/chat-session";
import { addUserMessage, interruptAgent } from "document-models/chat-session";
import { generateId } from "document-model";
import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEventHandler,
  type MutableRefObject,
} from "react";
import { useOptimisticStop } from "../hooks/useOptimisticStop.js";
import type { PromptInputMessage } from "./ai-elements/prompt-input.js";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputFooter,
  PromptInputSubmit,
  usePromptInputAttachments,
} from "./ai-elements/prompt-input.js";
import { FileIcon, ImageIcon, XIcon } from "lucide-react";

function DropBridge({
  addFilesRef,
}: {
  addFilesRef?: MutableRefObject<((files: FileList) => void) | null>;
}) {
  const { add } = usePromptInputAttachments();
  useEffect(() => {
    if (addFilesRef) addFilesRef.current = add;
    return () => {
      if (addFilesRef) addFilesRef.current = null;
    };
  }, [add, addFilesRef]);
  return null;
}

function AttachButton({ disabled }: { disabled?: boolean }) {
  const attachments = usePromptInputAttachments();
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => attachments.openFileDialog()}
      className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none"
    >
      <ImageIcon className="size-4" />
      Add photos or files
    </button>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentPreviews() {
  const { files, remove } = usePromptInputAttachments();
  const [sizes, setSizes] = useState<Record<string, number>>({});

  useEffect(() => {
    for (const file of files) {
      if (sizes[file.id] !== undefined || !file.url.startsWith("blob:"))
        continue;
      void fetch(file.url)
        .then((r) => r.blob())
        .then((b) => setSizes((prev) => ({ ...prev, [file.id]: b.size })));
    }
  }, [files, sizes]);

  if (files.length === 0) return null;

  return (
    <div className="chat-attachment-gallery flex w-full gap-2 overflow-x-auto px-3 pb-1 pt-2">
      {files.map((file) => {
        const isImage = file.mediaType.startsWith("image/");
        const size = sizes[file.id];
        return (
          <div
            key={file.id}
            className="group/att relative flex w-64 shrink-0 gap-2 rounded-md border border-border bg-muted/30 p-1.5"
          >
            {isImage ? (
              <img
                src={file.url}
                alt={file.filename}
                className="size-16 shrink-0 rounded object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                <FileIcon className="size-6" />
              </div>
            )}
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              <p className="truncate text-sm font-medium" title={file.filename}>
                {file.filename}
              </p>
              <p
                className="truncate text-xs text-muted-foreground"
                title={
                  file.mediaType +
                  (size !== undefined ? ` · ${formatBytes(size)}` : "")
                }
              >
                {file.mediaType}
                {size !== undefined && ` · ${formatBytes(size)}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => remove(file.id)}
              className="absolute -top-1.5 -right-1.5 hidden size-5 items-center justify-center rounded-full bg-foreground text-background group-hover/att:flex"
            >
              <XIcon className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

interface ChatInputBarProps {
  dispatch: DocumentDispatch<ChatSessionAction>;
  attachments?: IAttachmentService;
  disabled?: boolean;
  /** Placeholder while disabled. */
  disabledPlaceholder?: string;
  /** True while the agent is actively generating a response — swaps send for stop. */
  responding?: boolean;
  addFilesRef?: MutableRefObject<((files: FileList) => void) | null>;
}

export function ChatInputBar({
  dispatch,
  attachments,
  disabled,
  disabledPlaceholder = "Session is not active",
  responding,
  addFilesRef,
}: ChatInputBarProps) {
  const [sending, setSending] = useState(false);
  const toast = usePHToast();

  // Optimistic stop: the button flips to stop the moment a message is sent,
  // before the server `responding` signal arrives. The hook owns the
  // optimistic window, the revert timeout, and the handoff to `responding`.
  const { status, markSubmitted, requestInterrupt } = useOptimisticStop({
    responding: !!responding,
  });
  const isActive = status !== "idle";
  const isInterrupting = status === "interrupting";

  const handleStop = useCallback(() => {
    // Sticky interrupt: works in both the optimistic window and the confirmed
    // turn. Request the interrupt (the watcher aborts any in-flight stream) and
    // move to the sticky `interrupting` state. The button stays the stop
    // control and is inert until the turn actually ends (responding=false) or
    // the hook's fallback timeout fires — so a late responding=true can't flip
    // it back.
    if (isInterrupting) return;
    dispatch(interruptAgent({}));
    requestInterrupt();
  }, [dispatch, requestInterrupt, isInterrupting]);

  // The user can keep composing the next message while the agent responds, but
  // Enter must not submit it mid-turn. Intercept Enter before PromptInputTextarea's
  // own handler (which would call form.requestSubmit() and clear the draft);
  // Shift+Enter still inserts a newline.
  const handleKeyDown = useCallback<KeyboardEventHandler<HTMLTextAreaElement>>(
    (e) => {
      if (
        isActive &&
        e.key === "Enter" &&
        !e.shiftKey &&
        !e.nativeEvent.isComposing
      ) {
        e.preventDefault();
      }
    },
    [isActive],
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      // Never accept a new message while sending or while a turn is active
      // (optimistic or confirmed); the textarea is disabled below, this guards
      // the Enter-key path too.
      if (sending || isActive) return;
      const text = message.text.trim();
      if (!text && message.files.length === 0) return;

      // If there are files but no attachment service, block with a toast
      if (message.files.length > 0 && !attachments) {
        toast?.("Attachment service unavailable — cannot upload files", {
          type: "error",
        });
        return;
      }

      setSending(true);
      try {
        const content: UserContentPartInput[] = [];

        if (text) {
          content.push({
            id: generateId(),
            type: "TEXT",
            text,
          });
        }

        for (const file of message.files) {
          const isImage = file.mediaType.startsWith("image/");
          const fileName = file.filename ?? "attachment";
          // Fetch the staged blob (blob: or data: URL) and upload to attachment service
          const resp = await fetch(file.url);
          if (!resp.body)
            throw new Error(`Could not read staged file: ${fileName}`);
          const upload = await attachments!.reserve({
            mimeType: file.mediaType,
            fileName,
          });
          const result = await upload.send(resp.body);
          content.push({
            id: generateId(),
            type: isImage ? "IMAGE" : "FILE",
            filename: file.filename,
            mediaType: file.mediaType,
            attachment: result.ref,
          });
        }

        dispatch(
          addUserMessage({
            id: generateId(),
            content,
            createdAt: new Date().toISOString(),
          }),
        );
        // Flip to the optimistic stop state immediately on dispatch.
        markSubmitted();
      } catch (err) {
        toast?.(
          `Upload failed: ${err instanceof Error ? err.message : String(err)}`,
          { type: "error" },
        );
      } finally {
        setSending(false);
      }
    },
    [dispatch, attachments, sending, isActive, markSubmitted, toast],
  );

  const isDisabled = disabled || sending;

  return (
    <div
      className="shrink-0 border-t border-border bg-background px-4 py-3"
      aria-busy={isActive || undefined}
    >
      <PromptInput
        onSubmit={handleSubmit}
        multiple
        className="mx-auto max-w-[1100px]"
      >
        <DropBridge addFilesRef={addFilesRef} />
        <PromptInputTextarea
          disabled={isDisabled}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? disabledPlaceholder : "Type a message..."}
        />
        <AttachmentPreviews />
        <PromptInputFooter>
          <AttachButton disabled={isDisabled} />
          {/* While a turn is active, render the stop control (stop square).
              The optimistic 'submitted', confirmed 'streaming', and
              'interrupting' phases all render the SAME stop visual, so a
              normal turn shows no flip when responding flips true.
              'interrupting' disables the button (the stop is already in
              flight). */}
          <PromptInputSubmit
            disabled={isActive ? isInterrupting : isDisabled}
            status={isActive ? "streaming" : undefined}
            onStop={handleStop}
          />
        </PromptInputFooter>
      </PromptInput>
    </div>
  );
}
