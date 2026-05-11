import type { ObservedEvent } from "./types.js";

export class EventRing {
  private readonly capacity: number;
  private buffer: ObservedEvent[] = [];

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
  }

  push(event: ObservedEvent): void {
    this.buffer.push(event);
    if (this.buffer.length > this.capacity) {
      this.buffer.splice(0, this.buffer.length - this.capacity);
    }
  }

  snapshot(): ObservedEvent[] {
    return this.buffer.slice();
  }

  size(): number {
    return this.buffer.length;
  }
}
