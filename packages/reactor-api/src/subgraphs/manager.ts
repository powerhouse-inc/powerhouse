import { Db } from "#types.js";
import { createSchema } from "#utils/create-schema.js";
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import bodyParser from "body-parser";
import { IDocumentDriveServer } from "document-drive";
import { IRouter, Router } from "express";
import { AnalyticsSubgraph } from "./analytics/index.js";
import { AuthSubgraph } from "./auth/index.js";
import { DriveSubgraph } from "./drive/index.js";
import { Subgraph, SubgraphClass } from "./index.js";
import { SystemSubgraph } from "./system/index.js";
import express from "express";
import cors from "cors";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { Context } from "./types.js";

export class SubgraphManager {
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};
  private subgraphs: Subgraph[] = [];

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
    private readonly operationalStore: Db,
    private readonly analyticsStore: IAnalyticsStore,
  ) {
    // Setup Default subgraphs
    this.registerSubgraph(AuthSubgraph);
    this.registerSubgraph(SystemSubgraph);
    this.registerSubgraph(DriveSubgraph);
    this.registerSubgraph(AnalyticsSubgraph);
  }

  async init() {
    console.log(`Initializing Subgraph Manager...`);
    const models = this.reactor.getDocumentModels();
    const driveModel = models.find(
      (it) => it.documentModelState.name === "DocumentDrive",
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
      analyticsStore: this.analyticsStore,
      reactor: this.reactor,
      subgraphManager: this,
    });
    await subgraphInstance.onSetup();
    this.subgraphs.unshift(subgraphInstance);
    console.log(
      `> Registered ${this.path.endsWith("/") ? this.path : this.path + "/"}${subgraphInstance.name} subgraph.`,
    );
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
