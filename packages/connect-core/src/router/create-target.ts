import { useDrives } from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { useState } from "react";
import { useDriveRouteData } from "./route-data.js";

export type CreateDocumentTarget = {
  /** The drive the document goes in; undefined until one is picked. */
  drive: DocumentDriveDocument | undefined;
  /** The drives to pick from, or undefined when the drive is given. */
  choices: DocumentDriveDocument[] | undefined;
  pick: (driveId: string) => void;
  /** Whether it is the open drive, whose open folder the document goes in. */
  isOpenDrive: boolean;
};

/** Where a new document goes: the modal's `driveId`, else the open drive, else
 * one the user picks, the only drive preselected. */
export function useCreateDocumentTarget(
  driveId: string | undefined,
): CreateDocumentTarget {
  const { drive: openDrive } = useDriveRouteData();
  const drives = useDrives();
  const [picked, setPicked] = useState<string>();
  const given = driveId ?? openDrive?.header.id;
  const only = drives?.length === 1 ? drives[0].header.id : undefined;
  const id = given ?? picked ?? only;
  return {
    drive: drives?.find((d) => d.header.id === id),
    choices: given ? undefined : (drives ?? []),
    pick: setPicked,
    isOpenDrive: !!openDrive && openDrive.header.id === id,
  };
}
