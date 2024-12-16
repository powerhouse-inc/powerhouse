import { writeFile, readFile } from "fs/promises";
import {
  Listener,
  ListenerMap,
  IListenerStorage,
  StatefulListener,
} from "./types";
import { debounce } from "../../utils";
import { ListenerNotFoundError } from "./errors";

export interface IOptions {
  debounce?: number;
}
/**
 * Persists listeners into a json file.
 * Writes are debounced to prevent excessive writes to the file.
 * @param filePath The path to the file where listeners are stored.
 */
export class FileListenerStorage implements IListenerStorage {
  private debounceTime: number;
  private debouncedSave: (immediate: boolean) => Promise<void>;
  private filePath: string;
  private writeQueue: ListenerMap | null = null;

  constructor(filePath: string, options?: IOptions) {
    this.filePath = filePath;
    this.debounceTime = options?.debounce ?? 300;
    this.debouncedSave = debounce(this.#save.bind(this), this.debounceTime);
  }

  async #getCurrentListeners(): Promise<ListenerMap> {
    return this.writeQueue || this.loadListeners();
  }

  // Debounced method to save the listener map to the file
  async #save() {
    if (!this.writeQueue) {
      return;
    }
    await writeFile(this.filePath, JSON.stringify(this.writeQueue, null, 2), {
      encoding: "utf8",
    });
  }

  private async loadListeners(): Promise<ListenerMap> {
    try {
      const fileContent = await readFile(this.filePath, { encoding: "utf8" });
      return JSON.parse(fileContent) as ListenerMap;
    } catch (error: unknown) {
      // If the file doesn't exist or is corrupted, return an empty map
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return {};
      }
      throw error;
    }
  }

  async addListener(listener: Listener): Promise<void> {
    const listeners = await this.#getCurrentListeners();
    listeners[listener.id] = { ...listener, state: { syncUnits: {} } };
    this.writeQueue = listeners;
    return this.debouncedSave(false);
  }

  async updateListener(
    listenerId: Listener["id"],
    update: Partial<StatefulListener>,
  ): Promise<void> {
    const listeners = await this.#getCurrentListeners();
    const listener = listeners[listenerId];
    if (!listener) {
      throw new ListenerNotFoundError(listenerId);
    }
    Object.assign(listener, update);
    this.writeQueue = listeners;
    return this.debouncedSave(false);
  }

  async removeListener(listenerId: Listener["id"]): Promise<void> {
    const listeners = await this.#getCurrentListeners();
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete listeners[listenerId];
    this.writeQueue = listeners;
    return this.debouncedSave(false);
  }

  /**
   * Retrieves all listeners from the file.
   * Useful for initializing the listener manager.
   */
  async getAllListeners(): Promise<ListenerMap> {
    return this.loadListeners();
  }
}
