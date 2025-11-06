import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('ViewState')
        .addColumn('lastOperationId', 'integer', (col) => col.primaryKey())
        .addColumn('lastOperationTimestamp', 'timestamptz', (col) =>
            col.notNull().defaultTo(sql`NOW()`)
        )
        .execute();
}
