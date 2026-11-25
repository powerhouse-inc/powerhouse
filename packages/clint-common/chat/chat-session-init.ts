// Lazy session initializer for chat-session documents: assigns a threadId via
// START_SESSION, then applies the agent avatar best-effort, off the critical path.
import { randomUUID } from "node:crypto";
import type {
  ReactorContext,
  AgentProvider,
  AttachmentRef,
  Logger,
  DocumentRegistry,
  RegistryEntry,
} from "@powerhousedao/clint";
import {
  startSession,
  setAgentImage,
} from "@powerhousedao/clint-common/document-models/chat-session";
import type {
  ChatSessionState,
  ChatSessionPHState,
  ChatSessionAction,
} from "@powerhousedao/clint-common/document-models/chat-session";

const TAG = "[chat-session-init]";

/** Bound the avatar fetch + upload so a hung remote never stalls forever. */
const AVATAR_TIMEOUT_MS = 10_000;

/** Minimum registry constraint: must include chat-session. */
export type ChatSessionRegistry = DocumentRegistry & {
  "powerhouse/chat-session": RegistryEntry<
    ChatSessionPHState,
    ChatSessionAction
  >;
};

type AttachmentService = NonNullable<
  ReactorContext<ChatSessionRegistry>["attachments"]
>;

// Per-agent avatar upload, memoized: bytes are identical across sessions, so
// upload once and reuse the ref. Failures aren't cached, so they retry.
const avatarRefCache = new Map<string, Promise<AttachmentRef | null>>();

async function resolveImageSource(
  image: string,
  signal?: AbortSignal,
): Promise<{ mimeType: string; stream: ReadableStream<Uint8Array> }> {
  const dataUriMatch = image.match(/^data:([^;]+);base64,/);
  if (dataUriMatch) {
    const mimeType = dataUriMatch[1];
    const base64Data = image.slice(dataUriMatch[0].length);
    const bytes = Buffer.from(base64Data, "base64");
    const stream = new Blob([bytes]).stream() as ReadableStream<Uint8Array>;
    return { mimeType, stream };
  }
  const res = await fetch(image, { signal });
  if (!res.ok)
    throw new Error(
      `Failed to fetch agent image: ${res.status} ${res.statusText}`,
    );
  if (!res.body) throw new Error(`Agent image response has no body: ${image}`);
  const mimeType =
    res.headers.get("content-type") ?? "application/octet-stream";
  return { mimeType, stream: res.body };
}

// Upload avatar bytes, returning the ref. reserve()/send() take no signal, so
// the timeout aborts the fetch and abandons the wait on the rest.
async function uploadAvatar(
  service: AttachmentService,
  image: string,
  agentId: string,
): Promise<AttachmentRef> {
  const signal = AbortSignal.timeout(AVATAR_TIMEOUT_MS);
  const work = (async () => {
    const { mimeType, stream } = await resolveImageSource(image, signal);
    const upload = await service.reserve({
      mimeType,
      fileName: `${agentId}-avatar`,
    });
    const { ref } = await upload.send(stream);
    return ref;
  })();
  const timeout = new Promise<never>((_, reject) => {
    signal.addEventListener(
      "abort",
      () =>
        reject(
          new Error(
            `agent image upload timed out after ${AVATAR_TIMEOUT_MS}ms`,
          ),
        ),
      { once: true },
    );
  });
  return Promise.race([work, timeout]);
}

function resolveAvatarRef(
  service: AttachmentService,
  image: string,
  agentId: string,
  log?: Logger,
): Promise<AttachmentRef | null> {
  let cached = avatarRefCache.get(agentId);
  if (!cached) {
    cached = uploadAvatar(service, image, agentId).catch((err) => {
      log?.warn(
        `${TAG} agent image upload failed, continuing without avatar:`,
        err,
      );
      avatarRefCache.delete(agentId);
      return null;
    });
    avatarRefCache.set(agentId, cached);
  }
  return cached;
}

// Resolve the (memoized) avatar ref and write it to this session. Best-effort:
// failures are logged and swallowed so the turn is never affected.
async function applyAgentAvatar<R extends ChatSessionRegistry>(
  reactor: ReactorContext<R>,
  documentId: string,
  agent: AgentProvider,
  log?: Logger,
): Promise<void> {
  if (!agent.image) return;
  const service = reactor.attachments;
  if (!service) {
    log?.warn(`${TAG} no attachment service wired; skipping agent image`);
    return;
  }
  try {
    const ref = await resolveAvatarRef(service, agent.image, agent.id, log);
    if (!ref) return;
    await reactor.client.execute<"powerhouse/chat-session">(
      documentId,
      "main",
      [setAgentImage({ attachment: ref })],
    );
  } catch (err) {
    log?.warn(`${TAG} failed to set agent image for ${documentId}:`, err);
  }
}

// Dedup concurrent init calls for one document (creation listener vs watcher).
const sessionInitInFlight = new Map<string, Promise<string>>();

export async function ensureSessionInitialized<R extends ChatSessionRegistry>(
  reactor: ReactorContext<R>,
  documentId: string,
  state: ChatSessionState,
  agent: AgentProvider,
  log?: Logger,
): Promise<string> {
  if (state.threadId) return state.threadId;
  const existing = sessionInitInFlight.get(documentId);
  if (existing) return existing;
  const pending = startSessionOnce(reactor, documentId, agent, log);
  sessionInitInFlight.set(documentId, pending);
  try {
    return await pending;
  } finally {
    sessionInitInFlight.delete(documentId);
  }
}

async function startSessionOnce<R extends ChatSessionRegistry>(
  reactor: ReactorContext<R>,
  documentId: string,
  agent: AgentProvider,
  log?: Logger,
): Promise<string> {
  // Re-read fresh: a concurrent path may have started this session already.
  const current =
    await reactor.client.get<"powerhouse/chat-session">(documentId);
  const existingThreadId = current.state.global.threadId;
  if (existingThreadId) return existingThreadId;

  const threadId = randomUUID();
  const now = new Date().toISOString();

  log?.info(
    `${TAG} initializing session ${documentId} with threadId ${threadId}`,
  );
  log?.info(
    `${TAG} agent.description=${agent.description ? "set" : "unset"}, agent.image=${agent.image ? `set (${agent.image.length} chars)` : "unset"}`,
  );

  // Start the session first so threadId persists and the agent can run; the
  // cosmetic avatar must not gate this.
  await reactor.client.execute<"powerhouse/chat-session">(documentId, "main", [
    startSession({
      threadId,
      resourceId: documentId,
      startedAt: now,
      agent: {
        id: agent.id,
        name: agent.name ?? agent.id,
        description: agent.description,
      },
    }),
  ]);

  // Avatar off the critical path: fire-and-forget with self-contained error
  // handling, so a slow or failing upload never delays or breaks the turn.
  if (agent.image) void applyAgentAvatar(reactor, documentId, agent, log);

  return threadId;
}
