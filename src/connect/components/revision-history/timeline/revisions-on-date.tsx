import { Icon } from '@/powerhouse';
import { format } from 'date-fns';
import { useMemo } from 'react';
import { Revision } from '../revision';
import { Skip } from '../skip';
import { Revision as TRevision, Skip as TSkip } from '../types';

export type RevisionsOnDateProps = {
    date: string;
    revisionsAndSkips: (TRevision | TSkip)[];
};

function getRevisionsAndSkipsForDay(
    timestamp: string,
    revisionsAndSkips: (TRevision | TSkip)[],
) {
    const day = timestamp.split('T')[0];
    return revisionsAndSkips.filter(
        revisionOrSkip => revisionOrSkip.timestamp.split('T')[0] === day,
    );
}

export function RevisionsOnDate(props: RevisionsOnDateProps) {
    const { date, revisionsAndSkips } = props;

    const revisionsForDay = useMemo(
        () => getRevisionsAndSkipsForDay(date, revisionsAndSkips),
        [date, revisionsAndSkips],
    );

    if (!revisionsForDay.length) return null;

    const formattedDate = format(date, 'MMM dd, yyyy');

    return (
        <section>
            <h2 className="-ml-2 mb-2 flex items-center gap-1 text-xs text-slate-100">
                <Icon name="ring" size={16} /> Changes on {formattedDate}
            </h2>
            <div className="grid gap-2 border-l border-slate-100 px-4 py-2">
                {revisionsForDay.map((revisionOrSkip, index) => {
                    if ('skipCount' in revisionOrSkip) {
                        return <Skip key={index} {...revisionOrSkip} />;
                    }

                    return <Revision key={index} {...revisionOrSkip} />;
                })}
            </div>
        </section>
    );
}
