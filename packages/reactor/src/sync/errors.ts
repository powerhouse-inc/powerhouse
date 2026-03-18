import type { ChannelErrorSource } from "./types.js";

export type GraphQLRequestErrorCategory =
  | "network"
  | "http"
  | "parse"
  | "graphql"
  | "missing-data";

export class GraphQLRequestError extends Error {
  readonly statusCode: number | undefined;
  readonly category: GraphQLRequestErrorCategory;

  constructor(
    message: string,
    category: GraphQLRequestErrorCategory,
    statusCode?: number,
  ) {
    super(message);
    this.name = "GraphQLRequestError";
    this.category = category;
    this.statusCode = statusCode;
  }
}

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
