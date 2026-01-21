import { Renown } from "./common.js";
import { NodeEventEmitter } from "./event/event.node.js";
import { NodeStorage } from "./storage/storage.node.js";
import type { RenownEvents, RenownStorageMap } from "./types.js";

export class NodeRenownEventEmitter extends NodeEventEmitter<RenownEvents> {}

export class NodeRenownStorage extends NodeStorage<RenownStorageMap> {}

export function initRenown(
  connectId: string,
  filePath: string,
  namespace: string,
  baseUrl?: string,
) {
  const storage = new NodeRenownStorage(filePath, namespace);
  return new Renown(storage, new NodeRenownEventEmitter(), connectId, baseUrl);
}
