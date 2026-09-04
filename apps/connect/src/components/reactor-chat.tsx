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
  return createReactorMcpProvider({ client, syncManager }).then((provider) => {
    const builtInTools = Object.values(provider.tools).map((tool) => ({
      ...tool,
      inputSchema: tool.inputSchema ?? {},
    }));
    // Packages may contribute their own tools via the `aiTools` export
    // (see DocumentModelLib.aiTools). Built-in tools win on name
    // collisions; duplicates across packages keep the first.
    const taken: Set<string> = new Set(builtInTools.map((tool) => tool.name));
    const packageTools = (ph?.vetraPackageManager?.packages ?? []).flatMap(
      (pkg) =>
        (pkg.aiTools ?? []).filter((tool) => {
          if (taken.has(tool.name)) {
            console.warn(
              `[Connect][AI] Package tool "${tool.name}" shadows an existing tool and was ignored.`,
            );
            return false;
          }
          taken.add(tool.name);
          return true;
        }),
    );
    return [...builtInTools, createSwitchboardSchemaTool(), ...packageTools];
  });
}

/** Connect's bottom-right AI chat FAB, bound to the browser reactor. */
export function ConnectReactorChatFab() {
  return <ReactorChatFab getTools={getReactorTools} />;
}
