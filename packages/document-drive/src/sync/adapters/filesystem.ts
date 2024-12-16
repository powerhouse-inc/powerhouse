// SyncManager that persists state to a file

import { SyncManager } from "../base";
import { ListenerRegistry } from "../listener/registry";
import { FileListenerStorage, IOptions } from "../listener/storage";

export class FileSyncManager extends SyncManager {
  constructor(filePath: string, options?: IOptions) {
    const listenerStorage = new FileListenerStorage(filePath, options);

    super({ listenerRegistry: new ListenerRegistry(listenerStorage) });
  }
}
