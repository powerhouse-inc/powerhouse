import { BaseDocumentDriveServer } from "document-drive";
import { logger } from "document-drive/logger";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { challengeTable, sessionTable } from "./schema";
import { SiweMessage } from 'siwe';
import url from 'url';
import { randomUUID } from 'crypto';
import { Context } from "../../types";
import { GraphQLError } from "graphql";
import { and, count, eq } from "drizzle-orm";
import { upsertUser } from "./utils/user";
import { createAuthenticationSession, verifySignature } from "./utils/session";
import { SessionInput } from "./types";
import { generateTokenAndSession } from "./helpers";

const textToHex = (textMessage: string) =>
    `0x${Buffer.from(textMessage, 'utf8').toString('hex')}`;


export const resolvers = {
    Query: {
        me: async (_: unknown, __: unknown, ctx: Context) => {
            const { user } = ctx;
            if (!user) {
                throw new GraphQLError('User not found');
            }
            return user;
        }
    },
    Mutation: {
        createChallenge: async (_: unknown, { address }: { address: string }, ctx: Context) => {
            const { db } = ctx;
            const { API_ORIGIN } = process.env;

            logger.debug('createChallenge: received', address);

            const origin = API_ORIGIN ?? 'http://localhost:3000';
            const domain = url.parse(origin).hostname!;

            const nonce = randomUUID().replace(/-/g, '');
            const message = new SiweMessage({
                address,
                nonce,
                uri: origin,
                domain,
                version: '1',
                chainId: 1
            }).prepareMessage();
            const hexMessage = textToHex(message);
            logger.debug('createChallenge: created message', message, hexMessage);

            await db.insert(challengeTable).values({ nonce, message }).returning();

            return {
                nonce,
                message,
                hex: hexMessage
            };
        },
        solveChallenge: async (_: unknown, { nonce, signature }: { nonce: string, signature: string }, ctx: Context) => {
            const { db } = ctx;
            return db.transaction(async tx => {
                const [challenge] = await tx.select().from(challengeTable).where(eq(challengeTable.nonce, nonce))
                logger.debug('solveChallenge: found challenge', challenge);

                // check that challenge with this nonce exists
                if (!challenge) {
                    throw new GraphQLError('The nonce is not known');
                }

                // check that challenge was not used
                if (challenge.signature) {
                    throw new GraphQLError('The signature was already used');
                }

                // verify signature
                const parsedMessage = new SiweMessage(challenge.message);
                try {
                    await verifySignature(parsedMessage, signature);
                } catch (error) {
                    throw new GraphQLError('Signature validation has failed');
                }

                // mark challenge as used
                await tx.update(challengeTable).set({
                    signature
                }).where(eq(challengeTable.nonce, nonce));

                // create user and session
                const user = await upsertUser(db, {
                    address: parsedMessage.address as `0x${string}`,
                    networkId: "1",
                    chainId: 1
                });

                if (!user) {
                    throw new GraphQLError('User not found');
                }

                const tokenAndSession = await createAuthenticationSession(db, user.address);

                return tokenAndSession;
            });
        },
        createSession: async (_: unknown, { session }: { session: SessionInput }, ctx: Context) => {
            const { db } = ctx;
            return generateTokenAndSession(db, userId, session, isUserCreated);
        },
        revokeSession: async (_: unknown, { sessionId, userId }: { sessionId: string, userId: string }, ctx: Context) => {
            const { db } = ctx;
            const [session] = await db.select().from(sessionTable).where(and(eq(sessionTable.id, sessionId), eq(sessionTable.createdBy, userId)));

            if (!session) {
                throw new GraphQLError('Session not found', {
                    extensions: { code: 'SESSION_NOT_FOUND' }
                });
            }
            if (session.revokedAt !== null) {
                throw new GraphQLError('Session already revoked', {
                    extensions: { code: 'SESSION_ALREADY_REVOKED' }
                });
            }
            const [updatedSession] = await db.update(sessionTable).set({
                revokedAt: new Date().toISOString()
            }).where(and(eq(sessionTable.id, sessionId), eq(sessionTable.createdBy, userId)));
            if (updatedSession) {
                throw new GraphQLError('Session not found');
            }
            return { ...updatedSession };
        }
    }
};
