import {
  addAllowListEventHandler,
  addAnalyticsDatabaseNameEventHandler,
  addIsSearchBarEnabledEventHandler,
} from "../hooks/config.js";
import {
  addConnectCryptoEventHandler,
  addDidEventHandler,
} from "../hooks/crypto.js";
import { addDocumentsEventHandler } from "../hooks/documents.js";
import { addDrivesEventHandler } from "../hooks/drives.js";
import { addModalEventHandler } from "../hooks/modals.js";
import { addProcessorManagerEventHandler } from "../hooks/processor-manager.js";
import { addReactorEventHandler } from "../hooks/reactor.js";
import { addRenownEventHandler } from "../hooks/renown.js";
import { addSelectedDriveIdEventHandler } from "./drives.js";
import { addSelectedNodeIdEventHandler } from "./nodes.js";
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
