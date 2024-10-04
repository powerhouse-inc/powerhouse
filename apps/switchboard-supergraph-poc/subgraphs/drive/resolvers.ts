import { BaseDocumentDriveServer } from "document-drive";

export const resolvers = {
    Query: {
        drive: async (parent, args, ctx) => {
            const drive = await (ctx.driveServer as BaseDocumentDriveServer).getDrive(ctx.driveId);
            return drive.state.global;
        },
    }
};
