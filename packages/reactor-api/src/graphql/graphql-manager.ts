import type {
  GetDataSourceFunction,
  GraphQLDataSourceProcessOptions,
  ServiceDefinition,
  SubgraphHealthCheckFunction,
  SupergraphSdlUpdateFunction,
} from "@apollo/gateway";
import {
  ApolloGateway,
  LocalCompose,
  RemoteGraphQLDataSource,
} from "@apollo/gateway";
import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
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
import type {
  DocumentDriveDocument,
  IDocumentDriveServer,
  ILogger,
  IRelationalDbLegacy,
} from "document-drive";
import { childLogger, debounce, responseForDrive } from "document-drive";
import type { DocumentModelModule } from "document-model";
import type express from "express";
import type { IRouter } from "express";
import { Router } from "express";
import type { GraphQLSchema } from "graphql";
import type http from "node:http";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { match, type MatchFunction, type ParamData } from "path-to-regexp";
import type { WebSocketServer } from "ws";
import type { AuthConfig } from "../services/auth.service.js";
import { AuthService } from "../services/auth.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import {
  buildSubgraphSchemaModule,
  createSchema,
} from "../utils/create-schema.js";
import {
  DocumentModelSubgraph,
  DocumentModelSubgraphLegacy,
} from "./document-model-subgraph.js";
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

const DOCUMENT_MODELS_TO_EXCLUDE: string[] = [];

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

/**
 * Filter document models to keep only the latest version of each unique document model.
 * When multiple versions exist with the same name, the one with the most recent specification is kept.
 */
function filterLatestDocumentModelVersions(
  documentModels: DocumentModelModule[],
): DocumentModelModule[] {
  const latestByName = new Map<string, DocumentModelModule>();

  for (const documentModel of documentModels) {
    const name = documentModel.documentModel.global.name;
    const existing = latestByName.get(name);

    if (!existing) {
      latestByName.set(name, documentModel);
      continue;
    }

    // Compare version numbers from the latest specification
    const currentVersion =
      documentModel.documentModel.global.specifications.at(-1)?.version ?? 0;
    const existingVersion =
      existing.documentModel.global.specifications.at(-1)?.version ?? 0;

    if (currentVersion > existingVersion) {
      latestByName.set(name, documentModel);
    }
  }

  return Array.from(latestByName.values());
}

const DefaultFeatureFlags = {
  enableDocumentModelSubgraphs: true,
  useNewDocumentModelSubgraph: false,
};

export type GraphqlManagerFeatureFlags = {
  enableDocumentModelSubgraphs?: boolean;
  useNewDocumentModelSubgraph?: boolean;
};

export class GraphQLManager {
  private initialized = false;
  private router: IRouter = Router();
  private coreSubgraphsMap = new Map<string, ISubgraph[]>();
  private contextFields: Record<string, any> = {};
  private readonly subgraphs = new Map<string, ISubgraph[]>();
  private authService: AuthService | null = null;

  private coreApolloServer: ApolloServer<Context> | null = null;
  private readonly subgraphServers = new Map<string, ApolloServer<Context>>();
  private readonly subgraphHandlers = new Map<
    string,
    {
      handler: express.RequestHandler;
      matcher: MatchFunction<ParamData>;
    }
  >();
  private readonly subgraphWsDisposers = new Map<
    string,
    { dispose: () => void | Promise<void> }
  >();
  private gatewayOptions: {
    update: SupergraphSdlUpdateFunction;
    healthCheck: SubgraphHealthCheckFunction;
    getDataSource: GetDataSourceFunction;
  } | null = null;

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
    private readonly relationalDb: IRelationalDbLegacy,
    private readonly analyticsStore: IAnalyticsStore,
    private readonly syncManager: ISyncManager,
    private readonly logger: ILogger,
    private readonly authConfig?: AuthConfig,
    private readonly documentPermissionService?: DocumentPermissionService,
    private readonly featureFlags: GraphqlManagerFeatureFlags = DefaultFeatureFlags,
    private readonly port: number = 4001,
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

    this.router.use(cors());
    this.router.use(bodyParser.json({ limit: "50mb" }));
    this.router.use(bodyParser.urlencoded({ extended: true, limit: "50mb" }));

    this.router.use("/graphql", (req, res, next) => {
      const result = this.subgraphHandlers.values().find(({ matcher }) => {
        return matcher("/graphql" + req.path);
      });
      if (!result) {
        return res.status(404).send(`${req.path} subgraph not found`);
      }
      return result.handler(req, res, next);
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
      this.router(req, res, next);
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
          .catch((error: unknown) => this.logger.error("@error", error));
      } else {
        this.updateRouter().catch((error: unknown) =>
          this.logger.error("@error", error),
        );
      }
    });

    await this.#createApolloGateway();

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

    // REST endpoint for drive info at /d/:drive
    this.#setupDriveInfoRestEndpoint(this.router);

    return this.#setupSubgraphs(this.coreSubgraphsMap);
  }

  async #setupDocumentModelSubgraphs(
    supergraph: string,
    documentModels: DocumentModelModule[],
  ) {
    // Filter to keep only the latest version of each document model
    const latestDocumentModels =
      filterLatestDocumentModelVersions(documentModels);

    for (const documentModel of latestDocumentModels) {
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
        const SubgraphClass = this.featureFlags.useNewDocumentModelSubgraph
          ? DocumentModelSubgraph
          : DocumentModelSubgraphLegacy;

        const subgraphInstance = new SubgraphClass(documentModel, {
          relationalDb: this.relationalDb,
          analyticsStore: this.analyticsStore,
          reactor: this.reactor,
          reactorClient: this.reactorClient,
          graphqlManager: this,
          syncManager: this.syncManager,
          path: this.path,
          documentPermissionService: this.documentPermissionService,
        });

        await this.#addSubgraphInstance(subgraphInstance, supergraph, false);
      } catch (error) {
        this.logger.error(
          `Failed to setup document model subgraph for ${documentModel.documentModel.global.id}`,
          error instanceof Error ? error.message : error,
        );
        this.logger.debug("@error", error);
      }
    }

    return this.#setupSubgraphs(this.coreSubgraphsMap);
  }

  async #addSubgraphInstance(
    subgraphInstance: ISubgraph,
    supergraph = "",
    core = false,
  ) {
    const subgraphsMap = core ? this.coreSubgraphsMap : this.subgraphs;
    const subgraphs = subgraphsMap.get(supergraph) ?? [];

    const existingSubgraph = subgraphs.find(
      (it) => it.name === subgraphInstance.name,
    );

    if (existingSubgraph) {
      this.logger.debug(
        `Skipping duplicate subgraph: ${subgraphInstance.name}`,
      );
      return existingSubgraph;
    }

    await subgraphInstance.onSetup?.();
    subgraphs.push(subgraphInstance);
    subgraphsMap.set(supergraph, subgraphs);

    // also add to global graphql supergraph
    if (supergraph !== "" && supergraph !== "graphql") {
      subgraphsMap.get("graphql")?.push(subgraphInstance);
    }

    this.logger.info(
      `Registered ${this.path.endsWith("/") ? this.path : this.path + "/"}${supergraph ? supergraph + "/" : ""}${subgraphInstance.name} subgraph.`,
    );
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

    // @todo:
    // if auth enabled, subgraphs are only available to guests, users and admins
    // if auth enabled, set req user to the graphql context
    // if auth disabled, subgraphs are available to all

    await this.#setupSubgraphs(this.subgraphs);
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

  async #createApolloServer(schema: GraphQLSchema) {
    const server = new ApolloServer<Context>({
      schema,
      logger: this.apolloLogger,
      introspection: true,
      plugins: [
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginLandingPageLocalDefault(),
      ],
    });
    server.startInBackgroundHandlingStartupErrorsByLoggingAndFailingAllRequests();
    await this.#waitForServer(server);
    return server;
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

  async #setupSubgraphs(subgraphsMap: Map<string, ISubgraph[]>) {
    for (const [supergraph, subgraphs] of subgraphsMap.entries()) {
      for (const subgraph of subgraphs) {
        this.logger.debug(`Setting up subgraph ${subgraph.name}`);
        const subgraphPath = this.#getSubgraphPath(subgraph, supergraph);
        try {
          // dispose existing websocket server before starting new one
          const existingWsDisposer = this.subgraphWsDisposers.get(subgraphPath);
          if (existingWsDisposer) {
            try {
              await existingWsDisposer.dispose();
            } catch {
              // ignore error when disposing websocket server
            }
            this.subgraphWsDisposers.delete(subgraphPath);
          }

          // create subgraph schema
          const schema = createSchema(
            this.reactor,
            subgraph.resolvers,
            subgraph.typeDefs,
          );

          // create and start apollo server
          const existingServer = this.subgraphServers.get(subgraphPath);
          const server =
            existingServer || (await this.#createApolloServer(schema));

          this.subgraphServers.set(subgraphPath, server);

          if (subgraph.hasSubscriptions) {
            const wsDisposer = useServer(
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
            this.subgraphWsDisposers.set(subgraphPath, wsDisposer);
            this.logger.debug(
              `WebSocket subscriptions enabled for ${subgraph.name}`,
            );
          }

          this.#setupApolloExpressMiddleware(server, subgraphPath);
        } catch (error) {
          this.logger.error(
            "Failed to setup subgraph @name at path @path: @error",
            subgraph.name,
            subgraphPath,
            error,
          );
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

  /**
   * Setup REST GET endpoint for drive info at /d/:drive
   * Accepts both drive slug (e.g., "powerhouse") and UUID
   * Returns DriveInfo JSON: { id, name, slug, icon, meta, graphqlEndpoint }
   */
  #setupDriveInfoRestEndpoint(router: IRouter) {
    const routePath = path.join(this.path, "d/:drive");

    router.get(routePath, (req, res) => {
      const driveIdOrSlug = req.params.drive;

      if (!driveIdOrSlug) {
        res.status(400).json({ error: "Drive ID or slug is required" });
        return;
      }

      (async () => {
        const driveDoc =
          await this.reactorClient.get<DocumentDriveDocument>(driveIdOrSlug);

        // Construct the graphqlEndpoint from the request
        // Use X-Forwarded-Proto header when behind a reverse proxy (Heroku, Traefik, etc.)
        const forwardedProto = req.get("x-forwarded-proto");
        const protocol = (forwardedProto ?? req.protocol) + ":";
        const host = req.get("host") ?? "";
        const basePath = this.path === "/" ? "" : this.path;
        const graphqlEndpoint = `${protocol}//${host}${basePath}/graphql/r`;

        const driveInfo = responseForDrive(driveDoc, graphqlEndpoint);
        res.json(driveInfo);
      })().catch((error: unknown) => {
        this.logger.debug(`Drive not found: ${driveIdOrSlug}`, error);
        res.status(404).json({ error: "Drive not found" });
      });
    });

    this.logger.info(`Registered REST endpoint: GET ${routePath}`);
  }

  #buildSubgraphSchemaModule(subgraph: ISubgraph) {
    return buildSubgraphSchemaModule(
      this.reactor,
      subgraph.resolvers,
      subgraph.typeDefs,
    );
  }

  async #buildSupergrahSdl() {
    if (!this.gatewayOptions) {
      throw new Error("Gateway is not ready");
    }
    const subgraphs = this.#getAllSubgraphs();

    const herokuOrLocal = process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME
      ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`
      : `http://localhost:${this.port}`;

    const serviceList: ServiceDefinition[] = Array.from(
      subgraphs.entries(),
    ).map(([path, subgraph]) => ({
      name: path.replace("/", ":"),
      typeDefs: this.#buildSubgraphSchemaModule(subgraph).typeDefs,
      url: `${herokuOrLocal}${path}`,
    }));

    const localCompose = new LocalCompose({
      localServiceList: serviceList,
    });
    return await localCompose.initialize(this.gatewayOptions!);
  }

  async #createApolloGateway() {
    const gateway = new ApolloGateway({
      supergraphSdl: async (options) => {
        this.gatewayOptions = options;
        return await this.#buildSupergrahSdl();
      },
      buildService: (serviceConfig) => {
        return new AuthenticatedDataSource(serviceConfig);
      },
    });

    if (this.coreApolloServer) {
      throw new Error("Supergrah server is already running");
    }

    this.coreApolloServer = new ApolloServer<Context>({
      gateway,
      logger: this.apolloLogger,
      introspection: true,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer: this.httpServer }),
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginLandingPageLocalDefault(),
      ],
    });

    await this.coreApolloServer.start();
    await this.#waitForServer(this.coreApolloServer);

    const superGraphPath = path.join(this.path, "graphql");
    this.#setupApolloExpressMiddleware(this.coreApolloServer, superGraphPath);

    if (!this.initialized) {
      this.logger.info(`Registered ${superGraphPath} supergraph `);
      this.initialized = true;
    }
    return;
  }

  #setupApolloExpressMiddleware(server: ApolloServer<Context>, path: string) {
    this.subgraphHandlers.set(path, {
      handler: expressMiddleware(server, {
        context: ({ req }) =>
          Promise.resolve<Context>({
            headers: req.headers,
            driveId: req.params.drive ?? undefined,
            driveServer: this.reactor,
            db: this.relationalDb,
            ...this.getAdditionalContextFields(),
          }),
      }),
      matcher: match(path),
    });
  }
}
