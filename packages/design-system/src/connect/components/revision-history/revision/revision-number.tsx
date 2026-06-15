import { Icon } from "#design-system";
import { CodePopover } from "../../code-popover.js";
import { FormattedJsonViewer } from "../../formatted-json-viewer.js";

export type RevisionNumberProps = {
  readonly operationIndex: number;
  readonly eventId: string;
  readonly stateHash: string;
};
export function RevisionNumber(props: RevisionNumberProps) {
  const { operationIndex, eventId, stateHash } = props;
  const revisionNumber = operationIndex + 1;

  return (
    <CodePopover
      content={
        <FormattedJsonViewer
          value={{
            revisionNumber,
            eventId,
            stateHash,
          }}
        />
      }
      trigger={
        <span className="flex cursor-pointer items-center gap-2 text-xs text-foreground">
          Revision {revisionNumber}.
          <a>
            <Icon
              className="cursor-pointer text-foreground"
              name="Ellipsis"
              size={14}
            />
          </a>
        </span>
      }
    />
  );
}
