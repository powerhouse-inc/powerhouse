import type {
  Context,
  IAuthorizationService,
} from "@powerhousedao/reactor-api";
import { GraphQLError } from "graphql";
import type { PrivacyService } from "../privacy-service.js";

type EraseInput = {
  documentIds: string[];
  requestId?: string | null;
  requester: string;
  identifier?: string | null;
  skipRemotes?: string[] | null;
  allowGroupInUse?: boolean | null;
};

/** Every request names a subject's documents, so every one is an admin's. */
function requireAdmin(
  authorizationService: IAuthorizationService,
  ctx: Context,
): string {
  const address = ctx.user?.address;
  if (!address || !authorizationService.isSupremeAdmin(address)) {
    throw new GraphQLError("Admin access required");
  }
  return address;
}

export function createPrivacyResolvers(
  service: PrivacyService,
  authorizationService: IAuthorizationService,
) {
  return {
    Query: {
      privacyDisclosure: async (
        _parent: unknown,
        args: { identifier: string },
        ctx: Context,
      ) => {
        const admin = requireAdmin(authorizationService, ctx);
        const report = await service.listDocuments(args.identifier, admin);
        return { ...report, permissions: JSON.stringify(report.permissions) };
      },
      privacyErasurePlan: async (
        _parent: unknown,
        args: { documentIds: string[] },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        const plan = await service.planErasure(args.documentIds);
        return {
          ready: plan.ready,
          candidates: plan.candidates.map((candidate) => ({
            ...candidate,
            owed: JSON.stringify(candidate.owed),
          })),
        };
      },
      privacyAuditLog: async (
        _parent: unknown,
        args: { limit?: number | null },
        ctx: Context,
      ) => {
        requireAdmin(authorizationService, ctx);
        const entries = await service.auditLog(args.limit ?? 100);
        return entries.map((entry) => ({
          ...entry,
          detail: JSON.stringify(entry.detail),
          createdAtUtc: entry.createdAtUtc.toISOString(),
        }));
      },
    },
    Mutation: {
      privacyErase: async (
        _parent: unknown,
        args: { input: EraseInput },
        ctx: Context,
      ) => {
        const admin = requireAdmin(authorizationService, ctx);
        const { input } = args;
        const result = await service.eraseDocuments(input.documentIds, {
          requestId: input.requestId ?? undefined,
          requester: input.requester,
          authoriser: admin,
          identifier: input.identifier ?? undefined,
          skipRemotes: input.skipRemotes ?? undefined,
          allowGroupInUse: input.allowGroupInUse ?? undefined,
        });
        return {
          requestId: result.requestId,
          status: result.purge.status,
          purged: result.purge.purged,
          alreadyPurged: result.purge.alreadyPurged,
          unacknowledgedShards: result.purge.unacknowledgedShards,
          detail: JSON.stringify(result),
        };
      },
    },
  };
}
