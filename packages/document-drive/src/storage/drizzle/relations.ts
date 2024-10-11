import { relations } from "drizzle-orm/relations";
import { document, synchronizationUnit, operation, attachment } from "./schema";

export const synchronizationUnitRelations = relations(synchronizationUnit, ({one, many}) => ({
	document: one(document, {
		fields: [synchronizationUnit.driveId],
		references: [document.id]
	}),
	operations: many(operation),
}));

export const documentRelations = relations(document, ({many}) => ({
	synchronizationUnits: many(synchronizationUnit),
}));

export const attachmentRelations = relations(attachment, ({one}) => ({
	operation: one(operation, {
		fields: [attachment.operationId],
		references: [operation.id]
	}),
}));

export const operationRelations = relations(operation, ({one, many}) => ({
	attachments: many(attachment),
	synchronizationUnit: one(synchronizationUnit, {
		fields: [operation.driveId],
		references: [synchronizationUnit.driveId]
	}),
}));