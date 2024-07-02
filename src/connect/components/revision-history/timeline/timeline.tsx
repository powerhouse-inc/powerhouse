import { useEffect, useMemo, useRef, useState } from 'react';
import { Operation, Scope } from '../types';
import { getUniqueDatesInOrder, makeRevisionsAndSkips } from '../utils';
import { RevisionsOnDate } from './revisions-on-date';

export type TimelineProps = {
    localOperations: Operation[];
    globalOperations: Operation[];
    scope: Scope;
};

export function Timeline(props: TimelineProps) {
    const { localOperations, globalOperations, scope } = props;
    const ref = useRef<HTMLDivElement>(null);
    const [scrollAmount, setScrollAmount] = useState(0);
    const [numRevisionsToShow, setNumRevisionsToShow] = useState(20);
    const operations = scope === 'local' ? localOperations : globalOperations;
    const dates = getUniqueDatesInOrder(operations);
    const revisionsAndSkips = useMemo(
        () => makeRevisionsAndSkips(operations),
        [operations],
    );
    const itemsToShow = revisionsAndSkips.slice(0, numRevisionsToShow);

    useEffect(() => {
        const ratio = Math.floor(scrollAmount / 46);
        const newNumRevisions = 20 + ratio;
        setNumRevisionsToShow(prev =>
            newNumRevisions > prev ? newNumRevisions : prev,
        );
    }, [scrollAmount]);

    const handleScroll = (e: WheelEvent) => {
        setScrollAmount(prev => {
            const n = prev + e.deltaY;
            if (n < 0) {
                return 0;
            }
            return n;
        });
    };

    useEffect(() => {
        window.addEventListener('wheel', handleScroll);
        return () => {
            window.removeEventListener('wheel', handleScroll);
        };
    }, []);

    return (
        <div ref={ref} className="grid gap-2">
            {dates.map(date => (
                <RevisionsOnDate
                    key={date}
                    date={date}
                    revisionsAndSkips={itemsToShow}
                />
            ))}
        </div>
    );
}
