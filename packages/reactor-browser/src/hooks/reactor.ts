import type { IDocumentDriveServer } from "document-drive";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

export const {
  useValue: useReactor,
  setValue: setReactor,
  addEventHandler: addReactorEventHandler,
} = makePHEventFunctions<IDocumentDriveServer>("reactor");

export function useSupportedDocumentTypes() {
  const reactor = useReactor();
  return reactor
    ?.getDocumentModelModules()
    .map((module) => module.documentModel.global.id);
}
