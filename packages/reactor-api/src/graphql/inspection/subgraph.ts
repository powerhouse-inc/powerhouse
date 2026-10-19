import {
  type DeadLetterPage,
  DriveInspection,
  type InspectorDocumentReader,
  InvalidDeadLetterCursorError,
  type ISyncInspector,
  toWireDeadLetter,
  toWireQueueState,
} from "@powerhousedao/reactor";
import { GraphQLError } from "graphql";
import type { AuthorizationConfig } from "../../services/authorization.service.js";
import { BaseSubgraph } from "../base-subgraph.js";
import { ForbiddenError } from "../errors.js";
import type { SchemaBuilder } from "../subgraph-schema.js";
import type { Context, SubgraphArgs } from "../types.js";
import {
  noSyncInspector,
  operatorRequired,
  servedIssues,
  toWireDrive,
  toWireProcessor,
  toWireRemotes,
} from "./resolvers.js";
import {
  inspectionQuery,
  inspectionSchema,
  ReactorInspection,
} from "./schema.js";
import type { IReactorInspectionSource } from "./source.js";

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

/** The read half of the reactor's inspection surface; no lever has a field here. */
export class InspectionSubgraph extends BaseSubgraph {
  static override readonly subgraphName = inspectionSchema.subgraphName;

  static override getSchema(schema: SchemaBuilder<InspectionSubgraph>) {
    const field = ReactorInspection.computedTokens;
    return [
      schema.query("inspection", { ...inspectionQuery, resolve: () => ({}) }),
      schema.field(field.info, {
        resolve: async ({ subgraph, request }) => {
          const info = await subgraph.#source.inspector.info();
          return {
            ...info,
            access: subgraph.#isOperator(request) ? info.access : null,
          };
        },
      }),
      schema.field(field.documentModels, {
        resolve: ({ subgraph }) =>
          subgraph.#source.inspector.listDocumentModels(),
      }),
      schema.field(field.drives, {
        resolve: async ({ args, subgraph, request }) => {
          const page = await new DriveInspection(
            subgraph.#readerFor(request),
            subgraph.#source.documentModelRegistry,
          ).listDrives(args.cursor ?? undefined, args.limit ?? undefined);
          const readable = await subgraph.#readableIds(
            page.results.map((drive) => drive.driveId),
            request,
          );
          return {
            results: page.results
              .filter((drive) => readable.has(drive.driveId))
              .map(toWireDrive),
            nextCursor: page.nextCursor ?? null,
          };
        },
      }),
      schema.field(field.driveIntegrity, {
        resolve: async ({ args, subgraph, request }) => {
          subgraph.#admit(request);
          const served = await subgraph.#servedDocument(
            args.driveId,
            args.branch,
            request,
          );
          return new DriveInspection(
            subgraph.#readerFor(request),
            subgraph.#source.documentModelRegistry,
          ).checkDriveIntegrity(served.id, args.branch);
        },
      }),
      schema.field(field.attachmentInfo, {
        resolve: async ({ subgraph, request }) => {
          subgraph.#requireOperator(request);
          const info = await subgraph.#source.inspector.getAttachmentInfo();
          return { ...info, lastError: info.lastError ?? null };
        },
      }),
      schema.field(field.queueState, {
        resolve: async ({ subgraph, request }) => {
          subgraph.#requireOperator(request);
          return toWireQueueState(
            await subgraph.#source.inspector.getQueueState(),
          );
        },
      }),
      schema.field(field.processors, {
        resolve: async ({ subgraph, request }) => {
          subgraph.#requireOperator(request);
          return (await subgraph.#source.inspector.getProcessors()).map(
            toWireProcessor,
          );
        },
      }),
      schema.field(field.catchUpStatus, {
        resolve: ({ subgraph, request }) => {
          subgraph.#requireOperator(request);
          return subgraph.#source.inspector.getCatchUpStatus();
        },
      }),
      schema.field(field.storageHealth, {
        resolve: ({ subgraph, request }) => {
          subgraph.#requireOperator(request);
          return subgraph.#source.inspector.getStorageHealth();
        },
      }),
      schema.field(field.validateDocument, {
        resolve: async ({ args, subgraph, request }) => {
          subgraph.#admit(request);
          const branch = args.branch ?? undefined;
          const served = await subgraph.#servedDocument(
            args.documentId,
            branch,
            request,
          );
          const result = await subgraph.#source.inspector.validateDocument(
            served.id,
            branch,
          );
          return servedIssues(result, served.scopes);
        },
      }),
      schema.field(field.remotes, {
        resolve: async ({ subgraph, request }) => {
          subgraph.#requireOperator(request);
          return toWireRemotes(
            await subgraph.#syncInspector().inspectRemotes(),
            subgraph.syncManager.list(),
          );
        },
      }),
      schema.field(field.remote, {
        resolve: async ({ args, subgraph, request }) => {
          subgraph.#requireOperator(request);
          const inspection = await subgraph.#syncInspector().inspectRemote(
            args.remoteName,
          );
          return toWireRemotes([inspection], subgraph.syncManager.list())[0];
        },
      }),
      schema.field(field.deadLetters, {
        resolve: async ({ args, subgraph, request }) => {
          subgraph.#requireOperator(request);
          let page: DeadLetterPage;
          try {
            page = await subgraph.#syncInspector().listDeadLetters(
              args.remoteName,
              args.cursor ?? undefined,
              args.limit ?? undefined,
            );
          } catch (error) {
            if (error instanceof InvalidDeadLetterCursorError) {
              throw new GraphQLError(error.message, {
                extensions: { code: "BAD_USER_INPUT" },
              });
            }
            throw error;
          }
          return {
            remoteName: page.remoteName,
            results: page.results.map(toWireDeadLetter),
            nextCursor: page.nextCursor ?? null,
          };
        },
      }),
    ];
  }

  readonly #source: IReactorInspectionSource;

  constructor(args: SubgraphArgs) {
    super(args);
    if (!args.inspection) {
      throw new Error(
        "InspectionSubgraph requires an inspection source; the host did not provide one",
      );
    }
    this.#source = args.inspection;
  }

  /** One of the host's listed admins, whatever the policy. */
  #isOperator(ctx: Context): boolean {
    return isListedAdmin(this.authorizationService.config, ctx.user?.address);
  }

  #requireOperator(ctx: Context): void {
    if (!this.#isOperator(ctx)) {
      throw operatorRequired();
    }
  }

  // Charged before any read, so it also throttles probing the gate.
  #admit(ctx: Context): void {
    if (!this.#isOperator(ctx)) {
      this.#source.throttle.charge(
        ctx.user?.address.toLowerCase() ?? "anonymous",
      );
    }
  }

  #syncInspector(): ISyncInspector {
    if (!this.#source.syncInspector) {
      throw noSyncInspector();
    }
    return this.#source.syncInspector;
  }

  /** The reactor client, reading as the caller. */
  #readerFor(ctx: Context): InspectorDocumentReader {
    const subject = this.viewSubject(ctx);
    return {
      find: (search, view, paging) =>
        this.reactorClient.find(search, { ...view, subject }, paging),
      get: (id, view) => this.reactorClient.get(id, { ...view, subject }),
    };
  }

  /** The host's own read check over a listing. */
  async #readableIds(
    ids: readonly string[],
    ctx: Context,
  ): Promise<Set<string>> {
    const readable = await this.readableByHost(
      ids.map((id) => ({ id })),
      ctx,
    );
    return new Set(readable.map((item) => item.id));
  }

  /**
   * The document the caller may read, with the scopes it is served. The host's
   * read check throws on a refusal; a document the reactor does not serve the
   * caller is refused the same way.
   */
  async #servedDocument(
    identifier: string,
    branch: string | undefined,
    ctx: Context,
  ): Promise<{ id: string; scopes: ReadonlySet<string> }> {
    const { fetchIdentifier } = await this.assertCanRead(identifier, ctx);
    const view = { branch, subject: this.viewSubject(ctx) };
    let served: boolean;
    try {
      served = await this.reactorClient.isServed(fetchIdentifier, view);
    } catch {
      served = false;
    }
    if (!served) {
      throw new ForbiddenError("to read this document");
    }
    const document = await this.reactorClient.get(fetchIdentifier, view);
    return {
      id: document.header.id,
      scopes: new Set(Object.keys(document.state ?? {})),
    };
  }
}
