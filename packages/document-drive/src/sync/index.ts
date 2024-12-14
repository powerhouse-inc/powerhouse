import { DuplicatedTransmitterError, InitTransmittersError } from "./errors";
import { ListenerManager } from "./listener";
import { FileListenerManagerStorage, IOptions } from "./storage";
import { ITransmitterManager, TransmitterManager } from "./transmitter";
import {
  IListenerManagerStorage,
  ISyncManager,
  Listener,
  ListenerInput,
} from "./types";

export class SyncManager extends ListenerManager implements ISyncManager {
  private transmitterManager: ITransmitterManager = new TransmitterManager();

  async #initTransmitters(): Promise<void> {
    const errors: Error[] = [];
    const listeners = await this.getListeners();

    // initialize transmitters for all listeners
    for (const listener of listeners) {
      try {
        this.transmitterManager.createTransmitter(listener);
      } catch (error) {
        // ignores error if it was due to the transmitter already being initialized
        if (error instanceof DuplicatedTransmitterError) {
          continue;
        }
        errors.push(error as Error);
      }
    }

    if (errors.length) {
      throw new InitTransmittersError(errors);
    }
  }
  async setStorage(storage?: IListenerManagerStorage) {
    await super.setStorage(storage);
    return this.#initTransmitters();
  }

  async addListener(input: ListenerInput): Promise<Listener> {
    // Add the listener using the base class
    const listener = await super.addListener(input);

    try {
      // Create the transmitter for the added listener
      this.transmitterManager.createTransmitter(listener);
    } catch (error) {
      if (!(error instanceof DuplicatedTransmitterError)) {
        // if initialization failed then reverts adding the listener
        await super.removeListener(listener.id);
        throw error;
      }
    }

    return listener;
  }

  async removeListener(listenerId: string): Promise<boolean> {
    const removed = await super.removeListener(listenerId);
    this.transmitterManager.deleteTransmitter(listenerId);
    return removed;
  }
}

// Simple in-memory listener manager that doesn't persist state
export class MemorySyncManager extends SyncManager {
  constructor() {
    super(undefined);
  }
}

export class FileSyncManager extends SyncManager {
  constructor(filePath: string, options?: IOptions) {
    super(new FileListenerManagerStorage(filePath, options));
  }
}
