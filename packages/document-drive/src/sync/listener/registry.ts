import { generateId } from "document-model/utils";
import {
  IListenerRegistry,
  IListenerStorage,
  Listener,
  ListenerInput,
  StatefulListener,
} from "./types";
import { DuplicatedListenerIdError, ListenerNotFoundError } from "./errors";
import { ObservableMap, Subscribe } from "../../utils/event-emitter";
import { buildListenerFilter, listensToSyncUnit } from "../utils";
import { OperationScope } from "document-model/document";

export class ListenerRegistry implements IListenerRegistry {
  protected listeners = new ObservableMap<Listener["id"], StatefulListener>();
  protected storage: IListenerStorage | undefined = undefined;
  public on: Subscribe<string, StatefulListener>;

  constructor(storage?: IListenerStorage) {
    this.storage = storage;
    this.on = this.listeners.on.bind(this);
  }

  static async create(storage?: IListenerStorage): Promise<ListenerRegistry> {
    const instance = new ListenerRegistry(storage);
    if (storage) {
      await instance.init();
    }
    return instance;
  }

  async init(): Promise<void> {
    // if a storage was provided then loads the persisted listeners
    if (this.storage) {
      await this.#loadStorage();
    }
  }

  async #loadStorage() {
    if (!this.storage) {
      return;
    }

    // loads listeners from storage
    const loadedListeners = await this.storage.getAllListeners();

    // if a listener already has state then overrides the stored state
    for (const listener of Object.values(loadedListeners)) {
      const existingListener = this.listeners.get(listener.id);
      if (existingListener) {
        Object.keys(listener.state.syncUnits).forEach((syncId) => {
          const state = existingListener.state.syncUnits[syncId];
          if (state) {
            listener.state.syncUnits[syncId] = state;
          }
        });
      }

      await this.storage.updateListener(listener.id, listener);
      this.listeners.set(listener.id, listener);
    }
  }

  async getListener(listenerId: string): Promise<Listener | undefined> {
    const listener = this.listeners.get(listenerId);
    return Promise.resolve(listener);
  }

  async getAllListeners(): Promise<Listener[]> {
    return Promise.resolve([...this.listeners.values()]);
  }

  getSyncUnitListeners(syncUnit: {
    driveId: string;
    documentId: string;
    documentType: string;
    scope: OperationScope;
    branch: string;
  }): Promise<Listener[]> {
    return Promise.resolve([
      ...this.listeners
        .values()
        .filter((listener) => listensToSyncUnit(listener.filter, syncUnit)),
    ]);
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

    await this.storage?.addListener(listener);
    this.listeners.set(listener.id, listener);
    return Promise.resolve(listener);
  }

  async removeListener(listenerId: string): Promise<boolean> {
    await this.storage?.removeListener(listenerId);
    return Promise.resolve(this.listeners.delete(listenerId));
  }

  async updateListenerRevision(
    listenerId: string,
    syncUnitId: string,
    revision: number,
    lastUpdated: string,
  ): Promise<void> {
    const listener = this.listeners.get(listenerId);
    if (!listener) {
      throw new ListenerNotFoundError(listenerId);
    }

    const updatedListener: StatefulListener = {
      ...listener,
      state: {
        ...listener.state,
        syncUnits: {
          ...listener.state.syncUnits,
          [syncUnitId]: {
            revision,
            lastUpdated,
          },
        },
      },
    };

    await this.storage?.updateListener(listenerId, updatedListener);
    this.listeners.set(listenerId, updatedListener);
  }
}
