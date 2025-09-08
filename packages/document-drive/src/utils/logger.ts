import type { LogLevel } from "@powerhousedao/config";
import { isLogLevel, LogLevels } from "@powerhousedao/config";
import type { ILogger, LoggerErrorHandler } from "document-drive";

export class ConsoleLogger implements ILogger {
  #tags: string[];
  #levelString: LogLevel | "env" = "env";
  #errorHandler: LoggerErrorHandler | undefined;

  constructor(tags?: string[], errorHandler?: LoggerErrorHandler) {
    this.#tags = (tags || []).map((tag) => `[${tag}]`);
    this.#errorHandler = errorHandler;

    // Bind all methods to the current instance
    this.log = this.log.bind(this);
    this.info = this.info.bind(this);
    this.warn = this.warn.bind(this);
    this.error = this.error.bind(this);
    this.debug = this.debug.bind(this);
    this.verbose = this.verbose.bind(this);
  }

  get level(): LogLevel | "env" {
    return this.#levelString;
  }

  set level(level: LogLevel | "env") {
    if (level !== "env" && !isLogLevel(level)) {
      throw new Error(`Invalid log level: ${JSON.stringify(level)}.
        Must be one of ${Object.keys(LogLevels).concat(["env"]).join(", ")}.`);
    }
    this.#levelString = level;
  }

  get errorHandler(): LoggerErrorHandler | undefined {
    return this.#errorHandler;
  }

  set errorHandler(handler: LoggerErrorHandler | undefined) {
    this.#errorHandler = handler;
  }

  get #levelValue(): number {
    if (this.#levelString === "env") {
      const envLevel =
        typeof globalThis !== "undefined" &&
        globalThis.process &&
        "env" in globalThis.process
          ? globalThis.process.env.LOG_LEVEL
          : undefined;
      if (!envLevel) {
        return LogLevels.debug;
      }

      if (!(envLevel in LogLevels)) {
        return LogLevels.debug;
      }

      return LogLevels[envLevel as LogLevel];
    }

    return LogLevels[this.#levelString];
  }

  log(...data: any[]): void {
    return this.debug(...data);
  }

  verbose(...data: any[]): void {
    if (this.#levelValue > LogLevels.verbose) {
      return;
    }

    return this.debug(...data);
  }

  debug(...data: any[]): void {
    if (this.#levelValue > LogLevels.debug) {
      return;
    }

    return console.debug(...[...this.#tags, ...data]);
  }

  info(...data: any[]): void {
    if (this.#levelValue > LogLevels.info) {
      return;
    }

    return console.info(...[...this.#tags, ...data]);
  }

  warn(...data: any[]): void {
    if (this.#levelValue > LogLevels.warn) {
      return;
    }

    return console.warn(...[...this.#tags, ...data]);
  }

  error(...data: any[]): void {
    if (this.#levelValue > LogLevels.error) {
      return;
    }

    if (this.#errorHandler) {
      this.#errorHandler(...data);
    }

    return console.error(...[...this.#tags, ...data]);
  }
}

const loggerInstance: ILogger = new ConsoleLogger();
let logLevel: LogLevel | "env" = "env";
let errorHandler: LoggerErrorHandler | undefined;

loggerInstance.level = logLevel;
loggerInstance.errorHandler = errorHandler;

export const logger: ILogger = loggerInstance;

export const setErrorHandler = (handler: LoggerErrorHandler) => {
  errorHandler = handler;
  loggerInstance.errorHandler = handler;
};

export const setLogLevel = (level: LogLevel | "env") => {
  logLevel = level;
  loggerInstance.level = level;
};

export const childLogger = (tags: string[]): ILogger => {
  const logger = new ConsoleLogger(tags);
  logger.level = logLevel;
  logger.errorHandler = errorHandler;
  return logger;
};
