import type { ConfirmationModalProps } from "@powerhousedao/design-system";
import { ConnectConfirmationModal } from "@powerhousedao/design-system";

export interface ConnectDeleteItemModalProps
  extends Omit<ConfirmationModalProps, "onContinue" | "continueLabel"> {
  readonly onDelete: () => void;
  readonly deleteLabel: string;
}

export function ConnectDeleteItemModal(props: ConnectDeleteItemModalProps) {
  const { onDelete, deleteLabel, ...restProps } = props;

  return (
    <ConnectConfirmationModal
      {...restProps}
      containerProps={{ className: "w-[450px]" }}
      continueButtonProps={{
        className: "bg-red-900",
      }}
      continueLabel={deleteLabel}
      onContinue={onDelete}
    />
  );
}
