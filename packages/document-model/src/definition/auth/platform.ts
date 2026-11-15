import type {
  AddRelationshipActionInput,
  DeleteDocumentActionInput,
  Grant,
  HashConfig,
  PHAuthState,
  PHDocumentState,
  RemoveRelationshipActionInput,
  UpdateRelationshipActionInput,
  UpgradeDocumentActionInput,
} from "@powerhousedao/shared/document-model";
import {
  GrantSchema,
  MoveGrantActionInputSchema,
  RemoveGrantActionInputSchema,
  SetNameActionInputSchema,
  SetSlugActionInputSchema,
  SetPreferredEditorActionInputSchema,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";

type Shape<T> = { [K in keyof T]-?: z.ZodType<T[K]> };
const grantShape = {
  id: z.string(),
  description: z.string(),
  effect: z.enum(["allow", "deny"]),
  principal: z.union([
    z.object({ anyone: z.literal(true) }),
    z.object({ address: z.string() }),
    z.object({ group: z.string() }),
    z.object({
      match:
        z.custom<Extract<Grant["principal"], { match: unknown }>["match"]>(),
    }),
  ]),
  capability: z.union([
    z.object({ can: z.literal("read"), scope: z.string().optional() }),
    z.object({
      can: z.literal("execute"),
      scope: z.string().optional(),
      operation: z.array(z.string()).optional(),
    }),
  ]),
  where: z.custom<Grant["where"]>().optional(),
} satisfies Shape<Grant>;
const grantSchema = z.object(grantShape).check((ctx) => {
  if (!GrantSchema().safeParse(ctx.value).success)
    ctx.issues.push({
      code: "custom",
      input: ctx.value,
      message: "Invalid grant",
    });
});
const relationship = {
  sourceId: z.string(),
  targetId: z.string(),
  relationshipType: z.string(),
} satisfies Shape<RemoveRelationshipActionInput>;

export const authPlatformCatalog = {
  global: {
    setName: { actionType: "SET_NAME", input: SetNameActionInputSchema() },
  },
  header: {
    setSlug: { actionType: "SET_SLUG", input: SetSlugActionInputSchema() },
    setPreferredEditor: {
      actionType: "SET_PREFERRED_EDITOR",
      input: SetPreferredEditorActionInputSchema(),
    },
  },
  auth: {
    setGrant: {
      actionType: "SET_GRANT",
      input: z.object({ grant: grantSchema }),
    },
    removeGrant: {
      actionType: "REMOVE_GRANT",
      input: RemoveGrantActionInputSchema(),
    },
    moveGrant: {
      actionType: "MOVE_GRANT",
      input: MoveGrantActionInputSchema(),
    },
  },
  document: {
    deleteDocument: {
      actionType: "DELETE_DOCUMENT",
      input: z.object({
        documentId: z.string(),
        propagate: z.enum(["none", "cascade"]).optional(),
        keepSlug: z.boolean().optional(),
      } satisfies Shape<DeleteDocumentActionInput>),
    },
    upgradeDocument: {
      actionType: "UPGRADE_DOCUMENT",
      input: z.object({
        model: z.string(),
        fromVersion: z.number(),
        toVersion: z.number(),
        documentId: z.string(),
        initialState: z.object({}).optional(),
        revision: z.record(z.string(), z.number()).optional(),
      } satisfies Shape<UpgradeDocumentActionInput>),
    },
    addRelationship: {
      actionType: "ADD_RELATIONSHIP",
      input: z.object({
        ...relationship,
        metadata: z.record(z.string(), z.unknown()).optional(),
      } satisfies Shape<AddRelationshipActionInput>),
    },
    removeRelationship: {
      actionType: "REMOVE_RELATIONSHIP",
      input: z.object(relationship),
    },
    updateRelationship: {
      actionType: "UPDATE_RELATIONSHIP",
      input: z.object({
        ...relationship,
        metadata: z.record(z.string(), z.unknown()).nullable(),
      } satisfies Shape<UpdateRelationshipActionInput>),
    },
  },
} as const;

export const authPlatformState = {
  auth: z.object({
    version: z.number(),
    grants: z.array(grantSchema),
    creator: z.string().optional(),
  } satisfies Shape<PHAuthState>),
  document: z.object({
    version: z.number(),
    hash: z.object({
      algorithm: z.string(),
      encoding: z.string(),
      params: z.record(z.string(), z.unknown()).optional(),
    } satisfies Shape<HashConfig>),
    isDeleted: z.boolean().optional(),
    deletedAtUtcIso: z.string().optional(),
    deletedBy: z.string().optional(),
    deletionReason: z.string().optional(),
  } satisfies Shape<PHDocumentState>),
};

export function authPlatformScopes(): [
  string,
  Readonly<Record<string, { actionType: string; input: z.ZodType }>>,
][] {
  const catalog: Readonly<
    Record<
      string,
      Readonly<Record<string, { actionType: string; input: z.ZodType }>>
    >
  > = authPlatformCatalog;
  return Object.entries(catalog);
}
