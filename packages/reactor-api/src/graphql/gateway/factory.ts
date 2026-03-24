import type { ILogger } from "document-model";
import type { Context } from "../types.js";
import { ApolloGatewayAdapter } from "./adapter-gateway-apollo.js";
import { createExpressHttpAdapter } from "./adapter-http-express.js";
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
};

export function createHttpAdapter(type: HttpAdapterType): HttpAdapterSetup {
  switch (type) {
    case "express":
      return createExpressHttpAdapter();
  }
}
