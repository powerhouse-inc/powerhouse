/**
 * Test doubles for the chat bridge and watcher: an in-memory reactor client
 * that applies dispatched actions with the real chat-session reducer, and a
 * scripted agent whose streams are generated per call.
 */
import type {
  AgentProvider,
  AgentPromptInput,
  AgentStreamOptions,
  ReactorContext,
  StreamChunk,
  TriggerContext,
} from "@powerhousedao/clint";
import {
  addUserMessage,
  reducer,
  startSession,
  utils,
} from "document-models/chat-session/v1";
import type {
  ChatSessionAction,
  ChatSessionDocument,
} from "document-models/chat-session/v1";
import type { ChatSessionRegistry } from "../chat-session-init.js";

export const T0 = "2026-01-01T00:00:00.000Z";
export const T1 = "2026-01-01T00:00:01.000Z";

export interface FakeReactor {
  reactor: ReactorContext<ChatSessionRegistry>;
  /** Every action dispatched through `client.execute`, in order. */
  dispatched: ChatSessionAction[];
  doc: () => ChatSessionDocument;
  /** Apply actions directly (as another client would) without recording them. */
  apply: (...actions: ChatSessionAction[]) => void;
  /** Operation errors recorded by the reducer (should stay empty). */
  errors: () => string[];
}

export function makeFakeReactor(initial: ChatSessionDocument): FakeReactor {
  let current = initial;
  const dispatched: ChatSessionAction[] = [];
  const reactor = {
    client: {
      execute: (
        _documentId: string,
        _branch: string,
        actions: ChatSessionAction[],
      ) => {
        for (const action of actions) {
          dispatched.push(action);
          current = reducer(current, action);
        }
        return Promise.resolve(current);
      },
      get: () => Promise.resolve(current),
    },
  } as unknown as ReactorContext<ChatSessionRegistry>;
  return {
    reactor,
    dispatched,
    doc: () => current,
    apply: (...actions) => {
      for (const action of actions) current = reducer(current, action);
    },
    errors: () =>
      (current.operations.global ?? [])
        .map((op) => op.error)
        .filter((e): e is string => typeof e === "string" && e.length > 0),
  };
}

/** A started session (threadId `thread-1`) with one USER message `u1`. */
export function sessionWithUserMessage(text = "hello"): ChatSessionDocument {
  let doc = utils.createDocument();
  doc = reducer(
    doc,
    startSession({
      threadId: "thread-1",
      resourceId: "r1",
      agent: { id: "agent", name: "Agent" },
      startedAt: T0,
    }),
  );
  doc = reducer(
    doc,
    addUserMessage({
      id: "u1",
      content: [{ id: "u1-p1", type: "TEXT", text }],
      createdAt: T1,
    }),
  );
  return doc;
}

export interface AgentCall {
  prompt: AgentPromptInput;
  opts?: AgentStreamOptions;
}

/**
 * Agent whose n-th stream call is produced by `script(callIndex, call)`.
 * Calls beyond the script length reuse the last entry.
 */
export function makeFakeAgent(
  script: Array<(call: AgentCall) => AsyncGenerator<StreamChunk>>,
): AgentProvider & { calls: AgentCall[] } {
  const calls: AgentCall[] = [];
  return {
    id: "agent",
    name: "Agent",
    calls,
    stream(prompt, opts) {
      const call = { prompt, opts };
      calls.push(call);
      const step = script[Math.min(calls.length - 1, script.length - 1)];
      return step(call);
    },
  };
}

export async function* chunks(
  ...list: StreamChunk[]
): AsyncGenerator<StreamChunk> {
  for (const chunk of list) yield chunk;
}

export function makeTriggerContext(
  fake: FakeReactor,
  agent: AgentProvider,
): TriggerContext<
  { pending: number },
  Record<string, unknown>,
  ChatSessionRegistry
> {
  return {
    context: { workdir: "/tmp/clint-chat-test" },
    commandContext: {},
    state: { pending: 0 },
    reactor: () => Promise.resolve(fake.reactor),
    agent: () => Promise.resolve(agent),
  } as unknown as TriggerContext<
    { pending: number },
    Record<string, unknown>,
    ChatSessionRegistry
  >;
}

export function actionTypes(actions: ChatSessionAction[]): string[] {
  return actions.map((a) => a.type);
}
