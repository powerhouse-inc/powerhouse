import type { ChannelErrorSource } from "./types.js";

export class PollingChannelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PollingChannelError";
  }
}

export class ChannelError extends Error {
  source: ChannelErrorSource;
  error: Error;

  constructor(source: ChannelErrorSource, error: Error) {
    super(`ChannelError[${source}]: ${error.message}`);
    this.name = "ChannelError";
    this.source = source;
    this.error = error;
  }
}
