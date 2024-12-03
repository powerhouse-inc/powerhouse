import { and, eq } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { GraphQLError } from "graphql";
import ms from "ms";
import { SiweMessage } from "siwe";
import { JWT_EXPIRATION_PERIOD } from "../env";
import {
  generateTokenAndSession,
  validateOriginAgainstAllowed,
  verifyToken,
} from "../helpers";
import { sessionTable } from "../schema";
import { getDb } from "../../../db";
import { PgDatabase } from "drizzle-orm/pg-core";
import { Context } from "../../../../types";

export const createAuthenticationSession = async (
  db: PgDatabase<any, any, any>,
  userId: string,
  allowedOrigins = ["*"],
) => {
  return generateTokenAndSession(
    db,
    {
      expiresAt: new Date(
        new Date().getTime() + ms(JWT_EXPIRATION_PERIOD),
      ).toISOString(),
      name: "Sign in/Sign up",
      allowedOrigins,
    },
    userId,
    true,
  );
};

export const createCustomSession = async (
  db: PgDatabase<any, any, any>,
  userId: string,
  session: {
    expiryDurationSeconds?: number | null;
    name: string;
    allowedOrigins: string[];
  },
  isUserCreated = false,
) => {
  return generateTokenAndSession(db, session, userId, isUserCreated);
};

export const listSessions = async (
  db: PgDatabase<any, any, any>,
  userId: string,
) => {
  return db
    .select()
    .from(sessionTable)
    .where(eq(sessionTable.createdBy, userId));
};

export const revoke = async (
  db: DrizzleD1Database,
  sessionId: string,
  userId: string,
) => {
  const [session] = await db
    .select()
    .from(sessionTable)
    .where(
      and(eq(sessionTable.id, sessionId), eq(sessionTable.createdBy, userId)),
    );

  if (!session) {
    throw new GraphQLError("Session not found", {
      extensions: { code: "SESSION_NOT_FOUND" },
    });
  }
  if (session.revokedAt !== null) {
    throw new GraphQLError("Session already revoked", {
      extensions: { code: "SESSION_ALREADY_REVOKED" },
    });
  }
  return db
    .update(sessionTable)
    .set({
      revokedAt: new Date().toISOString(),
    })
    .where(eq(sessionTable.id, sessionId));
};

export const authenticate = async (context: Context) => {
  const authorization = context.headers.authorization;
  const db = await getDb();
  if (!authorization) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: "NOT_AUTHENTICATED" },
    });
  }
  const token = authorization.replace("Bearer ", "");
  const origin = context.headers.origin;
  const session = await getSessionByToken(db, origin, token);
  return session;
};

export const getSessionByToken = async (
  db: PgDatabase<any, any, any>,
  origin?: string,
  token?: string,
) => {
  if (!token) {
    throw new GraphQLError("Not authenticated", {
      extensions: { code: "NOT_AUTHENTICATED" },
    });
  }
  const verificationTokenResult = verifyToken(token);
  if (!verificationTokenResult) {
    throw new GraphQLError("Invalid token", {
      extensions: { code: "INVALID_TOKEN" },
    });
  }
  const { sessionId } = verificationTokenResult;
  const [session] = await db
    .select()
    .from(sessionTable)
    .where(eq(sessionTable.id, sessionId));
  if (!session) {
    throw new GraphQLError("Session not found", {
      extensions: { code: "SESSION_NOT_FOUND" },
    });
  }
  if (session.revokedAt) {
    throw new GraphQLError("Session expired", {
      extensions: { code: "SESSION_EXPIRED" },
    });
  }
  if (
    origin &&
    session.allowedOrigins !== "*" &&
    !session.allowedOrigins.includes(origin)
  ) {
    validateOriginAgainstAllowed(session.allowedOrigins, origin);
  }
  return session;
};

export const verifySignature = async (
  parsedMessage: SiweMessage,
  signature: string,
) => {
  try {
    const response = await parsedMessage.verify({
      time: new Date().toISOString(),
      signature,
    });
    return response;
  } catch (error) {
    throw new GraphQLError("Invalid signature");
  }
};
