import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import bodyParser from "body-parser";
import cors from "cors";
import { IDocumentDriveServer } from "document-drive";
import express, { IRouter, Router } from "express";
import { analyticsSubgraph, driveSubgraph, systemSubgraph } from "./subgraphs";
import { Context, Subgraph } from "./types";
import { createSchema } from "./utils/create-schema";
import path from "node:path";

export class ReactorRouterManager {
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
  ) {}

  async init() {
    this.app.use(cors());
    this.app.use(bodyParser.json());
    const models = this.reactor.getDocumentModels();
    const driveModel = models.find(
      (it) => it.documentModel.name === "DocumentDrive",
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    // default middleware for dynamic subgraphs
    this.app.use(this.path, (req, res, next) =>
      this.reactorRouter(req, res, next),
    );

    // system Middleware
    const systemMiddleware = await this.#createSubgraphMiddleware({
      name: "system",
      resolvers: systemSubgraph.resolvers,
      typeDefs: systemSubgraph.typeDefs,
    });
    // @ts-expect-error
    this.reactorRouter.use(path.join(this.path, "system"), systemMiddleware);

    // drive middleware
    const driveMiddleware = await this.#createSubgraphMiddleware({
      name: "d/:drive",
      resolvers: driveSubgraph.resolvers,
      typeDefs: driveSubgraph.typeDefs,
    });
    // @ts-expect-error
    this.reactorRouter.use(path.join(this.path, "d/:drive"), driveMiddleware);

    // analytics middleware
    const analyticsMiddleware = await this.#createSubgraphMiddleware({
      name: "analytics",
      resolvers: analyticsSubgraph.resolvers as GraphQLResolverMap<Context>,
      typeDefs: analyticsSubgraph.typeDefs,
    });
    this.reactorRouter.use(
      path.join(this.path, "analytics"),
      // @ts-expect-error
      analyticsMiddleware,
    );
  }

  async #createSubgraphMiddleware(subgraph: Subgraph) {
    console.log(
      `Creating subgraph middleware for ${path.join(this.path, subgraph.name)}`,
    );
    const schema = createSchema(
      this.reactor,
      subgraph.resolvers as GraphQLResolverMap<Context>,
      subgraph.typeDefs,
    );
    const server = new ApolloServer({
      schema,
      introspection: true,
      plugins: [ApolloServerPluginInlineTraceDisabled()],
    });
    await server.start();

    const middleware = expressMiddleware(server, {
      context: async ({ req }): Promise<Context> => ({
        headers: req.headers,
        driveId: req.params.drive ?? undefined,
        driveServer: this.reactor,
        ...this.getAdditionalContextFields(),
      }),
    });
  }

  async registerSubgraph(subgraph: Subgraph) {
    const middleware = await this.#createSubgraphMiddleware(subgraph);
    this.reactorRouter.use(
      subgraph.name,
      // @ts-expect-error
      middleware,
    );
  }

  getAdditionalContextFields = () => {
    return this.contextFields;
  };

  setAdditionalContextFields(fields: Record<string, any>) {
    this.contextFields = { ...this.contextFields, ...fields };
  }
}
