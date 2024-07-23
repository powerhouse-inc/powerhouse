import { Tooltip } from '@/connect';
import { Icon } from '@/powerhouse';
import { useCopyToClipboard } from 'usehooks-ts';

export type RevisionNumberProps = {
    operationIndex: number;
    eventId: string;
    stateHash: string;
};
export function RevisionNumber(props: RevisionNumberProps) {
    const { operationIndex, eventId, stateHash } = props;
    const [, copy] = useCopyToClipboard();
    const revisionNumber = operationIndex + 1;

    const tooltipContent = (
        <button
            onClick={handleCopy(stateHash)}
            className="flex items-center gap-1"
        >
            Revision {revisionNumber} - Event ID: {eventId} - State Hash:{' '}
            {stateHash}
            <Icon
                name="files-earmark"
                className="inline-block text-gray-600"
                size={16}
            />
        </button>
    );
    function handleCopy(text: string) {
        return () => {
            copy(text).catch(error => {
                console.error('Failed to copy!', error);
            });
        };
    }

    return (
        <Tooltip content={tooltipContent}>
            <span className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
                Revision {revisionNumber}.
                <a>
                    <Icon
                        name="ellipsis"
                        size={14}
                        className="cursor-pointer text-slate-100"
                    />
                </a>
            </span>
        </Tooltip>
    );
}
