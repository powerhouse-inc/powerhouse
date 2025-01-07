import { Renown } from "./common";
import { RenownEvents, RenownStorageMap } from "./types";
import { BrowserEventEmitter } from "./event/event.browser";
import { BrowserStorage } from "./storage/storage.browser";

export function initRenown(connectId: string, basename: string | undefined) {
  return new Renown(
    new BrowserStorage<RenownStorageMap>("renown", basename),
    new BrowserEventEmitter<RenownEvents>(),
    connectId,
  );
}
