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
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { expressMiddleware } from "@as-integrations/express4";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type {
  Context,
  ISubgraph,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import bodyParser from "body-parser";
import cors from "cors";
import type { IDocumentDriveServer, IRelationalDb } from "document-drive";
import { childLogger, debounce } from "document-drive";
import type { DocumentModelModule } from "document-model";
import type express from "express";
import type { IRouter } from "express";
import { Router } from "express";
import type { GraphQLSchema } from "graphql";
import type http from "node:http";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import type { WebSocketServer } from "ws";
import type { AuthConfig } from "../services/auth.service.js";
import { AuthService } from "../services/auth.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import {
  buildSubgraphSchemaModule,
  createSchema,
} from "../utils/create-schema.js";
import { DocumentModelSubgraphLegacy } from "./document-model-subgraph.js";
import { DriveSubgraph } from "./drive-subgraph.js";
import { ReactorSubgraph } from "./reactor/subgraph.js";
import { useServer } from "./websocket.js";

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

const DOCUMENT_MODELS_TO_EXCLUDE = [
  "powerhouse/document-model",
  "powerhouse/document-drive",
];

/**
 * Check if a document model has any operations with valid schemas.
 * Document models without valid operation schemas cannot generate valid subgraph schemas.
 */
function hasOperationSchemas(documentModel: DocumentModelModule): boolean {
  const specification =
    documentModel.documentModel.global.specifications.at(-1);
  if (!specification) return false;
  // Check if any operation has a schema with actual GraphQL type definitions
  const hasValidSchema = (schema: string | null | undefined) =>
    schema && /\b(input|type|enum|union|interface)\s+\w+/.test(schema);
  return specification.modules.some((module) =>
    module.operations.some((op) => hasValidSchema(op.schema)),
  );
}

const DefaultFeatureFlags = {
  enableDocumentModelSubgraphs: true,
};

export type GraphqlManagerFeatureFlags = {
  enableDocumentModelSubgraphs?: boolean;
};

export class GraphQLManager {
  private initialized = false;
  private coreRouter: IRouter = Router();
  private coreSubgraphsMap = new Map<string, ISubgraph[]>();
  private reactorRouter: IRouter = Router();
  private contextFields: Record<string, any> = {};
  private readonly subgraphs = new Map<string, ISubgraph[]>();
  private authService: AuthService | null = null;

  private coreApolloServer: ApolloServer<Context> | null = null;

  private readonly logger = childLogger(["reactor-api", "graphql-manager"]);

  private readonly apolloLogger = childLogger([
    "reactor-api",
    "graphql-manager",
    "apollo",
  ]);

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly httpServer: http.Server,
    private readonly wsServer: WebSocketServer,
    private readonly reactor: IDocumentDriveServer,
    private readonly reactorClient: IReactorClient,
    private readonly relationalDb: IRelationalDb,
    private readonly analyticsStore: IAnalyticsStore,
    private readonly syncManager: ISyncManager,
    private readonly authConfig?: AuthConfig,
    private readonly documentPermissionService?: DocumentPermissionService,
    private readonly featureFlags: GraphqlManagerFeatureFlags = DefaultFeatureFlags,
  ) {
    if (this.authConfig) {
      this.authService = new AuthService(this.authConfig);
      this.setAdditionalContextFields(
        this.authService.getAdditionalContextFields(),
      );
    }
  }

  async init(coreSubgraphs: SubgraphClass[]) {
    this.logger.debug(`Initializing Subgraph Manager...`);

    // check if Document Drive model is available
    const models = this.reactor.getDocumentModelModules();
    const driveModel = models.find(
      (it) => it.documentModel.global.name === "DocumentDrive",
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

    if (this.featureFlags.enableDocumentModelSubgraphs) {
      await this.#setupDocumentModelSubgraphs(
        "graphql",
        this.reactor.getDocumentModelModules(),
      );
    }

    this.reactor.on("documentModelModules", (documentModels) => {
      if (this.featureFlags.enableDocumentModelSubgraphs) {
        this.#setupDocumentModelSubgraphs("graphql", documentModels)
          .then(() => this.updateRouter())
          .catch((error: unknown) => this.logger.error(error));
      } else {
        this.updateRouter().catch((error: unknown) => this.logger.error(error));
      }
    });

    return this.updateRouter();
  }

  async #setupCoreSubgraphs(
    supergraph: string,
    coreSubgraphs: SubgraphClass[],
  ) {
    for (const subgraph of coreSubgraphs) {
      try {
        await this.registerSubgraph(subgraph, supergraph, true);
      } catch (error) {
        this.logger.error(
          `Failed to setup core subgraph ${subgraph.name}`,
          error,
        );
      }
    }

    // special case for drive
    await this.registerSubgraph(DriveSubgraph, undefined, true);

    return this.#setupSubgraphs(this.coreSubgraphsMap, this.coreRouter);
  }

  async #setupDocumentModelSubgraphs(
    supergraph: string,
    documentModels: DocumentModelModule[],
  ) {
    for (const documentModel of documentModels) {
      if (
        DOCUMENT_MODELS_TO_EXCLUDE.includes(
          documentModel.documentModel.global.id,
        )
      ) {
        continue; // Skip the legacy document model
      }
      if (!hasOperationSchemas(documentModel)) {
        continue; // Skip document models without operation schemas
      }
      try {
        const subgraphInstance = new DocumentModelSubgraphLegacy(
          documentModel,
          {
            relationalDb: this.relationalDb,
            analyticsStore: this.analyticsStore,
            reactor: this.reactor,
            reactorClient: this.reactorClient,
            graphqlManager: this,
            syncManager: this.syncManager,
            path: this.path,
            documentPermissionService: this.documentPermissionService,
          },
        );

        await this.#addSubgraphInstance(subgraphInstance, supergraph, false);
      } catch (error) {
        this.logger.error(
          `Failed to setup document model subgraph for ${documentModel.documentModel.global.id}`,
          error instanceof Error ? error.message : error,
        );
        this.logger.debug(error);
      }
    }

    // special case for drive
    await this.registerSubgraph(DriveSubgraph, undefined, true);

    // special case for new reactor
    await this.registerSubgraph(ReactorSubgraph, undefined, true);

    return this.#setupSubgraphs(this.coreSubgraphsMap, this.coreRouter);
  }

  async #addSubgraphInstance(
    subgraphInstance: ISubgraph,
    supergraph = "",
    core = false,
  ) {
    await subgraphInstance.onSetup?.();

    const subgraphsMap = core ? this.coreSubgraphsMap : this.subgraphs;

    const subgraphs = subgraphsMap.get(supergraph) ?? [];

    const existingSubgraph = subgraphs.find(
      (it) => it.name === subgraphInstance.name,
    );

    subgraphs.push(subgraphInstance);

    subgraphsMap.set(supergraph, subgraphs);

    // also add to global graphql supergraph
    if (supergraph !== "" && supergraph !== "graphql") {
      subgraphsMap.get("graphql")?.push(subgraphInstance);
    }

    const logMessage = `Registered ${this.path.endsWith("/") ? this.path : this.path + "/"}${supergraph ? supergraph + "/" : ""}${subgraphInstance.name} subgraph.`;
    if (!existingSubgraph) {
      this.logger.info(logMessage);
    } else {
      this.logger.debug(logMessage);
    }
    return subgraphInstance;
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
      syncManager: this.syncManager,
      path: this.path,
      documentPermissionService: this.documentPermissionService,
    });

    return this.#addSubgraphInstance(subgraphInstance, supergraph, core);
  }

  updateRouter = debounce(this._updateRouter.bind(this), 1000);

  private async _updateRouter() {
    this.logger.debug("Updating router");
    const newRouter = Router();
    newRouter.use(cors());
    newRouter.use(bodyParser.json({ limit: "50mb" }));

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

  async #createWebSocketContext(
    connectionParams: Record<string, unknown>,
  ): Promise<Context> {
    let user = null;

    if (this.authService) {
      user =
        await this.authService.authenticateWebSocketConnection(
          connectionParams,
        );
    }

    const context: Context = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      headers: connectionParams as any,
      driveServer: this.reactor,
      db: this.relationalDb,
      ...this.getAdditionalContextFields(),
    };

    if (user) {
      context.user = user;
    }

    return context;
  }

  setSupergraph(supergraph: string, subgraphs: ISubgraph[]) {
    this.subgraphs.set(supergraph, subgraphs);
    const globalSubgraphs = this.subgraphs.get("graphql");
    if (globalSubgraphs) {
      this.subgraphs.set("graphql", [...globalSubgraphs, ...subgraphs]);
    } else {
      this.subgraphs.set("graphql", subgraphs);
    }
    return this.updateRouter();
  }

  async shutdown(): Promise<void> {
    this.logger.info("Shutting down GraphQL Manager");

    return new Promise((resolve) => {
      this.wsServer.close(() => {
        this.logger.info("WebSocket server closed");
        resolve();
      });
    });
  }

  #createApolloServer(schema: GraphQLSchema) {
    return new ApolloServer<Context>({
      schema,
      logger: this.apolloLogger,
      introspection: true,
      plugins: [
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginLandingPageLocalDefault(),
      ],
    });
  }

  async #waitForServer(server: ApolloServer<Context>): Promise<boolean> {
    try {
      server.assertStarted("waitForServer");
      return true;
    } catch {
      await setTimeout(100);
      return this.#waitForServer(server);
    }
  }

  #getSubgraphPath(subgraph: ISubgraph, supergraph: string) {
    return path.join(subgraph.path ?? "", supergraph, subgraph.name);
  }

  async #setupSubgraphs(
    subgraphsMap: Map<string, ISubgraph[]>,
    router: IRouter,
  ) {
    for (const [supergraph, subgraphs] of subgraphsMap.entries()) {
      for (const subgraph of subgraphs) {
        this.logger.debug(`Setting up subgraph ${subgraph.name}`);
        try {
          // create subgraph schema
          const schema = createSchema(
            this.reactor,
            subgraph.resolvers,
            subgraph.typeDefs,
          );

          // create and start apollo server
          const server = this.#createApolloServer(schema);
          server.startInBackgroundHandlingStartupErrorsByLoggingAndFailingAllRequests();
          await this.#waitForServer(server);

          if (subgraph.hasSubscriptions) {
            useServer(
              {
                schema,
                context: async (ctx: {
                  connectionParams?: Record<string, unknown>;
                }) => {
                  const connectionParams = (ctx.connectionParams ??
                    {}) as Record<string, unknown>;
                  return this.#createWebSocketContext(connectionParams);
                },
              },
              this.wsServer,
            );
            this.logger.info(
              `WebSocket subscriptions enabled for ${subgraph.name}`,
            );
          }

          const path = this.#getSubgraphPath(subgraph, supergraph);
          this.#setupApolloExpressMiddleware(server, router, path);
        } catch (error) {
          this.logger.error(
            `Failed to setup subgraph ${subgraph.name} at path ${this.#getSubgraphPath(subgraph, supergraph)}`,
          );
          this.logger.error(error);
        }
      }
    }
  }

  #getAllSubgraphs() {
    const subgraphsMap = new Map<string, ISubgraph>();
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

  #buildSubgraphSchemaModule(subgraph: ISubgraph) {
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

      if (this.coreApolloServer) {
        try {
          await this.#waitForServer(this.coreApolloServer);
          await this.coreApolloServer.stop();
        } catch {
          // ignore error when stopping apollo server
        }
      }

      this.coreApolloServer = new ApolloServer<Context>({
        gateway,
        logger: this.apolloLogger,
        introspection: true,
        plugins: [
          ApolloServerPluginInlineTraceDisabled(),
          ApolloServerPluginLandingPageLocalDefault(),
        ],
      });

      await this.coreApolloServer.start();
      await this.#waitForServer(this.coreApolloServer);

      const superGraphPath = path.join(this.path, "graphql");
      this.#setupApolloExpressMiddleware(
        this.coreApolloServer,
        this.reactorRouter,
        superGraphPath,
      );

      if (!this.initialized) {
        this.logger.info(`Registered ${superGraphPath} supergraph `);
        this.initialized = true;
      }
      return;
    } catch (e) {
      if (e instanceof Error) {
        this.logger.error(e.message);
      } else {
        this.logger.error("Could not create Apollo Gateway", e);
      }
    }
  }

  #setupApolloExpressMiddleware(
    server: ApolloServer<Context>,
    router: IRouter,
    path: string,
  ) {
    router.use(
      path,
      expressMiddleware(server, {
        context: ({ req }) =>
          Promise.resolve<Context>({
            headers: req.headers,
            driveId: req.params.drive ?? undefined,
            driveServer: this.reactor,
            db: this.relationalDb,
            ...this.getAdditionalContextFields(),
          }),
      }),
    );
  }
}
