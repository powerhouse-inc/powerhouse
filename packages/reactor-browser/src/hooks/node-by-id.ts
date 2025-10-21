import type { Node } from "document-drive";
import { useNodesInSelectedDrive } from "./items-in-selected-drive.js";

/** Returns a node in the selected drive by id. */
export function useNodeById(id: string | null | undefined): Node | undefined {
  const nodes = useNodesInSelectedDrive();
  return nodes?.find((n) => n.id === id);
}
