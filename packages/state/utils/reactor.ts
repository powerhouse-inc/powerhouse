import {
  dispatchSetDocumentsEvent,
  dispatchSetDrivesEvent,
} from "../internal/events.js";
import { type Reactor } from "../internal/types.js";
import { getDocuments, getDrives } from "./drives.js";

export async function refreshReactorData(reactor: Reactor | undefined) {
  if (!reactor) return;
  const drives = await getDrives(reactor);
  const documents = await getDocuments(reactor);
  dispatchSetDrivesEvent(drives);
  dispatchSetDocumentsEvent(documents);
}
