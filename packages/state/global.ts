import { type IDocumentDriveServer } from "document-drive";
import { type SetDriveEvent, type SetNodeEvent } from "./events.js";

declare global {
  interface Window {
    reactor?: IDocumentDriveServer | undefined;
  }

  interface WindowEventMap {
    "ph:setDrive": SetDriveEvent;
    "ph:setNode": SetNodeEvent;
  }
}
