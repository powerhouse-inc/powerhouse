// TODO: remove this
import { usePGliteDB } from '@powerhousedao/reactor-browser/pglite';
import { useCallback } from 'react';

const createTestTableSql = `
CREATE TABLE IF NOT EXISTS test_table (
    id SERIAL PRIMARY KEY,
    name TEXT
)
`;
const selectAllDataSql = `
SELECT * FROM test_table
`;

export function useTableTest() {
    const pglite = usePGliteDB();

    const createTestTable = useCallback(async () => {
        if (!pglite.db) {
            throw new Error('No database found');
        }

        await pglite.db.exec(createTestTableSql);

        console.log('>>> created test table');
    }, [pglite.db]);

    const insertRandomData = useCallback(async () => {
        if (!pglite.db) {
            throw new Error('No database found');
        }

        const randomName = Math.random().toString(36).substring(2, 15);
        await pglite.db.exec(
            `INSERT INTO test_table (name) VALUES ('${randomName}')`,
        );

        console.log('>>> inserted random data', randomName);
    }, [pglite.db]);

    const selectAllData = useCallback(async () => {
        if (!pglite.db) {
            throw new Error('No database found');
        }

        const result = await pglite.db.exec(selectAllDataSql);

        console.log('>>> selected all data', result);
    }, [pglite.db]);

    return {
        createTestTable,
        insertRandomData,
        selectAllData,
    };
}
