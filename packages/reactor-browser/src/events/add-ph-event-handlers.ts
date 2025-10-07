import {
  addAllowListEventHandler,
  addAnalyticsDatabaseNameEventHandler,
  addIsSearchBarEnabledEventHandler,
} from "../hooks/config.js";
import { addConnectCryptoEventHandler, addDidEventHandler } from "./crypto.js";
import { addDocumentsEventHandler } from "./documents.js";
import {
  addDrivesEventHandler,
  addSelectedDriveIdEventHandler,
} from "./drives.js";
import { addModalEventHandler } from "./modals.js";
import { addSelectedNodeIdEventHandler } from "./nodes.js";
import { addProcessorManagerEventHandler } from "./processors.js";
import { addReactorEventHandler } from "./reactor.js";
import { addRenownEventHandler } from "./renown.js";
import { addLoginStatusEventHandler, addUserEventHandler } from "./user.js";
import { addVetraPackagesEventHandler } from "./vetra-packages.js";
export function addPHEventHandlers() {
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
  addAnalyticsDatabaseNameEventHandler();
  addAllowListEventHandler();
  addIsSearchBarEnabledEventHandler();
}
