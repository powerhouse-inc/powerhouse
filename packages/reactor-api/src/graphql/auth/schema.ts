import { type AnyFieldDescriptor, type ObjectFields, ph } from "document-model";
import { compileSubgraphTypeDefs } from "document-model/tooling";
import type { DocumentNode } from "graphql";
import type { CoreSubgraphSchema } from "../subgraph-types.js";
import type { SchemaBuilder } from "../subgraph-schema.js";

const DocumentPermissionLevel = ph.enum("DocumentPermissionLevel", {
  values: ["READ", "WRITE", "ADMIN"],
});

const DocumentPermissionEntry = ph.object("DocumentPermissionEntry", {
  fields: {
    documentId: ph.String({ required: true }),
    userAddress: ph.String({ required: true }),
    permission: ph.ref(DocumentPermissionLevel, { required: true }),
    grantedBy: ph.String({ required: true }),
    createdAt: ph.DateTime({ required: true }),
    updatedAt: ph.DateTime({ required: true }),
  },
});

const OperationUserPermission = ph.object("OperationUserPermission", {
  fields: {
    documentId: ph.String({ required: true }),
    operationType: ph.String({ required: true }),
    userAddress: ph.String({ required: true }),
    grantedBy: ph.String({ required: true }),
    createdAt: ph.DateTime({ required: true }),
  },
});

const DocumentAccessInfo = ph.object("DocumentAccessInfo", {
  fields: {
    documentId: ph.String({ required: true }),
    permissions: ph.list(ph.ref(DocumentPermissionEntry, { required: true }), {
      required: true,
    }),
  },
});

const OperationPermissionsInfo = ph.object("OperationPermissionsInfo", {
  fields: {
    documentId: ph.String({ required: true }),
    operationType: ph.String({ required: true }),
    userPermissions: ph.list(
      ph.ref(OperationUserPermission, { required: true }),
      { required: true },
    ),
  },
});

const DocumentProtectionInfo = ph.object("DocumentProtectionInfo", {
  fields: {
    documentId: ph.String({ required: true }),
    protected: ph.Boolean({ required: true }),
    ownerAddress: ph.String(),
  },
});

const documentArgs = {
  documentIdOrSlug: ph.String(),
  documentId: ph.String({ deprecated: "Use documentIdOrSlug." }),
};

export const authQueries = {
  documentAccess: {
    args: documentArgs,
    returns: ph.ref(DocumentAccessInfo, { required: true }),
  },
  documentProtection: {
    args: documentArgs,
    returns: ph.ref(DocumentProtectionInfo, { required: true }),
  },
  userDocumentPermissions: {
    returns: ph.list(ph.ref(DocumentPermissionEntry, { required: true }), {
      required: true,
    }),
  },
  operationPermissions: {
    args: { ...documentArgs, operationType: ph.String({ required: true }) },
    returns: ph.ref(OperationPermissionsInfo, { required: true }),
  },
  canExecuteOperation: {
    args: { ...documentArgs, operationType: ph.String({ required: true }) },
    returns: ph.Boolean({ required: true }),
  },
};

export const authMutations = {
  setDocumentProtection: {
    args: { ...documentArgs, protected: ph.Boolean({ required: true }) },
    returns: ph.ref(DocumentProtectionInfo, { required: true }),
  },
  transferDocumentOwnership: {
    args: { ...documentArgs, newOwnerAddress: ph.String({ required: true }) },
    returns: ph.ref(DocumentProtectionInfo, { required: true }),
  },
  grantDocumentPermission: {
    args: {
      ...documentArgs,
      userAddress: ph.String({ required: true }),
      permission: ph.ref(DocumentPermissionLevel, { required: true }),
    },
    returns: ph.ref(DocumentPermissionEntry, { required: true }),
  },
  revokeDocumentPermission: {
    args: { ...documentArgs, userAddress: ph.String({ required: true }) },
    returns: ph.Boolean({ required: true }),
  },
  grantOperationPermission: {
    args: {
      ...documentArgs,
      operationType: ph.String({ required: true }),
      userAddress: ph.String({ required: true }),
    },
    returns: ph.ref(OperationUserPermission, { required: true }),
  },
  revokeOperationPermission: {
    args: {
      ...documentArgs,
      operationType: ph.String({ required: true }),
      userAddress: ph.String({ required: true }),
    },
    returns: ph.Boolean({ required: true }),
  },
};

type RootField = {
  readonly args?: ObjectFields;
  readonly returns: AnyFieldDescriptor;
};

const unserved = () => {
  throw new Error("The auth core type map serves no resolvers.");
};

export const authSchema = {
  subgraphName: "auth",
  typeDefs: compileSubgraphTypeDefs("auth", (schema: SchemaBuilder<never>) => [
    ...Object.entries<RootField>(authQueries).map(([key, spec]) =>
      schema.query(key, { ...spec, resolve: unserved }),
    ),
    ...Object.entries<RootField>(authMutations).map(([key, spec]) =>
      schema.mutation(key, { ...spec, resolve: unserved }),
    ),
  ]) as DocumentNode,
  resolverCoordinates: [
    ...Object.keys(authQueries).map((fieldName) => ({
      typeName: "Query",
      fieldName,
      resolverKind: "field" as const,
    })),
    ...Object.keys(authMutations).map((fieldName) => ({
      typeName: "Mutation",
      fieldName,
      resolverKind: "field" as const,
    })),
  ],
} as const satisfies CoreSubgraphSchema;
