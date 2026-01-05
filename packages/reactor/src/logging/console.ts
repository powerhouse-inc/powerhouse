import type { ILogger, LoggerErrorHandler } from "./types.js";

const tokenSub = /@([a-zA-Z0-9_]+)/g;
const dtf = new Intl.DateTimeFormat();

const formatMessage = (
  tagString: string,
  message: string,
  replacements: any[],
): [string, Record<string, any>] => {
  const meta: Record<string, any> = {};
  const uniqueTokens: string[] = [];

  let results;
  while ((results = tokenSub.exec(message)) !== null) {
    const tokenName = results[1];
    const index = uniqueTokens.indexOf(tokenName);
    if (index === -1) {
      uniqueTokens.push(tokenName);

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const replacement = replacements[uniqueTokens.length - 1];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      meta[tokenName] = replacement;
    }
  }

  // replace
  for (const [key, value] of Object.entries(meta)) {
    let stringValue;
    if (!value) {
      stringValue = "null";
    } else if (typeof value === "string") {
      stringValue = value;
    } else if (typeof value === "object") {
      stringValue = JSON.stringify(value);
    } else if (typeof value === "function") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      const name = (value as Function).name;
      stringValue = name ? `${name}()` : "anonymous()";
    } else {
      stringValue = String(value);
    }

    message = message.replaceAll(`@${key}`, stringValue);
  }

  if (tagString.length > 0) {
    message = `${tagString} ${message}`;
  }

  // timestamp
  const now = new Date();
  const timestamp = dtf.format(now);
  meta["timestamp"] = timestamp;

  return [message, meta];
};

const LOG_LEVELS = {
  verbose: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
} as const;

export class ConsoleLogger implements ILogger {
  #tags: string[];
  #tagString: string;
  #level: number = LOG_LEVELS.verbose;

  errorHandler: LoggerErrorHandler;

  constructor(tags?: string[], handler?: LoggerErrorHandler) {
    this.#tags = tags || [];
    this.#tagString = this.#tags.map((tag) => `[${tag}]`).join("");

    this.errorHandler = handler ?? (() => {});
  }

  get level(): keyof typeof LOG_LEVELS {
    return Object.keys(LOG_LEVELS).find(
      (key) => LOG_LEVELS[key as keyof typeof LOG_LEVELS] === this.#level,
    ) as keyof typeof LOG_LEVELS;
  }

  set level(value: keyof typeof LOG_LEVELS) {
    this.#level = LOG_LEVELS[value];
  }

  child(tags: string[]): ILogger {
    const logger = new ConsoleLogger(
      [...this.#tags, ...tags],
      this.errorHandler,
    );
    logger.level = this.level;
    return logger;
  }

  verbose(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.verbose) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
      );

      console.debug(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
    }
  }

  debug(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.debug) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
      );

      console.debug(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
    }
  }

  info(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.info) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
      );

      console.info(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
    }
  }

  warn(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.warn) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
      );

      console.warn(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
    }
  }

  error(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.error) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
      );

      console.error(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
    }
  }
}
