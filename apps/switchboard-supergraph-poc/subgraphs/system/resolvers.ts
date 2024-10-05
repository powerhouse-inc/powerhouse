import { BaseDocumentDriveServer } from "document-drive";

export const resolvers = {
    Query: {
        drives: (parent, args, ctx) => {
            return ctx.driveServer.getDrives();
        }
    },
    Mutation: {
        addDrive: async (parent, args, ctx) => {
            try {
                const drive = await (ctx.driveServer as BaseDocumentDriveServer).addDrive({ global: args.global, local: { availableOffline: true, listeners: [], sharingType: "public", triggers: [] } });
                return drive.state.global;
            } catch (e) {
                console.error(e);
                throw new Error(e);
            }

        }
    }
};