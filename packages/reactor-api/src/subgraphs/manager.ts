import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper";
import bodyParser from "body-parser";
import cors from "cors";
import { IDocumentDriveServer } from "document-drive";
import express, { IRouter, Router } from "express";
import { Knex } from "knex";
import { Context, SubgraphArgs, SubgraphClass } from ".";
import { AnalyticsSubgraph } from "./analytics";
import { DriveSubgraph } from "./drive";
import { SystemSubgraph } from "./system";
import { createSchema } from "../utils/create-schema";
import { Subgraph } from "./base";

export class SubgraphManager {
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};
  private subgraphs: Subgraph[] = [];

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
    private readonly operationalStore: Knex,
  ) {
    const args: SubgraphArgs = {
      reactor: this.reactor,
      operationalStore: this.operationalStore,
      subgraphManager: this,
    };

    // Setup Default subgraphs
    this.subgraphs.push(new SystemSubgraph(args));
    this.subgraphs.push(new AnalyticsSubgraph(args));
    this.subgraphs.push(new DriveSubgraph(args));
  }

  async init() {
    console.log(
      `Initializing ReactorRouterManager with subgraphs: [${this.subgraphs.map((e) => e.name).join(", ")}]`,
    );
    const models = this.reactor.getDocumentModels();
    const driveModel = models.find(
      (it) => it.documentModel.name === "DocumentDrive",
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    this.reactor.on("documentModels", () => {
      this.updateRouter().catch((error: unknown) => console.error(error));
    });

    this.app.use(this.path, (req, res, next) =>
      this.reactorRouter(req, res, next),
    );

    await this.updateRouter();
  }

  async updateRouter() {
    const newRouter = Router();
    newRouter.use(cors());
    newRouter.use(bodyParser.json());
    // Run each subgraph on the same http server, but at different paths
    for (const subgraph of this.subgraphs) {
      const subgraphConfig = this.#getLocalSubgraphConfig(subgraph.name);
      if (!subgraphConfig) continue;
      // get schema
      const schema = createSchema(
        this.reactor,
        subgraphConfig.resolvers,
        subgraphConfig.typeDefs,
      );
      // create apollo server
      const server = new ApolloServer({
        schema,
        introspection: true,
        plugins: [ApolloServerPluginInlineTraceDisabled()],
      });

      // start apollo server
      await server.start();

      // setup path
      const path = `/${subgraphConfig.name}`;
      newRouter.use(
        path,
        // @ts-ignore
        expressMiddleware(server, {
          context: ({ req }): Context => ({
            headers: req.headers,
            driveId: req.params.drive ?? undefined,
            driveServer: this.reactor,
            db: this.operationalStore,
            // analyticStore: undefined, // TODO: add analytic store
            ...this.getAdditionalContextFields(),
          }),
        }),
      );
    }

    this.reactorRouter = newRouter;
  }

  async registerSubgraph(subgraph: SubgraphClass) {
    const subgraphInstance = new subgraph({
      operationalStore: this.operationalStore,
      reactor: this.reactor,
      subgraphManager: this,
    });
    this.subgraphs.unshift(subgraphInstance);
    console.log(`Registered [${subgraph.name}] subgraph.`);
    await this.updateRouter();
  }

  #getLocalSubgraphConfig(subgraphName: string) {
    return this.subgraphs.find((it) => it.name === subgraphName);
  }

  getAdditionalContextFields = () => {
    return this.contextFields;
  };

  setAdditionalContextFields(fields: Record<string, any>) {
    this.contextFields = { ...this.contextFields, ...fields };
  }
}
