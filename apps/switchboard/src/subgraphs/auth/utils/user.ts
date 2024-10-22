import { User } from "document-model/document";
import { eq } from "drizzle-orm";
import { DrizzleD1Database } from "drizzle-orm/d1";
import { GraphQLError } from "graphql";
import { usersTable } from "../schema";

export const upsertUser = async (db: DrizzleD1Database, user: User) => {
  const { AUTH_SIGNUP_DISABLED } = process.env;
  if (AUTH_SIGNUP_DISABLED) {
    throw new GraphQLError("Sign up is disabled");
  }

  const [existingUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.address, user.address));
  if (existingUser) {
    return existingUser;
  }

  const date = new Date().toISOString();
  const [newUser] = await db
    .insert(usersTable)
    .values({
      address: user.address,
      updatedAt: date,
      createdAt: date,
    })
    .returning();

  return newUser;
};

export const getUser = async (db: DrizzleD1Database, address: string) => {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.address, address));
  return user;
};
