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
import { AnalyticsSubgraph } from "./analytics/index.js";
import { AuthSubgraph } from "./auth/index.js";
import { DriveSubgraph } from "./drive/index.js";
import { type Subgraph, type SubgraphClass } from "./index.js";
import { SystemSubgraph } from "./system/index.js";
import { type Context, type ISubgraph } from "./types.js";
export class SubgraphManager {
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
    private readonly operationalStore: Db,
    private readonly analyticsStore: IAnalyticsStore,
    private readonly subgraphs: Map<string, Subgraph[]> = new Map(),
  ) {
    // Setup Default subgraphs
    this.registerSubgraph(AuthSubgraph);
    this.registerSubgraph(SystemSubgraph);
    this.registerSubgraph(DriveSubgraph);
    this.registerSubgraph(AnalyticsSubgraph);
  }

  async init() {
    console.log(`> Initializing Subgraph Manager...`);
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

    this.app.use(this.path, (req, res, next) =>
      this.reactorRouter(req, res, next),
    );
  }

  async registerSubgraph(subgraph: SubgraphClass, supergraph = "", path = "") {
    const subgraphInstance = new subgraph({
      operationalStore: this.operationalStore,
      analyticsStore: this.analyticsStore,
      reactor: this.reactor,
      subgraphManager: this,
      path,
    });
    await subgraphInstance.onSetup();
    if (!this.subgraphs.get(supergraph)) {
      if (supergraph !== "") {
        console.log(`> Created /${supergraph} supergraph `);
      }
      this.subgraphs.set(supergraph, []);
    }
    this.subgraphs.get(supergraph)?.push(subgraphInstance);
    console.log(
      `> Registered ${supergraph ? "/" + supergraph : ""}${this.path.endsWith("/") ? this.path : this.path + "/"}${subgraphInstance.name} subgraph.`,
    );
    await this.updateRouter();
  }

  async updateRouter() {
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

  async #setupSubgraphs(router: IRouter) {
    for (const supergraph of Object.keys(this.subgraphs)) {
      const supergraphEndpoints: Record<string, ApolloServer> = {};
      for (const subgraph of this.subgraphs.get(supergraph) ?? []) {
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
        const path = `${subgraph.path ? "/" + subgraph.path : ""}/${subgraphConfig.name}`;
        await server.start();
        await this.#waitForServer(server);
        this.#setupApolloExpressMiddleware(server, router, path);
        if (supergraph !== "") {
          supergraphEndpoints[path] = server;
        }
      }

      if (Object.keys(supergraphEndpoints).length > 0) {
        const supergraphServer =
          await this.#createApolloGateway(supergraphEndpoints);
        if (supergraphServer) {
          const path = `/${supergraph}`;
          this.#setupApolloExpressMiddleware(supergraphServer, router, path);
          console.log(`> Updated Apollo Gateway at ${path}`);
        }
      }
    }
  }

  async #createApolloGateway(endpoints: Record<string, ApolloServer>) {
    try {
      const gateway = new ApolloGateway({
        supergraphSdl: new IntrospectAndCompose({
          subgraphs: Object.keys(endpoints).map((path) => ({
            name: path.replaceAll("/", ""),
            url: `http://localhost:${process.env.PORT ?? 4001}${path}`,
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

  #getLocalSubgraphConfig(subgraphName: string): ISubgraph | undefined {
    for (const [_, subgraphs] of this.subgraphs) {
      const entry = subgraphs.find((it: ISubgraph) => it.name === subgraphName);
      if (entry) return entry;
    }
    return undefined;
  }
}
