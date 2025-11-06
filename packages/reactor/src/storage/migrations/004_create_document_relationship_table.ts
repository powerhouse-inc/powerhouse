import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('DocumentRelationship')
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('sourceId', 'text', (col) =>
            col.notNull().references('Document.id').onDelete('cascade')
        )
        .addColumn('targetId', 'text', (col) =>
            col.notNull().references('Document.id').onDelete('cascade')
        )
        .addColumn('relationshipType', 'text', (col) => col.notNull())
        .addColumn('metadata', 'jsonb')
        .addColumn('createdAt', 'timestamptz', (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addColumn('updatedAt', 'timestamptz', (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .addUniqueConstraint('unique_source_target_type', [
            'sourceId',
            'targetId',
            'relationshipType',
        ])
        .execute();

    // Create indexes for efficient graph traversal
    await db.schema
        .createIndex('idx_relationship_source')
        .on('DocumentRelationship')
        .column('sourceId')
        .execute();

    await db.schema
        .createIndex('idx_relationship_target')
        .on('DocumentRelationship')
        .column('targetId')
        .execute();

    await db.schema
        .createIndex('idx_relationship_type')
        .on('DocumentRelationship')
        .column('relationshipType')
        .execute();
}
