import type { ILogger, LoggerErrorHandler } from "./logger-types.js";

const tokenSub = /@([a-zA-Z0-9_]+)/g;
const dtf = new Intl.DateTimeFormat(undefined, {
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  fractionalSecondDigits: 2,
});

const stringify = (value: unknown, includeStack: boolean): string => {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  if (value instanceof Error) {
    const base = `${value.name}: ${value.message}`;
    return includeStack && value.stack ? `${base}\n${value.stack}` : base;
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  if (typeof value === "function") {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
    const name = (value as Function).name;
    return name ? `${name}()` : "anonymous()";
  }
  return String(value);
};

const formatMessage = (
  tagString: string,
  message: string,
  replacements: any[],
  includeStack: boolean,
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
    message = message.replaceAll(`@${key}`, stringify(value, includeStack));
  }

  // Any replacements past the unique-token count would otherwise be
  // silently dropped — append them so positional Errors still surface.
  const extras = replacements.slice(uniqueTokens.length);
  if (extras.length > 0) {
    message = `${message} ${extras.map((v) => stringify(v, includeStack)).join(" ")}`;
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
  #level: number = LOG_LEVELS.info;

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

  // Errors get full stacks only at debug/verbose; at info/warn/error we
  // emit `name: message` to keep production logs readable.
  get #includeStack(): boolean {
    return this.#level <= LOG_LEVELS.debug;
  }

  verbose(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.verbose) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
        this.#includeStack,
      );

      console.debug(`[${meta["timestamp"]}] ${formattedMessage}`);
    }
  }

  debug(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.debug) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
        this.#includeStack,
      );

      console.debug(`[${meta["timestamp"]}] ${formattedMessage}`);
    }
  }

  info(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.info) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
        this.#includeStack,
      );

      console.info(`[${meta["timestamp"]}] ${formattedMessage}`);
    }
  }

  warn(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.warn) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
        this.#includeStack,
      );

      console.warn(`[${meta["timestamp"]}] ${formattedMessage}`);
    }
  }

  error(message: string, ...replacements: any[]): void {
    if (this.#level <= LOG_LEVELS.error) {
      const [formattedMessage, meta] = formatMessage(
        this.#tagString,
        message,
        replacements,
        this.#includeStack,
      );

      console.error(`[${meta["timestamp"]}] ${formattedMessage}`);
    }
  }
}

// Singleton instance
export const logger: ILogger = new ConsoleLogger();

// Global configuration
export const setLogLevel = (level: ILogger["level"]) => {
  logger.level = level;
};

export const setErrorHandler = (handler: LoggerErrorHandler) => {
  logger.errorHandler = handler;
};

// Backwards-compatible factory function
export const childLogger = (tags: string[]): ILogger => {
  return logger.child(tags);
};
