import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('SlugMapping')
        .addColumn('slug', 'text', (col) => col.primaryKey())
        .addColumn('documentId', 'text', (col) => col.notNull())
        .addColumn('scope', 'text', (col) => col.notNull())
        .addColumn('branch', 'text', (col) => col.notNull())
        .addColumn('createdAt', 'timestamptz', (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addColumn('updatedAt', 'timestamptz', (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addUniqueConstraint('unique_docid_scope_branch', [
            'documentId',
            'scope',
            'branch',
        ])
        .execute();

    // Create index for reverse lookup (documentId -> slug)
    await db.schema
        .createIndex('idx_slug_documentid')
        .on('SlugMapping')
        .column('documentId')
        .execute();
}
