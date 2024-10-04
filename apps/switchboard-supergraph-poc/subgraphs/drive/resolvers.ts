import { BaseDocumentDriveServer } from "document-drive";

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
        }
    },
    Mutation: {
        registerPullResponder: async (_, { filter }, ctx) => {
            const result = await ctx.driveServer.registerPullResponderListener(
                ctx.driveId ?? '1',
                {
                    branch: (filter.branch?.filter(b => !!b) as string[]) ?? [],
                    documentId: (filter.documentId?.filter(b => !!b) as string[]) ?? [],
                    documentType:
                        (filter.documentType?.filter(b => !!b) as string[]) ?? [],
                    scope: (filter.scope?.filter(b => !!b) as string[]) ?? []
                }
            );

            return result;
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

                    const result = await ctx.driveServer.pushUpdates(
                        s.driveId,
                        operations,
                        s.documentId ?? undefined
                    );

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
    }
};
