// TODO: remove this
import { createTypedQuery } from '@powerhousedao/reactor-browser/pglite';

const selectAllDataSql = `
SELECT * FROM test_table
`;

type TestDatabase = {
    test_table: {
        id: number;
        name: string;
    };
};

const useTypedQuery = createTypedQuery<TestDatabase>();

export function useTestOperationalQuery() {
    // const pglite = usePGliteDB();
    // const result = pglite.db?.live?.query(selectAllDataSql, [], result => {
    //     console.log('>>> result', result);
    // });

    const result = useTypedQuery(db => {
        return db.selectFrom('test_table').selectAll().compile();
    });

    console.log('>>> result', result);

    return result;
}
