import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type {
  Context,
  ISubgraph,
  SubgraphClass,
} from "@powerhousedao/reactor-api";
import type {
  DocumentDriveDocument,
  ILogger,
  IRelationalDbLegacy,
} from "document-drive";
import { debounce, responseForDrive } from "document-drive";
import type { DocumentModelModule } from "document-model";
import type express from "express";
import { Router } from "express";
import type { IncomingHttpHeaders } from "http";
import type http from "node:http";
import path from "node:path";
import type { WebSocketServer } from "ws";
import type { AuthConfig } from "../services/auth.service.js";
import { AuthService } from "../services/auth.service.js";
import type { AuthorizationService } from "../services/authorization.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import {
  buildSubgraphSchemaModule,
  createMergedSchema,
  createSchema,
} from "../utils/create-schema.js";
import { DocumentModelSubgraph } from "./document-model-subgraph.js";
import { createGraphQLSSEHandler } from "./sse.js";
import { useServer } from "./websocket.js";
import { ApolloGatewayAdapter } from "./gateway/apollo-gateway-adapter.js";
import { ExpressHttpAdapter } from "./gateway/express-http-adapter.js";
import type {
  FetchHandler,
  GatewayContextFactory,
  IGatewayAdapter,
  IHttpAdapter,
  SubgraphDefinition,
  WsDisposer,
} from "./gateway/types.js";

const DOCUMENT_MODELS_TO_EXCLUDE: string[] = [];

/**
 * Check if a document model has any operations with valid schemas.
 * Document models without valid operation schemas cannot generate valid subgraph schemas.
 */
function hasOperationSchemas(documentModel: DocumentModelModule): boolean {
  const specification =
    documentModel.documentModel.global.specifications.at(-1);
  if (!specification) return false;
  const hasValidSchema = (schema: string | null | undefined) =>
    schema && /\b(input|type|enum|union|interface)\s+\w+/.test(schema);
  return specification.modules.some((module) =>
    module.operations.some((op) => hasValidSchema(op.schema)),
  );
}

/**
 * Filter document models to keep only the latest version of each unique document model.
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
};

export type GraphqlManagerFeatureFlags = {
  enableDocumentModelSubgraphs?: boolean;
};

export class GraphQLManager {
  private initialized = false;
  private readonly router: express.Router;
  private coreSubgraphsMap = new Map<string, ISubgraph[]>();
  private contextFields: Record<string, any> = {};
  private readonly subgraphs = new Map<string, ISubgraph[]>();
  private authService: AuthService | null = null;

  private readonly subgraphWsDisposers = new Map<string, WsDisposer>();

  /** Cached document models for schema generation - updated on init and regenerate */
  private cachedDocumentModels: DocumentModelModule[] = [];

  private readonly gatewayAdapter: IGatewayAdapter<Context>;
  private readonly httpAdapter: IHttpAdapter;
  private readonly subgraphHandlerCache = new Map<string, FetchHandler>();

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly httpServer: http.Server,
    private readonly wsServer: WebSocketServer,
    private readonly reactorClient: IReactorClient,
    private readonly relationalDb: IRelationalDbLegacy,
    private readonly analyticsStore: IAnalyticsStore,
    private readonly syncManager: ISyncManager,
    private readonly logger: ILogger,
    private readonly authConfig?: AuthConfig,
    private readonly documentPermissionService?: DocumentPermissionService,
    private readonly featureFlags: GraphqlManagerFeatureFlags = DefaultFeatureFlags,
    private readonly port: number = 4001,
    private readonly authorizationService?: AuthorizationService,
    gatewayAdapter?: IGatewayAdapter<Context>,
    httpAdapter?: IHttpAdapter,
  ) {
    this.router = Router();
    this.gatewayAdapter =
      gatewayAdapter ?? new ApolloGatewayAdapter(this.logger);
    this.httpAdapter = httpAdapter ?? new ExpressHttpAdapter(this.router);

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
    const modulesResult = await this.reactorClient.getDocumentModelModules();
    const models = modulesResult.results;

    // Cache models for schema generation
    this.cachedDocumentModels = models;

    const driveModel = models.find(
      (it: DocumentModelModule) =>
        it.documentModel.global.name === "DocumentDrive",
    );
    if (!driveModel) {
      throw new Error("DocumentDrive model required");
    }

    await this.gatewayAdapter.start(this.httpServer);

    this.httpAdapter.setupMiddleware({ bodyLimit: "50mb" });

    // Mount the adapter's router on the Express app, injecting auth context fields
    this.app.use("/", (req, res, next) => {
      this.setAdditionalContextFields({
        user: req.user,
        isAdmin: (address: string) =>
          !req.auth_enabled
            ? true
            : (req.admins
                ?.map((a) => a.toLowerCase())
                .includes(address.toLowerCase() ?? "") ?? false),
      });
      this.router(req, res, next);
    });

    // Register REST endpoint for drive info
    const driveRoutePath = path.join(this.path, "d/:drive");
    this.httpAdapter.get(driveRoutePath, (params, req, res) => {
      const expressReq = req as express.Request;
      const expressRes = res as express.Response;
      const driveIdOrSlug = (params as Record<string, string>).drive;

      if (!driveIdOrSlug) {
        expressRes.status(400).json({ error: "Drive ID or slug is required" });
        return;
      }

      (async () => {
        const driveDoc =
          await this.reactorClient.get<DocumentDriveDocument>(driveIdOrSlug);

        const forwardedProto = expressReq.get("x-forwarded-proto");
        const protocol = (forwardedProto ?? expressReq.protocol) + ":";
        const host = expressReq.get("host") ?? "";
        const basePath = this.path === "/" ? "" : this.path;
        const graphqlEndpoint = `${protocol}//${host}${basePath}/graphql/r`;

        const driveInfo = responseForDrive(driveDoc, graphqlEndpoint);
        expressRes.json(driveInfo);
      })().catch((error: unknown) => {
        this.logger.debug(`Drive not found: ${driveIdOrSlug}`, error);
        expressRes.status(404).json({ error: "Drive not found" });
      });
    });

    this.logger.info(`Registered REST endpoint: GET ${driveRoutePath}`);

    await this.#setupCoreSubgraphs("graphql", coreSubgraphs);

    if (this.featureFlags.enableDocumentModelSubgraphs) {
      await this.#setupDocumentModelSubgraphs("graphql", models);
    }

    await this.#createSupergraphGateway();

    return this.updateRouter();
  }

  /**
   * Regenerate document model subgraphs when models are dynamically loaded.
   * Fetches current modules from reactor client (source of truth).
   */
  async regenerateDocumentModelSubgraphs(): Promise<void> {
    if (!this.featureFlags.enableDocumentModelSubgraphs) {
      return;
    }

    try {
      const modulesResult = await this.reactorClient.getDocumentModelModules();
      const models = modulesResult.results;

      // Update cached models for schema generation
      this.cachedDocumentModels = models;

      await this.#setupDocumentModelSubgraphs("graphql", models);
      await this.updateRouter();
      this.logger.info(
        "Regenerated document model subgraphs with @count models",
        models.length,
      );
    } catch (error) {
      this.logger.error("Failed to regenerate document model subgraphs", error);
      throw error;
    }
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

    return this.#setupSubgraphs(this.coreSubgraphsMap);
  }

  async #setupDocumentModelSubgraphs(
    supergraph: string,
    documentModels: DocumentModelModule[],
  ) {
    const latestDocumentModels =
      filterLatestDocumentModelVersions(documentModels);

    for (const documentModel of latestDocumentModels) {
      if (
        DOCUMENT_MODELS_TO_EXCLUDE.includes(
          documentModel.documentModel.global.id,
        )
      ) {
        continue;
      }
      if (!hasOperationSchemas(documentModel)) {
        continue;
      }
      try {
        const subgraphInstance = new DocumentModelSubgraph(documentModel, {
          relationalDb: this.relationalDb,
          analyticsStore: this.analyticsStore,
          reactorClient: this.reactorClient,
          graphqlManager: this,
          syncManager: this.syncManager,
          path: this.path,
          documentPermissionService: this.documentPermissionService,
          authorizationService: this.authorizationService,
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

    // Document model subgraph instances are added to this.subgraphs above.
    // Their handlers are wired in _updateRouter() → #setupSubgraphs(this.subgraphs),
    // which is called at the end of init() via updateRouter(). We intentionally do
    // NOT call #setupSubgraphs(this.coreSubgraphsMap) here - doing so would
    // create duplicate Apollo servers for the same core-subgraph schemas, which
    // in the new IGatewayAdapter architecture hangs #waitForServer and blocks init().
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

    if (supergraph !== "" && supergraph !== "graphql") {
      subgraphsMap.get("graphql")?.push(subgraphInstance);
    }

    this.logger.info(
      `Registered ${this.path.endsWith("/") ? this.path : this.path + "/"}${supergraph ? supergraph + "/" : ""}${subgraphInstance.name} subgraph.`,
    );
    return subgraphInstance;
  }

  /**
   * Register a pre-constructed subgraph instance.
   * Use this when you need to pass custom dependencies to a subgraph.
   */
  async registerSubgraphInstance(
    subgraphInstance: ISubgraph,
    supergraph = "",
    core = false,
  ) {
    return this.#addSubgraphInstance(subgraphInstance, supergraph, core);
  }

  /**
   * Get the base path used for subgraph registration.
   */
  getBasePath(): string {
    return this.path;
  }

  async registerSubgraph(
    subgraph: SubgraphClass,
    supergraph = "",
    core = false,
  ) {
    const subgraphInstance = new subgraph({
      relationalDb: this.relationalDb,
      analyticsStore: this.analyticsStore,
      reactorClient: this.reactorClient,
      graphqlManager: this,
      syncManager: this.syncManager,
      path: this.path,
      documentPermissionService: this.documentPermissionService,
      authorizationService: this.authorizationService,
    });

    return this.#addSubgraphInstance(subgraphInstance, supergraph, core);
  }

  updateRouter = debounce(this._updateRouter.bind(this), 1000);

  private async _updateRouter() {
    this.logger.debug("Updating router");

    await this.#setupSubgraphs(this.subgraphs);

    try {
      await this.gatewayAdapter.updateSupergraph();
      this.logger.debug("Updated Apollo Gateway supergraph");
    } catch (error) {
      this.logger.error("Failed to update Apollo Gateway supergraph", error);
    }

    // Refresh the supergraph-level SSE handler so it picks up
    // any newly registered subscription-enabled subgraphs.
    const superGraphPath = path.join(this.path, "graphql");
    this.#setupSupergraphSSE(superGraphPath);
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
      db: this.relationalDb,
      ...this.getAdditionalContextFields(),
    };

    if (user) {
      context.user = user;
    }

    return context;
  }

  #makeContextFactory(): GatewayContextFactory<Context> {
    return (request: Request): Promise<Context> => {
      const headers: IncomingHttpHeaders = {};
      request.headers.forEach((value, key) => {
        headers[key] = value;
      });
      return Promise.resolve<Context>({
        headers,
        db: this.relationalDb,
        ...this.getAdditionalContextFields(),
      });
    };
  }

  #makeWsContextFactory() {
    return (connectionParams: Record<string, unknown>): Promise<Context> =>
      this.#createWebSocketContext(connectionParams);
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

    // Dispose per-subgraph WebSocket handlers before closing the WS server.
    for (const disposer of this.subgraphWsDisposers.values()) {
      await disposer.dispose();
    }
    this.subgraphWsDisposers.clear();

    // Stop all Apollo servers (per-subgraph + federation gateway) via the adapter.
    await this.gatewayAdapter.stop();

    return new Promise((resolve) => {
      this.wsServer.close(() => {
        this.logger.info("WebSocket server closed");
        resolve();
      });
    });
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
          // Skip if handler already cached - subgraphs are deduplicated by name
          // in #addSubgraphInstance, so a cached path means the schema is unchanged.
          // This prevents unbounded schema/server creation across repeated
          // _updateRouter() calls. The handler was already mounted on first setup,
          // so no re-mount is needed.
          if (this.subgraphHandlerCache.has(subgraphPath)) {
            continue;
          }

          const schema = createSchema(
            this.cachedDocumentModels,
            subgraph.resolvers,
            subgraph.typeDefs,
          );

          const fetchHandler = await this.gatewayAdapter.createHandler(
            schema,
            this.#makeContextFactory(),
          );
          this.subgraphHandlerCache.set(subgraphPath, fetchHandler);
          this.httpAdapter.mount(subgraphPath, fetchHandler);

          if (subgraph.hasSubscriptions) {
            try {
              const wsDisposer = this.gatewayAdapter.attachWebSocket(
                this.wsServer,
                schema,
                this.#makeWsContextFactory(),
              );
              this.subgraphWsDisposers.set(subgraphPath, wsDisposer);
              this.logger.debug(
                `WebSocket subscriptions enabled for ${subgraph.name}`,
              );
            } catch (error) {
              this.logger.error(
                "Failed to setup websocket for subgraph @name at path @path: @error",
                subgraph.name,
                subgraphPath,
                error,
              );
            }

            // Set up SSE (Server-Sent Events) transport alongside WebSocket.
            // Clients can use SSE by sending POST requests with
            // Accept: text/event-stream to the /stream sub-path.
            try {
              this.#setupSSEHandler(schema, subgraphPath);
              this.logger.debug(
                `SSE subscriptions enabled for ${subgraph.name}`,
              );
            } catch (error) {
              this.logger.error(
                "Failed to setup SSE for subgraph @name at path @path: @error",
                subgraph.name,
                subgraphPath,
                error,
              );
            }
          }
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
        const subgraphPath = this.#getSubgraphPath(subgraph, supergraph);
        subgraphsMap.set(subgraphPath, subgraph);
      }
    }
    return subgraphsMap;
  }

  #buildSubgraphSchemaModule(subgraph: ISubgraph) {
    return buildSubgraphSchemaModule(
      this.cachedDocumentModels,
      subgraph.resolvers,
      subgraph.typeDefs,
    );
  }

  #getSubgraphDefinitions(): SubgraphDefinition[] {
    const subgraphs = this.#getAllSubgraphs();

    const herokuOrLocal = process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME
      ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`
      : `http://localhost:${this.port}`;

    return Array.from(subgraphs.entries()).map(([subgraphPath, subgraph]) => ({
      name: subgraphPath.replace("/", ":"),
      typeDefs: this.#buildSubgraphSchemaModule(subgraph).typeDefs,
      url: `${herokuOrLocal}${subgraphPath}`,
    }));
  }

  async #createSupergraphGateway() {
    const superGraphPath = path.join(this.path, "graphql");
    const fetchHandler: FetchHandler =
      await this.gatewayAdapter.createSupergraphHandler(
        () => this.#getSubgraphDefinitions(),
        this.httpServer,
        this.#makeContextFactory(),
      );
    this.httpAdapter.mount(superGraphPath, fetchHandler);

    // Set up SSE subscriptions at the supergraph level (/graphql/stream).
    // Build a subscription schema from all subgraphs that define subscriptions.
    this.#setupSupergraphSSE(superGraphPath);

    if (!this.initialized) {
      this.logger.info(`Registered ${superGraphPath} supergraph `);
      this.initialized = true;
    }
    return;
  }

  /**
   * Set up an SSE subscription endpoint at the supergraph level.
   * Merges the schemas of all subscription-enabled subgraphs so that
   * clients can subscribe at /graphql/stream without knowing individual
   * subgraph paths.
   */
  #setupSupergraphSSE(superGraphPath: string) {
    const allSubgraphs = this.#getAllSubgraphs();

    const modules = Array.from(allSubgraphs.values())
      .filter((subgraph) => subgraph.hasSubscriptions)
      .map((subgraph) => this.#buildSubgraphSchemaModule(subgraph));

    if (modules.length === 0) {
      return;
    }

    try {
      const mergedSchema = createMergedSchema(modules);
      this.#setupSSEHandler(mergedSchema, superGraphPath);
      this.logger.debug(
        `SSE subscriptions enabled at supergraph level (merged from ${modules.length} subgraph(s))`,
      );
    } catch (error) {
      this.logger.error("Failed to setup supergraph SSE: @error", error);
    }
  }

  /**
   * Set up a GraphQL-over-SSE handler at `<basePath>/stream`.
   *
   * Clients subscribe by sending a POST with `Accept: text/event-stream`
   * to the `/stream` sub-path. Authentication is handled by the normal
   * Express middleware (Authorization header), unlike WebSocket which
   * needs its own connectionParams-based auth.
   */
  #setupSSEHandler(schema: GraphQLSchema, basePath: string) {
    const ssePath = basePath + "/stream";
    const sseHandler = createGraphQLSSEHandler({
      schema,
      contextFactory: (req) => ({
        headers: req.headers,
        driveId: req.params?.drive ?? undefined,
        db: this.relationalDb,
        ...this.getAdditionalContextFields(),
      }),
    });

    this.subgraphHandlers.set(ssePath, {
      handler: sseHandler,
      matcher: match(ssePath),
    });
  }
}
