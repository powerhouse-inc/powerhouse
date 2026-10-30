import { ReactorChatFab } from "@powerhousedao/reactor-browser/ai";
import { getConnectReactorTools } from "../ai-tools.js";

/** Connect's bottom-right AI chat FAB, bound to the browser reactor. */
export function ConnectReactorChatFab() {
  return <ReactorChatFab getTools={getConnectReactorTools} />;
}
