import { Tooltip } from '@/connect';
import { format } from 'date-fns';
import { useId } from 'react';

export type TimestampProps = {
    timestamp: number | string;
};

export function Timestamp(props: TimestampProps) {
    const { timestamp } = props;
    const tooltipId = useId().replace(/:/g, '');
    const date = new Date(timestamp);
    const shortDate = format(date, "HH:mm 'UTC'");
    const longDate = format(date, "eee, dd MMM yyyy HH:mm:ss 'UTC'");
    return (
        <span className="text-xs">
            <a id={tooltipId}>committed at {shortDate}</a>
            <Tooltip anchorSelect={`#${tooltipId}`}>{longDate}</Tooltip>
        </span>
    );
}
