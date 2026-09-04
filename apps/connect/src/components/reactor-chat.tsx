import { createReactorMcpProvider } from "@powerhousedao/reactor-mcp/tools";
import type { IReactorClient } from "@powerhousedao/reactor";
import {
  ReactorChatFab,
  createSwitchboardSchemaTool,
  type AiToolDescriptor,
} from "@powerhousedao/reactor-browser/ai";

/**
 * Resolves the reactor tool descriptors for the chat agent from the
 * browser's live reactor client. Built lazily at send time so the reactor
 * (and its SharedWorker) do not need to be ready at render time.
 */
function getReactorTools(): Promise<AiToolDescriptor[]> {
  const ph = window.ph;
  // The typed global is the minimal browser-client contract; the runtime
  // client (in-process or worker-backed) is always the full IReactorClient.
  const client = ph?.reactorClient as IReactorClient | undefined;
  if (!client) {
    return Promise.reject(
      new Error("The reactor client is not available yet. Try again shortly."),
    );
  }
  const syncManager =
    ph?.reactorClientModule?.reactorModule?.syncModule?.syncManager;
  return createReactorMcpProvider({ client, syncManager }).then((provider) => [
    ...Object.values(provider.tools).map((tool) => ({
      ...tool,
      inputSchema: tool.inputSchema ?? {},
    })),
    createSwitchboardSchemaTool(),
  ]);
}

/** Connect's bottom-right AI chat FAB, bound to the browser reactor. */
export function ConnectReactorChatFab() {
  return <ReactorChatFab getTools={getReactorTools} />;
}
