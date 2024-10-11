import {
  generateUUID,
  ListenerRevision,
  PullResponderTransmitter,
  StrandUpdateGraphQL,
} from "document-drive";
import {
  actions,
  DocumentDriveAction,
  Listener,
  ListenerFilter,
  TransmitterType,
} from "document-model-libs/document-drive";
import { BaseAction, Operation } from "document-model/document";
import { DocumentModelInput } from "document-model/document-model";
import { Context } from "../../types";

export const resolvers = {
  Query: {
    drive: async (_: unknown, args: unknown, ctx: Context) => {
      if (!ctx.driveId) throw new Error("Drive ID is required");
      const drive = await ctx.driveServer.getDrive(ctx.driveId);
      return drive.state.global;
    },
    documents: async (_: unknown, args: unknown, ctx: Context) => {
      if (!ctx.driveId) throw new Error("Drive ID is required");
      const documents = await ctx.driveServer.getDocuments(ctx.driveId);
      return documents;
    },
    document: async (_: unknown, { id }: { id: string }, ctx: Context) => {
      if (!ctx.driveId) throw new Error("Drive ID is required");
      const document = await ctx.driveServer.getDocument(ctx.driveId, id);

      const dms = ctx.driveServer.getDocumentModels();
      const dm = dms.find(
        ({ documentModel }) => documentModel.id === document.documentType,
      );
      const globalState = document.state.global;
      if (!globalState) throw new Error("Document not found");
      const response = {
        ...document,
        id,
        revision: document.revision.global,
        state: document.state.global,
        operations: document.operations.global.map((op) => ({
          ...op,
          inputText:
            typeof op.input === "string" ? op.input : JSON.stringify(op.input),
        })),
        initialState: document.initialState.state.global,
        __typename: dm?.documentModel.name,
      };
      console.log(response);
      return response;
    },
    system: () => ({ sync: {} }),
  },
  Mutation: {
    registerPullResponderListener: async (
      _: unknown,
      { filter }: { filter: ListenerFilter },
      ctx: Context,
    ) => {
      if (!ctx.driveId) throw new Error("Drive ID is required");
      const uuid = generateUUID();
      const listener: Listener = {
        block: false,
        callInfo: {
          data: "",
          name: "PullResponder",
          transmitterType: "PullResponder" as TransmitterType,
        },
        filter: {
          branch: filter.branch ?? [],
          documentId: filter.documentId ?? [],
          documentType: filter.documentType ?? [],
          scope: filter.scope ?? [],
        },
        label: `Pullresponder #${uuid}`,
        listenerId: uuid,
        system: false,
      };

      const result = await ctx.driveServer.queueDriveAction(
        ctx.driveId,
        actions.addListener({ listener }),
      );

      console.log(result);
      if (result.status !== "SUCCESS" && result.error) {
        throw new Error(
          `Listener couldn't be registered: ${result.error.message}`,
        );
      }

      return listener;
    },
    pushUpdates: async (
      _: unknown,
      { strands }: { strands: StrandUpdateGraphQL[] },
      ctx: Context,
    ) => {
      if (!ctx.driveId) throw new Error("Drive ID is required");
      const listenerRevisions: ListenerRevision[] = await Promise.all(
        strands.map(async (s) => {
          const operations =
            s.operations.map((o) => ({
              ...o,
              input: JSON.parse(o.input) as DocumentModelInput,
              skip: o.skip ?? 0,
              scope: s.scope,
              branch: "main",
            })) ?? [];

          const result = await (s.documentId !== undefined
            ? ctx.driveServer.queueOperations(
                s.driveId,
                s.documentId,
                operations,
              )
            : ctx.driveServer.queueDriveOperations(
                s.driveId,
                operations as Operation<DocumentDriveAction | BaseAction>[],
              ));

          const scopeOperations = result.document?.operations[s.scope] ?? [];
          if (scopeOperations.length === 0) {
            return {
              revision: -1,
              branch: s.branch,
              documentId: s.documentId ?? "",
              driveId: s.driveId,
              scope: s.scope,
              status: result.status,
            };
          }

          const revision = scopeOperations.slice().pop()?.index ?? -1;
          return {
            revision,
            branch: s.branch,
            documentId: s.documentId ?? "",
            driveId: s.driveId,
            scope: s.scope,
            status: result.status,
            error: result.error?.message || undefined,
          };
        }),
      );

      return listenerRevisions;
    },
    acknowledge: async (
      _: unknown,
      {
        listenerId,
        revisions,
      }: { listenerId: string; revisions: ListenerRevision[] },
      ctx: Context,
    ) => {
      if (!listenerId || !revisions) return false;
      if (!ctx.driveId) throw new Error("Drive ID is required");
      const validEntries = revisions
        .filter((r) => r !== null)
        .map((e) => ({
          driveId: e.driveId,
          documentId: e.documentId,
          scope: e.scope,
          branch: e.branch,
          revision: e.revision,
          status: e.status,
        }));

      const transmitter = (await ctx.driveServer.getTransmitter(
        ctx.driveId,
        listenerId,
      )) as PullResponderTransmitter;
      const result = await transmitter.processAcknowledge(
        ctx.driveId ?? "1",
        listenerId,
        validEntries,
      );

      return result;
    },
  },
  System: {},
  Sync: {
    strands: async (
      _: unknown,
      { listenerId, since }: { listenerId: string; since: string | undefined },
      ctx: Context,
    ) => {
      if (!ctx.driveId) throw new Error("Drive ID is required");
      const listener = (await ctx.driveServer.getTransmitter(
        ctx.driveId,
        listenerId,
      )) as PullResponderTransmitter;
      const strands = await listener.getStrands({ since });
      return strands.map((e) => ({
        driveId: e.driveId,
        documentId: e.documentId,
        scope: e.scope,
        branch: e.branch,
        operations: e.operations.map((o) => ({
          index: o.index,
          skip: o.skip,
          name: o.type,
          input: JSON.stringify(o.input),
          hash: o.hash,
          timestamp: o.timestamp,
          type: o.type,
          context: o.context,
          id: o.id,
        })),
      }));
    },
  },
};
