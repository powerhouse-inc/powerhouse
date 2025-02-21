type LogLevel = "verbose" | "debug" | "info" | "warn" | "error" | "silent";

export type ILogger = Pick<
  Console,
  "log" | "info" | "warn" | "error" | "debug"
> & {
  level: LogLevel | "env";
  verbose: (message?: any, ...optionalParams: any[]) => void;
};

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
  #errorHandler: ((...data: any[]) => void) | undefined;

  constructor(tags?: string[], errorHandler?: (...data: any[]) => void) {
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

  get #levelValue(): number {
    if (this.#levelString === "env") {
      const envLevel = process.env.LOG_LEVEL;
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return console.debug(...[...this.#tags, ...data]);
  }

  info(...data: any[]): void {
    if (this.#levelValue > LEVELS.info) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return console.info(...[...this.#tags, ...data]);
  }

  warn(...data: any[]): void {
    if (this.#levelValue > LEVELS.warn) {
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return console.warn(...[...this.#tags, ...data]);
  }

  error(...data: any[]): void {
    if (this.#levelValue > LEVELS.error) {
      return;
    }

    if (this.#errorHandler) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      this.#errorHandler(...data);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return console.error(...[...this.#tags, ...data]);
  }
}

let loggerInstance: ILogger = new ConsoleLogger();
let logLevel: LogLevel | "env" = "env";
loggerInstance.level = logLevel;

export const logger: ILogger = loggerInstance;

export const setLogger = (logger: ILogger) => (loggerInstance = logger);
export const setLogLevel = (level: LogLevel | "env") => {
  logLevel = level;
  loggerInstance.level = level;
};

export const childLogger = (
  tags: string[],
  errorHandler?: (...data: any[]) => void,
) => {
  const logger = new ConsoleLogger(tags, errorHandler);
  logger.level = logLevel;
  return logger;
};
