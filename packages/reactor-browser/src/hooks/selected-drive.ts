import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "document-drive";
import { resolveUrlPathname } from "../utils/url.js";
import { useDispatch } from "./dispatch.js";
import { useDrives } from "./drives.js";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import { setSelectedNode } from "./selected-node.js";

const selectedDriveIdEventFunctions = makePHEventFunctions("selectedDriveId");

/** Returns the selected drive id */
export const useSelectedDriveId = selectedDriveIdEventFunctions.useValue;

/** Sets the selected drive id */
const setSelectedDriveId = selectedDriveIdEventFunctions.setValue;

/** Adds an event handler for the selected drive id */
export const addSelectedDriveIdEventHandler =
  selectedDriveIdEventFunctions.addEventHandler;

/** Returns the selected drive */
export function useSelectedDrive() {
  const drive = useSelectedDriveSafe();
  if (!drive[0]) {
    throw new Error(
      "There is no drive selected. Did you mean to call 'useSelectedDriveSafe'?",
    );
  }

  return drive;
}

/** Returns the selected drive, or undefined if no drive is selected */
export function useSelectedDriveSafe() {
  const selectedDriveId = useSelectedDriveId();
  const drives = useDrives();
  const selectedDrive = drives?.find(
    (drive) => drive.header.id === selectedDriveId,
  );

  const [drive, dispatch] = useDispatch(selectedDrive);
  if (!selectedDrive) {
    return [undefined, undefined] as const;
  }
  return [drive, dispatch] as [
    DocumentDriveDocument,
    DocumentDispatch<DocumentDriveAction>,
  ];
}

export function setSelectedDrive(
  driveOrDriveSlug: string | DocumentDriveDocument | undefined,
) {
  const driveSlug =
    typeof driveOrDriveSlug === "string"
      ? driveOrDriveSlug
      : driveOrDriveSlug?.header.slug;
  setSelectedNode(undefined);
  setSelectedDriveId(driveSlug);

  // Find the drive by slug to get its actual ID
  const drive = window.ph?.drives?.find((d) => d.header.slug === driveSlug);
  const driveId = drive?.header.id;
  if (!driveId) {
    window.history.pushState(null, "", resolveUrlPathname("/"));
    return;
  }
  window.history.pushState(null, "", resolveUrlPathname(`/d/${driveSlug}`));
}
