/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
type LogLevel = "verbose" | "debug" | "info" | "warn" | "error" | "silent";

export type ILogger = Pick<
  Console,
  "log" | "info" | "warn" | "error" | "debug"
> & {
  level: LogLevel | "env";
  errorHandler: LoggerErrorHandler | undefined;

  verbose: (message?: any, ...optionalParams: any[]) => void;
};

export type LoggerErrorHandler = (...data: any[]) => void;

const LEVELS = {
  verbose: 1,
  debug: 2,
  info: 3,
  warn: 4,
  error: 5,
  silent: 6,
} as const;

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
        typeof process !== "undefined" ? process.env.LOG_LEVEL : undefined;
      if (!envLevel) {
        return LEVELS.debug;
      }

      if (!(envLevel in LEVELS)) {
        return LEVELS.debug;
      }

      return LEVELS[envLevel as LogLevel];
    }

    return LEVELS[this.#levelString];
  }

  log(...data: any[]): void {
    return this.debug(...data);
  }

  verbose(...data: any[]): void {
    if (this.#levelValue > LEVELS.verbose) {
      return;
    }

    return this.debug(...data);
  }

  debug(...data: any[]): void {
    if (this.#levelValue > LEVELS.debug) {
      return;
    }

    return console.debug(...[...this.#tags, ...data]);
  }

  info(...data: any[]): void {
    if (this.#levelValue > LEVELS.info) {
      return;
    }

    return console.info(...[...this.#tags, ...data]);
  }

  warn(...data: any[]): void {
    if (this.#levelValue > LEVELS.warn) {
      return;
    }

    return console.warn(...[...this.#tags, ...data]);
  }

  error(...data: any[]): void {
    if (this.#levelValue > LEVELS.error) {
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
