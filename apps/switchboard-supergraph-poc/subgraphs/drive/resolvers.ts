import { BaseDocumentDriveServer, generateUUID, PullResponderTransmitter } from "document-drive";
import { actions, TransmitterType } from "document-model-libs/document-drive";

export const resolvers = {
    Query: {
        drive: async (_, args, ctx) => {
            const drive = await (ctx.driveServer as BaseDocumentDriveServer).getDrive(ctx.driveId);
            return drive.state.global;
        },
        documents: async (_, args, ctx) => {
            const documents = await (ctx.driveServer as BaseDocumentDriveServer).getDocuments(ctx.driveId);
            return documents;
        },
        document: async (_, { id }, ctx) => {
            const document = await (ctx.driveServer as BaseDocumentDriveServer).getDocument(ctx.driveId, id);
            return document;
        },
        system: () => ({ sync: {} }),
    },
    Mutation: {
        registerPullResponderListener: async (_, { filter }, ctx) => {
            const uuid = generateUUID();
            const listener = {
                block: false,
                callInfo: {
                    data: '',
                    name: 'PullResponder',
                    transmitterType: 'PullResponder' as TransmitterType
                },
                filter: {
                    branch: filter.branch ?? [],
                    documentId: filter.documentId ?? [],
                    documentType: filter.documentType ?? [],
                    scope: filter.scope ?? []
                },
                label: `Pullresponder #${uuid}`,
                listenerId: uuid,
                system: false,
                driveId: ctx.driveId
            };

            const result = await ctx.driveServer.queueDriveAction(
                ctx.driveId,
                actions.addListener({ listener })
            );

            console.log(result);
            if (result.status !== 'SUCCESS') {
                throw new Error(
                    `Listener couldn't be registered: ${result.error || result.status}`
                );
            }

            return listener;
        },
        pushUpdates: async (_, { strands }, ctx) => {
            const listenerRevisions = await Promise.all(
                strands.map(async s => {
                    const operations =
                        s.operations?.map(o => ({
                            ...o,
                            input: JSON.parse(o.input),
                            skip: o.skip ?? 0,
                            scope: s.scope,
                            branch: 'main'
                        })) ?? [];


                    const result = await (s.documentId ?
                        ctx.driveServer.queueOperations(
                            s.driveId,
                            s.documentId,
                            operations
                        )
                        : ctx.driveServer.queueDriveOperations(
                            s.driveId,
                            operations
                        ));


                    const revision =
                        result.document?.operations[s.scope].slice().pop()
                            ?.index ?? -1;

                    return {
                        revision,
                        branch: s.branch,
                        documentId: s.documentId ?? '',
                        driveId: s.driveId,
                        scope: s.scope,
                        status: result.status,
                        error: result.error?.message
                    };
                })
            );

            return listenerRevisions;
        },
        acknowledge: async (_, { listenerId, revisions }, ctx) => {
            if (!listenerId || !revisions) return false;
            const validEntries = revisions
                .filter(r => r !== null)
                .map(e => ({
                    driveId: e!.driveId,
                    documentId: e!.documentId,
                    scope: e!.scope,
                    branch: e!.branch,
                    revision: e!.revision,
                    status: e!.status
                }));

            const result = await ctx.driveServer.processAcknowledge(
                ctx.driveId ?? '1',
                listenerId,
                validEntries
            );

            return result;
        },
    },
    System: {

    },
    Sync: {
        strands: async (_, { listenerId, since }, ctx) => {
            const listener = (await (ctx.driveServer as BaseDocumentDriveServer).getTransmitter(ctx.driveId, listenerId)) as PullResponderTransmitter
            const strands = await listener.getStrands({ since })
            return strands.map(e => ({
                driveId: e.driveId,
                documentId: e.documentId,
                scope: e.scope,
                branch: e.branch,
                operations: e.operations.map(o => ({
                    index: o.index,
                    skip: o.skip,
                    name: o.type,
                    input: JSON.stringify(o.input),
                    hash: o.hash,
                    timestamp: o.timestamp,
                    type: o.type,
                    context: o.context,
                    id: o.id
                }))
            }));
        }
    }




};
