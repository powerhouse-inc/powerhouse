export type SkipProps = {
    operationIndex: number;
    skipCount: number;
};

export function Skip(props: SkipProps) {
    const { operationIndex, skipCount } = props;

    const skippedRevisions =
        skipCount === 1
            ? `${operationIndex}`
            : `${operationIndex} - ${operationIndex + skipCount - 1}`;

    return (
        <article className="grid grid-cols-[1fr,auto,1fr] items-center">
            <div className="h-px rounded-full bg-slate-100" />
            <div className="mx-3 text-xs text-slate-100">
                [Skipped Revision {skippedRevisions}]
            </div>
            <div className="h-px rounded-full bg-slate-100" />
        </article>
    );
}
