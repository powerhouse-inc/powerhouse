import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { SiweMessage } from "siwe";
import { URL } from "url";
import { Context } from "../../../types";
import { getDb } from "../../db";
import { generateTokenAndSession } from "./helpers";
import { challengeTable, sessionTable } from "./schema";
import { SessionInput } from "./types";
import {
  authenticate,
  createAuthenticationSession,
  verifySignature,
} from "./utils/session";
import { getUser, upsertUser } from "./utils/user";

const textToHex = (textMessage: string) =>
  `0x${Buffer.from(textMessage, "utf8").toString("hex")}`;

export const resolvers = {
  Query: {
    me: async (_: unknown, __: unknown, ctx: Context) => {
      const session = await authenticate(ctx);
      const db = await getDb();
      const user = await getUser(db, session.createdBy);
      return user;
    },
    sessions: async (_: unknown, __: unknown, ctx: Context) => {
      const session = await authenticate(ctx);
      const db = await getDb();
      const sessions = await db
        .select()
        .from(sessionTable)
        .where(eq(sessionTable.createdBy, session.createdBy))
        .orderBy(desc(sessionTable.createdAt));
      return sessions;
    },
  },
  Mutation: {
    createChallenge: async (
      _: unknown,
      { address }: { address: string },
      ctx: Context
    ) => {
      const db = await getDb();
      const { API_ORIGIN } = process.env;

      const origin = API_ORIGIN ?? "http://localhost:3000";
      const domain = URL.parse(origin)?.hostname;

      if (!domain) {
        throw new GraphQLError("Invalid origin");
      }

      const nonce = randomUUID().replace(/-/g, "");
      const message = new SiweMessage({
        address,
        nonce,
        uri: origin,
        domain,
        version: "1",
        chainId: 1,
      }).prepareMessage();
      const hexMessage = textToHex(message);

      await db
        .insert(challengeTable)
        .values({ nonce, message, updatedAt: new Date().toISOString() })
        .returning();

      return {
        nonce,
        message,
        hex: hexMessage,
      };
    },
    solveChallenge: async (
      _: unknown,
      { nonce, signature }: { nonce: string; signature: string },
      ctx: Context
    ) => {
      const db = await getDb();
      return db.transaction(async (tx) => {
        const [challenge] = await tx
          .select()
          .from(challengeTable)
          .where(eq(challengeTable.nonce, nonce));

        // check that challenge with this nonce exists
        if (!challenge) {
          throw new GraphQLError("The nonce is not known");
        }

        // check that challenge was not used
        if (challenge.signature) {
          throw new GraphQLError("The signature was already used");
        }

        // verify signature
        const parsedMessage = new SiweMessage(challenge.message);
        try {
          await verifySignature(parsedMessage, signature);
        } catch (error) {
          throw new GraphQLError("Signature validation has failed");
        }

        // mark challenge as used
        await tx
          .update(challengeTable)
          .set({
            signature,
          })
          .where(eq(challengeTable.nonce, nonce));

        // create user and session
        const user = await upsertUser(db, {
          address: parsedMessage.address as `0x${string}`,
          networkId: "1",
          chainId: 1,
        });

        if (!user) {
          throw new GraphQLError("User not found");
        }

        const tokenAndSession = await createAuthenticationSession(
          db,
          user.address
        );

        return tokenAndSession;
      });
    },
    createSession: async (
      _: unknown,
      { session }: { session: SessionInput },
      ctx: Context
    ) => {
      const db = await getDb();
      const sessionAuth = await authenticate(ctx);
      return generateTokenAndSession(
        db,
        session,
        sessionAuth.createdBy,
        sessionAuth.isUserCreated
      );
    },
    revokeSession: async (
      _: unknown,
      { sessionId, userId }: { sessionId: string; userId: string },
      ctx: Context
    ): Promise<{ id: string }> => {
      const user = await authenticate(ctx);
      const db = await getDb();
      const [session] = await db
        .select()
        .from(sessionTable)
        .where(
          and(
            eq(sessionTable.id, sessionId),
            eq(sessionTable.createdBy, user.createdBy)
          )
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

      await db
        .update(sessionTable)
        .set({
          revokedAt: new Date().toISOString(),
        })
        .where(
          and(
            eq(sessionTable.id, sessionId),
            eq(sessionTable.createdBy, user.createdBy)
          )
        );

      return { id: session.id };
    },
  },
};
