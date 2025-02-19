import { Renown } from "./common.js";
import { RenownEvents, RenownStorageMap } from "./types.js";
import { BrowserEventEmitter } from "./event/event.browser.js";
import { BrowserStorage } from "./storage/storage.browser.js";

export function initRenown(
  connectId: string,
  basename: string | undefined,
  baseUrl?: string,
) {
  return new Renown(
    new BrowserStorage<RenownStorageMap>("renown", basename),
    new BrowserEventEmitter<RenownEvents>(),
    connectId,
    baseUrl,
  );
}
