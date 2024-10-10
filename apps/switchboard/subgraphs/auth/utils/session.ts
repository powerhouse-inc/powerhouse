import { GraphQLError } from "graphql";
import { JWT_EXPIRATION_PERIOD } from "../env";
import ms from 'ms';
import { DrizzleD1Database } from "drizzle-orm/d1";
import { sessionTable } from "../schema";
import { and, eq } from "drizzle-orm";
import { generateTokenAndSession, validateOriginAgainstAllowed, verifyToken } from "../helpers";
import { SiweMessage } from "siwe";

export const createAuthenticationSession = async (
    db: DrizzleD1Database,
    userId: string,
    allowedOrigins: string = '*'
) => {
    return generateTokenAndSession(db, userId, {
        expiryDurationSeconds: ms(JWT_EXPIRATION_PERIOD) / 1000,
        name: 'Sign in/Sign up',
        allowedOrigins
    });
}


export const createCustomSession = async (
    db: DrizzleD1Database,
    userId: string,
    session: {
        expiryDurationSeconds?: number | null;
        name: string;
        allowedOrigins: string;
    },
    isUserCreated: boolean = false
) => {
    return generateTokenAndSession(db, userId, session, isUserCreated);
}

export const listSessions = async (db: DrizzleD1Database, userId: string) => {
    return db.select().from(sessionTable).where(eq(sessionTable.createdBy, userId));
}

export const revoke = async (db: DrizzleD1Database, sessionId: string, userId: string) => {
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
    return db.update(sessionTable).set({
        revokedAt: new Date().toISOString()
    }).where(eq(sessionTable.id, sessionId));
}

export const getSessionByToken = async (db: DrizzleD1Database, origin?: string, token?: string) => {
    if (!token) {
        throw new GraphQLError('Not authenticated', {
            extensions: { code: 'NOT_AUTHENTICATED' }
        });
    }
    const verificationTokenResult = verifyToken(token);
    const { sessionId } = verificationTokenResult;
    const [session] = await db.select().from(sessionTable).where(eq(sessionTable.id, sessionId))
    if (!session) {
        throw new GraphQLError('Session not found', {
            extensions: { code: 'SESSION_NOT_FOUND' }
        });
    }
    if (session.revokedAt) {
        throw new GraphQLError('Session expired', {
            extensions: { code: 'SESSION_EXPIRED' }
        });
    }
    if (origin && session.allowedOrigins !== '*' && !session.allowedOrigins.includes(origin)) {
        validateOriginAgainstAllowed(session.allowedOrigins, origin);
    }
    return session;
}

export const verifySignature = async (
    parsedMessage: SiweMessage,
    signature: string
) => {
    try {
        const response = await parsedMessage.verify({
            time: new Date().toISOString(),
            signature
        });
        return response;
    } catch (error) {
        throw new GraphQLError('Invalid signature');
    }
};