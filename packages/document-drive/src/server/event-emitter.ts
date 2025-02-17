import { createNanoEvents, Unsubscribe } from "nanoevents";
import { DriveEvents, IEventEmitter } from "./types";

export class DefaultEventEmitter implements IEventEmitter {
  private emitter = createNanoEvents<DriveEvents>();

  emit<K extends keyof DriveEvents>(
    event: K,
    ...args: Parameters<DriveEvents[K]>
  ): void {
    return this.emitter.emit(event, ...args);
  }

  on<K extends keyof DriveEvents>(event: K, cb: DriveEvents[K]): Unsubscribe {
    return this.emitter.on(event, cb);
  }
}
