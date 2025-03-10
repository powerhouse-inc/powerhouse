import {
  ConnectTreeView,
  type NodeProps,
  type SharingType,
  type UiDriveNode,
} from "@/connect";
import { Icon } from "@/powerhouse";
import type { TUiNodesContext } from "@powerhousedao/reactor-browser";
import { type ReactNode } from "react";
import { twJoin, twMerge } from "tailwind-merge";

export type DriveViewProps = TUiNodesContext &
  NodeProps & {
    readonly label: ReactNode;
    readonly className?: string;
    readonly groupSharingType: SharingType;
    readonly disableAddDrives: boolean;

    readonly showAddDriveModal: (groupSharingType: SharingType) => void;
    readonly showDriveSettingsModal: (uiDriveNode: UiDriveNode) => void;
  };

export function DriveView(props: DriveViewProps) {
  const {
    driveNodes,
    selectedDriveNode,
    groupSharingType,
    disableAddDrives,
    label,
    className,
    isAllowedToCreateDocuments,
    showAddDriveModal,
  } = props;
  const hasDriveNodes = driveNodes.length > 0;
  const isContainerHighlighted = true;

  function onShowAddDriveModal() {
    showAddDriveModal(groupSharingType);
  }

  return (
    <div
      className={twMerge(
        "border-y border-gray-100 pl-4 pr-1 first-of-type:border-b-0 last-of-type:border-t-0",
        hasDriveNodes && "pb-2",
        isContainerHighlighted && "bg-gray-100",
        className,
      )}
    >
      <div className={twJoin("flex items-center justify-between py-1.5 pr-2")}>
        <p className="text-sm font-medium leading-6 text-gray-500">{label}</p>
        <div className="size-4 text-gray-600">
          {!disableAddDrives && isAllowedToCreateDocuments ? (
            <button
              className={twMerge("mr-2 transition hover:text-gray-800")}
              onClick={onShowAddDriveModal}
            >
              <Icon name="PlusCircle" size={16} />
            </button>
          ) : null}
        </div>
      </div>
      {driveNodes.map((driveNode) => (
        <ConnectTreeView {...props} key={driveNode.id} uiNode={driveNode} />
      ))}
    </div>
  );
}
