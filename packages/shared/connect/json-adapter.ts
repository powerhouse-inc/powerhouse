// Single JSON-file adapter that works in both browser and Node.
//
// - read(): in the browser uses `fetch` (resolves the path against the page's
//   base URL); in Node dynamically imports `node:fs/promises` and reads from
//   disk. The dynamic import keeps `node:fs` out of the browser bundle's
//   static import graph — bundlers see no top-level Node imports, so the
//   adapter can be re-exported safely from the shared barrel.
//
// - write(): always writes to the local filesystem. Only the Node CLI ever
//   calls write — the browser SPA cannot mutate a static file served from
//   the deployed origin. If `write()` is called in the browser the dynamic
//   import of `node:fs/promises` resolves to undefined and we throw with an
//   actionable message.

import type { ConfigAdapter, ConfigShape } from "./config-loader.js";

export type JsonConfigAdapterOptions = {
  /**
   * URL or filesystem path to the JSON file.
   *
   * Defaults to "powerhouse.config.json" (relative). In the browser the
   * relative URL resolves against the page's base URL; in Node it resolves
   * against the process working directory. CLI callers should pass an
   * absolute path discovered via project-root detection.
   */
  path?: string;
};

export class JsonConfigAdapter implements ConfigAdapter {
  readonly source: string;
  private readonly path: string;

  constructor(options: JsonConfigAdapterOptions = {}) {
    this.path = options.path ?? "powerhouse.config.json";
    this.source = `json:${this.path}`;
  }

  async read(): Promise<unknown> {
    if (typeof window !== "undefined") {
      const res = await fetch(this.path);
      if (!res.ok) {
        throw new Error(
          `JsonConfigAdapter: failed to fetch ${this.path}: ${res.status} ${res.statusText}`,
        );
      }
      return (await res.json()) as unknown;
    }
    const { readFile } = await import("node:fs/promises");
    const raw = await readFile(this.path, "utf-8");
    return JSON.parse(raw) as unknown;
  }

  async write(next: ConfigShape): Promise<void> {
    const fs = await import("node:fs/promises").catch(() => null);
    if (!fs) {
      throw new Error(
        "JsonConfigAdapter: writes require the Node filesystem (node:fs/promises is unavailable in this environment).",
      );
    }
    await fs.writeFile(
      this.path,
      `${JSON.stringify(next, null, 2)}\n`,
      "utf-8",
    );
  }
}
