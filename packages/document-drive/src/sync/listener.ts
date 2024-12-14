import { generateId } from "document-model/utils";
import {
  IListenerManager,
  IListenerManagerStorage,
  Listener,
  ListenerInput,
  StatefulListener,
} from "./types";
import { buildListenerFilter } from "./utils";
import { DuplicatedListenerIdError } from "./errors";
import { ObservableMap } from "../utils/event-emitter";
import { logger } from "../utils/logger";

export class ListenerManager implements IListenerManager {
  protected listeners = new ObservableMap<Listener["id"], StatefulListener>();
  protected storage: IListenerManagerStorage | undefined = undefined;

  constructor(storage?: IListenerManagerStorage) {
    this.setStorage(storage)?.catch((error: unknown) => logger.error(error));
  }

  getListener(listenerId: string): Promise<Listener | undefined> {
    const listener = this.listeners.get(listenerId);
    return Promise.resolve(listener);
  }

  getListeners(): Promise<Listener[]> {
    return Promise.resolve([...this.listeners.values()]);
  }

  setStorage(storage?: IListenerManagerStorage) {
    this.storage = storage;
    if (storage) {
      return this.#loadStorage();
    }
  }

  async #loadStorage() {
    if (!this.storage) {
      return;
    }

    this.listeners.on("add", (_, value) =>
      this.storage
        ?.addListener(value, Object.fromEntries(this.listeners))
        .catch((error: unknown) => logger.error(error)),
    );

    this.listeners.on("update", (_, value) =>
      this.storage
        ?.updateListener(value, Object.fromEntries(this.listeners))
        .catch((error: unknown) => logger.error(error)),
    );
    this.listeners.on("remove", (_, value) =>
      this.storage
        ?.removeListener(value, Object.fromEntries(this.listeners))
        .catch((error: unknown) => logger.error(error)),
    );

    // loads listeners from storage
    const loadedListeners = await this.storage.getAllListeners();

    // if a listener already has state then overrides the stored state
    Object.values(loadedListeners).forEach((listener) => {
      const existingListener = this.listeners.get(listener.id);
      if (existingListener) {
        Object.keys(listener.state.syncUnits).forEach((syncId) => {
          const state = existingListener.state.syncUnits[syncId];
          if (state) {
            listener.state.syncUnits[syncId] = state;
          }
        });
      }

      this.listeners.set(listener.id, listener);
    });
  }

  async addListener(input: ListenerInput): Promise<Listener> {
    const listener: StatefulListener = {
      ...input,
      id: input.id ?? generateId(),
      filter: buildListenerFilter(input.filter),
      state: {
        syncUnits: {},
      },
    };

    if (this.listeners.has(listener.id)) {
      throw new DuplicatedListenerIdError(listener.id);
    }

    this.listeners.set(listener.id, listener);
    return Promise.resolve(listener);
  }

  async removeListener(listenerId: string): Promise<boolean> {
    return Promise.resolve(this.listeners.delete(listenerId));
  }
}
