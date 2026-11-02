import type { Node } from "@powerhousedao/shared/document-drive";
import { useDriveNode } from "./drive-nodes.js";
import { useSelectedDriveId } from "./selected-drive.js";

/** Returns a node in the selected drive by id. */
export function useNodeById(id: string | null | undefined): Node | undefined {
  return useDriveNode(useSelectedDriveId(), id);
}
