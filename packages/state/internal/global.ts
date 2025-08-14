import { type User } from "@renown/sdk";
import {
  type DocumentDriveDocument,
  type IDocumentDriveServer,
} from "document-drive";
import { type ProcessorManager } from "document-drive/processors/processor-manager";
import { type PHDocument } from "document-model";
import { type VetraPackage } from "../types.js";
import {
  type DocumentsUpdatedEvent,
  type DrivesUpdatedEvent,
  type IRenown,
  type ProcessorManagerUpdatedEvent,
  type ReactorUpdatedEvent,
  type RenownUpdatedEvent,
  type SelectedDriveIdUpdatedEvent,
  type SelectedNodeIdUpdatedEvent,
  type SetDocumentsEvent,
  type SetDrivesEvent,
  type SetProcessorManagerEvent,
  type SetReactorEvent,
  type SetRenownEvent,
  type SetSelectedDriveIdEvent,
  type SetSelectedNodeIdEvent,
  type SetUserEvent,
  type SetVetraPackagesEvent,
  type UserUpdatedEvent,
  type VetraPackagesUpdatedEvent,
} from "./events.js";

declare global {
  interface Window {
    reactor?: IDocumentDriveServer | undefined;
    renown?: IRenown | undefined;
    user?: User | undefined;
    vetraPackages?: VetraPackage[] | undefined;
    phProcessorManager?: ProcessorManager | undefined;
    phDrives?: DocumentDriveDocument[] | undefined;
    phDocuments?: PHDocument[] | undefined;
    phSelectedDriveId?: string | undefined;
    phSelectedNodeId?: string | undefined;
  }

  interface WindowEventMap {
    "ph:setReactor": SetReactorEvent;
    "ph:reactorUpdated": ReactorUpdatedEvent;
    "ph:setRenown": SetRenownEvent;
    "ph:renownUpdated": RenownUpdatedEvent;
    "ph:setUser": SetUserEvent;
    "ph:userUpdated": UserUpdatedEvent;
    "ph:setProcessorManager": SetProcessorManagerEvent;
    "ph:processorManagerUpdated": ProcessorManagerUpdatedEvent;
    "ph:setDrives": SetDrivesEvent;
    "ph:drivesUpdated": DrivesUpdatedEvent;
    "ph:setDocuments": SetDocumentsEvent;
    "ph:documentsUpdated": DocumentsUpdatedEvent;
    "ph:setVetraPackages": SetVetraPackagesEvent;
    "ph:vetraPackagesUpdated": VetraPackagesUpdatedEvent;
    "ph:setSelectedDriveId": SetSelectedDriveIdEvent;
    "ph:selectedDriveIdUpdated": SelectedDriveIdUpdatedEvent;
    "ph:setSelectedNodeId": SetSelectedNodeIdEvent;
    "ph:selectedNodeIdUpdated": SelectedNodeIdUpdatedEvent;
  }
}
