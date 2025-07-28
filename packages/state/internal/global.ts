import { type IDocumentDriveServer } from "document-drive";
import {
  type SetDriveEvent,
  type SetNodeEvent,
  type UpdatePHPackagesEvent,
} from "./events.js";
import { type PHPackage } from "./types.js";

declare global {
  interface Window {
    reactor?: IDocumentDriveServer | undefined;
    phPackages?: PHPackage[] | undefined;
  }

  interface WindowEventMap {
    "ph:setDrive": SetDriveEvent;
    "ph:setNode": SetNodeEvent;
    "ph:updatePHPackages": UpdatePHPackagesEvent;
  }
}
