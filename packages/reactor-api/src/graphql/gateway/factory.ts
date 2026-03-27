import type { ILogger } from "document-model";
import type { Context } from "../types.js";
import { ApolloGatewayAdapter } from "./adapter-gateway-apollo.js";
import { MercuriusGatewayAdapter } from "./adapter-gateway-mercurius.js";
import { createExpressHttpAdapter } from "./adapter-http-express.js";
import { createFastifyHttpAdapter } from "./adapter-http-fastify.js";
import type { IGatewayAdapter, IHttpAdapter } from "./types.js";

export type GatewayAdapterType = "apollo" | "mercurius";
export type HttpAdapterType = "express" | "fastify";

export function createGatewayAdapter(
  type: GatewayAdapterType,
  logger: ILogger,
): IGatewayAdapter<Context> {
  switch (type) {
    case "apollo":
      return new ApolloGatewayAdapter(logger);
    case "mercurius":
      return new MercuriusGatewayAdapter(logger);
  }
}

export type HttpAdapterSetup = {
  adapter: IHttpAdapter;
};

export function createHttpAdapter(type: HttpAdapterType): HttpAdapterSetup {
  switch (type) {
    case "express":
      return createExpressHttpAdapter();
    case "fastify":
      return createFastifyHttpAdapter();
  }
}
