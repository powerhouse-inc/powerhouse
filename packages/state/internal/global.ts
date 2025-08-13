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
  type ProcessorManagerUpdatedEvent,
  type ReactorUpdatedEvent,
  type SelectedDriveIdUpdatedEvent,
  type SelectedNodeIdUpdatedEvent,
  type SetDocumentsEvent,
  type SetDrivesEvent,
  type SetProcessorManagerEvent,
  type SetReactorEvent,
  type SetSelectedDriveIdEvent,
  type SetSelectedNodeIdEvent,
  type SetVetraPackagesEvent,
  type VetraPackagesUpdatedEvent,
} from "./events.js";

declare global {
  interface Window {
    reactor?: IDocumentDriveServer | undefined;
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
