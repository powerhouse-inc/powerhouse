const pageHidden = () => document.visibilityState === "hidden";

/** One request of a poll. It answers how long to wait before the next, or
 * undefined when asking again would get the same answer. */
export type PollRun = (signal: AbortSignal) => Promise<number | undefined>;

/**
 * Runs `run` again and again between `start` and `stop`, one at a time, and
 * only while the page is visible: a hidden page asks nothing, and asks at
 * once when it shows again. `stop` aborts the run in flight.
 */
export class Poller {
  #run: PollRun;
  #controller: AbortController | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #inFlight = false;

  constructor(run: PollRun) {
    this.#run = run;
  }

  start(): void {
    this.#controller = new AbortController();
    document.addEventListener("visibilitychange", this.#onVisibilityChange);
    void this.#poll();
  }

  stop(): void {
    this.#controller?.abort();
    this.#controller = undefined;
    this.#inFlight = false;
    clearTimeout(this.#timer);
    document.removeEventListener("visibilitychange", this.#onVisibilityChange);
  }

  #onVisibilityChange = (): void => {
    if (pageHidden()) clearTimeout(this.#timer);
    else void this.#poll();
  };

  async #poll(): Promise<void> {
    const controller = this.#controller;
    if (!controller || this.#inFlight || pageHidden()) return;
    clearTimeout(this.#timer);
    this.#inFlight = true;
    const wait = await this.#run(controller.signal);
    if (controller.signal.aborted) return;
    this.#inFlight = false;
    if (wait === undefined) {
      // Showing the page again would get the same answer.
      document.removeEventListener(
        "visibilitychange",
        this.#onVisibilityChange,
      );
    } else if (!pageHidden()) {
      this.#timer = setTimeout(() => void this.#poll(), wait);
    }
  }
}
