import { DrizzleD1Database } from "drizzle-orm/d1";
import { usersTable } from "../schema";
import { eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { User } from "document-model/document";

export const upsertUser = async (db: DrizzleD1Database, user: User) => {
    const { AUTH_SIGNUP_ENABLED } = process.env;
    if (!AUTH_SIGNUP_ENABLED) {
        throw new GraphQLError('Sign up is disabled');
    }

    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.address, user.address))
    if (existingUser) {
        return existingUser;
    }

    const [newUser] = await db.insert(usersTable).values({
        address: user.address
    }).returning();

    return newUser;
}