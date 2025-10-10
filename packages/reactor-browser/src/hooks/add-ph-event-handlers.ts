import { phGlobalConfigEventHandlerRegisterFunctions } from "./config.js";
import { addConnectCryptoEventHandler, addDidEventHandler } from "./crypto.js";
import {
  addDocumentsEventHandler,
  addSelectedTimelineRevisionEventHandler,
} from "./documents.js";
import {
  addDrivesEventHandler,
  addSelectedDriveIdEventHandler,
} from "./drives.js";
import { addModalEventHandler } from "./modals.js";
import { addSelectedNodeIdEventHandler } from "./nodes.js";
import { addProcessorManagerEventHandler } from "./processor-manager.js";
import { addReactorEventHandler } from "./reactor.js";
import { addRenownEventHandler } from "./renown.js";
import { addLoginStatusEventHandler, addUserEventHandler } from "./user.js";
import { addVetraPackagesEventHandler } from "./vetra-packages.js";
export function addPHEventHandlers() {
  for (const fn of Object.values(phGlobalConfigEventHandlerRegisterFunctions)) {
    fn();
  }

  addReactorEventHandler();
  addModalEventHandler();
  addConnectCryptoEventHandler();
  addDidEventHandler();
  addRenownEventHandler();
  addLoginStatusEventHandler();
  addUserEventHandler();
  addProcessorManagerEventHandler();
  addDrivesEventHandler();
  addDocumentsEventHandler();
  addSelectedDriveIdEventHandler();
  addSelectedNodeIdEventHandler();
  addVetraPackagesEventHandler();
  addSelectedTimelineRevisionEventHandler();
}
