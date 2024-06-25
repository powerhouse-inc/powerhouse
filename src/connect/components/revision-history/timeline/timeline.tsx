import { Operation } from '../types';
import { makeRevisionsByDate } from '../utils';
import { RevisionsOnDate } from './revisions-on-date';

export type TimelineProps = {
    localOperations: Operation[];
    globalOperations: Operation[];
    scopeToShow: 'local' | 'global';
};

export function Timeline(props: TimelineProps) {
    const { localOperations, globalOperations, scopeToShow } = props;
    const operations =
        scopeToShow === 'local' ? localOperations : globalOperations;
    const revisionsByDate = makeRevisionsByDate(operations);
    const sortedDates = Object.keys(revisionsByDate).sort(
        (a, b) => new Date(b).getTime() - new Date(a).getTime(),
    );
    return (
        <div className="grid gap-2">
            {sortedDates.map(date => (
                <RevisionsOnDate
                    key={date}
                    date={date}
                    revisionsAndSkips={revisionsByDate[date]}
                />
            ))}
        </div>
    );
}
