/**
 * Watches chat session documents and invokes the agent when a turn is due.
 *
 * Flow:
 * 1. Trigger fires on any chat-session document change
 * 2. For each doc, guard: skip unless the session is ACTIVE, not in-flight and
 *    no interrupt is pending. Skips write nothing — they are recomputable from
 *    document state on every pass.
 * 3. Lazily initialize session (START_SESSION) if threadId is not set
 * 4. Decide whether a turn is due (planTurn): a requested retry
 *    (retryRequestedFor), a fresh USER message, or a turn left unfinished by a
 *    restart (resumed once, then failed).
 * 5. Dispatch the turn DETACHED (runAgentTurn) so the single serialized poll
 *    loop stays responsive and independent sessions stream concurrently on
 *    their own threadIds. The inFlight guard keeps it to one turn per document.
 * 6. The turn marks the user message picked up, streams the agent response
 *    back into the document and retries transient failures by re-running the
 *    agent with CONTINUE_PROMPT (its memory holds the completed steps). A turn
 *    that cannot finish ends with FAIL_TURN; the session is never ended.
 * 7. A USER message that arrives while the turn is running is marked picked up
 *    and queued as a steer (steer.ts); the steer processor feeds it to the
 *    running turn at its next step. Steers still queued when the turn ends,
 *    and messages that could not be steered (attachments), run as the next
 *    turn right away.
 */
import {
  createDocumentChangeTrigger,
  type AgentContentPart,
  type TriggerContext,
  type Logger,
  type ReactorContext,
  type AgentProvider,
} from "@powerhousedao/clint";
import {
  ensureSessionInitialized,
  type ChatSessionRegistry,
} from "./chat-session-init.js";
import {
  writeAgentStreamToDocument,
  RetryableStreamError,
  dispatchFailTurn,
  describeFailure,
  SUPERSEDED_FINISH_REASONS,
} from "./chat-bridge.js";
import {
  extractAttachments,
  type ExtractedAttachment,
} from "./extract-attachments.js";
import type {
  ChatSessionAction,
  ChatSessionState,
  ContentPart,
  Message,
} from "@powerhousedao/clint-common/document-models/chat-session";
import {
  clearRetryRequest,
  finishAssistantMessage,
  hasMessageContent,
  isFailedTurn,
  markMessagePickedUp,
} from "@powerhousedao/clint-common/document-models/chat-session";
import {
  beginSteerableTurn,
  drainSteers,
  endSteerableTurn,
  enqueueSteer,
  isSteerDelivered,
  type SteerMessage,
} from "./steer.js";

const DOCUMENT_TYPE = "powerhouse/chat-session" as const;
const TAG = "[chat-session-watch]";

const STREAM_MAX_RETRIES = 3;
const STREAM_RETRY_CAP_MS = 30_000;

/**
 * Prompt for re-running a turn that was cut off after it produced output. The
 * agent's memory (threadId) holds the completed steps, so it picks up from there.
 */
export const CONTINUE_PROMPT =
  "The previous response was interrupted by a temporary provider error. Continue exactly where you stopped; do not repeat tool calls that already completed.";

const COMPLETED_TOOL_TEXT_CHARS = 300;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/**
 * CONTINUE_PROMPT plus the tool calls of this turn that already have a result,
 * read from the chat document (the bridge mirrors TOOL_CALL parts and
 * TOOL_RESULT messages). Agent memory may not hold an interrupted turn's steps,
 * so the prompt itself says what must not run again.
 */
export function buildContinuePrompt(
  messages: Message[],
  userMessageId: string,
): string {
  const start = messages.findIndex((m) => m.id === userMessageId);
  const turn = messages.slice(start + 1);
  const results = new Map<string, string>();
  for (const m of turn) {
    if (m.role !== "TOOL") continue;
    for (const p of m.content) {
      if (p.type === "TOOL_RESULT" && p.toolCallId)
        results.set(p.toolCallId, p.result ?? "");
    }
  }
  const lines: string[] = [];
  for (const m of turn) {
    if (m.role !== "ASSISTANT") continue;
    for (const p of m.content) {
      if (p.type !== "TOOL_CALL" || !p.toolCallId) continue;
      const result = results.get(p.toolCallId);
      if (result === undefined) continue;
      lines.push(
        `- ${p.toolName ?? "tool"}(${truncate(p.args ?? "", COMPLETED_TOOL_TEXT_CHARS)}) → ${truncate(result, COMPLETED_TOOL_TEXT_CHARS)}`,
      );
    }
  }
  return lines.length > 0
    ? `${CONTINUE_PROMPT}\n\nAlready completed in this turn:\n${lines.join("\n")}`
    : CONTINUE_PROMPT;
}

/** Load the document and build the continue prompt for a turn. */
async function loadContinuePrompt(
  reactor: ReactorContext<ChatSessionRegistry>,
  documentId: string,
  userMessageId: string,
): Promise<string> {
  const doc = await reactor.client.get<"powerhouse/chat-session">(documentId);
  return buildContinuePrompt(doc.state.global.messages, userMessageId);
}

/** Resolves after `ms`, or as soon as `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/** Honor `retry-after`, else exponential backoff with full jitter; capped. */
function streamRetryDelayMs(
  err: RetryableStreamError,
  attempt: number,
): number {
  if (err.retryAfterMs !== undefined)
    return Math.min(err.retryAfterMs, STREAM_RETRY_CAP_MS);
  const backoff = Math.min(1000 * 2 ** attempt, STREAM_RETRY_CAP_MS);
  return Math.round(Math.random() * backoff);
}

/**
 * A running turn: its agent thread, the user message it answers, and the last
 * message that existed when it started (later messages arrived during it).
 */
type InFlightTurn = {
  threadId: string;
  userMessageId: string;
  afterId: string;
};

/**
 * Documents with a turn running, keyed by document id, to prevent re-entrancy.
 * Holds the turn's agent thread and the user message it answers, so messages
 * arriving meanwhile can be steered into it.
 */
const inFlight = new Map<string, InFlightTurn>();

/**
 * USER messages handed to a running turn as steers. Once consumed they must
 * not start a turn of their own when they happen to be the last message.
 */
const steeredMessageIds = new Set<string>();

/**
 * USER messages (`documentId:messageId`) whose turn ended without writing anything (stopped or paused
 * at its first step). Process-local: after a restart such a message is tried
 * once more, then waits here.
 */
const stoppedWithoutOutput = new Set<string>();

/** Detached turns still running (see waitForChatTurns). */
const runningTurns = new Set<Promise<void>>();

/** Resolves once every detached turn has settled. For tests and shutdown. */
export async function waitForChatTurns(): Promise<void> {
  while (runningTurns.size > 0) {
    await Promise.allSettled([...runningTurns]);
  }
}

/**
 * AbortControllers for in-flight agent streams, keyed by document id. The
 * interrupt listener (below) aborts the matching controller when the user
 * requests an interrupt mid-turn.
 */
const abortControllers = new Map<string, AbortController>();

/** Ensures the document-change listener that watches for interrupts is registered once. */
let interruptListenerRegistered = false;

/**
 * Register a single, process-wide listener for the interrupt signal.
 *
 * The trigger serializes its `onChange` polling, so while a stream is in
 * flight the trigger cannot observe a freshly-dispatched INTERRUPT_AGENT
 * operation until the stream finishes — too late to interrupt. The event bus,
 * however, fires synchronously on every document change regardless of the
 * blocked poll loop, so we subscribe to it directly and abort the in-flight
 * stream the moment `interruptRequested` flips to true.
 */
function ensureInterruptListener(
  ctx: TriggerContext<
    { pending: number },
    Record<string, unknown>,
    ChatSessionRegistry
  >,
): void {
  if (interruptListenerRegistered) return;
  const on = ctx.context.on;
  if (!on) return;
  interruptListenerRegistered = true;
  const log = ctx.context.log;

  on("powerhouse:document:changed", (payload) => {
    for (const doc of payload.documents) {
      const documentId = doc.header.id;
      const controller = abortControllers.get(documentId);
      if (!controller || controller.signal.aborted) continue;
      const global = (doc.state as { global?: ChatSessionState }).global;
      if (global?.interruptRequested) {
        log?.info(
          `${TAG} interrupt requested for ${documentId}, aborting agent stream`,
        );
        controller.abort();
      }
    }
  });
}

/** Ensures the document-created listener is registered once. */
let creationListenerRegistered = false;

// Init a chat session on creation so the agent header shows on open: creation
// fires powerhouse:document:created, which the change-trigger does not observe.
function ensureCreationListener(
  ctx: TriggerContext<
    { pending: number },
    Record<string, unknown>,
    ChatSessionRegistry
  >,
): void {
  if (creationListenerRegistered) return;
  const on = ctx.context.on;
  if (!on) return;
  creationListenerRegistered = true;
  const log = ctx.context.log;

  on("powerhouse:document:created", (payload) => {
    if (payload.documentType !== DOCUMENT_TYPE) return;
    void initCreatedSession(ctx, payload.documentId, log);
  });
}

async function initCreatedSession(
  ctx: TriggerContext<
    { pending: number },
    Record<string, unknown>,
    ChatSessionRegistry
  >,
  documentId: string,
  log?: Logger,
): Promise<void> {
  try {
    const reactor = await ctx.reactor();
    const agent = await ctx.agent();
    if (!reactor || !agent) return;
    const doc = await reactor.client.get<"powerhouse/chat-session">(documentId);
    // The agent cannot write this session yet (no signature, or not one it
    // works on): it is picked up on `powerhouse:writes:ready` instead.
    if (reactor.writes && !reactor.writes.canWrite(doc)) return;
    const state = doc.state.global;
    if (
      state.status === "COMPLETED" ||
      state.status === "ABORTED" ||
      state.status === "ERROR"
    )
      return;
    await ensureSessionInitialized(reactor, documentId, state, agent, log);
  } catch (err) {
    log?.error(`${TAG} init on create failed for ${documentId}:`, err);
  }
}

type TurnMode = "new" | "retry" | "resume";

/**
 * `earlier`: unanswered messages sent before `userMessage` (kept by a stop or
 * pause, or sent during the last turn); they lead its prompt, text and files,
 * in document order. `earlierTexts`: texts with no message to read (queued
 * steers missing from a stale read), placed first.
 */
type TurnPlan =
  | {
      kind: "run";
      mode: TurnMode;
      userMessage: Message;
      continueFromStart: boolean;
      openMessageId?: string;
      earlier?: Message[];
      earlierTexts?: string[];
    }
  | { kind: "clear-retry" }
  | { kind: "fail-interrupted"; userMessageId: string; openMessageId?: string };

/** True when an ASSISTANT or TOOL message (other than a failure) follows the given message. */
function hasOutputAfter(messages: Message[], messageId: string): boolean {
  const index = messages.findIndex((m) => m.id === messageId);
  return messages
    .slice(index + 1)
    .some(
      (m) => (m.role === "ASSISTANT" || m.role === "TOOL") && !isFailedTurn(m),
    );
}

/**
 * Index of the USER message that started the turn the USER message at `index`
 * belongs to. A steer sits inside the turn it was sent into: the turn before
 * it produced output and had not finished (its latest reply is open or was
 * superseded by a retry or restart), so walk back to that turn's start.
 */
function turnStart(messages: Message[], index: number): number {
  let start = index;
  while (messages[start].role === "USER") {
    let prev = start - 1;
    while (
      prev >= 0 &&
      messages[prev].role !== "USER" &&
      !isFailedTurn(messages[prev])
    )
      prev--;
    if (prev < 0 || messages[prev].role !== "USER") break;
    const between = messages.slice(prev + 1, start);
    if (!between.some((m) => m.role === "ASSISTANT" || m.role === "TOOL"))
      break;
    const finished = between.some(
      (m) =>
        m.role === "ASSISTANT" &&
        ((m.finishedAt &&
          !SUPERSEDED_FINISH_REASONS.has(m.finishReason ?? "")) ||
          m.content.some((p) => p.type === "ERROR")),
    );
    if (finished) break;
    start = prev;
  }
  return start;
}

/**
 * Steers of a turn cut off by a restart that no step has seen yet: picked-up
 * USER messages after the turn start with no ASSISTANT message after them
 * (a step that read a steer writes its output after it).
 */
function unconsumedSteers(
  messages: Message[],
  userMessageId: string,
): Message[] {
  const start = messages.findIndex((m) => m.id === userMessageId);
  if (start < 0) return [];
  const lastAssistant = messages.findLastIndex((m) => m.role === "ASSISTANT");
  return messages
    .slice(Math.max(start, lastAssistant) + 1)
    .filter(
      (m) =>
        m.role === "USER" &&
        m.pickedUpAt &&
        hasMessageContent(m) &&
        m.content.every((p) => p.type === "TEXT"),
    );
}

/**
 * A turn cut off by a restart: after the last USER or failure message, the
 * latest ASSISTANT message is still open, or was closed only to be superseded
 * (a retry or a restart). Legacy error messages count as terminal.
 */
function findUnfinishedTurn(messages: Message[]): {
  userMessageId: string;
  openMessageId?: string;
  resumedBefore: boolean;
} | null {
  let start = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "USER" || isFailedTurn(messages[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  start = turnStart(messages, start);
  const anchor = messages[start];
  const segment = messages.slice(start + 1);
  const assistants = segment.filter((m) => m.role === "ASSISTANT");
  const latest = assistants.at(-1);
  if (!latest) return null;
  if (latest.content.some((p) => p.type === "ERROR")) return null;
  if (
    latest.finishedAt &&
    !SUPERSEDED_FINISH_REASONS.has(latest.finishReason ?? "")
  )
    return null;
  const userMessageId =
    anchor.role === "USER" ? anchor.id : anchor.failure?.userMessageId;
  if (!userMessageId) return null;
  return {
    userMessageId,
    openMessageId: latest.finishedAt ? undefined : latest.id,
    resumedBefore: assistants.some((m) => m.finishReason === "restart"),
  };
}

/** Decide whether this document has a turn to run (or to close). Pure. */
function planTurn(
  documentId: string,
  state: ChatSessionState,
): TurnPlan | null {
  const { messages } = state;

  // A requested retry re-runs that user message's turn. Legacy docs read undefined.
  if (state.retryRequestedFor) {
    const userMessage = messages.find((m) => m.id === state.retryRequestedFor);
    if (!userMessage || userMessage.role !== "USER")
      return { kind: "clear-retry" };
    const continueFromStart = hasOutputAfter(messages, userMessage.id);
    if (continueFromStart)
      return { kind: "run", mode: "retry", userMessage, continueFromStart };
    // Re-run from the start: the unanswered messages that led it (only those before it) lead again.
    return {
      kind: "run",
      mode: "retry",
      userMessage,
      continueFromStart,
      earlier: keptSteers(messages, messages.indexOf(userMessage)),
    };
  }

  const lastMessage = messages[messages.length - 1];
  if (lastMessage.role === "USER") {
    // Empty message (no text, no attachments): skip, statelessly.
    if (!hasMessageContent(lastMessage)) return null;
    // Already handed to the turn that was running when it arrived.
    if (steeredMessageIds.has(lastMessage.id)) return null;
    // Its turn stopped before any output (a stop or pause): it waits as a
    // kept message for the next turn instead of being started again.
    if (stoppedWithoutOutput.has(`${documentId}:${lastMessage.id}`))
      return null;
    return {
      kind: "run",
      mode: "new",
      userMessage: lastMessage,
      continueFromStart: false,
    };
  }

  const unfinished = findUnfinishedTurn(messages);
  if (!unfinished) return null;
  const userMessage = messages.find((m) => m.id === unfinished.userMessageId);
  // Resume once, and only turns this watcher picked up (legacy turns have no pickedUpAt).
  if (
    !userMessage ||
    userMessage.role !== "USER" ||
    !userMessage.pickedUpAt ||
    unfinished.resumedBefore
  ) {
    return {
      kind: "fail-interrupted",
      userMessageId: unfinished.userMessageId,
      openMessageId: unfinished.openMessageId,
    };
  }
  return {
    kind: "run",
    mode: "resume",
    userMessage,
    continueFromStart: true,
    openMessageId: unfinished.openMessageId,
  };
}

/**
 * Build the agent prompt for a user message and the unanswered messages that
 * lead it (`earlier`, document order; `earlierTexts` first): their texts as
 * paragraphs, then native images and saved-attachment paths of all of them.
 */
async function buildUserPrompt(
  documentId: string,
  userMessage: Message,
  reactor: ReactorContext<ChatSessionRegistry>,
  ctx: TriggerContext<
    { pending: number },
    Record<string, unknown>,
    ChatSessionRegistry
  >,
  options: ChatSessionWatchOptions,
  log?: Logger,
  earlier: Message[] = [],
  earlierTexts: string[] = [],
): Promise<string | AgentContentPart[]> {
  const messagesInOrder = [...earlier, userMessage];
  const userText = [...earlierTexts, ...messagesInOrder.map(messageText)]
    .filter((t) => t)
    .join("\n\n");

  log?.info(
    `${TAG} processing ${documentId}: ${userText ? `user said "${userText.slice(0, 80)}..."` : "attachment-only message"}`,
  );

  // Extract file/image attachments to disk. A message sent again (a retry, or
  // kept after a stop) carries its files again.
  const attachments: ExtractedAttachment[] = [];
  for (const message of messagesInOrder) {
    attachments.push(
      ...(await extractAttachments(message, {
        workdir: ctx.context.workdir,
        ...(options.downloadsDir !== undefined
          ? { downloadsDir: options.downloadsDir }
          : {}),
        documentId,
        log,
        service: reactor.attachments,
        includeExtracted: true,
      })),
    );
  }

  // Build multimodal prompt: include images natively so the model
  // can see them, plus file paths so agent tools can read them.
  // Image bytes come from the already-resolved attachments (no second service.get).
  const imageAttachments = attachments.filter((a) => a.partType === "IMAGE");
  const note =
    attachments.length > 0
      ? `[Attached files saved to disk]\n${attachments.map((a) => `- ${a.filename}: ${a.localPath}`).join("\n")}`
      : "";
  if (attachments.length > 0)
    log?.info(`${TAG} extracted ${attachments.length} attachment(s)`);

  if (imageAttachments.length > 0) {
    const parts: AgentContentPart[] = imageAttachments.map((a) => ({
      type: "image" as const,
      image: a.bytes,
      mediaType: a.mediaType ?? undefined,
    }));
    const text = note ? (userText ? `${userText}\n\n${note}` : note) : userText;
    if (text) parts.push({ type: "text", text });
    return parts;
  }
  if (note) return userText ? `${userText}\n\n${note}` : note;
  return userText;
}

/** The text of a message's TEXT parts. */
function messageText(message: Message): string {
  return message.content
    .filter((p: ContentPart) => p.type === "TEXT" && p.text)
    .map((p: ContentPart) => p.text!)
    .join("\n");
}

/** Index of the last message that existed when the turn started; messages after it arrived during the turn. */
function boundaryIndex(messages: Message[], turn: InFlightTurn): number {
  const after = messages.findIndex((m) => m.id === turn.afterId);
  return after >= 0
    ? after
    : messages.findIndex((m) => m.id === turn.userMessageId);
}

/** A message the running turn can take as a steer (text only; attachments need the regular prompt path). */
function isTextOnly(message: Message): boolean {
  return message.content.every((p) => p.type === "TEXT");
}

/**
 * Hand USER messages that arrived during the running turn to it as steers:
 * queue them (synchronously, so a turn ending meanwhile still sees them) and
 * mark them picked up. A message with attachments is left for the follow-up
 * turn, which reads it through the regular prompt path, and so is everything
 * sent after it.
 */
async function steerArrivedMessages(
  documentId: string,
  state: ChatSessionState,
  turn: InFlightTurn,
  reactor: ReactorContext<ChatSessionRegistry>,
  log?: Logger,
): Promise<void> {
  const boundary = boundaryIndex(state.messages, turn);
  if (boundary < 0) return;
  const steerable: Message[] = [];
  for (const m of state.messages.slice(boundary + 1)) {
    if (m.role !== "USER" || m.pickedUpAt || !hasMessageContent(m)) continue;
    // Keep the customer's order: nothing after a message waiting for the follow-up turn jumps ahead of it.
    if (!isTextOnly(m)) break;
    if (!steeredMessageIds.has(m.id)) steerable.push(m);
  }
  if (steerable.length === 0) return;
  for (const m of steerable) {
    steeredMessageIds.add(m.id);
    enqueueSteer(turn.threadId, { id: m.id, text: messageText(m) });
  }
  log?.info(
    `${TAG} ${documentId} queued ${steerable.length} message(s) for the running turn`,
  );
  const pickedUpAt = new Date().toISOString();
  await reactor.client
    .execute<"powerhouse/chat-session">(
      documentId,
      "main",
      steerable.map((m) =>
        markMessagePickedUp({ messageId: m.id, pickedUpAt }),
      ),
    )
    .catch((e: unknown) =>
      log?.error(
        `${TAG} failed to mark steered messages picked up for ${documentId}:`,
        e,
      ),
    );
}

/**
 * After a turn ends, decide the follow-up turn: steers the turn did not reach
 * plus messages that could not be steered, in the order they were sent. The
 * newest one anchors the turn (its reply comes last); the others lead its
 * prompt with their text and files.
 * Must run synchronously with the in-flight release (no await) so no arriving
 * message falls between them.
 */
function planFollowUp(
  state: ChatSessionState,
  turn: InFlightTurn,
): { userMessage: Message; earlier: Message[]; earlierTexts: string[] } | null {
  const leftovers = drainSteers(turn.threadId);
  if (state.interruptRequested) {
    // Stopped: nothing runs now; the next turn reads them at its first step.
    for (const s of leftovers) enqueueSteer(turn.threadId, s);
    return null;
  }
  const leftoverIds = new Set(leftovers.map((s) => s.id));
  const boundary = boundaryIndex(state.messages, turn);
  const pending = state.messages.filter(
    (m, i) =>
      m.role === "USER" &&
      hasMessageContent(m) &&
      (leftoverIds.has(m.id) ||
        (boundary >= 0 &&
          i > boundary &&
          !m.pickedUpAt &&
          !steeredMessageIds.has(m.id))),
  );
  // Queued steers missing from this (stale) read.
  const missing = leftovers.filter((s) => !pending.some((m) => m.id === s.id));
  if (pending.length === 0) {
    if (missing.length === 0) return null;
    // Run them from the queued texts: the last one anchors the turn (it exists in the document, just not in this read).
    const last = missing[missing.length - 1];
    return {
      userMessage: queuedUserMessage(last),
      earlier: [],
      earlierTexts: missing.slice(0, -1).map((s) => s.text),
    };
  }
  return {
    userMessage: pending[pending.length - 1],
    earlier: pending.slice(0, -1),
    earlierTexts: missing.map((s) => s.text),
  };
}

/** A text USER message rebuilt from a queued steer, for a document read that does not show it yet. */
function queuedUserMessage(steer: SteerMessage): Message {
  return {
    id: steer.id,
    role: "USER",
    content: [
      {
        id: `${steer.id}-text`,
        type: "TEXT",
        text: steer.text,
        toolCallId: null,
        toolName: null,
        args: null,
        result: null,
        isError: null,
        mediaType: null,
        url: null,
        attachment: null,
        filename: null,
        error: null,
      },
    ],
    stepIndex: null,
    createdAt: new Date().toISOString(),
    usage: null,
    finishedAt: null,
    finishReason: null,
    pickedUpAt: null,
    failure: null,
  };
}

/**
 * Messages kept unanswered, read from the document so they survive a restart:
 * USER messages after the last ASSISTANT message and before the message at
 * `index`. Each is a steer no step read, the prompt of a turn stopped before
 * any output (a stop or pause at its first step: no reply was written and
 * agent memory did not save the turn), or a message sent right before the new
 * one that no turn picked up. All are unanswered, so all lead the next turn.
 */
function keptSteers(messages: Message[], index: number): Message[] {
  const before = messages.slice(0, index);
  const lastAssistant = before.findLastIndex((m) => m.role === "ASSISTANT");
  return before
    .slice(lastAssistant + 1)
    .filter(
      (m) =>
        m.role === "USER" && hasMessageContent(m) && !isSteerDelivered(m.id),
    );
}

/**
 * Run a single chat turn for one session to completion: mark the user message
 * picked up, lazy-init the session, build the prompt, and stream the agent
 * response back into the document. Retryable failures re-run the agent (at
 * most STREAM_MAX_RETRIES times; a restart resume gets one attempt), with
 * CONTINUE_PROMPT once output exists. Every failure ends in FAIL_TURN.
 *
 * This is dispatched DETACHED from the watcher's poll loop (see onChange) so it
 * does not block other sessions. It is guarded by the `inFlight` set keyed on
 * documentId, so at most one turn per document runs at a time; turns for
 * DIFFERENT documents run concurrently on their own threadIds.
 */
async function runAgentTurn(
  documentId: string,
  state: ChatSessionState,
  plan: Extract<TurnPlan, { kind: "run" }>,
  reactor: ReactorContext<ChatSessionRegistry>,
  agent: AgentProvider,
  ctx: TriggerContext<
    { pending: number },
    Record<string, unknown>,
    ChatSessionRegistry
  >,
  options: ChatSessionWatchOptions,
  log?: Logger,
): Promise<void> {
  const userMessageId = plan.userMessage.id;
  const execute = (actions: ChatSessionAction[]) =>
    reactor.client.execute<"powerhouse/chat-session">(
      documentId,
      "main",
      actions,
    );
  const pickUp = () =>
    markMessagePickedUp({
      messageId: userMessageId,
      pickedUpAt: new Date().toISOString(),
    });
  // One controller for the whole turn, so an interrupt also cancels a pending retry.
  const abortController = new AbortController();
  abortControllers.set(documentId, abortController);
  try {
    // Claim the turn before streaming.
    const claim: ChatSessionAction[] = [];
    if (plan.mode === "retry") claim.push(clearRetryRequest({ _: true }));
    if (plan.openMessageId)
      claim.push(
        finishAssistantMessage({
          messageId: plan.openMessageId,
          finishReason: "restart",
          finishedAt: new Date().toISOString(),
        }),
      );
    // Unanswered messages leading this turn that no turn picked up yet.
    const pickedUpAt = new Date().toISOString();
    for (const m of plan.earlier ?? [])
      if (!m.pickedUpAt)
        claim.push(markMessagePickedUp({ messageId: m.id, pickedUpAt }));
    claim.push(pickUp());
    await execute(claim);

    // Lazy session init: assigns threadId if not set
    const threadId = await ensureSessionInitialized(
      reactor,
      documentId,
      state,
      agent,
      log,
    );

    let prompt: string | AgentContentPart[] = plan.continueFromStart
      ? await loadContinuePrompt(reactor, documentId, userMessageId)
      : await buildUserPrompt(
          documentId,
          plan.userMessage,
          reactor,
          ctx,
          options,
          log,
          plan.earlier,
          plan.earlierTexts,
        );
    if (plan.continueFromStart)
      log?.info(`${TAG} continuing turn for ${documentId} (${plan.mode})`);
    const maxRetries = plan.mode === "resume" ? 0 : STREAM_MAX_RETRIES;
    let continuing = plan.continueFromStart;

    // Stream agent response and write to document. The abort signal lets
    // the interrupt listener stop this turn mid-stream; the underlying
    // agent treats an abort as a clean end, so the partial assistant
    // message is preserved and the session stays ACTIVE.
    for (let attempt = 0; ; attempt++) {
      if (attempt > 0) await execute([pickUp()]);
      try {
        const stream = agent.stream(prompt, {
          threadId,
          abortSignal: abortController.signal,
        });
        await writeAgentStreamToDocument(stream, {
          reactor,
          documentId,
          log,
          userMessageId,
        });
        return;
      } catch (streamErr) {
        if (!(streamErr instanceof RetryableStreamError)) throw streamErr;
        if (abortController.signal.aborted) return;
        if (attempt >= maxRetries) {
          log?.error(
            `${TAG} retryable stream error for ${documentId}, giving up after ${attempt + 1} attempt(s): ${streamErr.message}`,
          );
          const detail =
            maxRetries > 0
              ? `${streamErr.message} (gave up after ${maxRetries} retries)`
              : streamErr.message;
          await dispatchFailTurn(reactor, documentId, {
            userMessageId,
            code: streamErr.code,
            message: describeFailure(streamErr.code, detail),
            retryable: true,
          });
          return;
        }
        // Once output reached the document, continue rather than restart.
        if (streamErr.wroteContent) continuing = true;
        // Rebuilt each time so it lists the tool calls completed so far.
        if (continuing)
          prompt = await loadContinuePrompt(reactor, documentId, userMessageId);
        const delay = streamRetryDelayMs(streamErr, attempt);
        log?.warn(
          `${TAG} retryable stream error for ${documentId} (attempt ${attempt + 1}/${maxRetries}), retrying in ${delay}ms: ${streamErr.message}`,
        );
        await sleep(delay, abortController.signal);
        if (abortController.signal.aborted) return;
      }
    }
  } catch (err) {
    log?.error(`${TAG} agent invocation failed for ${documentId}:`, err);
    // Close the turn with a failure the editor can show; the session stays ACTIVE.
    const reason = err instanceof Error ? err.message : String(err);
    await dispatchFailTurn(reactor, documentId, {
      userMessageId,
      code: "AGENT_ERROR",
      message: describeFailure("AGENT_ERROR", reason),
      retryable: false,
    }).catch((e: unknown) =>
      log?.error(`${TAG} failed to record agent error for ${documentId}:`, e),
    );
  } finally {
    if (abortControllers.get(documentId) === abortController)
      abortControllers.delete(documentId);
  }
}

/**
 * Run a turn, then the follow-up turns for messages it did not consume, until
 * nothing is pending. Releases the document's in-flight slot when done.
 */
async function runTurns(
  documentId: string,
  threadId: string,
  state: ChatSessionState,
  plan: Extract<TurnPlan, { kind: "run" }>,
  reactor: ReactorContext<ChatSessionRegistry>,
  agent: AgentProvider,
  ctx: TriggerContext<
    { pending: number },
    Record<string, unknown>,
    ChatSessionRegistry
  >,
  options: ChatSessionWatchOptions,
  log?: Logger,
): Promise<void> {
  let current = plan;
  let currentState = state;
  for (;;) {
    await runAgentTurn(
      documentId,
      currentState,
      current,
      reactor,
      agent,
      ctx,
      options,
      log,
    );
    let latest: ChatSessionState;
    try {
      latest = (await reactor.client.get<"powerhouse/chat-session">(documentId))
        .state.global;
    } catch (err) {
      log?.error(
        `${TAG} could not read ${documentId} after the turn; queued messages wait for the next change:`,
        err,
      );
      latest = currentState;
    }
    const anchorIndex = latest.messages.findIndex(
      (m) => m.id === current.userMessage.id,
    );
    const noOutput =
      anchorIndex >= 0 &&
      !latest.messages
        .slice(anchorIndex + 1)
        .some((m) => m.role === "ASSISTANT" || m.role === "TOOL");
    if (noOutput)
      stoppedWithoutOutput.add(`${documentId}:${current.userMessage.id}`);
    // No await between draining the queue and releasing the slot.
    const turn = inFlight.get(documentId) ?? {
      threadId,
      userMessageId: current.userMessage.id,
      afterId: current.userMessage.id,
    };
    const next = planFollowUp(latest, turn);
    if (!next) {
      inFlight.delete(documentId);
      endSteerableTurn(threadId);
      return;
    }
    inFlight.set(documentId, {
      threadId,
      userMessageId: next.userMessage.id,
      afterId: next.userMessage.id,
    });
    // The turn that just ended answered nothing: its messages lead the next one, so a reply there covers them.
    const earlier = noOutput
      ? [...(current.earlier ?? []), current.userMessage, ...next.earlier]
      : next.earlier;
    const earlierTexts = noOutput
      ? [...(current.earlierTexts ?? []), ...next.earlierTexts]
      : next.earlierTexts;
    log?.info(
      `${TAG} ${documentId} running the next turn for ${earlier.length + earlierTexts.length + 1} message(s)`,
    );
    for (const m of next.earlier) steeredMessageIds.add(m.id);
    current = {
      kind: "run",
      mode: "new",
      userMessage: next.userMessage,
      continueFromStart: false,
      earlier,
      earlierTexts,
    };
    currentState = latest;
  }
}

type WatchContext = TriggerContext<
  { pending: number },
  Record<string, unknown>,
  ChatSessionRegistry
>;
type ChatSessionDocumentLike = {
  header: { id: string };
  state: { global: ChatSessionState };
};

/** How a Cli's chat-session watcher works in its workdir. */
export interface ChatSessionWatchOptions {
  /** Where files extracted from chat messages are written for the agent:
   * absolute, or relative to the workdir. Default `downloads`. */
  downloadsDir?: string;
}

/**
 * One watcher pass over chat-session documents: start due turns (detached),
 * clear stale retry requests and fail turns that cannot be resumed.
 */
export async function processChatSessionDocs(
  docs: ChatSessionDocumentLike[],
  ctx: WatchContext,
  options: ChatSessionWatchOptions = {},
): Promise<void> {
  const log = ctx.context.log;
  const reactor = await ctx.reactor();
  const agent = await ctx.agent();

  if (!reactor || !agent) {
    log?.info(`${TAG} reactor or agent not available, skipping`);
    return;
  }

  ensureInterruptListener(ctx);
  ensureCreationListener(ctx);

  for (const doc of docs) {
    const documentId = doc.header.id;
    // Held while the agent cannot write it (see initCreatedSession): the user
    // message waits in the document and is answered once writes are possible.
    if (reactor.writes && !reactor.writes.canWrite(doc)) {
      log?.debug?.(
        `${TAG} ${documentId}: the agent cannot write this session yet, leaving it for now`,
      );
      continue;
    }
    const state = doc.state.global;
    const { status, messages } = state;

    // Guard: skip completed/aborted/error sessions
    if (status === "COMPLETED" || status === "ABORTED" || status === "ERROR") {
      // The session is over: nothing can read its queued steers any more.
      if (state.threadId && !inFlight.has(documentId))
        drainSteers(state.threadId);
      continue;
    }

    // Eager init: populate the agent header (name + avatar) as soon as the
    // session exists. Idempotent; the START_SESSION write re-triggers us.
    if (!state.threadId) {
      try {
        await ensureSessionInitialized(reactor, documentId, state, agent, log);
      } catch (err) {
        log?.error(`${TAG} eager session init failed for ${documentId}:`, err);
      }
      continue;
    }

    // Guard: need at least one message
    if (messages.length === 0) continue;

    // Already processing this document (our own writes re-trigger us). New
    // user messages are handed to the running turn as steers.
    const running = inFlight.get(documentId);
    if (running) {
      await steerArrivedMessages(documentId, state, running, reactor, log);
      continue;
    }

    // Guard: a set interruptRequested means the user stopped this turn.
    // The flag tombstones the message as unanswered until the next user
    // message or retry clears it. Skipping writes nothing, so no
    // re-trigger loop.
    if (state.interruptRequested) {
      log?.info(`${TAG} ${documentId} interrupt requested, skipping turn`);
      continue;
    }

    const plan = planTurn(documentId, state);
    if (!plan) continue;

    if (plan.kind === "clear-retry") {
      log?.warn(
        `${TAG} ${documentId} retry requested for an unknown message, clearing`,
      );
      await reactor.client
        .execute<"powerhouse/chat-session">(documentId, "main", [
          clearRetryRequest({ _: true }),
        ])
        .catch((e: unknown) =>
          log?.error(
            `${TAG} failed to clear retry request for ${documentId}:`,
            e,
          ),
        );
      continue;
    }

    if (plan.kind === "fail-interrupted") {
      log?.warn(
        `${TAG} ${documentId} has a turn cut off by a restart that cannot be resumed, failing it`,
      );
      const now = new Date().toISOString();
      try {
        if (plan.openMessageId) {
          await reactor.client.execute<"powerhouse/chat-session">(
            documentId,
            "main",
            [
              finishAssistantMessage({
                messageId: plan.openMessageId,
                finishReason: "restart",
                finishedAt: now,
              }),
            ],
          );
        }
        await dispatchFailTurn(reactor, documentId, {
          userMessageId: plan.userMessageId,
          code: "INTERRUPTED",
          message: describeFailure(
            "INTERRUPTED",
            "the agent restarted before the response finished",
          ),
          retryable: true,
        });
      } catch (e) {
        log?.error(
          `${TAG} failed to record interrupted turn for ${documentId}:`,
          e,
        );
      }
      continue;
    }

    // Dispatch the agent turn as a DETACHED, in-flight-tracked task rather
    // than awaiting it here. The routine drives this trigger from a single
    // serialized poll loop (`await trigger.poll()`), so awaiting a multi-minute
    // agent stream inline blocks EVERY other chat session until it finishes —
    // a second session opened while the first is still building never gets
    // picked up. Detaching keeps the poll loop responsive; independent
    // sessions (distinct threadIds) then stream concurrently. The inFlight
    // guard above plus this add/delete pair dedupe the rapid re-polls that
    // fire while the stream writes back to the document.
    const threadId = state.threadId;
    // A retry re-runs an earlier message: only messages sent from now on count as arriving during it.
    const afterId =
      plan.mode === "retry"
        ? messages[messages.length - 1].id
        : plan.userMessage.id;
    inFlight.set(documentId, {
      threadId,
      userMessageId: plan.userMessage.id,
      afterId,
    });
    beginSteerableTurn(threadId);
    if (plan.mode === "new") {
      // Messages kept by a stop or pause come first, once: in the prompt, not again at step 0.
      const kept = keptSteers(
        messages,
        messages.findIndex((m) => m.id === plan.userMessage.id),
      );
      if (kept.length > 0) {
        const keptIds = new Set(kept.map((m) => m.id));
        const others = drainSteers(threadId).filter((q) => !keptIds.has(q.id));
        for (const q of others) enqueueSteer(threadId, q);
        for (const m of kept)
          stoppedWithoutOutput.delete(`${documentId}:${m.id}`);
        for (const m of kept) steeredMessageIds.add(m.id);
        // The new message stays the anchor (its reply comes last); the kept ones lead with their text and files.
        plan.earlier = [...kept, ...(plan.earlier ?? [])];
      }
    }
    if (plan.mode === "resume") {
      // Steers sent into the cut-off turn that no step read yet: the resumed turn reads them first.
      for (const m of unconsumedSteers(messages, plan.userMessage.id)) {
        steeredMessageIds.add(m.id);
        enqueueSteer(threadId, { id: m.id, text: messageText(m) });
      }
    }
    log?.info(
      `${TAG} dispatching ${plan.mode} turn for ${documentId} (detached; ${inFlight.size} in-flight)`,
    );
    // Fire-and-forget: do NOT await (that would re-serialize the loop). The
    // .catch is defensive — runTurns handles its own errors, so this only
    // guards against an unexpected throw becoming an unhandled rejection.
    const turn: Promise<void> = runTurns(
      documentId,
      threadId,
      state,
      plan,
      reactor,
      agent,
      ctx,
      options,
      log,
    )
      .catch((err) =>
        log?.error(
          `${TAG} unexpected error in detached turn for ${documentId}:`,
          err,
        ),
      )
      .finally(() => {
        // Normally released by runTurns; this covers an unexpected throw.
        if (inFlight.has(documentId)) {
          inFlight.delete(documentId);
          endSteerableTurn(threadId);
        }
        runningTurns.delete(turn);
      });
    runningTurns.add(turn);
  }
}

/** The chat-session watcher, set up for a Cli (e.g. its own downloads
 * folder). */
export function createChatSessionWatchTrigger(
  options: ChatSessionWatchOptions = {},
) {
  return createDocumentChangeTrigger<
    ChatSessionRegistry,
    "powerhouse/chat-session"
  >({
    id: "chat-session-watch",
    documentType: DOCUMENT_TYPE,

    async onChange(docs, ctx) {
      await processChatSessionDocs(docs, ctx, options);
      return null;
    },
  });
}

/** The watcher with the defaults: files extracted to `<workdir>/downloads`. */
export const chatSessionWatchTrigger = createChatSessionWatchTrigger();
