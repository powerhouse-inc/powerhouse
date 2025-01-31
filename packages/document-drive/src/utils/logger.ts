export type ILogger = Pick<
  Console,
  "log" | "info" | "warn" | "error" | "debug" | "trace"
>;
class Logger implements ILogger {
  #logger: ILogger = console;

  constructor() {
    // Bind methods to avoid losing `this`
    this.log = this.log.bind(this);
    this.info = this.info.bind(this);
    this.warn = this.warn.bind(this);
    this.error = this.error.bind(this);
    this.debug = this.debug.bind(this);
    this.trace = this.trace.bind(this);
  }

  set logger(logger: ILogger) {
    this.#logger = logger;
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  log = (...data: any[]) => this.#logger.log(...data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  info = (...data: any[]) => this.#logger.info(...data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  warn = (...data: any[]) => this.#logger.warn(...data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  error = (...data: any[]) => this.#logger.error(...data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  debug = (...data: any[]) => this.#logger.debug(...data);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  trace = (...data: any[]) => this.#logger.trace(...data);
}

const loggerInstance = new Logger();

export const logger: ILogger = loggerInstance;
export const setLogger = (logger: ILogger) => (loggerInstance.logger = logger);
