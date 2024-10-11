export type ILogger = Pick<
  Console,
  "log" | "info" | "warn" | "error" | "debug" | "trace"
>;
class Logger implements ILogger {
  #logger: ILogger = console;

  set logger(logger: ILogger) {
    this.#logger = logger;
  }

  log(...data: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.#logger.log(...data);
  }

  info(...data: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.#logger.info(...data);
  }

  warn(...data: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.#logger.warn(...data);
  }

  error(...data: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.#logger.error(...data);
  }

  debug(...data: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.#logger.debug(...data);
  }

  trace(...data: any[]): void {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.#logger.trace(...data);
  }
}

const loggerInstance = new Logger();

export const logger: ILogger = loggerInstance;
export const setLogger = (logger: ILogger) => (loggerInstance.logger = logger);
