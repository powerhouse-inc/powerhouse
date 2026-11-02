import { getPHStore } from "../hooks/ph-store.js";
import type { AiToolDescriptor } from "./types.js";

/**
 * The tools of the Connect this page runs in: the reactor's own plus every
 * package's `aiTools`. For a page a package adds to Connect, which can't import
 * Connect itself. Pass it to `useReactorChat`.
 */
export function getHostAiTools(): Promise<AiToolDescriptor[]> {
  const tools = getPHStore()?.aiTools;
  return tools
    ? tools()
    : Promise.reject(new Error("This app offers no tools to the assistant."));
}
