import type {
  IMemoryTelemetrySink,
  MemorySample,
  MemoryTelemetryConfig,
} from "@powerhousedao/reactor";
import { resolvePhDir } from "@powerhousedao/shared/clis";
import type { ILogger } from "document-model";
import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import path from "node:path";

const MIB = 1024 * 1024;

/** An ISO time usable in a Windows file name. */
export function fileTimestamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, "-");
}

/** Where telemetry files land: `<phDir>/telemetry`, following `PH_USER_DATA_DIR`. */
export function telemetryDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(resolvePhDir(undefined, env), "telemetry");
}

export type JsonlFileOptions = {
  path: string;
  maxBytes: number;
  /** Files kept, the current one included. */
  keep: number;
  /** Written as the first line of every file. */
  header: unknown;
  logger?: ILogger;
};

/**
 * Appends one JSON line at a time and rotates at `maxBytes`: the full file moves
 * to `<stem>.<n>.jsonl`, and the oldest beyond `keep` is deleted. Each append is
 * synchronous and small, so a hard kill loses nothing written so far.
 */
export class JsonlFile {
  readonly path: string;
  private size = 0;
  private rotation = 0;
  private failed = false;
  private readonly stem: string;
  private readonly dir: string;

  constructor(private readonly options: JsonlFileOptions) {
    this.path = options.path;
    this.dir = path.dirname(options.path);
    this.stem = path.basename(options.path, ".jsonl");
    mkdirSync(this.dir, { recursive: true });
    this.append(`${JSON.stringify(options.header)}\n`);
  }

  writeLine(value: unknown): void {
    const line = `${JSON.stringify(value)}\n`;
    if (this.size + line.length > this.options.maxBytes) this.rotate();
    this.append(line);
  }

  private append(line: string): void {
    try {
      appendFileSync(this.path, line);
      this.size += line.length;
      this.failed = false;
    } catch (error) {
      // One line per outage; the sample stays in the ring.
      if (!this.failed) {
        this.options.logger?.warn(
          "Telemetry file '@Path' cannot be written: @Error",
          this.path,
          error,
        );
      }
      this.failed = true;
    }
  }

  private rotate(): void {
    this.rotation++;
    try {
      renameSync(
        this.path,
        path.join(this.dir, `${this.stem}.${this.rotation}.jsonl`),
      );
    } catch {
      // Nothing to move yet: the next append makes the file.
    }
    this.size = 0;
    this.prune();
    this.append(`${JSON.stringify(this.options.header)}\n`);
  }

  private prune(): void {
    const rotated = readdirSync(this.dir)
      .map((name) => ({
        name,
        n: new RegExp(`^${escapeRegExp(this.stem)}\\.(\\d+)\\.jsonl$`).exec(
          name,
        )?.[1],
      }))
      .filter((file) => file.n !== undefined)
      .sort((a, b) => Number(a.n) - Number(b.n));
    const excess = rotated.length - (this.options.keep - 1);
    for (const file of rotated.slice(0, Math.max(excess, 0))) {
      rmSync(path.join(this.dir, file.name), { force: true });
    }
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type MemoryFileSinkOptions = {
  /** Where a file with no explicit path goes; defaults to `telemetryDir()`. */
  dir?: string;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  logger?: ILogger;
};

/** Opens the memory telemetry's JSONL file; the header holds no env values. */
export function memoryFileSink(
  config: MemoryTelemetryConfig,
  options: MemoryFileSinkOptions = {},
): IMemoryTelemetrySink {
  const now = options.now?.() ?? new Date();
  const file = new JsonlFile({
    path:
      config.filePath ??
      path.join(
        options.dir ?? telemetryDir(options.env),
        `memory-${fileTimestamp(now)}-${process.pid}.jsonl`,
      ),
    maxBytes: config.fileMaxMb * MIB,
    keep: config.fileKeep,
    header: {
      telemetry: "memory",
      startedAt: now.toISOString(),
      pid: process.pid,
      node: process.version,
      argv: process.argv,
      config,
    },
    logger: options.logger,
  });
  return {
    path: file.path,
    write: (sample: MemorySample) => file.writeLine(sample),
    close: () => undefined,
  };
}
