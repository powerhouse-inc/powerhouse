import type { IAttachmentService } from "@powerhousedao/reactor-attachments/client";
import type {
  AddPHGlobalEventHandler,
  SetPHGlobalValue,
  UsePHGlobalValue,
} from "@powerhousedao/reactor-browser";
import { makePHEventFunctions } from "./make-ph-event-functions.js";

const attachmentServiceEventFunctions =
  makePHEventFunctions("attachmentService");

/** Returns the attachment service from window.ph */
export const useAttachmentService: UsePHGlobalValue<IAttachmentService> =
  attachmentServiceEventFunctions.useValue;

/** Sets the attachment service on window.ph */
export const setAttachmentService: SetPHGlobalValue<IAttachmentService> =
  attachmentServiceEventFunctions.setValue;

/** Registers the attachmentService window event handler */
export const addAttachmentServiceEventHandler: AddPHGlobalEventHandler =
  attachmentServiceEventFunctions.addEventHandler;
