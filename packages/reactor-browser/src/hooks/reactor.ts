import type { IDocumentDriveServer } from "document-drive";
import { makePHEventFunctions } from "../events/make-ph-event-functions.js";

export const {
  useValue: useReactor,
  setValue: setReactor,
  addEventHandler: addReactorEventHandler,
} = makePHEventFunctions<IDocumentDriveServer>("reactor");
