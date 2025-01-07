import { Renown } from "./common";
import { NodeEventEmitter } from "./event/event.node";
import { NodeStorage } from "./storage/storage.node";
import { RenownEvents, RenownStorageMap } from "./types";

export function initRenown(
  connectId: string,
  filePath: string,
  namespace: string,
) {
  const storage = new NodeStorage<RenownStorageMap>(filePath, namespace);
  return new Renown(storage, new NodeEventEmitter<RenownEvents>(), connectId);
}
