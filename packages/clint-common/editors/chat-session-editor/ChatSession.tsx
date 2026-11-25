import type { IAttachmentService } from "@powerhousedao/reactor-attachments";
import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type {
  ChatSessionAction,
  ChatSessionDocument,
} from "document-models/chat-session";
import { resumeSession, retryTurn } from "document-models/chat-session";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type DragEvent,
  type ReactNode,
} from "react";
import { PaperclipIcon } from "lucide-react";
import {
  AgentInfoHeader,
  type AgentAvatarProps,
} from "./components/AgentInfoHeader.js";
import { ChatInputBar } from "./components/ChatInputBar.js";
import {
  ChatActionsProvider,
  type ChatActions,
  type RenderFailureAction,
} from "./components/chat-actions.js";
import { AttachmentServiceProvider } from "./components/ContentPartRenderer.js";
import {
  ToolRenderersProvider,
  type ToolRenderers,
} from "./components/tool-rendering.js";
import { ConversationView } from "./components/ConversationView.js";
import { SessionStatusBar } from "./components/SessionStatusBar.js";
import { TestPane } from "./components/test-pane/TestPane.js";
import { deriveTurnView } from "./lib/turn-state.js";
import { cn } from "./lib/utils.js";

export type ChatSessionProps = {
  document: ChatSessionDocument;
  dispatch: DocumentDispatch<ChatSessionAction>;
  /** Attachment service for uploading staged files before dispatch. */
  attachments?: IAttachmentService;
  className?: string;
  /** Optional content rendered above the chat area, inside the drag-and-drop
   *  root so file drops over this region are still captured (e.g. a Connect
   *  DocumentToolbar). */
  header?: ReactNode;
  /** Override the agent avatar in the info header (e.g. an animated logo). */
  agentAvatar?: ComponentType<AgentAvatarProps>;
  /** Custom renderers for agent tool calls/results, keyed by tool name (or a
   *  resolver function). Tools without a match use the built-in tool UI. */
  toolRenderers?: ToolRenderers;
  /** Host action shown on a failed turn with code BUDGET_EXHAUSTED
   *  (e.g. a "Request more budget" button). */
  renderFailureAction?: RenderFailureAction;
};

export function ChatSession({
  document,
  dispatch,
  attachments,
  className,
  header,
  agentAvatar,
  toolRenderers,
  renderFailureAction,
}: ChatSessionProps) {
  const [showTestPane, setShowTestPane] = useState(false);

  const state = document.state.global;

  const turn = useMemo(() => deriveTurnView(state), [state]);
  const { responding } = turn;

  const handleRetry = useCallback(
    (userMessageId: string) =>
      dispatch(
        retryTurn({ userMessageId, requestedAt: new Date().toISOString() }),
      ),
    [dispatch],
  );
  const handleResume = useCallback(
    () => dispatch(resumeSession({ resumedAt: new Date().toISOString() })),
    [dispatch],
  );

  const chatActions = useMemo<ChatActions>(
    () => ({
      onRetry: handleRetry,
      renderFailureAction,
      retryableFailureId: turn.retryableFailureId,
      deliveryMessageId: turn.deliveryMessageId,
      deliveryState: turn.deliveryState,
      deliverySince: turn.deliverySince,
      active: state.status === "ACTIVE",
    }),
    [handleRetry, renderFailureAction, turn, state.status],
  );

  const toggleTestPane = useCallback(() => {
    setShowTestPane((prev) => !prev);
  }, []);

  const addFilesRef = useRef<((files: FileList) => void) | null>(null);

  const [isDragOver, setIsDragOver] = useState(false);
  const dragDepthRef = useRef(0);

  const onDragOver = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);
  const onDragEnter = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.stopPropagation();
      dragDepthRef.current += 1;
      if (dragDepthRef.current === 1) setIsDragOver(true);
    }
  }, []);
  const onDragLeave = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.stopPropagation();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragOver(false);
    }
  }, []);
  const onDrop = useCallback((e: DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      e.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFilesRef.current?.(e.dataTransfer.files);
      }
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "t" && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault();
        toggleTestPane();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleTestPane]);

  return (
    <AttachmentServiceProvider
      service={attachments}
      documentId={document.header.id}
    >
      <ToolRenderersProvider renderers={toolRenderers}>
        <ChatActionsProvider value={chatActions}>
          <div
            className={cn(
              "clint-chat-root flex h-full w-full flex-col overflow-hidden bg-background text-foreground",
              className,
            )}
            onDragOver={onDragOver}
            onDrop={onDrop}
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
          >
            {header}
            <div className="relative flex flex-1 overflow-hidden">
              {isDragOver && (
                <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary/60 bg-background/90 px-10 py-8 shadow-lg">
                    <PaperclipIcon className="size-10 text-primary" />
                    <p className="text-base font-medium text-foreground">
                      Drop files to attach
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Files will be added to your message
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-1 flex-col min-w-0">
                <AgentInfoHeader
                  agent={state.agent}
                  responding={responding}
                  avatar={agentAvatar}
                />
                <ConversationView
                  messages={state.messages}
                  responding={responding}
                />
                <ChatInputBar
                  dispatch={dispatch}
                  attachments={attachments}
                  disabled={state.status !== "ACTIVE"}
                  disabledPlaceholder={
                    state.status === "ERROR"
                      ? "Session stopped on an error. Resume to continue."
                      : undefined
                  }
                  responding={responding}
                  addFilesRef={addFilesRef}
                />
                {/* Test pane has no visible toggle; Ctrl/Cmd+Shift+T opens it for development. */}
                <SessionStatusBar
                  status={state.status}
                  startedAt={state.startedAt}
                  endedAt={state.endedAt}
                  usage={state.usage}
                  messageCount={state.messages.length}
                  onResume={handleResume}
                />
              </div>

              {showTestPane && (
                <div className="w-[380px] shrink-0 overflow-hidden">
                  <TestPane dispatch={dispatch} />
                </div>
              )}
            </div>
          </div>
        </ChatActionsProvider>
      </ToolRenderersProvider>
    </AttachmentServiceProvider>
  );
}
