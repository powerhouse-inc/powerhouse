import { JWT_EXPIRATION_PERIOD, JWT_SECRET } from "#graphql/auth/env/index.js";
import { Session, SessionInput } from "#graphql/auth/types.js";
import { Db } from "#utils/db.js";
import { randomUUID } from "crypto";
import { GraphQLError } from "graphql";
import jwt from "jsonwebtoken";
import ms from "ms";
import wildcard from "wildcard-match";
import z from "zod";
const jwtSchema = z.object({
  sessionId: z.string(),
  exp: z.optional(z.number()),
});

export const formatToken = (token: string) =>
  `${token.slice(0, 4)}...${token.slice(-4)}`;

/** Generate a JWT token
 * - If expiryDurationSeconds is null, the token will never expire
 * - If expiryDurationSeconds is undefined, the token will expire after the default expiry period
 */
const generateToken = (
  sessionId: string,
  expiryDurationSeconds?: number | null,
): string => {
  if (expiryDurationSeconds === null) {
    return jwt.sign({ sessionId }, JWT_SECRET);
  }

  const expiresIn = expiryDurationSeconds
    ? ms(expiryDurationSeconds * 1000)
    : (JWT_EXPIRATION_PERIOD ?? 3600);
  return jwt.sign({ sessionId }, JWT_SECRET, { expiresIn });
};

const getExpiryDateFromToken = (token: string): Date | null => {
  const { exp } = jwtSchema.parse(jwt.verify(token, JWT_SECRET));
  if (!exp) {
    return null;
  }
  return new Date(exp * 1000);
};

export const verifyToken = (
  token: string,
): { sessionId: string } | undefined => {
  const verified = jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      throw new GraphQLError(
        err.name === "TokenExpiredError"
          ? "Token expired"
          : "Invalid authentication token",
        { extensions: { code: "AUTHENTICATION_TOKEN_ERROR" } },
      );
    }
    return decoded;
  }) as { sessionId: string } | undefined;
  if (!verified) {
    return undefined;
  }
  const validated = jwtSchema.parse(verified);
  return validated;
};

function parseOriginMarkup(originParam: string): string {
  if (originParam === "*") {
    return "*";
  }
  const trimmedOriginParam = originParam.trim();
  const origins = trimmedOriginParam.split(",").map((origin) => origin.trim());
  origins.forEach((origin) => {
    if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
      throw new GraphQLError("Origin must start with 'http://' or 'https://'", {
        extensions: { code: "INVALID_ORIGIN_PROTOCOL" },
      });
    }
  });
  return origins.join(",");
}

export function validateOriginAgainstAllowed(
  allowedOrigins: string,
  originReceived?: string,
) {
  if (allowedOrigins === "*") {
    return;
  }
  if (!originReceived) {
    throw new GraphQLError("Origin not provided", {
      extensions: { code: "ORIGIN_HEADER_MISSING" },
    });
  }
  const allowedOriginsSplit = allowedOrigins.split(",");
  if (!wildcard(allowedOriginsSplit)(originReceived)) {
    throw new GraphQLError(
      `Access denied due to origin restriction: ${allowedOrigins}, ${originReceived}`,
      {
        extensions: { code: "ORIGIN_FORBIDDEN" },
      },
    );
  }
}

export const generateTokenAndSession = async (
  db: Db,
  session: SessionInput,
  userId: string,
  isUserCreated: boolean,
) => {
  const sessionId = randomUUID();
  const generatedToken = generateToken(sessionId, Number(session.expiresAt));
  const referenceExpiryDate = getExpiryDateFromToken(generatedToken);
  const referenceTokenId = formatToken(generatedToken);
  const allowedOrigins = parseOriginMarkup(
    Array.isArray(session.allowedOrigins)
      ? session.allowedOrigins.join(",")
      : session.allowedOrigins,
  );
  const createdSession = await db<Session>("Session").insert({
    id: sessionId,
    name: session.name,
    allowedOrigins,
    referenceExpiryDate: referenceExpiryDate?.toISOString(),
    referenceTokenId,
    isUserCreated: isUserCreated,
    createdBy: userId,
  });
  return {
    token: generatedToken,
    session: createdSession,
  };
};
