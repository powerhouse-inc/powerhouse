import { Renown } from "./common.js";
import { NodeEventEmitter } from "./event/event.node.js";
import { NodeStorage } from "./storage/storage.node.js";
import { RenownEvents, RenownStorageMap } from "./types.js";

export function initRenown(
  connectId: string,
  filePath: string,
  namespace: string,
  baseUrl?: string,
) {
  const storage = new NodeStorage<RenownStorageMap>(filePath, namespace);
  return new Renown(
    storage,
    new NodeEventEmitter<RenownEvents>(),
    connectId,
    baseUrl,
  );
}
