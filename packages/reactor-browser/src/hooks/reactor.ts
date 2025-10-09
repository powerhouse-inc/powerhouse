import type { IDocumentDriveServer } from "document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";
import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "./types.js";

const eventFunctions = makePHEventFunctions("reactor");

export const useReactor: UsePHGlobalValue<IDocumentDriveServer> =
  eventFunctions.useValue;

export const setReactor: SetPHGlobalValue<IDocumentDriveServer> =
  eventFunctions.setValue;

export const addReactorEventHandler: AddPHGlobalEventHandler =
  eventFunctions.addEventHandler;

export function useSupportedDocumentTypes() {
  const reactor = useReactor();
  return reactor
    ?.getDocumentModelModules()
    .map((module) => module.documentModel.global.id);
}
