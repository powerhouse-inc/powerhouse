export interface EventsMap {
  [event: string]: any;
}

interface DefaultEvents extends EventsMap {
  [event: string]: (...args: any) => unknown;
}

export interface UnsubscribeEvent {
  (): void;
}

export interface IEventEmitter<Events extends EventsMap = DefaultEvents> {
  emit<K extends keyof Events>(
    this: this,
    event: K,
    ...args: Parameters<Events[K]>
  ): ReturnType<Events[K]>[];

  emitAsync<K extends keyof Events>(
    this: this,
    event: K,
    ...args: Parameters<Events[K]>
  ): Promise<ReturnType<Events[K]>[]>;

  on<K extends keyof Events>(
    this: this,
    event: K,
    cb: Events[K],
  ): UnsubscribeEvent;
}

export class EventEmitter<Events extends EventsMap = DefaultEvents>
  implements IEventEmitter<Events>
{
  events = new Map<keyof Events, Events[keyof Events][]>();

  emit<K extends keyof Events>(
    this: this,
    event: K,
    ...args: Parameters<Events[K]>
  ): ReturnType<Events[K]>[] {
    const listeners = this.events.get(event);
    if (!listeners) {
      return [];
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return listeners.map((listener) => listener(...args));
  }

  emitAsync<K extends keyof Events>(
    this: this,
    event: K,
    ...args: Parameters<Events[K]>
  ): Promise<ReturnType<Events[K]>[]> {
    const listeners = this.events.get(event);
    if (!listeners) {
      return Promise.resolve([]);
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
    return Promise.all(listeners.map((listener) => listener(...args)));
  }

  on<K extends keyof Events>(
    this: this,
    event: K,
    cb: Events[K],
  ): UnsubscribeEvent {
    const listeners = this.events.get(event) || [];
    listeners.push(cb);
    this.events.set(event, listeners);

    // Return an unsubscribe function
    return () => {
      const listeners = this.events.get(event);
      if (listeners) {
        const index = listeners.indexOf(cb);
        if (index >= 0) {
          listeners.splice(index, 1);

          // Clean up the event key if no listeners remain
          if (listeners.length === 0) {
            this.events.delete(event);
          }
        }
      }
    };
  }
}

export function createEventEmitter<Events extends EventsMap = DefaultEvents>() {
  return new EventEmitter<Events>();
}
