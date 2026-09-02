// Shim for @/lib/promise-queue: sequential task queue (upstream uses async-mutex).
export class PromiseQueue {
  private queue: (() => Promise<void>)[] = [];
  private running = false;
  private halted = false;

  add(task: () => Promise<void>): void {
    if (this.halted) return;
    this.queue.push(task);
    void this.run();
  }

  size(): number {
    return this.queue.length + (this.running ? 1 : 0);
  }

  halt(): void {
    this.halted = true;
    this.queue = [];
  }

  private async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    while (this.queue.length > 0 && !this.halted) {
      const task = this.queue.shift();
      if (!task) break;
      try {
        await task();
      } catch (error) {
        console.error(error);
      }
    }
    this.running = false;
  }
}
