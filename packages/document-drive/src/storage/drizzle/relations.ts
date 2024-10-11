import { relations } from "drizzle-orm/relations";
import { operation, attachment, document, syncronizationUnit } from "./schema";

export const attachmentRelations = relations(attachment, ({ one }) => ({
  operation: one(operation, {
    fields: [attachment.operationId],
    references: [operation.id],
  }),
}));

export const operationRelations = relations(operation, ({ one, many }) => ({
  attachments: many(attachment),
  document: one(document, {
    fields: [operation.driveId],
    references: [document.id],
  }),
  syncronizationUnit: one(syncronizationUnit, {
    fields: [operation.driveId],
    references: [syncronizationUnit.id],
  }),
}));

export const documentRelations = relations(document, ({ many }) => ({
  operations: many(operation),
  syncronizationUnits: many(syncronizationUnit),
}));

export const syncronizationUnitRelations = relations(
  syncronizationUnit,
  ({ one, many }) => ({
    operations: many(operation),
    document: one(document, {
      fields: [syncronizationUnit.driveId],
      references: [document.id],
    }),
  }),
);
