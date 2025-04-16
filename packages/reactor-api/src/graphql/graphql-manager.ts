import { type Db } from "#types.js";
import {
  buildSubgraphSchemaModule,
  createSchema,
} from "#utils/create-schema.js";
import {
  ApolloGateway,
  LocalCompose,
  type ServiceDefinition,
} from "@apollo/gateway";
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
import { setTimeout } from "node:timers/promises";
import { AnalyticsSubgraph } from "./analytics/index.js";
import { AuthSubgraph } from "./auth/index.js";
import { DriveSubgraph } from "./drive/index.js";
import { type Subgraph, type SubgraphClass } from "./index.js";
import { SystemSubgraph } from "./system/index.js";
import { type Context } from "./types.js";

export const DefaultCoreSubgraphs = [
  AuthSubgraph,
  SystemSubgraph,
  AnalyticsSubgraph,
] as const;

export class GraphQLManager {
  private coreRouter: IRouter = Router();
  private coreSubgraphsMap = new Map<string, Subgraph[]>();
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
    private readonly operationalStore: Db,
    private readonly analyticsStore: IAnalyticsStore,
    private readonly subgraphs: Map<string, Subgraph[]> = new Map(),
    private readonly coreSubgraphs: SubgraphClass[] = DefaultCoreSubgraphs.slice(),
  ) {}

  async init() {
    console.log(`> Initializing Subgraph Manager...`);

    // check if Document Drive model is available
    const models = this.reactor.getDocumentModelModules();
    const driveModel = models.find(
      (it) => it.documentModel.name === "DocumentDrive",
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    this.coreRouter.use(cors());
    this.coreRouter.use(bodyParser.json());

    this.app.use("/", (req, res, next) => this.coreRouter(req, res, next));
    this.app.use("/", (req, res, next) => this.reactorRouter(req, res, next));

    await this.#setupCoreSubgraphs("graphql");

    this.reactor.on("documentModelModules", () => {
      this.updateRouter().catch((error: unknown) => console.error(error));
    });

    return this.updateRouter();
  }

  async #setupCoreSubgraphs(supergraph: string) {
    for (const subgraph of this.coreSubgraphs) {
      await this.registerSubgraph(subgraph, supergraph, true);
    }

    // special case for drive
    await this.registerSubgraph(DriveSubgraph, undefined, true);

    return this.#setupSubgraphs(this.coreSubgraphsMap, this.coreRouter);
  }

  async registerSubgraph(
    subgraph: SubgraphClass,
    supergraph = "",
    core = false,
  ) {
    const subgraphInstance = new subgraph({
      operationalStore: this.operationalStore,
      analyticsStore: this.analyticsStore,
      reactor: this.reactor,
      graphqlManager: this,
      path: this.path,
    });

    await subgraphInstance.onSetup();

    const subgraphsMap = core ? this.coreSubgraphsMap : this.subgraphs;

    if (!subgraphsMap.get(supergraph)) {
      subgraphsMap.set(supergraph, []);
    }

    subgraphsMap.get(supergraph)?.push(subgraphInstance);

    // also add to global graphql supergraph
    if (supergraph !== "" && supergraph !== "graphql") {
      subgraphsMap.get("graphql")?.push(subgraphInstance);
    }

    console.log(
      `> Registered ${this.path.endsWith("/") ? this.path : this.path + "/"}${supergraph ? supergraph + "/" : ""}${subgraphInstance.name} subgraph.`,
    );
    return subgraphInstance;
  }

  async updateRouter() {
    console.log("> Updating router");
    const newRouter = Router();
    newRouter.use(cors());
    newRouter.use(bodyParser.json());
    await this.#setupSubgraphs(this.subgraphs, newRouter);
    this.reactorRouter = newRouter;
    await this.#createApolloGateway();
    return;
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
    return this.updateRouter();
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
        return setTimeout(100).then(() => this.#waitForServer(server));
      }
    });
  }

  #getSubgraphPath(subgraph: Subgraph, supergraph: string) {
    return path.join(subgraph.path, supergraph, subgraph.name);
  }

  async #setupSubgraphs(
    subgraphsMap: Map<string, Subgraph[]>,
    router: IRouter,
  ) {
    for (const [supergraph, subgraphs] of subgraphsMap.entries()) {
      for (const subgraph of subgraphs) {
        const subgraphConfig = this.#getLocalSubgraphConfig(
          subgraph.name,
          subgraphsMap,
        );
        if (!subgraphConfig) continue;
        // create subgraph schema
        const schema = createSchema(
          this.reactor,
          subgraphConfig.resolvers,
          subgraphConfig.typeDefs,
        );
        // create and start apollo server
        const server = this.#createApolloServer(schema);
        await server.start();
        await this.#waitForServer(server);

        const path = this.#getSubgraphPath(subgraph, supergraph);
        this.#setupApolloExpressMiddleware(server, router, path);
      }
    }
  }

  #getAllSubgraphs() {
    const subgraphsMap = new Map<string, Subgraph>();
    for (const [supergraph, subgraphs] of [
      ...this.coreSubgraphsMap.entries(),
      ...this.subgraphs.entries(),
    ]) {
      if (supergraph === "") {
        continue;
      }

      for (const subgraph of subgraphs) {
        const path = this.#getSubgraphPath(subgraph, supergraph);
        subgraphsMap.set(path, subgraph);
      }
    }
    return subgraphsMap;
  }

  #buildSubgraphSchemaModule(subgraph: Subgraph) {
    return buildSubgraphSchemaModule(
      this.reactor,
      subgraph.resolvers,
      subgraph.typeDefs,
    );
  }

  async #createApolloGateway() {
    const subgraphs = this.#getAllSubgraphs();

    try {
      const herokuOrLocal = process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME
        ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`
        : `http://localhost:${process.env.PORT ?? 4001}`;

      const serviceList: ServiceDefinition[] = subgraphs
        .entries()
        .toArray()
        .map(([path, subgraph]) => ({
          name: path.replace("/", ":"),
          typeDefs: this.#buildSubgraphSchemaModule(subgraph).typeDefs,
          url: `${herokuOrLocal}${path}`,
        }));

      const gateway = new ApolloGateway({
        supergraphSdl: new LocalCompose({
          localServiceList: serviceList,
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

      const superGraphPath = path.join(this.path, "graphql");
      this.#setupApolloExpressMiddleware(
        server,
        this.reactorRouter,
        superGraphPath,
      );
      console.log(`> Registered ${superGraphPath} supergraph `);
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
  }

  #getLocalSubgraphConfig(
    subgraphName: string,
    subgraphsMap: Map<string, Subgraph[]>,
  ): Subgraph | undefined {
    for (const [_, subgraphs] of subgraphsMap) {
      const entry = subgraphs.find((it) => it.name === subgraphName);
      if (entry) return entry;
    }
    return undefined;
  }
}
