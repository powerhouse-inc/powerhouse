import { type Db } from "#types.js";
import { createSchema } from "#utils/create-schema.js";
import { ApolloGateway, IntrospectAndCompose } from "@apollo/gateway";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import bodyParser from "body-parser";
import cors from "cors";
import { type IDocumentDriveServer } from "document-drive";
import type express from "express";
import { Router, type IRouter } from "express";
import { type GraphQLSchema } from "graphql";
import path from "node:path";
import { AnalyticsSubgraph } from "./analytics/index.js";
import { AuthSubgraph } from "./auth/index.js";
import { DriveSubgraph } from "./drive/index.js";
import { type Subgraph, type SubgraphClass } from "./index.js";
import { SystemSubgraph } from "./system/index.js";
import { type Context } from "./types.js";
export class GraphQLManager {
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
    private readonly operationalStore: Db,
    private readonly analyticsStore: IAnalyticsStore,
    private readonly subgraphs: Map<string, Subgraph[]> = new Map(),
  ) {}

  async init() {
    console.log(`> Initializing Subgraph Manager...`);

    // Setup Default subgraphs
    await this.registerSubgraph(AuthSubgraph, "graphql");
    await this.registerSubgraph(SystemSubgraph, "graphql");
    await this.registerSubgraph(AnalyticsSubgraph, "graphql");

    // special case for drive
    await this.registerSubgraph(DriveSubgraph);
    const models = this.reactor.getDocumentModelModules();
    const driveModel = models.find(
      (it) => it.documentModel.name === "DocumentDrive",
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    this.reactor.on("documentModelModules", () => {
      this.updateRouter().catch((error: unknown) => console.error(error));
    });

    this.app.use("/", (req, res, next) => this.reactorRouter(req, res, next));

    return this.updateRouter();
  }

  async registerSubgraph(subgraph: SubgraphClass, supergraph = "") {
    const subgraphInstance = new subgraph({
      operationalStore: this.operationalStore,
      analyticsStore: this.analyticsStore,
      reactor: this.reactor,
      graphqlManager: this,
      path: this.path,
    });

    await subgraphInstance.onSetup();
    if (!this.subgraphs.get(supergraph)) {
      if (supergraph !== "") {
        console.log(`> Created /${supergraph} supergraph `);
      }
      this.subgraphs.set(supergraph, []);
    }

    this.subgraphs.get(supergraph)?.push(subgraphInstance);
    // also add to global graphql supergraph
    if (supergraph !== "" && supergraph !== "graphql") {
      this.subgraphs.get("graphql")?.push(subgraphInstance);
    }

    console.log(
      `> Registered ${this.path.endsWith("/") ? this.path : this.path + "/"}${supergraph ? supergraph + "/" : ""}${subgraphInstance.name} subgraph.`,
    );
  }

  async updateRouter() {
    console.log("> Updating router");
    const newRouter = Router();
    newRouter.use(cors());
    newRouter.use(bodyParser.json());
    await this.#setupSubgraphs(newRouter);
    this.reactorRouter = newRouter;
  }

  getAdditionalContextFields = () => {
    return this.contextFields;
  };

  setAdditionalContextFields(fields: Record<string, any>) {
    this.contextFields = { ...this.contextFields, ...fields };
  }

  setSupergraph(supergraph: string, subgraphs: Subgraph[]) {
    this.subgraphs.set(supergraph, subgraphs);
    const globalSubgraphs = this.subgraphs.get("graphql");
    if (globalSubgraphs) {
      this.subgraphs.set("graphql", [...globalSubgraphs, ...subgraphs]);
    } else {
      this.subgraphs.set("graphql", subgraphs);
    }
    this.updateRouter();
  }

  #createApolloServer(schema: GraphQLSchema) {
    return new ApolloServer({
      schema,
      introspection: true,
      plugins: [
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginLandingPageLocalDefault(),
      ],
    });
  }

  async #waitForServer(server: ApolloServer) {
    return new Promise((resolve) => {
      try {
        server.assertStarted("waitForServer");
        resolve(true);
      } catch (e) {
        setTimeout(() => this.#waitForServer(server), 100);
      }
    });
  }

  #getSubgraphPath(subgraph: Subgraph, supergraph: string) {
    return path.join(subgraph.path, supergraph, subgraph.name);
  }

  async #setupSubgraphs(router: IRouter) {
    for (const [supergraph, subgraphs] of this.subgraphs.entries()) {
      const supergraphEndpoints: string[] = [];
      for (const subgraph of subgraphs) {
        const subgraphConfig = this.#getLocalSubgraphConfig(subgraph.name);
        if (!subgraphConfig) continue;
        // create subgraph schema
        const schema = createSchema(
          this.reactor,
          subgraphConfig.resolvers,
          subgraphConfig.typeDefs,
        );
        // create and start apollo server
        const server = this.#createApolloServer(schema);
        const path = this.#getSubgraphPath(subgraph, supergraph);
        await server.start();
        await this.#waitForServer(server);
        this.#setupApolloExpressMiddleware(server, router, path);
        if (supergraph !== "") {
          supergraphEndpoints.push(this.#getSubgraphPath(subgraph, supergraph));
        }
      }

      if (supergraphEndpoints.length > 0) {
        await this.#sleep(1000);
        const supergraphServer =
          await this.#createApolloGateway(supergraphEndpoints);
        if (supergraphServer) {
          const superGraphPath = path.join(this.path, supergraph ?? "graphql");
          this.#setupApolloExpressMiddleware(
            supergraphServer,
            router,
            superGraphPath,
          );
        }
      }
    }
  }

  #sleep(ms: number) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async #createApolloGateway(endpoints: string[]) {
    const uniqueEndpoints = new Set([...endpoints]);
    try {
      const herokuOrLocal = process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME
        ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`
        : `http://localhost:${process.env.PORT ?? 4001}`;

      const gateway = new ApolloGateway({
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: Array.from(uniqueEndpoints).map((endpoint) => ({
            name: endpoint.replaceAll("/", ""),
            url: `${herokuOrLocal}${endpoint}`,
          })),
        }),
      });

      const server = new ApolloServer({
        gateway,
        plugins: [
          ApolloServerPluginInlineTraceDisabled(),
          ApolloServerPluginLandingPageLocalDefault(),
        ],
      });

      await server.start();
      return server;
    } catch (e) {
      if (e instanceof Error) {
        console.error("> " + e.message);
      } else {
        console.error("> Could not create Apollo Gateway");
      }
    }
  }

  #setupApolloExpressMiddleware(
    server: ApolloServer,
    router: IRouter,
    path: string,
  ) {
    router.use(
      path,
      // @ts-expect-error todo check type defs
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

    this.reactorRouter = router;
  }

  #getLocalSubgraphConfig(subgraphName: string): Subgraph | undefined {
    for (const [_, subgraphs] of this.subgraphs) {
      const entry = subgraphs.find((it) => it.name === subgraphName);
      if (entry) return entry;
    }
    return undefined;
  }
}
