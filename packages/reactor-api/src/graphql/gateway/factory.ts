import type { ILogger } from "document-drive";
import { Router } from "express";
import type { IRouter } from "express";
import type { Context } from "../types.js";
import { ApolloGatewayAdapter } from "./apollo-gateway-adapter.js";
import { ExpressHttpAdapter } from "./express-http-adapter.js";
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

export function createHttpAdapter(type: HttpAdapterType): {
  adapter: IHttpAdapter;
  middleware: IRouter;
} {
  switch (type) {
    case "express": {
      const router = Router();
      return { adapter: new ExpressHttpAdapter(router), middleware: router };
    }
  }
}
