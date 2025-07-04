// TODO: remove this
import { useOperationalQuery } from '@powerhousedao/reactor-browser/pglite';

type DataBase = {
    AnalyticsSeries: { id: string };
};

const selectAllDataSql = `
SELECT * FROM test_table
`;

export function useTestOperationalQuery() {
    const result = useOperationalQuery<DataBase>(db => {
        db.selectFrom('AnalyticsSeries').selectAll().compile();

        return {
            sql: selectAllDataSql,
            parameters: [],
            query: {},
            queryId: '123',
        };
    });

    console.log('>>> result', result);

    return result;
}
