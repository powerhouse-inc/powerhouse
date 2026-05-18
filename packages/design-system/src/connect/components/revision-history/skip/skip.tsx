export type SkipProps = {
  readonly operationIndex: number;
  readonly skipCount: number;
};

export function Skip(props: SkipProps) {
  const { operationIndex, skipCount } = props;
  const revisionNumber = operationIndex;

  const skippedRevisions =
    skipCount === 1
      ? `${revisionNumber}`
      : `${revisionNumber} - ${revisionNumber + 1 - skipCount}`;

  return (
    <article className="grid grid-cols-[1fr,auto,1fr] items-center py-2">
      <div className="h-px rounded-full bg-slate-100 dark:bg-slate-700" />
      <div className="mx-3 text-xs text-slate-100 dark:text-gray-500">
        [Skipped Revision {skippedRevisions}]
      </div>
      <div className="h-px rounded-full bg-slate-100 dark:bg-slate-700" />
    </article>
  );
}
