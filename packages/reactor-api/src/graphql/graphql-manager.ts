import type {
  GraphQLDataSourceProcessOptions,
  ServiceDefinition,
} from "@apollo/gateway";
import {
  ApolloGateway,
  LocalCompose,
  RemoteGraphQLDataSource,
} from "@apollo/gateway";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IReactorClient } from "@powerhousedao/reactor";
import type { Context, SubgraphClass } from "@powerhousedao/reactor-api";
import {
  DriveSubgraph,
  buildSubgraphSchemaModule,
  createSchema,
} from "@powerhousedao/reactor-api";
import bodyParser from "body-parser";
import cors from "cors";
import type { IDocumentDriveServer, IRelationalDb } from "document-drive";
import { childLogger, debounce } from "document-drive";
import type express from "express";
import type { IRouter } from "express";
import { Router } from "express";
import type { GraphQLSchema } from "graphql";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import type { Subgraph } from "./index.js";

class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  willSendRequest(options: GraphQLDataSourceProcessOptions) {
    const { authorization } = options.context.headers as {
      authorization: string;
    };
    // console.log("context", options.context.headers.authorization);
    if (authorization && options?.request.http) {
      options.request.http.headers.set("authorization", authorization);
    }
  }
}

export class GraphQLManager {
  private coreRouter: IRouter = Router();
  private coreSubgraphsMap = new Map<string, BaseSubgraph[]>();
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};
  private readonly subgraphs = new Map<string, Subgraph[]>();

  private readonly logger = childLogger(["reactor-api", "graphql-manager"]);

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
    private readonly reactorClient: IReactorClient,
    private readonly relationalDb: IRelationalDb,
    private readonly analyticsStore: IAnalyticsStore,
  ) {}

  async init(coreSubgraphs: SubgraphClass[]) {
    this.logger.debug(`Initializing Subgraph Manager...`);

    // check if Document Drive model is available
    const models = this.reactor.getDocumentModelModules();
    const driveModel = models.find(
      (it) => it.documentModel.name === "DocumentDrive",
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    this.coreRouter.use(cors());
    this.coreRouter.use(bodyParser.json({ limit: "50mb" }));
    this.coreRouter.use(
      bodyParser.urlencoded({ extended: true, limit: "50mb" }),
    );

    this.app.use("/", (req, res, next) => {
      this.setAdditionalContextFields({
        user: req.user,
        isAdmin: (address: string) =>
          !req.auth_enabled
            ? true
            : (req.admins
                ?.map((a) => a.toLowerCase())
                .includes(address.toLowerCase() ?? "") ?? false),
        isUser: (address: string) =>
          !req.auth_enabled
            ? true
            : (req.users
                ?.map((a) => a.toLowerCase())
                .includes(address.toLowerCase() ?? "") ?? false),
        isGuest: (address: string) =>
          !req.auth_enabled
            ? true
            : (req.guests
                ?.map((a) => a.toLowerCase())
                .includes(address.toLowerCase() ?? "") ?? false),
      });
      this.coreRouter(req, res, next);
    });
    this.app.use("/", (req, res, next) => {
      this.setAdditionalContextFields({
        user: req.user,
        isAdmin: (address: string) =>
          !req.auth_enabled
            ? true
            : (req.admins
                ?.map((a) => a.toLowerCase())
                .includes(address.toLowerCase() ?? "") ?? false),
        isUser: (address: string) =>
          !req.auth_enabled
            ? true
            : (req.users
                ?.map((a) => a.toLowerCase())
                .includes(address.toLowerCase() ?? "") ?? false),
        isGuest: (address: string) =>
          !req.auth_enabled
            ? true
            : (req.guests
                ?.map((a) => a.toLowerCase())
                .includes(address.toLowerCase() ?? "") ?? false),
      });
      this.reactorRouter(req, res, next);
    });

    await this.#setupCoreSubgraphs("graphql", coreSubgraphs);

    this.reactor.on("documentModelModules", () => {
      this.updateRouter().catch((error: unknown) => this.logger.error(error));
    });

    return this.updateRouter();
  }

  async #setupCoreSubgraphs(
    supergraph: string,
    coreSubgraphs: SubgraphClass[],
  ) {
    for (const subgraph of coreSubgraphs) {
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
      relationalDb: this.relationalDb,
      analyticsStore: this.analyticsStore,
      reactor: this.reactor,
      reactorClient: this.reactorClient,
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

    this.logger.info(
      `Registered ${this.path.endsWith("/") ? this.path : this.path + "/"}${supergraph ? supergraph + "/" : ""}${subgraphInstance.name} subgraph.`,
    );
    return subgraphInstance;
  }

  updateRouter = debounce(this._updateRouter.bind(this), 100);

  private async _updateRouter() {
    this.logger.debug("Updating router");
    const newRouter = Router();
    newRouter.use(cors());
    newRouter.use(bodyParser.json());

    // @todo:
    // if auth enabled, subgraphs are only available to guests, users and admins
    // if auth enabled, set req user to the graphql context
    // if auth disabled, subgraphs are available to all

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

  setSupergraph(supergraph: string, subgraphs: BaseSubgraph[]) {
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

  async #waitForServer(server: ApolloServer): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        server.assertStarted("waitForServer");
        resolve(true);
      } catch (e) {
        return setTimeout(100).then(() => this.#waitForServer(server));
      }
    });
  }

  #getSubgraphPath(subgraph: BaseSubgraph, supergraph: string) {
    return path.join(subgraph.path ?? "", supergraph, subgraph.name);
  }

  async #setupSubgraphs(
    subgraphsMap: Map<string, BaseSubgraph[]>,
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
    const subgraphsMap = new Map<string, BaseSubgraph>();
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

  #buildSubgraphSchemaModule(subgraph: BaseSubgraph) {
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

      const serviceList: ServiceDefinition[] = Array.from(
        subgraphs.entries(),
      ).map(([path, subgraph]) => ({
        name: path.replace("/", ":"),
        typeDefs: this.#buildSubgraphSchemaModule(subgraph).typeDefs,
        url: `${herokuOrLocal}${path}`,
      }));

      const gateway = new ApolloGateway({
        supergraphSdl: new LocalCompose({
          localServiceList: serviceList,
        }),
        buildService: (serviceConfig) => {
          return new AuthenticatedDataSource(serviceConfig);
        },
      });

      const server = new ApolloServer({
        gateway,
        introspection: true,
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
      this.logger.info(`Registered ${superGraphPath} supergraph `);
      return server;
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e.message);
      } else {
        this.logger.error("Could not create Apollo Gateway", e);
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
          db: this.relationalDb,
          ...this.getAdditionalContextFields(),
        }),
      }),
    );
  }

  #getLocalSubgraphConfig(
    subgraphName: string,
    subgraphsMap: Map<string, BaseSubgraph[]>,
  ): BaseSubgraph | undefined {
    for (const [_, subgraphs] of subgraphsMap) {
      const entry = subgraphs.find((it) => it.name === subgraphName);
      if (entry) return entry;
    }
    return undefined;
  }
}
