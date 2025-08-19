import { addAppConfigEventHandler } from "./config.js";
import { addConnectCryptoEventHandler, addDidEventHandler } from "./crypto.js";
import { addDocumentsEventHandler } from "./documents.js";
import {
  addDrivesEventHandler,
  addSelectedDriveIdEventHandler,
} from "./drives.js";
import { addSelectedNodeIdEventHandler } from "./nodes.js";
import { addProcessorManagerEventHandler } from "./processors.js";
import { addReactorEventHandler } from "./reactor.js";
import { addRenownEventHandler } from "./renown.js";
import { addLoginStatusEventHandler, addUserEventHandler } from "./user.js";
import { addVetraPackagesEventHandler } from "./vetra-packages.js";

export function addPHEventHandlers() {
  addReactorEventHandler();
  addConnectCryptoEventHandler();
  addDidEventHandler();
  addRenownEventHandler();
  addLoginStatusEventHandler();
  addUserEventHandler();
  addAppConfigEventHandler();
  addProcessorManagerEventHandler();
  addDrivesEventHandler();
  addDocumentsEventHandler();
  addSelectedDriveIdEventHandler();
  addSelectedNodeIdEventHandler();
  addVetraPackagesEventHandler();
}
