/** Counting semaphore; bounds concurrent `claude -p` processes. */
export class Semaphore {
  readonly #limit: number;
  readonly #waiting: (() => void)[] = [];
  #inFlight = 0;

  constructor(limit: number) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error(
        `Semaphore limit must be a positive integer, got ${limit}`,
      );
    }
    this.#limit = limit;
  }

  get inFlight(): number {
    return this.#inFlight;
  }

  get limit(): number {
    return this.#limit;
  }

  /** Resolves with a release function once a slot is free. Release is idempotent. */
  acquire(): Promise<() => void> {
    return new Promise((resolve) => {
      const grant = () => {
        this.#inFlight += 1;
        let released = false;
        resolve(() => {
          if (released) return;
          released = true;
          this.#inFlight -= 1;
          this.#waiting.shift()?.();
        });
      };
      if (this.#inFlight < this.#limit) grant();
      else this.#waiting.push(grant);
    });
  }

  async with<T>(fn: () => Promise<T> | T): Promise<T> {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}
