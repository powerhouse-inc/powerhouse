import { GraphQLError } from "graphql";
import type { Disclosure } from "../disclosure/disclosure-service.js";
import type { ErasureRequest, IErasureService } from "../erasure/types.js";

/** The slice of reactor-api's IAuthorizationService the subgraph uses. */
export interface PrivacyAuthorization {
  readonly config: { readonly policy: string };
  isSupremeAdmin(userAddress?: string): boolean;
}

export interface IDisclosureService {
  disclose(identifier: string): Promise<Disclosure>;
}

export type PrivacySubgraphContext = { user?: { address?: string } };

export type PrivacyResolverDeps = {
  authorizationService: PrivacyAuthorization;
  erasure: IErasureService;
  disclosure: IDisclosureService;
};

function requireAdmin(
  authorizationService: PrivacyAuthorization,
  ctx: PrivacySubgraphContext,
): string {
  const address = ctx.user?.address;
  if (!address || !authorizationService.isSupremeAdmin(address)) {
    throw new GraphQLError("Admin access required", {
      extensions: { code: "FORBIDDEN" },
    });
  }
  return address;
}

function parseDeadline(deadline: string | null | undefined): Date | undefined {
  if (deadline === null || deadline === undefined) return undefined;
  const parsed = new Date(deadline);
  if (Number.isNaN(parsed.getTime())) {
    throw new GraphQLError("deadline is not an ISO 8601 timestamp", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return parsed;
}

function shapeDisclosure(disclosure: Disclosure) {
  return {
    ...disclosure,
    permissions: disclosure.permissions.map((row) => ({
      ...row,
      detail: row.detail === undefined ? null : JSON.stringify(row.detail),
    })),
  };
}

function shapeRequest(request: ErasureRequest) {
  return {
    ...request,
    requestedAt: request.requestedAt.toISOString(),
    deadline: request.deadline.toISOString(),
    items: request.items.map((item) => ({
      ...item,
      updatedAt: item.updatedAt.toISOString(),
    })),
  };
}

/** Every field refuses a caller that is not a supreme admin, before any work. */
export function createPrivacyResolvers(deps: PrivacyResolverDeps) {
  const { authorizationService, erasure, disclosure } = deps;
  return {
    Query: {
      async disclose(
        _root: unknown,
        args: { identifier: string },
        ctx: PrivacySubgraphContext,
      ) {
        requireAdmin(authorizationService, ctx);
        return shapeDisclosure(await disclosure.disclose(args.identifier));
      },
      async erasurePlan(
        _root: unknown,
        args: { ids: string[] },
        ctx: PrivacySubgraphContext,
      ) {
        requireAdmin(authorizationService, ctx);
        return erasure.plan(args.ids);
      },
      async erasureRequest(
        _root: unknown,
        args: { requestId: string },
        ctx: PrivacySubgraphContext,
      ) {
        requireAdmin(authorizationService, ctx);
        return shapeRequest(await erasure.status(args.requestId));
      },
    },
    Mutation: {
      async requestErasure(
        _root: unknown,
        args: {
          ids: string[];
          deadline?: string | null;
          allowLarge?: string[] | null;
        },
        ctx: PrivacySubgraphContext,
      ) {
        const requestedBy = requireAdmin(authorizationService, ctx);
        const request = await erasure.request(args.ids, {
          requestedBy,
          deadline: parseDeadline(args.deadline),
          allowLarge: args.allowLarge ?? undefined,
        });
        return shapeRequest(request);
      },
    },
  };
}
