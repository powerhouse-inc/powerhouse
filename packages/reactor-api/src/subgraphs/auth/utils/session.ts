import { type Context } from "#subgraphs/types.js";
import { type Db } from "#types.js";
import { GraphQLError } from "graphql";
import ms from "ms";
import { type SiweMessage } from "siwe";
import { JWT_EXPIRATION_PERIOD } from "../env/index.js";
import { type Session } from "../types.js";
import {
  generateTokenAndSession,
  validateOriginAgainstAllowed,
  verifyToken,
} from "./helpers.js";

export const createAuthenticationSession = async (
  db: Db,
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
  db: Db,
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

export const listSessions = async (db: Db, userId: string) => {
  return db<Session>("Session").select().where("createdBy", userId);
};

export const revoke = async (db: Db, sessionId: string, userId: string) => {
  const [session] = await db<Session>("Session").select().where({
    id: sessionId,
    userId,
  });

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
  await db<Session>("Session")
    .update({
      revokedAt: new Date().toISOString(),
    })
    .where({
      id: sessionId,
      userId,
    });
};

export const authenticate = async (context: Context) => {
  const authorization = context.headers.authorization;
  const db = context.db as Db;
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
  db: Db,
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
  const [session] = await db<Session>("Session").select().where({
    id: sessionId,
  });
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
    (!session.allowedOrigins ||
      session.allowedOrigins === "*" ||
      session.allowedOrigins.includes(origin))
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
