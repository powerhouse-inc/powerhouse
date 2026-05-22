import type { ILogger } from "document-model";
import type { Context } from "../types.js";
import type { IGatewayAdapter, IHttpAdapter } from "./types.js";

export type GatewayAdapterType = "apollo" | "mercurius";
export type HttpAdapterType = "express" | "fastify";

export async function createGatewayAdapter(
  type: GatewayAdapterType,
  logger: ILogger,
): Promise<IGatewayAdapter<Context>> {
  switch (type) {
    case "apollo": {
      const { ApolloGatewayAdapter } =
        await import("./adapter-gateway-apollo.js");
      return new ApolloGatewayAdapter(logger);
    }
    case "mercurius": {
      const { MercuriusGatewayAdapter } =
        await import("./adapter-gateway-mercurius.js");
      return new MercuriusGatewayAdapter(logger);
    }
  }
}

export type HttpAdapterSetup = {
  adapter: IHttpAdapter;
};

export async function createHttpAdapter(
  type: HttpAdapterType,
): Promise<HttpAdapterSetup> {
  switch (type) {
    case "express": {
      const { createExpressHttpAdapter } =
        await import("./adapter-http-express.js");
      return createExpressHttpAdapter();
    }
    case "fastify": {
      const { createFastifyHttpAdapter } =
        await import("./adapter-http-fastify.js");
      return createFastifyHttpAdapter();
    }
  }
}
