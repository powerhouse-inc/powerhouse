import type { ILogger, LoggerErrorHandler } from "./types.js";

const tokenSub = /@([a-zA-Z0-9_]+)/g;
const dtf = new Intl.DateTimeFormat();

const formatMessage = (
  tags: string[],
  message: string,
  ...replacements: any[]
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

  if (tags.length > 0) {
    message = `${tags.map((tag) => `[${tag}]`).join("")} ${message}`;
  }

  // timestamp
  const now = new Date();
  const timestamp = dtf.format(now);
  meta["timestamp"] = timestamp;

  return [message, meta];
};

export class ConsoleLogger implements ILogger {
  #tags: string[];

  errorHandler: LoggerErrorHandler;
  level: "verbose" | "debug" | "info" | "warn" | "error" = "info";

  constructor(tags?: string[], handler?: LoggerErrorHandler) {
    this.#tags = (tags || []).map((tag) => `[${tag}]`);
    this.errorHandler = handler ?? (() => {});
  }

  verbose(message: string, ...replacements: any[]): void {
    this.debug(message, replacements);
  }

  debug(message: string, ...replacements: any[]): void {
    const [formattedMessage, meta] = formatMessage(
      this.#tags,
      message,
      replacements,
    );

    console.debug(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
  }

  info(message: string, ...replacements: any[]): void {
    const [formattedMessage, meta] = formatMessage(
      this.#tags,
      message,
      replacements,
    );

    console.info(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
  }

  warn(message: string, ...replacements: any[]): void {
    const [formattedMessage, meta] = formatMessage(
      this.#tags,
      message,
      replacements,
    );

    console.warn(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
  }

  error(message: string, ...replacements: any[]): void {
    const [formattedMessage, meta] = formatMessage(
      this.#tags,
      message,
      replacements,
    );

    console.error(`[${meta["timestamp"]}] ${formattedMessage}`, meta);
  }
}
