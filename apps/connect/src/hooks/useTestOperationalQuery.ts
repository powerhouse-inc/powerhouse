// TODO: remove this
import { createTypedQuery } from '@powerhousedao/reactor-browser/operational';
import { useEffect, useState } from 'react';

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
    // Example of static query (no parameters)
    // const staticResult = useTypedQuery(db => {
    //     return db.selectFrom('test_table').selectAll().compile();
    // });

    // Example of parameterized query - no need for manual useMemo anymore!

    const [id, setId] = useState(1);

    useEffect(() => {
        setTimeout(() => {
            setId(2);
        }, 5000);
    }, []);

    const parameterizedResult = useTypedQuery(
        (db, params) => {
            return db
                .selectFrom('test_table')
                .selectAll()
                .where('id', '=', params.id)
                .compile();
        },
        { id },
    );

    // console.log('>>> static result', staticResult);
    console.log('>>> parameterized result', parameterizedResult);

    // For this example, return the parameterized result
    return parameterizedResult;
}
