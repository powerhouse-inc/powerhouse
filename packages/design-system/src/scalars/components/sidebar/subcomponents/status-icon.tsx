import { NodeStatus } from "../types";
import Created from "@/assets/icon-components/Created";
import Modified from "@/assets/icon-components/Modified";
import Removed from "@/assets/icon-components/Removed";
import Duplicated from "@/assets/icon-components/Duplicated";
import Moved from "@/assets/icon-components/Moved";
import DescendenceModified from "@/assets/icon-components/DescendenceModified";
interface StatusIconProps {
  status: NodeStatus;
  isDescendenceModified?: boolean;
}

const STATUS_ICON_MAP: Record<
  Exclude<NodeStatus, NodeStatus.UNCHANGED>,
  { icon: React.ReactNode }
> = {
  [NodeStatus.CREATED]: {
    icon: <Created height={16} width={16} className="text-green-900" />,
  },
  [NodeStatus.MODIFIED]: {
    icon: <Modified height={16} width={16} className="text-blue-900" />,
  },
  [NodeStatus.REMOVED]: {
    icon: <Removed height={16} width={16} className="text-red-900" />,
  },
  [NodeStatus.MOVED]: {
    icon: <Moved height={16} width={16} className="text-blue-900" />,
  },
  [NodeStatus.DUPLICATED]: {
    icon: <Duplicated height={16} width={16} className="text-blue-900" />,
  },
};

export const StatusIcon = ({
  status,
  isDescendenceModified,
}: StatusIconProps) => {
  if (status === NodeStatus.UNCHANGED) {
    return isDescendenceModified ? (
      <DescendenceModified height={16} width={16} className="text-gray-500" />
    ) : null;
  }

  return STATUS_ICON_MAP[status].icon;
};
