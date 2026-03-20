import type { ILogger } from "document-drive";
import type { Context } from "../types.js";
import { ApolloGatewayAdapter } from "./apollo-gateway-adapter.js";
import { createExpressHttpAdapter } from "./express-http-adapter.js";
import type { IGatewayAdapter, IHttpAdapter } from "./types.js";

export type GatewayAdapterType = "apollo";
export type HttpAdapterType = "express";

export function createGatewayAdapter(
  type: GatewayAdapterType,
  logger: ILogger,
): IGatewayAdapter<Context> {
  switch (type) {
    case "apollo":
      return new ApolloGatewayAdapter(logger);
  }
}

export type HttpAdapterSetup = {
  adapter: IHttpAdapter;
  middleware: unknown;
};

export function createHttpAdapter(type: HttpAdapterType): HttpAdapterSetup {
  switch (type) {
    case "express":
      return createExpressHttpAdapter();
  }
}
