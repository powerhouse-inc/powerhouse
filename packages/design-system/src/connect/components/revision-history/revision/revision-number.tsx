import { Icon, Tooltip } from "@powerhousedao/design-system";
import { useCopyToClipboard } from "usehooks-ts";

export type RevisionNumberProps = {
  readonly operationIndex: number;
  readonly eventId: string;
  readonly stateHash: string;
};
export function RevisionNumber(props: RevisionNumberProps) {
  const { operationIndex, eventId, stateHash } = props;
  const [, copy] = useCopyToClipboard();
  const revisionNumber = operationIndex + 1;

  const tooltipContent = (
    <button className="flex items-center gap-1" onClick={handleCopy(stateHash)}>
      Revision {revisionNumber} - Event ID: {eventId} - State Hash: {stateHash}
      <Icon
        className="inline-block text-gray-600"
        name="FilesEarmark"
        size={16}
      />
    </button>
  );
  function handleCopy(text: string) {
    return () => {
      copy(text).catch((error) => {
        console.error("Failed to copy!", error);
      });
    };
  }

  return (
    <Tooltip content={tooltipContent}>
      <span className="flex cursor-pointer items-center gap-2 text-xs text-gray-600">
        Revision {revisionNumber}.
        <a>
          <Icon
            className="cursor-pointer text-slate-100"
            name="Ellipsis"
            size={14}
          />
        </a>
      </span>
    </Tooltip>
  );
}
