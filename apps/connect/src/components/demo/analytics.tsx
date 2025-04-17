/* eslint-disable react/jsx-max-depth */
import {
    AnalyticsGranularity,
    AnalyticsPath,
    DateTime,
    useAddSeriesValue,
    useAnalyticsQuery,
} from '@powerhousedao/reactor-browser/analytics';
import { Suspense, useCallback, useState } from 'react';
import { useAnalyticsStore } from '../../store/analytics';

function Analytics() {
    // waits for analytics store to be ready
    useAnalyticsStore();

    const [value, setValue] = useState('1000');
    const addSeriesValue = useAddSeriesValue();

    const { data: queryResults, isLoading } = useAnalyticsQuery({
        start: DateTime.now().minus({ days: 7 }).startOf('day'),
        end: DateTime.now().endOf('day'),
        granularity: AnalyticsGranularity.Total,
        metrics: ['Demo'],
        select: {
            category: [AnalyticsPath.fromString('demo/category')],
        },
        currency: AnalyticsPath.fromString('DEMO'),
        lod: {},
    });

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            await addSeriesValue
                .mutateAsync({
                    start: DateTime.now(),
                    source: AnalyticsPath.fromString('demo/analytics'),
                    value: Number(value),
                    unit: 'DEMO',
                    metric: 'Demo',
                    dimensions: {
                        category: AnalyticsPath.fromString('demo/category'),
                    },
                })
                .then(value => console.log(value));
        },
        [addSeriesValue, value],
    );

    const handleChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            setValue(e.target.value);
        },
        [],
    );

    return (
        <div className="p-4">
            <h2 className="text-xl mb-4">Analytics Demo</h2>

            <form onSubmit={handleSubmit} className="mb-6">
                <div className="flex gap-2">
                    <input
                        type="number"
                        value={value}
                        onChange={handleChange}
                        className="px-2 py-1 border rounded"
                        placeholder="Enter value"
                    />
                    <button
                        type="submit"
                        disabled={addSeriesValue.isPending}
                        className="px-4 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
                    >
                        {addSeriesValue.isPending ? 'Adding...' : 'Add Value'}
                    </button>
                </div>
            </form>

            <div>
                <h3 className="font-semibold mb-2">Query Results:</h3>
                {isLoading ? (
                    <p>Loading...</p>
                ) : (
                    <pre className="bg-gray-100 p-2 rounded">
                        {JSON.stringify(queryResults, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
}

export function DemoAnalytics() {
    return (
        <Suspense fallback={<p className="m-4">Loading analytics store..</p>}>
            <Analytics />
        </Suspense>
    );
}
