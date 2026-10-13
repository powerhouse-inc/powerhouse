import { createInterface } from "node:readline";
import type { Readable } from "node:stream";

/**
 * Read lines from a readable stream as an async generator.
 * Defaults to process.stdin. Used when piped input is detected (non-TTY stdin with -i flag).
 */
export async function* createStdinLineReader(
  input: Readable = process.stdin,
): AsyncGenerator<string> {
  const rl = createInterface({ input, terminal: false });
  for await (const line of rl) {
    yield line;
  }
}
