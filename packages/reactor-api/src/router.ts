import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import bodyParser from "body-parser";
import cors from "cors";
import { IDocumentDriveServer, Listener } from "document-drive";
import express, { IRouter, Router } from "express";
import { ProcessorManager } from "./processor-manager";
import { AnalyticsProcessor, Processor } from "./processors/analytics-processor";
import { ProcessorFactory } from "./processors/processor-factory";
import { analyticsSubgraph, driveSubgraph, systemSubgraph } from "./subgraphs";
import { Context, ProcessorType, Subgraph } from "./types";
import { createSchema } from "./utils/create-schema";

export class ReactorRouterManager {
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};

  // @todo: need to persist somewhere
  private subgraphs: Subgraph[] = [
    {
      name: "system",
      resolvers: systemSubgraph.resolvers,
      typeDefs: systemSubgraph.typeDefs,
    },
    {
      name: "d/:drive",
      resolvers: driveSubgraph.resolvers,
      typeDefs: driveSubgraph.typeDefs,
    },
    {
      name: "analytics",
      resolvers: analyticsSubgraph.resolvers,
      typeDefs: analyticsSubgraph.typeDefs,
    },
  ];

  private processorFactory: ProcessorFactory;
  private processorManager: ProcessorManager;

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
    private readonly analyticsStore: IAnalyticsStore,
  ) {
    this.processorFactory = new ProcessorFactory(this.reactor, this.analyticsStore);
    this.processorManager = new ProcessorManager(
      this.reactor,
      this.processorFactory
    )
  }

  async init() {
    await this.processorManager.init();
    const models = this.reactor.getDocumentModels();
    const driveModel = models.find(
      (it) => it.documentModel.name === "DocumentDrive"
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    this.reactor.on("documentModels", () => {
      this.updateRouter().catch((error: unknown) => console.error(error));
    });

    this.app.use(this.path, (req, res, next) =>
      this.reactorRouter(req, res, next)
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
      console.log(`Setting up subgraph ${subgraphConfig.name}`);
      // get schema
      const schema = createSchema(
        this.reactor,
        subgraphConfig.resolvers,
        subgraphConfig.typeDefs
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
            // analyticStore: undefined, // TODO: add analytic store
            ...this.getAdditionalContextFields(),
          }),
        })
      );
    }

    this.reactorRouter = newRouter;
    console.log("Router updated.");
  }

  async registerSubgraph(subgraph: Subgraph) {
    this.subgraphs.unshift(subgraph);
    console.log(`Registered [${subgraph.name}] subgraph.`);
  }

  async registerProcessor(processor: ProcessorType<AnalyticsProcessor>) {
    this.processorManager.registerProcessorType(processor);
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
