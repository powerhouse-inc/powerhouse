import { Subgraph } from "#graphql/index.js";
import { Db } from "#types.js";
import { GraphQLResolverMap } from "@apollo/subgraph/dist/schema-helper/resolverMap.js";
import { generateUUID } from "document-drive";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import { SiweMessage } from "siwe";
import { Context } from "../types.js";
import { AuthContext, Challenge, Session, SessionInput } from "./types.js";
import { generateTokenAndSession } from "./utils/helpers.js";
import {
  authenticate,
  createAuthenticationSession,
  verifySignature,
} from "./utils/session.js";
import { getUser, upsertUser } from "./utils/user.js";

export class AuthSubgraph extends Subgraph {
  name = "auth";
  typeDefs = gql`
    type Query {
      me: User
      sessions: [Session!]!
    }

    type Mutation {
      createChallenge(address: String!): Challenge
      solveChallenge(nonce: String!, signature: String!): SessionOutput
      createSession(session: SessionInput!): SessionOutput
      revokeSession(sessionId: String!): SessionOutput
    }

    type User {
      address: String!
      createdAt: DateTime!
    }

    type Challenge {
      nonce: String!
      message: String!
      hex: String!
    }

    type SessionOutput {
      id: ID!
      token: String
    }

    type Session {
      id: ID!
      userId: String!
      address: String!
      expiresAt: DateTime!
      createdAt: DateTime!
      updatedAt: DateTime!
      referenceTokenId: String!
      createdBy: String!
      referenceExpiryDate: DateTime
      isUserCreated: Boolean!
      name: String
      allowedOrigins: String
      revokedAt: DateTime
    }

    input SessionInput {
      expiryDurationSeconds: Int
      name: String!
      allowedOrigins: String!
    }
  `;

  resolvers: GraphQLResolverMap<AuthContext> = {
    Query: {
      me: async (_, __, ctx) => {
        const db = ctx.db as Db;
        const session = await authenticate(ctx);
        const user = await getUser(db, session.createdBy);
        return user;
      },
      sessions: async (_: unknown, __: unknown, ctx: Context) => {
        const session = await authenticate(ctx);
        const db = ctx.db as Db;
        const sessions = await db<Session>("Session")
          .select()
          .where("createdBy", session.createdBy)
          .orderBy("createdAt", "desc");
        return sessions;
      },
    },
    Mutation: {
      createChallenge: async (
        _: unknown,
        { address }: { address: string },
        ctx: Context,
      ) => {
        const db = ctx.db as Db;
        const { API_ORIGIN } = process.env;

        const origin = API_ORIGIN ?? "http://localhost:3000";
        const domain = new URL(origin).hostname;

        if (!domain) {
          throw new GraphQLError("Invalid origin");
        }

        const nonce = generateUUID().replace(/-/g, "");

        const message = new SiweMessage({
          address,
          nonce,
          uri: origin,
          domain,
          version: "1",
          chainId: 1,
        }).prepareMessage();
        const textToHex = (textMessage: string) =>
          `0x${Buffer.from(textMessage, "utf8").toString("hex")}`;
        if (!message || typeof message !== "string") {
          throw new GraphQLError("Failed to create challenge");
        }
        const hexMessage = textToHex(message);

        await db("Challenge").insert({
          nonce,
          message,
          updatedAt: new Date().toISOString(),
        });

        return {
          nonce,
          message,
          hex: hexMessage,
        };
      },
      solveChallenge: async (
        _: unknown,
        { nonce, signature }: { nonce: string; signature: string },
        ctx: Context,
      ) => {
        const db = ctx.db as Db;
        const data = await db.transaction(async (tx) => {
          const [challenge] = await tx<Challenge>("Challenge")
            .select()
            .where("nonce", nonce);

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
          await tx<Challenge>("Challenge")
            .update({
              signature,
            })
            .where("nonce", nonce);

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
            user.address,
          );

          return tokenAndSession;
        });

        return data;
      },
      createSession: async (
        _: unknown,
        { session }: { session: SessionInput },
        ctx: Context,
      ) => {
        const db = ctx.db as Db;
        const sessionAuth = await authenticate(ctx);
        const tokenAndSession = await generateTokenAndSession(
          db,
          session,
          sessionAuth.createdBy,
          sessionAuth.isUserCreated,
        );
        if (!tokenAndSession) {
          throw new GraphQLError("Failed to create session");
        }
        return tokenAndSession;
      },
      revokeSession: async (
        _: unknown,
        { sessionId }: { sessionId: string },
        ctx: Context,
      ): Promise<{ id: string }> => {
        const user = await authenticate(ctx);
        const db = ctx.db as Db;
        const [session] = await db<Session>("Session").select().where({
          id: sessionId,
          createdBy: user.createdBy,
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
            createdBy: user.createdBy,
          });

        return { id: session.id };
      },
    },
  };

  async onSetup() {
    await super.onSetup();
    await this.#createTables();
    this.subgraphManager.setAdditionalContextFields({
      session: async (ctx: Context) => {
        const bearerToken = ctx.headers.authorization?.split(" ")[1];
        if (!bearerToken) {
          return null;
        }

        // @todo: optimize and cache this
        const db = ctx.db as Db;
        const [session] = await db<Session>("Session")
          .select()
          .where({
            referenceTokenId: bearerToken,
          })
          .limit(1);

        return session;
      },
    });
  }

  async #createTables() {
    if (!(await this.operationalStore.schema.hasTable("User"))) {
      await this.operationalStore.schema.createTable("User", (table) => {
        table.string("address").primary().notNullable();
        table.timestamp("createdAt").notNullable().defaultTo(`now()`);
        table.timestamp("updatedAt").notNullable().defaultTo(`now()`);
      });
    }

    if (!(await this.operationalStore.schema.hasTable("Session"))) {
      await this.operationalStore.schema.createTable("Session", (table) => {
        table.string("id").primary().notNullable();
        table.timestamp("createdAt").notNullable().defaultTo(`now()`);
        table.string("createdBy").notNullable();
        table.string("referenceExpiryDate");
        table.string("name");
        table.string("revokedAt");
        table.string("referenceTokenId").notNullable();
        table.boolean("isUserCreated").notNullable().defaultTo(false);
        table.string("allowedOrigins").notNullable();

        table.index(["createdBy", "id"], "Session_createdBy_id_key", {
          indexType: "UNIQUE",
          storageEngineIndexType: "btree",
        });

        table
          .foreign("createdBy")
          .references("User.address")
          .onDelete("cascade")
          .onUpdate("cascade");
      });
    }

    if (!(await this.operationalStore.schema.hasTable("Challenge"))) {
      await this.operationalStore.schema.createTable("Challenge", (table) => {
        table.string("nonce").primary().notNullable();
        table.string("message").notNullable();
        table.string("signature");
        table.timestamp("createdAt").notNullable().defaultTo(`now()`);
        table.timestamp("updatedAt").notNullable();

        table.index("nonce", "Challenge_message_key", {
          indexType: "UNIQUE",
          storageEngineIndexType: "btree",
        });
      });
    }
  }
}
