import { pgTable, text, boolean, jsonb, index, uniqueIndex, foreignKey, integer, timestamp, primaryKey } from "drizzle-orm/pg-core"
  import { sql } from "drizzle-orm"




export const listener = pgTable("Listener", {
	listenerId: text().primaryKey().notNull(),
	driveId: text().notNull(),
	label: text(),
	block: boolean().notNull(),
	system: boolean().notNull(),
	filter: jsonb().notNull(),
	callInfo: jsonb().notNull(),
});

export const synchronizationUnit = pgTable("SynchronizationUnit", {
	id: text().notNull(),
	syncId: text().notNull(),
	driveId: text().notNull(),
	documentId: text().notNull(),
	scope: text().notNull(),
	branch: text().notNull(),
	version: integer().default(0).notNull(),
	revision: integer().default(sql`'-1'`).notNull(),
	lastModified: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
},
(table) => {
	return {
		driveIdDocumentIdScopeBranchRevisioIdx: index("SynchronizationUnit_driveId_documentId_scope_branch_revisio_idx").using("btree", table.driveId.asc().nullsLast(), table.documentId.asc().nullsLast(), table.scope.asc().nullsLast(), table.branch.asc().nullsLast(), table.revision.asc().nullsLast()),
		driveIdSyncIdKey: uniqueIndex("SynchronizationUnit_driveId_syncId_key").using("btree", table.driveId.asc().nullsLast(), table.syncId.asc().nullsLast()),
		idKey: uniqueIndex("SynchronizationUnit_id_key").using("btree", table.id.asc().nullsLast()),
		synchronizationUnitDocumentIdDriveIdFkey: foreignKey({
			columns: [table.driveId, table.documentId],
			foreignColumns: [document.id, document.driveId],
			name: "SynchronizationUnit_documentId_driveId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	}
});

export const drive = pgTable("Drive", {
	slug: text().primaryKey().notNull(),
	id: text().notNull(),
});

export const attachment = pgTable("Attachment", {
	id: text().primaryKey().notNull(),
	operationId: text().notNull(),
	mimeType: text().notNull(),
	data: text().notNull(),
	filename: text(),
	extension: text(),
	hash: text().notNull(),
},
(table) => {
	return {
		attachmentOperationIdFkey: foreignKey({
			columns: [table.operationId],
			foreignColumns: [operation.id],
			name: "Attachment_operationId_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	}
});

export const operation = pgTable("Operation", {
	id: text().primaryKey().notNull(),
	opId: text(),
	driveId: text().notNull(),
	documentId: text().notNull(),
	scope: text().notNull(),
	branch: text().notNull(),
	index: integer().notNull(),
	skip: integer().notNull(),
	hash: text().notNull(),
	timestamp: timestamp({ precision: 3, mode: 'string' }).notNull(),
	input: text().notNull(),
	type: text().notNull(),
	clipboard: boolean().default(false),
	context: jsonb(),
	// TODO: failed to parse database type 'bytea'
	resultingState: unknown("resultingState"),
},
(table) => {
	return {
		driveIdDocumentIdScopeBranchIndexKey: uniqueIndex("Operation_driveId_documentId_scope_branch_index_key").using("btree", table.driveId.asc().nullsLast(), table.documentId.asc().nullsLast(), table.scope.asc().nullsLast(), table.branch.asc().nullsLast(), table.index.desc().nullsFirst()),
		operationDriveIdDocumentIdScopeBranchFkey: foreignKey({
			columns: [table.driveId, table.documentId, table.scope, table.branch],
			foreignColumns: [synchronizationUnit.driveId, synchronizationUnit.documentId, synchronizationUnit.scope, synchronizationUnit.branch],
			name: "Operation_driveId_documentId_scope_branch_fkey"
		}).onUpdate("cascade").onDelete("cascade"),
	}
});

export const document = pgTable("Document", {
	id: text().notNull(),
	driveId: text().notNull(),
	created: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	lastModified: timestamp({ precision: 3, mode: 'string' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
	name: text(),
	initialState: text().notNull(),
	documentType: text().notNull(),
},
(table) => {
	return {
		driveIdIdx: index("Document_driveId_idx").using("btree", table.driveId.asc().nullsLast()),
		documentPkey: primaryKey({ columns: [table.id, table.driveId], name: "Document_pkey"}),
	}
});