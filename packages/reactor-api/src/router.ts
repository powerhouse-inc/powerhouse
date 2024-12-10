import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { PGlite } from "@electric-sql/pglite";
import bodyParser from "body-parser";
import cors from "cors";
import { IDocumentDriveServer } from "document-drive";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { PgDatabase } from "drizzle-orm/pg-core";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import express, { IRouter, Router } from "express";
import pg from "pg";
import {
  InternalListenerManager,
  InternalListenerModule,
} from "./internal-listener-manager";
import { driveSubgraph, systemSubgraph } from "./subgraphs";
import { Context, Processor } from "./types";
import { createSchema } from "./utils/create-schema";
const { Pool } = pg;

export class ReactorRouterManager {
  private database: PgDatabase<any, any, any> | undefined;
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};

  // @todo: need to persist somewhere
  private registry: Processor[] = [
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
  ];
  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly driveServer: IDocumentDriveServer,
    private readonly client: PGlite | typeof Pool = new PGlite(),
    private listenerManager: InternalListenerManager = new InternalListenerManager(
      driveServer,
    ),
  ) {}

  async init() {
    if (this.client instanceof Pool) {
      this.database = drizzlePg(this.client);
    } else {
      this.database = drizzlePglite(this.client as PGlite);
    }
    await this.listenerManager.init();
    const models = this.driveServer.getDocumentModels();
    const driveModel = models.find(
      (it) => it.documentModel.name === "DocumentDrive",
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    this.driveServer.on("documentModels", () => {
      this.updateRouter().catch((error: unknown) => console.error(error));
    });

    this.app.use(this.path, (req, res, next) =>
      this.reactorRouter(req, res, next),
    );

    await this.updateRouter();
  }

  async updateRouter() {
    if (!this.database) {
      await this.init();
    }

    const newRouter = Router();
    newRouter.use(cors());
    newRouter.use(bodyParser.json());
    // Run each subgraph on the same http server, but at different paths
    for (const subgraph of this.registry) {
      if (subgraph.options && subgraph.transmit) {
        await this.#registerInternalListener({
          name: subgraph.name,
          options: subgraph.options,
          transmit: subgraph.transmit,
        });
      }

      const subgraphConfig = this.#getLocalSubgraphConfig(subgraph.name);
      if (!subgraphConfig) continue;
      console.log(`Setting up subgraph ${subgraphConfig.name}`);
      // get schema
      const schema = createSchema(
        this.driveServer,
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
            driveServer: this.driveServer,
            db: this.database!,
            // analyticStore: undefined, // TODO: add analytic store
            ...this.getAdditionalContextFields(),
          }),
        }),
      );
    }

    this.reactorRouter = newRouter;
    console.log("Router updated.");
  }

  async registerProcessor(processor: Processor) {
    const schema = createSchema(
      this.driveServer,
      processor.resolvers,
      processor.typeDefs,
    );

    this.registry.unshift({
      ...processor,
    });

    // update router
    console.log(`Registering [${processor.name}] processor.`);
    await this.updateRouter();
  }

  #getLocalSubgraphConfig(subgraphName: string) {
    return this.registry.find((it) => it.name === subgraphName);
  }

  async #registerInternalListener(module: InternalListenerModule) {
    if (!this.listenerManager) {
      throw new Error("Listener manager not initialized");
    }
    await this.listenerManager.registerInternalListener(module);
  }

  getAdditionalContextFields = () => {
    return this.contextFields;
  };

  setAdditionalContextFields(fields: Record<string, any>) {
    this.contextFields = { ...this.contextFields, ...fields };
  }
}
