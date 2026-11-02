import type { LogLine, LogsResponse } from "../controller/api.ts";

type Stream = LogLine["stream"];

const MAX_PARTIAL = 16 * 1024;

/** The last `capacity` output lines of one instance, numbered from 0. */
export class LogRing {
  readonly #capacity: number;
  #lines: LogLine[] = [];
  #next = 0;
  #partial: Record<Stream, string> = { stdout: "", stderr: "" };

  constructor(capacity = 512) {
    this.#capacity = capacity;
  }

  push(stream: Stream, chunk: string): void {
    const parts = (this.#partial[stream] + chunk).split(/\r?\n/);
    let rest = parts.pop() ?? "";
    for (const text of parts) this.#add(stream, text);
    if (rest.length > MAX_PARTIAL) {
      this.#add(stream, rest);
      rest = "";
    }
    this.#partial[stream] = rest;
  }

  /** Emits unterminated last lines (on exit). */
  flush(): void {
    for (const stream of ["stdout", "stderr"] as const) {
      if (this.#partial[stream]) this.#add(stream, this.#partial[stream]);
      this.#partial[stream] = "";
    }
  }

  since(since: number): LogsResponse {
    return {
      next: this.#next,
      lines: this.#lines.filter((line) => line.seq >= since),
    };
  }

  tail(count: number): string {
    return this.#lines
      .slice(-count)
      .map((line) => line.text)
      .join("\n");
  }

  #add(stream: Stream, text: string): void {
    this.#lines.push({ seq: this.#next++, stream, text });
    if (this.#lines.length > this.#capacity) this.#lines.shift();
  }
}
