import { BaseDocumentDriveServer } from "document-drive";

export const resolvers = {
    Query: {
        me: async (_, __, ctx) => {
            return {
                address: '0x123',
                createdAt: new Date()
            };
        }
    },
    Mutation: {
        createChallenge: async (_, { address }, ctx) => {
            return {
                nonce: '123',
                message: 'Hello, world!',
                hex: '0x123'
            };
        },
        solveChallenge: async (_, { nonce, signature }, ctx) => {
            return {
                session: {
                    id: '123',
                    userId: '456',
                    address: '0x123',
                    expiresAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                token: '123'
            };
        },
        createSession: async (_, { session }, ctx) => {
            return {
                session: {
                    id: '123',
                    userId: '456',
                    address: '0x123',
                    expiresAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                token: '123'
            };
        },
        revokeSession: async (_, { sessionId }, ctx) => {
            return {
                session: {
                    id: '123',
                    userId: '456',
                    address: '0x123',
                    expiresAt: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date()
                },
                token: '123'
            };
        }
    }
};
