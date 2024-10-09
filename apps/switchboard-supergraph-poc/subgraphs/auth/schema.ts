import { sql } from "drizzle-orm";
import { boolean, date, pgTable, varchar } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
    address: varchar({ length: 255 }).primaryKey().notNull(),
    createdAt: date().default(sql`now()`).notNull(),
    updatedAt: date().default(sql`now()`).$onUpdate(() => sql`now()`).notNull()
});

export const sessionTable = pgTable("sessions", {
    id: varchar({ length: 255 }).primaryKey().notNull(),
    createdAt: date().default(sql`now()`).notNull(),
    createdBy: varchar({ length: 255 }).references(() => usersTable.address, { onDelete: "cascade" }).notNull(),
    referenceExpiryDate: date(),
    name: varchar({ length: 255 }),
    revokedAt: date(),
    referenceTokenId: varchar({ length: 255 }).notNull(),
    isUserCreated: boolean().default(false).notNull(),
    allowedOrigins: varchar({ length: 255 }).notNull(),
});

export const challengeTable = pgTable("challenges", {
    nonce: varchar({ length: 255 }).primaryKey().notNull(),
    message: varchar({ length: 255 }).notNull().unique(),
    signature: varchar({ length: 255 }),
    createdAt: date().default(sql`now()`).notNull(),
    updatedAt: date().default(sql`now()`).$onUpdate(() => sql`now()`).notNull(),
});

