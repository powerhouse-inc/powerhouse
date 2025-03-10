import { Icon, type IconName } from "#powerhouse";
import { NodeStatus } from "../types";

interface StatusIconProps {
  status: NodeStatus;
}

const STATUS_ICON_MAP: Record<
  Exclude<NodeStatus, NodeStatus.UNCHANGED>,
  { icon: IconName; color: string }
> = {
  [NodeStatus.CREATED]: { icon: "Created", color: "text-green-900" },
  [NodeStatus.MODIFIED]: { icon: "Modified", color: "text-blue-900" },
  [NodeStatus.REMOVED]: { icon: "Removed", color: "text-red-900" },
  [NodeStatus.MOVED]: { icon: "Moved", color: "text-blue-900" },
  [NodeStatus.DUPLICATED]: { icon: "Duplicated", color: "text-blue-900" },
};

export const StatusIcon = ({ status }: StatusIconProps) => {
  if (status === NodeStatus.UNCHANGED) {
    return null;
  }

  const { icon, color } = STATUS_ICON_MAP[status];

  return <Icon name={icon} size={16} className={color} />;
};
