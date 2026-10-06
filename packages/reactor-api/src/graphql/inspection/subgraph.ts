import type { InspectorDocumentReader } from "@powerhousedao/reactor";
import type { DocumentNode } from "graphql";
import type { AuthorizationConfig } from "../../services/authorization.service.js";
import { BaseSubgraph } from "../base-subgraph.js";
import type { Context, SubgraphArgs } from "../types.js";
import {
  createInspectionResolvers,
  type InspectionCallerGate,
} from "./resolvers.js";
import { inspectionTypeDefs } from "./schema.js";

// Not isSupremeAdmin: under OPEN that admits every caller, anonymous included.
export function isListedAdmin(
  config: AuthorizationConfig,
  address: string | undefined,
): boolean {
  if (!address) {
    return false;
  }
  const caller = address.toLowerCase();
  return config.admins.some((admin) => admin.toLowerCase() === caller);
}

/** The read half of the reactor's inspection surface. */
export class InspectionSubgraph extends BaseSubgraph {
  name = "inspection";
  hasSubscriptions = false;
  typeDefs: DocumentNode = inspectionTypeDefs;
  resolvers: Record<string, any>;

  constructor(args: SubgraphArgs) {
    super(args);
    if (!args.inspection) {
      throw new Error(
        "InspectionSubgraph requires an inspection source; the host did not provide one",
      );
    }
    this.resolvers = createInspectionResolvers(
      args.inspection,
      this.syncManager,
      this.callerGate(),
    );
  }

  private callerGate(): InspectionCallerGate {
    return {
      isOperator: (ctx) =>
        isListedAdmin(this.authorizationService.config, ctx.user?.address),
      readerFor: (ctx) => this.readerFor(ctx),
      assertCanRead: async (identifier, ctx) =>
        (await this.assertCanRead(identifier, ctx)).fetchIdentifier,
      readableIds: async (ids, ctx) => {
        const readable = await this.readableByHost(
          ids.map((id) => ({ id })),
          ctx,
        );
        return new Set(readable.map((item) => item.id));
      },
      servedDocument: (identifier, branch, ctx) =>
        this.servedDocument(identifier, branch, ctx),
    };
  }

  private readerFor(ctx: Context): InspectorDocumentReader {
    const subject = this.viewSubject(ctx);
    return {
      find: (search, view, paging) =>
        this.reactorClient.find(search, { ...view, subject }, paging),
      get: (id, view) => this.reactorClient.get(id, { ...view, subject }),
    };
  }

  private async servedDocument(
    identifier: string,
    branch: string | undefined,
    ctx: Context,
  ): Promise<{ id: string; scopes: ReadonlySet<string> } | undefined> {
    const view = { branch, subject: this.viewSubject(ctx) };
    let served: boolean;
    try {
      served = await this.reactorClient.isServed(identifier, view);
    } catch {
      return undefined;
    }
    if (!served) {
      return undefined;
    }
    const document = await this.reactorClient.get(identifier, view);
    return {
      id: document.header.id,
      scopes: new Set(Object.keys(document.state ?? {})),
    };
  }
}
