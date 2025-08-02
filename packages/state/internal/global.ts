import { type IDocumentDriveServer } from "document-drive";
import { type VetraPackage } from "../types.js";
import {
  type SetDriveEvent,
  type SetNodeEvent,
  type UpdateVetraPackagesEvent,
} from "./events.js";

declare global {
  interface Window {
    reactor?: IDocumentDriveServer | undefined;
    vetraPackages?: VetraPackage[] | undefined;
  }

  interface WindowEventMap {
    "ph:setDrive": SetDriveEvent;
    "ph:setNode": SetNodeEvent;
    "ph:updateVetraPackages": UpdateVetraPackagesEvent;
  }
}
