import { camelCase, kebabCase } from "change-case";
import { setName, type DocumentModelModule } from "document-model";
import { GraphQLError, Kind, parse } from "graphql";
import type { GetParentIdsFn } from "../services/document-permission.service.js";
import {
  generateDocumentModelSchema,
  getDocumentModelSchemaName,
} from "../utils/create-schema.js";
import { BaseSubgraph } from "./base-subgraph.js";
import { toGqlPhDocument } from "./reactor/adapters.js";
import {
  createEmptyDocument as createEmptyDocumentResolver,
  createGetParentIdsFn,
  documentChildren as documentChildrenResolver,
  documentParents as documentParentsResolver,
  document as documentResolver,
  findDocuments as findDocumentsResolver,
} from "./reactor/resolvers.js";
import type { Context, SubgraphArgs } from "./types.js";

/**
 * New document model subgraph that uses reactorClient instead of legacy reactor.
 * This class auto-generates GraphQL queries and mutations for a document model.
 */
export class DocumentModelSubgraph extends BaseSubgraph {
  private documentModel: DocumentModelModule;

  constructor(documentModel: DocumentModelModule, args: SubgraphArgs) {
    super(args);
    this.documentModel = documentModel;
    this.name = kebabCase(documentModel.documentModel.global.name);
    this.typeDefs = generateDocumentModelSchema(
      this.documentModel.documentModel.global,
      { useNewApi: true },
    );
    this.resolvers = this.generateResolvers();
  }

  /**
   * Check if user has global read access (admin, user, or guest)
   */
  private hasGlobalReadAccess(ctx: Context): boolean {
    const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
    const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
    const isGlobalGuest =
      ctx.isGuest?.(ctx.user?.address ?? "") ||
      process.env.FREE_ENTRY === "true";
    return !!(isGlobalAdmin || isGlobalUser || isGlobalGuest);
  }

  /**
   * Check if user has global write access (admin or user, not guest)
   */
  private hasGlobalWriteAccess(ctx: Context): boolean {
    const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
    const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
    return !!(isGlobalAdmin || isGlobalUser);
  }

  /**
   * Get the parent IDs function for hierarchical permission checks.
   * Uses the shared createGetParentIdsFn from reactor/resolvers.
   */
  private getParentIdsFn(): GetParentIdsFn {
    return createGetParentIdsFn(this.reactorClient);
  }

  /**
   * Check if user can read a document (with hierarchy)
   */
  private async canReadDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    if (this.hasGlobalReadAccess(ctx)) {
      return true;
    }

    if (this.documentPermissionService) {
      return this.documentPermissionService.canRead(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
    }

    return false;
  }

  /**
   * Check if user can write to a document (with hierarchy)
   */
  private async canWriteDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    if (this.hasGlobalWriteAccess(ctx)) {
      return true;
    }

    if (this.documentPermissionService) {
      return this.documentPermissionService.canWrite(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
    }

    return false;
  }

  /**
   * Throw an error if user cannot read the document
   */
  private async assertCanRead(documentId: string, ctx: Context): Promise<void> {
    const canRead = await this.canReadDocument(documentId, ctx);
    if (!canRead) {
      throw new GraphQLError(
        "Forbidden: insufficient permissions to read this document",
      );
    }
  }

  /**
   * Throw an error if user cannot write to the document
   */
  private async assertCanWrite(
    documentId: string,
    ctx: Context,
  ): Promise<void> {
    const canWrite = await this.canWriteDocument(documentId, ctx);
    if (!canWrite) {
      throw new GraphQLError(
        "Forbidden: insufficient permissions to write to this document",
      );
    }
  }

  /**
   * Check if user can execute a specific operation on a document.
   * Throws an error if the operation is restricted and user lacks permission.
   */
  private async assertCanExecuteOperation(
    documentId: string,
    operationType: string,
    ctx: Context,
  ): Promise<void> {
    if (!this.documentPermissionService) {
      return;
    }

    if (ctx.isAdmin?.(ctx.user?.address ?? "")) {
      return;
    }

    const isRestricted =
      await this.documentPermissionService.isOperationRestricted(
        documentId,
        operationType,
      );

    if (isRestricted) {
      const canExecute =
        await this.documentPermissionService.canExecuteOperation(
          documentId,
          operationType,
          ctx.user?.address,
        );

      if (!canExecute) {
        throw new GraphQLError(
          `Forbidden: insufficient permissions to execute operation "${operationType}" on this document`,
        );
      }
    }
  }

  /**
   * Generate __resolveType functions for union types found in the document model schema.
   * Parses the state schema to find union definitions and their member types,
   * then uses unique field presence to discriminate between member types at runtime.
   */
  private generateUnionResolvers(): Record<string, unknown> {
    const documentName = getDocumentModelSchemaName(
      this.documentModel.documentModel.global,
    );
    const specification =
      this.documentModel.documentModel.global.specifications.at(-1);
    if (!specification) return {};

    const globalSchema = specification.state.global.schema ?? "";
    const localSchema = specification.state.local.schema ?? "";
    const fullSchema = `${globalSchema}\n${localSchema}`;

    if (!fullSchema.trim()) return {};

    let ast;
    try {
      ast = parse(fullSchema);
    } catch {
      return {};
    }

    // Build map: object type name -> field names
    const objectFieldsMap = new Map<string, string[]>();
    for (const def of ast.definitions) {
      if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
        objectFieldsMap.set(
          def.name.value,
          def.fields?.map((f) => f.name.value) ?? [],
        );
      }
    }

    const resolvers: Record<string, unknown> = {};

    for (const def of ast.definitions) {
      if (def.kind !== Kind.UNION_TYPE_DEFINITION) continue;

      const unionName = def.name.value;
      const memberTypes = def.types?.map((t) => t.name.value) ?? [];
      if (memberTypes.length === 0) continue;

      // Compute unique fields per member type
      const uniqueFields: Record<string, string[]> = {};
      for (const memberType of memberTypes) {
        const ownFields = objectFieldsMap.get(memberType) ?? [];
        const otherFields = new Set(
          memberTypes
            .filter((t) => t !== memberType)
            .flatMap((t) => objectFieldsMap.get(t) ?? []),
        );
        uniqueFields[memberType] = ownFields.filter((f) => !otherFields.has(f));
      }

      const prefixedUnionName = `${documentName}_${unionName}`;

      resolvers[prefixedUnionName] = {
        __resolveType: (obj: Record<string, unknown>) => {
          for (const memberType of memberTypes) {
            const fields = uniqueFields[memberType] ?? [];
            if (fields.length > 0 && fields.some((f) => f in obj)) {
              return `${documentName}_${memberType}`;
            }
          }
          return `${documentName}_${memberTypes[0]}`;
        },
      };
    }

    return resolvers;
  }

  /**
   * Generate resolvers for this document model using reactorClient
   * Uses flat queries (not nested) consistent with ReactorSubgraph patterns
   */
  private generateResolvers(): Record<string, unknown> {
    const documentType = this.documentModel.documentModel.global.id;
    const documentName = getDocumentModelSchemaName(
      this.documentModel.documentModel.global,
    );
    const operations =
      this.documentModel.documentModel.global.specifications
        .at(-1)
        ?.modules.flatMap((module) =>
          module.operations.filter((op) => op.name),
        ) ?? [];

    return {
      ...this.generateUnionResolvers(),
      Query: {
        // Flat query: Get a specific document by identifier
        // Uses shared documentResolver from reactor/resolvers.ts
        [`${documentName}_document`]: async (
          _: unknown,
          args: {
            identifier: string;
            view?: { branch?: string; scopes?: string[] };
          },
          ctx: Context,
        ) => {
          const { identifier, view } = args;

          if (!identifier) {
            throw new GraphQLError("Document identifier is required");
          }

          // Use shared resolver function
          const result = await documentResolver(this.reactorClient, {
            identifier,
            view,
          });

          // Validate document type
          if (result.document.documentType !== documentType) {
            throw new GraphQLError(
              `Document with id ${identifier} is not of type ${documentType}`,
            );
          }

          // Check permissions
          await this.assertCanRead(result.document.id, ctx);

          // Return shared resolver result directly (matches PHDocument format)
          return result;
        },

        // Flat query: Find documents by search criteria (type is built-in)
        // Uses shared findDocumentsResolver from reactor/resolvers.ts
        [`${documentName}_findDocuments`]: async (
          _: unknown,
          args: {
            search: { parentId?: string; identifiers?: string[] };
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { search, view, paging } = args;

          // Use shared resolver function with built-in type filter
          const result = await findDocumentsResolver(this.reactorClient, {
            search: {
              type: documentType, // Type is built-in for this document model subgraph
              parentId: search.parentId,
            },
            view,
            paging,
          });

          // Filter by permission if needed
          if (
            !this.hasGlobalReadAccess(ctx) &&
            this.documentPermissionService
          ) {
            const filteredItems = [];
            for (const item of result.items) {
              const canRead = await this.canReadDocument(item.id, ctx);
              if (canRead) {
                filteredItems.push(item);
              }
            }
            return {
              ...result,
              items: filteredItems,
              totalCount: filteredItems.length,
            };
          }

          // Return shared resolver result directly (matches PHDocument format)
          return result;
        },

        // Flat query: Get children of a document (filtered by this document type)
        // Uses shared documentChildrenResolver from reactor/resolvers.ts
        [`${documentName}_documentChildren`]: async (
          _: unknown,
          args: {
            parentIdentifier: string;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { parentIdentifier, view, paging } = args;

          await this.assertCanRead(parentIdentifier, ctx);

          // Use shared resolver function
          const result = await documentChildrenResolver(this.reactorClient, {
            parentIdentifier,
            view,
            paging,
          });

          // Filter children by this document type
          const filteredItems = result.items.filter(
            (item) => item.documentType === documentType,
          );

          return {
            ...result,
            items: filteredItems,
            totalCount: filteredItems.length,
          };
        },

        // Flat query: Get parents of a document
        // Uses shared documentParentsResolver from reactor/resolvers.ts
        [`${documentName}_documentParents`]: async (
          _: unknown,
          args: {
            childIdentifier: string;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { childIdentifier, view, paging } = args;

          await this.assertCanRead(childIdentifier, ctx);

          // Use shared resolver function - return directly
          return documentParentsResolver(this.reactorClient, {
            childIdentifier,
            view,
            paging,
          });
        },
      },
      Mutation: {
        // Uses shared createEmptyDocumentResolver from reactor/resolvers.ts
        [`${documentName}_createDocument`]: async (
          _: unknown,
          args: { name: string; parentIdentifier?: string },
          ctx: Context,
        ) => {
          const { parentIdentifier, name } = args;

          if (parentIdentifier) {
            await this.assertCanWrite(parentIdentifier, ctx);
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          // Use shared resolver function - passes name so that
          // createDocumentInDrive can set it on the drive node atomically
          const createdDoc = await createEmptyDocumentResolver(
            this.reactorClient,
            {
              documentType,
              parentIdentifier,
              name,
            },
          );

          // If name was provided but parent was NOT a drive (so name wasn't
          // set during creation), apply it via SET_NAME action
          if (name && createdDoc.name !== name) {
            const updatedDoc = await this.reactorClient.execute(
              createdDoc.id,
              "main",
              [setName(name)],
            );
            return toGqlPhDocument(updatedDoc);
          }

          return createdDoc;
        },
        // Uses shared createEmptyDocumentResolver from reactor/resolvers.ts
        [`${documentName}_createEmptyDocument`]: async (
          _: unknown,
          args: { parentIdentifier?: string },
          ctx: Context,
        ) => {
          const { parentIdentifier } = args;

          if (parentIdentifier) {
            await this.assertCanWrite(parentIdentifier, ctx);
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          // Use shared resolver function - returns PHDocument format directly
          return createEmptyDocumentResolver(this.reactorClient, {
            documentType,
            parentIdentifier,
          });
        },
        // Generate sync and async mutations for each operation
        ...operations.reduce(
          (mutations, op) => {
            // Sync mutation
            mutations[`${documentName}_${camelCase(op.name!)}`] = async (
              _: unknown,
              args: { docId: string; input: unknown },
              ctx: Context,
            ) => {
              const { docId, input } = args;

              await this.assertCanWrite(docId, ctx);
              await this.assertCanExecuteOperation(docId, op.name!, ctx);

              const doc = await this.reactorClient.get(docId);
              if (doc.header.documentType !== documentType) {
                throw new GraphQLError(
                  `Document with id ${docId} is not of type ${documentType}`,
                );
              }

              const action = this.documentModel.actions[camelCase(op.name!)];
              if (!action) {
                throw new GraphQLError(`Action ${op.name} not found`);
              }

              try {
                const updatedDoc = await this.reactorClient.execute(
                  docId,
                  "main",
                  [action(input)],
                );
                // Use toGqlPhDocument for PHDocument format with revisionsList
                return toGqlPhDocument(updatedDoc);
              } catch (error) {
                throw new GraphQLError(
                  error instanceof Error
                    ? error.message
                    : `Failed to ${op.name}`,
                );
              }
            };

            // Async mutation - returns job ID
            mutations[`${documentName}_${camelCase(op.name!)}Async`] = async (
              _: unknown,
              args: { docId: string; input: unknown },
              ctx: Context,
            ) => {
              const { docId, input } = args;

              await this.assertCanWrite(docId, ctx);
              await this.assertCanExecuteOperation(docId, op.name!, ctx);

              const doc = await this.reactorClient.get(docId);
              if (doc.header.documentType !== documentType) {
                throw new GraphQLError(
                  `Document with id ${docId} is not of type ${documentType}`,
                );
              }

              const action = this.documentModel.actions[camelCase(op.name!)];
              if (!action) {
                throw new GraphQLError(`Action ${op.name} not found`);
              }

              try {
                const jobInfo = await this.reactorClient.executeAsync(
                  docId,
                  "main",
                  [action(input)],
                );
                return jobInfo.id;
              } catch (error) {
                throw new GraphQLError(
                  error instanceof Error
                    ? error.message
                    : `Failed to ${op.name}`,
                );
              }
            };

            return mutations;
          },
          {} as Record<string, unknown>,
        ),
      },
    };
  }
}
