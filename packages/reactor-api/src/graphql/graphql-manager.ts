import { type Db } from "#types.js";
import { createSchema } from "#utils/create-schema.js";
import { ApolloGateway, IntrospectAndCompose } from "@apollo/gateway";
import { type SupergraphSdlHookOptions } from "@apollo/gateway/dist/config.js";
import { ApolloServer } from "@apollo/server";
import { expressMiddleware } from "@apollo/server/express4";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import bodyParser from "body-parser";
import cors from "cors";
import { type IDocumentDriveServer } from "document-drive";
import type express from "express";
import { Request, Router, type IRouter } from "express";
import { printSchema, type GraphQLSchema } from "graphql";
import path from "node:path";
import { AnalyticsSubgraph } from "./analytics/index.js";
import { AuthSubgraph } from "./auth/index.js";
import { DriveSubgraph } from "./drive/index.js";
import { type Subgraph, type SubgraphClass } from "./index.js";
import { SystemSubgraph } from "./system/index.js";

const BASE_URL = process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME
  ? `https://${process.env.HEROKU_APP_DEFAULT_DOMAIN_NAME}`
  : `http://localhost:${process.env.PORT ?? 4001}`;

export class GraphQLManager {
  private router: IRouter = Router();
  private gateway: ApolloGateway | undefined;
  private server: ApolloServer | undefined;
  private gatewayOptions: SupergraphSdlHookOptions | undefined;
  private contextFields: Record<string, any> = {};
  private subgraphServers = new Map<string, ApolloServer>();

  constructor(
    private readonly path: string,
    private readonly app: express.Express,
    private readonly reactor: IDocumentDriveServer,
    private readonly operationalStore: Db,
    private readonly analyticsStore: IAnalyticsStore,
    private readonly subgraphs: Map<string, Subgraph[]> = new Map(),
  ) {
    this.subgraphs.set("graphql", []);
    this.router.use(cors());
    this.router.use(bodyParser.json());
    this.router.use(this.#routeSubgraphs.bind(this));
  }

  async #updateGatewaySupergraph(endpoints: string[]) {
    const options = await this.gatewayOptions;
    const introspectAndCompose = new IntrospectAndCompose({
      subgraphs: endpoints.map((endpoint) => ({
        name: endpoint.replaceAll("/", ""),
        url: `${BASE_URL}${endpoint}`,
      })),
    });
    const supergraphSdl = await introspectAndCompose.initialize(options);
    console.log("NEW SUPERGRAPH", supergraphSdl.supergraphSdl);
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

    this.app.use("/", (req, res, next) => this.router(req, res, next));

    console.log("SETTING UP DEFAULT SUBGRAPHS");
    // Setup Default subgraphs
    await this.registerSubgraph(AuthSubgraph, "graphql");
    await this.registerSubgraph(SystemSubgraph, "graphql");
    await this.registerSubgraph(AnalyticsSubgraph, "graphql");

    // special case for drive
    await this.registerSubgraph(DriveSubgraph);

    // creates the Apollo Gateway and Server, keeping a reference
    // to the method to be able to update the supergraph later
    const resolvers = Promise.withResolvers<SupergraphSdlHookOptions>();
    this.gatewayOptions = resolvers.promise;
    try {
      this.gateway = new ApolloGateway({
        async supergraphSdl(options) {
          resolvers.resolve(options);
          const test = new IntrospectAndCompose({
            subgraphs: [
              {
                name: "graphql",
                url: `${BASE_URL}/graphql"`,
              },
            ],
          });
          const result = await test.initialize(options);
          return { supergraphSdl: result.supergraphSdl };
          return Promise.resolve({
            supergraphSdl: printSchema(buildSubgraphSchema([])),
          });
        },
      });

      this.server = new ApolloServer({
        gateway: this.gateway,
        plugins: [
          ApolloServerPluginInlineTraceDisabled(),
          ApolloServerPluginLandingPageLocalDefault(),
        ],
      });

      await this.server.start();
    } catch (e) {
      if (e instanceof Error) {
        console.error("> " + e.message);
      } else {
        console.error("> Could not create Apollo Gateway");
      }
      throw e;
    }

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
    await this.#setupSubgraphs();
    console.log("> Router updated.");
  }

  #buildRequestContext = (req: Express.Request) => {
    return Promise.resolve({
      headers: req.headers,
      driveId: req.params.drive || undefined,
      driveServer: this.reactor,
      db: this.operationalStore,
      ...this.contextFields,
    })
  };

  setAdditionalContextFields(fields: Record<string, any>) {
    this.contextFields = { ...this.contextFields, ...fields };
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

  #getSubgraphPath(subgraph: Subgraph, supergraph: string) {
    return path.join(subgraph.path, supergraph, subgraph.name);
  }

  async #setupSubgraph(subgraph: Subgraph, supergraph: string) {
    const subgraphConfig = this.#getLocalSubgraphConfig(subgraph.name);
    if (!subgraphConfig) {
      throw new Error(`Subgraph not found: "${subgraph.name}"`);
    }
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
    this.#setupApolloExpressMiddleware(server, this.router, path);

    // stops previous server if it exists
    const oldServer = this.subgraphServers.get(subgraph.path);
    this.subgraphServers.set(subgraph.path, server);
    await oldServer?.stop();
    //   if (supergraph !== "") {
    //     supergraphEndpoints.push(this.#getSubgraphPath(subgraph, supergraph));
    //   }

    // if (supergraphEndpoints.length > 0) {
    //   await this.#updateGatewaySupergraph(supergraphEndpoints);
    //   const superGraphPath = path.join(this.path, supergraph || "graphql");
    //   this.#setupApolloExpressMiddleware(
    //     this.server,
    //     this.router,
    //     superGraphPath,
    //   );
    // }
  }

  #routeSubgraphs(router: IRouter) {
    router.use((req, res, next) {

      const server = this.subgraphServers.get(path);
      if (server) {
        return expressMiddleware(server, {
          context: ({ req }) => this.#buildRequestContext(req)
        });
      } else {
        next();
      }
    });
  }

  #getLocalSubgraphConfig(subgraphName: string): Subgraph | undefined {
    for (const [, subgraphs] of this.subgraphs) {
      const entry = subgraphs.find((it) => it.name === subgraphName);
      if (entry) return entry;
    }
    return undefined;
  }
}
