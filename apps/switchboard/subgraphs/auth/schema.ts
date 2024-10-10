import { relations, sql } from "drizzle-orm";
import { boolean, date, pgTable, timestamp, varchar, text, uniqueIndex, foreignKey } from "drizzle-orm/pg-core";

export const usersTable = pgTable("User", {
    address: text().primaryKey().notNull(),
    createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
});

export const sessionTable = pgTable("Session", {
    id: text().primaryKey().notNull(),
    createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    createdBy: text().notNull(),
    referenceExpiryDate: timestamp({ precision: 3, mode: 'string' }),
    name: text(),
    revokedAt: timestamp({ precision: 3, mode: 'string' }),
    referenceTokenId: text().notNull(),
    isUserCreated: boolean().default(false).notNull(),
    allowedOrigins: text().notNull(),
},
    (table) => {
        return {
            createdByIdKey: uniqueIndex("Session_createdBy_id_key").using("btree", table.createdBy.asc().nullsLast(), table.id.asc().nullsLast()),
            sessionCreatedByFkey: foreignKey({
                columns: [table.createdBy],
                foreignColumns: [usersTable.address],
                name: "Session_createdBy_fkey"
            }).onUpdate("cascade").onDelete("cascade"),
        }
    });


export const challengeTable = pgTable("Challenge", {
    nonce: text().primaryKey().notNull(),
    message: text().notNull(),
    signature: text(),
    createdAt: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
    updatedAt: timestamp({ precision: 3, mode: 'string' }).notNull(),
},
    (table) => {
        return {
            messageKey: uniqueIndex("Challenge_message_key").using("btree", table.message.asc().nullsLast()),
        }
    });

export const sessionRelations = relations(sessionTable, ({ one }) => ({
    user: one(usersTable, {
        fields: [sessionTable.createdBy],
        references: [usersTable.address]
    }),
}));

export const userRelations = relations(usersTable, ({ many }) => ({
    sessions: many(sessionTable),
}));